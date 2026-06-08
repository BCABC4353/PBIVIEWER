# Power BI Viewer — Go-Live Runbook

**For: rolling out to ~20 users in one Microsoft 365 tenant.**

The single most important truth from our antagonist sweep: **the things most likely to break go-live are NOT in the app code — they are Azure/tenant/network settings only an admin can change.** The app itself is well-hardened (see "Already safe" below). Spend your remaining time on the checklist and the pilot test, not the code.

---

## ⭐ Do this first: the 15-minute pilot test (highest payoff)

Before sending the link to all 20 people, have **ONE non-admin user** (not you the super-admin) do a full run on a **real, normal corporate machine** behind the **normal network**:

1. Download + install the **newest** release (Windows: *More info → Run anyway* past SmartScreen).
2. **Sign in** with their work account.
3. Open a **report** (uses the built-in viewer) **and** an **app** (uses the embedded browser). Confirm both actually render data.

What the failure tells you:

| What the pilot user sees | Root cause | Fix (who) |
|---|---|---|
| "**Need admin approval**" / can't consent | Admin consent not granted | Admin — checklist #1 |
| "Sign in failed" + an **AADSTS…** code | Redirect URI / public-client not set | Admin — checklist #2 |
| Sign-in window works, then **"Can't reach Power BI… contact IT"** or a blank/long hang | Proxy / TLS inspection | Network team — checklist #5 |
| App blocked / "your administrator has blocked" / exe vanishes | AppLocker/WDAC/Defender/AV | Admin — checklist #4 |
| Reports work but **apps** don't | Embedded-browser / proxy | Network team — checklist #5 |

**If the pilot is clean end-to-end, you are safe to roll out.** If not, you've found the blocker before 20 people hit it.

---

## ✅ Pre-go-live checklist (admin / network — only these can fix the real blockers)

### P0 — these block **every** user if wrong

1. **Grant admin consent for the Power BI permissions.**
   The app requests `Report.Read.All`, `Dashboard.Read.All`, `Workspace.Read.All`, `App.Read.All`, `Dataset.Read.All` — these usually require **tenant admin consent**. Without it, every non-admin user is stopped with "Need admin approval."
   - Entra admin center → **Enterprise applications** → find the app (client ID `ee7edf76-d666-4e27-8ee7-fbc19648c4f4`) → **Permissions** → **Grant admin consent for <your tenant>**.
   - *Verify:* the pilot user signs in without a consent/approval prompt.

2. **Confirm the app registration is a public client with the right redirect.**
   - App registrations → (the app) → **Authentication**:
     - Platform **"Mobile and desktop applications"** with redirect URI exactly **`http://localhost`** (no port, no trailing slash).
     - **"Allow public client flows" = Yes.**
   - *Verify:* sign-in does not fail with `AADSTS50011` (redirect mismatch).

3. **GitHub build credentials — already verified ✅.**
   Repo secrets `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` are set, and the Windows build succeeded with them, so the released app ships with the correct IDs baked in. No action needed.

### P1 — these block **some** users / environments

4. **Endpoint policy on managed machines.** An **unsigned** app installs to `%LOCALAPPDATA%`. Default AppLocker/WDAC/SRP, Defender ASR ("block executables unless they meet prevalence/trust"), or managed AV can hard-block or quarantine it.
   - Ask the endpoint admin to confirm none of these are enforced, or to allowlist the app's install path/hash.
   - *Verify:* the pilot install runs on a **fully-managed** machine (the canary).

