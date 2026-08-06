export type ModelMode = 'vanilla' | 'channel-v1' | 'channel-v2';
export type SettlementScheme = 'none' | 'x402' | 'mpp';
export type TransferKind = 'spl-token' | 'token-2022';

export interface ModelInputs {
    availableCapacityPercent: number;
    batchSettlementAvailable: boolean;
    blockCostUnits: number;
    checkpointClockSeconds: number;
    checkpointBatchSize: number;
    openCostUnits: number;
    mode: ModelMode;
    scheme: SettlementScheme;
    reclaimBatchSize: number;
    rentPerChannelSol: number;
    slotMs: number;
    voucherSigFeeRemoved: boolean;
    largeTx: boolean;
    transferCostUnits: number;
    transferKind: TransferKind;
    voucherVerifyPerSecond: number;
}

export interface DemandInputs {
    averageRequestsPerMinutePerUser: number;
    averageTransactionValueUsd: number;
    capitalCostAnnualPercent: number;
    channelLifetimeSeconds: number;
    priorityFeeLamportsPerTx: number;
    settlementClockSeconds: number;
    solPriceUsd: number;
    users: number;
    voucherVerifyCostUsdPerMillion: number;
}

export interface ModelResult {
    allInTakeRateBps: number;
    availableBudgetPerSecond: number;
    bindingConstraint: 'none' | 'off-chain Ed25519 voucher verification' | 'on-chain execution budget';
    blocksPerSecond: number;
    budgetSharePercent: number;
    canHandleDemand: boolean;
    capitalCarryingCostUsdPerYear: number;
    channelBuildsPerSecond: number;
    channelLifeSeconds: number;
    channelLifecyclesPerSecond: number;
    checkpointBudgetSharePercent: number;
    checkpointChannels: number;
    checkpointCostPerChannelUnits: number;
    checkpointCostUnitsPerSecond: number;
    checkpointTransactionsPerSecond: number;
    checkpointsEnabled: boolean;
    checkpointsPerSecond: number;
    costPerLifecycle: number;
    costPerLogicalPayment: number;
    droppedRequestsPerSecond: number;
    enforceableFinalitySeconds: number;
    escrowFloatUsd: number;
    feeTakeRateBps: number;
    feeUsdPerYear: number;
    grossValuePerSecondUsd: number;
    checkpointingAvailable: boolean;
    intermediateBoundariesPerChannel: number;
    liveChannels: number;
    logicalRequestsPerSecond: number;
    maximumPaymentsPerSecond: number;
    networkFeeLamportsPerSecond: number;
    networkFeeMultiplier: number;
    networkFeeSavingsUsdPerDay: number;
    networkFeeSolPerSecond: number;
    networkFeeUsdPerSecond: number;
    nominalBudgetPerSecond: number;
    onChainBacklogFactor: number;
    onChainTxPerWindow: number;
    paymentsPerChannel: number;
    physicalTransactionsPerSecond: number;
    processedPercent: number;
    processedRequestsPerSecond: number;
    progressPercent: number;
    requiredBudgetPerSecond: number;
    rentWorkingCapital: number;
    rentWorkingCapitalUsd: number;
    requestsPerSettlement: number;
    sessionsPerChannel: number;
    sessionsPerSecond: number;
    settlementClockEnabled: boolean;
    settlementLatencySeconds: number;
    settlementWindowSeconds: number;
    settlementsPerSecond: number;
    sustainableCeiling: number;
    totalOpexUsdPerYear: number;
    vanillaFeeTakeRateBps: number;
    vanillaNetworkFeeUsdPerSecond: number;
    voucherVerifiesPerSecond: number;
    voucherVerifyBinds: boolean;
    voucherVerifyCeiling: number;
    voucherVerifySharePercent: number;
    verifyComputeUsdPerSecond: number;
    verifyComputeUsdPerYear: number;
    windowDrainSeconds: number;
    workingCapitalUsd: number;
}

