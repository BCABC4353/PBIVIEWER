# PBI Viewer Mobile

Companion phone app for refresh-health monitoring: fleet board, refresh
detail, alerts, and natively rendered report canvases (no embedded Power BI
canvas — report data is fetched via the Execute Queries DAX API and drawn
with the app's own chart components).

## Run it on your iPhone (no Apple account, no Xcode)

```bash
cd mobile
npm install
npm start
```

(Use `npm start` rather than `npx expo start` — it first runs
`scripts/ensure-azure-config.mjs`, which creates the gitignored
`src/auth/azure-config.local.json` stub Metro needs to bundle.)

Scan the QR code with the iPhone camera → opens in **Expo Go** (free App
Store app).

## Wiring live data (one local file, zero Entra redirect changes)

1. Put the same `clientId`/`tenantId` the desktop uses into the gitignored
   `mobile/src/auth/azure-config.local.json` (created empty by `npm start`):

   ```json
   { "clientId": "<app GUID>", "tenantId": "<tenant GUID>" }
   ```

2. Settings → Live → **Connect to Power BI**. In Expo Go the app uses the
   OAuth **device code flow** (RFC 8628): it shows a short code, you enter it
   at <https://microsoft.com/devicelogin> in any browser (the button copies
   the code and opens the page for you), and the phone polls until Microsoft
   hands over tokens. No redirect URI is registered, no new consent — same
   scopes the desktop already uses.

   The one Entra *toggle* device code needs: the app registration must have
   **Authentication → "Allow public client flows" = Yes**. If it's still No,
   AAD answers `invalid_client` (AADSTS7000218) and the app shows exactly
   that fix on screen.

   In a standalone/dev build (non-`exp://` redirect) the original AuthSession
   browser flow is used instead, unchanged.

Tokens then live in SecureStore and renew silently through the same
TokenManager regardless of which flow acquired them.

## Verification

```bash
npm run typecheck
npm test
```

## Phone quickstart (Windows)

`run-phone.ps1` at the repo root finds (or downloads) the app at
`$HOME\Desktop\PBIVIEWER`, updates it to the latest published `main`,
installs everything, and shows the QR code to scan with Expo Go. Note: any
local edits inside that folder are discarded on each run (the script lists
them first).

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\Desktop\PBIVIEWER\run-phone.ps1"
```
