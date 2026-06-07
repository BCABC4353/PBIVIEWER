# Sprint 5 (v1.8.0) — Dispatch Brief

> **Status:** STAGED — awaiting owner go before building. Nothing will be dispatched until approved.
> **Theme:** Auth correctness + Auto-Start + Architecture Reset. The largest, most coupling-sensitive sprint of the round.
> **Base:** `sprint0-hardening` @ `89eb571` (v1.7.0 committed locally, not pushed).
> **Source plan:** `docs/IMPLEMENTATION-PLAN-R5.md` §Sprint 5. Sweep backlog folded in from `docs/backlog/R5-SWEEP-BACKLOG.md`.

---

## 1. The one hard rule that shapes everything: ARCH-B1 lands SOLO, first

`src/main/index.ts` (~850 LOC after Sprint 4) splits into `main/security.ts`, `main/window.ts`, `main/services/export-service.ts`, and `main/ipc/{auth,content,settings,usage,window,export,app,log}.ts` + `main/ipc/register.ts`. **Almost every main-process task this sprint targets a file that does not exist until the split lands.** Therefore:

1. **Pre-split tag first:** `git tag v1.7.0-pre-arch-split` (local; tag is an owner-gated action — I will ask before tagging).
2. **ARCH-B1 runs alone on Day 1.** No other main-process work merges until the split is green (tsc + lint + vitest + every prior `ipcMain.handle` channel still registered).
3. **Then fan-out.** All main-process tasks below target the POST-SPLIT file layout, not `index.ts`.

This is the single biggest sequencing risk in the whole round; the pre-split tag is the rollback.

---

## 2. Lane map (owners + folded-in sweep items)

> Effort: XS ≤1h · S 1–3h · M 3–6h · L 1–1.5d · XL >1.5d. Sweep additions marked **[NEW-*]**.

### Day 1 — ARCH-B1 (SOLO) — `code-refactoring:legacy-modernizer` under a `TeamCreate` review trio
`architect-review` + `code-reviewer` + `typescript-pro` cross-check the coupled split diff (the one place the methodology calls for an agent *team*, not fan-out).
- **ARCH-B1** (XL): the split. DoD: `index.ts` ≤ 150 LOC; channel-parity grep (every handler still registered); tsc both projects; vitest green.

### Lane A — Architecture & DI (single owner across post-split main files)
- **ARCH-B2** (M): consolidate validation → `src/shared/validation.ts` (UUID_REGEX, NAME_MAX, validateUUID, capName, validateAppSettingsPatch).
- **ARCH-B4** (L): factory + DI — `createAuthService(deps)`, `createPowerBIApiService(deps)`, `singleton.ts`; **revive the 2 skipped tests** (this is where SEC-S4's assertion from Sprint 4 starts executing).
- **ARCH-S1** (S): expose `teardownNow()` from `usePowerBIEmbed`; remove PresentationMode embed back-door. *(touches usePowerBIEmbed.ts → coordinate with Lane F; assign to Lane F owner — see ownership table.)*
- **ARCH-S3** (M): move `IPCResponse`+`TokenResult` to `ipc-types.ts`; delete dead `lastAccessed`.
- **ARCH-S4** (S): rename `shared/utils.ts` → `shared/powerbi-errors.ts`.
- **ARCH-S5** (M): IPC channel-name map `src/shared/ipc-channels.ts`; delete dead `content:get-recent`.
- **ARCH-S10** (M): magic-number consolidation into `constants.ts` groups.
- **[NEW-PERF-1]** (S): ~30s load timeout on the export-PDF hidden window — now lives in `main/services/export-service.ts` post-split.
- **[NEW-CI-5]** (XS): add `src/test` to a tsconfig so the harness is type-checked (a real TS6133 hides there).
- **[NEW-CI-2]** (S): preload contextBridge channel-map contract test (pairs with ARCH-B4 test revival).
- **[NEW-DEP-1]** (XS): move `dotenv` to devDependencies.

### Lane B — Behavior / Auth (SINGLE OWNER: `auth-service.ts`)
- **BEH-B1 + BEH-B2** (M, bundled): partition cookie symmetry (sequential await, fail-loud, pre-login proactive sweep, `reusedPreviousAccount` flag) + token-cache corruption hook + `invalidateCache()`.
- **BEH-B3** (L): per-user usage scoping by `homeAccountId`; `usageClearOnLogout` setting; **pre-migration backup** `usage.pre-v1.7.0.bak.json` + count log + CHANGELOG. (PROD-S4 merged in.)
- **[NEW-AUTH-2]** (S): make `isAuthenticated()` non-mutating / `initializeCache` idempotent — stop overwriting `this.account` on every read.
- **[NEW-AUTH-3]** (XS): key `lastKnownExpiry` by `homeAccountId` (BEH-B2 rider).

> ⚠️ **NEW-AUTH-1 is NOT in this sprint** — it's the Sprint 6 active-account-source-of-truth and the hard prerequisite for PROD-B1. Lane B should leave a clear seam for it (don't entrench `accounts[0]` further).