export const TARGET_PAYMENTS_PER_SECOND = 10_000_000;
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const BASE_FEE_LAMPORTS_PER_SIGNATURE = 5_000;
export const SECONDS_PER_DAY = 86_400;
export const SECONDS_PER_YEAR = 31_536_000;
export const SPL_TOKEN_TRANSFER_COST_UNITS = 1_911;
export const TOKEN_2022_TRANSFER_COST_UNITS = 6_536;

// Finalized mainnet scheduler-cost samples, documented in ONE_MILLION_PAYMENT_TPS.md.
export const OPEN_COST_UNITS = 36_086;
export const SETTLE_COST_UNITS = 4_209;
export const TERMINAL_CLOSE_COST_UNITS = 23_875;
export const INTERIM_DISTRIBUTE_COST_UNITS = 14_205;
export const STANDALONE_RECLAIM_COST_UNITS = 1_661;
export const TOP_UP_COST_UNITS = 10_200;

// ADR-005 is proposed and unbenchmarked. The 19k value is its explicit planning envelope.
export const REARM_COST_UNITS = 19_000;
export const SESSION_BOUNDARY_V2_COST_UNITS = REARM_COST_UNITS + TOP_UP_COST_UNITS;

export const X402_CHECKPOINT_TODAY_MAX_BATCH = 5;
export const X402_CHECKPOINT_PRECOMPILE_REMOVED_MAX_BATCH = 10;
export const X402_CHECKPOINT_LARGE_TX_MAX_BATCH = 16;
export const X402_CHECKPOINT_LARGE_TX_PRECOMPILE_REMOVED_MAX_BATCH = 33;
export const X402_CHECKPOINT_DEFAULT_BATCH = 5;
export const MPP_CHECKPOINT_MAX_BATCH = 59;
export const MPP_CHECKPOINT_LARGE_TX_MAX_BATCH = 60;
export const MPP_CHECKPOINT_DEFAULT_BATCH = 59;

export const DEFAULT_DEMAND: DemandInputs = {
    averageRequestsPerMinutePerUser: 60,
    averageTransactionValueUsd: 0.05,
    capitalCostAnnualPercent: 8,
    channelLifetimeSeconds: 86_400,
    priorityFeeLamportsPerTx: 0,
    settlementClockSeconds: 60,
    solPriceUsd: 80,
    users: 10_000_000,
    voucherVerifyCostUsdPerMillion: 0.02,
};

export const TODAY: ModelInputs = {
    availableCapacityPercent: 50,
    batchSettlementAvailable: false,
    blockCostUnits: 100_000_000,
    checkpointBatchSize: 1,
    checkpointClockSeconds: 0,
    largeTx: false,
    mode: 'channel-v1',
    openCostUnits: OPEN_COST_UNITS,
    reclaimBatchSize: 8,
    rentPerChannelSol: 0.00471192,
    scheme: 'mpp',
    slotMs: 400,
    transferCostUnits: SPL_TOKEN_TRANSFER_COST_UNITS,
    transferKind: 'spl-token',
    voucherSigFeeRemoved: false,
    voucherVerifyPerSecond: 1_000_000,
};

export const MODEL_CLOCK_CANDIDATES = [
    1, 2, 3, 4, 5, 10, 15, 30, 60, 120, 300, 600, 1_800, 3_600, 7_200, 10_800, 21_600, 43_200, 86_400,
] as const;

export interface PresetObjective {
    readonly cheapest: boolean;
    readonly fastest: boolean;
}

export interface ResolvedPresetShape {
    readonly checkpointClockSeconds: number;
    readonly result: ModelResult;
    readonly settlementClockSeconds: number;
}

export function arrivingRequestsPerSecond(demand: DemandInputs): number {
    return (demand.users * demand.averageRequestsPerMinutePerUser) / 60;
}

export function requiresPerPaymentVerify(mode: ModelMode, scheme: SettlementScheme): boolean {
    return mode !== 'vanilla' && scheme !== 'mpp';
}

