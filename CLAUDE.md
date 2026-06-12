# CLAUDE.md — read this before touching anything

## What this repo is

The **desktop** Power BI Viewer: Electron + React 18 + TS. Source in `src/`.
The mobile app lives in its own repository (fleet-mobile) — it was fully
extracted from this repo, so don't reintroduce mobile code, configs, or CI
here.

## Build prerequisites (fresh clone)

- `npm run build` / `npm run dev` REQUIRE `npm run generate-config` first,
  which needs `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` (env or `.env`). Without
  them the gitignored `src/main/auth/azure-config.generated.ts` and
  `src/main/services/beacon-config.generated.ts` do not exist and
  `tsc -p tsconfig.main.json` fails on the missing import.
- For local typechecking without real credentials, generate with any
  syntactically valid GUIDs.
- **NEVER edit or commit `*.generated.ts` files.** Tests don't need them —
  `vitest.config.ts` aliases stubs from `src/test/fixtures/`.

## Verification commands (run from repo root unless noted)

```
npx tsc --noEmit -p tsconfig.main.json      # main process (CommonJS/node)
npx tsc --noEmit -p tsconfig.renderer.json  # renderer (ESNext/bundler, JSX)
npm run lint
npm test
```

Both tsconfigs include `src/shared/**` with DIFFERENT module semantics — an
import style valid under one can fail the other. Always run both.

## Comment policy

This codebase is deliberately **comment-free**. A past session filled it with
prose comments full of fabricated attributions and invented design rules, and
they all got removed. Don't add prose comments — put rationale in commit
messages. The only comments allowed are functional directives the toolchain
needs (`eslint-disable*`, `@ts-expect-error`, `/// <reference …`), and only
where the build genuinely requires them.

## Things that look like junk but are load-bearing

- `RELEASE_REQUEST` (repo root): committing a change to it on `main` TRIGGERS
  a full build-and-release via `.github/workflows/release-bridge.yml`.
- `update-policy.json`: polled by every installed Windows app every 10 min;
  `forceMinVersion` force-restarts the fleet onto the latest release.
- Release flow: GitHub Actions bumps the version and tags — never hand-edit
  the version in `package.json`. See `docs/UPDATING.md`.

## IPC contract (desktop)

A renderer↔main channel has FOUR synchronized touchpoints — change all of
them together (contract tests in `src/test/` enforce this):
`src/shared/ipc-channels.ts` (name) → `src/shared/ipc-types.ts` (signature) →
`src/preload/index.ts` (bridge) → `src/main/ipc/*.ts` (handler, returning the
`IPCResponse<T>` envelope — handlers must not throw).

## Styling (desktop renderer)

- Brand color is Safety Orange #FF5F15. Keep it; meet contrast by pairing it
  with dark ink on fills (white text on this orange fails WCAG AA) rather than
  changing the color.
- The Insights board ("the dashboard") lives in
  `src/renderer/components/insights/**` and `insights-luce.css`. It's the
  high-craft, experimental surface — the morph, spring physics, and instrument
  work happen here. It's where the fun is; treat it with care.
- Four styling systems coexist and are being consolidated into one
  token-driven layer: Tailwind utilities, Fluent UI v9, and
  `src/renderer/styles/globals.css`. Don't add a fifth.

## Product priorities

Clients need: workflows that present correctly, data that updates correctly,
sign in once (not over and over), a reliable program that just works, and
kiosk wall-display dashboards. The Insights board is the playground — fun, and
worth real craft, but never at the expense of the above.
