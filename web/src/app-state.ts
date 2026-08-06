import {
    arrivingRequestsPerSecond,
    checkpointMaxBatch,
    DEFAULT_DEMAND,
    type DemandInputs,
    type ModelInputs,
    type ModelMode,
    MPP_CHECKPOINT_DEFAULT_BATCH,
    OPEN_COST_UNITS,
    resolvePresetShape,
    type SettlementScheme,
    SPL_TOKEN_TRANSFER_COST_UNITS,
    TARGET_PAYMENTS_PER_SECOND,
    TODAY,
    TOKEN_2022_TRANSFER_COST_UNITS,
    type TransferKind,
    X402_CHECKPOINT_DEFAULT_BATCH,
} from './model.ts';

export const USER_STEPS = [0, 1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000] as const;

export const SETTLEMENT_CLOCK_OPTIONS = [
    { label: 'Disabled', value: 0 },
    { label: '1s', value: 1 },
    { label: '2s', value: 2 },
    { label: '3s', value: 3 },
    { label: '4s', value: 4 },
    { label: '5s', value: 5 },
    { label: '10s', value: 10 },
    { label: '15s', value: 15 },
    { label: '30s', value: 30 },
    { label: '1m', value: 60 },
    { label: '2m', value: 120 },
    { label: '5m', value: 300 },
    { label: '10m', value: 600 },
    { label: '30m', value: 1_800 },
    { label: '1h', value: 3_600 },
    { label: '2h', value: 7_200 },
    { label: '3h', value: 10_800 },
    { label: '6h', value: 21_600 },
    { label: '12h', value: 43_200 },
    { label: '24h', value: 86_400 },
] as const;

export const CHANNEL_LIFETIME_OPTIONS = [
    { label: '5m', value: 300 },
    { label: '10m', value: 600 },
    { label: '30m', value: 1_800 },
    { label: '1h', value: 3_600 },
    { label: '12h', value: 43_200 },
    { label: '1d', value: 86_400 },
    { label: '2d', value: 172_800 },
    { label: '1w', value: 604_800 },
] as const;

type SimdParams = Pick<
    ModelInputs,
    | 'availableCapacityPercent'
    | 'blockCostUnits'
    | 'slotMs'
    | 'rentPerChannelSol'
    | 'openCostUnits'
    | 'voucherSigFeeRemoved'
    | 'largeTx'
>;

const BASELINE_SIMD_PARAMS: SimdParams = {
    availableCapacityPercent: 50,
    blockCostUnits: 100_000_000,
    largeTx: false,
    openCostUnits: OPEN_COST_UNITS,
    rentPerChannelSol: 0.00471192,
    slotMs: 400,
    voucherSigFeeRemoved: false,
};

export interface Simd {
    readonly id: string;
    readonly code: string;
    readonly href: string;
    readonly label: string;
    readonly status: string;
    readonly note: string;
    readonly warn?: boolean;
    readonly apply?: (params: SimdParams) => SimdParams;
}

export const SIMDS: readonly Simd[] = [
    {
        code: 'SIMD-0266',
        href: 'https://github.com/solana-program/token/tree/main/p-token',
        id: 'p-token',
        label: 'p-token',
        note: 'Shipped precedent: proposal to mainnet in ~13 months.',
        status: 'Shipped',
    },
    {
        apply: params => ({ ...params, openCostUnits: 17_300 }),
        code: 'SIMD-0567',
        href: 'https://github.com/solana-foundation/solana-improvement-documents/pull/567',
        id: 'p-ata',
        label: 'p-ATA',
        note: 'ATA Create 22.9k → 4.2k CU; channel open cost drops ~52%.',
        status: 'Review',
    },
    {
        apply: params => ({ ...params, voucherSigFeeRemoved: true }),
        code: 'SIMD-0568',
        href: 'https://github.com/solana-foundation/solana-improvement-documents/pull/568',
        id: 'precompile',
        label: 'Precompile removal',
        note: 'Cuts voucher fee 10k → 5k lamports; requires migration.',
        status: 'Review',
        warn: true,
    },
    {
        apply: params => ({ ...params, largeTx: true }),
        code: 'SIMD-0296 / 0385',
        href: 'https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0296-larger-transactions.md',
        id: 'large-tx',
        label: '4kB transactions',
        note: 'Lets x402 pack 5 → 16 settles per checkpoint.',
        status: 'Review',
    },
];