export function checkpointMaxBatch(scheme: SettlementScheme, largeTx: boolean, voucherSigFeeRemoved = false): number {
    if (scheme === 'mpp') return largeTx ? MPP_CHECKPOINT_LARGE_TX_MAX_BATCH : MPP_CHECKPOINT_MAX_BATCH;
    if (largeTx) {
        return voucherSigFeeRemoved
            ? X402_CHECKPOINT_LARGE_TX_PRECOMPILE_REMOVED_MAX_BATCH
            : X402_CHECKPOINT_LARGE_TX_MAX_BATCH;
    }
    return voucherSigFeeRemoved ? X402_CHECKPOINT_PRECOMPILE_REMOVED_MAX_BATCH : X402_CHECKPOINT_TODAY_MAX_BATCH;
}

export function effectiveCheckpointBatchSize(inputs: ModelInputs): number {
    if (!inputs.batchSettlementAvailable) return 1;
    return Math.max(
        1,
        Math.min(
            inputs.checkpointBatchSize,
            checkpointMaxBatch(inputs.scheme, inputs.largeTx, inputs.voucherSigFeeRemoved),
        ),
    );
}

export function checkpointCostPerChannel(scheme: SettlementScheme, batchSize: number): number {
    const n = Math.max(1, batchSize);
    if (scheme === 'mpp') return 890 + 3_420 / n;
    // Plain v1 and x402 both settle client-signed vouchers on-chain. x402 changes the
    // transport, not the deployed settle instruction or its scheduler cost.
    return 3_166 + 1_043 / n;
}

export function reclaimCostPerChannel(batchSize: number): number {
    // Exact affine fit through finalized mainnet n=1 (1,661 total) and n=8 (5,982 total).
    return 4_321 / 7 + 7_306 / 7 / Math.max(1, batchSize);
}

function terminalVoucherFeeLamports(voucherSigFeeRemoved: boolean): number {
    return BASE_FEE_LAMPORTS_PER_SIGNATURE * (voucherSigFeeRemoved ? 1 : 2);
}

function checkpointFeeLamportsPerTransaction(inputs: ModelInputs, batchSize: number): number {
    if (inputs.voucherSigFeeRemoved) return BASE_FEE_LAMPORTS_PER_SIGNATURE;
    const voucherSignatures = inputs.scheme === 'mpp' ? 1 : batchSize;
    return BASE_FEE_LAMPORTS_PER_SIGNATURE * (1 + voucherSignatures);
}

/**
 * Evaluate one scenario from independent on-chain planes.
 *
 * - lifecycle: open + terminal voucher close/distribute + reclaim, once per channel lifetime;
 * - cash boundary: voucher settle + OPEN distribute + top-up on deployed v1, or ADR-005 rearm + top-up on v2;
 * - checkpoint: optional interim watermark commits, excluding clocks already covered by a cash/terminal boundary;
 * - voucher plane: per-payment client Ed25519 verification for plain/x402, none for MPP operator-signed.
 *
 * Keeping the planes separate is essential: the deployed program's OPEN-state `distribute` does not close the
 * channel, so the cash-sweep clock is not the channel lifetime.
 */
