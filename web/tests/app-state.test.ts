import assert from 'node:assert/strict';
import test from 'node:test';

import { appReducer, createInitialState, DEFAULT_PRESET_SELECTION } from '../src/app-state.ts';
import { evaluateModel } from '../src/model.ts';

test('default state is the resolved 1M available-today preset', () => {
    const state = createInitialState();

    assert.deepEqual(state.preset, DEFAULT_PRESET_SELECTION);
    assert.equal(state.demand.users, 1_000_000);
    assert.equal(state.demand.averageRequestsPerMinutePerUser, 60);
    assert.equal(state.demand.settlementClockSeconds, 300);
    assert.equal(state.inputs.mode, 'channel-v1');
    assert.equal(state.inputs.scheme, 'mpp');
    assert.equal(state.inputs.voucherVerifyPerSecond, 1_000_000);
    assert.equal(state.inputs.batchSettlementAvailable, false);
    assert.equal(state.inputs.checkpointBatchSize, 1);
    assert.deepEqual(state.activeSimds, []);
    assert.ok(evaluateModel(state.inputs, state.demand).canHandleDemand);
});

test('the canonical MPP default query reloads as selected while x402 links remain custom', () => {
    const canonical = createInitialState('?users=1000000&rpm=60&clock=300&method=v1');
    const canonicalMpp = createInitialState('?users=1000000&rpm=60&clock=300&method=v1&scheme=mpp');
    const x402 = createInitialState('?users=1000000&rpm=60&clock=300&method=v1&scheme=x402');
    const custom = createInitialState('?users=10000000&rpm=60&clock=3600&method=v1&scheme=x402');

    assert.deepEqual(canonical.preset, DEFAULT_PRESET_SELECTION);
    assert.equal(canonical.inputs.scheme, 'mpp');
    assert.deepEqual(canonicalMpp.preset, DEFAULT_PRESET_SELECTION);
    assert.equal(canonicalMpp.inputs.scheme, 'mpp');
    assert.equal(x402.preset, null);
    assert.equal(x402.inputs.scheme, 'x402');
    assert.equal(custom.preset, null);
});

test('selecting Available today restores MPP without changing verification capacity', () => {
    const sharedX402 = createInitialState('?users=1000000&rpm=60&clock=300&method=v1&scheme=x402');
    const state = appReducer(sharedX402, { patch: { horizon: 'today' }, type: 'select-preset' });

    assert.deepEqual(state.preset, DEFAULT_PRESET_SELECTION);
    assert.equal(state.inputs.mode, 'channel-v1');
    assert.equal(state.inputs.scheme, 'mpp');
    assert.equal(state.inputs.voucherVerifyPerSecond, 1_000_000);
    assert.equal(state.inputs.checkpointBatchSize, 1);
});

test('scheme and preset events preserve voucher verification capacity', () => {
    let state = createInitialState();
    state = appReducer(state, { scheme: 'x402', type: 'select-scheme' });
    assert.equal(state.inputs.scheme, 'x402');
    assert.equal(state.inputs.voucherVerifyPerSecond, 1_000_000);

    state = appReducer(state, { key: 'voucherVerifyPerSecond', type: 'update-input', value: 750_000 });
    state = appReducer(state, { scheme: 'mpp', type: 'select-scheme' });
    state = appReducer(state, { patch: { horizon: 'today', scale: '10M' }, type: 'select-preset' });
    assert.equal(state.inputs.scheme, 'mpp');
    assert.equal(state.inputs.voucherVerifyPerSecond, 750_000);

    state = appReducer(state, { base: 'vanilla', type: 'select-base' });
    state = appReducer(state, { base: 'v1', type: 'select-base' });
    assert.equal(state.inputs.scheme, 'mpp');
    assert.equal(state.inputs.voucherVerifyPerSecond, 750_000);
});

test('preset toggle sequence is atomic and objectives do not silently change the selected rail', () => {
    let state = createInitialState();
    state = appReducer(state, { objective: 'cheapest', type: 'toggle-preset-objective' });
    assert.equal(state.demand.settlementClockSeconds, 3_600);
    assert.equal(state.preset?.cheapest, true);

    state = appReducer(state, { objective: 'cheapest', type: 'toggle-preset-objective' });
    assert.equal(state.demand.settlementClockSeconds, 300);
    assert.equal(state.preset?.cheapest, false);

    state = appReducer(state, { objective: 'fastest', type: 'toggle-preset-objective' });
    const result = evaluateModel(state.inputs, state.demand);
    assert.equal(state.demand.settlementClockSeconds, 300);
    assert.equal(state.preset?.cheapest, false);
    assert.equal(state.preset?.fastest, true);
    assert.equal(state.inputs.scheme, 'mpp');
    assert.ok(state.inputs.checkpointClockSeconds > 0);
    assert.ok(result.enforceableFinalitySeconds < state.demand.settlementClockSeconds);
});

