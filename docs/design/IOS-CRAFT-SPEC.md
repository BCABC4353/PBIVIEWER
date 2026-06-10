# iOS Craft Spec — "Ferrari Luce Interior" for a Power BI Fleet Operations Companion

> Scope: the *craft* layer — the color, material, type, motion, haptic, and component decisions that make this app feel like the inside of a quiet-luxury performance car rather than a wrapped webpage or a shrunk dashboard. A sibling file `APP-DESIGN-LANGUAGE.md` covers higher-level brand/IA and is owned by another author — do not duplicate it here.
>
> Targets: iOS 18 baseline, iOS 26 (Liquid Glass) as the design direction. SwiftUI-first. Values below are *starting tokens* — copy-pasteable, then tuned on-device.

---

## The feeling in one breath

You open it and the screen is already near-black and edge-to-edge, so the content seems to float in the glass of the phone itself — one calm fleet-health number sits large and confident, its digits in tabular SF Pro so nothing twitches as they update; a single warm-amber accent is the only color that ever "speaks," and it speaks only when something needs you; surfaces are matte and quiet, lifted by light not lines; a sparkline curves under the number like a rev gauge at idle; every touch answers with a precise, low haptic *thunk* and a 120Hz spring that has weight but never bounces like a toy — the whole thing feels machined, hushed, and expensive, the way a Ferrari Luce interior is dark, tactile, and deliberately under-decorated so the few things that glow *mean* something.

---

## 1. Color & Material System

### 1.1 Philosophy
Dark-first, **one** accent, semantic color used surgically. The luxury read comes from *restraint and elevation-by-light*, not from gradients or chrome. Color-blind safety is structural: status is never hue-only — it is always **hue + SF Symbol shape + position/label**.