export function evaluateModel(inputs: ModelInputs, demand: DemandInputs): ModelResult {
    const blocksPerSecond = 1_000 / inputs.slotMs;
    const nominalBudgetPerSecond = inputs.blockCostUnits * blocksPerSecond;
    const availableBudgetPerSecond = nominalBudgetPerSecond * (inputs.availableCapacityPercent / 100);
    const isChannel = inputs.mode !== 'vanilla';
    const logicalRequestsPerSecond = arrivingRequestsPerSecond(demand);
    const liveChannels = isChannel && logicalRequestsPerSecond > 0 ? demand.users : 0;
    const settlementClockEnabled = isChannel && demand.settlementClockSeconds > 0;
    const channelLifeSeconds = isChannel
        ? Math.max(demand.channelLifetimeSeconds, settlementClockEnabled ? demand.settlementClockSeconds : 0)
        : 1;

    const paymentsPerChannel = isChannel
        ? Math.max(1, (demand.averageRequestsPerMinutePerUser * channelLifeSeconds) / 60)
        : 1;
    const requestsPerSettlement = isChannel
        ? settlementClockEnabled
            ? Math.max(1, (demand.averageRequestsPerMinutePerUser * demand.settlementClockSeconds) / 60)
            : paymentsPerChannel
        : 1;
    const sessionsPerChannel =
        isChannel && settlementClockEnabled ? Math.max(1, channelLifeSeconds / demand.settlementClockSeconds) : 1;
    const intermediateBoundariesPerChannel = Math.max(0, sessionsPerChannel - 1);
    const channelLifecyclesPerSecond = isChannel ? liveChannels / channelLifeSeconds : 0;
    const sessionsPerSecond = isChannel ? channelLifecyclesPerSecond * (intermediateBoundariesPerChannel + 1) : 0;
    const cashBoundariesPerSecond = channelLifecyclesPerSecond * intermediateBoundariesPerChannel;
    const channelBuildsPerSecond = channelLifecyclesPerSecond;

    const reclaim = reclaimCostPerChannel(inputs.reclaimBatchSize);
    const costPerLifecycle = isChannel
        ? inputs.openCostUnits + TERMINAL_CLOSE_COST_UNITS + reclaim
        : inputs.transferCostUnits;
    const lifecycleCostUnitsPerSecond = channelLifecyclesPerSecond * costPerLifecycle;

    // Deployed v1 can stay OPEN: each intermediate cash boundary settles the latest voucher, distributes
    // cumulative deltas, then tops the escrow back up. ADR-005 replaces that three-instruction shape with a
    // payee-authorized rearm plus top-up; it refunds unused headroom but is not a measured capacity win.
    const cashBoundaryCostUnits =
        inputs.mode === 'channel-v1'
            ? SETTLE_COST_UNITS + INTERIM_DISTRIBUTE_COST_UNITS + TOP_UP_COST_UNITS
            : inputs.mode === 'channel-v2'
              ? SESSION_BOUNDARY_V2_COST_UNITS
              : 0;
    const cashBoundaryCostUnitsPerSecond = cashBoundariesPerSecond * cashBoundaryCostUnits;

    const checkpointingAvailable = isChannel;
    const checkpointsEnabled = checkpointingAvailable && inputs.checkpointClockSeconds > 0;
    const checkpointBatchSize = effectiveCheckpointBatchSize(inputs);
    const checkpointChannels = liveChannels;
    const finalizingBoundarySeconds = settlementClockEnabled ? demand.settlementClockSeconds : channelLifeSeconds;
    const intermediateCheckpointsPerBoundary = checkpointsEnabled
        ? Math.max(0, Math.ceil(finalizingBoundarySeconds / inputs.checkpointClockSeconds) - 1)
        : 0;
    const finalizingBoundariesPerSecond = finalizingBoundarySeconds > 0 ? liveChannels / finalizingBoundarySeconds : 0;
    const checkpointsPerSecond = finalizingBoundariesPerSecond * intermediateCheckpointsPerBoundary;
    // Without ADR-004 batching, every scheme uses the deployed one-channel settle path.
    // The MPP cost curve applies only when multi-customer batch settlement is available.
    const checkpointCostPerChannelUnits = checkpointsEnabled
        ? checkpointCostPerChannel(inputs.batchSettlementAvailable ? inputs.scheme : 'x402', checkpointBatchSize)
        : 0;
    const checkpointCostUnitsPerSecond = checkpointsPerSecond * checkpointCostPerChannelUnits;
    const checkpointTransactionsPerSecond = checkpointsPerSecond / checkpointBatchSize;

    const requiredBudgetPerSecond = isChannel
        ? lifecycleCostUnitsPerSecond + cashBoundaryCostUnitsPerSecond + checkpointCostUnitsPerSecond
        : logicalRequestsPerSecond * inputs.transferCostUnits;
    const costPerLogicalPayment = logicalRequestsPerSecond > 0 ? requiredBudgetPerSecond / logicalRequestsPerSecond : 0;
    const maximumPaymentsPerSecond =
        costPerLogicalPayment > 0 ? availableBudgetPerSecond / costPerLogicalPayment : Infinity;
    const perPaymentVerify = requiresPerPaymentVerify(inputs.mode, inputs.scheme);
    const voucherVerifyCeiling = perPaymentVerify ? inputs.voucherVerifyPerSecond : Infinity;
    const sustainableCeiling = Math.min(maximumPaymentsPerSecond, voucherVerifyCeiling);
    const processedRequestsPerSecond = Math.min(logicalRequestsPerSecond, sustainableCeiling);
    const droppedRequestsPerSecond = Math.max(0, logicalRequestsPerSecond - processedRequestsPerSecond);
    const voucherVerifyBinds = perPaymentVerify && voucherVerifyCeiling < maximumPaymentsPerSecond;
    const bindingConstraint: ModelResult['bindingConstraint'] =
        droppedRequestsPerSecond <= 0
            ? 'none'
            : voucherVerifyBinds
              ? 'off-chain Ed25519 voucher verification'
              : 'on-chain execution budget';
    const canHandleDemand = droppedRequestsPerSecond <= 0;

    const progressPercent = Math.min(100, (logicalRequestsPerSecond / TARGET_PAYMENTS_PER_SECOND) * 100);
    const processedPercent = Math.min(100, (processedRequestsPerSecond / TARGET_PAYMENTS_PER_SECOND) * 100);
    const budgetSharePercent =
        availableBudgetPerSecond > 0 ? (requiredBudgetPerSecond / availableBudgetPerSecond) * 100 : Infinity;
    const checkpointBudgetSharePercent =
        availableBudgetPerSecond > 0 ? (checkpointCostUnitsPerSecond / availableBudgetPerSecond) * 100 : Infinity;
    const voucherVerifySharePercent =
        perPaymentVerify && voucherVerifyCeiling > 0 ? (logicalRequestsPerSecond / voucherVerifyCeiling) * 100 : 0;
    const onChainBacklogFactor =
        availableBudgetPerSecond > 0 ? requiredBudgetPerSecond / availableBudgetPerSecond : Infinity;

    const enforceableFinalitySeconds = isChannel
        ? checkpointsEnabled && intermediateCheckpointsPerBoundary > 0
            ? Math.min(inputs.checkpointClockSeconds, finalizingBoundarySeconds)
            : finalizingBoundarySeconds
        : 0;
    const settlementLatencySeconds = isChannel
        ? enforceableFinalitySeconds * Math.max(1, onChainBacklogFactor)
        : Math.max(1, onChainBacklogFactor) / Math.max(blocksPerSecond, 0.001);
    const settlementWindowSeconds = isChannel ? finalizingBoundarySeconds : 1;

    const lifecycleTransactionsPerSecond = isChannel
        ? channelLifecyclesPerSecond * 2 + channelLifecyclesPerSecond / Math.max(1, inputs.reclaimBatchSize)
        : 0;
    const cashTransactionsPerBoundary = inputs.mode === 'channel-v1' ? 3 : inputs.mode === 'channel-v2' ? 2 : 0;
    const cashTransactionsPerSecond = cashBoundariesPerSecond * cashTransactionsPerBoundary;
    const physicalTransactionsPerSecond = isChannel
        ? lifecycleTransactionsPerSecond + cashTransactionsPerSecond + checkpointTransactionsPerSecond
        : logicalRequestsPerSecond;
    const settlementsPerSecond = isChannel
        ? channelLifecyclesPerSecond + cashBoundariesPerSecond + checkpointsPerSecond
        : 0;
    const onChainTxPerWindow = physicalTransactionsPerSecond * settlementWindowSeconds;
    const windowDrainSeconds = settlementWindowSeconds * onChainBacklogFactor;

    // Fees are operation-specific. Mainnet settles have one transaction signer plus one Ed25519 precompile
    // signature (10k lamports); standalone distribute/reclaim have one signer (5k). Open is conservatively
    // priced at two transaction signers because relayed flows commonly separate payer and rent/fee payer.
    let networkFeeLamportsPerSecond: number;
    if (!isChannel) {
        const transferSignatures = inputs.transferKind === 'token-2022' ? 2 : 1;
        networkFeeLamportsPerSecond =
            physicalTransactionsPerSecond *
            (transferSignatures * BASE_FEE_LAMPORTS_PER_SIGNATURE + demand.priorityFeeLamportsPerTx);
    } else {
        const openFees = channelLifecyclesPerSecond * 2 * BASE_FEE_LAMPORTS_PER_SIGNATURE;
        const terminalFees = channelLifecyclesPerSecond * terminalVoucherFeeLamports(inputs.voucherSigFeeRemoved);
        const reclaimFees =
            (channelLifecyclesPerSecond / Math.max(1, inputs.reclaimBatchSize)) * BASE_FEE_LAMPORTS_PER_SIGNATURE;
        const cashFeesPerBoundary =
            inputs.mode === 'channel-v1'
                ? terminalVoucherFeeLamports(inputs.voucherSigFeeRemoved) + 2 * BASE_FEE_LAMPORTS_PER_SIGNATURE
                : inputs.mode === 'channel-v2'
                  ? BASE_FEE_LAMPORTS_PER_SIGNATURE * (inputs.voucherSigFeeRemoved ? 2 : 3) +
                    BASE_FEE_LAMPORTS_PER_SIGNATURE
                  : 0;
        const checkpointFees =
            checkpointTransactionsPerSecond * checkpointFeeLamportsPerTransaction(inputs, checkpointBatchSize);
        networkFeeLamportsPerSecond =
            openFees +
            terminalFees +
            reclaimFees +
            cashBoundariesPerSecond * cashFeesPerBoundary +
            checkpointFees +
            physicalTransactionsPerSecond * demand.priorityFeeLamportsPerTx;
    }

    const networkFeeSolPerSecond = networkFeeLamportsPerSecond / LAMPORTS_PER_SOL;
    const networkFeeUsdPerSecond = networkFeeSolPerSecond * demand.solPriceUsd;
    const grossValuePerSecondUsd = logicalRequestsPerSecond * demand.averageTransactionValueUsd;
    const feeTakeRateBps = grossValuePerSecondUsd > 0 ? (networkFeeUsdPerSecond / grossValuePerSecondUsd) * 10_000 : 0;
    const vanillaSignatures = inputs.transferKind === 'token-2022' ? 2 : 1;
    const vanillaNetworkFeeUsdPerSecond =
        ((logicalRequestsPerSecond *
            (vanillaSignatures * BASE_FEE_LAMPORTS_PER_SIGNATURE + demand.priorityFeeLamportsPerTx)) /
            LAMPORTS_PER_SOL) *
        demand.solPriceUsd;
    const vanillaFeeTakeRateBps =
        grossValuePerSecondUsd > 0 ? (vanillaNetworkFeeUsdPerSecond / grossValuePerSecondUsd) * 10_000 : 0;
    const networkFeeMultiplier =
        networkFeeUsdPerSecond > 0 ? vanillaNetworkFeeUsdPerSecond / networkFeeUsdPerSecond : Infinity;
    const networkFeeSavingsUsdPerDay = Math.max(
        0,
        (vanillaNetworkFeeUsdPerSecond - networkFeeUsdPerSecond) * SECONDS_PER_DAY,
    );

    const rentWorkingCapital = liveChannels * inputs.rentPerChannelSol;
    const rentWorkingCapitalUsd = rentWorkingCapital * demand.solPriceUsd;
    const escrowFloatUsd = isChannel ? grossValuePerSecondUsd * settlementWindowSeconds : 0;
    const workingCapitalUsd = rentWorkingCapitalUsd + escrowFloatUsd;
    const capitalCarryingCostUsdPerYear = workingCapitalUsd * (demand.capitalCostAnnualPercent / 100);
    const voucherVerifiesPerSecond = perPaymentVerify ? processedRequestsPerSecond : 0;
    const verifyComputeUsdPerSecond = (voucherVerifiesPerSecond / 1_000_000) * demand.voucherVerifyCostUsdPerMillion;
    const verifyComputeUsdPerYear = verifyComputeUsdPerSecond * SECONDS_PER_YEAR;
    const feeUsdPerYear = networkFeeUsdPerSecond * SECONDS_PER_YEAR;
    const totalOpexUsdPerYear = feeUsdPerYear + verifyComputeUsdPerYear + capitalCarryingCostUsdPerYear;
    const allInTakeRateBps =
        grossValuePerSecondUsd > 0 ? (totalOpexUsdPerYear / (grossValuePerSecondUsd * SECONDS_PER_YEAR)) * 10_000 : 0;

    return {
        allInTakeRateBps,
        availableBudgetPerSecond,
        bindingConstraint,
        blocksPerSecond,
        budgetSharePercent,
        canHandleDemand,
        capitalCarryingCostUsdPerYear,
        channelBuildsPerSecond,
        channelLifeSeconds,
        channelLifecyclesPerSecond,
        checkpointBudgetSharePercent,
        checkpointChannels,
        checkpointCostPerChannelUnits,
        checkpointCostUnitsPerSecond,
        checkpointTransactionsPerSecond,
        checkpointingAvailable,
        checkpointsEnabled,
        checkpointsPerSecond,
        costPerLifecycle,
        costPerLogicalPayment,
        droppedRequestsPerSecond,
        enforceableFinalitySeconds,
        escrowFloatUsd,
        feeTakeRateBps,
        feeUsdPerYear,
        grossValuePerSecondUsd,
        intermediateBoundariesPerChannel,
        liveChannels,
        logicalRequestsPerSecond,
        maximumPaymentsPerSecond,
        networkFeeLamportsPerSecond,
        networkFeeMultiplier,
        networkFeeSavingsUsdPerDay,
        networkFeeSolPerSecond,
        networkFeeUsdPerSecond,
        nominalBudgetPerSecond,
        onChainBacklogFactor,
        onChainTxPerWindow,
        paymentsPerChannel,
        physicalTransactionsPerSecond,
        processedPercent,
        processedRequestsPerSecond,
        progressPercent,
        rentWorkingCapital,
        rentWorkingCapitalUsd,
        requestsPerSettlement,
        requiredBudgetPerSecond,
        sessionsPerChannel,
        sessionsPerSecond,
        settlementClockEnabled,
        settlementLatencySeconds,
        settlementWindowSeconds,
        settlementsPerSecond,
        sustainableCeiling,
        totalOpexUsdPerYear,
        vanillaFeeTakeRateBps,
        vanillaNetworkFeeUsdPerSecond,
        verifyComputeUsdPerSecond,
        verifyComputeUsdPerYear,
        voucherVerifiesPerSecond,
        voucherVerifyBinds,
        voucherVerifyCeiling,
        voucherVerifySharePercent,
        windowDrainSeconds,
        workingCapitalUsd,
    };
}

