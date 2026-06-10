# Ferrari Dashboard R&D — Ive / LoveFrom / Luce, for a Desktop Data-Health Dashboard

> **Course correction.** An earlier draft of this file surveyed Ferrari racing cockpits broadly (SF90, Amalfi, Purosangue, 12Cilindri). That was the wrong brief. The owner's words: *"Not all Ferrari dashboards. Just the Ives / Luce design… I'm not looking for yellow and red fast car shit. I'm looking for Ives / Apple / Luce."* This rewrite is scoped to exactly one object — the **LoveFrom × Ferrari** interior/HMI of the **Ferrari Luce** — read through Jony Ive's documented design philosophy from his Apple era.
>
> **Explicitly excluded:** racing livery, carbon-fiber clichés, aggressive angular cockpit styling, red/yellow racing accents, speed-metaphor decoration. None of it appears below.
>
> This file **extends** `docs/design/IOS-CRAFT-SPEC.md` and `docs/design/APP-DESIGN-LANGUAGE.md` — same tokens (canvas `#0B0B0D`, surfaces `#141417 / #1C1C21 / #26262C`, one warm accent `#E8A33D`, red `#FF453A` strictly for failures), same dark-first/one-accent/elevation-by-light philosophy. Nothing here contradicts them; this adds the LoveFrom-instrument layer for the desktop Electron target.

---

## Part 1 — What is verifiably known (and the principles behind it)

### 1.1 The collaboration is real, long, and total

- **27 Sept 2021** — Exor, Ferrari and LoveFrom (the creative collective founded by **Sir Jony Ive and Marc Newson**) announced a long-term creative partnership; LoveFrom's first major project beyond Silicon Valley, working with Ferrari design under Flavio Manzoni. ([Exor press release](https://www.exor.com/press-releases/2021-09-27/exor-ferrari-and-lovefrom-announce-creative-partnership), [Ferrari corporate](https://www.ferrari.com/en-EN/corporate/articles/exor-ferrari-and-lovefrom-announce-creative-partnership), [Wallpaper*](https://www.wallpaper.com/design/jony-ive-marc-newson-lovefrom-partnership-with-ferrari), [MacRumors](https://www.macrumors.com/2021/09/27/ferrari-jony-ive-lovefrom-partnership/))
- **The car is named "Luce"** — Italian for *light*. Ferrari's first production EV and first five-seater. Interior, interface and name revealed **9 Feb 2026**; full car revealed **25 May 2026** near Rome; ~€550,000, deliveries Q4 2026. ([Ferrari Luce model page](https://www.ferrari.com/en-EN/auto/ferrari-luce), [Ferrari corporate — interior & interface reveal](https://www.ferrari.com/en-EN/corporate/articles/ferrari-luce-revealing-interior-interface-design-and-the-name), [Electrek](https://electrek.co/2026/02/09/ferrari-reveals-name-first-electric-car-luce-shows-off-jony-ive-designed-interior/), [Dezeen — launch](https://www.dezeen.com/2026/05/25/electric-ferrari-luce-jony-ive-marc-newson-lovefrom/), [CNN](https://www.cnn.com/2026/05/26/cars/ferrari-new-electric-vehicle-luce-intl-hnk), [CNBC](https://www.cnbc.com/2026/05/28/ferrari-ceo-luce-price-electric-car.html))
- The name itself is the thesis: **light is the design material.** Not speed, not aggression — *luce*.

### 1.2 What is public about the Luce interior / HMI