export type PresetScale = '1M' | '10M';
export type PresetHorizon = 'today' | 'longterm';

export interface PresetSelection {
    readonly cheapest: boolean;
    readonly fastest: boolean;
    readonly horizon: PresetHorizon;
    readonly scale: PresetScale;
}

export interface AppState {
    readonly activeSimds: readonly string[];
    readonly demand: DemandInputs;
    readonly inputs: ModelInputs;
    readonly preset: PresetSelection | null;
}

type UpdateInputAction = {
    [Key in keyof ModelInputs]: { readonly type: 'update-input'; readonly key: Key; readonly value: ModelInputs[Key] };
}[keyof ModelInputs];

type UpdateDemandAction = {
    [Key in keyof DemandInputs]: {
        readonly type: 'update-demand';
        readonly key: Key;
        readonly value: DemandInputs[Key];
    };
}[keyof DemandInputs];

export type AppAction =
    | UpdateInputAction
    | UpdateDemandAction
    | { readonly type: 'update-arriving-demand'; readonly key: ArrivingDemandKey; readonly value: number }
    | { readonly type: 'update-settlement-clock'; readonly value: number }
    | { readonly type: 'toggle-simd'; readonly id: string }
    | { readonly type: 'select-preset'; readonly patch: Partial<PresetSelection> }
    | { readonly type: 'toggle-preset-objective'; readonly objective: 'cheapest' | 'fastest' }
    | { readonly type: 'select-base'; readonly base: 'vanilla' | 'v1' | 'v2' }
    | { readonly type: 'select-scheme'; readonly scheme: 'x402' | 'mpp' }
    | { readonly type: 'select-transfer-kind'; readonly transferKind: TransferKind };

export const DEFAULT_PRESET_SELECTION: PresetSelection = {
    cheapest: false,
    fastest: false,
    horizon: 'today',
    scale: '1M',
};

const PRESET_SIMD_IDS: readonly string[] = ['p-ata', 'precompile', 'large-tx'];
const PRESET_USERS: Readonly<Record<PresetScale, number>> = { '10M': 10_000_000, '1M': 1_000_000 };
const PRESET_RAIL: Readonly<
    Record<
        PresetHorizon,
        { batchSettlementAvailable: boolean; mode: ModelMode; scheme: SettlementScheme; checkpointBatch: number }
    >
> = {
    longterm: {
        batchSettlementAvailable: true,
        checkpointBatch: MPP_CHECKPOINT_DEFAULT_BATCH,
        mode: 'channel-v2',
        scheme: 'mpp',
    },
    today: { batchSettlementAvailable: false, checkpointBatch: 1, mode: 'channel-v1', scheme: 'mpp' },
};

function normalizeInputs(inputs: ModelInputs): ModelInputs {
    const maximumBatch = inputs.batchSettlementAvailable
        ? checkpointMaxBatch(inputs.scheme, inputs.largeTx, inputs.voucherSigFeeRemoved)
        : 1;
    return {
        ...inputs,
        checkpointBatchSize: Math.max(1, Math.min(inputs.checkpointBatchSize, maximumBatch)),
    };
}

function simdParamsFor(ids: readonly string[]): SimdParams {
    return SIMDS.reduce<SimdParams>(
        (accumulated, simd) => (ids.includes(simd.id) && simd.apply ? simd.apply(accumulated) : accumulated),
        { ...BASELINE_SIMD_PARAMS },
    );
}

/** Resolve one complete preset through the same inputs and optimizer used by the UI reducer. */
export function resolvePresetScenario(
    baseInputs: ModelInputs,
    baseDemand: DemandInputs,
    selection: PresetSelection,
): Omit<AppState, 'preset'> {
    const rail = PRESET_RAIL[selection.horizon];
    const activeSimds = selection.horizon === 'longterm' ? PRESET_SIMD_IDS : [];
    const params = simdParamsFor(activeSimds);
    const demand: DemandInputs = {
        ...baseDemand,
        averageRequestsPerMinutePerUser: 60,
        channelLifetimeSeconds: 604_800,
        users: PRESET_USERS[selection.scale],
    };
    const inputs: ModelInputs = {
        ...baseInputs,
        ...params,
        batchSettlementAvailable: rail.batchSettlementAvailable,
        checkpointBatchSize: Math.min(
            rail.checkpointBatch,
            checkpointMaxBatch(rail.scheme, params.largeTx, params.voucherSigFeeRemoved),
        ),
        checkpointClockSeconds: 0,
        mode: rail.mode,
        reclaimBatchSize: 8,
        scheme: rail.scheme,
    };
    const normalizedInputs = normalizeInputs(inputs);
    const shape = resolvePresetShape(normalizedInputs, demand, selection);

    return {
        activeSimds,
        demand: { ...demand, settlementClockSeconds: shape.settlementClockSeconds },
        inputs: { ...normalizedInputs, checkpointClockSeconds: shape.checkpointClockSeconds },
    };
}

