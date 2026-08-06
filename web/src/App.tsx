import { useEffect, useId, useReducer } from 'react';

import {
    appReducer,
    CHANNEL_LIFETIME_OPTIONS,
    createInitialState,
    type PresetSelection,
    SETTLEMENT_CLOCK_OPTIONS,
    SIMDS,
    USER_STEPS,
} from './app-state';
import {
    BASE_FEE_LAMPORTS_PER_SIGNATURE,
    checkpointCostPerChannel,
    checkpointMaxBatch,
    effectiveCheckpointBatchSize,
    evaluateModel,
    INTERIM_DISTRIBUTE_COST_UNITS,
    type ModelMode,
    MPP_CHECKPOINT_MAX_BATCH,
    REARM_COST_UNITS,
    requiresPerPaymentVerify,
    SECONDS_PER_DAY,
    SECONDS_PER_YEAR,
    SESSION_BOUNDARY_V2_COST_UNITS,
    SETTLE_COST_UNITS,
    type SettlementScheme,
    TOP_UP_COST_UNITS,
    type TransferKind,
    X402_CHECKPOINT_DEFAULT_BATCH,
} from './model';

// The settlement selector is a two-tier "stack": a base rail (vanilla / channel v1 / channel v2) and,
// for channels, an independent settlement scheme (x402 client-signed, or MPP operator-signed). The two are
// ORTHOGONAL — a scheme rides whichever base is selected (v1 or v2), it does not change the base. `mode`
// carries the base only; `scheme` carries the voucher plane.
type BaseMethod = 'vanilla' | 'v1' | 'v2';

interface RangeKnobProps {
    readonly disabled?: boolean;
    readonly format?: (value: number) => string;
    readonly help: string;
    readonly label: string;
    readonly max: number;
    readonly min: number;
    readonly onChange: (value: number) => void;
    readonly step: number;
    readonly value: number;
}

interface DiscreteRangeKnobProps {
    readonly disabled?: boolean;
    readonly format?: (value: number) => string;
    readonly help: string;
    readonly label: string;
    readonly onChange: (value: number) => void;
    readonly options: readonly number[];
    readonly value: number;
}

interface SelectKnobProps {
    readonly disabled?: boolean;
    readonly help: string;
    readonly label: string;
    readonly onChange: (value: number) => void;
    readonly options: readonly { label: string; value: number }[];
    readonly value: number;
}

const SECONDS_PER_MONTH = 2_592_000; // 30 days
const MODE_LABELS: Readonly<Record<ModelMode, string>> = {
    'channel-v1': 'Payment channel v1',
    'channel-v2': 'Payment channel v2',
    vanilla: 'Vanilla transfer',
};
const SCHEME_LABELS: Readonly<Record<SettlementScheme, string>> = {
    mpp: 'MPP',
    none: '',
    x402: 'x402',
};
/** Composed label for the selected stack, e.g. "Payment channel v2 · MPP". */
function settlementLabel(mode: ModelMode, scheme: SettlementScheme): string {
    const base = MODE_LABELS[mode];
    return scheme === 'none' ? base : `${base} · ${SCHEME_LABELS[scheme]}`;
}

const BASE_METHODS: readonly { id: BaseMethod; label: string; sub: string }[] = [
    { id: 'vanilla', label: 'Vanilla transfer', sub: 'one on-chain tx / payment' },
    { id: 'v1', label: 'Payment channel v1', sub: 'Deployed · persistent OPEN channels' },
    { id: 'v2', label: 'Payment channel v2', sub: '• Recyclable channels\n• Operated voucher compaction' },
];
function baseMethodOf(mode: ModelMode): BaseMethod {
    if (mode === 'vanilla') return 'vanilla';
    if (mode === 'channel-v1') return 'v1';
    return 'v2';
}

function usesRearm(mode: ModelMode): boolean {
    return mode === 'channel-v2';
}
function formatCompact(value: number, decimals = 1): string {
    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: decimals,
        notation: 'compact',
    }).format(value);
}

