# App Design Language — "Luce"

> Reference dossier for a premium, iOS-first **fleet operations companion** to a Power BI data-monitoring product. Use this to make every screen feel like a Ferrari interior: rich, tactile, effortless, quiet. The bar to clear — and embarrass — is Microsoft's own Power BI mobile app.

---

## TL;DR — The design ethos (the feel)

**"Quiet instrument cluster."** This app should feel like the heads-up display of a car you can't afford: dark by default, edge-to-edge, one number that matters per screen, and a single accent color that only appears when something needs you. Nothing shouts; status is communicated through depth, motion weight, and a single confident tap of haptics — not through chrome, gradients, badges, or twelve KPIs fighting for attention. Speed is the luxury: every tap resolves in under 100ms (even if data is still loading behind a skeleton), every transition is interruptible, and the app reads its operator's intent so well it feels like it understood the question before it was asked. It is a **native instrument**, not a shrunk-down dashboard and not a wrapped webpage. The litmus test for every pixel: *would this survive in a Ferrari "Luce" interior, or is it try-hard?*

The product truth that shapes everything: this is a **monitoring** app. Most of the time the operator opens it to confirm "all green" in two seconds and leave. The rare, high-stakes moment is a **refresh failure at 6am** — that moment must be glanceable, actionable from the Lock Screen, and calm under pressure. Design for the boring 95% (glance and go) and the terrifying 5% (act fast), nothing in between.

---

## 1. Signature interactions — the best micro-interactions ever shipped

These are the "best of all time" moves. For each: the app that nails it, *why* it works, and how we steal it.

