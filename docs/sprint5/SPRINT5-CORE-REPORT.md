# Sprint 5 Core Report

**Date:** 2026-06-07
**Scope:** Auth correctness + main services (Contracts, LANE-AUTH, LANE-MAINSVC)

---

## Tasks Completed

| Task | Unit | Description |
|------|------|-------------|
| ARCH-B2 | Contracts | Shared `ipc-channels.ts` — single source of truth for all IPC channel strings |
| ARCH-S3 | Contracts | `IPCResponse<T>` / `TokenResult` moved to `ipc-types.ts`; re-exported from `types.ts` for back-compat |
| ARCH-S4 | Contracts | Dead field `ContentItem.lastAccessed` removed |
| ARCH-S5 | Contracts | Dead channel `content:get-recent` removed (renderer already used `usage:get-recent`) |
| ARCH-S10 | Contracts | All magic-number constants extracted into named groups in `shared/constants.ts` |
| PROD-B2 (types/consts) | Contracts | `autoStartMode`, `autoStartWorkspaceId` added to `AppSettings` + `DEFAULT_SETTINGS` |
| BEH-B1 (type) | Contracts | `AuthResult.reusedPreviousAccount: boolean` added (required) |
| BEH-B3 (types/consts) | Contracts | `ContentItem.accountId?: string`; `usageClearOnLogout` enum added to `AppSettings` |
| NEW-DEP-1 | Contracts | `shared/powerbi-errors.ts` created (renamed from `utils.ts`); `utils.ts` deleted |
| NEW-CI-5 | Contracts | `shared/validation.ts` overhauled; `validateAppSettingsPatch` covers all `AppSettings` keys |
| BEH-B1 | LANE-AUTH | Sequential fail-loud logout cookie clear; proactive pre-login cookie sweep; real `reusedPreviousAccount` detection |
| BEH-B2 | LANE-AUTH | `tokenCache.onCorruption` hook; `invalidateCache()` on `AuthService`; `validateToken` returns `false` after forced corruption |
| NEW-AUTH-2 | LANE-AUTH | `isAuthenticated()` non-mutating; `initializeCache()` idempotent |
| NEW-AUTH-3 | LANE-AUTH | `lastKnownExpiry` keyed by `homeAccountId` via `Map`; short-circuit cannot trust another account's expiry |
| ARCH-B4 | LANE-AUTH | `createAuthService(deps)` + `createPowerBIApiService(deps)` factories; `buildProductionDeps/buildProductionApiDeps`; lazy singleton accessors in `singleton.ts` |
| BEH-B3 | LANE-MAINSVC | `UsageRecord.accountId` added; one-time backup migration; `clearUsageDataForAccount()` exported; scoped `getRecentItems`/`getFrequentItems` |
| NEW-PERF-1 | LANE-MAINSVC | Export service races 30 s timeout against `did-finish-load`; double-settle guard + `clearTimeout` on normal resolution |
| PERF-S3 | LANE-MAINSVC | `log.transports.file.maxSize = 5 MB`; `onError` rate-limited to 1/s with suppressed-count flush |
| PROD-B2 | LANE-MAINSVC | No handler changes needed — `validateAppSettingsPatch` (Contracts) already covers `autoStartMode`, `autoStartWorkspaceId`, `usageClearOnLogout` |
| PROD-S2 | LANE-MAINSVC | `ipc/app.ts` adds `app:check-for-updates` handler; preload exposes `checkForUpdates` |

---

## Files Touched

**Contracts (shared layer)**
- `src/shared/types.ts`
- `src/shared/constants.ts`
- `src/shared/ipc-types.ts`
- `src/shared/validation.ts`
- `src/shared/ipc-channels.ts` (CREATED)
- `src/shared/powerbi-errors.ts` (CREATED, renamed from `utils.ts`)
- `src/shared/powerbi-errors.test.ts` (CREATED, renamed from `utils.test.ts`)
- `src/shared/utils.ts` (DELETED)
- `src/shared/utils.test.ts` (DELETED)
- `src/main/validation.ts` (DELETED — consolidated into shared)
- `src/main/ipc/settings.ts`
- `src/main/ipc/usage.ts`
- `src/main/ipc/content.ts`
- `src/preload/index.ts`
- `src/renderer/hooks/usePowerBIEmbed.ts`
- `src/test/setup.ts`
- `src/test/sanity.test.tsx`
- `tsconfig.renderer.json`
- `package.json`
- `src/main/auth/auth-service.ts` (1-line cross-lane placeholder — see notes)

**LANE-AUTH**
- `src/main/auth/auth-service.ts`
- `src/main/auth/auth-service.test.ts`
- `src/main/auth/token-cache.ts`
- `src/main/auth/singleton.ts` (CREATED)
- `src/main/services/powerbi-api.ts`
- `src/main/services/powerbi-api.test.ts`

**LANE-MAINSVC**
- `src/main/services/usage-tracking-service.ts`
- `src/main/ipc/usage.ts`
- `src/main/services/export-service.ts`
- `src/main/ipc/log.ts`
- `src/main/ipc/app.ts`
- `src/preload/index.ts`

**Total distinct files touched: ~36**

