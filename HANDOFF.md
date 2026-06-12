# HANDOFF — the complete state of this project

Read this + CLAUDE.md + design-lab/ and you have everything. Written
2026-06-12 at the end of the founding session so that NO future session
depends on chat memory. The owner was burned by a prior rogue session;
this file is the antidote: if it is not written here or in CLAUDE.md or
on a board, it is not a decision.

## What this project is

BsCene (name PROVISIONAL — owner is consulting his analyst; ask for the
final name exactly once, at the last moment store metadata requires it;
"FLEET" is the placeholder everywhere) — a native mobile app for the
owner's Power BI consulting clients. Two pillars:
1. Fleet ops console (exists, ported, working): refresh health, alerts,
   live DAX-driven native visuals. 253+ tests green.
2. THE CROSSWALK (the differentiator, not yet built): parse the owner's
   Power BI reports saved as .pbip/PBIR, extract a chosen page's visuals
   1:1 (type, field bindings, mobile layout), compile at BUILD TIME into
   an app-owned manifest, query live data via executeQueries with the
   user's own AAD token, render natively in the design language below.
   Marketing thesis: competitors ship webview wrappers; this is a real
   instrument. "People don't buy consulting. They love a sexy app that
   just WORKS."

## Architecture rulings (verified, decided)

- Repo separation is FINAL: desktop app (pbiviewer) and this app are
  separate products. Never reintroduce mobile into pbiviewer.
- This repo currently lives parked as branch `fleet-mobile-bootstrap`
  on bcabc4353/pbiviewer (public!) until the owner wants a real repo.
  Workflow: clone/pull that branch into a local folder, work, push back.
  KEEP IT SIMPLE — one user (owner), one developer (Claude), no PRs.
- Sample .pbip report definitions: bcabc4353/pbip-samples (PRIVATE,
  6 reports, 428 visuals incl. matrix/waterfall/custom-visual hard
  cases; .SemanticModel/PowerQuery deliberately excluded — HIPAA).
  Sessions need that repo added to their environment scope.
- Crosswalk design: BUILD-TIME compilation PBIP -> manifest (app never
  parses PBIR at runtime). Schema churn/untranslatable visuals become
  desk-side build errors, never broken client phones. Fallback ladder:
  hand-curated manifest per report (~30min) with a drift check.
- executeQueries facts (verified June 2026): 120 queries/user/min,
  100k rows/1M values/15MB per query, one query per call, needs dataset
  Read+Build, RLS honored with user tokens, tenant switch "Semantic
  Model Execute Queries REST API" must be ON (it is, in owner's tenant).
  Per-user tokens = each user has own budget; ~5x headroom typical page.
- PBIR format: becoming Microsoft's DEFAULT/only report format (GA
  rollout summer 2026). visual.json carries visualType + typed
  projections (Column/Measure/Aggregation with table+property names);
  mobile.json carries per-visual phone layout x/y/w/h; page.json carries
  custom page sizes. All schemas public: microsoft/json-schemas
  (fabric/item/report/definition). Filter gotcha: visual automatic
  filters persist to file only after the filter pane was expanded once.
- DAX reconstruction (projections -> SUMMARIZECOLUMNS) is the one
  soft spot: build a GOLDEN HARNESS comparing generated DAX vs Power BI
  Desktop Performance Analyzer queries across >=30 visuals before
  trusting it. Numbers that are subtly wrong are the worst failure mode
  for a consultant selling "data that updates correctly".
- Client tenancy: SINGLE-TENANT — all client data streams into the
  owner's tenant via gateways under BAA; users sign in with accounts
  the owner controls. CA policies/consent = owner's own tenant only.
- Kiosk/wall displays are the DESKTOP app's job. Not this app's.

## Stack rulings (verified, decided)

- Expo + React Native, currently SDK 56 / RN 0.85 / React 19.2 (fresh
  scaffold, 253 tests, expo web export verified).
