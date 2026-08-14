# ADR-006: Settlement Rollup (cross-payer voucher aggregation)

**Status:** Candidate — not implemented, and only warranted under a specific
topology (see [Decision](#decision-when-this-is-worth-building)).

**Parent ADRs:** [ADR-001](./001-tab-state-machine.md),
[ADR-003](./003-program-instructions.md),
[ADR-004](./004-batch-voucher-settlement.md),
[ADR-005](./005-channel-rearm.md)

## Context

Every settlement path in this program so far advances **one channel's** settled
watermark per verified voucher, and its on-chain cost scales linearly with the
number of channels:

```text
plain settle          ~2,400 CU ed25519 verify + ~300 CU write lock + exec, per channel
ADR-004 batch          890 + 3,420/n CU/channel  → ~948/channel at n = 59 (one shared signer)
```

ADR-004 already collapses the *signature* to one per batch by requiring a shared
`authorized_signer`, and the MPP operator-signed mode
([mpp-specs #309](https://github.com/tempoxyz/mpp-specs/pull/309)) makes that
shared signer fleet-wide, reaching **~948 CU/channel** — the cheapest enforceable
settlement we model. Two hard floors remain underneath it, and they are
structural, not cryptographic:

1. **Write locks.** Advancing a channel's `settled` watermark writes the channel
   account, costing ~300 CU/channel in the Agave cost model regardless of how the
   signature is verified.
2. **The 64-account transaction cap.** A settle touches the channel account (and,
   when it also distributes, several token accounts), so a single transaction can
   only advance on the order of tens of channels. ADR-004's ~59-channel batch is
   already pressed against this ceiling.

Neither floor moves for a design that keeps one writable channel account per
settled channel. The only way past them is to stop verifying and writing per
channel and instead **attest to many settlements at once and commit their result
compactly** — a rollup.

The tempting primitive is BLS signature aggregation
([SIMD-0388](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0388-bls12-381-syscalls.md)),
but it is the wrong tool here: vouchers sign **distinct messages** (each channel's
`channel_id ‖ cumulative_amount ‖ expires_at`), and aggregate verification over
`n` distinct messages costs `n + 1` pairings. On-chain pairings are tens of
thousands of CU each, so distinct-message BLS aggregation loses to plain
ed25519's ~2,400 CU/voucher by a wide margin. BLS earns its keep for
*same-message* multisig and consensus, not for settlement.

The path that **needs no new SIMD** is a Groth16 proof. The alt-bn128 (BN254) G1
and pairing syscalls — `sol_alt_bn128_group_op` (`add`, `mul`, `pairing`) — are
**live on mainnet today**; on-chain Groth16 verification runs in roughly
**170k–500k CU** depending on the circuit and public-input count, and the
per-transaction budget (up to 1.4M CU) accommodates it comfortably. A single
proof can attest that *N* vouchers each verify, and the verification cost is
**constant in N** — the succinctness property BLS lacks for distinct messages.

## Goals

- Make the *verification* cost of settling `N` cross-payer channels
  **independent of `N`**: one ~300k-CU Groth16 proof in place of `N`
  ed25519 verifications.
- Require **no new syscall** — build only on the alt-bn128 G1 + pairing syscalls
  already live on mainnet.
- Preserve the version-1 voucher semantics unchanged: the circuit proves the
  *existing* `[0x56, 0x01]` ed25519 voucher contract (replay, expiry, signer),
  so no new wire format reaches clients or the signing path.
- Keep `payout_watermark ≤ settled ≤ deposit` enforced per channel, and keep
  every other settlement path (plain `settle`, ADR-004 batch, ADR-005 `rearm`)
  available and unchanged.

## Non-goals

- **Aggregating multiple proofs.** Batch Groth16 verification (folding several
  proofs into one check) needs native G2 arithmetic
  ([SIMD-0302](https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0302-bn254-g2-syscalls.md),
  Q4 2026). A single-proof rollup does not; this ADR deliberately stays inside
  what ships today.
- **Privacy.** Vouchers, amounts, and recipients stay public. The proof is used
  for succinct *verification*, not confidentiality.
- **Removing the escrow-per-channel model.** Deposits, PDAs, and the distribution
  commitment are unchanged; only the settlement-verification plane is rolled up.
- **A trustless prover.** The prover is a liveness role (any party can run it);
  soundness comes from the proof, not from trusting the prover.

## Proposed design

An off-chain **prover** collects `N` cumulative vouchers across distinct
payer↔payee channels and produces one Groth16 proof whose statement is:

> For each of the `N` entries, there exists an ed25519 signature by the channel's
> `authorized_signer` over the canonical 50-byte voucher message
> `[0x56,0x01] ‖ channel_id ‖ cumulative_amount ‖ expires_at`, the message is
> unexpired at the posted timestamp, and `new_watermark = cumulative_amount`.

The proof's **public input** is a single 32-byte commitment (a Merkle root or a
running hash) to the ordered list of `(channel_id, new_watermark)` pairs. A new
`settle_rollup` instruction:

1. verifies the Groth16 proof against the pinned verifying key (one
   `sol_alt_bn128_group_op` pairing check, ~300k CU);
2. binds the proof's public-input commitment to the settlement list carried in
   the transaction; and
3. advances each listed channel's `settled` watermark, subject to the existing
   `settled ≤ deposit` and monotonicity checks.

The signature plane is now `O(1)`. **The floors of the Context section are what's
left**, and they decide whether this is worth building — see the cost envelope.

## Cost planning envelope

Same discipline as ADR-004/005: constants from the Agave cost model; pessimistic.

```text
Groth16 proof verify (one pairing check)     ~300,000 CU   (once, independent of N)
amortized verify at N = 10,000                    ~30 CU / channel
```

The verify cost per channel is negligible at scale. But the settlement is only
*real* once each channel's `settled` actually advances on chain, and that is
where the structural floors reassert themselves:

```text
per-channel state write (write lock)             ~300 CU / channel  — unchanged by the proof
transaction account cap                            64 accounts / tx  — unchanged by the proof
```

So a naive `settle_rollup` that still passes one writable channel account per
settlement is bounded at **~60 channels/tx by the account cap** and **~300
CU/channel by write locks** — i.e. it lands in the same regime as ADR-004's
~948 CU/channel and buys almost nothing, because ADR-004 already made the
signature cheap. **The proof collapses verification, not the write-lock or
account floor.** The rollup therefore only pays off when it is paired with a
**state-compression** companion: commit the watermark set into a *single*
accumulator account (one writable account, one Merkle root advanced per rollup)
rather than touching `N` channel accounts, deferring per-channel materialization
to a lazy, permissionless `distribute`/`reclaim`. With that companion the floor
moves from `write locks × N` to `write locks × 1` and the 64-account cap stops
binding — and only then does the `O(1)` verify translate into `O(1)` settlement.

That companion is a non-trivial state-machine change (a global or per-payee
watermark accumulator, its inclusion proofs, and the distribution path that reads
it), which is why this stays a candidate rather than a scheduled design.

## Decision: when this is worth building

Build `settle_rollup` **only if a topology emerges that operator-signed mode +
ADR-004 cannot already cover more cheaply.** That topology is specifically:
**many mutually-distrusting payers whose channels do *not* share an
`authorized_signer`.** ADR-004 and the MPP operator-signed mode both assume one
signer authority across the batched channels; when that assumption holds, ~948
CU/channel already wins and a rollup adds proving infrastructure for no gain. The
rollup's unique capability is aggregating settlements across **independent signer
authorities** — exactly the case a shared-signer batch cannot express — and it is
only economical alongside the state-compression companion above.

Absent that topology, this ADR is **deferred**: the honest recommendation is
operator-signed + ADR-004, and the capacity model should present the rollup as an
"if-ever" ceiling, not a scheduled phase.

## Trade-offs and rejected alternatives

### BLS aggregate signatures (SIMD-0388)

Rejected as a settlement multiplier. Distinct-message aggregation costs `n + 1`
pairings; at tens of thousands of CU per pairing it loses to per-voucher ed25519.
BLS is correct for same-message multisig/consensus, not distinct-voucher
settlement.

### Wait for batch Groth16 (SIMD-0302 G2 syscalls)

Multi-proof aggregation is a *further* optimization (fold many rollup proofs into
one check) and needs native G2 arithmetic not live until ~Q4 2026. The
single-proof rollup here needs none of it; SIMD-0302 would only raise the ceiling
later, not gate this design.

### Keep one writable channel account per settlement

This is the naive `settle_rollup`. Rejected as pointless on its own: it inherits
the write-lock and 64-account floors and lands in ADR-004's cost regime while
adding a prover and a trusted setup. The proof only earns its keep with the
state-compression companion.

### Rollup as the default settlement path

Rejected. Proving latency, prover liveness, trusted-setup/verifying-key
governance, and circuit-audit surface are real costs. Plain `settle`, ADR-004,
and ADR-005 `rearm` stay the defaults; the rollup is an aggregation escape hatch
for the distinct-signer topology only.

## Compatibility

- **Voucher format:** version-1 `[0x56, 0x01]` unchanged — the circuit proves the
  existing message contract, so nothing changes for signers or the wire.
- **`Channel` layout:** unchanged for the naive form; the state-compression
  companion (if pursued) introduces an accumulator account and is its own ADR.
- **New instruction + verifying key:** `settle_rollup` adds a discriminator and
  pins a Groth16 verifying key (and its trusted-setup provenance) in program
  constants; existing clients ignore the discriminator.
- **Composes with ADR-004/005:** a rollup may advance a watermark that a later
  `rearm` or `distribute` acts on, under the same `payout_watermark ≤ settled ≤
  deposit` invariant.

## Implementation and review gates

Do not build in production until all of these pass:

1. A named, audited circuit for the per-entry statement (ed25519 verify + expiry
   + `new_watermark` binding), with a documented, reproducible trusted setup and
   a governance path for the verifying key.
2. On-chain proof-verify CU benchmark on mainnet-representative inputs, pinned
   into `bench_report.md`, confirming the ~300k envelope and the per-tx budget.
3. The state-compression companion designed and ADR'd first — this ADR is not
   economical without it; do not ship the naive per-account form.
4. Public-input binding tests: the proof's committed `(channel, watermark)` list
   must be cryptographically bound to the settlement the instruction applies; a
   mismatch must hard-fail with no state mutation.
5. Property tests asserting `payout_watermark ≤ settled ≤ deposit` and
   no-value-creation across arbitrary interleavings of `settle_rollup` with
   `settle`, `settleBatch`, `rearm`, `requestClose`, and `distribute`.
6. Replay/expiry tests at the rollup boundary: expired vouchers inside a batch,
   stale watermarks, and cross-incarnation targets must be rejected by the
   circuit, not merely by the instruction.
7. External cryptographic review of the circuit and verifying-key handling, plus
   a topology justification on record that operator-signed + ADR-004 does not
   cover the target workload more cheaply.
