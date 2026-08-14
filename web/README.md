# One Million Payments per Second

Interactive capacity model for comparing vanilla Solana transfers, deployed persistent
Tabs v1, and proposed ADR-004/ADR-005 paths. The pure evaluator in
`src/model.ts` separates terminal lifecycle, OPEN-state cash delivery/refill, optional
enforceability checkpoints, and off-chain verification. Presets call that evaluator at
runtime; they are not stored result tables. `src/app-state.ts` reduces every URL, preset,
slider, rail, and SIMD event into one atomic model state.

Batch settlement is modeled as an explicit horizon capability. It is unavailable in the
Today preset, where the evaluator enforces one checkpoint channel per transaction even if
stale UI or URL state requests a larger batch. The Long-term preset enables proposed
ADR-004 batching.

## Quick Start

```bash
pnpm install
just dev
```

The app opens at `http://localhost:5173`.

## Development

- `just dev` — Start dev server with hot reload
- `just build` — Build for production
- `just lint` — Run ESLint
- `just format` — Format code with Prettier
- `just test` — Run model regression tests
- `just ci` — Run formatting, lint, build, and model tests
- `just preview` — Preview production build locally

## Stack

- **React 18** — UI framework
- **TypeScript** — Type safety
- **Vite** — Fast bundling and dev server
- **ESLint + Prettier** — Code quality

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` builds this directory and publishes `web/dist` to GitHub
Pages on every push to `main` that touches `web/**`. Enable it once under
**Settings → Pages → Source: GitHub Actions**; the site then serves at
`https://solana-foundation.github.io/tabs/`.

The Vite `base` defaults to `/tabs/` (project-page path). It must match the
repo slug that serves Pages; for a custom domain build with `PAGES_BASE=/ pnpm build`
(or change the default in `vite.config.ts`).

> **Note:** the compute-unit constants in `src/model.ts` are a point-in-time mainnet
> snapshot (measured from program `CHNLxYvVA28MJP9PrFuDXccuoGXAx7jBacfLEkahyGsX`), not a
> live feed. They are a planning model, not real-time telemetry.