type ArrivingDemandKey = 'averageRequestsPerMinutePerUser' | 'users';

function clampArrivingDemand(previous: DemandInputs, key: ArrivingDemandKey, proposedValue: number): DemandInputs {
    const currentValue = previous[key];
    const candidate = { ...previous, [key]: proposedValue };
    const candidateRate = arrivingRequestsPerSecond(candidate);

    if (proposedValue <= currentValue || candidateRate <= TARGET_PAYMENTS_PER_SECOND) return candidate;
    if (key === 'users') {
        if (previous.averageRequestsPerMinutePerUser === 0) return candidate;
        const maximumUsers = Math.floor((TARGET_PAYMENTS_PER_SECOND * 60) / previous.averageRequestsPerMinutePerUser);
        const users = USER_STEPS.reduce(
            (closest, option) => (option <= Math.min(proposedValue, maximumUsers) ? option : closest),
            USER_STEPS[0],
        );
        return { ...previous, users };
    }
    if (previous.users === 0) return candidate;
    const maximumRequestsPerMinute = Math.floor((TARGET_PAYMENTS_PER_SECOND * 60) / previous.users);
    return {
        ...previous,
        averageRequestsPerMinutePerUser: Math.min(proposedValue, maximumRequestsPerMinute),
    };
}

const QUERY_TO_MODE: Readonly<Record<string, ModelMode>> = {
    v1: 'channel-v1',
    v2: 'channel-v2',
    vanilla: 'vanilla',
};
const QUERY_TO_SCHEME: Readonly<Record<string, SettlementScheme>> = { mpp: 'mpp', x402: 'x402' };

function nearestUserStep(value: number): number {
    return USER_STEPS.reduce(
        (best, step) => (Math.abs(step - value) < Math.abs(best - value) ? step : best),
        USER_STEPS[0],
    );
}

function readSharedParams(search: string): {
    readonly demand: Partial<DemandInputs>;
    readonly hasSharedParams: boolean;
    readonly mode?: ModelMode;
    readonly scheme?: SettlementScheme;
} {
    const demand: Partial<DemandInputs> = {};
    const params = new URLSearchParams(search);
    const users = Number(params.get('users'));
    if (params.has('users') && Number.isFinite(users)) demand.users = nearestUserStep(Math.max(0, users));
    const rpm = Number(params.get('rpm'));
    if (params.has('rpm') && Number.isFinite(rpm)) {
        demand.averageRequestsPerMinutePerUser = Math.min(500, Math.max(0, Math.round(rpm)));
    }
    const clock = Number(params.get('clock'));
    if (params.has('clock') && SETTLEMENT_CLOCK_OPTIONS.some(option => option.value === clock)) {
        demand.settlementClockSeconds = clock;
    }
    return {
        demand,
        hasSharedParams: params.size > 0,
        mode: QUERY_TO_MODE[params.get('method') ?? ''],
        scheme: QUERY_TO_SCHEME[params.get('scheme') ?? ''],
    };
}

/** Create one coherent initial state from the URL or the 1M/today default preset. */
export function createInitialState(search = ''): AppState {
    const shared = readSharedParams(search);
    const defaultScenario = resolvePresetScenario(TODAY, DEFAULT_DEMAND, DEFAULT_PRESET_SELECTION);
    if (!shared.hasSharedParams) return { ...defaultScenario, preset: DEFAULT_PRESET_SELECTION };

    const mode = shared.mode ?? TODAY.mode;
    const demand = { ...DEFAULT_DEMAND, ...shared.demand };
    const inputs: ModelInputs = {
        ...TODAY,
        ...(shared.mode ? { mode: shared.mode } : {}),
        ...(shared.scheme && mode !== 'vanilla' ? { scheme: shared.scheme } : {}),
    };
    const matchesDefaultPreset =
        demand.users === defaultScenario.demand.users &&
        demand.averageRequestsPerMinutePerUser === defaultScenario.demand.averageRequestsPerMinutePerUser &&
        demand.settlementClockSeconds === defaultScenario.demand.settlementClockSeconds &&
        inputs.mode === defaultScenario.inputs.mode &&
        inputs.scheme === defaultScenario.inputs.scheme;
    if (matchesDefaultPreset) return { ...defaultScenario, preset: DEFAULT_PRESET_SELECTION };
    return { activeSimds: [], demand, inputs, preset: null };
}