- The bar requires DEV BUILDS (expo-dev-client + EAS), not Expo Go:
  custom haptics, Sentry, expo-updates, Skia.
- Add when build phase starts: @shopify/react-native-skia (instrument
  rendering), react-native-gesture-handler (UI-thread gestures),
  expo-font (D-DIN PRO), expo-updates, @sentry/react-native.
- Haptics: iOS needs NO Apple permission. expo-haptics presets now;
  Core Haptics/AHAP custom clicks via react-native-haptic-feedback v3+
  (the mature lib; avoid toy alternatives) in a dev build. Android:
  three-tier ladder (AHAP-equivalent compositions where
  arePrimitivesSupported, else performAndroidHapticsAsync presets);
  silent-failure trap: any unsupported primitive kills the whole
  composition — probe first.
- Performance contract: 60fps floor, 120 aspiration. Known risk:
  Reanimated/New-Arch regression (reanimated #7984) — run a 2-day Skia
  gauge spike on a real ProMotion iPhone BEFORE building the instrument
  layer. iOS 120Hz needs CADisableMinimumFrameDurationOnPhone plist flag.
- Store path: org enrollment under BCABC LLC (entity exists). D-U-N-S
  application = longest lead item (owner action, may be in flight).
  Demo/sample mode doubles as App Review's demo-account answer.
  Sign-in-with-Apple NOT required (enterprise-login exemption 4.8).
  Export compliance: set ITSAppUsesNonExemptEncryption=false.
  TestFlight builds die after 90 days. App name must NOT contain
  "Power BI" (Microsoft trademark rules).
- 12-week human roadmap was red-teamed as ~20 weeks WITH the crosswalk;
  owner explicitly rejects calendar promises — sequence by GATES:
  (1) PBIP structure proof (DONE-ish: pbip-samples corpus exists),
  (2) DAX golden harness, (3) ProMotion perf spike, (4) dev build on
  owner's iPhone, then instrument layer, then crosswalk compiler.

## Design contract (LOCKED — boards in design-lab/ are the law)

- Typeface: D-DIN PRO everything; JetBrains Mono only for persistently
  live readouts. (D-DIN figures are proportional — use reserved-width
  boxes for count-ups.)
- Canon brand orange: #FF7900 (logo orange; #FF5F15 is RETIRED).
  Logo blue #0F4D97 (needs backlit variant >=4.5:1 for true black).
- Directional pair (owner: "Safety Orange Up. Blue Down. Logo Colors"):
  orange=up/blue=down for arithmetic movement (waterfall, deltas).
  Direction is NOT status.
- Status: amber=behind, red=broken ONLY, green=brief decaying
  verified-event only. Healthy screens are monochrome. Status is always
  glyph+tinted ENGRAVED TEXT — NO chips/pills/badges/containers, ever.
- Color Amendment II (owner: "function beats form"): categorical DATA
  series get a real engineered palette (stable category->hue mapping,
  similar luminance on black, no collisions with status hues, orange
  excluded from rotation = it is the selection/live highlighter).
  Chrome stays monochrome. PENDING: palette board + 07 recolor.
- The tick strip is THE instrument. No dials/gauges/rings anywhere.
  PBI gauge visuals crosswalk INTO tick strips.
- Pies render as donuts (owner approved).
- Haptics ruling (owner DEMAND): designed haptics done well, esp.
  PUSH-THROUGH on drill — two-stage engage-then-give pattern conveying
  depth when entering a layer (Ledger drill, morph-to-detail), inverse
  resurfacing tick on the way back. New verb pushThrough in the ladder
  (AHAP tier 1 / Android composition tier 2 / detent fallback tier 3).
  Logitech MX haptics on desktop = parked someday-delight.
- Motion: data may animate its own ARRIVAL (bars grow, lines draw,
  numbers count, spring-settled, interruptible); chrome NEVER performs.
  NO launch rituals (owner killed twice). Reduce Motion collapses all
  to instant. Springs: closed-form damped oscillator (lab.js solver and
  src/feel/springs.ts are the same math family).
- Transitions: shared-element morphs ("feel like an iPhone and fade
  together") — geometry continuous, content cross-fades, reversible
  mid-flight. Board 09.
- The Ledger (Board 10): mobile pivot = collapsible outline rows +
  one-measure-at-a-time column carousel + drill-via-morph + axis flip.
  Owner reaction: extremely positive. Matrix visuals crosswalk to this.
- 100% FLUID layout is constitutional law (owner pet peeve; owns a
  Lenovo X1 Fold v2): no fixed dimensions, no breakpoints, continuous
  reflow that spring-glides on fold/rotate/resize even mid-animation;
  unnecessary scrollbar/truncation = build failure.
- Lineage cascade ("the flowchart" from desktop Insights) is OUR native
  visual — no crosswalk needed; rebuild to contract standards later.
- Math-guy enhancement tier (owner mandate: enhance beyond PBI):
  manifest supports per-visual enhancements computed client-side from
  the result set — control bands, pareto lines, variance bridges,
  distribution strips, period deltas, anomaly flags.

## Boards inventory (design-lab/, all committed + rendered)

01 type · 02 color (chipless v2) · 03 tick-strip instrument ·
04 controls (segmented; rotary deleted — owner veto "gimmicky") ·
05 fluid · 06 data-draws-itself · 07 crosswalk vocabulary (9 PBI
families; waterfall currently silver-ramp ALTERNATE + orange/blue
ruling version pending/in-flight) · 08 arrival animations (8 GIFs,
gifenc pipeline in capture.mjs) · 09 transitions (interruptible shared-element morph) · 10 ledger
(outline+carousel+flip) · 11 crosswalk of the REAL LIFELINE report
(DENIALS translated, receipts panel with generated DAX, native
revenue-cycle timeline, calendar heatmap, the engineered 8-hue
categorical palette) · 12 full app screens (8 frames + weather
states + fluid trio). LIVE single-file HTML bundles + sliced PNGs +
GIFs are the delivery format. A hand-built TRUE-FLUID DENIALS proof
(continuous reflow, 9-width zero-overflow gauntlet) exists in /tmp
history and the pattern is law for product screens. NOTE: the owner
uploaded the full LIFELINE .Report definition in-chat (bundle) and
the RCSQL database schema reference (1,988 tables; money=int/100,
dates=varchar) — schema doc is SENSITIVE, keep out of public repos.

## Owner working notes (respect these)

- One numbered question list per message, never two; he answers by
  number. Don't re-ask settled things. Ask the NAME once, at the end.
- He hates: GitHub ceremony, chips/badges, launch rituals, dials,
  docs that rot (this file + CLAUDE.md are the only sanctioned docs —
  keep them current or delete them), calendar promises, unnecessary
  scrollbars, truncated text.
- He loves: the ledger/carousel concept, the animation GIFs, engraved
  minimalism WITH functional color, brand colors, math enhancements.
- HIPAA discipline: never request semantic models/PowerQuery/dataflow
  internals; report structure + numbers are cleared; he has a local
  Claude ("Opus") who can run machine-side errands on request.
- Track agents in a ledger; reconcile every completion; never leave
  zombies; he watches the task sidebar.

## Open items at handoff

1. Boards 09/10 + FF7900 re-anchor agent: in flight (commit pending).
2. Categorical palette pass: queued behind it.
3. Board 11: blocked only on session scope including pbip-samples.
4. Owner: D-U-N-S application status unknown; name pending; PBIP
   tenant tests partially superseded by pbip-samples corpus (DAX
   golden harness still required).
5. Desktop app: v2.2.15 shipped; UX consistency sprint on the branch
   awaiting his "ship it" for v2.2.16 (his call, unprompted).