### Lane C — Product (auto-start + Home)
- **PROD-B2** (L): `autoStartReportId`/`autoStartMode`/`autoStartWorkspaceId` → SettingsPage Card + `App.tsx` boot deep-link + ItemCard menu.
- **PROD-B3** (M): HomePage always-visible CTA + Featured strip + substantive empty state (+ vitest "CTA visible after nav cycle").
- **[NEW-PROD-5]** (S): targeted evict of dead recent/frequent usage entries on 404 (HomePage + content-store) — pairs with BEH-B3.

### Lane D — UX viewer cluster (SINGLE OWNER: the 3 viewer files)
- **UX-B4** (M): extract `ViewerToolbar`; migrate ReportViewer/Dashboard/AppViewer (PresentationMode deferred to Sprint 6 UX-B4b).
- **UX-S4/S6/S13/S14** (XS–S): max-width rule, shadow scale, type-color tokens, ReportViewer breadcrumb.
- **UX-S5** (S, **dependsOn A11Y-B5 ✓ landed**): ItemCard/AppCard → shared `ContentCard`; **preserve the keyboard vitest case**.
- **[NEW-UX-2]** (XS): canonical per-type icon-color token map (fold into UX-S13).
- **[NEW-UX-3]** (XS): disabled/in-progress state on viewer Refresh buttons.
- **[NEW-ARCH-1]** (S): extract `useViewerExport` to dedupe ReportViewer↔DashboardViewer (~70 lines) — same owner as the viewer migration to avoid collision.
- **[NEW-PROD-4]** (XS): freshness timestamp TZ label + 4-digit year.