/** Apply every UI event as one atomic, deterministic state transition. */
export function appReducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'update-input':
            return {
                ...state,
                inputs: normalizeInputs({ ...state.inputs, [action.key]: action.value }),
                preset: null,
            };
        case 'update-demand':
            return { ...state, demand: { ...state.demand, [action.key]: action.value }, preset: null };
        case 'update-arriving-demand':
            return {
                ...state,
                demand: clampArrivingDemand(state.demand, action.key, action.value),
                preset: null,
            };
        case 'update-settlement-clock': {
            let channelLifetimeSeconds = state.demand.channelLifetimeSeconds;
            if (action.value > 0 && channelLifetimeSeconds < action.value) {
                channelLifetimeSeconds =
                    CHANNEL_LIFETIME_OPTIONS.find(option => option.value >= action.value)?.value ??
                    channelLifetimeSeconds;
            }
            return {
                ...state,
                demand: { ...state.demand, channelLifetimeSeconds, settlementClockSeconds: action.value },
                preset: null,
            };
        }
        case 'toggle-simd': {
            const activeSimds = state.activeSimds.includes(action.id)
                ? state.activeSimds.filter(id => id !== action.id)
                : [...state.activeSimds, action.id];
            const params = simdParamsFor(activeSimds);
            const merged = normalizeInputs({ ...state.inputs, ...params });
            return {
                ...state,
                activeSimds,
                inputs: merged,
                preset: null,
            };
        }
        case 'select-preset': {
            const preset = { ...(state.preset ?? DEFAULT_PRESET_SELECTION), ...action.patch };
            return { ...resolvePresetScenario(state.inputs, state.demand, preset), preset };
        }
        case 'toggle-preset-objective': {
            const current = state.preset ?? DEFAULT_PRESET_SELECTION;
            const preset = { ...current, [action.objective]: !current[action.objective] };
            return { ...resolvePresetScenario(state.inputs, state.demand, preset), preset };
        }
        case 'select-base': {
            const mode: ModelMode =
                action.base === 'vanilla' ? 'vanilla' : action.base === 'v1' ? 'channel-v1' : 'channel-v2';
            if (mode === state.inputs.mode) return state;
            const enteringChannel = mode !== 'vanilla' && state.inputs.mode === 'vanilla';
            const scheme: SettlementScheme =
                mode === 'vanilla' ? 'none' : enteringChannel ? 'mpp' : state.inputs.scheme;
            return {
                ...state,
                inputs: normalizeInputs({
                    ...state.inputs,
                    checkpointBatchSize: enteringChannel
                        ? MPP_CHECKPOINT_DEFAULT_BATCH
                        : state.inputs.checkpointBatchSize,
                    mode,
                    scheme,
                    transferCostUnits:
                        state.inputs.transferKind === 'spl-token'
                            ? SPL_TOKEN_TRANSFER_COST_UNITS
                            : TOKEN_2022_TRANSFER_COST_UNITS,
                }),
                preset: null,
            };
        }
        case 'select-scheme': {
            const scheme: SettlementScheme = state.inputs.scheme === action.scheme ? 'none' : action.scheme;
            const checkpointBatchSize =
                scheme === 'mpp'
                    ? MPP_CHECKPOINT_DEFAULT_BATCH
                    : scheme === 'x402'
                      ? X402_CHECKPOINT_DEFAULT_BATCH
                      : state.inputs.checkpointBatchSize;
            return {
                ...state,
                inputs: normalizeInputs({ ...state.inputs, checkpointBatchSize, scheme }),
                preset: null,
            };
        }
        case 'select-transfer-kind':
            return {
                ...state,
                inputs: {
                    ...state.inputs,
                    transferCostUnits:
                        action.transferKind === 'spl-token'
                            ? SPL_TOKEN_TRANSFER_COST_UNITS
                            : TOKEN_2022_TRANSFER_COST_UNITS,
                    transferKind: action.transferKind,
                },
                preset: null,
            };
    }
}
