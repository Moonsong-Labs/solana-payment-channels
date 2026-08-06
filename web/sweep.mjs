import { DEFAULT_PRESET_SELECTION, resolvePresetScenario } from './src/app-state.ts';
import { DEFAULT_DEMAND, evaluateModel, TODAY } from './src/model.ts';

const SCALES = {
    '1M': 1_000_000,
    '10M': 10_000_000,
};

function scenario(scale, horizon, cheapest, fastest) {
    return resolvePresetScenario(TODAY, DEFAULT_DEMAND, { cheapest, fastest, horizon, scale });
}

function line(label, state) {
    const result = evaluateModel(state.inputs, state.demand);
    return `${label.padEnd(9)} cash=${String(state.demand.settlementClockSeconds).padStart(5)}s checkpoint=${String(state.inputs.checkpointClockSeconds).padStart(5)}s finality=${String(result.settlementLatencySeconds.toFixed(0)).padStart(5)}s budget=${result.budgetSharePercent.toFixed(1).padStart(5)}% all-in=${result.allInTakeRateBps.toFixed(3)}bps opex=$${(result.totalOpexUsdPerYear / 1e6).toFixed(2)}M`;
}

for (const scale of Object.keys(SCALES)) {
    for (const horizon of ['today', 'longterm']) {
        console.log(`\n### ${scale} | ${horizon}`);
        console.log(line('neither', scenario(scale, horizon, false, false)));
        console.log(line('cheapest', scenario(scale, horizon, true, false)));
        console.log(line('fastest', scenario(scale, horizon, false, true)));
        console.log(line('both', scenario(scale, horizon, true, true)));
    }
}

console.log('\n=== Same-base MPP vs x402 ===');
for (const [scale, users] of Object.entries(SCALES)) {
    const longterm = resolvePresetScenario(TODAY, DEFAULT_DEMAND, {
        ...DEFAULT_PRESET_SELECTION,
        horizon: 'longterm',
        scale,
    });
    const demand = { ...longterm.demand, settlementClockSeconds: 3_600 };
    const base = {
        ...longterm.inputs,
        checkpointClockSeconds: 0,
        voucherSigFeeRemoved: false,
    };
    const mpp = evaluateModel({ ...base, checkpointBatchSize: 59, scheme: 'mpp' }, demand);
    const x402 = evaluateModel(
        {
            ...base,
            checkpointBatchSize: 16,
            scheme: 'x402',
            // This explicit same-throughput comparison provisions x402 verification for the
            // selected scale. UI scheme and preset events never rewrite the verification knob.
            voucherVerifyPerSecond: users,
        },
        demand,
    );
    console.log(
        `${scale}: MPP ${mpp.allInTakeRateBps.toFixed(3)}bps / x402 ${x402.allInTakeRateBps.toFixed(3)}bps; verify delta $${((x402.verifyComputeUsdPerYear - mpp.verifyComputeUsdPerYear) / 1e6).toFixed(2)}M/yr`,
    );
}
