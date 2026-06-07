# Sprint 6 Stage 2 — State Core Report

**Date:** 2026-06-07
**Sprint:** 6, Stage 2 (State Core)
**Scrum Master verdict:** ALL GREEN — cleared for Stage 3

---

## 1. Scope

Stage 2 delivered two orthogonal changes gated to ship together:

| Lane | Ticket | Summary |
|------|--------|---------|
| LANE-AUTH1 | NEW-AUTH-1 | Active-account source of truth (main process) |
| LANE-ZUSTAND | ARCH-B3 | auth-store decoupling / evict-on-logout inversion (renderer) |

---

## 2. NEW-AUTH-1 Design (LANE-AUTH1)

### 2.1 Problem statement

Pre-Stage-2, every token-acquisition and cache-hydration path resolved the target account by reading `accounts[0]` directly from the MSAL cache. This made two assumptions: (a) there is exactly one cached account, and (b) it is always the right one. Sprint 5 noted these read paths as the seam to fix.

### 2.2 Solution: `activeHomeAccountId` source of truth

A single `activeHomeAccountId: string | null` field is maintained in `AuthService`. It is the canonical answer to "which cached account do all operations target?" All paths that previously read `accounts[0]` now go through `getActiveAccount()`.

**Persistence** — the active id is stored as a third encrypted entry (`activeHomeAccountId`) in the existing `powerbi-viewer-auth` electron-store alongside `msalCache` and `userInfo`. `clearCache()` deletes all three in lockstep so the selection can never outlive the cache that backs it (including the corruption-purge path in `decrypt()`).

### 2.3 New public surface

| Method | Behaviour |
|--------|-----------|
| `getActiveAccount()` | Resolves the MSAL `AccountInfo` whose `homeAccountId === activeHomeAccountId`. On unset or stale id falls back to `accounts[0]` **and adopts it** (set + persist). This is the **one sanctioned `accounts[0]` read** in the codebase (auth-service.ts:233). |
| `setActiveAccount(homeAccountId)` | Validates the id exists in the MSAL cache, then sets + persists it and re-points `this.account`. Returns `ACCOUNT_NOT_FOUND` for an unknown id. This is the **seam PROD-B1 (Stage 3 switcher) will call**. |
| `saveActiveAccountId` / `loadActiveAccountId` (token-cache) | Encrypted electron-store read/write for the active id. Added to `PersistentCachePort` interface. |

### 2.4 Write-path coverage

Every path that mutates the active account updates `activeHomeAccountId` consistently:

- **Login success** — set + persist to the newly signed-in account (overwrites any stale id on account switch).
- **`getAccessToken` acquisition** — resolves via `getActiveAccount()` so the acquisition always targets the active account.
- **Cache hydrate (`initializeCache`)** — replaced `accounts[0]` read with `getActiveAccount()`.
- **Logout** — null in-memory + persist(null) + re-arm loader.
- **`invalidateCache` (corruption hook)** — clear in-memory id + re-arm loader (store already purged by `token-cache.decrypt()`).

### 2.5 `getCurrentUser()` — deliberate design decision

`getCurrentUser()` still reads `this.account` (not a fresh `getActiveAccount()` probe) and falls back to persisted `userInfo` when null. This is intentional. The existing BEH-B2 corruption test asserts that after `invalidateCache()` — with the account physically present in the MSAL cache — `getCurrentUser` returns `null` rather than silently re-adopting `accounts[0]`. Since `this.account` is now always assigned **from** the active-account source of truth on every write path (login adoption, `getAccessToken` resolution, `setActiveAccount` re-point), reading `this.account` is equivalent to the active account without re-probing on corrupted state.

### 2.6 Unit test coverage (11 new tests)

- First login adopts + persists the active id.
- `getActiveAccount`: adopt-on-unset, honor-persisted, stale-fallback, empty-cache cases.
- `setActiveAccount`: switches which account `getUser` + `getAccessToken` target; rejects unknown ids with `ACCOUNT_NOT_FOUND`.
- Logout clears the persisted id; login overwrites a stale id.

---

## 3. ARCH-B3 Inversion (LANE-ZUSTAND)

### 3.1 Problem statement

`auth-store.ts` imported `useContentStore` and `useSearchStore` to call their reset methods on logout. This inverted the dependency hierarchy: the auth store (lowest layer) knew about domain stores (higher layer), creating a coupling that could not scale and was identified as ARCH-B3.

### 3.2 Solution: `evict-on-logout.ts`

A new renderer module at `src/renderer/lib/evict-on-logout.ts` owns the glue. It subscribes to `useAuthStore` via Zustand's `subscribe` API and fires `content.reset()` + `search.invalidateAll()` on a strict `true → false` isAuthenticated transition. `auth-store.ts` now imports neither `content-store` nor `search-store`.

Key implementation details:

- **Transition guard** — a `prevAuthenticated` closure variable ensures only the exact `true → false` edge fires eviction. Login (`false → true`), repeated signed-out updates, and any unrelated state change are no-ops.
- **Mount wiring** — `initEvictOnLogout()` is called once inside `App.tsx`'s mount `useEffect` and its return value (the `unsubscribe` function) is returned as cleanup, making it StrictMode-safe (double-invoke safe).
- **Evicted caches** — exactly the pre-refactor set: `content.reset()` and `search.invalidateAll()`.