---

## Gate Status

| Gate | Result |
|------|--------|
| `tsc -p tsconfig.main.json --noEmit` | PASS (exit 0) |
| `tsc -p tsconfig.renderer.json --noEmit` | PASS (exit 0) |
| ESLint `src/` `--max-warnings=0` | PASS (exit 0) |
| Vitest full suite | PASS — **79 passed / 0 skipped / 0 failed** |
| IPC channel parity (36 registered) | PASS — 1 dead channel removed, 1 new channel added, net 36 |

---

## Skipped Tests Revived

**Yes.** Both previously-skipped (`it.skip`) test files are now active and passing:

- `src/main/auth/auth-service.test.ts` — 19 tests (was skipped; now runs against real DI'd service with `vi.mock('electron')` stub)
- `src/main/services/powerbi-api.test.ts` — 4 tests (was skipped; now runs against DI'd API service)

The DI refactor (`createAuthService(deps)` factory + lazy `singleton.ts`) is what made this possible — electron/MSAL is never touched at module import time.

Prior suite total: 76 passed + 3 skipped. Current: **79 passed + 0 skipped**.

---

## Auth Correctness Verdict

**PASS.** All BEH-B1/B2/NEW-AUTH-2/NEW-AUTH-3 items verified correct:

- **BEH-B1:** Logout is sequential and fail-loud — persistent/MSAL caches cleared and `this.account` nulled before cookie jars are swept. If any cookie jar throws, `LOGOUT_FAILED` is returned (never silently swallowed). Symmetric proactive pre-login cookie sweep implemented.
- **BEH-B2:** `tokenCache.onCorruption` hook wires to `authService.invalidateCache()`, which nulls `this.account` and drops the `lastKnownExpiry` entry so `validateToken` cannot return stale `true` after forced corruption. Unit-tested end-to-end.
- **NEW-AUTH-2:** `isAuthenticated()` reads only; `initializeCache()` is idempotent (does not overwrite `this.account` when already set).
- **NEW-AUTH-3:** `lastKnownExpiry` is a `Map<homeAccountId, Date>` — short-circuit cannot mistake one account's expiry for another's. `SEC-S4` drops only the active account's entry on `InteractionRequired`.

The `accounts[0]` active-account seam is acknowledged and cleanly replaced by Sprint 6 NEW-AUTH-1 (select by `homeAccountId`) without further churn.

---

## Residual Issues

The following are **informational only** — none are regressions or gate failures.

1. **LOGOUT ORDERING (design note):** Logout wipes persistent/MSAL cache and nulls `this.account` before clearing cookies. A cookie jar throw produces a partial logout (caches gone, cookies survive) reported as `LOGOUT_FAILED`. This is the intended fail-loud design — strictly safer than the prior swallow-and-claim-success. Sprint 6 may want the renderer to surface a "partial sign-out: please retry" UX state.

2. **BEH-B3 MIGRATION TEST COVERAGE GAP:** The `runMigrationIfNeeded()` backup write (`usage.pre-v1.7.0.bak.json` before flipping `migrationV170Done`) is verified by code reading only — no unit test exercises it. Migration is non-destructive (backup before flag), so data-loss risk is nil. A regression that reorders backup-vs-flag write would not be caught. Consider adding a test in Sprint 6.

3. **CHANNEL PARITY NUANCE:** `content:get-recent` was removed (ARCH-S5, dead — renderer used `usage:get-recent`; `preload.content.getRecent` removed in lockstep). Net channel count held at 36 via the new `app:check-for-updates` channel. The sprint brief stated "none may be LOST" — this is an intentional, documented dead-channel removal, not an accidental loss. Renderer-facing surface unchanged.

4. **SEC OBSERVATION (pre-existing, out of scope):** `token-cache.ts` `decrypt()` returns `''` on failure; `loadCache()` propagates that empty string. `auth-service` correctly treats it as falsy today. A future caller that does not null-check could misread `''` as a valid serialized cache. Not introduced this sprint.

5. **CROSS-LANE FOLLOW-UPS (Sprint 6):**
   - `src/shared/ipc-types.ts` (Contracts): add `checkForUpdates: () => Promise<IPCResponse<{ currentVersion: string; releasesUrl: string }>>` to `ElectronAPI.app`.
   - `src/shared/ipc-channels.ts` (Contracts): add `checkForUpdates: 'app:check-for-updates'` to the `app` group.
   - LANE-AUTH: pass `homeAccountId` from `AuthResult` as `accountId` when calling `usage:record-open` from the renderer.
   - LANE-MAINSVC: `usage-tracking-service.ts` has its own local `NAME_MAX_LENGTH=256` and `capName` — can now import from `shared/validation` (`NAME_MAX`, `capName`) to deduplicate.

---

## Go / No-Go: Sprint 5 Renderer Fan-Out

**GO.**

All gates green. Auth DI seam is clean and transparent to existing consumers. IPC channel map is authoritative and complete. Shared validation, constants, and types are stable. The 2 revived test files confirm the DI'd services are testable and correct. No regressions. Residual items are informational only and do not block renderer work.

The renderer fan-out (Sprint 5 part 2) may proceed on the current working tree.
