# Go-Live Ledger — Desktop Power BI Viewer

Session: production go-live for 0800. Base: `main` @ v2.2.16 (660 tests, four gates green).
Work branch: `claude/pbi-desktop-golive-dz7wk9`.

## Baseline (verified this session)
- `npx tsc --noEmit -p tsconfig.main.json` — PASS
- `npx tsc --noEmit -p tsconfig.renderer.json` — PASS
- `npm run lint` — PASS
- `npm test` — 660 passed (48 files)

## Phase 1 — Research agents (antagonist, read-only) — COMPLETE
All six ran to completion (360–600KB transcripts each). The harness stalled on the
post-completion signal for all six simultaneously (froze mid-final-message at 01:04:51,
no growth after); final reports were intact and harvested directly from the transcripts.
No zombies — work captured. Consolidated in `docs/GOLIVE-FINDINGS.md`.

| Agent | Scope | Status | Top findings |
|-------|-------|--------|--------------|
| A | Auth/MSAL + auto-updater | done (harvested) | C1 unsigned force-update, C2 restart-loop, H1 stale-account token |
| B | Power BI REST client + freshness | done (harvested) | **C1 in-flight refresh shown as fresh data** |
| C | IPC layer + security/window | done (harvested) | C1 export-pdf overwrite, H1/H2 CSP/webview, M1 handlers can throw |
| D | Viewer + kiosk/presentation | done (harvested) | **C1 no slideshow auto-start**, H1 backoff reset, H2 dead-screen |
| E | Insights board + ErrorBoundary | done (harvested) | **C1 ErrorBoundary white-screen/leak**, H3 silent stale refresh |
| F | Settings/usage + build/release | done (harvested) | **C1/C2 beacon PHI+token**, H3 force-lever soak |

Findings I personally re-verified against source: B-C1, A-C1, A-C2, C-C1, E-C1, D-C1, D-H1.

morph/main (ship candidate) — reviewed (31 commits, ~11k LOC, Insights-board FLIP+spring
rebuild; 728 tests, gates green, no protected paths touched). Recommendation: ship as its
own release AFTER go-live soak, not bundled tonight. Owner decision: PENDING.

## Owner decisions (2026-06-15)
- Fix scope: **Confirmed CRITICAL + HIGH**.
- Beacon (F-C1/C2): **leave as-is** — accepted risk, no code change.
- Force lever (F-H3): nobody live right now — **default force-at-release is fine**, no soak.
- morph/main: **include in tonight's release**.

## Phase 2 — Build/fix — COMPLETE
morph/main merged (clean, no conflicts) → new baseline 728 tests.
Fixes applied on top (each gated, tests never below baseline):
| ID | Fix | Files | Tests |
|----|-----|-------|-------|
| B-C1 | in-flight refresh no longer shown as last-refreshed | powerbi/freshness.ts | +4 |
| C-C1 | PDF export bound to one-shot save-dialog allowlist | ipc/export-paths.ts, export.ts, content.ts | +2 |
| A-C2 | forced-install attempt ceiling (no restart-nag loop) | updater.ts | +1 |
| A-H1 | getAccessToken in-flight dedup keyed by account | auth/auth-service.ts | (covered) |
| B-H2 | 401 → one forced-refresh retry before "session expired" | powerbi-api.ts, auth-service.ts | +2 |
| D-C1 | honor autoStartSlideshow at boot (kiosk) | App.tsx | — |
| E-C1 | no raw error.message in prod + unattended auto-retry | ErrorBoundary.tsx | +2 |
| D-H1 | kiosk backoff resets only on sustained load | useKioskRecovery.ts, PresentationMode.tsx | +1 net |
| D-H2 | pause slide advance while error is shown | PresentationMode.tsx | — |
| E-H3 | banner when a refresh fails but stale data remains | InsightsPage.tsx | +1 |

Deferred (owner accepted / out of tonight's scope): A-C1 code-signing, F-C1/C2 beacon,
A-H2/M1/M2 HIPAA at-rest sign-offs, MED/LOW hardening cluster. Tracked in docs/GOLIVE-FINDINGS.md.

## Gates (final, on the merged release branch)
- tsc main: PASS · tsc renderer: PASS · lint: PASS · **tests: 739 passed** (728 + 11)
- `npm run build` (production): PASS (2179 modules; MorphDemo not bundled)

## Ship
Pending final go/no-go: merge `claude/pbi-desktop-golive-dz7wk9` → `main`, then commit
RELEASE_REQUEST on main to trigger release-bridge.yml → build.yml.
