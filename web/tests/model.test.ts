import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_DEMAND,
    MPP_CHECKPOINT_DEFAULT_BATCH,
    OPEN_COST_UNITS,
    SETTLE_COST_UNITS,
    TERMINAL_CLOSE_COST_UNITS,
    TODAY,
    X402_CHECKPOINT_DEFAULT_BATCH,
    checkpointCostPerChannel,
    checkpointMaxBatch,
    effectiveCheckpointBatchSize,
    evaluateModel,
    reclaimCostPerChannel,
    resolvePresetShape,
} from '../src/model.ts';

const closeTo = (actual: number, expected: number, tolerance = 1e-6) => {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test('checkpoint fits reproduce the finalized mainnet settle sample', () => {
    closeTo(checkpointCostPerChannel('none', 1), 4_209);
    closeTo(checkpointCostPerChannel('x402', 1), 4_209);
    closeTo(checkpointCostPerChannel('x402', 5), 3_374.6);
    closeTo(checkpointCostPerChannel('mpp', 59), 947.9661016949153);
});

test('full lifecycle uses the observed batched reclaim shape', () => {
    const result = evaluateModel(
        { ...TODAY, mode: 'channel-v1', reclaimBatchSize: 8, scheme: 'x402', voucherVerifyPerSecond: 2_000_000 },
        { ...DEFAULT_DEMAND, channelLifetimeSeconds: 86_400, settlementClockSeconds: 3_600, users: 1_000_000 },
    );

    closeTo(result.costPerLifecycle, OPEN_COST_UNITS + TERMINAL_CLOSE_COST_UNITS + reclaimCostPerChannel(8));
    closeTo(reclaimCostPerChannel(1), 1_661);
    closeTo(reclaimCostPerChannel(8), 5_982 / 8);
    closeTo(result.channelBuildsPerSecond, 1_000_000 / 86_400);
    closeTo(result.paymentsPerChannel, 86_400);
});

test('deployed v1 cash sweeps do not reopen the channel', () => {
    const inputs = {
        ...TODAY,
        checkpointClockSeconds: 0,
        mode: 'channel-v1' as const,
        scheme: 'x402' as const,
        voucherVerifyPerSecond: 2_000_000,
    };
    const hourly = evaluateModel(inputs, {
        ...DEFAULT_DEMAND,
        channelLifetimeSeconds: 86_400,
        settlementClockSeconds: 3_600,
        users: 1_000_000,
    });
    const minutely = evaluateModel(inputs, {
        ...DEFAULT_DEMAND,
        channelLifetimeSeconds: 86_400,
        settlementClockSeconds: 60,
        users: 1_000_000,
    });

    closeTo(hourly.channelBuildsPerSecond, minutely.channelBuildsPerSecond);
    assert.equal(hourly.sessionsPerChannel, 24);
    assert.equal(minutely.sessionsPerChannel, 1_440);
    assert.ok(minutely.requiredBudgetPerSecond > hourly.requiredBudgetPerSecond);
});

test('a checkpoint aligned with a cash boundary is not charged twice', () => {
    const result = evaluateModel(
        {
            ...TODAY,
            checkpointBatchSize: X402_CHECKPOINT_DEFAULT_BATCH,
            checkpointClockSeconds: 60,
            mode: 'channel-v1',
            scheme: 'x402',
            voucherVerifyPerSecond: 2_000_000,
        },
        { ...DEFAULT_DEMAND, channelLifetimeSeconds: 86_400, settlementClockSeconds: 60, users: 1_000_000 },
    );

    assert.equal(result.checkpointsPerSecond, 0);
    assert.equal(result.checkpointCostUnitsPerSecond, 0);
});

test('a non-divisible checkpoint cadence charges every checkpoint before the cash boundary', () => {
    const result = evaluateModel(
        {
            ...TODAY,
            checkpointBatchSize: X402_CHECKPOINT_DEFAULT_BATCH,
            checkpointClockSeconds: 120,
            mode: 'channel-v1',
            scheme: 'x402',
            voucherVerifyPerSecond: 2_000_000,
        },
        { ...DEFAULT_DEMAND, channelLifetimeSeconds: 86_400, settlementClockSeconds: 300, users: 1_000_000 },
    );

    // Checkpoints land at +120s and +240s; the +300s cash boundary applies the final voucher.
    closeTo(result.checkpointsPerSecond, (1_000_000 / 300) * 2);
});

test('precompile removal changes x402 packing, not the scheduler fit', () => {
    assert.equal(checkpointMaxBatch('x402', false, false), 5);
    assert.equal(checkpointMaxBatch('x402', false, true), 10);
    assert.equal(checkpointMaxBatch('x402', true, false), 16);
    assert.equal(checkpointMaxBatch('x402', true, true), 33);
    assert.equal(checkpointMaxBatch('mpp', true, true), 60);
});

test('today enforces one checkpoint per transaction even with stale batched input', () => {
    const inputs = {
        ...TODAY,
        checkpointBatchSize: MPP_CHECKPOINT_DEFAULT_BATCH,
        checkpointClockSeconds: 120,
        scheme: 'mpp' as const,
    };
    const result = evaluateModel(inputs, {
        ...DEFAULT_DEMAND,
        channelLifetimeSeconds: 86_400,
        settlementClockSeconds: 300,
        users: 1_000_000,
    });

    assert.equal(effectiveCheckpointBatchSize(inputs), 1);
    // MPP uses the finalized deployed settle sample until ADR-004 batching is available.
    assert.equal(result.checkpointCostPerChannelUnits, SETTLE_COST_UNITS);
    closeTo(result.checkpointTransactionsPerSecond, result.checkpointsPerSecond);
});

test('MPP verify savings are isolated on an equal on-chain base', () => {
    const demand = {
        ...DEFAULT_DEMAND,
        channelLifetimeSeconds: 604_800,
        settlementClockSeconds: 3_600,
        users: 1_000_000,
    };
    const base = {
        ...TODAY,
        checkpointClockSeconds: 0,
        mode: 'channel-v2' as const,
        voucherVerifyPerSecond: 1_000_000,
    };
    const mpp = evaluateModel({ ...base, checkpointBatchSize: MPP_CHECKPOINT_DEFAULT_BATCH, scheme: 'mpp' }, demand);
    const x402 = evaluateModel({ ...base, checkpointBatchSize: X402_CHECKPOINT_DEFAULT_BATCH, scheme: 'x402' }, demand);

    assert.equal(mpp.verifyComputeUsdPerYear, 0);
    closeTo(x402.verifyComputeUsdPerYear, 630_720);
    closeTo(mpp.requiredBudgetPerSecond, x402.requiredBudgetPerSecond);
});

test('combined presets are computed and distinguish today from long-term', () => {
    const demand = {
        ...DEFAULT_DEMAND,
        averageRequestsPerMinutePerUser: 60,
        channelLifetimeSeconds: 604_800,
        users: 10_000_000,
    };
    const today = resolvePresetShape(
        {
            ...TODAY,
            checkpointBatchSize: X402_CHECKPOINT_DEFAULT_BATCH,
            mode: 'channel-v1',
            scheme: 'x402',
            voucherVerifyPerSecond: 10_000_000,
        },
        demand,
        { cheapest: true, fastest: true },
    );
    const longTerm = resolvePresetShape(
        {
            ...TODAY,
            batchSettlementAvailable: true,
            checkpointBatchSize: MPP_CHECKPOINT_DEFAULT_BATCH,
            largeTx: true,
            mode: 'channel-v2',
            openCostUnits: 17_300,
            scheme: 'mpp',
            voucherSigFeeRemoved: true,
        },
        demand,
        { cheapest: true, fastest: true },
    );

    assert.ok(today.result.canHandleDemand);
    assert.ok(longTerm.result.canHandleDemand);
    assert.notDeepEqual(
        [today.settlementClockSeconds, today.checkpointClockSeconds],
        [longTerm.settlementClockSeconds, longTerm.checkpointClockSeconds],
    );
});

test('fastest improves enforceable finality without delaying the neutral cash sweep', () => {
    const demand = {
        ...DEFAULT_DEMAND,
        averageRequestsPerMinutePerUser: 60,
        channelLifetimeSeconds: 604_800,
        users: 1_000_000,
    };
    const inputs = {
        ...TODAY,
        checkpointBatchSize: X402_CHECKPOINT_DEFAULT_BATCH,
        mode: 'channel-v1' as const,
        scheme: 'x402' as const,
        voucherVerifyPerSecond: 1_000_000,
    };
    const neutral = resolvePresetShape(inputs, demand, { cheapest: false, fastest: false });
    const fastest = resolvePresetShape(inputs, demand, { cheapest: false, fastest: true });

    assert.equal(neutral.settlementClockSeconds, 300);
    assert.equal(fastest.settlementClockSeconds, neutral.settlementClockSeconds);
    assert.ok(fastest.result.enforceableFinalitySeconds < neutral.result.enforceableFinalitySeconds);
});
