# Payment-channel capacity model audit

_Snapshot: 2026-08-06. “Today” uses finalized Solana mainnet metadata; proposed instructions and SIMDs are
identified as planning inputs, not measurements._

## Mainnet calibration

The deployed program is `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`. A fresh
`getSignaturesForAddress` query followed by `getTransaction` for finalized transaction
[`4xZiXeWH…Wam3H`](https://explorer.solana.com/tx/4xZiXeWHdH5VQXiiiHGBnYgqaULUfoiWi2fjd62GkS5W8QScXRrJ2NPkVKoxF6ufbbdWi9j8wE1fpb2uFmQWam3H)
returned:

| Field                  |                                                             Value |
| ---------------------- | ----------------------------------------------------------------: |
| Slot                   |                                                       437,626,262 |
| Block time             |                                                     1,786,037,424 |
| Instruction shape      | Ed25519 precompile + payment-channel discriminator `2` (`settle`) |
| Transaction signatures |                                                                 1 |
| Execution CU           |                                                               425 |
| Scheduler `costUnits`  |                                                             4,209 |
| Fee                    |                                                   10,000 lamports |

This confirms the report's current settle constant and illustrates why `computeUnitsConsumed` is not the
capacity denominator. The 3,784-unit delta includes scheduler charges such as the transaction signature,
Ed25519 verification, writable locks, and instruction data.

I also re-fetched the report's representative transaction set in one mainnet RPC batch. All five transactions
remain finalized and return the expected metadata:

| Shape                                                                                                                                                         | Execution CU | `costUnits` |    Fee | Tx signatures |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------: | ----------: | -----: | ------------: |
| [one-signer open example](https://explorer.solana.com/tx/5ft6xbfCGEa2bpkysbXR1JafrGF48HVYfy21ubqV6B6dR3kepynoLJVKoEN2jKKiTErLmxcpmKALVszMFqid4KYZ)            |       31,558 |      33,566 |  5,000 |             1 |
| current settle above                                                                                                                                          |          425 |       4,209 | 10,000 |             1 |
| [voucher terminal close + distribute](https://explorer.solana.com/tx/YoCU5fv5GX3Zm8SusoxunQ5b7aELMmscyXjyYfAZ2geZgMLnejMP7i3DryzHMgro4v44Dxc9xxfjkiD81JG8iEp) |       18,557 |      23,875 | 10,000 |             1 |
| [OPEN-state distribute](https://explorer.solana.com/tx/2u4KszULhpHMeaaiJ4BWiputRLbR63PDBNXnkqmb3eYWMP9fBcxcKWnHrfpWgDj6bHMq9rm8ZeJ64nrY2rR7ToFm)              |       11,328 |      14,205 |  5,000 |             1 |
| [eight reclaims in one transaction](https://explorer.solana.com/tx/HwvLV6cZxQhPznSc59FgoMCvy4itUzj44eyCNczfBY5mbanhpNiSdhxCwAEJ6embDUWL2fHjW6afP1QXuV5j7kV)   |        2,536 |       5,982 |  5,000 |             1 |

The open constant used by the model is the 140-sample p50 rather than the lower one-signer example. The wider
finalized sample in `ONE_MILLION_PAYMENT_TPS.md` remains the calibration source for the operation distribution:

| Operation                           |                       Scheduler cost | Measurement status                            |
| ----------------------------------- | -----------------------------------: | --------------------------------------------- |
| open                                |                           36,086 p50 | mainnet, 140 samples                          |
| settle                              |                                4,209 | mainnet; reconfirmed above                    |
| voucher terminal close + distribute |                               23,875 | mainnet, 2 matching samples                   |
| OPEN-state distribute               |                     14,205 low shape | mainnet, 3 samples                            |
| reclaim                             | exact affine fit through n=1 and n=8 | mainnet standalone + batch-of-8               |
| top-up                              |                               10,200 | checkout planning estimate; no mainnet sample |
| ADR-005 rearm                       |                               19,000 | proposed planning envelope; not implemented   |
| ADR-004 MPP batch settle            |                      `890 + 3,420/n` | proposed planning envelope; not implemented   |

## Source-level correction

The previous UI treated the cash-sweep clock as the channel lifetime. That is not the deployed state machine:

- `settle` advances the OPEN channel watermark and is permissionless; authority is the voucher
  (`program/payment_channels/src/instructions/settle.rs:12-55`).
- `distribute` explicitly accepts both `Open` and `Sealed` channels
  (`program/payment_channels/src/instructions/distribute.rs:186`). In OPEN it advances payout accounting without
  closing the channel.
- `top_up` extends an OPEN channel and is payer-signed
  (`program/payment_channels/src/instructions/top_up.rs:50-105`).
- Only the terminal cooperative path requires the payee signer and changes status to SEALED
  (`program/payment_channels/src/instructions/settle_and_seal.rs:83-118`).

Therefore a deployed v1 channel can stay open across many cash sweeps. Charging
`open + settle_and_seal/distribute + reclaim` once per cash clock overstated today's lifecycle traffic and made
ADR-005 appear to be a prerequisite for persistence.

## Corrected equation

For `U` live channels, full channel lifetime `L`, cash clock `C`, and optional checkpoint clock `E`:

```text
terminal_lifecycles/s = U / L
intermediate_cash_boundaries/channel = max(0, L / C - 1)
cash_boundaries/s = terminal_lifecycles/s × intermediate_cash_boundaries/channel

v1 cash boundary = settle + OPEN distribute + top_up
                 = 4,209 + 14,205 + 10,200 = 28,614 units/channel

v2 cash boundary = ADR-005 rearm + top_up
                 = 19,000 + 10,200 = 29,200 units/channel (planning only)

terminal lifecycle = open + terminal close + batched reclaim

required CU/s = terminal lifecycle CU/s
              + intermediate cash-boundary CU/s
              + non-overlapping checkpoint CU/s
```

A checkpoint coincident with a cash or terminal boundary is not charged again because that boundary already
applies the current voucher. The model also prices transaction fees by operation instead of multiplying every
channel transaction by a blanket two-signature assumption.

## Preset semantics

The former `sweep.mjs` copied the application equations and committed sixteen literal outputs. A change to the
UI model could therefore leave “verified” presets stale. Presets now call the same exported pure evaluator as the
page:

- neither: shortest cash window that fits without extra checkpoints;
- cheapest: lowest annual operating cost without extra checkpoints;
- fastest: lowest enforceable finality without delaying the neutral preset's cash sweep;
- cheapest + fastest: equal-weight Pareto knee after normalizing cost and finality, without delaying the
  Cheapest preset's cash sweep.

UI events are reduced through one pure state transition in `web/src/app-state.ts`. Preset selection, URL loading,
manual controls, SIMD toggles, and rail changes can no longer update demand and model inputs in separate React
state queues. The transition matrix is covered directly, including Cheapest on/off followed by Fastest.

Batch settlement is also an explicit horizon capability. The Today rail forces one checkpoint channel per
transaction in the evaluator itself; disabling the slider is only a presentation detail. Proposed ADR-004
batching is enabled only on the Long-term rail. Today defaults to MPP on deployed v1: the operator-signed voucher
removes per-payment client verification, while each checkpoint still uses the measured one-channel settle path.

The 10M combined presets now resolve differently:

| Horizon                               | Cash clock | Checkpoint | Finality | Budget |    All-in |
| ------------------------------------- | ---------: | ---------: | -------: | -----: | --------: |
| Available today (v1 + MPP)            |         1h |   disabled |       1h |  64.0% | 0.180 bps |
| Long-term (v2 + MPP + selected SIMDs) |         1h |        30m |      30m |  67.2% | 0.159 bps |

At 10M/today, the discrete Pareto frontier has no interior candidate between the one-hour neutral/cheapest cash
window and the 30-minute Fastest checkpoint, so the equal-weight combined objective resolves to the cheaper
endpoint. This is an explicit optimizer result rather than stale UI state.

These are planning scenarios, not throughput claims. The long-term row combines several unshipped assumptions;
it must not be presented as a benchmark of deployed v2.

The former long-term preset also counted P-ATA twice: it reduced the measured open cost and raised the workload's
available scheduler share from 50% to 55%. The corrected evaluator applies the direct open-cost delta only. The
available-capacity percentage remains an explicit scenario input because a cluster-wide headroom gain has not
been measured. Likewise, the larger-transaction and precompile-removal switches alter only the transaction shapes
they directly affect; they do not silently raise the scheduler budget.

## Remaining uncertainty

The `$ / million vouchers` input is still a placeholder, not a benchmark. On an equal on-chain base, the default
`$0.02/M` input adds `$630,720/year` at 1M accepted requests/s and `$6,307,200/year` at 10M/s to a client-signed
rail. MPP operator-signed removes that specific Ed25519 verification work, but not per-request authentication,
metering, storage, networking, replication, or abuse-control cost. The current UI should therefore support only
the narrow statement “MPP avoids the modeled client-signature verification penalty,” not “MPP infrastructure is
free.”