5. **Corporate proxy / TLS inspection.** The sign-in window and the embedded app browser use the system proxy + OS certificate store and work fine. But the app's **background** calls (the sign-in token exchange and all Power BI data calls) use Node's network stack, which on a **TLS-inspecting** or **authenticating-proxy** network can fail *after* the login window succeeds.
   - Ask the network team: is there SSL/TLS inspection or a required auth proxy? If yes:
     - Ensure the **corporate root CA** is in each machine's OS trust store, **and**
     - Allowlist / bypass inspection for `login.microsoftonline.com`, `api.powerbi.com`, `app.powerbi.com`, `aadcdn.*`.
   - Tonight's build now **logs certificate errors** and shows a clear *"Your network may require a proxy or a security certificate — contact IT"* message instead of a blank window, so this is diagnosable.

6. **Conditional Access.** If a CA policy requires a **compliant/Intune-managed device** or **approved app** for Power BI / Office 365, the embedded sign-in window may not satisfy it. Confirm with the admin; if needed, scope an exclusion for the pilot group.

7. **Roster.** Confirm all 20 are **members** of the tenant (not external guests). Members on any verified domain are fine; a guest who only exists in their home tenant will fail.

---

## 🟢 Already safe — do NOT spend time here (verified in code)

- **Single-instance lock** (no double-launch partition corruption) and **global crash handlers** in the main process.
- Window is **always centered at a fixed size** — no "invisible app on a disconnected monitor" risk.
- **Sign in once**: the auth window shares the same session/cookies as the app browser, so SSO is reused.
- **Credentials baked into the build**; **tokens encrypted at rest** (Windows DPAPI via safeStorage).
- **Empty tenant / first run** render proper "Welcome / Browse Workspaces" states — no crash.
- **Launch-on-startup** auto-open falls back to Home gracefully if the saved item is gone.

---

## 🔧 Hardening shipped in this build (tonight)

1. **Startup can't silently die** — if auth init throws, the window still opens to the login screen (no "double-clicked, nothing happened").
2. **Self-healing settings & token stores** — a power-loss/AV-truncated config file resets to defaults instead of crashing at launch with no recovery.
3. **Certificate-error logging** + a friendly **"contact IT (proxy/certificate)"** message so proxy/TLS failures are diagnosable, not a blank window.
4. **App load watchdog (45s) + crash recovery** — a blocked/stalled embedded app shows a *Try again* button instead of spinning forever.
5. **Broader sign-in host allowlist** (`login.windows.net`, `*.b2clogin.com`) so federated/B2C sign-in redirects aren't silently blocked.
6. **Release pipeline can't be zeroed by a Mac flake** — the Windows installer now publishes even if the macOS job fails; the macOS job retries the (transiently 504-ing) Electron download.
7. **macOS ad-hoc signing** — Apple Silicon now gets the recoverable *"unidentified developer → Open Anyway"* path instead of the dead-end *"damaged, move to Trash."*
8. **Install guide fixed** — Mac "damaged" recovery (the `xattr -cr` one-liner) documented; the SHA-256 verification section corrected.
9. **Auto-start "open an app" setting now persists** (was silently dropped before).

---

## ⏭️ Accepted for go-live / fast-follow (not blockers tonight)

- **Windows SmartScreen "Unknown publisher"** — a click-through for most users (*More info → Run anyway*). Real fix: an **OV/EV (or Azure Trusted Signing) certificate** — the #1 fast-follow; it also lets endpoint admins allowlist by publisher instead of by hash.
- **macOS warning on first open** — reduced to the recoverable path by ad-hoc signing; fully removed only by an **Apple Developer ID + notarization**.
- **Full proxy/TLS support in background calls** — the proper fix is routing the app's background HTTP through Electron's Chromium network stack (system proxy + OS cert store). Larger change; do it post-launch if the pilot reveals an inspecting proxy.
- **SHA-256 in release notes** — add a CI step to publish per-asset hashes (guide now says "on request").
- **GitHub Actions versions** — bump `checkout`/`setup-node`/`upload-artifact` before mid-June 2026 (Node 20 deprecation), maintenance only.

---

*Bottom line: the app is solid. Get **admin consent + redirect/public-client** confirmed, run **one real pilot login that opens a report AND an app**, and you're clear to roll out.*
