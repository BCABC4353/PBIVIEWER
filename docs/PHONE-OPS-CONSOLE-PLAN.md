# Phone Ops Console — Build Plan (Go/No-Go Brief)

*A decision-grade plan for a mobile companion to the existing Electron "Power BI Viewer" (`/home/user/PBIVIEWER`, app v2.1.6). Written for the owner — smart, not a React Native expert. Honest about cost, effort, and the one piece that genuinely needs a server.*

---

## TL;DR

- **What to build:** A native iOS/Android app that is a **proactive fleet-ops console** for your Power BI estate — refresh health at a glance, "supposed to refresh but didn't" alerts, who's-using-what — with report viewing as a *secondary* feature. **Do not** build "another report viewer." Microsoft's own Power BI mobile app already does that well; you cannot win there.
- **Stack:** **React Native via Expo** (managed workflow, with a custom dev client). It is the fastest path, you keep TypeScript, and every native capability you need (secure storage, push, in-app browser, auth) has a first-class Expo module.
- **Code reuse:** The *shapes and logic* of `powerbi-api.ts` (status derivation, overdue calculation, trigger labels, sorting) port over almost verbatim — it is plain TypeScript over `fetch`. What does **not** port is the Electron/MSAL-node plumbing (`@azure/msal-node`, `safeStorage`, `BrowserWindow` auth window, the partition-cookie SSO trick). Budget on **reimplementing the auth + storage layer**, **reusing the data-derivation logic**.
- **Architecture:** The phone calls the Power BI REST API **directly** with its own delegated AAD token — **no backend needed for the read-only app.** The **one** exception is **push notifications**: a phone cannot reliably poll refresh status in the background, so push **requires** a small server-side scheduled job. This is the only infrastructure you must stand up, and it's modest.
- **Phasing & rough effort (one experienced RN dev):**
  - **Phase 1 — Read-only fleet health, no push:** ~**4–6 weeks**.
  - **Phase 2 — Push alerts + minimal backend:** ~**4–6 weeks** (plus a small recurring cloud bill, low tens of dollars/month at your scale).
  - **Phase 3 — In-app report viewing:** ~**2–4 weeks**.
- **Hard costs:** Apple Developer Program **$99/yr**, Google Play **$25 one-time**. Plus the Phase-2 cloud function + push (cheap). Plus an **Entra app-registration change** (a new mobile redirect, and for push, a confidential client/service principal).
- **Top 3 ways it disappoints:** (1) Apple review may treat a thin app as a rejectable "repackaged website"; (2) the **admin/who's-using-what data needs a Fabric admin token** — only *you* have it, so that feature is single-user unless you move it server-side; (3) push latency/reliability expectations ("why didn't it buzz the instant it broke?") are set by the polling interval, not real-time.
- **Recommendation:** **Go** — but build **Phase 1 first as a 4–6 week proof**, ship it to yourself and one client, and only commit to Phase 2 (push + backend) once Phase 1 proves the fleet-health view is genuinely useful on a phone. Phase 3 is optional and lowest-value.

---

## 1. Product thesis (state it, then design to it)

**Microsoft's Power BI mobile app is an adequate report *viewer*. Competing as a viewer loses.** It has Microsoft's embedding, offline tiles, and a decade of polish. If our app's home screen is "a list of reports to tap," users will (correctly) ask why they don't just use Microsoft's.

**The differentiator is being a proactive *fleet-ops console* for the data owner and power users:**

- **Push the moment data breaks:** refresh failures, "scheduled to refresh but didn't" (overdue), and "new data just landed."
- **Answer operational questions at a glance:** what's broken right now, what's overdue, who's using what, when did each thing last actually publish data.
- **Report viewing is the *secondary* capability** — present, but not the front door.

**It must feel native** — native navigation, native lists, swipe/pull-to-refresh gestures, native push, native secure storage. The **only** embedded-webview surface is the **actual Power BI report canvas** when a user taps into a report. That one embed is unavoidable (even Microsoft embeds the canvas). Everything else — every tile, list, alert, and detail row — is native UI drawing from the REST API. This distinction is also what keeps us on the right side of app-store review (see §5).

