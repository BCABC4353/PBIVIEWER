# PBI Viewer Mobile — Phase 1

The fleet ops-console phone app. Design per `../docs/design/` ("quiet
instrument cluster"): near-black cabin, one amber accent, red reserved for
broken, status always shape + color + label.

## Run it on your iPhone (no Apple account, no Xcode)

```bash
cd mobile
npm install
npx expo start
```

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
| The feel layer (springs, haptic verbs, entrances, count-ups) + **Ignition Sweep** | Built; SwiftUI spring values translated losslessly; Reduce Motion safe |
| Auth (AAD PKCE, SecureStore persistence, silent refresh, single-flight) | Built + 21 tests; **live mode needs the Azure GUIDs pasted into `src/auth/azure-config.ts` and a redirect URI in Entra** (see that file's header) |
| Data | Sample mode by default; Live switch in Settings once auth is configured |
| Push alerts | Not built (needs the small backend — `../docs/PHONE-OPS-CONSOLE-PLAN.md` Phase 2) |

## Wiring live data (two config steps, both yours)

1. Paste the same `clientId`/`tenantId` the desktop uses into
   `src/auth/azure-config.ts` (values from `scripts/generate-config.js` env).
2. Add the mobile redirect URI to the existing Entra app registration
   (Expo Go dev: the `exp://…/--/auth` URI printed at sign-in; standalone:
   `msauth.{bundleId}://auth`). Same scopes the desktop already uses — no
   new consent. Then Settings → Live → Connect to Power BI.

## Visuals doctrine (owner's call, locked)

**This app never embeds Microsoft's report canvas.** Report content is fetched
as *data* (the `Dataset.Read.All` scope already covers the Execute Queries DAX
API) and re-rendered as the app's **own native visuals** — same tokens, same
type, same motion as everything else. `src/ui/Sparkline.tsx` is the first one;
the visual library grows from there (bars, lines, KPI tiles, tables). Embedding
is permitted only as a last-resort fallback for visuals we haven't translated
yet, and it should feel like a defeat every time.