### 1.2 Background & surface layers (OLED-aware)
Do **not** use pure `#000000` as the working background — it causes halation (white text bleeding) and OLED smearing during fast scroll. Reserve true black for the *infinite* bleed behind content (status bar area, behind-sheet, Always-On). Use a near-black graphite for the actual canvas and lift surfaces by lightening, not by drawing borders. ([dark mode true-black pitfalls](https://us.ktcplay.com/blogs/technology-hub/oled-near-black-crush-explained), [near-black canvas convention](https://altersquare.medium.com/dark-mode-vs-light-mode-the-complete-ux-guide-for-2025-5cbdaf4e5366))

| Token | Hex | HSL | Use |
|---|---|---|---|
| `bg/void` | `#000000` | 0,0%,0% | True-black bleed behind everything; Always-On / Lock surfaces; nav bleed for OLED battery + infinite depth |
| `bg/canvas` | `#0B0B0D` | 240,7%,4% | The actual app background (scroll content sits here) |
| `surface/1` | `#141417` | 240,7%,8% | Cards, list cells at rest |
| `surface/2` | `#1C1C21` | 240,8%,12% | Raised card, expanded card, sheet |
| `surface/3` | `#26262C` | 240,9%,16% | Popover, menu, the hero card's inner well |
| `hairline` | `#FFFFFF @ 8%` | — | 1px separators (see §6 — drawn with vibrancy, not solid grey) |

Elevation = lighter surface + a soft, low-contrast shadow (`shadow(color: .black.opacity(0.5), radius: 24, y: 12)`). Never elevate with a visible stroke alone.

### 1.3 Text tiers
Avoid pure-white body at scale — halation. Keep `#FFFFFF` for the hero number and key labels only; step body text down. ([body-text harshness fix](https://inkbotdesign.com/dark-mode/))

| Token | Hex | Opacity-on-canvas equiv | Use |
|---|---|---|---|
| `text/primary` | `#FFFFFF` | 100% | Hero number, screen titles, key labels |
| `text/secondary` | `#EBEBF0` @ 92% | ~`#D7D7DC` | Body, row titles |
| `text/tertiary` | `#EBEBF5` @ 60% | ~`#9A9AA2` | Captions, metadata, axis labels |
| `text/quaternary` | `#EBEBF5` @ 30% | ~`#5A5A60` | Disabled, placeholder, decorative |

(These mirror Apple's dynamic `label` opacity ladder so Increase-Contrast and Smart Invert behave correctly.)

### 1.4 The single accent + semantic states
**Accent = warm amber `#E8A33D`** (HSL 36,80%,57%). One warm metal tone, like instrument lighting / brushed brass — distinct from Apple's default systemBlue so the app has a fingerprint. Use it for: the live/active state, the focused control, the primary action, the "fresh refresh" pulse. Never tint whole surfaces with it.

Semantic states are a **separate, narrow set** and each carries a mandatory symbol so they survive deuteranopia/protanopia:

| State | Hex | HSL | Mandatory SF Symbol | Shape language |
|---|---|---|---|---|
| Healthy | `#34C759` | 145,63%,49% | `checkmark.circle.fill` | circle |
| Warning | `#E8A33D` (accent) | 36,80%,57% | `exclamationmark.triangle.fill` | triangle |
| Broken / failed | `#FF453A` | 4,100%,61% | `xmark.octagon.fill` | octagon |
| Stale / paused | `#8E8E93` | 240,2%,57% | `pause.circle.fill` | circle, desaturated |
| Running / in-progress | accent, animated | — | `arrow.triangle.2.circlepath` (rotating) | circle |

Note healthy-green and warning-amber are *deliberately* far apart in shape (circle vs triangle) because they're close-ish for some color-blind users; the octagon for "broken" matches the universal stop-sign mental model. Status must **never** be conveyed by fill color alone — chip = symbol + color + text (§5.2).

### 1.5 Material, blur & vibrancy
On iOS 18, lean on system materials; on iOS 26, adopt Liquid Glass **only on the navigation/control layer**, never on content. ([Liquid Glass reference](https://www.conor.fyi/writing/liquid-glass-reference), [Apple newsroom](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/), [WWDC25 "Build a SwiftUI app with the new design"](https://developer.apple.com/videos/play/wwdc2025/323/))

When translucency reads **premium**: thin material as a *floating* nav/tab/toolbar bar over scrolling content; a sheet grabber area; a context menu. The blur lets content motion show *through* the chrome — that parallax of content under glass is the "expensive" cue.

When it reads **muddy** (avoid): material on a card sitting on another material (glass-on-glass), material over a busy/low-contrast background with no dim scrim, or material used as a content surface. iOS 26 `.clear` glass specifically requires a media-rich background, bold foreground, and no negative dimming — our data screens don't qualify, so use `.regular`.

```swift
// Floating nav/control layer (iOS 18 baseline)
.background(.ultraThinMaterial, in: Capsule())
.overlay(Capsule().strokeBorder(.white.opacity(0.08), lineWidth: 0.5)) // light catch, not a border

// Vibrancy for labels/separators ON material so they pick up backdrop luminance
Label("Live", systemImage: "dot.radiowaves.left.and.right")
    .foregroundStyle(.secondary) // resolves to vibrant secondary on material

// iOS 26 — control layer only, never content
#if swift(>=6.1)
SomeBar()
  .glassEffect(.regular.tint(Color("accent").opacity(0.0)).interactive(),
               in: .capsule)
// group adjacent glass to avoid glass-on-glass sampling artifacts:
GlassEffectContainer(spacing: 12) { primaryButton; secondaryButton }
#endif
```
`ultraThinMaterial` for floating bars (max content show-through), `thinMaterial` for sheets/menus, `regularMaterial` only when text legibility over chaotic content needs more masking. Pair every material with `.foregroundStyle(.secondary/.tertiary)` so text gets *vibrancy* (it samples and contrasts against the backdrop) instead of a flat grey.

---

## 2. Typography

System fonts only: **SF Pro Text** (≤19pt), **SF Pro Display** (≥20pt — optical sizing kicks in automatically via `.system`), **SF Pro Rounded** for soft/friendly numerics where warmth helps, **SF Mono** for the ticker/hero number and tabular columns. SF's per-size optical outlines + dynamic tracking are why you should *let the system pick the optical size* (use `Font.system(size:)`, not a fixed-named font) — it stops large text from looking loose and small text from looking cramped. ([Apple Fonts](https://developer.apple.com/fonts/), [HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [WWDC20 "The details of UI typography"](https://developer.apple.com/videos/play/wwdc2020/10175/))

### 2.1 The ramp
Tracking in points (SwiftUI `.tracking`), line-height as target leading. Negative tracking tightens big display text (Apple does this); body stays at 0; small/all-caps labels get *positive* tracking.

| Role | Font | Size/Weight | Tracking | Line height | Notes |
|---|---|---|---|---|---|
| Hero number | SF Mono | 64 / Medium | -0.5 | 64 (1.0) | Tabular by definition; `.monospacedDigit()` redundant but explicit |
| Hero unit/label | SF Pro Display | 15 / Semibold | +0.3 | 20 | All-caps, `text/tertiary` |
| Display | SF Pro Display | 34 / Bold | -0.4 | 41 (1.2) | Screen hero titles |
| Title 1 | SF Pro Display | 28 / Bold | -0.3 | 34 | Section headers |
| Title 2 | SF Pro Display | 22 / Semibold | -0.2 | 28 | Card titles |
| Title 3 | SF Pro Display | 20 / Semibold | -0.1 | 25 | Subsection |
| Headline | SF Pro Text | 17 / Semibold | 0 | 22 | Row titles, emphasis |
| Body | SF Pro Text | 17 / Regular | 0 | 22 (≈1.29) | Default reading text |
| Callout | SF Pro Text | 16 / Regular | 0 | 21 | Secondary body |
| Subhead | SF Pro Text | 15 / Regular | 0 | 20 | Row subtitles |
| Footnote | SF Pro Text | 13 / Regular | +0.1 | 18 | Metadata |
| Caption 1 | SF Pro Text | 12 / Regular | +0.2 | 16 | Chart axes, timestamps |
| Caption 2 / label | SF Pro Text | 11 / Semibold | +0.6 | 14 | All-caps eyebrow labels, status chip text |
| Metric / column | SF Mono | 15 / Regular | 0 | 20 | Any number in a list, sparkline value readout |

### 2.2 Rules of thumb
- **Numbers that change must be tabular/mono** (hero number, tickers, refresh counts, durations) so digits don't reflow on update — use SF Mono or `.monospacedDigit()`. Static labels stay proportional SF Pro.
- **Rounded (SF Pro Rounded)** only for: large friendly stat glyphs inside widgets, percentage badges, and the count-up affordance where a touch of warmth reads "approachable instrument." Never for body or dense data — it costs density.
- Respect Dynamic Type: build the ramp with `Font.system(.body)` style mappings where possible so it scales; cap the hero number's scaling (it's decorative) with `.dynamicTypeSize(...(.accessibility2))`.
- One weight jump per hierarchy step max. Quiet luxury = few weights (Regular / Semibold / Bold), generous size deltas.

---

## 3. Layout & Space

### 3.1 Grid: 4-pt base, 8-pt rhythm
Use a **4-pt base unit** with an **8-pt primary rhythm** (i.e. spacings come from the 4-pt set `{4,8,12,16,20,24,32,40,48,64}`; default to the 8-multiples and drop to 4 only for tight intra-component nudges). Justification: 4-pt gives the fine control needed for chip/icon alignment and 1px hairlines on @3x, while keeping everything on an 8-pt skeleton preserves the calm, machined rhythm and aligns with @2x/@3x pixel grids.

```swift
enum Space { static let xs=4.0, s=8.0, m=12.0, l=16.0, xl=20.0, xxl=24.0, x3=32.0, x4=40.0, x5=64.0 }
```

### 3.2 Edge-to-edge & safe areas
- Content scroll views run **full-bleed** (`.ignoresSafeArea()` for the canvas color and background gradients), with *content inset* via `.safeAreaPadding` / `.contentMargins` so text never collides with the notch/Dynamic Island or home indicator.
- Standard **screen side margin = 20pt** (`Space.xl`). Hero/full-bleed media may go to 0; everything textual respects 20.
- Floating nav/tab bar sits *above* content with the content scrolling under its material — set bottom `.contentMargins(.bottom, 88)` so the last row clears it.
- Honor the home-indicator: bottom-pinned primary actions sit 8pt above `safeAreaInsets.bottom`, never on it.

### 3.3 Card system
- Corner radius scale: **chips 8 / cards 16 / sheets & hero 20–24**. Use **concentric** radii when nesting (inner = outer − padding) so corners stay parallel — on iOS 26 use `.rect(cornerRadius: .containerConcentric)`. ([concentricity guidance](https://medium.com/design-bootcamp/apple-design-guide-how-to-create-dynamic-island-with-live-activity-b3cb74c0a7e0))
- Card padding: 16 (`Space.l`) interior; 20 between card and screen edge.
- Inter-card gap: 12 (`Space.m`) in a stack, 16 between distinct groups.

### 3.4 The hero-number composition
The marquee element on the home screen. Vertical stack, left-aligned, generous air:
1. Eyebrow label (Caption 2, all-caps, tertiary) — e.g. `FLEET HEALTH`.
2. Hero number (SF Mono 64/Medium, primary) + small trailing unit baseline-aligned (`%`, Title 3, tertiary).
3. Delta chip (status color + arrow symbol + mono delta) directly under, e.g. `▲ 2 vs yesterday`.
4. Scrubbable sparkline (§5.3) full card width beneath, ~56pt tall.
Whitespace ratio: the number should own ~40% of the card's height with at least 24pt of clear space above and below. The number is the only 100%-white, largest thing on screen — that singular focal point is the luxury move.

### 3.5 List density that breathes
- Row min height **56pt** (60 if it has a sparkline thumbnail), leading icon 28pt slot, 16pt gutters.
- Two-line rows: Headline (17/Semibold) + Subhead (15/Regular, tertiary), 2pt between.
- Section spacing 32pt, section header is Caption 2 eyebrow + 8pt to first row.
- Hairline separators inset to text start (start at 60pt when there's a leading icon), drawn with vibrancy (§6), not edge-to-edge solid grey.

---

## 4. Motion & Haptics

### 4.1 Spring vocabulary
SwiftUI's modern `.spring(response:dampingFraction:)`. Default system spring is `response 0.55 / damping 0.825`. ([Apple docs](https://developer.apple.com/documentation/SwiftUI/Animation/spring(response:dampingFraction:blendDuration:)), [GetStream spring reference](https://github.com/GetStream/swiftui-spring-animations)) Quiet-luxury motion = **high damping (0.8–0.95), no visible overshoot** for functional moves; a *whisper* of bounce (0.7) only on playful, optional micro-moments (the count-up settle, a like). Cheap motion = low damping bounce everywhere + linear/ease-in-out timing on physical-feeling objects.

| Moment | Spring | Feel |
|---|---|---|
| Navigation push / pop | `.spring(response: 0.45, dampingFraction: 0.86)` | confident, settles clean |
| Card expand → detail | `.spring(response: 0.42, dampingFraction: 0.82)` + matchedGeometry | weighty lift, no wobble |
| Card collapse | `.spring(response: 0.38, dampingFraction: 0.90)` | slightly faster, fully damped |
| Pull-to-refresh release | `.spring(response: 0.5, dampingFraction: 0.75)` | one soft rebound = "caught" |
| Number ticker / count-up | `.spring(response: 0.6, dampingFraction: 0.9)` + `.contentTransition(.numericText())` | digits roll, settle, no bounce |
| Alert row arrival (insert) | `.spring(response: 0.4, dampingFraction: 0.8)` + slide+fade | arrives with intent |
| Status chip change | `.spring(response: 0.35, dampingFraction: 0.85)` + symbol replace | crisp swap |
| Sheet present | `.spring(response: 0.48, dampingFraction: 0.85)` | system-like, grounded |
| Over-scroll / drag tracking | `.interactiveSpring(response: 0.15, dampingFraction: 0.86)` | finger-following, rubber-band |
| Toggle / control | `.spring(response: 0.3, dampingFraction: 0.7)` | tiny allowed bounce |

Rule: anything the **finger is directly dragging** uses `interactiveSpring` (low response, tracks 1:1); anything the system **launches on release** uses the standard springs above.

### 4.2 Haptic map
Use `UINotification`/`UIImpact`/`UISelection` generators for standard moments; reserve Core Haptics (`CHHapticEngine`) for custom signature patterns. **Notification haptics (success/warning/error) are precious — only fire them at flow completion, never for in-flight micro-interactions**, or they lose meaning. ([haptic design guidance](https://dev.to/maxnxi/haptic-feedback-in-ios-a-comprehensive-guide-39fb), [hackingwithswift UIFeedbackGenerator](https://www.hackingwithswift.com/example-code/uikit/how-to-generate-haptic-feedback-with-uifeedbackgenerator))

| Moment | Generator | Why |
|---|---|---|
| Refresh **succeeded** | `UINotificationFeedbackGenerator().notificationOccurred(.success)` | flow completion |
| Refresh **failed** / dataset broke | `.notificationOccurred(.error)` | demands attention |
| New warning arrives | `.notificationOccurred(.warning)` | distinct from error |
| Pull-to-refresh **passes threshold** (the "thunk") | `UIImpactFeedbackGenerator(style: .rigid).impactOccurred()` | crisp snap = "committed" |
| Card snaps open/closed | `UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity:)` scaled to drag | weighted physical landing |
| Tab / segmented / picker change | `UISelectionFeedbackGenerator().selectionChanged()` | light tick |
| Scrubbing sparkline across data points | `selectionChanged()` per crossed point (content-aware) | feels like detents under the finger |
| Hero number lands on new value | `UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.6)` | tiny confirm |

Call `.prepare()` before the likely moment (e.g. on drag begin) to kill latency — late haptics feel cheap. Always respect the system: skip non-essential haptics when low-power or Reduce Motion-adjacent settings imply it.

### 4.3 120Hz / ProMotion
- Drive motion with SwiftUI springs/`withAnimation`, not hand-rolled timers — the system schedules these at the right refresh rate. Only reach for `CADisplayLink` if you must, and then set `preferredFrameRateRange` rather than assuming 120. ([120fps scroll perf](https://blog.jacobstechtavern.com/p/swiftui-scroll-performance-the-120fps), [FrameRateRequest](https://github.com/duraidabdul/FrameRateRequest))
- The budget at 120Hz is ~8.3ms/frame (realistically ~5ms after overhead) — keep the hero screen's body lightweight: pre-rasterize the sparkline, avoid heavy `.blur`/shadow on scrolling cells, and don't animate Liquid Glass continuously (it's expensive).
- Note: 120Hz is *not guaranteed* — Low Power Mode and system heuristics cap it; never make correctness depend on frame rate. The win of ProMotion here is scroll smoothness and the 1:1 feel of `interactiveSpring` drags, not flashy effects.

---

## 5. Signature Components

### 5.1 Fleet Health hero card
- Container: `surface/2` (#1C1C21), radius 24, padding 20, soft shadow.
- Layout = §3.4 (eyebrow → hero number → delta chip → sparkline).
- Hero number animates with `.contentTransition(.numericText(value:))` + ticker spring on data update; light impact haptic on land.
- Inner "well" for the sparkline uses `surface/3` at radius 16 (concentric) or simply a 1px vibrant hairline top border.
- A single accent dot (`dot.radiowaves.left.and.right`, accent, gentle pulse) top-right when data is *live*; goes tertiary + `pause.circle.fill` when stale.

### 5.2 Status chip (shape + color + symbol)
- Capsule, height 24, padding 8h/4v, `surface/3` background for neutral chrome OR tinted-at-12% background when it carries strong meaning.
- Contents: SF Symbol (from §1.4 table) at 11pt + Caption 2 label (all-caps) at 11/Semibold, 4pt gap.
- **Never hue-only.** The symbol is mandatory and is the primary differentiator for color-blind users.
```swift
struct StatusChip: View {
  let status: FleetStatus // .healthy/.warning/.broken/.stale/.running
  var body: some View {
    Label(status.title, systemImage: status.symbol)
      .font(.system(size: 11, weight: .semibold)).textCase(.uppercase)
      .padding(.horizontal, 8).padding(.vertical, 4)
      .foregroundStyle(status.tint)
      .background(status.tint.opacity(0.14), in: Capsule())
      .overlay(Capsule().strokeBorder(status.tint.opacity(0.20), lineWidth: 0.5))
  }
}
```
On status change: symbol uses `.contentTransition(.symbolEffect(.replace))` + the §4.1 chip spring; the rotating `arrow.triangle.2.circlepath` for "running" uses `.symbolEffect(.rotate, options: .repeating)`.

### 5.3 Scrubbable sparkline / refresh-history chart
- Swift Charts `LineMark` (refresh durations or health over time), area gradient fill from accent@22% → clear; no axes on the compact sparkline, full axes on the expanded detail. ([Swift Charts interactions](https://swiftwithmajid.com/2023/02/06/mastering-charts-in-swiftui-interactions/), [chartXSelection scrubbing](https://medium.com/@gerastupakov/swiftui-charts-in-ios-18-custom-line-chart-with-gestures-symbols-more-6e46d8b9c072))
- Scrub: `.chartXSelection(value:)` (iOS 17+) or a `DragGesture` + `ChartProxy` mapping touch X → data. While scrubbing: a `RuleMark` follows the finger, a `PointMark` lands on the nearest sample, and a small mono readout (value + timestamp) floats above.
- **Content-aware haptic**: `selectionChanged()` each time the finger crosses to a new data point — feels like physical detents.
- Color individual points by status (failed refreshes render as a red `xmark.octagon.fill` dot on the line, not just a red point) so the chart is readable mono/color-blind.

### 5.4 Alert row
- 56–60pt min height, leading 28pt status symbol (color + shape from §1.4), Headline title + Subhead "dataset · time ago", trailing chevron or mono duration.
- Unread: 8pt accent dot at the leading edge + slightly elevated `surface/1`→`surface/2` background.
- Insert animation: slide from top + fade with the alert-arrival spring; warning/error haptic fires once on the *newest* arrival only (batched arrivals don't machine-gun the Taptic engine).
- Swipe actions: "Acknowledge" (accent), "Mute dataset" (tertiary) — soft impact when the action commits.

### 5.5 Skeleton / shimmer loading
- Skeleton shapes mirror the real layout (hero number → a rounded 64×180 block; rows → icon circle + two bars) in `surface/1`.
- Shimmer = a diagonal highlight (`surface/3`) sweeping left→right via a moving `LinearGradient` mask, ~1.2s loop, `.easeInOut`. Keep it **subtle** (highlight ≤8% lighter than base) — aggressive shimmer reads cheap.
- Respect Reduce Motion: replace the sweep with a gentle opacity pulse `0.6↔1.0`.
- Cross-fade skeleton → real content with `.opacity` over 0.25s (not a hard cut) so data "develops" in.

### 5.6 Live Activity / Dynamic Island — dataset refresh in progress
ActivityKit (`ActivityConfiguration`). Total payload ≤4KB; design to blend with the Island's opaque-black bezel and stay *concentric*. ([ActivityKit/Dynamic Island design](https://medium.com/design-bootcamp/apple-design-guide-how-to-create-dynamic-island-with-live-activity-b3cb74c0a7e0), [Design dynamic Live Activities — WWDC23](https://developer.apple.com/videos/play/wwdc2023/10194/), [4KB limit + surfaces](https://medium.com/canopas/integrating-live-activity-and-dynamic-island-in-ios-a-complete-guide-d8448fab7201))

- **Compact leading**: small accent `arrow.triangle.2.circlepath` (rotating). **Compact trailing**: mono `%` or `3/5` datasets done. The two hug the camera, concentric with the bezel.
- **Minimal** (when sharing the Island): just the rotating accent glyph.
- **Expanded** (long-press): leading = dataset name + status symbol; trailing = mono ETA; center = a slim determinate progress bar tinted accent; bottom = "Refreshing 3 of 5 · Fleet West". On completion the bar fills, symbol swaps to `checkmark.circle.fill` (green), success haptic if app is foreground.
- **Lock Screen** banner: same content in a `surface/2` card with the progress bar; on `bg/void` it reads as floating glass. Keep colors bold/branded (accent) for instant recognition; everything else stays mono/quiet.

### 5.7 Home / Lock Screen widget — fleet status
WidgetKit, supports `.systemSmall`, `.systemMedium`, and Lock Screen `.accessoryRectangular` / `.accessoryCircular`.
- **systemSmall**: hero health number (SF Rounded for widget warmth, tabular) + status chip + tiny sparkline at the bottom. `bg/canvas`, edge-to-edge.
- **systemMedium**: number + chip on the left, top-3 at-risk datasets list on the right (each a status symbol + name + mono "last good Xh ago").
- **accessoryRectangular** (Lock Screen): `gauge`-style or "Fleet 98% · 1 warning" with status symbol — monochrome-rendered, so rely on symbol + text (lock screen tints are desaturated).
- **accessoryCircular**: `Gauge` ring showing health %, accent progress.
- Refresh: `TimelineProvider` with sensible cadence; show a freshness timestamp so a stale widget never lies.

---

## 6. The 10 details that make it feel expensive

Present together, these read "machined and intentional." Absent, the same layout reads "try-hard generic." Each is small; the *compounding* is the luxury.

1. **Vibrant 1px hairlines, not grey lines.** Separators are `.white.opacity(0.08)` rendered *over material/with vibrancy* so they pick up backdrop luminance and shimmer faintly as content scrolls under them — a flat `#333` line is the tell of a cheap app. Use `0.5pt`/`1px` (`1/UIScreen.scale`) so it's a true hairline on @3x.
2. **Numeric content transitions everywhere numbers change.** `.contentTransition(.numericText())` + tabular SF Mono so the hero number and counts *roll* into place and settle (spring damping 0.9) — never a hard text swap, never reflowing digits.
3. **SF Symbol animations on state change.** `.symbolEffect(.replace)` for status swaps, `.bounce` on a fresh-success check, `.variableColor` on the live/listening dot, `.rotate` on the refreshing glyph. Symbols that *transition* instead of cut feel alive.
4. **Content-aware haptics.** Haptic *meaning* tracks content: a detent tick per data point while scrubbing, intensity of the card-snap impact scaled to drag distance, the pull-to-refresh `.rigid` "thunk" exactly at threshold. Haptics that map to physics, not to taps.
5. **Springy, finger-true over-scroll.** `interactiveSpring` rubber-band on bounce; the hero card can parallax/scale a hair (1.0→1.02) as you over-pull at top, settling with one soft rebound. The content follows the finger 1:1, then the system spring "catches" it.
6. **Elevation by light, never by stroke.** Raised surfaces get lighter + a soft, wide, low-opacity shadow — never a hard border to fake depth. The one allowed stroke is a `~0.5pt white@8%` *light-catch* on the top edge of glass.
7. **A single, restrained accent that earns attention.** Amber appears only on live/active/primary/alert — when 95% of the screen is graphite and one warm element glows, that element *means* something. Rainbow status grids are the opposite signal.
8. **Optical type with considered tracking.** Big display text tracked tighter (−0.4), tiny eyebrow labels tracked looser (+0.6), let SF pick optical sizes. Default 0-tracking system text at every size is the generic giveaway.
9. **Focus / press / hover states with weight.** Press = scale 0.97 + soft impact + brief specular brighten via `interactive()` glass; keyboard/pointer focus (iPad/Stage Manager) = accent ring at `2pt`, animated in. Controls answer the touch *before* the navigation happens.
10. **Loading that "develops," motion that respects you.** Subtle shimmer (≤8% highlight) cross-fading into real data over 0.25s — content resolves in, never pops. And every one of the above degrades gracefully under **Reduce Motion / Reduce Transparency / Increase Contrast** (springs → fades, glass → opaque `surface/2`, shimmer → opacity pulse). Respecting accessibility *is* the craft — it's never an afterthought bolted on.

---

## Source references
- [Apple — Liquid Glass / new software design (Newsroom, 2025)](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)
- [WWDC25 — Build a SwiftUI app with the new design](https://developer.apple.com/videos/play/wwdc2025/323/)
- [Conor Luddy — iOS 26 Liquid Glass SwiftUI reference](https://www.conor.fyi/writing/liquid-glass-reference) · [GitHub mirror](https://github.com/conorluddy/LiquidGlassReference)
- [Apple — spring(response:dampingFraction:blendDuration:)](https://developer.apple.com/documentation/SwiftUI/Animation/spring(response:dampingFraction:blendDuration:))
- [GetStream — SwiftUI Spring Animations reference](https://github.com/GetStream/swiftui-spring-animations)
- [Apple — Typography (HIG)](https://developer.apple.com/design/human-interface-guidelines/typography) · [Apple Fonts (SF Pro / SF Mono)](https://developer.apple.com/fonts/) · [WWDC20 — The details of UI typography](https://developer.apple.com/videos/play/wwdc2020/10175/)
- [Dark mode true-black pitfalls / OLED smearing & halation](https://us.ktcplay.com/blogs/technology-hub/oled-near-black-crush-explained) · [Dark mode UX guide 2025](https://altersquare.medium.com/dark-mode-vs-light-mode-the-complete-ux-guide-for-2025-5cbdaf4e5366) · [Dark mode best practices](https://inkbotdesign.com/dark-mode/)
- [Haptic feedback comprehensive guide](https://dev.to/maxnxi/haptic-feedback-in-ios-a-comprehensive-guide-39fb) · [UIFeedbackGenerator examples](https://www.hackingwithswift.com/example-code/uikit/how-to-generate-haptic-feedback-with-uifeedbackgenerator)
- [Swift Charts interactions](https://swiftwithmajid.com/2023/02/06/mastering-charts-in-swiftui-interactions/) · [Custom interactive line charts iOS 18](https://medium.com/@gerastupakov/swiftui-charts-in-ios-18-custom-line-chart-with-gestures-symbols-more-6e46d8b9c072)
- [Dynamic Island / Live Activity design guide](https://medium.com/design-bootcamp/apple-design-guide-how-to-create-dynamic-island-with-live-activity-b3cb74c0a7e0) · [WWDC23 — Design dynamic Live Activities](https://developer.apple.com/videos/play/wwdc2023/10194/) · [ActivityKit 4KB + surfaces](https://medium.com/canopas/integrating-live-activity-and-dynamic-island-in-ios-a-complete-guide-d8448fab7201)
- [120fps SwiftUI scroll performance](https://blog.jacobstechtavern.com/p/swiftui-scroll-performance-the-120fps) · [FrameRateRequest (ProMotion)](https://github.com/duraidabdul/FrameRateRequest)
