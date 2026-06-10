# Ferrari Dashboard R&D — "The Luce" for a Desktop Data-Health Dashboard

> Scope: deep study of real, current (2024–2026) Ferrari interior/HMI design, translated into concrete Electron/React/CSS directives for the PBIVIEWER Insights board. This file **extends** `docs/design/IOS-CRAFT-SPEC.md` — same tokens (`bg/canvas #0B0B0D`, surfaces `#141417/#1C1C21/#26262C`, accent amber `#E8A33D`, red `#FF453A` sacred/error-only), same philosophy (dark-first, one accent, elevation by light). Nothing here contradicts it; it adds the *automotive cluster* layer for the desktop target.
>
> Verification note up front: **"the Luce" is a real car.** The Ferrari Luce (Type F222) is Ferrari's first production EV, a four-door revealed in stages through late 2025–May 2026, with an interior and interface designed by Jony Ive and Marc Newson's LoveFrom collective. It is the single best reference for this brief because it is, literally, a luxury *data display* problem solved by the best industrial designers alive. ([Ferrari Luce official](https://www.ferrari.com/en-EN/auto/ferrari-luce), [Wikipedia](https://en.wikipedia.org/wiki/Ferrari_Luce), [Top Gear reveal](https://www.topgear.com/car-news/electric/its-finally-here-meet-ferrari-luce-maranellos-first-ever-fully-electric-car), [Ferrari: interior & interface](https://www.ferrari.com/en-EN/corporate/articles/ferrari-luce-revealing-interior-interface-design-and-the-name))

---

## Part 1 — Observations (what the real cars actually do)

### O1. The Luce cluster: data lives BEHIND glass, in physical layers — never on a plane
The Luce's binnacle is **two Samsung OLED panels stacked**: a 12" panel below and a 12.9" panel on top, with the top panel using HIAA (hole-in-active-area) tech to cut **three large circular openings** through its active area, revealing the lower display *underneath*. Each opening is covered by a **slightly convex clear glass lens** (Corning glass) and ringed in **anodised aluminium**. Sandwiched *between* the two panels are **physical aluminium needles, backlit by 15 LEDs**. The result: genuine optical depth — pixels at two distances, a real needle between them, a curved lens above. ([GSMArena — stacked OLED + HIAA](https://www.gsmarena.com/the_ferrari_luce_will_have_samsung_oled_displays_with_holes_and_stacked_design-news-73001.php), [Gadgetbond — Samsung multi-layer dash](https://gadgetbond.com/ferrari-luce-samsung-oled-screens/), [Engadget — inside the Ive interior](https://www.engadget.com/transportation/evs/inside-ferraris-luce-ev-the-jony-ive-interior-is-here-130000211.html))

### O2. The Luce center stack: screens perforated by real switchgear
The 10.12" center OLED is **perforated with holes through which chunky machined toggle switches and a glass volume knob physically protrude**; three physical clock hands poke through the display. ~40 pieces of Corning glass are scattered through the cockpit; everything that isn't glass is **CNC-milled, anodised recycled aluminium** (gray / dark gray / rose gold). The whole panel pivots on a handle. Philosophy: deliberately *anti-touchscreen* — controls you grip, not tap. ([Engadget](https://www.engadget.com/transportation/evs/inside-ferraris-luce-ev-the-jony-ive-interior-is-here-130000211.html), [Dezeen — LoveFrom interior](https://www.dezeen.com/2026/05/25/electric-ferrari-luce-jony-ive-marc-newson-lovefrom/), [Robb Report — cabin details](https://robbreport.com/motors/cars/ferrari-all-electric-luce-cabin-details-revealed-1237560385/))

### O3. The ignition ceremony is real and choreographed
In the Luce, **the control panel and binnacle light up simultaneously the moment the key is set into the central console** — illumination *is* the handshake, before anything moves. Ambient lighting is used "to define space, like a Flos lamp defines a Milanese living room," not as RGB decoration. ([Ferrari corporate — Luce interior reveal](https://www.ferrari.com/en-EN/corporate/articles/ferrari-luce-revealing-interior-interface-design-and-the-name), [Schweitzer Designs analysis](https://www.schweitzerdesigns.com/post/ferrari-luce-anti-screen-ev-interior-design), [Driven — retro-inspired interior](https://www.drivencarguide.co.nz/news/ferrari-reveals-name-and-fantastically-retro-inspired-interior-for-first-ever-ev/))

### O4. Ferrari publicly recanted touch controls — weight is back (Amalfi, 2025)
The Amalfi (Roma's successor) **brought back physical buttons**, including an **aluminium engine Start/Stop button** on the wheel; Maranello admitted the haptic/capacitive wheel "didn't work." Its central tunnel is **milled from a single block of anodised aluminium**. The physical-button wheel is being retrofitted to 296, SF90, Purosangue, 12Cilindri. Cluster: 15.6" driver display, 10.25" center, optional 8.8" passenger display. ([Top Gear — Amalfi](https://www.topgear.com/car-news/first-look/romas-replacement-meet-new-ferrari-amalfi-now-buttons), [evo](https://www.evo.co.uk/ferrari/207961/new-2026-ferrari-amalfi-revealed-physical-buttons-return-in-the-631bhp-roma), [Jalopnik](https://www.jalopnik.com/1902133/new-ferrari-amalfi-coupe-roma-facelift-interior-buttons-design/), [Autoblog — retrofit](https://www.autoblog.com/news/ferrari-physical-buttons-steering-wheel-retrofit))

### O5. SF90/296 cluster: one dominant gauge, everything else orbits it
The SF90's 16" curved HD cluster (first in a production car) defaults to **a large central rev counter framed by the battery indicator**, with nav and audio as **'wings' of information that slide side-to-side *behind* it**. Graphics are explicitly designed for a **3D effect during transitions — including power-on**. HMI doctrine: "eyes on the road, hands on the wheel" — one focal instrument, peripheral data subordinated. ([Ferrari SF90](https://www.ferrari.com/en-EN/auto/sf90-stradale), [WhichCar — SF90 cluster](https://www.whichcar.com.au/car-news/ferrari-sf90-spider-revealed))

### O6. Purosangue & 12Cilindri: dual-cockpit symmetry, floating volumes, no center touchscreen
Purosangue: dual-cockpit, 16" driver cluster + dedicated passenger display, **no central infotainment screen at all** — climate via a pop-out rotary dial; cabin is leather, Alcantara, carbon weave, brushed metal. 12Cilindri: a horizontal dash where the two instrument **binnacles "seem almost to float"**, separated from the lower technical section by a deliberate **colour-and-material change**; the armrest has **contrasting metallic edging where volumes intersect**; gear toggles sit in a Y-shaped metal element. Surfaces meet with *gaps and material changes*, not outlines. ([Ferrari — Purosangue instrument panel](https://www.ferrari.com/en-EN/auto/smart-guide-ferrari-purosangue/purosangue-instrumental-panel), [Man of Many Purosangue review](https://manofmany.com/auto/cars/ferrari-purosangue-review), [Ferrari — 12Cilindri "for the few"](https://www.ferrari.com/en-EN/corporate/articles/ferrari-12cilindri-for-the-few), [Top Gear — 12Cilindri interior](https://www.topgear.com/car-reviews/ferrari/12cilindri/interior))

### O7. Color discipline & typography
The cabins are near-black/dark leather with **one warm metallic note** (anodised aluminium, rose-gold option in the Luce) and **red reserved** — the manettino, redline arc, START engine ring. Cluster numerals are compact grotesque caps, high x-height, tightly tracked legends (SPORT, RACE, km/h) — labels read like *engraved gauge legends*, not UI captions. Status is positional (redline is always at the same clock position), not color-roulette.

### O8. What makes a real cluster feel ALIVE at idle (and web dashboards dead)
At idle a Ferrari cluster still *moves*: the tach needle sits just off zero and trembles with combustion; coolant/oil values creep; the backlight has thermal warmth. Web dashboards die because between data refreshes **literally zero pixels change**. The lesson is *micro-motion at the threshold of perception* — sub-1% opacity breathing, 1px needle tremor — plus instant, weighted response the moment you touch anything (O4).

---

## Part 2 — Directives (numbered, implementable)

All values assume the IOS-CRAFT-SPEC tokens. New CSS custom properties introduced here use the `--luce-*` prefix. Everything animates **transform / opacity / filter only** (no animated box-shadow or blur radius — composite-unfriendly). All idle/ceremony motion gated behind `@media (prefers-reduced-motion: no-preference)`.

### D1. Smoked-glass instrument layering (from O1) — gauges sit BEHIND a lens, not on the canvas
Every KPI "gauge" card is a 3-layer sandwich: (a) a **lower deck** holding the live data glow, (b) the data layer itself, (c) a **lens layer** above it — a translucent dark film with a convex highlight. The user should read depth: backlight below, numbers in the middle, glass on top.
```css
.gauge { position: relative; background: #141417; border-radius: 16px; overflow: hidden; }
/* (a) lower deck: saturated backlight blur — the "OLED behind" */
.gauge__backlight {
  position: absolute; inset: 12%;
  background: radial-gradient(60% 50% at 50% 65%, rgba(232,163,61,0.16), transparent 70%);
  filter: blur(24px); pointer-events: none;
}
/* (c) smoked lens: darkens edges, one convex specular wipe */
.gauge__lens { position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  background:
    radial-gradient(120% 90% at 50% -20%, rgba(255,255,255,0.055), transparent 55%), /* convex highlight */
    radial-gradient(140% 140% at 50% 50%, transparent 55%, rgba(0,0,0,0.38) 100%);   /* smoke vignette */
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06),  /* light catch on top lip */
              inset 0 -10px 24px -12px rgba(0,0,0,0.55), /* recess under the lens */
              inset 0 0 0 1px rgba(0,0,0,0.6);          /* the bezel seam (see D2) */
}
```
React: render as `<Gauge>` with `backlight / children / lens` slots so every cluster tile inherits the sandwich. The backlight's hue follows status (amber live, `#FF453A` only when broken — red sacred per spec).

### D2. Shadow gaps, not light hairlines (from O6) — panels separated like trim pieces
The 12Cilindri separates volumes with dark gaps and material change. On desktop: **1px near-black seams** between cluster panels instead of `white@8%` hairlines (keep the iOS-spec light hairline only as the *light-catch* on a panel's top lip — the pairing reads as machined edge).
```css
:root { --luce-seam: rgba(0,0,0,0.65); --luce-lip: rgba(255,255,255,0.05); }
.panel { background: #141417; border-radius: 12px;
  box-shadow: 0 0 0 1px var(--luce-seam),            /* the shadow gap */
              inset 0 1px 0 var(--luce-lip);         /* light catches the top edge */
}
.panel + .panel { margin-top: 2px; } /* the physical gap itself: 2px of #0B0B0D showing through */
```
Grid version: give the cluster container `background:#0B0B0D; gap:2px;` and let the canvas *be* the seam — exactly how trim gaps work.

### D3. Needle/value physics via `linear()` spring easing — VERIFIED
**There is no implemented native CSS `spring()` in any Chromium as of June 2026** (it exists only as an old proposal; the CSSWG path is `linear()` in [css-easing-2](https://drafts.csswg.org/css-easing/)). What *is* fully supported — Chromium 113+, i.e. every remotely current Electron (Electron stable in mid-2026 ships Chromium ~148–150, per [electron releases](https://releases.electronjs.org/)) — is **`linear()` easing**, in both CSS and the Web Animations API `easing` string, which approximates a real damped spring from sampled physics. ([Chrome dev — linear()](https://developer.chrome.com/docs/css-ui/css-linear-easing-function), [MDN — linear()](https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/linear), [Josh Comeau — springs in native CSS](https://www.joshwcomeau.com/animation/linear-timing-function/), [kvin.me generator](https://www.kvin.me/css-springs/how-to-use))
```css
:root { /* critically-damped-ish "weighted needle": tiny single overshoot, settles dead */
  --spring-needle: linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%,
    1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%,
    1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%,
    1.003 76.9%, 1.001 100%);
  --spring-settle: linear(0, 0.013, 0.318 6.6%, 0.751 13.6%, 0.918 18.1%, 1.016 23%,
    1.052 27.2%, 1.057 30.5%, 1.026 38.2%, 0.999 45.4%, 0.995 53%, 1 100%); /* damping ~0.9 */
}
.gauge__needle { transition: transform 700ms var(--spring-needle); transform: rotate(var(--angle)); }
```
JS (WAAPI) when the target angle changes faster than the transition (interruption = retarget, like a real needle):
```js
el.animate({ transform: [`rotate(${from}deg)`, `rotate(${to}deg)`] },
           { duration: 700, easing: getComputedStyle(root).getPropertyValue('--spring-needle'), fill: 'forwards' });
```
Use `--spring-settle` (no visible overshoot) for panel/number moves; `--spring-needle` (one proud overshoot) **only** for gauge needles and the boot sweep — overshoot is the needle's mass.

### D4. Backlit icons & legends (from O1's 15-LED needles) — glow is emission, not decoration
Icons/labels that represent *live* things are lit from within at low intensity; everything inert stays unlit. Two intensities only.
```css
.lit  { color: #E8A33D; filter: drop-shadow(0 0 6px rgba(232,163,61,0.35)); }  /* live/active */
.lit--hot { filter: drop-shadow(0 0 6px rgba(232,163,61,0.35)) drop-shadow(0 0 16px rgba(232,163,61,0.18)); } /* the one current alert */
.legend { color: rgba(235,235,245,0.6); text-shadow: 0 0 8px rgba(232,163,61,0.12); } /* faint phosphor on gauge legends */
```
Rule: at most **one** `--hot` element per screen; broken state swaps hue to `#FF453A` at the *same* intensities (red gets no extra bloom — it's sacred, not loud).

### D5. One virtual light source, high and slightly forward (depth from light, O6)
All elevation shadows share a single key light at ~ -90° (top), so stacked panels read as one physical assembly. Standard elevation stack (cards → raised → popover):
```css
--shadow-1: 0 1px 2px rgba(0,0,0,0.5), 0 8px 24px -8px rgba(0,0,0,0.5);
--shadow-2: 0 2px 4px rgba(0,0,0,0.55), 0 16px 40px -12px rgba(0,0,0,0.6);
--shadow-3: 0 4px 8px rgba(0,0,0,0.6), 0 24px 64px -16px rgba(0,0,0,0.7);
```
Pair every level with its surface lightening (`#141417 → #1C1C21 → #26262C`) per the iOS spec; never a light border to fake lift. Recessed wells (sparkline trays, input fields) invert: `inset 0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(0,0,0,0.6)` plus a 1px `--luce-lip` on the *bottom* inner edge (light falls into the well and catches the far lip).

### D6. The ignition ceremony (from O3 + O5) — the Insights board boots like a cluster
Sequence on app load / board mount (total ≤ 1400ms, skippable by any input, replaced by a 300ms crossfade under reduced-motion):
1. **0–150ms — key-set:** canvas holds `#0B0B0D`; all panel seams and the backlight decks fade in together (opacity 0→1, 150ms ease-out) — illumination before motion, exactly the Luce's key moment.
2. **150–800ms — sweep:** every gauge needle/value animates 0 → max → actual using `--spring-needle`; numeric KPIs count up with tabular digits. Stagger panels left→right 60ms apart (cluster boot, not random shimmer).
3. **800–1200ms — wings:** secondary panels slide in *behind* the hero KPI from the sides (`translateX(±24px)→0`, opacity 0→1, `--spring-settle`, 400ms) — the SF90's wings-behind-the-tach move.
4. **1200–1400ms — settle:** the live-dot starts breathing (D10); `--hot` glow ignites on the worst current issue, if any.
```js
const boot = [
  { sel: '.gauge__backlight, .panel', kf: { opacity: [0,1] }, opt: { duration:150, easing:'ease-out' } },
  { sel: '.gauge__needle', kf: { transform:['rotate(-120deg)','rotate(var(--angle))'] },
    opt: { duration:650, delay: i => 150 + i*60, easing: SPRING_NEEDLE, fill:'forwards' } },
  { sel: '.panel--wing', kf: { transform:['translateX(24px)','translateX(0)'], opacity:[0,1] },
    opt: { duration:400, delay: i => 800 + i*60, easing: SPRING_SETTLE, fill:'forwards' } },
];
```
Run it **once per session**, not per navigation — a ceremony repeated becomes a nuisance.

### D7. Tach-first hierarchy (from O5) — one hero gauge, data orbits it
The board's single most important number (overall data health) is the central tach: largest, only 100%-white element, centered or strongly dominant. Secondary metrics are *wings* — visually subordinate panels flanking it that **slide behind/under** the hero on filter or drill-down (`z-index` below hero; transitions translate them under its shadow, `--shadow-2` makes the hero visibly *above*). Never present 6 equal tiles; a cluster has exactly one rev counter.

### D8. Convex lens + anodised ring for circular gauges (from O1)
Circular gauges (health ring, refresh dial) get the Luce treatment: aluminum ring, glass lens, needle between.
```css
.dial { border-radius: 50%; position: relative; background:#1C1C21;
  border: 2px solid transparent;
  background-image: linear-gradient(#1C1C21,#1C1C21),
    conic-gradient(from 200deg, #3A3A40, #6B6B72 12%, #2A2A2F 40%, #55555C 70%, #3A3A40); /* anodised ring */
  background-origin: border-box; background-clip: padding-box, border-box;
}
.dial::after { /* convex lens */ content:''; position:absolute; inset:2px; border-radius:50%;
  background: radial-gradient(75% 55% at 50% 18%, rgba(255,255,255,0.07), transparent 60%);
  box-shadow: inset 0 -8px 16px -8px rgba(0,0,0,0.6); pointer-events:none; }
```
The metallic conic gradient is the **only** permitted "chrome" in the app, and only on dial bezels — restraint keeps it jewelry, not theme.

### D9. Weighted switchgear (from O2/O4) — controls with travel and an aluminum START
Buttons/toggles answer in two phases: instant mechanical press (fast, 80ms), sprung release (`--spring-settle`, 250ms). The press physically *descends* into the panel.
```css
.btn { transition: transform 250ms var(--spring-settle), box-shadow 80ms ease-out;
  box-shadow: var(--shadow-1), inset 0 1px 0 var(--luce-lip); }
.btn:active { transform: translateY(1px) scale(0.985);
  box-shadow: 0 0 0 1px var(--luce-seam), inset 0 2px 4px rgba(0,0,0,0.5); transition-duration: 80ms; }
```
The primary action ("Run health scan" / "Refresh all") is the **engine-start button**: circular, anodised ring (D8 bezel), amber legend, and the only control with a faint resting glow. On invoke it does press → 150ms hold → board responds with a one-frame backlight surge (backlight deck opacity 1→1.3 clipped→1 over 400ms). Keyboard parity: `:focus-visible` = 2px amber ring, animated in 150ms.

### D10. Alive at idle (from O8) — micro-motion at the threshold of perception
Between refreshes, exactly three things breathe; everything else is still (stillness is what makes the breathing read):
```css
@keyframes breathe { 0%,100% { opacity:0.55; } 50% { opacity:1; } }
.live-dot { animation: breathe 4.8s ease-in-out infinite; }            /* the LIVE indicator */
@keyframes idle-tremor { 0%,100%{ transform:rotate(var(--angle)); }
  33%{ transform:rotate(calc(var(--angle) + 0.4deg)); } 66%{ transform:rotate(calc(var(--angle) - 0.3deg)); } }
.gauge__needle--live { animation: idle-tremor 7s steps(24) infinite; } /* sub-pixel needle flutter */
@keyframes deck-drift { 0%,100%{ opacity:0.9; transform:scale(1);} 50%{ opacity:1; transform:scale(1.015);} }
.gauge__backlight { animation: deck-drift 9s ease-in-out infinite; }   /* thermal glow drift */
```
Periods are mutually prime (4.8 / 7 / 9s) so the composition never visibly loops. All three: opacity/transform only, `will-change` avoided (3 tiny layers, let the compositor decide), disabled under `prefers-reduced-motion` and when the window loses focus (`document.hidden` → pause via `animation-play-state`).

### D11. Material & color discipline (from O6/O7) — extends, never overrides, the spec
- Canvas `#0B0B0D`, surfaces by lightness, **amber `#E8A33D` is the instrument backlight** — it may glow (D4) but never fills a surface.
- **Red `#FF453A` stays sacred**: redline only — failed refresh, broken dataset, destructive confirm. Red never breathes, never decorates, never appears twice at once if once will do.
- Carbon weave / leather stitching: **do not skeuomorph**. The desktop translation of "stitched leather" is the *seam discipline* (D2) and panel grouping; the translation of "carbon weave" is at most one `repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0 2px, transparent 2px 4px)` micro-texture on the app chrome (title bar) — below conscious notice, like grain.
- Brushed aluminum: reserved to dial bezels (D8) and the START control. Two metals max on screen, matching the Luce's restraint.

### D12. Cluster typography (from O7)
Numerals: tabular mono (per iOS spec, SF Mono → on Windows/Linux Electron use `'SF Mono', 'Roboto Mono', ui-monospace` stack), hero at 56–64px/Medium, tracking −0.5. Gauge legends: 11px/Semibold, ALL-CAPS, tracking +1.2px (wider than the iOS +0.6 — engraved-legend look needs more air at desktop DPI), color `text/tertiary`. Units baseline-aligned, tertiary, never the same size as the value. No font may animate size; values change by D3 ticker only.

### D13. Performance guardrails (Electron-specific)
- The boot ceremony and idle layers run on the compositor: only `transform/opacity/filter`. The `filter: blur(24px)` backlight deck is **static geometry** (blur never animates; its *opacity* does).
- Pre-promote the three idle layers by giving them their own stacking contexts (`isolation: isolate`), not blanket `will-change`.
- `backgroundThrottling` stays default-on; pause idle animations on `visibilitychange` so a hidden dashboard costs ~0 CPU — a parked car doesn't idle its tach.
- Verify spring strings render correctly with DevTools' easing visualizer (Chromium has a `linear()` editor tooltip). ([Chrome dev docs](https://developer.chrome.com/docs/css-ui/css-linear-easing-function))

### D14. Status without hue (carries over from spec §1.4)
Every gauge state pairs hue + shape + position: healthy = ring fully lit; warning = amber wedge at the gauge's "redline position" (always same clock position, like O7); broken = red octagon icon at the needle hub + needle parks at zero. Color-blind users read position and shape; the Luce reads at night by *where* the light is, not what color.

---

## Part 3 — The five-line soul of it

Dark trim panels separated by real shadow gaps; one hero gauge with a sprung needle behind a convex lens; amber backlight that breathes at idle; switchgear that travels when pressed; and a once-per-session ignition sweep. Everything else is restraint.

## Sources
- Ferrari Luce: [Ferrari.com model page](https://www.ferrari.com/en-EN/auto/ferrari-luce) · [interface & interiors](https://www.ferrari.com/en-EN/auto/ferrari-luce-design) · [corporate interior reveal](https://www.ferrari.com/en-EN/corporate/articles/ferrari-luce-revealing-interior-interface-design-and-the-name) · [Wikipedia](https://en.wikipedia.org/wiki/Ferrari_Luce) · [Top Gear](https://www.topgear.com/car-news/electric/its-finally-here-meet-ferrari-luce-maranellos-first-ever-fully-electric-car) · [Engadget](https://www.engadget.com/transportation/evs/inside-ferraris-luce-ev-the-jony-ive-interior-is-here-130000211.html) · [Dezeen](https://www.dezeen.com/2026/05/25/electric-ferrari-luce-jony-ive-marc-newson-lovefrom/) · [Robb Report](https://robbreport.com/motors/cars/ferrari-all-electric-luce-cabin-details-revealed-1237560385/) · [GSMArena (Samsung stacked OLED/HIAA)](https://www.gsmarena.com/the_ferrari_luce_will_have_samsung_oled_displays_with_holes_and_stacked_design-news-73001.php) · [Gadgetbond](https://gadgetbond.com/ferrari-luce-samsung-oled-screens/) · [Schweitzer Designs](https://www.schweitzerdesigns.com/post/ferrari-luce-anti-screen-ev-interior-design) · [Driven](https://www.drivencarguide.co.nz/news/ferrari-reveals-name-and-fantastically-retro-inspired-interior-for-first-ever-ev/)
- Amalfi: [Top Gear](https://www.topgear.com/car-news/first-look/romas-replacement-meet-new-ferrari-amalfi-now-buttons) · [evo](https://www.evo.co.uk/ferrari/207961/new-2026-ferrari-amalfi-revealed-physical-buttons-return-in-the-631bhp-roma) · [Jalopnik](https://www.jalopnik.com/1902133/new-ferrari-amalfi-coupe-roma-facelift-interior-buttons-design/) · [Autoblog (retrofit)](https://www.autoblog.com/news/ferrari-physical-buttons-steering-wheel-retrofit)
- SF90 / Purosangue / 12Cilindri: [Ferrari SF90](https://www.ferrari.com/en-EN/auto/sf90-stradale) · [WhichCar SF90 cluster](https://www.whichcar.com.au/car-news/ferrari-sf90-spider-revealed) · [Ferrari Purosangue instrument panel](https://www.ferrari.com/en-EN/auto/smart-guide-ferrari-purosangue/purosangue-instrumental-panel) · [Man of Many](https://manofmany.com/auto/cars/ferrari-purosangue-review) · [Ferrari 12Cilindri](https://www.ferrari.com/en-EN/corporate/articles/ferrari-12cilindri-for-the-few) · [Top Gear 12Cilindri interior](https://www.topgear.com/car-reviews/ferrari/12cilindri/interior)
- Tech verification: [Chrome — linear() easing](https://developer.chrome.com/docs/css-ui/css-linear-easing-function) · [MDN — linear()](https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/linear) · [Josh Comeau — native CSS springs](https://www.joshwcomeau.com/animation/linear-timing-function/) · [kvin.me spring generator](https://www.kvin.me/css-springs/how-to-use) · [CSSWG css-easing-2 draft](https://drafts.csswg.org/css-easing/) · [Electron releases (Chromium ~148–150, mid-2026)](https://releases.electronjs.org/)
