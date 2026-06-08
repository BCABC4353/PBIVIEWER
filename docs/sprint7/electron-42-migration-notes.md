# Sprint 7 — Electron LTS Bump + SEC-S5 (v2.0.0)

**Date:** 2026-06-08
**Owner:** Brendan (PO) · Scrum Master: Claude
**Base:** `v1.9.0` tip (`aefd465`), tagged `v1.9.0-electron28-fallback` as the rollback marker.

---

## 1. What changed (and why the target moved)

The R5 plan called for **Electron 28 → 30 LTS**. That target is now **obsolete**: by
mid-2026 Electron 30 is itself past end-of-life, and Electron has no "LTS" channel —
only the latest **3 major versions** receive security backports. Landing on 30 would
re-create the same unsupported-runtime problem this sprint exists to fix.

**Retarget: Electron `28.3.3` → `42.3.3`** (current latest stable, supported).

| Item | Change |
|------|--------|
| `package.json` | `electron` devDependency `^28.2.0` → `^42.3.3` |
| `src/main/auth/auth-service.ts` | **SEC-S5**: `clearCookieJarsSequential` now clears the full per-account web-storage set (`cookies`, `localstorage`, `indexdb`, `serviceworkers`, `cachestorage`) on every session jar, not just cookies — so a switched-to account cannot surface the prior account's cached Power BI content. `CookieJarPort` type widened to match. |
| `src/main/auth/auth-service.test.ts` | New SEC-S5 test asserting the extended storage set; existing sequential-clear assertions preserved. |

---

## 2. Security outcome

`npm audit` after the bump: **the Electron advisory cluster is gone** (the ~17
high-severity Chromium/Electron CVEs that flagged on 28.3.3 no longer appear).

Remaining advisories are **all deferred Sprint 8+ items**, not Electron:
- `node-tar` (transitive via **electron-builder 24** → fixed by SEC-S8 electron-builder 26)
- `esbuild` dev-server (transitive via **vite 7** → fixed by SEC-S9 vite 8)
- `uuid` (minor)

These are packaging/build-tool dependencies, not the shipped runtime.

---

## 3. Gates — what was verified HERE (headless CI)

| Gate | Result |
|------|--------|
| `tsc -p tsconfig.main.json` | PASS (exit 0) — **no compile breakage from the 14-major jump** |
| `tsc -p tsconfig.renderer.json` | PASS |
| ESLint (changed files) | PASS |
| `vitest run` | PASS — **198/198** |
| `npm run build` (tsc main + vite build) | PASS |
| `npm audit` | Electron CVEs cleared |

**Why it compiled clean:** Electron's TypeScript surface is largely backward-compatible
across majors; the breaking changes 28→42 are predominantly **runtime behavior**, not
type signatures. Every API the app uses (`onHeadersReceived`, `clearStorageData`,
`printToPDF`, `<webview>`, `setWindowOpenHandler`, `powerSaveBlocker`, `safeStorage`,
`session.fromPartition`) still exists in the v42 type definitions — so no blind rewrites
were performed. Rewriting working, security-sensitive code that cannot be runtime-tested
in this environment would have *introduced* risk, not reduced it.

---

## 4. What was NOT verified here (do this at the hotel — ~3 minutes)

This is a **headless Linux container**: no display, no real Azure credentials, no Power BI
network. The **runtime** behavior of an Electron major bump cannot be validated here. On a
real machine, run `npm install` (this downloads the Electron 42 binary, which was skipped
in CI), then `npm run dev` (or launch the packaged build) and walk this checklist:

> **Prerequisite on your machine:** the bump pulls `@electron/get` 5.x, which requires
> **Node ≥ 22.12** to download the Electron 42 binary. Check with `node -v`; if older, run
> `npm install` will fail at the electron postinstall. Upgrade Node (or use nvm) first.

### Hotel smoke checklist
1. **App launches** — window opens, no white screen, no console errors on boot.
2. **Sign in** — the AAD login window appears and completes; you land on Home.
3. **Open a report** — it embeds and renders. (Validates the powerbi-client embed + CSP.)
4. **Open an App** — loads `app.powerbi.com` in the `<webview>`. (Validates webview
   partition isolation + CSP header injection via `onHeadersReceived` — the highest
   runtime risk.)
5. **Run a slideshow** — auto-advance + the kiosk controls work.
6. **Switch / re-login as a different account** — confirm the second account does NOT see
   the first account's cached workspaces/reports. (Validates **SEC-S5** storage clearing.)
7. **Export a report to PDF** — confirm the page dimensions look correct. (Validates
   `printToPDF`.)

### Highest-risk runtime watch-items (if something breaks, look here first)
| Risk | File | Symptom | Note |
|------|------|---------|------|
| CSP injection no longer fires | `src/main/security.ts` (`onHeadersReceived`) | Power BI embed blocked / CSP console errors | API still present in v42 types; behavior is the watch-item |
| `<webview>` partition isolation | `src/renderer/components/viewer/AppViewer.tsx` | App webview blank or auth fails | `webviewTag: true` confirmed set in `window.ts` |
| `clearStorageData` behavior | `src/main/auth/auth-service.ts` | logout/switch doesn't fully clear | storage keys confirmed valid for v42 |
| `printToPDF` page sizing | `src/main/services/export-service.ts` | wrong PDF dimensions | microns option shape unchanged in types |
| `safeStorage` (Node 20) | `src/main/auth/token-cache.ts` | token cache decrypt fails on launch | Node 18→20 bundled in 42 |

---

## 5. Rollback (one command)

If the v42 build misbehaves at runtime and you need the known-good v1.9.0:

```bash
git reset --hard v1.9.0-electron28-fallback
npm install            # restores Electron 28.3.3 (downloads its binary)
npm run build
```

The rollback tag points at the last fully-shipped v1.9.0 commit (`aefd465`). No data or
settings are affected (settings live in electron-store on disk, independent of version).

---

## 6. Deferred to Sprint 8+

Unchanged from the R5 backlog, and reconfirmed by this sprint's `npm audit`:
- **SEC-S7** msal-node v2 → v5 (Windows broker / WAM — reduces interactive sign-in)
- **SEC-S8** electron-builder 24 → 26 (clears `node-tar`; also required to *package* Electron 42 — verify at first release build)
- **SEC-S9** vite 7 → 8 (clears `esbuild` dev-server advisory)

> ⚠️ **Packaging note:** this sprint bumped the Electron **runtime** and verified
> compile/test/build. It did **not** run `npm run package` (no signing/distribution in CI).
> electron-builder is still v24; confirm it packages Electron 42 cleanly at your next
> release build — if not, pull SEC-S8 (electron-builder 26) forward.