test('horizon switches change and restore the pinned economics summary', () => {
    const today = createInitialState();
    const longterm = appReducer(today, { patch: { horizon: 'longterm' }, type: 'select-preset' });
    const restored = appReducer(longterm, { patch: { horizon: 'today' }, type: 'select-preset' });
    const summary = (state: typeof today) => {
        const result = evaluateModel(state.inputs, state.demand);
        return {
            budgetSharePercent: result.budgetSharePercent,
            networkFeeUsdPerSecond: result.networkFeeUsdPerSecond,
            totalOpexUsdPerYear: result.totalOpexUsdPerYear,
        };
    };

    const todaySummary = summary(today);
    const longtermSummary = summary(longterm);
    assert.notEqual(longtermSummary.budgetSharePercent, todaySummary.budgetSharePercent);
    assert.notEqual(longtermSummary.networkFeeUsdPerSecond, todaySummary.networkFeeUsdPerSecond);
    assert.notEqual(longtermSummary.totalOpexUsdPerYear, todaySummary.totalOpexUsdPerYear);
    assert.deepEqual(summary(restored), todaySummary);
});

test('10M MPP cash cost curve separates fees from capital carry', () => {
    const base = appReducer(createInitialState(), {
        patch: { horizon: 'today', scale: '10M' },
        type: 'select-preset',
    });
    const atCashInterval = (seconds: number) => {
        let state = appReducer(base, { type: 'update-settlement-clock', value: seconds });
        state = appReducer(state, { key: 'checkpointClockSeconds', type: 'update-input', value: 0 });
        return evaluateModel(state.inputs, state.demand);
    };
    const fiveMinutes = atCashInterval(300);
    const oneHour = atCashInterval(3_600);
    const twoHours = atCashInterval(7_200);

    assert.ok(oneHour.feeUsdPerYear < fiveMinutes.feeUsdPerYear);
    assert.ok(oneHour.capitalCarryingCostUsdPerYear > fiveMinutes.capitalCarryingCostUsdPerYear);
    assert.ok(oneHour.totalOpexUsdPerYear < fiveMinutes.totalOpexUsdPerYear);
    assert.ok(twoHours.feeUsdPerYear < oneHour.feeUsdPerYear);
    assert.ok(twoHours.capitalCarryingCostUsdPerYear > oneHour.capitalCarryingCostUsdPerYear);
    assert.ok(twoHours.totalOpexUsdPerYear > oneHour.totalOpexUsdPerYear);
});

test('10M MPP checkpoints add fees without changing cash float', () => {
    let base = appReducer(createInitialState(), {
        patch: { horizon: 'today', scale: '10M' },
        type: 'select-preset',
    });
    base = appReducer(base, { type: 'update-settlement-clock', value: 3_600 });
    const atCheckpointInterval = (seconds: number) => {
        const state = appReducer(base, { key: 'checkpointClockSeconds', type: 'update-input', value: seconds });
        return evaluateModel(state.inputs, state.demand);
    };
    const disabled = atCheckpointInterval(0);
    const twoMinutes = atCheckpointInterval(120);
    const tenMinutes = atCheckpointInterval(600);

    assert.ok(twoMinutes.feeUsdPerYear > disabled.feeUsdPerYear);
    assert.ok(tenMinutes.feeUsdPerYear < twoMinutes.feeUsdPerYear);
    assert.equal(twoMinutes.escrowFloatUsd, disabled.escrowFloatUsd);
    assert.equal(tenMinutes.capitalCarryingCostUsdPerYear, disabled.capitalCarryingCostUsdPerYear);
});

test('manual edits clear the preset in the same transition', () => {
    const state = appReducer(createInitialState(), {
        key: 'averageTransactionValueUsd',
        type: 'update-demand',
        value: 0.1,
    });

    assert.equal(state.preset, null);
    assert.equal(state.demand.averageTransactionValueUsd, 0.1);
});

test('every preset combination is deterministic, fits, and respects its objective invariants', () => {
    for (const scale of ['1M', '10M'] as const) {
        for (const horizon of ['today', 'longterm'] as const) {
            const select = (cheapest: boolean, fastest: boolean) =>
                appReducer(createInitialState(), {
                    patch: { cheapest, fastest, horizon, scale },
                    type: 'select-preset',
                });
            const neutral = select(false, false);
            const cheapest = select(true, false);
            const fastest = select(false, true);
            const both = select(true, true);
            const neutralResult = evaluateModel(neutral.inputs, neutral.demand);
            const cheapestResult = evaluateModel(cheapest.inputs, cheapest.demand);
            const fastestResult = evaluateModel(fastest.inputs, fastest.demand);
            const bothResult = evaluateModel(both.inputs, both.demand);

            for (const state of [neutral, cheapest, fastest, both]) {
                assert.equal(state.inputs.batchSettlementAvailable, horizon === 'longterm');
                if (horizon === 'today') assert.equal(state.inputs.checkpointBatchSize, 1);
                assert.equal(state.inputs.scheme, 'mpp');
                assert.equal(state.inputs.voucherVerifyPerSecond, 1_000_000);
            }

            for (const result of [neutralResult, cheapestResult, fastestResult, bothResult]) {
                assert.ok(result.canHandleDemand, `${scale}/${horizon} preset must fit`);
            }
            assert.ok(cheapestResult.totalOpexUsdPerYear <= neutralResult.totalOpexUsdPerYear);
            assert.ok(fastest.demand.settlementClockSeconds <= neutral.demand.settlementClockSeconds);
            assert.ok(fastestResult.enforceableFinalitySeconds <= neutralResult.enforceableFinalitySeconds);
            assert.ok(bothResult.totalOpexUsdPerYear <= fastestResult.totalOpexUsdPerYear);
            assert.ok(bothResult.enforceableFinalitySeconds <= cheapestResult.enforceableFinalitySeconds);
        }
    }
});
