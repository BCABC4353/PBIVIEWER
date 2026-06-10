# PBI Viewer Mobile — Phase 1

The fleet ops-console phone app. Design per `../docs/design/` ("quiet
instrument cluster"): near-black cabin, one amber accent, red reserved for
broken, status always shape + color + label.

## Run it on your iPhone (no Apple account, no Xcode)

```bash
cd mobile
npm install
npm start
```

(Use `npm start` rather than `npx expo start` — it first runs
`scripts/ensure-azure-config.mjs`, which creates the gitignored
`src/auth/azure-config.local.json` stub Metro needs to bundle.)

Scan the QR code with the iPhone camera → opens in **Expo Go** (free App Store
app). You'll see the Fleet Health board with sample data: hero number, worst-
first list, pull-to-refresh, tap into Refresh Detail with the native
duration sparkline.

## Honest status

| Piece | State |
|---|---|
| Core logic (status, overdue math, ordering, durations, DAX shaping) | **Ported/built with 112 unit tests green** |
| Four-tab interface (Fleet / Reports / Alerts / Settings) | Built, typechecked — **never yet rendered on a device**; first `expo start` is the moment of truth, expect layout fixes |
| Native visuals (KPI, bar, line, donut, table) + demo report canvases | Built; render offline from realistic mock query results; live mode binds the same DAX runner |
| The feel layer (springs, haptic verbs, entrances, count-ups) + **Ignition ceremony** (once per cold launch, non-blocking veil, Reanimated UI-thread sweep) | Built; SwiftUI spring values translated losslessly; Reduce Motion safe; loading is quiet skeletons, never a gate |
| Auth (AAD PKCE + device code flow, SecureStore persistence, silent refresh, single-flight) | Built + tested; **live mode needs only the Azure GUIDs in the gitignored `src/auth/azure-config.local.json`** — no Entra redirect changes (device code flow) |
| Data | Sample mode by default; Live switch in Settings once auth is configured |
| Push alerts | Not built (needs the small backend — `../docs/PHONE-OPS-CONSOLE-PLAN.md` Phase 2) |

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

## Feel diagnostics

Settings → FEEL → **Test feel** fires every haptic verb in sequence
(tap / confirm / warn / fault / thunk / detent) and prints a per-verb ✓/✗
line *including the caught error message* — the loud counterpart to the
production wrappers, which stay deliberately fail-silent. If every verb
shows ✓ but the phone stays still, check iPhone Settings → Sounds &
Haptics → System Haptics.

## Visuals doctrine (owner's call, locked)

**This app never embeds Microsoft's report canvas.** Report content is fetched
as *data* (the `Dataset.Read.All` scope already covers the Execute Queries DAX
API) and re-rendered as the app's **own native visuals** — same tokens, same
type, same motion as everything else. `src/ui/Sparkline.tsx` is the first one;
the visual library grows from there (bars, lines, KPI tiles, tables). Embedding
is permitted only as a last-resort fallback for visuals we haven't translated
yet, and it should feel like a defeat every time.

## Phone quickstart (Windows)

One command starts the phone dev server: it finds (or downloads) the app at
`$HOME\Desktop\PBIVIEWER`, updates it to the latest published version,
installs everything, and shows the QR code to scan with Expo Go.

First time (paste into any PowerShell window):

```powershell
irm https://raw.githubusercontent.com/BCABC4353/PBIVIEWER/main/run-phone.ps1 | iex
```

Every time after that:

```powershell
powershell -ExecutionPolicy Bypass -File "$HOME\Desktop\PBIVIEWER\run-phone.ps1"
```

Leave the window open while you use the app; press `Ctrl+C` to stop. Any local
edits inside the folder are discarded on each run (the script lists them first),
so the phone always runs exactly what is published on `main`.