The good news: **the desktop app already computes exactly the signals this thesis needs.** `getInsightsSnapshot` already classifies every dataset/dataflow as Failed / Overdue / Never / Live / OK; `getDatasetScheduleInfo` already computes the "supposed to refresh but didn't" flag; `getAdminInsights` already produces who's-using-what. The mobile app is, in large part, a **native re-presentation of logic you've already written and shipped.**

---

## 2. Recommended stack (with honest justification)

### 2.1 React Native — Expo (managed + custom dev client), not bare

**Recommendation: Expo.** Reasons, honestly weighed:

- **You keep TypeScript.** The whole desktop codebase is TS; the data layer ports with minimal friction.
- **Every native dependency you need is a first-class Expo module:** `expo-secure-store` (Keychain/Keystore), `expo-notifications` (push), `expo-web-browser` / `expo-auth-session` (system-browser auth), `expo-linking` (deep links for the auth redirect and for tapping a push to open the right screen). No need to drop to bare for any Phase-1/2 capability.
- **EAS Build** removes the single biggest RN pain for a non-specialist: you do not need a Mac with Xcode locally to produce a signed iOS build, and you don't hand-manage Gradle/CocoaPods. You still need the Apple Developer account, but the toolchain is managed.
- **OTA updates (EAS Update)** let you ship JS-only fixes without a full app-store re-review — valuable for a small audience where you'll iterate.

**"Bare" React Native (or `react-native-app-auth`) is only warranted if** you specifically need a native module Expo doesn't wrap. The one realistic candidate is **MSAL's official native SDK** (`react-native-msal`, wrapping MSAL iOS/Android) instead of the generic `expo-auth-session`/`react-native-app-auth` OAuth flow. You can use a **config plugin + custom dev client** to pull MSAL into an otherwise-managed Expo app, so even that does **not** force bare. **Stay on Expo with a custom dev client.** Going bare buys you nothing here except more maintenance.

> Note: the Microsoft-recommended path for AAD on React Native is **MSAL via a native module** (`react-native-msal`). The generic OAuth route (`expo-auth-session` / `react-native-app-auth`) also works against the AAD authorization-code + PKCE endpoint and is simpler to wire, but you give up MSAL's built-in token cache, broker/SSO integration, and incremental-consent helpers. **Recommendation: use `react-native-msal`** so the mobile auth model mirrors the desktop's MSAL model (silent acquisition, incremental admin consent, `offline_access` refresh-token persistence) instead of reinventing it.

### 2.2 How much of `powerbi-api.ts` can be reused?

Be realistic about *what* the desktop service is. It is two layers welded together:

**Layer A — pure data logic (PORTABLE, ~80–90% reusable as-is):**
- The REST endpoint paths and OData pagination (`/groups`, `/groups/{ws}/datasets`, `.../refreshes?$top=5`, `.../refreshSchedule`, `.../dataflows/{id}/transactions`, `/admin/apps/{id}/users`, `/admin/activityevents`).
- **Refresh-status derivation** in `getDatasetRefreshHealth` (newest-first; `Unknown` with no `endTime` = in-progress, `Unknown` with `endTime` = completed on-demand; `serviceExceptionJson` → `errorCode`).
- **The "overdue" calculation** in `getDatasetScheduleInfo` (slots-per-week → expected gap → `max(24h, 2×gap)`; enabled-but-never-succeeded = overdue). **This is the heart of the "supposed to refresh but didn't" alert** and it is just arithmetic over JSON.
- **Trigger labelling** (`ViaApi` → "Power Automate / API", `OnDemand` → "Manual", else "Scheduled") — currently in the renderer's `triggerLabel`. Port verbatim.
- Data-freshness aggregation (`getDataFreshness`), dataflow last-success, lineage resolution — all pure.
- The TS **types** (`InsightsSnapshot`, `InsightsRefreshable`, `AdminInsights`, etc. in `src/shared/types.ts`) — copy into a shared package or vendor directly.

  These are written against the standard `fetch` API. **React Native ships a `fetch`** (Hermes/JSC), so this code runs essentially unchanged. The retry/backoff helper (`withRetry`), `AbortController` timeout, `Retry-After` parsing, and error-body redaction are all standard-JS and port directly.