function formatInteger(value: number): string {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number): string {
    return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function formatTakeRate(bps: number): string {
    if (!Number.isFinite(bps)) return '—';
    if (bps >= 1_000) return `${formatCompact(bps / 100, 1)}% of value`;

    return `${bps >= 100 ? bps.toFixed(0) : bps.toFixed(1)} bps`;
}

function formatUsd(value: number): string {
    if (value < 0.01) return `$${value.toFixed(3)}`;

    return new Intl.NumberFormat('en-US', {
        currency: 'USD',
        maximumFractionDigits: 2,
        notation: value >= 1_000 ? 'compact' : 'standard',
        style: 'currency',
    }).format(value);
}

function formatUsdPerPayment(value: number): string {
    if (value <= 0) return '$0';
    if (value >= 0.01) return formatUsd(value);

    const decimals = Math.min(8, Math.max(3, Math.ceil(-Math.log10(value)) + 2));
    return `$${value.toFixed(decimals)}`;
}

function RangeKnob({
    disabled = false,
    format = formatInteger,
    help,
    label,
    max,
    min,
    onChange,
    step,
    value,
}: RangeKnobProps) {
    const id = useId();

    return (
        <div className="knob" style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
            <div className="knob-heading">
                <label htmlFor={`${id}-range`}>{label}</label>
                <input
                    aria-label={`${label} exact value`}
                    className="number-input"
                    disabled={disabled}
                    max={max}
                    min={min}
                    onChange={event => onChange(Number(event.target.value))}
                    step={step}
                    type="number"
                    value={value}
                />
            </div>
            <input
                disabled={disabled}
                id={`${id}-range`}
                max={max}
                min={min}
                onChange={event => onChange(Number(event.target.value))}
                step={step}
                type="range"
                value={value}
            />
            <div className="knob-meta">
                <span>{help}</span>
                <strong>{format(value)}</strong>
            </div>
        </div>
    );
}

function DiscreteRangeKnob({
    disabled = false,
    format = formatInteger,
    help,
    label,
    onChange,
    options,
    value,
}: DiscreteRangeKnobProps) {
    const id = useId();
    const selectedIndex = Math.max(0, options.indexOf(value));

    return (
        <div className="knob" style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
            <div className="knob-heading">
                <label htmlFor={`${id}-range`}>{label}</label>
                <output htmlFor={`${id}-range`}>{format(value)}</output>
            </div>
            <input
                disabled={disabled}
                id={`${id}-range`}
                max={options.length - 1}
                min={0}
                onChange={event => onChange(options[Number(event.target.value)] ?? options[0])}
                step={1}
                type="range"
                value={selectedIndex}
            />
            <div className="knob-meta">
                <span>{help}</span>
                <strong>{format(value)}</strong>
            </div>
        </div>
    );
}

function SelectKnob({ disabled = false, help, label, onChange, options, value }: SelectKnobProps) {
    const id = useId();

    return (
        <div
            className="knob select-knob"
            style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}
        >
            <label htmlFor={id}>{label}</label>
            <select disabled={disabled} id={id} onChange={event => onChange(Number(event.target.value))} value={value}>
                {options.map(option => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            <div className="knob-meta">
                <span>{help}</span>
                <strong>{options.find(option => option.value === value)?.label}</strong>
            </div>
        </div>
    );
}

/** Interactive capacity model backed by the report's measured scheduler costs. */
const MODE_TO_QUERY: Readonly<Record<ModelMode, string>> = {
    'channel-v1': 'v1',
    'channel-v2': 'v2',
    vanilla: 'vanilla',
};

export function App() {
    const [state, dispatch] = useReducer(
        appReducer,
        typeof window === 'undefined' ? '' : window.location.search,
        createInitialState,
    );
    const { activeSimds, demand, inputs, preset } = state;

    // Mirror the four shareable knobs into the URL query so any configuration is linkable.
    // Debounced + guarded: dragging a range slider fires an `input` event per pixel, so a single
    // drag can push dozens of updates/second. Browsers rate-limit history.replaceState (Safari
    // ~100/30s, Firefox ~50/10s) and throw a SecurityError past the cap — which, thrown from an
    // effect with no error boundary, unmounts the whole tree and blanks the page. Debouncing
    // collapses a drag into one write when the user pauses; the try/catch is a belt-and-suspenders
    // guard so a throttle error can never crash the app.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handle = window.setTimeout(() => {
            const params = new URLSearchParams();
            params.set('users', String(demand.users));
            params.set('rpm', String(demand.averageRequestsPerMinutePerUser));
            params.set('clock', String(demand.settlementClockSeconds));
            params.set('method', MODE_TO_QUERY[inputs.mode]);
            if (inputs.scheme !== 'none') params.set('scheme', inputs.scheme);
            try {
                window.history.replaceState(
                    null,
                    '',
                    `${window.location.pathname}?${params.toString()}${window.location.hash}`,
                );
            } catch {
                // Browser history rate-limit hit during rapid drags. Safe to skip — the URL
                // resyncs on the next settled change.
            }
        }, 200);
        return () => window.clearTimeout(handle);
    }, [demand, inputs.mode, inputs.scheme]);

    const isChannel = inputs.mode !== 'vanilla';
    const perPaymentVerify = requiresPerPaymentVerify(inputs.mode, inputs.scheme);
    const {
        allInTakeRateBps,
        availableBudgetPerSecond,
        bindingConstraint,
        blocksPerSecond,
        budgetSharePercent,
        canHandleDemand,
        capitalCarryingCostUsdPerYear,
        channelBuildsPerSecond,
        channelLifeSeconds,
        checkpointBudgetSharePercent,
        checkpointCostPerChannelUnits,
        checkpointCostUnitsPerSecond,
        checkpointTransactionsPerSecond,
        checkpointsEnabled,
        checkpointsPerSecond,
        costPerLifecycle,
        costPerLogicalPayment,
        droppedRequestsPerSecond,
        escrowFloatUsd,
        feeTakeRateBps,
        feeUsdPerYear,
        grossValuePerSecondUsd,
        checkpointingAvailable,
        liveChannels,
        logicalRequestsPerSecond,
        maximumPaymentsPerSecond,
        networkFeeMultiplier,
        networkFeeSavingsUsdPerDay,
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
        requiredBudgetPerSecond,
        requestsPerSettlement,
        sessionsPerChannel,
        settlementClockEnabled,
        settlementLatencySeconds,
        settlementWindowSeconds,
        settlementsPerSecond,
        sustainableCeiling,
        totalOpexUsdPerYear,
        vanillaFeeTakeRateBps,
        vanillaNetworkFeeUsdPerSecond,
        voucherVerifiesPerSecond,
        voucherVerifyCeiling,
        voucherVerifySharePercent,
        verifyComputeUsdPerSecond,
        verifyComputeUsdPerYear,
        windowDrainSeconds,
        workingCapitalUsd,
    } = evaluateModel(inputs, demand);
    const effectiveCheckpointBatch = effectiveCheckpointBatchSize(inputs);
    const checkpointBatchMaximum = inputs.batchSettlementAvailable
        ? checkpointMaxBatch(inputs.scheme, inputs.largeTx, inputs.voucherSigFeeRemoved)
        : 1;
    const cashBoundaryCostUnits =
        inputs.mode === 'channel-v1'
            ? SETTLE_COST_UNITS + INTERIM_DISTRIBUTE_COST_UNITS + TOP_UP_COST_UNITS
            : SESSION_BOUNDARY_V2_COST_UNITS;
    const channelLifetimeOptions = settlementClockEnabled
        ? CHANNEL_LIFETIME_OPTIONS.filter(option => option.value >= demand.settlementClockSeconds)
        : CHANNEL_LIFETIME_OPTIONS;

    const choosePreset = (patch: Partial<PresetSelection>) => {
        dispatch({ patch, type: 'select-preset' });
    };

    const activeBaseMethod = baseMethodOf(inputs.mode);
    const activeScheme = inputs.scheme;
    const pinnedHorizon =
        preset?.horizon === 'longterm' ? 'Long-term' : preset?.horizon === 'today' ? 'Today' : 'Custom';
    // The sticky bar is a composited layer in browsers. Remount it when the preset rail changes so
    // its painted text cannot lag behind the already-updated reducer/model state.
    const pinnedScenarioKey = `${pinnedHorizon}:${inputs.mode}:${inputs.scheme}:${activeSimds.join(',')}`;

    const selectBaseMethod = (base: BaseMethod) => {
        dispatch({ base, type: 'select-base' });
    };
    const selectScheme = (scheme: 'x402' | 'mpp') => {
        dispatch({ scheme, type: 'select-scheme' });
    };

    const selectTransferKind = (transferKind: TransferKind) => {
        dispatch({ transferKind, type: 'select-transfer-kind' });
    };

    return (
        <main className="app-shell">
            <header className="hero">
                <div>
                    <p className="eyebrow">
                        <a
                            href="https://github.com/solana-foundation/payment-channels"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'white', textDecoration: 'none' }}
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="white"
                                style={{ display: 'inline-block', marginRight: '6px', verticalAlign: 'text-bottom' }}
                            >
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v 3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                            </svg>
                            SOLANA-FOUNDATION/PAYMENT-CHANNELS
                        </a>
                    </p>
                    <h1>
                        Roadmap to <span>10M payments / sec</span>
                    </h1>
                    <p className="lede">
                        Agentic payment volume is about to explode — and Solana is all-in on absorbing it. Model the
                        demand, pick a rail, and pressure-test the path to 10M requests per second. Every number is an
                        editable planning ceiling.
                    </p>
                </div>
                <div className="target-chip">
                    <span>Target</span>
                    <strong>10,000,000</strong>
                    <small>logical requests / second</small>
                </div>
            </header>

            <section aria-label="Scenario presets" className="panel preset-panel">
                <div className="preset-groups">
                    <div className="preset-group">
                        <span className="preset-group-label">Scale</span>
                        <div className="preset-pills" role="group" aria-label="Target scale">
                            {(['1M', '10M'] as const).map(scale => (
                                <button
                                    aria-pressed={preset?.scale === scale}
                                    className={preset?.scale === scale ? 'active' : ''}
                                    key={scale}
                                    onClick={() => choosePreset({ scale })}
                                    type="button"
                                >
                                    {scale} / s
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="preset-group">
                        <span className="preset-group-label">Horizon</span>
                        <div className="preset-pills" role="group" aria-label="Upgrade horizon">
                            {(
                                [
                                    ['today', 'Available today'],
                                    ['longterm', 'Long-term'],
                                ] as const
                            ).map(([horizon, label]) => (
                                <button
                                    aria-pressed={preset?.horizon === horizon}
                                    className={preset?.horizon === horizon ? 'active' : ''}
                                    key={horizon}
                                    onClick={() => choosePreset({ horizon })}
                                    type="button"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="preset-group">
                        <span className="preset-group-label">Optimize</span>
                        <div className="preset-pills" role="group" aria-label="Optimization goal">
                            <button
                                aria-pressed={!!preset?.cheapest}
                                className={preset?.cheapest ? 'active' : ''}
                                onClick={() => dispatch({ objective: 'cheapest', type: 'toggle-preset-objective' })}
                                type="button"
                            >
                                Cheapest
                            </button>
                            <button
                                aria-pressed={!!preset?.fastest}
                                className={preset?.fastest ? 'active' : ''}
                                onClick={() => dispatch({ objective: 'fastest', type: 'toggle-preset-objective' })}
                                type="button"
                            >
                                Fastest
                            </button>
                        </div>
                    </div>
                </div>
                {preset && (
                    <span className={`preset-verdict ${canHandleDemand ? 'pass' : 'over'}`}>
                        {settlementLabel(inputs.mode, inputs.scheme)} · {formatCompact(logicalRequestsPerSecond, 0)}{' '}
                        req/s · {formatCompact(settlementLatencySeconds, 0)}s finality ·{' '}
                        {formatPercent(budgetSharePercent)} budget · {formatTakeRate(allInTakeRateBps)} all-in
                    </span>
                )}
            </section>

            <section aria-labelledby="timeline-title" className="panel timeline-panel">
                <div className="section-heading">
                    <div>
                        <p className="section-index">01</p>
                        <h2 id="timeline-title">Relevant Upgrade timeline</h2>
                    </div>
                </div>
                <div className="simd-grid">
                    {SIMDS.map(simd => {
                        const on = activeSimds.includes(simd.id);
                        const isToggle = simd.apply !== undefined;
                        return (
                            <div
                                className={`simd-card ${on ? 'simd-on' : ''} ${simd.warn ? 'simd-warn' : ''}`}
                                key={simd.id}
                            >
                                <span className="simd-card-top">
                                    {isToggle ? (
                                        <input
                                            aria-label={`Toggle ${simd.label}`}
                                            checked={on}
                                            onChange={() => dispatch({ id: simd.id, type: 'toggle-simd' })}
                                            type="checkbox"
                                        />
                                    ) : (
                                        <span aria-label="Shipped" className="simd-shipped" role="img">
                                            ✓
                                        </span>
                                    )}
                                    <span className="simd-code">{simd.code}</span>
                                    <span className="simd-status">{simd.status}</span>
                                </span>
                                <strong>{simd.label}</strong>
                                <small>
                                    {simd.note}{' '}
                                    <a href={simd.href} rel="noopener noreferrer" target="_blank">
                                        Details ↗
                                    </a>
                                </small>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section aria-labelledby="progress-title" className="panel progress-panel">
                <div className="progress-heading">
                    <div>
                        <p className="section-index">02</p>
                        <h2 id="progress-title">Demand to 10M</h2>
                    </div>
                    <div className="progress-number">
                        <strong>{formatInteger(logicalRequestsPerSecond)}</strong>
                        <span>/ 10,000,000 requests/s</span>
                    </div>
                </div>
                <div className="demand-controls">
                    <DiscreteRangeKnob
                        format={formatCompact}
                        help="Concurrent users or agents making paid requests"
                        label="Payers (users / agents)"
                        onChange={value => dispatch({ key: 'users', type: 'update-arriving-demand', value })}
                        options={USER_STEPS}
                        value={demand.users}
                    />
                    <RangeKnob
                        format={value => `${formatInteger(value)} RPM`}
                        help="Average paid requests per minute per payer"
                        label="Avg RPM/payer"
                        max={500}
                        min={0}
                        onChange={value =>
                            dispatch({ key: 'averageRequestsPerMinutePerUser', type: 'update-arriving-demand', value })
                        }
                        step={1}
                        value={demand.averageRequestsPerMinutePerUser}
                    />
                    <SelectKnob
                        disabled={inputs.mode === 'vanilla'}
                        help="Longer intervals reduce on-chain sweep fees, but tie up more refundable escrow and increase its carrying cost. Disabled waits for terminal close."
                        label="Cash settlement interval"
                        onChange={value => dispatch({ type: 'update-settlement-clock', value })}
                        options={SETTLEMENT_CLOCK_OPTIONS}
                        value={demand.settlementClockSeconds}
                    />
                </div>
                <div className="settlement-method-heading">
                    <strong>Settlement stack</strong>
                    <span>Pick a base rail, then optionally a settlement scheme on top.</span>
                </div>
                <div className="settlement-stack">
                    <div
                        aria-label="Base settlement rail"
                        className="mode-switch progress-mode-switch stack-base"
                        role="group"
                    >
                        {BASE_METHODS.map(base => (
                            <button
                                aria-pressed={activeBaseMethod === base.id}
                                className={activeBaseMethod === base.id ? 'active' : ''}
                                key={base.id}
                                onClick={() => selectBaseMethod(base.id)}
                                type="button"
                            >
                                <span>{base.label}</span>
                                <small>{base.sub}</small>
                            </button>
                        ))}
                    </div>
                    <div
                        aria-label="Settlement scheme"
                        className={`mode-switch progress-mode-switch stack-scheme ${activeBaseMethod === 'vanilla' ? 'stack-scheme-disabled' : ''}`}
                        role="group"
                    >
                        <button
                            aria-pressed={activeScheme === 'x402'}
                            className={activeScheme === 'x402' ? 'active' : ''}
                            disabled={activeBaseMethod === 'vanilla'}
                            onClick={() => selectScheme('x402')}
                            type="button"
                        >
                            <span>x402</span>
                            <small>batch-settlement, client signed.</small>
                        </button>
                        <button
                            aria-pressed={activeScheme === 'mpp'}
                            className={activeScheme === 'mpp' ? 'active' : ''}
                            disabled={activeBaseMethod === 'vanilla'}
                            onClick={() => selectScheme('mpp')}
                            type="button"
                        >
                            <span>MPP</span>
                            <small>
                                <strong>sessions</strong>, operator signed
                            </small>
                        </button>
                    </div>
                </div>
                <div className="progress-scale">
                    <span>0</span>
                    <strong>
                        {droppedRequestsPerSecond > 0
                            ? `${formatCompact(droppedRequestsPerSecond, 2)} req/s dropped`
                            : 'Fully processed'}
                    </strong>
                    <span>10M</span>
                </div>
                <div
                    aria-label={`${formatInteger(logicalRequestsPerSecond)} requests per second arriving, ${formatInteger(processedRequestsPerSecond)} sustained on-chain, toward ten million`}
                    className="dual-progress"
                    role="img"
                >
                    <div className="dual-progress-arriving" style={{ width: `${progressPercent}%` }} />
                    <div className="dual-progress-processed" style={{ width: `${processedPercent}%` }} />
                </div>
                <div className="progress-legend">
                    <span className="legend-processed">
                        <i />
                        Processed {formatCompact(processedRequestsPerSecond, 2)} req/s (
                        {formatPercent(processedPercent)})
                    </span>
                    <span className="legend-arriving">
                        <i />
                        Arriving {formatCompact(logicalRequestsPerSecond, 2)} req/s ({formatPercent(progressPercent)})
                    </span>
                </div>
                <div className="capacity-equation">
                    <span>Logical demand</span>
                    <strong>
                        {formatCompact(demand.users, 2)} payers ×{' '}
                        {formatInteger(demand.averageRequestsPerMinutePerUser)} paid req/payer/min ÷ 60 ={' '}
                        {formatCompact(logicalRequestsPerSecond, 2)} req/s
                    </strong>
                    <small>
                        {isChannel
                            ? settlementClockEnabled
                                ? `A ${formatCompact(demand.settlementClockSeconds, 2)}s cash window carries ${formatCompact(requestsPerSettlement, 2)} payments/channel. The same channel remains OPEN for ${formatCompact(channelLifeSeconds, 2)}s and carries ${formatCompact(paymentsPerChannel, 2)} payments before one ${formatInteger(costPerLifecycle)}-unit terminal lifecycle; all selected planes amortize to ${formatCompact(costPerLogicalPayment, 2)} units/payment.`
                                : `Cash sweeps disabled: vouchers accumulate until the ${formatCompact(channelLifeSeconds, 2)}s terminal channel close. The full lifecycle amortizes across ${formatCompact(paymentsPerChannel, 2)} payments/channel.`
                            : 'Vanilla always sends one token transfer per request; the settlement clock applies only to payment channels.'}
                    </small>
                </div>
                <div className="capacity-equation">
                    <span>Execution capacity</span>
                    <strong>
                        {formatCompact(inputs.blockCostUnits, 2)} CU/block × {blocksPerSecond.toFixed(1)} blocks/s ={' '}
                        {formatCompact(nominalBudgetPerSecond, 2)} CU/s
                    </strong>
                    <small>
                        {formatPercent(inputs.availableCapacityPercent)} is available to this workload, giving an{' '}
                        {formatCompact(maximumPaymentsPerSecond, 2)} req/s equivalent ceiling at this traffic shape
                        {isChannel ? ` at ${formatInteger(paymentsPerChannel)} payments/channel` : ''}.
                    </small>
                </div>
                {isChannel && perPaymentVerify && (
                    <div className="capacity-equation">
                        <span>Voucher plane</span>
                        <strong>{formatCompact(voucherVerifyCeiling, 2)} Ed25519 verifications/s</strong>
                        <small>
                            Client-signed: each logical payment is one voucher the session service verifies off-chain.
                            This caps sustained requests independently of the on-chain budget, and does not move with
                            settlement batching or payments/channel — so with heavy on-chain amortization it becomes the
                            binding limit. Sustained throughput = {formatCompact(sustainableCeiling, 2)} req/s (min of
                            the two ceilings).
                        </small>
                    </div>
                )}
                {inputs.scheme === 'mpp' && (
                    <div className="capacity-equation">
                        <span>Voucher plane</span>
                        <strong>
                            operator-signed — no per-payment verify
                            <span
                                className="trust-badge"
                                title="The operator signs cumulative vouchers itself; a payer's on-chain protection is the escrow deposit cap plus off-chain dispute, not a per-payment signature."
                            >
                                custodial metering · deposit-bounded
                            </span>
                        </strong>
                        <small>
                            MPP operator-signed mode (mpp-specs #309): the operator holds the channel&rsquo;s
                            authorizedSigner and signs the cumulative voucher itself, so there is no client Ed25519 to
                            verify per request. Per-request auth is a reusable bearer proof (a cheap symmetric check),
                            and the operator signs just one voucher per settlement (~
                            {formatCompact(settlementsPerSecond, 2)}/s). The off-chain Ed25519 fleet no longer binds —
                            the ceiling reverts to the on-chain budget. Trade-off: the client trusts the
                            operator&rsquo;s metering, bounded by the escrow deposit (the operator can sign any
                            cumulative amount up to <code>deposit</code>), rather than authorizing each increment with
                            its own signature.
                        </small>
                    </div>
                )}
                {checkpointsEnabled && (
                    <div className="capacity-equation">
                        <span>Enforceability checkpoints</span>
                        <strong>
                            {formatCompact(checkpointsPerSecond, 2)} settles/s ×{' '}
                            {formatInteger(checkpointCostPerChannelUnits)} CU ={' '}
                            {formatCompact(checkpointCostUnitsPerSecond, 2)} CU/s (
                            {formatPercent(checkpointBudgetSharePercent)} of budget)
                        </strong>
                        <small>
                            {!inputs.batchSettlementAvailable
                                ? 'Batch settlement is not available in this horizon: each checkpoint is one channel per transaction. Boundary-aligned checkpoints are not charged twice.'
                                : inputs.scheme === 'mpp'
                                  ? `One operator signer means ADR-004 batches ${formatInteger(effectiveCheckpointBatch)} distinct customers into a single signed settle (n ≤ ${MPP_CHECKPOINT_MAX_BATCH}, account-bound), so each checkpoint is ~${formatInteger(checkpointCostPerChannel('mpp', effectiveCheckpointBatch))} CU/channel versus ~${formatInteger(checkpointCostPerChannel('x402', X402_CHECKPOINT_DEFAULT_BATCH))} for client-signed. Boundary-aligned checkpoints are not charged twice.`
                                  : `Client-signed vouchers use packed [Ed25519, settle] pairs, ${formatInteger(effectiveCheckpointBatch)}/tx (current selected cap ${checkpointBatchMaximum}). Distinct customer signers prevent ADR-004 aggregation. Boundary-aligned checkpoints are not charged twice.`}
                        </small>
                    </div>
                )}
                {isChannel && (
                    <div className="capacity-equation">
                        <span>Settlement reckoning</span>
                        <strong>
                            {formatCompact(physicalTransactionsPerSecond, 2)} on-chain tx/s · settle latency ≈{' '}
                            {formatCompact(settlementLatencySeconds, 2)}s
                        </strong>
                        <small>
                            {onChainBacklogFactor > 1.05 ? (
                                <>
                                    Backlog: at the offered {formatCompact(logicalRequestsPerSecond, 2)} req/s the chain
                                    requires {formatCompact(onChainBacklogFactor, 2)}× the available budget. One{' '}
                                    {formatCompact(settlementWindowSeconds, 2)}s cash window generates{' '}
                                    {formatCompact(onChainTxPerWindow, 2)} settlement transactions that take{' '}
                                    {formatCompact(windowDrainSeconds, 2)}s of chain-time to land.
                                    <br />
                                    ⚠️ the queue grows without bound, so this rate is not actually settleable.
                                </>
                            ) : checkpointsEnabled ? (
                                `Enforceable within ${formatCompact(settlementLatencySeconds, 2)}s: interim checkpoints make accrued value claimable on-chain at the ${formatCompact(inputs.checkpointClockSeconds, 2)}s checkpoint cadence, ahead of the ${formatCompact(settlementWindowSeconds, 2)}s OPEN-state cash boundary. One cash window generates ${formatCompact(onChainTxPerWindow, 2)} transactions.`
                            ) : (
                                `Settlements clear within the cash window: a payment becomes enforceable on-chain within ${formatCompact(settlementLatencySeconds, 2)}s. One cash window generates ${formatCompact(onChainTxPerWindow, 2)} transactions.`
                            )}
                        </small>
                    </div>
                )}
                <div className={`verdict ${canHandleDemand ? 'pass' : ''}`}>
                    <strong>
                        {canHandleDemand
                            ? `${formatCompact(logicalRequestsPerSecond, 2)} req/s fits`
                            : `${formatCompact(logicalRequestsPerSecond / Math.max(sustainableCeiling, 1), 2)}× over the ${bindingConstraint}`}
                    </strong>
                    <span>
                        On-chain uses {formatPercent(budgetSharePercent)} of the available scheduler budget
                        {perPaymentVerify
                            ? `; off-chain uses ${formatPercent(voucherVerifySharePercent)} of the ${formatCompact(voucherVerifyCeiling, 2)} vouchers/s Ed25519 budget`
                            : inputs.scheme === 'mpp'
                              ? '; off-chain has no per-payment verification (operator-signed)'
                              : ''}
                        .
                    </span>
                </div>
            </section>

            <section aria-labelledby="assumptions-title" className="panel controls-panel">
                <div className="section-heading">
                    <div>
                        <p className="section-index">03</p>
                        <h2 id="assumptions-title">Model assumptions</h2>
                    </div>
                    <p>Controls for the selected settlement method.</p>
                </div>

                <div className={`knob-sections ${isChannel ? 'channel-knob-sections' : 'vanilla-knob-sections'}`}>
                    <div className="knob-card">
                        <h3>Network capacity</h3>
                        <RangeKnob
                            format={value => `${formatCompact(value)} units`}
                            help="Scheduler limit per slot"
                            label="Block cost limit"
                            max={150_000_000}
                            min={30_000_000}
                            onChange={value => dispatch({ key: 'blockCostUnits', type: 'update-input', value })}
                            step={2_500_000}
                            value={inputs.blockCostUnits}
                        />
                        <RangeKnob
                            format={value => `${value}ms`}
                            help="Slot target"
                            label="Slot duration"
                            max={500}
                            min={150}
                            onChange={value => dispatch({ key: 'slotMs', type: 'update-input', value })}
                            step={10}
                            value={inputs.slotMs}
                        />
                        <RangeKnob
                            format={formatPercent}
                            help="Budget reserved for this workload"
                            label="Available capacity"
                            max={100}
                            min={10}
                            onChange={value =>
                                dispatch({ key: 'availableCapacityPercent', type: 'update-input', value })
                            }
                            step={5}
                            value={inputs.availableCapacityPercent}
                        />
                    </div>

                    {inputs.mode === 'vanilla' ? (
                        <div className="knob-card">
                            <h3>Transfer shape</h3>
                            <div className="transfer-toggle" role="group" aria-label="Transfer kind">
                                {(['spl-token', 'token-2022'] as const).map(kind => (
                                    <button
                                        aria-pressed={inputs.transferKind === kind}
                                        className={inputs.transferKind === kind ? 'active' : ''}
                                        key={kind}
                                        onClick={() => selectTransferKind(kind)}
                                        type="button"
                                    >
                                        {kind === 'spl-token' ? 'SPL Token' : 'Token-2022'}
                                    </button>
                                ))}
                            </div>
                            <RangeKnob
                                format={value => `${formatInteger(value)} units`}
                                help="Whole-transaction scheduler cost"
                                label="Cost per transfer"
                                max={30_000}
                                min={500}
                                onChange={value => dispatch({ key: 'transferCostUnits', type: 'update-input', value })}
                                step={1}
                                value={inputs.transferCostUnits}
                            />
                            <div className="measurement-note">
                                <span>On-chain sample</span>
                                <p>
                                    SPL Token/USDC measured 1,911 cost units with one signer. Token-2022/PYUSD measured
                                    6,536 with two signers. Both use TransferChecked and existing token accounts.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="knob-card">
                                <h3>Channel economics</h3>
                                <RangeKnob
                                    format={value => `${value.toFixed(9)} SOL`}
                                    help="Refundable channel + escrow rent"
                                    label="Rent per live channel"
                                    max={0.005}
                                    min={0.0004}
                                    onChange={value =>
                                        dispatch({ key: 'rentPerChannelSol', type: 'update-input', value })
                                    }
                                    step={0.000000001}
                                    value={inputs.rentPerChannelSol}
                                />
                                <SelectKnob
                                    help="How long the same deployed channel stays OPEN before terminal close and reclaim"
                                    label="Channel lifetime"
                                    onChange={value =>
                                        dispatch({ key: 'channelLifetimeSeconds', type: 'update-demand', value })
                                    }
                                    options={channelLifetimeOptions}
                                    value={demand.channelLifetimeSeconds}
                                />
                                <div className="batch-table">
                                    <div>
                                        <span>Payments / channel (derived)</span>
                                        <strong>{formatCompact(paymentsPerChannel, 2)}</strong>
                                    </div>
                                    <div>
                                        <span>Cost / logical payment</span>
                                        <strong>{formatCompact(costPerLogicalPayment, 2)} units</strong>
                                    </div>
                                    <div>
                                        <span>Channel lifetime</span>
                                        <strong>
                                            {Number.isFinite(channelLifeSeconds)
                                                ? `${formatCompact(channelLifeSeconds, 2)} s`
                                                : '∞'}
                                        </strong>
                                    </div>
                                    <div>
                                        <span>Cash windows / channel</span>
                                        <strong>{formatCompact(sessionsPerChannel, 2)}</strong>
                                    </div>
                                    <div>
                                        <span>Channel builds+teardowns</span>
                                        <strong>{formatCompact(channelBuildsPerSecond, 2)} / second</strong>
                                    </div>
                                    <div>
                                        <span>On-chain watermark writes</span>
                                        <strong>{formatCompact(settlementsPerSecond, 2)} / second</strong>
                                    </div>
                                    <div>
                                        <span>Live channels</span>
                                        <strong>{formatCompact(liveChannels, 2)}</strong>
                                    </div>
                                </div>
                            </div>

                            <div className="knob-card">
                                <h3>Instruction batching</h3>
                                <RangeKnob
                                    format={value => `${value} instructions / tx`}
                                    help="Observed current program batching: 8"
                                    label="Reclaim batch"
                                    max={32}
                                    min={1}
                                    onChange={value =>
                                        dispatch({ key: 'reclaimBatchSize', type: 'update-input', value })
                                    }
                                    step={1}
                                    value={inputs.reclaimBatchSize}
                                />
                                {checkpointingAvailable && (
                                    <>
                                        <SelectKnob
                                            help="Extra on-chain writes for faster enforceability. Enabling adds fees; a longer interval means fewer checkpoint fees and does not change cash float."
                                            label="Enforceability checkpoint"
                                            onChange={value =>
                                                dispatch({ key: 'checkpointClockSeconds', type: 'update-input', value })
                                            }
                                            options={SETTLEMENT_CLOCK_OPTIONS}
                                            value={inputs.checkpointClockSeconds}
                                        />
                                        <RangeKnob
                                            disabled={!checkpointsEnabled || !inputs.batchSettlementAvailable}
                                            format={value => `${value} settles / tx`}
                                            help={
                                                !inputs.batchSettlementAvailable
                                                    ? 'Unavailable today; checkpoints use one channel per transaction'
                                                    : inputs.scheme === 'mpp'
                                                      ? 'ADR-004: distinct customers under one operator signer, account-bound (≤ 59)'
                                                      : `Packed [Ed25519, settle] pairs, size-bound (max ${checkpointBatchMaximum})`
                                            }
                                            label="Checkpoint batch (n)"
                                            max={checkpointBatchMaximum}
                                            min={1}
                                            onChange={value =>
                                                dispatch({ key: 'checkpointBatchSize', type: 'update-input', value })
                                            }
                                            step={1}
                                            value={effectiveCheckpointBatch}
                                        />
                                    </>
                                )}
                                <div className="batch-table">
                                    {usesRearm(inputs.mode) ? (
                                        <>
                                            <div>
                                                <span>Re-arm</span>
                                                <strong>{formatInteger(REARM_COST_UNITS)} units / cash boundary</strong>
                                            </div>
                                            <div>
                                                <span>Top-up</span>
                                                <strong>
                                                    {formatInteger(TOP_UP_COST_UNITS)} units / cash boundary
                                                </strong>
                                            </div>
                                            {checkpointsEnabled && (
                                                <>
                                                    <div>
                                                        <span>Checkpoint cost / channel</span>
                                                        <strong>
                                                            {formatInteger(checkpointCostPerChannelUnits)} units
                                                        </strong>
                                                    </div>
                                                    <div>
                                                        <span>Checkpoint tx / second</span>
                                                        <strong>
                                                            {formatCompact(checkpointTransactionsPerSecond, 2)}
                                                        </strong>
                                                    </div>
                                                </>
                                            )}
                                            <div>
                                                <span>Build+teardown</span>
                                                <strong>
                                                    once / {formatCompact(sessionsPerChannel, 2)} cash windows
                                                </strong>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div>
                                                <span>Voucher settle</span>
                                                <strong>
                                                    {formatInteger(SETTLE_COST_UNITS)} units / cash boundary
                                                </strong>
                                            </div>
                                            <div>
                                                <span>OPEN distribute</span>
                                                <strong>
                                                    {formatInteger(INTERIM_DISTRIBUTE_COST_UNITS)} units / cash boundary
                                                </strong>
                                            </div>
                                            <div>
                                                <span>Top-up</span>
                                                <strong>
                                                    {formatInteger(TOP_UP_COST_UNITS)} units / cash boundary
                                                </strong>
                                            </div>
                                        </>
                                    )}
                                    <div>
                                        <span>Cash-boundary cost</span>
                                        <strong>{formatInteger(cashBoundaryCostUnits)} units / channel</strong>
                                    </div>
                                    <div>
                                        <span>Full lifecycle cost</span>
                                        <strong>{formatInteger(costPerLifecycle)} units / channel lifetime</strong>
                                    </div>
                                </div>
                                <p className="batch-caveat">
                                    {inputs.mode === 'channel-v1'
                                        ? 'Deployed v1 is persistent: each cash boundary settles the latest voucher, runs OPEN-state distribute, and tops the escrow back up. The channel only pays open + terminal close + reclaim once per Channel lifetime. This follows the on-chain state machine; a cash sweep does not close the channel.'
                                        : 'ADR-005 re-arm is proposed and unbenchmarked. It combines voucher settlement, distribution, and unused-deposit refund before top-up (~29.2k planning units). Its benefit is capital reset semantics; against deployed settle + OPEN distribute + top-up (~28.6k measured/estimated units), it is not currently a scheduler-capacity win.'}
                                </p>
                            </div>

                            <div className="knob-card">
                                <h3>Off-chain voucher plane</h3>
                                <RangeKnob
                                    disabled={!perPaymentVerify}
                                    format={value => `${formatCompact(value)} / s`}
                                    help="Aggregate Ed25519 verify rate — a horizontally scalable fleet, not a protocol limit (~50–100k/s/core batched; 10M/s ≈ a 100–200 core fleet)"
                                    label="Voucher verification rate"
                                    max={20_000_000}
                                    min={250_000}
                                    onChange={value =>
                                        dispatch({ key: 'voucherVerifyPerSecond', type: 'update-input', value })
                                    }
                                    step={250_000}
                                    value={inputs.voucherVerifyPerSecond}
                                />
                                <div className="batch-table">
                                    <div>
                                        <span>{perPaymentVerify ? 'Verification load' : 'Operator signing load'}</span>
                                        <strong>
                                            {formatCompact(
                                                perPaymentVerify ? logicalRequestsPerSecond : settlementsPerSecond,
                                                2,
                                            )}{' '}
                                            / second
                                        </strong>
                                    </div>
                                    <div>
                                        <span>Verify budget used</span>
                                        <strong>
                                            {perPaymentVerify ? formatPercent(voucherVerifySharePercent) : 'n/a'}
                                        </strong>
                                    </div>
                                    <div>
                                        <span>Binding constraint</span>
                                        <strong>
                                            {bindingConstraint === 'none' ? 'neither (fits)' : bindingConstraint}
                                        </strong>
                                    </div>
                                </div>
                                <p className="batch-caveat">
                                    {perPaymentVerify
                                        ? 'One Ed25519 verification per incoming voucher, so hitting the target means sustaining that many voucher verifications/s off-chain — the report’s #1 remaining-work item. Unlike settlement batching or payments/channel this does not amortize, so at high on-chain amortization it becomes the real limiter; scale it by adding verifier cores.'
                                        : 'Operator-signed (mpp-specs #309): the operator signs cumulative vouchers, so there is no per-payment client Ed25519 to verify — this whole plane collapses from one verify per payment to one operator sign per settlement plus a cheap bearer-proof check per request. It stops being the limiter; the binding constraint reverts to the on-chain budget. The cost is trust: the client relies on the operator’s metering, bounded by the escrow deposit, instead of signing each increment itself.'}
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </section>

            <section aria-label="Derived metrics" className="metrics-grid">
                <article className="metric-card">
                    <span>Cost units per block</span>
                    <strong>{formatCompact(inputs.blockCostUnits, 2)}</strong>
                    <small>scheduler limit</small>
                </article>
                <article className="metric-card">
                    <span>Blocks per second</span>
                    <strong>{blocksPerSecond.toFixed(2)}</strong>
                    <small>from {inputs.slotMs}ms slots</small>
                </article>
                <article className="metric-card">
                    <span>Nominal scheduler budget</span>
                    <strong>{formatCompact(nominalBudgetPerSecond, 2)}</strong>
                    <small>cost units / second</small>
                </article>
                <article className="metric-card">
                    <span>Available to this workload</span>
                    <strong>{formatCompact(availableBudgetPerSecond, 2)}</strong>
                    <small>{formatPercent(inputs.availableCapacityPercent)} of nominal</small>
                </article>
                <article className="metric-card">
                    <span>Physical chain transactions</span>
                    <strong>{formatCompact(physicalTransactionsPerSecond, 2)}</strong>
                    <small>transactions / second at selected demand</small>
                </article>
                <article className="metric-card">
                    <span>{isChannel ? 'On-chain settlements' : 'Cost per payment'}</span>
                    <strong>
                        {isChannel ? formatCompact(settlementsPerSecond, 2) : formatInteger(inputs.transferCostUnits)}
                    </strong>
                    <small>{isChannel ? 'watermark writes / second across all planes' : 'scheduler units'}</small>
                </article>
                <article className="metric-card">
                    <span>{isChannel ? 'Concurrent live channels' : 'Required scheduler load'}</span>
                    <strong>
                        {isChannel ? formatCompact(liveChannels, 2) : formatCompact(requiredBudgetPerSecond, 2)}
                    </strong>
                    <small>{isChannel ? 'one active channel per payer' : 'cost units / second'}</small>
                </article>
                <article className="metric-card">
                    <span>{isChannel ? 'Refundable rent capital' : 'Nominal capacity gap (100% budget)'}</span>
                    <strong>
                        {isChannel
                            ? `${formatCompact(rentWorkingCapital, 2)} SOL`
                            : `${(requiredBudgetPerSecond / nominalBudgetPerSecond).toFixed(2)}×`}
                    </strong>
                    <small>
                        {isChannel ? 'to keep payer channels live' : 'verdict uses the configured available percentage'}
                    </small>
                </article>
            </section>

            <section aria-labelledby="opex-title" className="panel controls-panel">
                <div className="section-heading">
                    <div>
                        <p className="section-index">04</p>
                        <h2 id="opex-title">Operating economics</h2>
                    </div>
                    <p>
                        Compare the network burn with vanilla transfers, then size the refundable capital needed to run
                        the rail. Separate from the CU capacity math above.
                    </p>
                </div>

                <div className="demand-controls opex-controls">
                    <RangeKnob
                        format={formatUsd}
                        help="Economic value carried by each request"
                        label="Avg transaction value"
                        max={1}
                        min={0.001}
                        onChange={value =>
                            dispatch({ key: 'averageTransactionValueUsd', type: 'update-demand', value })
                        }
                        step={0.001}
                        value={demand.averageTransactionValueUsd}
                    />
                    <RangeKnob
                        format={formatUsd}
                        help="SOL/USD used to price fees and capital"
                        label="SOL price"
                        max={500}
                        min={10}
                        onChange={value => dispatch({ key: 'solPriceUsd', type: 'update-demand', value })}
                        step={5}
                        value={demand.solPriceUsd}
                    />
                    <RangeKnob
                        format={value => `${formatInteger(value)} lamports`}
                        help="Priority fee per tx (0 ≈ today's ~⅓-full blocks)"
                        label="Priority fee / tx"
                        max={100_000}
                        min={0}
                        onChange={value => dispatch({ key: 'priorityFeeLamportsPerTx', type: 'update-demand', value })}
                        step={1_000}
                        value={demand.priorityFeeLamportsPerTx}
                    />
                    <RangeKnob
                        format={formatPercent}
                        help="Annual cost of the refundable capital held in the rail"
                        label="Cost of capital"
                        max={25}
                        min={0}
                        onChange={value => dispatch({ key: 'capitalCostAnnualPercent', type: 'update-demand', value })}
                        step={0.5}
                        value={demand.capitalCostAnnualPercent}
                    />
                    <RangeKnob
                        format={value => `$${value.toFixed(3)} / M`}
                        help="Placeholder — no benchmark yet. Cost of the client-Ed25519 verification path only, $ per million. Applies to plain channels + x402; MPP and vanilla have $0 for this specific line, not $0 total infrastructure."
                        label="Off-chain verify penalty"
                        max={0.1}
                        min={0}
                        onChange={value =>
                            dispatch({ key: 'voucherVerifyCostUsdPerMillion', type: 'update-demand', value })
                        }
                        step={0.005}
                        value={demand.voucherVerifyCostUsdPerMillion}
                    />
                </div>

                <section aria-label="Network fee comparison" className="opex-summary">
                    <div className="opex-summary-heading">
                        <div>
                            <span>Network cost — actual burn</span>
                            <small>These fees leave the rail. They are not refundable.</small>
                        </div>
                        <strong>{formatUsd(grossValuePerSecondUsd * SECONDS_PER_DAY)} gross value / day</strong>
                    </div>
                    <div className="opex-comparison">
                        <article className="opex-rail opex-rail-selected">
                            <span>{settlementLabel(inputs.mode, inputs.scheme)}</span>
                            <strong>{formatUsd(networkFeeUsdPerSecond * SECONDS_PER_DAY)} / day</strong>
                            <small>{formatTakeRate(feeTakeRateBps)} network take-rate</small>
                        </article>
                        <div className="opex-versus" aria-label="Comparison result">
                            {inputs.mode === 'vanilla' ? (
                                <>
                                    <strong>Baseline</strong>
                                    <small>every payment settles on-chain</small>
                                </>
                            ) : (
                                <>
                                    <strong>{formatCompact(networkFeeMultiplier, 1)}× lower</strong>
                                    <small>{formatUsd(networkFeeSavingsUsdPerDay)} saved / day</small>
                                </>
                            )}
                        </div>
                        <article className="opex-rail">
                            <span>Vanilla transfers</span>
                            <strong>{formatUsd(vanillaNetworkFeeUsdPerSecond * SECONDS_PER_DAY)} / day</strong>
                            <small>{formatTakeRate(vanillaFeeTakeRateBps)} network take-rate</small>
                        </article>
                    </div>
                </section>

                <div className="opex-groups">
                    <section aria-label="Selected rail network costs" className="opex-group">
                        <div className="opex-group-heading">
                            <div>
                                <span>Selected rail</span>
                                <h3>Network fee breakdown</h3>
                            </div>
                            <p>Recurring costs that are paid to the network.</p>
                        </div>
                        <div className="opex-metrics-grid">
                            <article className="metric-card">
                                <span>Network fees</span>
                                <strong>{formatUsd(networkFeeUsdPerSecond * SECONDS_PER_DAY)}</strong>
                                <small>per day · {formatUsd(networkFeeUsdPerSecond * SECONDS_PER_MONTH)} / month</small>
                            </article>
                            <article className="metric-card">
                                <span>Fee take-rate</span>
                                <strong>{formatTakeRate(feeTakeRateBps)}</strong>
                                <small>network's cut of gross value</small>
                            </article>
                            <article className="metric-card">
                                <span>Annual network spend</span>
                                <strong>{formatUsd(feeUsdPerYear)}</strong>
                                <small>base and selected priority fees</small>
                            </article>
                        </div>
                    </section>

                    <section aria-label="Refundable capital requirements" className="opex-group opex-capital-group">
                        <div className="opex-group-heading">
                            <div>
                                <span>Capital required — refundable</span>
                                <h3>Working capital, not a fee</h3>
                            </div>
                            <p>These balances stay in the rail; only the annual carrying cost is an expense.</p>
                        </div>
                        <div className="opex-metrics-grid">
                            <article className="metric-card">
                                <span>Refundable rent capital</span>
                                <strong>{formatUsd(rentWorkingCapitalUsd)}</strong>
                                <small>
                                    {formatCompact(rentWorkingCapital, 2)} SOL across {formatCompact(liveChannels, 2)}{' '}
                                    channels
                                </small>
                            </article>
                            <article className="metric-card">
                                <span>Escrow float</span>
                                <strong>{formatUsd(escrowFloatUsd)}</strong>
                                <small>value in flight per settlement window</small>
                            </article>
                            <article className="metric-card">
                                <span>Capital carrying cost</span>
                                <strong>{formatUsd(capitalCarryingCostUsdPerYear)}</strong>
                                <small>per year on {formatUsd(workingCapitalUsd)} tied up</small>
                            </article>
                        </div>
                    </section>

                    {isChannel && (
                        <section aria-label="Off-chain verify fleet" className="opex-group">
                            <div className="opex-group-heading">
                                <div>
                                    <span>Off-chain compute — a burn (placeholder)</span>
                                    <h3>Voucher verify fleet</h3>
                                </div>
                                <p>
                                    {perPaymentVerify
                                        ? 'Client-signed: the operator verifies one Ed25519 voucher per accepted payment off-chain. No benchmark yet — dial the penalty in section 04.'
                                        : 'Operator-signed (MPP): no per-payment client signature to verify, so this plane is eliminated. Vanilla carries no vouchers either.'}
                                </p>
                            </div>
                            <div className="opex-metrics-grid">
                                <article className="metric-card">
                                    <span>Verify fleet cost</span>
                                    <strong>{formatUsd(verifyComputeUsdPerYear)}</strong>
                                    <small>
                                        per year · {formatUsd(verifyComputeUsdPerSecond * SECONDS_PER_DAY)} / day
                                    </small>
                                </article>
                                <article className="metric-card">
                                    <span>Verifies / second</span>
                                    <strong>{formatCompact(voucherVerifiesPerSecond, 2)}</strong>
                                    <small>
                                        {perPaymentVerify ? 'one per accepted payment' : 'none — no per-payment verify'}
                                    </small>
                                </article>
                                <article className="metric-card">
                                    <span>Verify take-rate</span>
                                    <strong>
                                        {formatTakeRate(
                                            grossValuePerSecondUsd > 0
                                                ? (verifyComputeUsdPerYear /
                                                      (grossValuePerSecondUsd * SECONDS_PER_YEAR)) *
                                                      10_000
                                                : 0,
                                        )}
                                    </strong>
                                    <small>
                                        {perPaymentVerify
                                            ? 'MPP removes this verification line'
                                            : '$0 for this line · other request costs remain'}
                                    </small>
                                </article>
                            </div>
                        </section>
                    )}
                </div>

                <section aria-label="All-in annual operating cost" className="opex-total">
                    <div>
                        <span>All-in annual operating cost</span>
                        <small>
                            Annual network spend
                            {perPaymentVerify ? ' + off-chain verify fleet' : ''} plus the carrying cost of refundable
                            capital.
                        </small>
                    </div>
                    <strong>{formatUsd(totalOpexUsdPerYear)}</strong>
                    <span>{formatTakeRate(allInTakeRateBps)} of annual gross value</span>
                </section>
                <p className="opex-note">
                    Fees are operation-specific at {formatInteger(BASE_FEE_LAMPORTS_PER_SIGNATURE)} lamports per
                    transaction or precompile signature: current settles cost 10,000 lamports, while standalone
                    distribute and batched reclaim cost 5,000
                    {demand.priorityFeeLamportsPerTx > 0
                        ? ` + ${formatInteger(demand.priorityFeeLamportsPerTx)} lamports priority`
                        : ''}
                    , over {formatCompact(physicalTransactionsPerSecond, 2)} physical tx/s. Rent and escrow are
                    refundable capital, not a burn — only their carrying cost is a true operating expense.
                </p>
            </section>

            <section aria-labelledby="how-it-works-title" className="panel explainer-panel">
                <div className="section-heading">
                    <div>
                        <p className="section-index">05</p>
                        <h2 id="how-it-works-title">How it works</h2>
                    </div>
                    <p>Payment channels compress a stream of logical payments into periodic on-chain state changes.</p>
                </div>
                <ol className="how-it-works-grid">
                    <li>
                        <span>01</span>
                        <div>
                            <strong>Authorize a payment</strong>
                            <p>A payer receives a paid request and issues an off-chain cumulative voucher.</p>
                        </div>
                    </li>
                    <li>
                        <span>02</span>
                        <div>
                            <strong>Accumulate value off-chain</strong>
                            <p>
                                Many vouchers update the same channel balance without each becoming a chain transaction.
                            </p>
                        </div>
                    </li>
                    <li>
                        <span>03</span>
                        <div>
                            <strong>Settle a watermark</strong>
                            <p>At the selected cash clock, the program advances the channel&rsquo;s OPEN watermark.</p>
                        </div>
                    </li>
                    <li>
                        <span>04</span>
                        <div>
                            <strong>Deliver or re-arm</strong>
                            <p>
                                Funds can be distributed, then the channel is topped up or recycled for the next window.
                            </p>
                        </div>
                    </li>
                </ol>
                <div className="batch-explainer">
                    <div>
                        <span className="batch-explainer-label">Available today</span>
                        <strong>MPP · one channel per checkpoint</strong>
                        <p>
                            MPP uses the deployed one-channel settlement path and removes the per-payment client
                            signature check. It does not yet batch distinct customer channels.
                        </p>
                    </div>
                    <div>
                        <span className="batch-explainer-label">Long-term · ADR-004</span>
                        <strong>MPP batches up to 59 channel updates</strong>
                        <p>
                            ADR-004 adds the multi-customer batch to the MPP path that already exists today. The 59 is
                            an account-limit bound, not 59 instructions, and that batching capability is unavailable in
                            the today preset.
                        </p>
                    </div>
                </div>
            </section>

            <section aria-labelledby="scaling-limits-title" className="panel scaling-panel">
                <div className="section-heading">
                    <div>
                        <p className="section-index">06</p>
                        <h2 id="scaling-limits-title">Scaling limits</h2>
                    </div>
                    <p>Amortization holds chain work roughly flat; time, capital, and operations take over.</p>
                </div>
                <div className="scaling-laws">
                    <article>
                        <span>Chain compute</span>
                        <strong>Flat</strong>
                        <p>About 4.3k settlements/s at the modeled 125M CU/s budget.</p>
                    </article>
                    <article>
                        <span>Batch window</span>
                        <strong>Linear</strong>
                        <p>More logical payments need a proportionally longer cash window.</p>
                    </article>
                    <article>
                        <span>Escrow float</span>
                        <strong>Quadratic</strong>
                        <p>Throughput × window: the capital requirement becomes the hard economic constraint.</p>
                    </article>
                </div>
                <div className="scaling-table-wrap">
                    <table>
                        <caption>Illustrative persistent-channel envelope at $0.05/payment</caption>
                        <thead>
                            <tr>
                                <th scope="col">Demand</th>
                                <th scope="col">Minimum cash window</th>
                                <th scope="col">Escrow float</th>
                                <th scope="col">Verifier fleet</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <th scope="row">1M/s</th>
                                <td>3.9 min</td>
                                <td>~$0.03B</td>
                                <td>~13 cores</td>
                            </tr>
                            <tr>
                                <th scope="row">10M/s</th>
                                <td>39 min</td>
                                <td>~$1.2B</td>
                                <td>~130 cores</td>
                            </tr>
                            <tr>
                                <th scope="row">100M/s</th>
                                <td>6.5 hr</td>
                                <td>~$117B</td>
                                <td>~1,300 cores</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="scaling-note">
                    Cash delivery is separately bounded: one merchant recipient account handles roughly 7,040 payouts/s,
                    so higher rates need account fan-out or periodic delivery. The envelope assumes persistent channels;
                    churn makes the economics worse.
                </p>
            </section>

            <div
                aria-label={`Selected payment channel daily network cost: ${settlementLabel(inputs.mode, inputs.scheme)} ${formatUsd(networkFeeUsdPerSecond * SECONDS_PER_DAY)} per day`}
                aria-live="polite"
                className="opex-sticky"
                data-horizon={pinnedHorizon}
                key={pinnedScenarioKey}
            >
                <div className="opex-sticky-rail">
                    <span className="opex-sticky-label">Settlement stack</span>
                    <strong className="opex-sticky-stack">{settlementLabel(inputs.mode, inputs.scheme)}</strong>
                </div>
                <div className="opex-sticky-metric">
                    <span className="opex-sticky-label">Network cost · actual burn</span>
                    <strong className="opex-sticky-cost">
                        {formatUsd(networkFeeUsdPerSecond * SECONDS_PER_DAY)} <small>/ day</small>
                    </strong>
                    <small className="opex-sticky-detail">
                        {formatCompact(logicalRequestsPerSecond * SECONDS_PER_DAY, 2)} logical payments / day ·{' '}
                        {formatUsdPerPayment(networkFeeUsdPerSecond / Math.max(logicalRequestsPerSecond, 1))} / payment
                    </small>
                </div>
            </div>

            <footer className="site-footer">
                <div className="site-footer-band">
                    <div className="site-footer-brand">
                        <div className="foundation-mark" aria-label="Solana Foundation" role="img">
                            <svg aria-hidden="true" fill="none" viewBox="0 0 18 16">
                                <path d="M17.91 12.61 14.94 15.78a.72.72 0 0 1-.5.22H.34a.34.34 0 0 1-.25-.56l2.98-3.18a.72.72 0 0 1 .5-.22h14.09a.34.34 0 0 1 .25.57ZM14.94 6.24a.72.72 0 0 0-.5-.22H.34a.34.34 0 0 0-.25.57l2.98 3.17a.72.72 0 0 0 .5.22h14.09a.34.34 0 0 0 .25-.57ZM.34 3.96h14.09a.72.72 0 0 0 .5-.22L17.91.58A.34.34 0 0 0 17.66 0H3.57a.72.72 0 0 0-.5.22L.09 3.39a.34.34 0 0 0 .25.57Z" />
                            </svg>
                            <span>Solana Foundation</span>
                        </div>
                    </div>
                    <nav aria-label="Payment channel resources" className="site-footer-links">
                        <a href="https://pay.sh" rel="noopener noreferrer" target="_blank">
                            pay.sh <span aria-hidden="true">↗</span>
                        </a>
                        <a href="https://github.com/solana-foundation/pay" rel="noopener noreferrer" target="_blank">
                            brew install pay <span aria-hidden="true">↗</span>
                        </a>
                        <a
                            href="https://github.com/solana-foundation/pay-kit"
                            rel="noopener noreferrer"
                            target="_blank"
                        >
                            build with pay-kit <span aria-hidden="true">↗</span>
                        </a>
                    </nav>
                </div>
                <div aria-hidden="true" className="site-footer-tail" />
            </footer>
        </main>
    );
}
