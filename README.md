# Power BI Viewer

A clean, isolated Power BI viewing experience for the desktop, plus a
companion mobile fleet-ops console.

- **Desktop** (this directory): Electron + React app. Sign in once with your
  work account, browse workspaces and Power BI Apps, view reports/dashboards
  with live data-freshness stamps, run unattended kiosk slideshows on wall
  displays, and audit refresh health on the Insights board.
- **Mobile** (`mobile/`): Expo / React Native app focused on refresh health —
  what broke, what's overdue, what's running — with natively rendered report
  canvases. See `mobile/README.md`.

## Quick start (desktop)

```bash
# 1. Configure Azure AD (one-time): copy .env.example to .env and fill in
#    AZURE_CLIENT_ID and AZURE_TENANT_ID from the app registration.
cp .env.example .env

# 2. Install and run in dev mode (generates config, starts Vite + Electron).
npm ci
npm run dev

# 3. Verify
npm run lint && npm test
npx tsc --noEmit -p tsconfig.main.json && npx tsc --noEmit -p tsconfig.renderer.json

# 4. Package an installer
npm run package:win   # or package:mac
```

## Repository layout

| Path | What it is |
|------|------------|
| `src/main/` | Electron main process: auth (MSAL), Power BI REST client, IPC handlers, settings/usage services, auto-updater |
| `src/renderer/` | React UI: viewers, Insights board, presentation/kiosk mode, stores |
| `src/preload/` + `src/shared/` | The typed IPC bridge and shared types/validation |
| `mobile/` | Separate Expo app (own package.json — `cd mobile && npm ci`) |
| `docs/` | Operator guides (install, updating, go-live runbook) |
| `scripts/` | Build-time config generation, screenshot/PDF tooling |

## Releases and updates

Releases are produced entirely by GitHub Actions (see `docs/UPDATING.md`):
the workflow bumps the version, builds Windows + macOS, publishes a GitHub
Release, and updates `update-policy.json` so installed Windows apps update
automatically. **Do not hand-edit the version or `RELEASE_REQUEST`** — the
latter triggers the release pipeline when committed to `main`.

Operational docs: `docs/INSTALL-GUIDE.md` (end users),
`docs/GO-LIVE-RUNBOOK.md` (tenant/network prerequisites),
`docs/ISSUE-BEACON.md` (opt-in error reporting).

For agent/tooling conventions (build prerequisites, editing hazards, the
two-package layout), read `CLAUDE.md` first.