1. **Data lives behind glass, in physical layers — never on one plane.** The instrument binnacle is **two stacked Samsung OLED panels** (12" below, 12.9" above). The upper panel uses **HIAA** (hole-in-active-area, the Galaxy punch-hole tech) to cut **three circular openings ~100 mm across** — roughly 20× a phone camera hole — through its active area, revealing the lower panel underneath. **Physical, backlit needles sit between the two panels**, and each opening is capped by a **slightly convex Corning glass lens**. Pixels at two depths, a real needle between them, curved glass above: genuine optical depth. ([GSMArena](https://www.gsmarena.com/the_ferrari_luce_will_have_samsung_oled_displays_with_holes_and_stacked_design-news-73001.php), [Android Authority](https://www.androidauthority.com/ferrari-luce-samsung-oled-galaxy-phone-tech-3670831/), [Engadget — interior](https://www.engadget.com/transportation/evs/inside-ferraris-luce-ev-the-jony-ive-interior-is-here-130000211.html))
2. **Screens are perforated by real switchgear.** The 10.12" center OLED has holes through which **chunky machined toggle switches and a glass volume knob physically protrude**; three mechanical hands (clock / stopwatch / compass) rotate 360° through perforations in the panel. LoveFrom deliberately rejected the giant-touchscreen convention — Ive has called such screens **"lazy"** — in favor of controls with real travel; reviewers describe the switches clicking **"like a rifle bolt."** ([Engadget](https://www.engadget.com/transportation/evs/inside-ferraris-luce-ev-the-jony-ive-interior-is-here-130000211.html), [Dezeen — interior](https://www.dezeen.com/2026/02/13/jony-ive-marc-newson-lovefrom-ferrari-luce-interior/), [Carscoops](https://www.carscoops.com/2026/02/ferrari-luce-ev-interior-tactile-controls/), [Autonocion — "lazy" quote](https://www.autonocion.com/us/ferrari-luce-touchscreens-tesla/))
3. **Materials are what they appear to be.** ~40 pieces of Corning Gorilla Glass throughout the cockpit (shifter surround, gauge lenses, the key itself); everything that isn't glass is **CNC-machined, recycled anodised aluminium** in three finishes — gray, dark gray, rose gold; a recycled-aluminium three-spoke wheel with physical switches. No fake textures anywhere. ([Engadget](https://www.engadget.com/transportation/evs/inside-ferraris-luce-ev-the-jony-ive-interior-is-here-130000211.html), [Robb Report](https://robbreport.com/motors/cars/ferrari-all-electric-luce-cabin-details-revealed-1237560385/), [Autoblog](https://www.autoblog.com/news/ferrari-reveals-luce-ev-interior-name))
4. **The ignition is a choreography of light, not sound.** The Luce's key is **Gorilla glass with a color E Ink face** (an automotive first). Docked into the center console, its yellow **fades to black and appears to flow into the gear selector, which glows to signal the car is ready** — the control panel and binnacle illuminate together. Ferrari calls the moment "theatrical and memorable"; it is illumination-as-handshake, before anything moves. ([Dezeen](https://www.dezeen.com/2026/02/13/jony-ive-marc-newson-lovefrom-ferrari-luce-interior/), [Carscoops](https://www.carscoops.com/2026/02/ferrari-luce-ev-interior-tactile-controls/), [T3](https://www.t3.com/auto/electric-vehicles/the-ferrari-luce-and-its-wild-interior-tech-just-rewrote-the-ev-rule-book), [Ferrari corporate](https://www.ferrari.com/en-EN/corporate/articles/ferrari-luce-revealing-interior-interface-design-and-the-name))
5. **Light defines space; it does not decorate it.** Ambient lighting is used "to define space, like a Flos lamp defines a Milanese living room" — a single warm note in a calm, dark cabin, not RGB theater. The interior is described as "a celebration of hundreds of discrete products… together they create a single, clean volume, with forms simplified and rationalised." ([Schweitzer Designs analysis](https://www.schweitzerdesigns.com/post/ferrari-luce-anti-screen-ev-interior-design), [Ferrari — Interface & Interiors](https://www.ferrari.com/en-EN/auto/ferrari-luce-design), [CNN](https://www.cnn.com/2026/05/26/cars/ferrari-new-electric-vehicle-luce-intl-hnk))

### 1.3 The Ive principles that govern it (documented, Apple era)

These are not vibes; they are the stated method, and every Luce decision above instantiates one:

- **Reduction until only the essential remains.** "Simplicity is not the absence of clutter… It's about bringing order to complexity." Remove until removing breaks meaning; what's left carries everything. ([Ive, Telegraph interview, 2012](https://www.telegraph.co.uk/technology/apple/9283486/Jonathan-Ive-interview-simplicity-isnt-simple.html)) → *one* needle per gauge, three openings, one glowing selector.
- **Honest materials.** Things should be what they appear to be — glass is glass, aluminium is aluminium; no material pretending to be another (the Rams inheritance). → Gorilla glass lenses, machined recycled aluminium, zero appliqué.
- **Depth from light and subtle radii, never ornament.** Form is read by how light falls on a curve, a chamfer, a recess — not by drawn outlines or decoration. → stacked panels, convex lenses, a literal physical gap between display layers.
- **Calm by default; attention is earned.** The interface defers to content and speaks only when something matters (the iOS 7 "deference" doctrine). → a dark cabin where the one thing that glows is the thing that's ready.
- **The "inevitable" feeling.** Ive's recurring test: the resolved design should feel almost inevitable, as if it could not have been otherwise — design that doesn't look "designed."
- **Care in unseen details.** "We believe our users can sense the care" — finish the back of the cabinet; the parts nobody sees are built to the same standard. → needles between panels that most owners will never know are physical.
- **Restrained color.** Near-monochrome material palette plus one meaningful warm note (the rose-gold anodising; the yellow E Ink moment). **This maps 1:1 onto the app's existing system: near-black `#0B0B0D`, amber `#E8A33D` as the single voice, red reserved for failure.** No change required — the palette already passes.

---

## Part 2 — Directives

Twelve numbered directives translating Part 1 into the Electron/React/CSS Insights board. New tokens use the `--luce-*` prefix. All motion animates **transform / opacity / filter only**; everything idle/ceremonial is gated behind `@media (prefers-reduced-motion: no-preference)` and pauses when `document.hidden`.

**Platform verification (done against this repo):** this project ships **Electron 42.3.3** (`package.json`, `node_modules/electron/dist/version`), which bundles **Chromium 148** ([Electron 42 release notes](https://www.electronjs.org/blog/electron-42-0)). CSS **`linear()` easing** has been supported since Chromium 113 — in stylesheets, in CSS custom properties, and as a Web Animations API `easing` string — so spring-approximation via `linear()` is fully available here. There is still **no native CSS `spring()`** in any Chromium as of June 2026; `linear()` is the standards-track answer ([css-easing-2](https://drafts.csswg.org/css-easing/), [Chrome dev docs](https://developer.chrome.com/docs/css-ui/css-linear-easing-function), [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/linear), [Josh Comeau — springs in native CSS](https://www.joshwcomeau.com/animation/linear-timing-function/)).

### D1. Stacked-panel depth — data sits BEHIND a lens (Luce binnacle)
Every KPI gauge is a three-layer sandwich: **backlight deck** (the lower OLED) → **data layer** → **lens** (the convex Corning glass). Depth is read, not drawn.
```css
.gauge { position: relative; background: #141417; border-radius: 16px; overflow: hidden; }
.gauge__backlight {            /* lower deck: the light source under the data */
  position: absolute; inset: 12%;
  background: radial-gradient(60% 50% at 50% 65%, rgba(232,163,61,0.16), transparent 70%);
  filter: blur(24px); pointer-events: none;   /* blur is static geometry; only its opacity animates */
}
.gauge__lens {                 /* convex glass: one specular wipe + smoked vignette */
  position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background:
    radial-gradient(120% 90% at 50% -20%, rgba(255,255,255,0.055), transparent 55%),
    radial-gradient(140% 140% at 50% 50%, transparent 55%, rgba(0,0,0,0.38) 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06),
              inset 0 -10px 24px -12px rgba(0,0,0,0.55),
              inset 0 0 0 1px rgba(0,0,0,0.6);
}
```
React: a `<Gauge>` component with `backlight / children / lens` slots so every instrument inherits the sandwich. Backlight hue follows status: amber when live, `#FF453A` only when broken.

### D2. Seams, not outlines — panels separated like machined parts
The Luce reads as "hundreds of discrete products… a single clean volume": parts meet at **real gaps**, never drawn borders. Desktop translation: the canvas itself is the seam.
```css
:root { --luce-seam: rgba(0,0,0,0.65); --luce-lip: rgba(255,255,255,0.05); }
.panel { background: #141417; border-radius: 12px;
  box-shadow: 0 0 0 1px var(--luce-seam),   /* the shadow gap around the part */
              inset 0 1px 0 var(--luce-lip); /* light catches the machined top edge */
}
.cluster { background: #0B0B0D; display: grid; gap: 2px; } /* 2px of canvas IS the trim gap */
```
The only permitted light line is the 0.5–1px `--luce-lip` light-catch on a top edge. A visible `1px solid #333` border anywhere is a build failure.

### D3. Radii scale — subtle, concentric, never decorative
Radii create softness the way the Luce's lens curvature does — felt, not noticed. Scale: **chips 8 / panels 12 / gauges & cards 16 / hero & modal 20 / circular dials 50%**. Nested radii are **concentric**: `inner = outer − padding` (e.g. a 16px card with 12px padding holds 4px-radius wells), so corners stay parallel. Never mix radii arbitrarily on one screen; never use radius > 20 except full circles.

### D4. One virtual light source — depth from light, period
All elevation comes from one key light, high and slightly forward (≈ straight above). Three shadow stacks, always paired with their surface lightening (`#141417 → #1C1C21 → #26262C`) — never a border to fake lift:
```css
--shadow-1: 0 1px 2px rgba(0,0,0,0.5), 0 8px 24px -8px rgba(0,0,0,0.5);    /* resting card */
--shadow-2: 0 2px 4px rgba(0,0,0,0.55), 0 16px 40px -12px rgba(0,0,0,0.6); /* raised / hero */
--shadow-3: 0 4px 8px rgba(0,0,0,0.6), 0 24px 64px -16px rgba(0,0,0,0.7);  /* popover / modal */
```
Recessed wells (sparkline trays, inputs) invert the light: `inset 0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(0,0,0,0.6)` plus a 1px `--luce-lip` on the *bottom* inner edge — light falls into the well and catches the far lip. Box-shadows are never animated (composite cost); lift transitions animate `transform: translateY(-1px)` + a pre-rendered shadow layer's opacity.

### D5. Motion with mass — `linear()` spring approximation (verified, Chromium 148)
Two springs only. `--spring-settle` (damping ≈ 0.9, no visible overshoot) for everything functional; `--spring-needle` (one proud overshoot — the mass of a physical needle) **only** for gauge needles/values and the boot sweep.
```css
:root {
  --spring-needle: linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%,
    1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%,
    1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%,
    1.003 76.9%, 1.001 100%);
  --spring-settle: linear(0, 0.013, 0.318 6.6%, 0.751 13.6%, 0.918 18.1%, 1.016 23%,
    1.052 27.2%, 1.057 30.5%, 1.026 38.2%, 0.999 45.4%, 0.995 53%, 1 100%);
}
.gauge__needle { transition: transform 700ms var(--spring-needle); }
```
Durations: needle/value moves **700ms**, panel/layout moves **400ms**, control feedback **250ms**, press-down **80ms**. Retargeting mid-flight uses WAAPI so an interrupted needle re-aims like a real one (verified: `linear()` strings are valid WAAPI `easing` in Chromium 148):
```js
el.animate({ transform: [getCurrentRotation(el), `rotate(${to}deg)`] },
           { duration: 700, easing: SPRING_NEEDLE, fill: 'forwards' });
```
Banned: `ease-in-out` or `linear` keywords on any physically-moving element; any bounce on layout.

### D6. The ignition ceremony — illumination before motion (the E Ink key moment)
On app launch / board mount, once per session (≤ **1400ms** total, skippable by any input; reduced-motion gets a 300ms crossfade):
1. **0–150ms — key-set:** canvas holds `#0B0B0D`; all seams and backlight decks fade in together (opacity 0→1, ease-out). Light arrives first, exactly the Luce's dock moment.
2. **150–800ms — the flow:** the accent visibly *travels* — a single amber glow moves from the app's title/identity mark into the hero gauge (opacity ramp along the path, like yellow flowing from key fob to gear selector). Needles/values sweep 0 → actual with `--spring-needle`; panels stagger left→right 60ms apart.
3. **800–1200ms — wings:** secondary panels settle in (`translateX(±24px)→0`, opacity 0→1, `--spring-settle`, 400ms).
4. **1200–1400ms — ready:** the live-dot starts breathing (D7); if anything is broken, the one `--hot` glow ignites (D8). The board is now "ready to drive."
A ceremony repeated becomes a nuisance: never replay on navigation, only on session start.

### D7. Alive at idle — micro-motion at the threshold of perception
Between refreshes exactly **three** things move; total stillness elsewhere is what makes them read as alive, not busy:
```css
@keyframes breathe { 0%,100% { opacity:0.55; } 50% { opacity:1; } }
.live-dot { animation: breathe 4.8s ease-in-out infinite; }
@keyframes idle-tremor { 0%,100%{ transform:rotate(var(--angle)); }
  33%{ transform:rotate(calc(var(--angle) + 0.4deg)); } 66%{ transform:rotate(calc(var(--angle) - 0.3deg)); } }
.gauge__needle--live { animation: idle-tremor 7s steps(24) infinite; }
@keyframes deck-drift { 0%,100%{ opacity:0.9; transform:scale(1); } 50%{ opacity:1; transform:scale(1.015); } }
.gauge__backlight { animation: deck-drift 9s ease-in-out infinite; }
```
Periods are mutually prime (4.8 / 7 / 9s) so the composition never visibly loops. Pause all three via `animation-play-state: paused` on `visibilitychange` — a parked car doesn't idle its tach. `isolation: isolate` on each layer; no blanket `will-change`.

### D8. Backlit glow — emission, not decoration; two intensities only
Glow means "this is powered," like the Luce's backlit needles and glowing selector. Two levels, never more:
```css
.lit      { color: #E8A33D; filter: drop-shadow(0 0 6px rgba(232,163,61,0.35)); }   /* live/active */
.lit--hot { filter: drop-shadow(0 0 6px rgba(232,163,61,0.35))
                    drop-shadow(0 0 16px rgba(232,163,61,0.18)); }                    /* THE one current issue */
.legend   { color: rgba(235,235,245,0.6); text-shadow: 0 0 8px rgba(232,163,61,0.12); } /* faint phosphor */
```
At most **one** `--hot` element per screen. Broken state swaps hue to `#FF453A` at the *same* intensities — red gets no extra bloom; it is sacred, not loud. Inert elements get zero glow, ever.

### D9. Honest materials — no skeuomorphism, one metal, used like jewelry
No fake carbon weave, no leather, no stitching, no chrome themes. Surfaces are color + light only. The single permitted "material" is an anodised-aluminium ring — a conic gradient — and it appears in exactly one place: the bezel of circular dials and the primary action:
```css
.dial { border-radius: 50%; border: 2px solid transparent; background:
    linear-gradient(#1C1C21,#1C1C21) padding-box,
    conic-gradient(from 200deg, #3A3A40, #6B6B72 12%, #2A2A2F 40%, #55555C 70%, #3A3A40) border-box; }
.dial::after { content:''; position:absolute; inset:2px; border-radius:50%; pointer-events:none;
  background: radial-gradient(75% 55% at 50% 18%, rgba(255,255,255,0.07), transparent 60%);
  box-shadow: inset 0 -8px 16px -8px rgba(0,0,0,0.6); }   /* the convex lens */
```
If a texture is ever wanted on the window chrome, the ceiling is `repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0 2px, transparent 2px 4px)` — below conscious notice, like machining grain. Anything visible as "texture" fails.

### D10. Switchgear with travel — the rifle-bolt click
Controls answer in two phases: instant mechanical descent (80ms), sprung release (250ms, `--spring-settle`). The press goes *into* the panel:
```css
.btn { transition: transform 250ms var(--spring-settle), box-shadow 80ms ease-out;
       box-shadow: var(--shadow-1), inset 0 1px 0 var(--luce-lip); }
.btn:active { transform: translateY(1px) scale(0.985); transition-duration: 80ms;
       box-shadow: 0 0 0 1px var(--luce-seam), inset 0 2px 4px rgba(0,0,0,0.5); }
.btn:focus-visible { outline: none; box-shadow: var(--shadow-1), 0 0 0 2px #E8A33D; }
```
The primary action ("Refresh all" / "Run health scan") is the gear-selector: circular, D9 bezel, amber legend, the **only** control with a resting glow (`.lit` level). On invoke: press → the board answers with one backlight-deck surge (deck opacity 0.9→1→0.9 over 400ms) — the machine acknowledging the hand.

### D11. One hero, everything else subordinate — reduction as hierarchy
The board's single most important number (overall data health) is the only 100%-white, largest element — the one instrument the eye returns to, as the Luce's binnacle centers one gauge. Hero numerals: tabular mono (`'SF Mono','Roboto Mono',ui-monospace`), 56–64px / Medium, tracking −0.5, animated only by D5 ticker (digits roll and settle; never reflow, never resize). Gauge legends: 11px / Semibold / ALL-CAPS / tracking +1.2px / `text/tertiary` — engraved legends, not UI captions. Secondary panels are visually subordinate wings that slide *behind/under* the hero on drill-down (`--shadow-2` keeps the hero physically above). Never six equal tiles. For every element on the screen, the team must be able to state the job it does; if no job, it goes.

### D12. Color as punctuation — the discipline that holds it all
- Amber `#E8A33D` is the instrument backlight: it may glow (D8), tip a needle, mark the live state, light the primary control. It **never fills a surface**, never tints a panel, never appears as decorative gradient.
- Red `#FF453A` is the redline: failed refresh, broken dataset, destructive confirm — nothing else. Red never breathes, never decorates, and never appears twice when once will do.
- Status is never hue-only (carries over from IOS-CRAFT-SPEC §1.4): hue + shape + position. Healthy = ring fully lit; warning = amber wedge always at the same clock position; broken = octagon glyph at the hub + needle parked at zero. The board must read correctly in grayscale.
- Everything else on screen is the graphite ladder and the white text tiers. Two "metals" max in view (the D9 bezel + nothing else), matching the Luce's gray/dark-gray/rose-gold restraint.

---

## Part 3 — Pierre's standards (pass/fail, judged brutally)

Eight criteria an Ive-school critic will hold the build against. Each is binary.

1. **No element exists without a reason.** Point at any pixel; the team names its job in one sentence. Decorative-only elements, "balance" filler, and empty-state ornaments are automatic fails. The delete test: if removing it changes nothing the user needs, it should already be gone.
2. **Depth never via decoration.** All perceived depth comes from light: surface lightness steps, the single key-light shadow stacks, inset wells, the lens highlight. One visible solid border used to suggest elevation anywhere = fail. Screenshot in grayscale: the layering must still read.
3. **Motion has mass and settles.** Every moving element follows one of the two springs, settles dead within its duration, and is interruptible mid-flight (retarget, never snap). Any `linear`/`ease-in-out` on a physical move, any animation that ends with a visible pop or repeats a ceremony, fails.
4. **One accent, used like punctuation.** Count the amber on any screen: a live-dot, a needle tip, one legend, possibly one `--hot` glow. If amber appears as a fill, a background tint, or in more than a handful of places at once, fail. Red present anywhere except an actual failure state: instant fail.
5. **Calm by default; attention is earned.** At idle, exactly three things move, all at the threshold of perception, all paused when the window hides. Nothing blinks, nothing pulses for attention it hasn't earned, no skeleton shimmer louder than 8%. The screen must be boring until the moment it must not be.
6. **Materials are honest.** No texture pretending to be a material (carbon, leather, brushed-metal photos). The one conic-gradient bezel is the only metal, in the only two places allowed. If a reviewer can name a faked material, fail.
7. **Care in unseen details.** Hairlines land on physical pixels at 100%/125%/150% DPI; tabular digits never reflow; `:focus-visible` is designed, not default; reduced-motion users get a considered equivalent (crossfade ceremony, no tremor) rather than an absence. The back of the cabinet is finished.
8. **It feels inevitable.** The final test is the absence of "design": nothing looks styled, themed, or referenced — no one should ever say "nice Ferrari theme." If the first thing a viewer notices is a flourish instead of the health of their data, the build fails. When it passes, the board feels like it could not have been otherwise.

---

## Sources

**LoveFrom × Ferrari / Luce (verified June 2026):**
[Exor press release (2021)](https://www.exor.com/press-releases/2021-09-27/exor-ferrari-and-lovefrom-announce-creative-partnership) · [Ferrari corporate — partnership](https://www.ferrari.com/en-EN/corporate/articles/exor-ferrari-and-lovefrom-announce-creative-partnership) · [Wallpaper*](https://www.wallpaper.com/design/jony-ive-marc-newson-lovefrom-partnership-with-ferrari) · [LoveFrom](https://lovefrom.style/) · [Ferrari Luce model page](https://www.ferrari.com/en-EN/auto/ferrari-luce) · [Ferrari — Interface & Interiors](https://www.ferrari.com/en-EN/auto/ferrari-luce-design) · [Ferrari corporate — interior, interface & name reveal](https://www.ferrari.com/en-EN/corporate/articles/ferrari-luce-revealing-interior-interface-design-and-the-name) · [Dezeen — interior (Feb 2026)](https://www.dezeen.com/2026/02/13/jony-ive-marc-newson-lovefrom-ferrari-luce-interior/) · [Dezeen — launch (May 2026)](https://www.dezeen.com/2026/05/25/electric-ferrari-luce-jony-ive-marc-newson-lovefrom/) · [Engadget — inside the Ive interior](https://www.engadget.com/transportation/evs/inside-ferraris-luce-ev-the-jony-ive-interior-is-here-130000211.html) · [Electrek](https://electrek.co/2026/02/09/ferrari-reveals-name-first-electric-car-luce-shows-off-jony-ive-designed-interior/) · [CNN](https://www.cnn.com/2026/05/26/cars/ferrari-new-electric-vehicle-luce-intl-hnk) · [CNBC](https://www.cnbc.com/2026/05/28/ferrari-ceo-luce-price-electric-car.html) · [MacRumors](https://www.macrumors.com/2026/05/25/ferrari-luce-jony-ive-photos/) · [GSMArena — stacked OLED/HIAA](https://www.gsmarena.com/the_ferrari_luce_will_have_samsung_oled_displays_with_holes_and_stacked_design-news-73001.php) · [Android Authority](https://www.androidauthority.com/ferrari-luce-samsung-oled-galaxy-phone-tech-3670831/) · [Carscoops — glass key & tactile controls](https://www.carscoops.com/2026/02/ferrari-luce-ev-interior-tactile-controls/) · [T3 — E Ink key](https://www.t3.com/auto/electric-vehicles/the-ferrari-luce-and-its-wild-interior-tech-just-rewrote-the-ev-rule-book) · [Robb Report](https://robbreport.com/motors/cars/ferrari-all-electric-luce-cabin-details-revealed-1237560385/) · [Autoblog](https://www.autoblog.com/news/ferrari-reveals-luce-ev-interior-name) · [Autonocion — Ive "lazy" touchscreens](https://www.autonocion.com/us/ferrari-luce-touchscreens-tesla/) · [Schweitzer Designs — anti-screen analysis](https://www.schweitzerdesigns.com/post/ferrari-luce-anti-screen-ev-interior-design)

**Ive philosophy:** [Telegraph — "Simplicity isn't simple" (2012)](https://www.telegraph.co.uk/technology/apple/9283486/Jonathan-Ive-interview-simplicity-isnt-simple.html) · Objectified (Gary Hustwit, 2009) · Vanity Fair New Establishment interview (2014) · Apple iOS 7 design introduction (deference/clarity/depth, 2013)

**Tech verification:** [Electron 42 release notes (Chromium 148)](https://www.electronjs.org/blog/electron-42-0) · this repo's `package.json` / `node_modules/electron/dist/version` = Electron 42.3.3 · [Chrome — `linear()` easing](https://developer.chrome.com/docs/css-ui/css-linear-easing-function) · [MDN — `linear()`](https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function/linear) · [Josh Comeau — springs in native CSS](https://www.joshwcomeau.com/animation/linear-timing-function/) · [CSSWG css-easing-2](https://drafts.csswg.org/css-easing/)