### Lane E — A11Y SettingsPage + shell (SINGLE OWNER: `SettingsPage.tsx`)
- **A11Y-S5** (M): all Settings controls in Fluent `<Field>` (largest single a11y item — day-3 mid-sprint check; scope-cut to kiosk-relevant sections if it overruns).
- **A11Y-S6** (XS): theme buttons role=group + aria-pressed.
- **A11Y-S7** (M): heading hierarchy + sr-only h1 in viewers.
- **[NEW-A11Y-3]** (S): banner/contentinfo landmarks + named `<main>` in `AppShell.tsx` (extends Sprint 4's skip link).

### Lane F — Behavior/Perf coordination (SINGLE OWNER: `usePowerBIEmbed.ts` + PresentationMode)
- **BEH-S1 + PERF-S1** (S, bundled): auto-refresh interval via refs not deps.
- **PERF-S2** (S, dependsOn ARCH-S1): PresentationMode uses `teardownNow()`.
- **PERF-S3** (S): electron-log maxSize 5MB + archive + onError rate-limit (now in `main/ipc/log.ts` post-split).
- **PERF-S4** (XS): PresentationMode mousemove dedupe.
- **BEH-S2..S7** (XS–S): settings optimistic write, WorkspacesPage retry helper, recordItemOpened auth-check, AppViewer online retry, login 130s timeout, userMessage preference.
- **[NEW-ARCH-2]** (XS): typed `EmbedEvent<T>` for the SDK event contract.
- **[NEW-BEH-1]** (S): gate PresentationMode auto-start behind `hasAutoStartedRef` so Pause works.
- **[NEW-BEH-2]** (S): ErrorBoundary Try-Again key-bump/navigate (`ErrorBoundary.tsx`).

### Lane G — Product polish + CI hygiene
- **PROD-S2/S3/S7/S8/S10** (XS–S): check-for-updates, avatar tenant chip, sign-out confirmation hook, ReportViewer Back, slide progress bar.
- **[NEW-CI-3]** (S): vitest coverage threshold + CI runs `test:coverage`.
- **[NEW-CI-6]** (XS): workflow `concurrency` groups.
- **[NEW-CI-7]** (XS): lint `scripts/generate-config.js` (+ Node globals; also fixes the pre-existing `tailwind.config.js` no-undef).

---

## 3. Single-owner-per-file table (collision avoidance — the critical discipline)

| File | Sole Sprint-5 owner | Tasks |
|---|---|---|
| `src/main/index.ts` → post-split tree | ARCH-B1 (Day 1) then Lane A | the split, then B2/S3/S4/S5/S10 |
| `src/main/auth/auth-service.ts` | **Lane B** | BEH-B1/B2/B3, NEW-AUTH-2/3, ARCH-B4 auth-service touch (after BEH lands) |
| `src/renderer/hooks/usePowerBIEmbed.ts` | **Lane F** | BEH-S1, PERF-S1, PERF-S2, ARCH-S1, NEW-ARCH-2, BEH-S7 |
| `src/renderer/components/viewer/PresentationMode.tsx` | **Lane F** | PERF-S2, PERF-S4, NEW-BEH-1 (no decomposition — Sprint 6) |
| 3 viewer files (Report/Dashboard/App) | **Lane D** | UX-B4, UX-S14, NEW-UX-3, NEW-ARCH-1, NEW-PROD-4 |
| `src/renderer/components/settings/SettingsPage.tsx` | **Lane E** | A11Y-S5/S6, PROD-B2 settings Card, PROD-S2 (coordinate via Lane E owner) |
| `src/renderer/components/home/HomePage.tsx` | **Lane C** | PROD-B3, NEW-PROD-5 |
| `src/renderer/components/home/ItemCard.tsx` | **Lane D** | UX-S5 (preserve A11Y-B5 keyboard test) |
| `src/renderer/App.tsx` | **Lane C** | PROD-B2 boot deep-link (route announcer from Sprint 4 stays) |
| `src/shared/constants.ts` | **Lane A** | ARCH-S10 |
| `src/renderer/components/layout/AppShell.tsx` | **Lane E** | NEW-A11Y-3 |

> Conflict note: SettingsPage is touched by A11Y (Lane E), PROD-B2 (Lane C), PROD-S2 (Lane G). **Lane E owns the file**; Lane C/G submit their SettingsPage changes as Lane-E-reviewed edits, or Lane E absorbs them. Same model as Sprint 4's TitleBar single-owner.

---

## 4. Dependency graph

```
TAG v1.7.0-pre-arch-split (owner-gated)
  -> ARCH-B1 SOLO (green gate) 
       -> Lane A (arch/DI)         [main-process files now exist]
       -> Lane B (auth-service)    [parallel]
       -> Lane C (product/home)    [parallel]
       -> Lane D (viewers)         [parallel]
       -> Lane E (settings/shell)  [parallel]
       -> Lane F (embed/presentation) [parallel; PERF-S2 after ARCH-S1]
       -> Lane G (polish/CI)       [parallel]
  -> Review (PO + antagonist + code-reviewer)
  -> Gate-fix loop (tsc x2 + eslint + vitest + channel-parity grep + index.ts ≤150 LOC)
  -> Verify -> Report
```

Forward constraint recorded for **Sprint 6**: **NEW-AUTH-1 must land before/with PROD-B1.**

---

## 5. Gate criteria (Sprint 5 exit)

- **HARD:** tsc(main+renderer) + `eslint src --max-warnings=0` + `vitest run` green; `index.ts` ≤ 150 LOC; both previously-skipped tests now **active** with real assertions; channel-parity grep (every pre-split `ipcMain.handle`/`.on` still registered); coverage threshold (NEW-CI-3) met.
- **SOFT (owner):** two-tenant smoke (sign in A → out → in B → recent shows only B); autoStart smoke (set → restart → lands on item); refactor-no-regression vs v1.7.0; `architect-review` on the split reports no circular imports.
- **Git:** local commit on green; **pre-split tag, push, release all owner-gated — I ask first, every time.**

---

## 6. Tooling

- **TeamCreate** (the one coupled-refactor team): `architect-review` + `code-reviewer` + `typescript-pro` on the ARCH-B1 split.
- **Workflow fan-out** for Lanes A–G (disjoint files, post-split).
- `code-refactoring:legacy-modernizer` executes ARCH-B1; `unit-testing:test-automator` for ARCH-B4 test revival + NEW-CI-2/3.
- `/security-review` (SOFT) on the auth diff; `comprehensive-review:full-review` (SOFT) at exit.

---

**Awaiting owner go.** On approval I will: (1) ask to create the `v1.7.0-pre-arch-split` tag, (2) dispatch ARCH-B1 solo, gate it, then (3) fan out Lanes A–G. No build starts until you say go.
