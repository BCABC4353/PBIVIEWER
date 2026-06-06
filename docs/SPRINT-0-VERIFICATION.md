# Sprint 0 — Behavioral Verification Checklist (your SOFT gates)

All code is implemented, typechecks clean, passed the antagonist review (no blockers), and CI produced a real Windows installer. The items below are the **behavioral checks that need a human + a live Azure AD login** — they can't be proven by `tsc`/CI. Run them, tick each box, and tell me which (if any) fail.

> **Get the build to test:** the proven installer is attached to the latest **Actions run** (workflow "Build and Release", run on branch `sprint0-hardening`) as the `windows-installer` artifact — `Power BI Viewer-1.2.1-Windows-Setup.exe`. Or build locally: `npm run package:win` (output in `build-output\`).
>
> ⚠️ **Several of these REQUIRE the packaged installer, not `npm run dev`.** The CSP fix is intentionally inactive in dev (so Vite keeps working) — testing CSP/embeds in dev proves nothing.

## Critical — must pass before distributing

- [ ] **CSP didn't break embeds (SEC-01)** — *packaged build only.* Install, sign in, open a **report** and a **dashboard**. They must render normally. (If they load, the production CSP is active and not blocking them — the exact failure mode we were guarding against.)
- [ ] **No stuck spinner (VIEW-01/06)** — Open a report you do **not** have permission to (or disconnect mid-load). Within ~45 s you should get an error message **+ a "Try again" button**, never an endless "Loading report…". Check all three: report, dashboard, presentation.
- [ ] **Routine expiry no longer logs you out (AUTH-01)** — Sign in, use the app, leave it long enough for the token to age (or next-day relaunch). You should **stay signed in / silently refresh**, not get bounced to a fresh login every launch.
- [ ] **Account switching works (AUTH-02)** — Sign out, then sign in. You should get the **"Pick an account"** screen (not silently SSO'd back into the same account).

## Important

- [ ] **Single instance (SEC-02)** — Launch the app, then double-click the icon again. It should **focus the existing window**, not open a second one.
- [ ] **Fullscreen interaction (VIEW-03)** — Open a report, go fullscreen, click a **slicer / dropdown**. It should **stay open and respond** (previously focus was yanked away ~5×/sec). Arrow keys should still page through the report.
- [ ] **Slideshow interval persists (VIEW-07)** — In presentation mode, open Settings (gear), change the interval. Exit and re-enter presentation — your value should **stick**, and the range should match the Settings page slider (both 5 s–5 min now).
- [ ] **Window-open denied (SEC-03)** — In normal use nothing should pop up a second app window; any external link should open in your **system browser**.

## Nice to confirm

- [ ] **Corrupt usage file doesn't crash (USAGE-01)** — *(optional)* With the app closed, corrupt `%APPDATA%\usage-tracking\config.json` (put random text in it), then launch. The app should **still boot to the login screen** (recent-items history may reset — that's fine).
- [ ] **Install guide works (DIST-01)** — Have a non-technical person follow `docs/INSTALL-GUIDE.md` on a clean machine: download → SmartScreen "More info → Run anyway" → installs and launches.
- [ ] **Memory stays flat (VIEW-02)** — *(eyeball, no harness yet)* Open/close ~20–30 reports over a few minutes with DevTools Memory open; the detached-node / listener count should not climb steadily. (A real automated heap gate lands in Sprint 1.)

---

## Notes / deferred (so nothing's a surprise)
- **macOS build:** currently fails in CI (`hdiutil` DMG error on GitHub runners). Decoupled from the Windows release; not a Monday target. Can be fixed later.
- **Version number:** the installer is still `1.2.1`. Before the real Monday release, bump `package.json` version (e.g. `1.3.0`) so users can tell builds apart, then tag `vX.Y.Z` to cut the GitHub Release.
- **`<meta>` CSP fallback & `frame-ancestors`:** intentionally deferred (a static one would break Vite dev). The header-based CSP is the active protection; a build-only meta injection can come later.
- **Unsigned:** SmartScreen warning is expected on every install until a code-signing cert is obtained (the #1 backlog item).

When you've run these, tell me what passed/failed and I'll either fix-forward or kick off **Sprint 1** (resilience, telemetry, the `usePowerBIEmbed` refactor).