**Layer B — Electron/Node host plumbing (NOT portable, must be reimplemented):**
- **`@azure/msal-node`** is a Node library (uses Node crypto, runs in the main process). RN has **no Node APIs.** Replace with **`react-native-msal`** (or `expo-auth-session`).
- **`Buffer`** in `exportReportToPdf` is a Node global — not in RN. (PDF export is not a Phase-1 feature; defer or reimplement with base64.)
- **The injectable `ApiAuthPort`** (`getAccessToken` / `getAdminAccessToken`) is the clean seam to reuse: the desktop already abstracts the token source behind an interface (lines ~33–43 of `powerbi-api.ts`). **On mobile you implement that same interface backed by `react-native-msal`** and the rest of Layer A consumes it unchanged. This is the single most important architectural fact: *the desktop was already written to make the data layer host-agnostic.*
- The **lazy-singleton / Electron `Proxy`** wiring and the **IPC envelope** (`IPCResponse`) are Electron-specific; on mobile the data layer is called directly from a hook/store, no IPC.

**Practical plan:** lift Layer A into a small `src/data/` module in the RN app (or a shared workspace package), keep the `ApiAuthPort` seam, and write **one** new adapter implementing it with `react-native-msal`. Reimplement only Layer B. Do **not** try to share a live package across the Electron and RN repos on day one — copy the files, keep them in sync manually until/unless it's worth a monorepo. Reuse here is real and substantial, but it is **logic reuse, not "run the same binary."**

### 2.3 Auth library specifics

- **`react-native-msal`** (wraps MSAL for iOS/Android). Configure with the **same tenant authority** (`https://login.microsoftonline.com/<tenantId>`) and a **mobile redirect URI** (`msauth.<bundleId>://auth` on iOS, the Android scheme/signature-hash redirect). This is a **new platform entry** in the existing Entra app registration (the desktop uses `http://localhost`; mobile needs its own).
- **Scopes:** request exactly the desktop's `loginRequest.scopes` — `Report.Read.All`, `Dashboard.Read.All`, `Workspace.Read.All`, `App.Read.All`, `Dataset.Read.All`, `Dataflow.Read.All`, plus `offline_access`, `openid`, `profile`, `email`. `offline_access` gives you the refresh token so the user signs in **once** and silent acquisition handles the rest (same model as desktop).
- **Admin scope** (`Tenant.Read.All`) stays **out** of the initial login and is requested via **incremental consent** only when the admin opens the admin/fleet view — mirroring `getAdminAccessToken` exactly.
- **Alternative if `react-native-msal` proves fiddly:** `expo-auth-session` (auth-code + PKCE) or `react-native-app-auth` against the AAD v2 endpoints. Both work; you then manage the token cache and silent refresh yourself (store the refresh token in `expo-secure-store`, exchange it on launch). Functional, but you're re-implementing what MSAL gives free.

---

## 3. Architecture

### 3.1 Does the phone need a backend? Mostly no.

**For everything the user actively looks at: NO backend.** The phone holds its own delegated AAD token (acquired by `react-native-msal`) and calls `https://api.powerbi.com/v1.0/myorg/...` directly, exactly as the desktop main process does today. Access is **inherently scoped to the signed-in user's token** — the API only returns what that user can see (the desktop relies on this same property; see the `getInsightsSnapshot` doc comment). So:

- Fleet health, refresh detail, freshness, workspace access → **direct API calls, no server.**
- Report viewing → **direct embed** using the user's token (user-owns-data; the desktop's `getEmbedToken` just returns the access token).
- **CORS is not a problem** because React Native's `fetch` is a native HTTP client, **not** a browser — no preflight, no Origin enforcement. (This is a real advantage over a mobile *web* app and another reason to go native.)

### 3.2 The one thing that DOES need a server: push notifications

**Be honest with yourself here.** The proactive thesis lives or dies on push, and **a phone cannot deliver it alone:**

- iOS and Android **aggressively suspend** background apps. You **cannot** reliably "poll Power BI every 15 minutes in the background" from the app — the OS will not let you, and background-fetch is best-effort and throttled. A backgrounded or killed app will simply miss the failure.
- Therefore a **server-side scheduled job** must poll refresh status and **send the push.** This is the **only** infrastructure you must run. Everything else is serverless-by-virtue-of-being-on-the-phone.

**Minimal backend design:**

