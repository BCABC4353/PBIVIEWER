# CLAUDE.md — read this before touching anything

## The repo is TWO packages, not one

- **Desktop** (repo root): Electron + React 18 + TS. Source in `src/`.
- **Mobile** (`mobile/`): Expo / React Native + React 19 + TS. Its OWN
  `package.json`, lockfile, and node_modules. `cd mobile && npm ci` before any
  mobile work. Root `npm test` does NOT run mobile tests; run `npm test` and
  `npm run typecheck` inside `mobile/`.
- `src/shared/` is consumed by BOTH packages (mobile reaches it via
  `mobile/metro.config.js` watchFolders). Keep it free of platform imports.

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
npm test                                    # desktop only
cd mobile && npm run typecheck && npm test  # mobile
```

Both tsconfigs include `src/shared/**` with DIFFERENT module semantics — an
import style valid under one can fail the other. Always run both.

## Comment policy (owner decision)

This codebase is deliberately **comment-free**. Earlier AI sessions filled it
with prose comments containing fabricated attributions and invented design
rules; the owner removed all of them. Do NOT add prose comments — put
rationale in commit messages. The ONLY comments permitted are functional
directives the toolchain needs (`eslint-disable*`, `@ts-expect-error`,
`/// <reference …`) and those only where the build genuinely requires them.

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

Four coexisting systems currently — keep each to its lane until the planned
styling consolidation: Tailwind utilities (layout/spacing), Fluent UI v9
components, `src/renderer/styles/globals.css` (app chrome), and
`src/renderer/components/insights/insights-luce.css` (Insights board only).

## Product priorities (owner's words)

Clients need: workflows that present correctly, data that updates correctly,
sign in once (not over and over), a reliable program that just works, and
kiosk wall-display dashboards. The Insights board is the owner's personal
experiment — fun, but never at the expense of the above.
