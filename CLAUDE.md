# CLAUDE.md — read this before touching anything

## What this is

Standalone Expo (SDK 56) app for Power BI refresh-health monitoring,
extracted from the desktop repo's `mobile/` package. Self-contained: no
imports reach outside this repo (the former `src/shared` bridge is
internalized at `src/core/refresh-health-core.ts`).

## Comment policy (owner decision)

This codebase is deliberately **comment-free**. Do NOT add prose comments —
put rationale in commit messages. The ONLY comments permitted are functional
directives the toolchain needs (`eslint-disable*`, `@ts-expect-error`,
`/// <reference …`) and those only where the build genuinely requires them.

## Design contract (owner decisions, locked)

The full design contract lives in `design-lab/` (being moved in separately —
defer to it when present). The locked rules:

- **D-DIN PRO** is the typeface.
- **The tick strip is the only instrument.** No dials, no gauges.
- **NO chips, NO badges.** Status is an engraved glyph + tinted text.
- **Color roles:**
  - Safety Orange `#FF5F15` — live/armed only.
  - Green — transient verified-event only.
  - Amber — behind.
  - Red — broken only.
  - Healthy screens are monochrome.
- **Data may animate its own arrival; chrome never performs.** No launch
  rituals, no sweeps.
- **60 fps floor, 120 aim.**

## Code health (owner guarantees)

These are mechanically enforced and bind every session, not just the one that
added them.

- **Single-source style.** No hex color literal (`#RGB`/`#RRGGBB`) or
  `rgba()`/`rgb()` may appear outside `src/design/tokens.ts`. Everything color
  lives in tokens; code imports it. Enforced by `npm run lint`
  (`no-restricted-syntax` in `eslint.config.mjs`). Tests and `design-lab/` are
  excluded. Need a translucent white/black? Use the `whiteAlpha`/`blackAlpha`
  helpers in tokens.
- **Anti-god-code.** No source file exceeds 300 lines. One concern per file;
  pure logic is never mixed with rendering. The integrator checks line counts
  on every changed file before merging; a violator is split or the work is
  marked PARTIAL with justification.

## Identity (provisional)

App name "FLEET", slug `fleet-mobile`, bundle id/package `com.bcabc.fleet`,
and the assets in `assets/` are all placeholders — changeable until the first
store upload; icons/splash get redesigned with the brand.

## Build notes

- `npm start` (not `npx expo start`) — the prestart hook writes the
  gitignored `src/auth/azure-config.local.json` stub Metro needs to bundle.
  Never commit real GUIDs.
- Tests run under vitest in a node environment (`vitest.config.ts`); pure
  logic stays free of react-native imports so it stays node-testable.

## Verification commands

```
npm run typecheck
npm test
npx expo export --platform web --output-dir /tmp/fleet-export-check
```