### Things 3 — the Magic Plus & rubber-band physics
The Magic Plus button isn't a button, it's an object with **a liquid nature that deforms slightly in response to your drag**, and you can pick it up and drop it exactly where the new to-do should live — Today, under a heading, on a specific day. It pairs the drag with Taptic Engine feedback so the interaction feels *tangible* rather than abstract. The genius: one consistent gesture, contextually aware of where you drop it, with physics that make a UI element feel like it has mass. ([Cultured Code](https://culturedcode.com/things/features/), [MacStories review](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/))

**→ For our app:** Our primary FAB equivalent is the **"Acknowledge / Triage" action** on the Alerts feed. Make the alert card itself the draggable object — pick up a failing-refresh card and drop it onto "Snooze," "Assign," or "Acknowledge" targets that slide in, with a subtle shape-deform + haptic on pickup and a confident "thud" haptic on drop. Reuse the same physics for reordering pinned datasets on Fleet Health home.

### Apple Wallet — card stacking
Passes stack with the **header field as the only visible info when collapsed**, so the design forces you to choose the single most salient datum per card. Tap-hold-drag rearranges the stack with weight and feedback. The constraint *is* the design: one line of truth per card. ([Apple HIG: Wallet](https://developer.apple.com/design/human-interface-guidelines/wallet), [Apple Pass Design Guide](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html))

**→ For our app:** **Fleet Health home = a stack of dataset/workspace "passes."** Collapsed, each shows ONE header field: refresh status + freshness ("Sales DW · fresh 4m ago" or "Finance · FAILED 06:12"). Tap to fan the stack open into the full list; drag to pin priority datasets to the top. This is the antidote to Power BI's tile-grid soup.

### Clear / Tinder — gesture-as-language
Clear pioneered "the gesture *is* the UI" — swipe to complete, pull to create, pinch to collapse, with color and haptic confirming each. Tinder made the swipe a verb the whole world learned. The lesson: a small number of **physical gestures consistently mapped to verbs** beats a screen full of buttons.

**→ For our app:** Standardize a gesture vocabulary and never break it: swipe-right = acknowledge/resolve, swipe-left = snooze, pull-down = refresh-now (the action Power BI buries), long-press = peek/preview. Same four gestures on Alerts feed, Refresh detail, and Who's-using-what.

### Flighty — Live Activity + map polish as the gold standard
Flighty's Live Activities **start automatically before the event**, show a countdown + the one critical field (gate) in the compact Dynamic Island, keep estimating progress even with no connectivity, and deliberately echo **airport signage conventions** so they read as authoritative at a glance. The map highlights your gates and walking path. Apple itself featured the design. ([9to5Mac](https://9to5mac.com/2022/10/24/flighty-dynamic-island-iphone-live-activities/), [Behind the Design: Flighty](https://developer.apple.com/news/?id=970ncww4))

**→ For our app:** This is our single most important steal. **An in-progress dataset refresh = a Flighty flight.** Live Activity auto-starts when a scheduled refresh kicks off, shows "Sales DW refreshing · ~3m left" in the Dynamic Island, updates progress, and resolves to a green check or a red "FAILED — tap to triage." Borrow the "airport signage" authority: monospaced timers, status-board typography.

### Robinhood / Copilot Money — number ticker + chart scrubbing
Robinhood's charts let you **long-press to scrub** and read the exact value at any point in time; Copilot's balances animate as **live, ticking numbers** rather than static figures. The scrub is a precise, financial-grade interaction; the ticking number makes data feel alive and trustworthy. ([Robinhood Advanced Charts](https://newsroom.aboutrobinhood.com/introducing-robinhood-advanced-charts/), [Copilot Live Balance Estimates](https://help.copilot.money/en/articles/5497913-live-balance-estimates))

**→ For our app:** On **Refresh detail**, the duration-over-time trend chart is scrubbable — long-press to read "Tue 06:04 · 4m 12s · success." When fleet counts change (e.g., "23 → 22 healthy datasets"), **animate the digit roll** with a light haptic tick, never a hard cut. Active-users count on Who's-using-what ticks the same way.

### Oak / Calm — pacing & breath as motion language
Breathing apps prove that **motion can set an emotional tempo**. Slow, eased expansion/contraction signals calm and control. Speed isn't always luxury — *appropriate* tempo is.

**→ For our app:** The "all green / all healthy" state of Fleet Health home should breathe — a barely-perceptible slow pulse on the hero status ring (think 6-second cycle, like a resting heartbeat). It signals "system nominal, relax." The instant something fails, the breathing stops and the accent snaps in. The *absence* of motion becomes the alarm.

### Telegram — buttery, interruptible transitions
Telegram's hallmark: stickers and text **smoothly transform into message bubbles that fly into the chat**, the dark-mode toggle grows from the switch to cover the screen, and crucially **every animation is interruptible mid-flight** — you're never locked waiting. ([Telegram UI animation](https://60fps.design/apps/telegram), [Animated Backgrounds](https://telegram.org/blog/animated-backgrounds))

**→ For our app:** Non-negotiable rule: **no animation blocks input.** If a refresh-detail sheet is mid-zoom-open and the operator swipes to dismiss, it reverses instantly. Adopt Telegram's "element transforms into its destination" — a tapped alert card morphs into the detail header, it doesn't cross-fade.

### Linear / Superhuman — speed as the product
Superhuman is built around the **100ms rule** (the threshold where interactions feel instant) and charges premium money for a 20% efficiency gain. Linear's command palette (⌘K) searches a **local object pool, not a server**, so it's instant; every action has a shortcut and the palette teaches them. Speed *is* the luxury and the moat. ([Superhuman: Speed as the Product](https://blakecrosley.com/en/guides/design/superhuman), [How is Linear so fast](https://performance.dev/how-is-linear-so-fast-a-technical-breakdown), [Linear's delightful patterns](https://gunpowderlabs.com/2024/12/22/linear-delightful-patterns))

**→ For our app:** Optimistic UI everywhere — acknowledging an alert flips it to "resolved" instantly and reconciles in the background. Cache the last-known fleet state locally so the app **opens to real data, not a spinner**, then refreshes. Add a search/command sheet for power operators: "jump to Finance dataset," "show all failures today."

### Arc Search — "do the work for me"
Arc Search's "Browse for Me" reframes a query into a **pre-synthesized answer card** instead of a list of links. The pattern: anticipate the question and present the resolved answer, not the raw inputs.

**→ For our app:** When a failure happens, the Refresh detail shouldn't dump logs — it should lead with a **synthesized verdict**: "Failed: gateway timeout on source SQL-PROD-02. Last 3 runs also slow. Likely the source, not Power BI." Logs are progressive-disclosure below.

---

## 2. Quiet-luxury visual language — expensive vs. try-hard

Luxury in UI is **clarity, refinement, and restraint** — less signals more. The signature of an expensive interface is typography, negative space, and motion language, *not* photography or color schemes. ([Designing Digital Luxury](https://medium.com/design-bootcamp/designing-digital-luxury-how-to-design-interfaces-that-feel-expensive-f8c14a220b80), [The UI/UX of Luxury](https://www.iiad.edu.in/the-circle/why-some-websites-just-feel-expensive/))

**What actually makes it feel expensive:**
- **A real type system, not random sizes.** Hierarchy comes from *scale, weight, spacing, and opacity* — not from adding colors. Limit to one or two families. (We use SF Pro + SF Mono for data.)
- **Restraint in color + ONE accent.** Luxury interfaces differentiate with type and opacity, reserving color for meaning. Our accent appears only for "needs attention."
- **Depth via material, not drop shadows.** iOS materials/vibrancy and iOS 26 **Liquid Glass** create *hierarchy through depth* — importance via translucency/refraction/visual weight rather than borders and boxes. ([Apple HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Liquid Glass deep dive](https://www.createwithswift.com/liquid-glass-redefining-design-through-hierarchy-harmony-and-consistency/))
- **Generous negative space** — fewer elements, fewer actions, more intentional whitespace.
- **Motion with weight/spring physics**, not linear ease.
- **Haptics as a design material.** A subtle "thud" when a view snaps into place or a light tap on toggle makes the interface feel tangible — iOS is a platform defined by *what you touch*, not just what you see. ([Animating SF Symbols / haptics](https://www.createwithswift.com/animating-sf-symbols-with-the-symbol-effect-modifier/))
- **Dark-first palette** and **edge-to-edge with safe-area mastery.**

**Expensive (steal the restraint):** *Things 3* (deformation + space + Taptic), *Flighty* (signage-grade typography, authoritative calm), *Linear* (monochrome + one accent + speed). **Try-hard (avoid):** generic SaaS dashboards drenched in purple gradients, multi-color chart palettes, neon glows, and "data viz" that mistakes more colors for more insight. The difference: expensive apps **subtract** until only meaning remains; try-hard apps **add** decoration to fake sophistication.

**→ For our app:** Dark-first. One accent (see tokens — a single warm Ferrari-adjacent signal color reserved exclusively for "attention needed"). Green/healthy is communicated by *calm and stillness*, not a bright green badge. Use Liquid Glass / `.ultraThinMaterial` for the floating status bar and sheets so they feel like glass over the data. Banish drop shadows; create depth with material layering. SF Mono for all timers, durations, counts.

---

## 3. Data-viz on mobile done right

Carrot Weather proves you can pack a **surprisingly dense amount of data** into a small screen *and* stay glanceable — by using **color to communicate condition for instant reads**, surfacing buried metrics into cards, and being **smart enough not to overload** (hazard cards "bubble up" only when weather turns bad). Modular cards the user can reorder. ([Behind the Design: Carrot Weather](https://developer.apple.com/news/?id=kf623ldf), [9to5Mac](https://9to5mac.com/2026/02/25/carrot-weather-adds-the-weather-channel-data-new-dynamic-interface-more/))

**Principles:**
- **The "one number that matters" hero pattern** — every screen has a single dominant figure (Robinhood's portfolio value, Copilot's balance). Everything else is secondary.
- **Sparklines + scrubbable charts** — long-press to read exact values (Robinhood). Trends as tiny inline glyphs, detail on demand.
- **Progressive disclosure** — summary first, logs/detail on tap (Arc Search verdict pattern).
- **Glanceable status = color + SHAPE, not color alone** (accessibility — never rely on red/green for colorblind operators). A failing item gets a distinct icon *shape* and possibly position, not just a hue.
- **Skeleton/shimmer loading, never spinners** for content. Users perceive skeleton-loaded content as up to ~30–50% faster than spinners at identical real load times, because skeletons show *progress and structure* while spinners show only *activity and uncertainty*. ([LogRocket](https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/), [NN/g: Skeleton Screens](https://www.nngroup.com/articles/skeleton-screens/))

**→ For our app, per screen:**
- **Fleet Health home:** ONE hero — "23 / 24 healthy" with the breathing status ring. Beneath: a single sparkline of refresh-success-rate over 7 days. Hazard cards (failures) bubble to the top, Carrot-style, and only appear when something's wrong.
- **Refresh detail:** Hero = last run status + duration. Scrubbable duration-trend chart below. Synthesized verdict, then logs on disclosure.
- **Who's-using-what:** Hero = live active-user count (ticking). Sparkline of usage over the day; per-report rows with tiny usage sparklines.
- **Status semantics:** healthy = circle/still/dim; warning = triangle/amber; failed = filled hexagon (signage shape) + accent + the only place motion persists. Shape carries the meaning so it survives grayscale and colorblindness.
- **Loading:** skeleton cards that match the real layout (so the screen doesn't reflow), with a single restrained shimmer sweep — respect Reduce Motion by falling back to a static dim state.

---

## 4. iOS-native superpowers to exploit

This is where we leave Power BI (a near-wrapped, responsive-layout experience) for dead. Map each capability to our monitoring use case:

- **Live Activities / Dynamic Island — the killer feature.** A Live Activity should "communicate the core status of an ongoing task — nothing more," keep text minimal, highlight key numbers/progress, and emphasize rounded shapes + color identity; pressing in zooms to controls. 4KB payload cap, no ads/marketing. ([Explore Live Activities](https://developer.apple.com/news/?id=bkm73839), [Design dynamic Live Activities WWDC23](https://developer.apple.com/videos/play/wwdc2023/10194/), [iOS Live Activities best practices](https://www.pushwoosh.com/blog/ios-live-activities/))
  **→ In-progress refresh** as a Live Activity (Flighty model): compact island shows dataset + countdown; expanded shows progress bar + "Cancel / View." Resolves to green check or red FAILED.
- **Lock Screen + Home Screen widgets** → **fleet status at a glance** without opening the app. Small widget: "23/24 healthy." Medium: top 3 datasets + freshness. A red widget tint is the only time it's loud.
- **Interactive notifications** → **approve / snooze / acknowledge an alert from the Lock Screen.** A refresh-failure push has actions: "Acknowledge," "Snooze 1h," "Retry refresh," "Assign to me" — resolved without launching the app. This directly answers the 6am-failure scenario.
- **Focus filters** → an **"On-call" Focus** that lets only failure alerts (and only for *your* workspaces) break through Do Not Disturb, and hides everything else. Off-call operators stay quiet.
- **App Shortcuts / Siri / Spotlight** → "Hey Siri, is the fleet healthy?" returns the hero number; "Show Finance refreshes" deep-links. Surfaces in Spotlight.
- **Handoff** → start triaging a failure on iPhone, continue on iPad/Mac with full report context.
- **SF Symbols 6 + symbol animations** → status icons that animate on state change: `.replace` (Magic Replace) when healthy→failed, `.bounce`/`.pulse` for "needs attention," `.breathe` for the ambient nominal state, `.variableColor` for an in-progress refresh ring. ([What's new in SF Symbols 6](https://developer.apple.com/videos/play/wwdc2024/10188/), [SF Symbols](https://developer.apple.com/sf-symbols/))
- **Core Haptics** → premium when it *confirms a physical event* (snap into place, success thud); cheap when it fires on every scroll tick or as decoration. Reserve a strong haptic for resolving a failure; use the lightest tap for digit ticks. ([SF Symbols / haptics guidance](https://medium.com/simform-engineering/whats-new-in-sf-symbols-6-new-features-and-stunning-animations-9b9822f04b94))
- **ProMotion 120fps** → all scrolling and the scrub interaction must hold 120fps; this is felt, not seen, and is a core part of "expensive."

---

## 5. Motion & transitions

- **iOS 18+ "Zoom" navigation transition** (`matchedTransitionSource` + `.navigationTransition(.zoom)`) — animates a source view into a larger destination *across* navigation pushes AND sheets/full-screen covers, where the older `matchedGeometryEffect` was fragile. Best fit: a small thing becoming a large version of itself. ([Using the zoom transition in SwiftUI](https://www.createwithswift.com/using-the-zoom-navigation-transition-in-swiftui/), [Hacking with Swift](https://www.hackingwithswift.com/quick-start/swiftui/how-to-create-zoom-animations-between-views))
  **→ For our app:** Tapping a dataset card on Fleet Health **zooms** into its Refresh detail; the card *becomes* the detail header. Tapping a report thumbnail zooms into the **Report viewer**. This is the hero animation that makes navigation feel physical instead of like page loads.
- **Shared-element / "transforms into destination"** (Telegram) — the tapped element morphs; nothing cross-fades.
- **Spring physics, not linear easing** — give every transition weight (mass/stiffness/damping), so things settle like real objects. Reserve a slightly springier curve for delightful moments (acknowledge), a tighter critical-damped curve for utility moves.
- **Gesture-driven dismissals** — swipe-down to dismiss sheets, interactive and reversible (Telegram interruptibility). The gesture controls the animation's progress directly.
- **Parallax restraint** — a *whisper* of parallax on the Fleet Health hero ring as you tilt/scroll adds depth; anything more is try-hard. Respect Reduce Motion: parallax and breathing both collapse to static.

---

## 6. Anti-patterns to ban

What makes a data app feel like a glorified webpage — and exactly what **Power BI mobile gets wrong** (documented complaints):

- **Desktop layouts crammed onto a phone.** Power BI reports built for desktop "collapse, visuals overlap, or essential filters disappear" on mobile, frustrating exactly the senior users it's meant to serve. **→ Ban responsive-reflow dashboards.** Design phone-native screens; the Report viewer is the *only* place we render report content, and it gets proper pan/zoom, not a squished grid.
- **Manual pull-to-refresh as the only path to fresh data.** Power BI "does not auto-refresh on open — users must manually swipe down." **→ We open to cached truth instantly, refresh in background, and push proactively via Live Activities/notifications.** The operator never wonders if the data is stale.
- **Clunky, inconsistent navigation.** Power BI's left/right swipe "isn't working," the pages panel is "clunky for one-handed use," date pickers spawn pop-ups too big for the screen. ([Power BI usability bugs](https://community.powerbi.com/t5/Mobile-Apps/App-usability-bugs/td-p/165622), [Mobile layout issues](https://medium.com/microsoft-power-bi/power-bi-mobile-app-layout-issues-responsive-design-considerations-1dee89457fa5)) **→ One-handed-first; our four-gesture vocabulary; no controls that overflow the safe area.**
- **Discovery friction.** Power BI apps install "only via direct link." **→ Frictionless onboarding; deep links everywhere (widgets, notifications, Siri).**
- **Cargo-cult dashboard tropes:** the 12-KPI tile grid, donut/pie soup, rainbow chart palettes, gauges, drop shadows on everything, a spinner on every load, badges on badges, color-only status. **→ Banned.** One hero number, one accent, shape-coded status, skeleton loads, material depth.
- **Webpage tells:** non-native scroll bounce, tap targets that don't give haptic feedback, blocking modal spinners, transitions that cross-fade instead of transform, system font ignored in favor of a web brand font. **→ Native everything; if it could be a `WKWebView`, it's wrong.**

---

## Design tokens — starting point

> Direction, not gospel. Tune in design, but stay within this discipline.

### Type scale (SF Pro Text/Display; SF Mono for all numerics)
| Token | Size / Weight | Use |
|---|---|---|
| `hero` | 56 / Bold (SF Mono) | The one number that matters (e.g. "23/24") |
| `title1` | 28 / Semibold | Screen titles, detail header |
| `title2` | 22 / Semibold | Card headers, section heads |
| `body` | 17 / Regular | Default text |
| `callout` | 15 / Medium | Secondary labels |
| `caption` | 13 / Regular, 70% opacity | Timestamps, metadata |
| `mono-data` | 17 / Medium (SF Mono) | Durations, timers, counts |

Hierarchy via **size + weight + opacity**, never via adding colors. Dynamic Type supported throughout.

### Spacing (8pt base grid)
`4, 8, 12, 16, 24, 32, 48` — default card padding 16, section gaps 24, hero breathing room 32–48. Generous over tight; whitespace is the luxury material.

### Color — dark-first, ONE accent
- **Backgrounds:** near-black layered grays (e.g. `#0B0B0D` base, `#15161A` raised, `#1E2026` card) — depth via material, not borders.
- **Text:** white at 100 / 70 / 45% opacity for the three hierarchy levels.
- **THE accent (attention-needed only):** a single warm signal — Ferrari-adjacent **`#E8341C`-ish "Rosso" reserved exclusively for failure/attention.** It is the loudest thing in the app and appears nowhere else.
- **Status:** healthy = *no color* (calm dim white + still); warning = amber `#F5A623` + triangle; failed = Rosso accent + hexagon. Status always pairs **color + shape** for accessibility.
- Materials: iOS `.ultraThinMaterial` / Liquid Glass for floating bars and sheets, keeping ≥4.5:1 text contrast after blur. ([Materials HIG](https://developer.apple.com/design/human-interface-guidelines/materials))

### Motion timing & spring
- **Standard transition:** spring, response `0.4s`, damping `0.85` (settled, weighty).
- **Delight (acknowledge / success):** spring, response `0.5s`, damping `0.7` (slight overshoot).
- **Critical / utility (dismiss, snap):** spring, response `0.3s`, damping `1.0` (no bounce).
- **Breathing (nominal state):** `6s` ease-in-out loop, ~3% scale, stops instantly on any alert.
- **Digit roll (ticker):** `0.35s` ease-out per digit.
- All animations **interruptible**; all respect **Reduce Motion** (collapse to cross-fade/static).

### Haptic taxonomy (Core Haptics)
| Event | Haptic | Rationale |
|---|---|---|
| Digit tick / scrub readout | `.light` impact, very soft | Alive, not annoying |
| Card pickup (drag) | `.soft` impact + slight deform | Tangible mass (Things 3) |
| Drop into target / snap | `.rigid` "thud" | Confirms physical placement |
| Acknowledge / resolve | `.success` notification | Earned, satisfying |
| New failure arrives | `.warning` notification (sharp, distinct) | Demands attention, unmistakable |
| Toggle / segment change | `.selection` | Standard iOS feel |

Rule: a haptic must **confirm a real event**. Never on scroll-per-frame, never decorative.

---

## Reference apps to install and steal from

| App | Steal this |
|---|---|
| **Flighty** | Live Activity + Dynamic Island as authoritative status board; "airport signage" data typography. *(Our #1 reference.)* |
| **Things 3** | Magic-Plus draggable-object physics + haptics; restraint + negative space. |
| **Linear** (iOS) | Speed-as-luxury, optimistic UI, command palette, one-accent monochrome. |
| **Robinhood** | Long-press chart scrubbing; precise financial-grade data reads. |
| **Copilot Money** | Live ticking numbers; calm dense personal-data viz. |
| **Carrot Weather** | Dense-but-glanceable cards; hazard cards that bubble up; color-for-condition. |
| **Apple Wallet** | Card-stack pattern; one salient header field per card. |
| **Telegram** | Buttery, interruptible, element-transforms-into-destination transitions. |
| **Superhuman** | The 100ms rule; speed as the premium product. |
| **Apple Weather / Stocks** | Native hero-number + sparkline data density done by the platform owner. |

---

### Sources
- [Cultured Code — Things features](https://culturedcode.com/things/features/) · [MacStories — Things 3 review](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/)
- [9to5Mac — Flighty Dynamic Island](https://9to5mac.com/2022/10/24/flighty-dynamic-island-iphone-live-activities/) · [Apple — Behind the Design: Flighty](https://developer.apple.com/news/?id=970ncww4)
- [Robinhood — Advanced Charts](https://newsroom.aboutrobinhood.com/introducing-robinhood-advanced-charts/) · [Copilot — Live Balance Estimates](https://help.copilot.money/en/articles/5497913-live-balance-estimates)
- [Designing Digital Luxury](https://medium.com/design-bootcamp/designing-digital-luxury-how-to-design-interfaces-that-feel-expensive-f8c14a220b80) · [The UI/UX of Luxury](https://www.iiad.edu.in/the-circle/why-some-websites-just-feel-expensive/)
- [Apple HIG — Wallet](https://developer.apple.com/design/human-interface-guidelines/wallet) · [Apple — Pass Design Guide](https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html)
- [Superhuman: Speed as the Product](https://blakecrosley.com/en/guides/design/superhuman) · [How is Linear so fast](https://performance.dev/how-is-linear-so-fast-a-technical-breakdown) · [Linear's delightful patterns](https://gunpowderlabs.com/2024/12/22/linear-delightful-patterns)
- [Apple — Explore Live Activities](https://developer.apple.com/news/?id=bkm73839) · [WWDC23 — Design dynamic Live Activities](https://developer.apple.com/videos/play/wwdc2023/10194/) · [iOS Live Activities best practices](https://www.pushwoosh.com/blog/ios-live-activities/)
- [Apple — Behind the Design: Carrot Weather](https://developer.apple.com/news/?id=kf623ldf) · [9to5Mac — Carrot Weather update](https://9to5mac.com/2026/02/25/carrot-weather-adds-the-weather-channel-data-new-dynamic-interface-more/)
- [Telegram UI animation](https://60fps.design/apps/telegram) · [Telegram — Animated Backgrounds](https://telegram.org/blog/animated-backgrounds)
- [WWDC24 — What's new in SF Symbols 6](https://developer.apple.com/videos/play/wwdc2024/10188/) · [Apple — SF Symbols](https://developer.apple.com/sf-symbols/) · [Animating SF Symbols](https://www.createwithswift.com/animating-sf-symbols-with-the-symbol-effect-modifier/)
- [LogRocket — Skeleton loading](https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/) · [NN/g — Skeleton Screens](https://www.nngroup.com/articles/skeleton-screens/)
- [Using the zoom transition in SwiftUI](https://www.createwithswift.com/using-the-zoom-navigation-transition-in-swiftui/) · [Hacking with Swift — zoom animations](https://www.hackingwithswift.com/quick-start/swiftui/how-to-create-zoom-animations-between-views)
- [Apple HIG — Materials](https://developer.apple.com/design/human-interface-guidelines/materials) · [Liquid Glass — hierarchy through depth](https://www.createwithswift.com/liquid-glass-redefining-design-through-hierarchy-harmony-and-consistency/)
- [Power BI mobile — usability bugs](https://community.powerbi.com/t5/Mobile-Apps/App-usability-bugs/td-p/165622) · [Power BI mobile — layout issues](https://medium.com/microsoft-power-bi/power-bi-mobile-app-layout-issues-responsive-design-considerations-1dee89457fa5)
