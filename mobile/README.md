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
| Core logic (status derivation, overdue math, ordering, durations) | **Ported from the desktop's verified code, 15 unit tests green here** |
| Design tokens (palette, type, spacing, status glyphs) | From the craft spec |
| Fleet Health + Refresh Detail screens | Typechecked, written to spec — **never yet rendered on a device**. First `expo start` is the moment of truth; expect layout fixes. |
| Data | `MockDataSource` (sample fleet). `LiveFleetClient` is written and tested-by-construction against the same API the desktop uses, but needs auth (below). |
| Push alerts | Not built (needs the small backend — see `../docs/PHONE-OPS-CONSOLE-PLAN.md` Phase 2). |

## Wiring live data (the one config step)

`LiveFleetClient` takes a `TokenProvider`. To go live:

1. In the existing Entra app registration, add a **mobile platform redirect URI**
   (`msauth.{bundleId}://auth` for iOS) — 2 minutes, same app registration,
   no new consent (same scopes the desktop already uses).
2. Implement `TokenProvider` with `expo-auth-session` (AAD PKCE) and swap
   `MockDataSource` → `new LiveFleetClient(tokenProvider)` in `App.tsx`.

## Visuals doctrine (owner's call, locked)

**This app never embeds Microsoft's report canvas.** Report content is fetched
as *data* (the `Dataset.Read.All` scope already covers the Execute Queries DAX
API) and re-rendered as the app's **own native visuals** — same tokens, same
type, same motion as everything else. `src/ui/Sparkline.tsx` is the first one;
the visual library grows from there (bars, lines, KPI tiles, tables). Embedding
is permitted only as a last-resort fallback for visuals we haven't translated
yet, and it should feel like a defeat every time.
