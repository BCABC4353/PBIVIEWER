# Shipping MEDIC Workflows (the mobile app) — owner's guide

This is the click-by-click path from "the code is done" to "a client installs it
from TestFlight / Google Play". No development experience assumed. Once the
one-time setup below is finished, each new release is **one command per
platform** (step 6).

**What you'll spend:**

| Item | Cost |
|---|---|
| Apple Developer Program | **$99 / year** (required for TestFlight + App Store) |
| Google Play developer account | **$25 once** (lifetime) |
| Expo EAS build service | Free tier works (limited monthly builds, queued); paid from ~$19/mo if you build often |
| **Total to get started** | **$124 + your time** |

**Honest timeline expectations:**

- Apple Developer enrollment: usually approved in **24–48 h**, occasionally up
  to a week if Apple wants identity documents (D-U-N-S checks for company
  accounts take longer — enroll as an *individual* unless you need the company
  name displayed).
- Google Play account: identity verification can take **a few days**.
- TestFlight **internal** testers (you + people on your team, up to 100): no
  review — build is installable minutes after upload finishes processing.
- TestFlight **external** testers (your clients): first build needs **Beta App
  Review**, typically **~1 business day**, sometimes longer.
- App Store proper: review is typically **1–3 days**; a thin "wrapper-looking"
  app can be rejected (App Review Guideline 4.2 minimum functionality), so stay
  on TestFlight until the app clearly does things on-device.
- Google Play **internal testing** track: live within minutes of upload, no
  review. First production release on a new account can take **up to ~7 days**
  of review, and *personal* accounts created after Nov 2023 must run a closed
  test with 12+ testers for 14 days before production access. Internal testing
  avoids all of that — use it for clients first.

---

## 1. One-time: enroll the accounts

### Apple ($99/yr)
1. Go to <https://developer.apple.com/programs/enroll/>.
2. Sign in with your Apple ID (create one at appleid.apple.com if needed —
   use your business email, brendan@bc-abc.com).
3. Choose **Individual/Sole Proprietor** (fastest) → fill in your legal name
   and address → pay **$99**.
4. Wait for the "Welcome to the Apple Developer Program" email (usually <48 h).

### Google ($25 once)
1. Go to <https://play.google.com/console/signup>.
2. Sign in with a Google account → choose account type (Personal is fine to
   start) → pay **$25**.
3. Complete the identity verification it asks for (ID document / payment
   method). Wait for the confirmation email.

### Expo (free)
1. Go to <https://expo.dev/signup> and create a free account. Remember the
   username/password — the build commands below log in with it.

---

## 2. One-time: prepare the machine

You need [Node.js](https://nodejs.org) (LTS version) installed. Then, in a
terminal, from the repo's `mobile/` folder:

```bash
cd mobile
npm install                       # installs the app's packages
npx expo install expo-splash-screen   # one-time: enables the dark splash screen configured in app.json
npx eas-cli login                 # log in with your Expo account
npx eas-cli init                  # links this folder to an Expo project (accept the defaults;
                                  #   it writes a projectId into app.json — that's expected)
```

`eas.json` (build profiles) and `app.json` (name **MEDIC Workflows**, bundle id
`com.bcabc.medicworkflows`, dark theme, icons/splash) are already in the repo —
you don't have to configure anything else.

> **Live sign-in prerequisite:** the app ships in sample-data mode until the
> Entra `clientId` / `tenantId` GUIDs are pasted into
> `mobile/src/auth/azure-config.ts` (same values the desktop app uses). Do this
> before building anything you give to clients.

---

## 3. One-time: add the mobile redirect URIs in Entra

The app signs in with the **same** Entra app registration as the desktop app —
you are only adding a new *platform*, not creating anything new. (This mirrors
the documented requirements at the top of `mobile/src/auth/msal-auth.ts`.)

1. Go to <https://portal.azure.com> → **Microsoft Entra ID** → **App
   registrations** → open the existing PBIVIEWER registration.
2. Left menu: **Authentication** → **Add a platform** → **Mobile and desktop
   applications**.
3. Under **Custom redirect URIs**, add all of these:

   | Redirect URI | Why |
   |---|---|
   | `medicworkflows://auth` | What the standalone app actually sends (the `scheme` in app.json + the `auth` path the code requests) |
   | `msauth.com.bcabc.medicworkflows://auth` | iOS MSAL-convention form (`msauth.{bundleId}://auth`) |
   | `msauth://com.bcabc.medicworkflows/<SIGNATURE_HASH>` | Android form — `<SIGNATURE_HASH>` is the **base64 SHA-1 of the signing key** |

4. To get the Android `<SIGNATURE_HASH>`: EAS manages your Android signing key,
   so after your first Android build run `npx eas-cli credentials -p android`,
   choose the production keystore, and copy the SHA-1 fingerprint. Convert it
   to base64 (any "hex to base64" converter, or
   `echo "AB:CD:..." | tr -d ':' | xxd -r -p | base64` on Mac/Linux) and paste
   it into the URI. **Do this before submitting to Play** — auth that works in
   a dev build and breaks in the store build is almost always this hash.
5. Click **Save**.

(Expo Go development uses a changing `exp://<host>:<port>` URI — that's why
client testing should use real builds, not Expo Go.)

---

## 4. iOS: build and put it on TestFlight

```bash
cd mobile
npx eas-cli build --platform ios --profile production
```

- First run asks you to log in with your **Apple Developer** account and offers
  to create the signing certificate, provisioning profile and App Store Connect
  app record for you. **Say yes to everything** — this is the whole reason to
  use EAS; never touch certificates by hand.
- The build runs on Expo's servers (15–30 min typical, longer on the free
  queue). You can close the terminal; progress is at expo.dev.