```
[Scheduled cloud function]  --every N minutes-->  [Power BI REST API]
   (Azure Functions Timer / AWS Lambda+EventBridge / Supabase cron)
        |  computes: Failed?  Overdue?  New-data-landed?
        |  (same status + overdue logic ported from powerbi-api.ts)
        v
   [Tiny state store]  (last-seen status per dataset; so we alert on the
        |               TRANSITION OK->Failed, not every cycle)
        v
   [Push dispatch]  -->  Expo Push API  -->  APNs / FCM  -->  phones
```

- **Cadence:** every 10–15 min is plenty for "a refresh broke." Faster costs more and gains little (refreshes aren't second-by-second events).
- **What it polls:** the same endpoints the data layer already uses — `.../datasets/{id}/refreshes?$top=5`, `.../refreshSchedule`, dataflow transactions. **Port the exact status + overdue derivation** so the server and the app agree on what "broken/overdue" means.
- **Transition tracking:** store last-known status per dataset so you push **once** on `OK→Failed`, once on `Overdue` crossing, once on "new success after a gap" (new data landed) — not a buzz every cycle. This little state table is the only persistent storage the backend needs.
- **Push transport:** **Expo Push API** is the path of least resistance with an Expo app — you send to Expo's endpoint with the device's Expo push token and it fans out to APNs (needs an **APNs key** from your Apple Developer account) and FCM (needs a **Firebase project** for Android). You *can* talk to APNs/FCM directly later; start with Expo Push.

**The hard part of the backend is identity, and it forces an Entra decision:**

- **Option A — Service principal (recommended for the owner's own fleet):** register a **confidential client** (or reuse the app reg with a client secret/cert) and grant it **Power BI service-principal API access** (a tenant setting + workspace access). The function runs as an app identity, sees the whole fleet, and pushes to whoever subscribed. **This is the only way the *admin/who's-using-what* and full-fleet alerting can serve more than one person**, because today only *you* (the Fabric admin) can mint the `Tenant.Read.All`/admin token. With a service principal the backend, not a human admin token, does the tenant-wide reads.
- **Option B — No service principal (cheapest, weakest):** the function uses a **stored refresh token for a single privileged user** (you) to call the API. Simple, but it's one user's credentials sitting in a server, subject to revocation/MFA/expiry, and it only reflects what that user sees.

**Recommendation:** Phase 1 needs **no backend at all** (each user's own token, foreground reads). Stand up the backend **only in Phase 2**, and do it with a **service principal (Option A)** so push reflects the true fleet and isn't chained to one person's session.

---

## 4. Screen-by-screen (sketched in words)

Native shell throughout: a bottom tab bar (Fleet · Alerts · Usage · Settings), native stack navigation for drill-downs, pull-to-refresh on every list, swipe gestures, native list virtualization. The **only** webview anywhere is the report canvas in screen 5.

**1. Fleet Health (home / default tab).**
The native re-presentation of `getInsightsSnapshot`. Top: a row of **status tiles** — Broken (count, red), Overdue (count, severe), Never refreshed (amber), Running (blue), Healthy (green) — driven by the same counts the desktop's summary chips compute. **Broken-first ordering:** below the tiles, a native list of every dataset/dataflow sorted by the existing `statusOrder` (Failed → Cancelled → Never → InProgress → Completed → Disabled), each row showing name, workspace, status badge, "last success · 3h ago", and an **Overdue** chip when `scheduleOverdue`. Tap a tile to filter the list (tap "Broken" → only failures). Pull-to-refresh re-fetches (the desktop's 5-min cache logic can move client-side). This screen *is* the product.

**2. Alerts / Notifications feed.**
A native, chronological list of every push the backend has sent: "❌ Sales Daily refresh failed (error: ...)", "⏰ Inventory was scheduled to refresh at 06:00 and didn't", "✅ New data landed in Finance Dataflow." Each entry is tappable → deep-links to the relevant Refresh Detail screen. Unread badge on the tab. In **Phase 1 (no backend)** this tab still exists but is populated by **client-side diffing** when the app is foregrounded (compare this snapshot to the last cached one) — useful, but only while the app is open; the buzz-in-your-pocket version arrives with Phase 2. Settings here: per-category toggles (failures / overdue / new-data) and quiet hours.

**3. Who's-using-what (Usage tab).**
The native form of `getAdminInsights`: two lists — **"What's being used"** (report, views, unique people, last viewed) and **"Who's using it"** (user, views, last active) — plus **App audiences** (expandable per-App member lists). **Honesty flag:** this needs the **admin/`Tenant.Read.All` token**, which only a Fabric admin can mint. So in Phase 1 this tab is **admin-only** (you), gated behind the same incremental-consent unlock as the desktop. To make it multi-user you must move it behind the Phase-2 service-principal backend. A non-admin user sees a graceful "tenant-wide usage is available to administrators" state (mirrors the desktop's `ADMIN_REQUIRED` handling).

**4. Refresh Detail (drill-down, pushed from Fleet or an Alert).**
One dataset/dataflow: big status, **last success time + relative age**, last attempt, **error code** if failed (from `serviceExceptionJson`), and the **trigger** — *Scheduled / Manual / Power Automate-API* (the `triggerLabel` mapping of `ViaApi`/`OnDemand`), plus the **schedule summary** ("Daily at 06:00, 18:00") and an **Overdue** banner with the reasoning ("scheduled daily, last success 3 days ago"). Owner (`configuredBy`). A recent-refresh history list (the `?$top=5` data you already fetch). **No "trigger refresh" button in Phase 1** (read-only); a manual-refresh action is a deliberate Phase-2+ decision (it needs `Dataset.ReadWrite.All` and changes the app from observer to actor — out of scope for the proof).

**5. Report Viewer (the one embedded surface).**
When the user taps a report, a native screen hosts a **single webview** loading the Power BI embed URL with the user's token (user-owns-data, exactly as desktop). Native chrome around it (title, back, share/open-in-browser). This is the unavoidable embed — even Microsoft does this. Everything *leading up to* this screen is native; only the canvas itself is web. Keep this **Phase 3** and low-priority: if it's painful, deep-link to the Microsoft Power BI app or the browser instead and don't build it at all.

**6. Settings / Sign-in.**
Native sign-in (one tap → system browser → back to app, see §5). Shows signed-in identity, **Sign out**, **Switch account**, **Unlock admin view** (incremental consent), notification preferences, and an "about/diagnostics" panel. First-run is a single **Sign in with Microsoft** button.

---

## 5. Auth on mobile (concretely)

**One-time sign-in.** Tap "Sign in" → `react-native-msal` opens the **system browser / ASWebAuthenticationSession** (NOT an in-app webview — Microsoft and the stores both expect the system browser for OAuth) → user authenticates → AAD redirects back to the app via the registered scheme (`msauth.<bundleId>://auth`) → MSAL exchanges the code (PKCE) for tokens. Because we request **`offline_access`**, MSAL gets a **refresh token**, so subsequent launches do **silent acquisition** — the user signs in **once**, mirroring the desktop's "sign in once" model.

**Token persistence in secure storage.** `react-native-msal` persists its token cache in the platform secure store automatically (**iOS Keychain / Android Keystore-backed encrypted prefs**). If you instead go the `expo-auth-session` route, you store the refresh token yourself in **`expo-secure-store`** (Keychain/Keystore). Either way tokens are at rest in OS-backed secure storage — the mobile equivalent of the desktop's DPAPI/`safeStorage` encryption. Never use `AsyncStorage` for tokens (it's plaintext).

**Admin incremental consent.** Identical model to `getAdminAccessToken`: the admin (`Tenant.Read.All`) scope is **not** in the initial login. When you (the Fabric admin) tap "Unlock admin view," MSAL runs an **incremental-consent** interactive request for the admin scope (superset request, as desktop does). Approve once — including "consent on behalf of your organization" — and silent acquisition covers it thereafter. Non-admins never see this scope and can never be blocked by it.

**The Apps SSO story changes on mobile — and mostly goes away.** On desktop, the whole reason the app exists is the **partition-cookie trick** (`PARTITION_NAME = 'persist:powerbi-viewer'`): the MSAL auth `BrowserWindow` and the embedded `app.powerbi.com` webview **share one Electron session/cookie jar**, so AAD SSO cookies (`ESTSAUTH*`) deposited at sign-in are reused by the embedded Apps browser — one sign-in, no re-prompt. **None of that exists on mobile**, and you don't need most of it:

- Mobile auth uses the **system browser** (ASWebAuthenticationSession / Custom Tabs), which has its **own** shared cookie jar at the OS level. There is no Electron partition to align.
- The mobile app's data calls use the **bearer token**, not cookies — so the fleet/usage/detail screens have no cookie-SSO dependency at all.
- **Only the embedded report canvas (screen 5)** could face a re-auth prompt, because a `react-native-webview` has its **own** cookie store separate from the system browser. Mitigations, in order of preference: (a) load the embed with the **token in the embed config** (user-owns-data) so the canvas authenticates by token, not cookie; (b) if cookie auth is unavoidable for some surface, accept a one-time in-webview sign-in there. Practically: **build screens 1–4 and 6 token-only (no SSO concern), and treat the report-canvas cookie story as a Phase-3 detail**, not an architectural blocker.

**Entra app-registration changes required (small but real):**
- Add a **mobile/desktop platform redirect** for iOS (`msauth.<bundleId>://auth`) and Android (scheme + signature hash). The existing reg is a public client (`AZURE_CLIENT_ID = ee7edf76-...`), which is the right type; you're adding a platform, not changing the model.
- For Phase-2 push: either grant the **service principal** Power BI API access (tenant setting + workspace access) or provision a **confidential client** for the backend.

---

## 6. Effort + cost realism

### 6.1 Engineering effort (one experienced React Native dev; multiply if you're learning RN on the job)

| Phase | Scope | Rough effort |
|---|---|---|
| **Phase 1** | Expo app scaffold, `react-native-msal` sign-in + secure storage, port Layer-A data logic, **Fleet Health** + **Refresh Detail** + **Settings**, admin-gated **Usage** tab, client-side in-app alert diffing. **No push, no backend.** | **4–6 weeks** |
| **Phase 2** | Scheduled cloud function (service principal), status/overdue logic ported server-side, transition-state store, **Expo Push** wiring (APNs key + FCM/Firebase), device-token registration, **Alerts** tab fed by real push, deep-links from push → Refresh Detail, notification preferences. | **4–6 weeks** |
| **Phase 3** | **Report Viewer** webview (embed + token), native chrome, share/open-in-browser, report-canvas auth handling. Optional: PDF export, manual-refresh trigger (needs write scope). | **2–4 weeks** |

These assume the data layer ports cleanly (it should — it's host-agnostic by design) and that the **biggest unknowns are auth wiring and store submission**, not the screens.

### 6.2 Hard costs

- **Apple Developer Program: $99/year.** Mandatory to ship to any iPhone (even TestFlight). Non-negotiable, recurring.
- **Google Play: $25 one-time.** Cheaper, but Play review is real too.
- **Phase-2 cloud:** a timer-triggered function + tiny state store + push fan-out at your scale (~20 clients, a few dozen datasets) is **low tens of dollars/month at most**, often within free tiers (Azure Functions Consumption / Lambda free tier / Supabase). Expo Push is free; APNs/FCM are free.
- **EAS Build/Update:** has a free tier; a paid plan (~tens of $/month) speeds builds if you iterate heavily. Optional.
- **Apple Push (APNs) key** and a **Firebase project** (FCM) — both free, but they're setup steps with their own credentials to manage.

### 6.3 App-store review gotchas (read this before committing)

- **"Repackaged website" rejection (Apple Guideline 4.2 / minimum functionality).** This is the **single biggest review risk** and it is *why the native thesis matters for more than UX*. An app that is mostly a webview wrapper gets rejected. Our app is genuinely native (native fleet/alerts/usage/detail; webview only for the report canvas), so it should pass — **but you must make that obvious to the reviewer**: native UI on launch, push, native navigation. Do **not** let the report viewer become the home screen.
- **Embedding Power BI / third-party content.** Generally fine (it's the user's own authenticated Microsoft content), but be ready to explain in review notes that the embed is the signed-in user's own Power BI data via official Microsoft embedding, and provide a **demo account** — reviewers must be able to sign in to see anything (your app is useless without a tenant login). A login wall with no reviewer credentials is a common rejection cause.
- **Sign in with Apple.** If you offer any third-party/social login, Apple may require "Sign in with Apple" too. **Microsoft/AAD work/school sign-in for accessing the user's own enterprise data is generally exempt** (it's enterprise SSO, not consumer social login), but confirm before submission.
- **Background modes / push.** Declare push capability and (if you ever add background fetch) the background modes honestly; over-declaring triggers scrutiny.
- **Privacy nutrition labels / data-use disclosure** (both stores): you collect a Microsoft identity and call Microsoft APIs — disclose it. No third-party tracking keeps this simple.

### 6.4 Signing / provisioning (the part that surprises non-specialists)

- **iOS:** requires the **$99 account**, an **App ID**, **provisioning profiles**, and a **distribution certificate**. **EAS Build manages these for you** (it can create and store the certs/profiles), which is the main reason to use Expo/EAS — otherwise this is the most painful part of iOS for a newcomer. TestFlight is how you'll distribute to yourself/clients before App Store release.
- **Android:** an **upload/signing key** (EAS can manage **Play App Signing**), the **$25 Play account**, and an internal-testing track for early distribution.
- **The redirect-URI signature hash (Android)** must match your signing key — a classic "auth works in dev, breaks in the store build" trap. Get the **EAS-managed signing hash** into the Entra Android redirect **before** submitting.

---

## 7. Risks, unknowns, and the top 3 ways this disappoints

### Top 3 (stated plainly)

1. **The "who's-using-what" / full-fleet alerting is single-user until you build the backend.** Today only *you* (the Fabric admin) can mint the admin token; the desktop already shows this (`ADMIN_REQUIRED`). On mobile, the same is true: Usage and true fleet-wide push are **your** view only, unless Phase 2 moves them behind a **service principal**. If you expected every client to get tenant-wide usage on their phone, that's a backend project, not a screen. Manage that expectation up front.

2. **Push is as fresh as your polling interval, not real-time — and people will notice.** A 10–15-minute cloud-function cadence means "Sales refresh failed at 06:02" might buzz at 06:14. That's fine operationally, but if the owner's mental model is "instant," it disappoints. Real-time would need Power BI webhooks/Service Hooks or Fabric eventing, which is more infrastructure than this is worth at your scale. Set the expectation: **timely, not instantaneous.**

3. **App-store review (especially Apple) can stall or reject a thin app.** If Phase 1 ships *before* there's enough native substance — or if a reviewer can't sign in (no demo account) — you can lose a week or two to rejection cycles. The native-first design mitigates this, but it's a real schedule risk on first submission, and it recurs on major updates.

### Other risks / unknowns

- **Conditional Access on mobile.** The same CA policies flagged in the desktop runbook (compliant/Intune-managed device, approved-app requirements for Power BI/O365) can **block the mobile sign-in** or require the device be enrolled. This is tenant-policy, not app code — verify with the same admin who handled the desktop rollout. Could be a hard blocker for some users' personal phones.
- **`react-native-msal` maturity.** It wraps the official MSAL native SDKs but is a community binding; if it fights you, the fallback is `expo-auth-session`/`react-native-app-auth` with manual token management (more code, fewer surprises). Budget a spike to de-risk auth **first**, before building screens.
- **Service-principal Power BI access** requires a **tenant setting** ("Allow service principals to use Power BI APIs") plus workspace access — an admin action, and some tenants disallow it. Confirm it's permitted before committing to the Option-A backend.
- **Report-canvas embedding on a small screen** may simply be a poor experience (Power BI reports are designed for desktop). This is *another* reason report viewing is Phase 3 and secondary — and a reason to consider deep-linking to Microsoft's app instead of building screen 5 at all.
- **Two codebases to keep honest.** The ported Layer-A logic (status/overdue/trigger derivation) now lives in *three* places (desktop renderer/main, mobile app, Phase-2 backend). They must agree on "what is broken/overdue." Plan to extract it into a shared package eventually, or you'll get divergent definitions of "overdue."
- **OTA-update / store-policy boundary.** EAS Update is great, but pushing behavioral changes OTA that the stores would consider material can violate policy. Keep OTA to fixes, ship features through review.

---

*Bottom line: the data superpowers already exist in `powerbi-api.ts` — the mobile app is mostly a native re-presentation of logic you've shipped, plus one modest backend for push. **Go**, but prove it with a 4–6 week Phase-1 (read-only, no push) on your own phone before you commit to the backend. The thing that kills this isn't the code; it's mismatched expectations about admin-only data and push latency, and a first app-store review.*
