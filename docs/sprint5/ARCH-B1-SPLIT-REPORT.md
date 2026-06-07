# ARCH-B1 Main-Process Split — Sprint 5 Report

**Date:** 2026-06-07
**Rollback tag:** `v1.7.0-pre-arch-split`
**Baseline commit:** `89eb571`

---

## Summary

ARCH-B1 is a pure structural refactor: no logic changes, no behavior changes, no new dependencies. `src/main/index.ts` has been decomposed from a 816-line monolith into a 48-line thin bootstrap, with all handler bodies relocated verbatim into focused modules under `src/main/ipc/`, `src/main/services/`, and two new top-level files (`security.ts`, `validation.ts`, `window.ts`).

---

## index.ts LOC

| Metric | Value |
|---|---|
| Baseline (89eb571) | 816 LOC |
| After split | 48 LOC |
| Reduction | 768 LOC (94%) |

The post-split `index.ts` is a thin bootstrap only: `setupLogging`, single-instance lock, `whenReady` (installs CSP, initializes `authService`, calls `createWindow`, registers `activate`), `window-all-closed`, `registerWebviewSecurity`, and `registerAllIpcHandlers`.

---

## New File Layout

```
src/main/
  index.ts                        48 LOC  (thin bootstrap — was 816)
  security.ts                     NEW     installCsp, isValidExportPath,
                                          isAllowedPowerBIHost,
                                          registerWebviewSecurity,
                                          APP_CSP (private),
                                          POWERBI_ALLOWED_HOSTS (private)
  validation.ts                   NEW     UUID_REGEX, validateUUID
                                          (shared by ipc/content, ipc/usage,
                                          ipc/settings — extracted to avoid
                                          triplicate definitions)
  window.ts                       NEW     createWindow, getMainWindow accessor,
                                          module-local mainWindow,
                                          isDev (re-exported for ipc/app,
                                          index.ts), per-window will-navigate
                                          + setWindowOpenHandler guards
  services/
    export-service.ts             NEW     exportCurrentViewPdf(mainWindow,
                                          options) — export:current-view-pdf
                                          PDF body relocated verbatim; no
                                          load-timeout added (NEW-PERF-1
                                          deferred to later task)
  ipc/
    register.ts                   NEW     registerAllIpcHandlers() — calls
                                          each domain register fn in the
                                          original index.ts ordering
    auth.ts                       NEW     registerAuthIpc()
    content.ts                    NEW     registerContentIpc()
    settings.ts                   NEW     registerSettingsIpc(),
                                          validateSettingsUpdate (local)
    export.ts                     NEW     registerExportIpc()
    usage.ts                      NEW     registerUsageIpc()
    window.ts                     NEW     registerWindowIpc()
    app.ts                        NEW     registerAppIpc()
    log.ts                        NEW     registerLogIpc(), setupLogging()
                                          (electron-log init side-effects;
                                          called by index.ts before app ready)
```

### Dependency direction (acyclic, no DI introduced)

```
index.ts
  -> security.ts
  -> window.ts
  -> ipc/register.ts
  -> ipc/log.ts (setupLogging)

ipc/*
  -> window.ts (getMainWindow)
  -> security.ts (isValidExportPath, isAllowedPowerBIHost)
  -> validation.ts (validateUUID)
  -> services/export-service.ts
  -> src/shared/*

services/export-service.ts
  -> security.ts (isValidExportPath)
```

No file outside `index.ts` previously imported any symbol from `index.ts` (confirmed by grep), so no external consumers required updates.

---

## Channel Parity

| Metric | Result |
|---|---|
| Baseline channels (89eb571) | 36 |
| Post-split channels | 36 |
| Missing | 0 |
| Extra | 0 |
| **PARITY** | **PASS** |

> Note: A naive line-by-line `Select-String` grep undercounts by 2. `content:export-report-pdf` and `export:current-view-pdf` have the channel string on the line *after* `ipcMain.handle(`. Parity was confirmed with a multiline-aware `Out-String` regex pass over the raw text; both sides equal 36.

### All 36 channels (registration order preserved)

| Domain | Channels |
|---|---|
| window | `window:minimize`, `window:maximize`, `window:close`, `window:is-maximized`, `window:set-title-bar-overlay` |
| auth | `auth:login`, `auth:logout`, `auth:get-user`, `auth:get-token`, `auth:is-authenticated`, `auth:validate-token` |
| content | `content:get-workspaces`, `content:get-reports`, `content:get-dashboards`, `content:get-dashboard`, `content:get-apps`, `content:get-app`, `content:get-app-reports`, `content:get-app-dashboards`, `content:get-embed-token`, `content:export-report-pdf`, `content:get-dataset-refresh-info`, `content:get-all-items`, `content:get-recent` |
| settings | `settings:get`, `settings:update`, `settings:reset` |
| export | `export:choose-pdf-path`, `export:current-view-pdf` |
| usage | `usage:record-open`, `usage:get-recent`, `usage:get-frequent`, `usage:clear` |
| app | `app:get-partition-name`, `app:get-version` |
| log | `log:open-folder` |

---

## Gate Status

| Gate | Result |
|---|---|
| `tsc -p tsconfig.main.json --noEmit` | PASS (exit 0) |
| `tsc -p tsconfig.renderer.json --noEmit` | PASS (exit 0) |
| `eslint src/main --max-warnings=0` | PASS (exit 0, 0 warnings) |
| `vitest` | PASS |
| Channel parity (36 == 36) | PASS |
| `index.ts` LOC <= 150 | PASS (48 LOC) |
| **All green** | **YES** |

---

## Implementation Notes

- `noUnusedLocals` and `noUnusedParameters` are on in tsconfig; all imports are exercised.
- Service acquisition uses the existing module-singleton pattern throughout. No dependency injection introduced (DI is ARCH-B4, a later task).
- Registration order in `ipc/register.ts` is byte-identical to the original `index.ts` ordering: window → auth → content → settings → export → usage → app → log.
- Handler bodies are verbatim relocations. No logic was altered, no bugs were fixed, no channels were renamed.

---

## Residual Issues

No code defects found. Two process notes for future parity-check scripts:

1. **Multiline channel grep required.** Two handlers (`content:export-report-pdf`, `export:current-view-pdf`) place the channel string on the line after `ipcMain.handle(`. Any future channel-parity script must use a multiline-aware regex (e.g. `Out-String` + `-match` in PowerShell, or `rg -U`) to avoid a false "missing channel" alarm.

2. **NEW-PERF-1 deferred.** `exportCurrentViewPdf` in `services/export-service.ts` has no load timeout guard (the body is verbatim from the baseline). A load-timeout improvement was noted during review but intentionally deferred — this sprint is structural only.

---

## Must-Fix Count

**0** — reviewer found zero must-fix items. Parity, behavior, and cycle checks all clear.

---

## Go / No-Go for Sprint 5 Lanes A-G

**GO.**

All gates are green, channel parity is exact (36/36), registration order is preserved, and the dependency graph is acyclic with no DI introduced. The working tree is a stable, compilable base. Rollback to `v1.7.0-pre-arch-split` is available if any lane uncovers a regression.

Lane owners should branch from the current working tree state (post-ARCH-B1). Each lane's imports now resolve to focused modules rather than `index.ts`, which is the intended outcome of this split.