Then submit the finished build to TestFlight:

```bash
npx eas-cli submit --platform ios --latest
```

- In <https://appstoreconnect.apple.com> → **My Apps → MEDIC Workflows →
  TestFlight**: after ~15 min of processing the build appears.
- **Internal testing** (you): add yourself under *Internal Testing* — no review.
- **Clients**: create an *External Testing* group, add their emails, submit the
  build for Beta App Review (~1 day). They get an email; they install the free
  **TestFlight** app and tap the invite.

> **90-day rule:** TestFlight builds **expire 90 days after upload**. Put a
> calendar reminder at ~75 days to re-run the two commands above (or the
> one-liner in step 6) so clients are never stranded on a dead build. Moving to
> a real App Store release removes this limit.

## 5. Android: build and put it on Play internal testing

```bash
cd mobile
npx eas-cli build --platform android --profile production
```

- First run offers to generate and manage the Android signing keystore —
  **say yes** (then do step 3.4 with its hash).
- This produces an `.aab` (app bundle) for the Play Store.

**First time only — Google requires the first upload to be manual:**

1. In <https://play.google.com/console> → **Create app** → name **MEDIC
   Workflows**, App, Free.
2. Download the finished `.aab` from the build page at expo.dev.
3. Play Console → **Testing → Internal testing → Create new release** → upload
   the `.aab` (accept Play App Signing) → **Save and publish**.
4. On the same page, create a tester email list with your clients' Gmail
   addresses, then share the **opt-in link** with them — they tap it and
   install from the Play Store. Live within minutes, no review.

**Later releases** can be submitted from the terminal, after you create a
Google *service account key* once (Play Console → Setup → API access; the
[EAS submit guide](https://docs.expo.dev/submit/android/) walks through it,
then `eas credentials` stores the JSON):

```bash
npx eas-cli submit --platform android --latest
```

## 6. Every release after that: the one command

```bash
# iOS → TestFlight
npx eas-cli build --platform ios --profile production --auto-submit

# Android → Play internal testing
npx eas-cli build --platform android --profile production --auto-submit
```

Bump nothing by hand — `eas.json` is set to auto-increment build numbers
(`appVersionSource: remote`). Change the user-facing `version` in
`mobile/app.json` only when you want clients to see a new version number.

### Other build profiles (when you need them)

| Profile | Command | What it's for |
|---|---|---|
| `development` | `npx eas-cli build -p ios --profile development` | A dev client for yourself (hot-reloads JS, real native auth) — installable on registered devices only |
| `preview` | `npx eas-cli build -p android --profile preview` | A directly-installable **APK** to side-load on any Android phone (no Play account needed) — fastest way to put it in someone's hand |
| `preview` (iOS) | `npx eas-cli build -p ios --profile preview` | An iOS **Simulator** build (for a Mac) — real-device iOS sharing must go through TestFlight |
| `production` | shown above | Store-ready builds |

---

## 7. Re-generating the app icon / splash

The amber-arc brand assets are generated, not hand-drawn. If the mark ever
changes, edit `mobile/scripts/make-assets.mjs` (or the SVG sources in
`mobile/assets/`) and run:

```bash
cd mobile && node scripts/make-assets.mjs
```

then rebuild. Everything `app.json` references is rewritten in place.

## Quick troubleshooting

- **Sign-in works in dev, fails in the store/TestFlight build** → the Entra
  redirect URIs (step 3), almost always the Android signature hash.
- **"Sample data" banner in a client build** → `azure-config.ts` GUIDs were not
  filled in before building.
- **Client's TestFlight says the build expired** → 90-day rule; re-run step 6.
- **Apple rejects the App Store release as "minimum functionality"** → stay on
  TestFlight for distribution until the app has more on-device depth; this does
  not affect TestFlight external testing.
