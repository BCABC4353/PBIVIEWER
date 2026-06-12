# FLEET (working name)

Standalone mobile app for Power BI refresh-health monitoring: fleet board,
refresh detail, alerts, and natively rendered report canvases — report data is
fetched via the Execute Queries DAX API and drawn with the app's own chart
components (no embedded Power BI canvas). Extracted from the desktop repo's
`mobile/` package onto a fresh Expo SDK 56 base; it is fully self-contained.

## Run it

```bash
npm install
npm start
```

Scan the QR code with the phone camera → opens in **Expo Go**.

Use `npm start` rather than `npx expo start` — it first runs
`scripts/ensure-azure-config.mjs`, which creates the gitignored
`src/auth/azure-config.local.json` stub Metro needs to bundle. The app starts
in sample-data mode with the stub empty.

## Live data

Put the Entra app registration GUIDs into the gitignored
`src/auth/azure-config.local.json`:

```json
{ "clientId": "<app GUID>", "tenantId": "<tenant GUID>" }
```

Then Settings → Live → **Connect to Power BI**. In Expo Go the app uses the
OAuth device code flow (RFC 8628); the app registration must have
**Authentication → "Allow public client flows" = Yes**. In a standalone/dev
build the AuthSession browser flow is used instead. Tokens live in
SecureStore and renew silently through TokenManager regardless of which flow
acquired them.

## Verification

```bash
npm run typecheck
npm test
npx expo export --platform web --output-dir /tmp/fleet-export-check
```

## Builds

EAS profiles live in `eas.json` (`development`, `preview`, `production`).
App name, slug, and bundle id (`com.bcabc.fleet`) are placeholders until the
first store upload.