/**
 * Resolve presets through the production evaluator. There is intentionally no second copy of the equations.
 *
 * - neither: shortest cash window that fits, without extra checkpoints;
 * - cheapest: minimum annual operating cost, without extra checkpoints;
 * - fastest: minimum enforceable finality without delaying the shortest fitting cash window;
 * - both: equal-weight Pareto knee without delaying the cheapest cash window.
 */
export function resolvePresetShape(
    inputs: ModelInputs,
    demand: DemandInputs,
    objective: PresetObjective,
): ResolvedPresetShape {
    const cashClocks = MODEL_CLOCK_CANDIDATES.filter(clock => clock <= demand.channelLifetimeSeconds);
    const checkpointClocks = objective.fastest ? [0, ...MODEL_CLOCK_CANDIDATES] : [0];
    const candidates: ResolvedPresetShape[] = [];

    for (const settlementClockSeconds of cashClocks) {
        for (const checkpointClockSeconds of checkpointClocks) {
            if (checkpointClockSeconds >= settlementClockSeconds && checkpointClockSeconds !== 0) continue;
            const candidateInputs = { ...inputs, checkpointClockSeconds };
            const candidateDemand = { ...demand, settlementClockSeconds };
            const result = evaluateModel(candidateInputs, candidateDemand);
            if (result.canHandleDemand) {
                candidates.push({ checkpointClockSeconds, result, settlementClockSeconds });
            }
        }
    }

    if (candidates.length === 0) {
        throw new Error('No fitting preset shape for the selected scale and horizon');
    }

    const byCostThenLatency = (left: ResolvedPresetShape, right: ResolvedPresetShape) =>
        left.result.totalOpexUsdPerYear - right.result.totalOpexUsdPerYear ||
        left.result.settlementLatencySeconds - right.result.settlementLatencySeconds;
    const byLatencyThenCost = (left: ResolvedPresetShape, right: ResolvedPresetShape) =>
        left.result.settlementLatencySeconds - right.result.settlementLatencySeconds ||
        left.result.totalOpexUsdPerYear - right.result.totalOpexUsdPerYear;

    const neutral = candidates
        .filter(candidate => candidate.checkpointClockSeconds === 0)
        .sort((left, right) => left.settlementClockSeconds - right.settlementClockSeconds)[0];
    const cheapestWithoutCheckpoints = candidates
        .filter(candidate => candidate.checkpointClockSeconds === 0)
        .sort(byCostThenLatency)[0];
    if (!objective.cheapest && !objective.fastest) return neutral;
    if (objective.cheapest && !objective.fastest) return cheapestWithoutCheckpoints;
    if (!objective.cheapest && objective.fastest) {
        return candidates
            .filter(candidate => candidate.settlementClockSeconds <= neutral.settlementClockSeconds)
            .sort(byLatencyThenCost)[0];
    }

    const combinedCandidates = candidates.filter(
        candidate => candidate.settlementClockSeconds <= cheapestWithoutCheckpoints.settlementClockSeconds,
    );
    const pareto = combinedCandidates.filter(
        candidate =>
            !combinedCandidates.some(
                other =>
                    other !== candidate &&
                    other.result.totalOpexUsdPerYear <= candidate.result.totalOpexUsdPerYear &&
                    other.result.settlementLatencySeconds <= candidate.result.settlementLatencySeconds &&
                    (other.result.totalOpexUsdPerYear < candidate.result.totalOpexUsdPerYear ||
                        other.result.settlementLatencySeconds < candidate.result.settlementLatencySeconds),
            ),
    );
    const costs = pareto.map(candidate => candidate.result.totalOpexUsdPerYear);
    const latencies = pareto.map(candidate => candidate.result.settlementLatencySeconds);
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    const normalize = (value: number, minimum: number, maximum: number) =>
        maximum === minimum ? 0 : (value - minimum) / (maximum - minimum);

    return pareto.sort((left, right) => {
        const leftScore =
            normalize(left.result.totalOpexUsdPerYear, minCost, maxCost) ** 2 +
            normalize(left.result.settlementLatencySeconds, minLatency, maxLatency) ** 2;
        const rightScore =
            normalize(right.result.totalOpexUsdPerYear, minCost, maxCost) ** 2 +
            normalize(right.result.settlementLatencySeconds, minLatency, maxLatency) ** 2;
        return leftScore - rightScore || byCostThenLatency(left, right);
    })[0];
}