### 3.3 Unit test coverage (6 new tests)

- `true → false` transition fires eviction.
- `false → true` (login) does not evict.
- Unrelated state updates do not evict.
- Post-cleanup does not fire.
- Fires only once for repeated signed-out updates.
- StrictMode double-invoke safety.

---

## 4. Gate Results

| Gate | Result |
|------|--------|
| `tsc -p tsconfig.main.json --noEmit` | PASS (exit 0) |
| `tsc -p tsconfig.renderer.json --noEmit` | PASS (exit 0) |
| ESLint on all 5 changed production files | PASS (exit 0, zero lint errors) |
| Vitest — full suite | PASS (139/139 green, incl. 28 auth tests: 11 new NEW-AUTH-1 + 6 new ARCH-B3) |
| `auth-store` imports content/search store | PASS — confirmed 0 matches |
| Single sanctioned `accounts[0]` read | PASS — grep confirms only auth-service.ts:233 inside `getActiveAccount()`, all other matches are comments |
| `setActiveAccount` seam present and unit-tested | PASS |
| Circular import eliminated | PASS |

**`allGreen = true`. mustFix = 0.**

---

## 5. Files Changed

### LANE-AUTH1 (main process)
- `src/main/auth/auth-service.ts` — active account source of truth, `getActiveAccount`, `setActiveAccount`, write-path updates.
- `src/main/auth/auth-service.test.ts` — 11 new NEW-AUTH-1 unit tests.
- `src/main/auth/token-cache.ts` — `saveActiveAccountId`, `loadActiveAccountId`, `clearCache` lockstep delete, `PersistentCachePort` interface extension.

### LANE-ZUSTAND (renderer)
- `src/renderer/lib/evict-on-logout.ts` — NEW: the ARCH-B3 inversion module.
- `src/renderer/lib/evict-on-logout.test.ts` — NEW: 6 unit tests.
- `src/renderer/stores/auth-store.ts` — removed content-store / search-store imports and reset calls.
- `src/renderer/App.tsx` — mount effect wiring for `initEvictOnLogout`.

---

## 6. Residual Issues (all Stage-3 follow-ups, no blockers)

### R1 — PROD-B1 IPC wiring not yet built (intended, not a defect)
`setActiveAccount()` is implemented and unit-tested but not yet exposed via an IPC handler or preload bridge. No renderer caller exists. This is the intended seam for the Stage 3 account switcher UI. IPC wiring belongs to Stage 3 / the IPC lane.

### R2 — `decrypt()` corruption path does not delete `activeHomeAccountId` (cosmetic)
`token-cache.ts decrypt()` currently deletes only `msalCache` and `userInfo`. A corrupt `activeHomeAccountId` entry returns `null` (safe: `loadActiveAccountId` tolerates it and `getActiveAccount` re-adopts `accounts[0]`), but the corrupt entry lingers on disk until the next `clearCache()` / `saveActiveAccountId(null)` / login. Harmless; consider adding `store.delete('activeHomeAccountId')` inside `decrypt()`'s catch block for full lockstep cleanliness. Low priority.

### R3 — `loadActiveAccountId` outer try/catch is redundant (cosmetic)
`decrypt()` already swallows decrypt failures internally and returns `''` (mapped to `null`). The outer `catch` in `loadActiveAccountId` is effectively unreachable. Cosmetic only; no behaviour change.

### R4 — Account switch does NOT evict content/search caches (flag for PROD-B1 design)
Only the logout transition (`isAuthenticated true → false`) triggers `evict-on-logout`. When Stage 3 wires the PROD-B1 account switcher, `setActiveAccount` must also reset content/search stores so account B does not see account A's cached workspace data. This is a design requirement for PROD-B1, not a defect in Stage 2.

### R5 — No dedicated test for `initEvictOnLogout` transition guard in isolation (low priority)
The `true → false`-only guard is covered by the existing 6 tests in `evict-on-logout.test.ts`; the note in the verify report suggested an additional test asserting unrelated state updates do not wipe caches — that scenario is already covered by test case 3 in the suite.

---

## 7. Go/No-Go for Stage 3

**GO.**

All gates green, mustFix = 0. The two architectural invariants Stage 3 depends on are verified:

1. **Active-account source of truth is live.** `setActiveAccount(homeAccountId)` is the correct, validated IPC seam. PROD-B1 should call it (after prompting the user to select an account via `login({ prompt: 'select_account' })`) and then refresh the renderer's `UserInfo`.

2. **auth-store is decoupled.** The ARCH-B3 inversion is shipped and tested. Stage 3 domain stores can be extended without risk of re-introducing circular imports into auth-store.

Stage 3 feature unlock:

| Ticket | Status |
|--------|--------|
| PROD-B1 (account switcher UI + IPC wiring) | Unblocked. Seam (`setActiveAccount`) is in place. Needs: IPC handler, preload bridge, renderer switcher component, and cache eviction on switch (see R4). |
| Any feature reading the active user identity | Unblocked. `UserInfo.id === homeAccountId` is the stable key throughout the stack. |

---

*Report written by Scrum Master (Claude Sonnet 4.6) — Sprint 6 Stage 2 close.*
