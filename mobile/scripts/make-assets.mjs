/**
 * make-assets.mjs — generates the MEDIC Workflows app icon + splash PNGs
 * from a single SVG brand mark (the "Ignition Sweep"): a 270° warm-amber
 * arc with the gap facing down and a small amber dot at the arc's end,
 * on the near-black canvas color from docs/design/IOS-CRAFT-SPEC.md.
 *
 *   node scripts/make-assets.mjs        (run from mobile/)
 *
 * Outputs (all referenced by app.json):
 *   assets/icon.png                      1024x1024  iOS/app icon, #0B0B0D bg
 *   assets/android-icon-foreground.png   1024x1024  adaptive-icon fg, transparent,
 *                                                   mark inside the 66/108 safe zone
 *   assets/android-icon-monochrome.png   1024x1024  white mark, transparent
 *   assets/splash.png                    1284x2778  full splash, centered mark
 *   assets/splash-icon.png               1024x1024  centered-logo splash variant
 *                                                   (for the expo-splash-screen plugin)
 *   assets/favicon.png                     48x48    web favicon
 *
 * SVG sources are also written to assets/ (brand-mark.svg, icon.svg) so the
 * mark can be edited and re-rasterized later.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

// ── Design tokens (docs/design/IOS-CRAFT-SPEC.md) ──────────────────────────
const CANVAS = '#0B0B0D'; // bg/canvas — near-black graphite
const AMBER = '#E8A33D'; //  accent  — warm amber

/**
 * The Ignition Sweep mark on a `size`-square viewBox.
 *
 * Geometry (screen coords, y down): the 90° gap is centered at the bottom
 * (θ = 90°), so the arc runs clockwise from θ = 135° (bottom-left) through
 * left → top → right to θ = 45° (bottom-right) — a 270° sweep. A small
 * filled dot floats just past the arc's end inside the gap (θ = 78°), like
 * a gauge needle's terminal.
 *
 * @param {object} opts
 * @param {number} opts.size       canvas width/height in px
 * @param {number} opts.markScale  arc diameter as a fraction of the canvas
 * @param {string} opts.color      stroke/dot color
 * @param {string|null} opts.bg    background fill, or null for transparent
 */
function markSvg({ size, markScale, color, bg }) {
  const c = size / 2;
  const r = (size * markScale) / 2;
  const stroke = r * 0.3; // bold enough to survive small icon sizes
  const cos45 = Math.SQRT1_2;
  // start: θ=135° (bottom-left); end: θ=45° (bottom-right)
  const sx = c - r * cos45;
  const sy = c + r * cos45;
  const ex = c + r * cos45;
  const ey = c + r * cos45;
  // Dot detached into the gap, just past the arc's end (θ = 78°)
  const dotA = (78 * Math.PI) / 180;
  const dx = c + r * Math.cos(dotA);
  const dy = c + r * Math.sin(dotA);
  const dotR = stroke * 0.55;
  const rect = bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${rect}
  <path d="M ${f(sx)} ${f(sy)} A ${f(r)} ${f(r)} 0 1 1 ${f(ex)} ${f(ey)}"
        fill="none" stroke="${color}" stroke-width="${f(stroke)}" stroke-linecap="round"/>
  <circle cx="${f(dx)}" cy="${f(dy)}" r="${f(dotR)}" fill="${color}"/>
</svg>
`;
}

const f = (n) => Number(n.toFixed(2));

/** Rasterize an SVG string to a PNG file. */
async function png(svg, file, { width, height }) {
  const out = join(ASSETS, file);
  await sharp(Buffer.from(svg), { density: 144 })
    .resize(width, height)
    .png()
    .toFile(out);
  const meta = await sharp(out).metadata();
  console.log(`  ${file.padEnd(34)} ${meta.width}x${meta.height}`);
}

async function main() {
  await mkdir(ASSETS, { recursive: true });
  console.log('Generating MEDIC Workflows brand assets →', ASSETS);

  // ── SVG sources kept for future edits ─────────────────────────────────
  const iconSvg = markSvg({ size: 1024, markScale: 0.58, color: AMBER, bg: CANVAS });
  const bareSvg = markSvg({ size: 1024, markScale: 0.58, color: AMBER, bg: null });
  await writeFile(join(ASSETS, 'icon.svg'), iconSvg);
  await writeFile(join(ASSETS, 'brand-mark.svg'), bareSvg);
  console.log('  icon.svg / brand-mark.svg          (SVG sources)');

  // ── App icon (iOS + default): mark at 58% of a 1024 canvas ────────────
  await png(iconSvg, 'icon.png', { width: 1024, height: 1024 });

  // ── Android adaptive icon ──────────────────────────────────────────────
  // Safe zone is the central 66/108 (~61%) circle; launchers may crop/zoom
  // outside it. Keep the whole mark within ~52% of the canvas.
  const fgSvg = markSvg({ size: 1024, markScale: 0.46, color: AMBER, bg: null });
  await png(fgSvg, 'android-icon-foreground.png', { width: 1024, height: 1024 });
  const monoSvg = markSvg({ size: 1024, markScale: 0.46, color: '#FFFFFF', bg: null });
  await png(monoSvg, 'android-icon-monochrome.png', { width: 1024, height: 1024 });

  // ── Splash ─────────────────────────────────────────────────────────────
  // Full-bleed 1284x2778 (iPhone Pro Max portrait): near-black field with
  // the mark centered at ~38% of the screen width.
  const W = 1284;
  const H = 2778;
  const splashMark = markSvg({ size: W * 0.38, markScale: 1, color: AMBER, bg: null });
  const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${CANVAS}"/>
  <g transform="translate(${f((W - W * 0.38) / 2)} ${f((H - W * 0.38) / 2)})">${splashMark
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')}</g>
</svg>
`;
  await writeFile(join(ASSETS, 'splash.svg'), splashSvg);
  await png(splashSvg, 'splash.png', { width: W, height: H });

  // Centered-logo variant for the expo-splash-screen config plugin
  // (transparent mark; the plugin supplies backgroundColor #0B0B0D).
  await png(bareSvg, 'splash-icon.png', { width: 1024, height: 1024 });

  // ── Web favicon ────────────────────────────────────────────────────────
  await png(iconSvg, 'favicon.png', { width: 48, height: 48 });

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
