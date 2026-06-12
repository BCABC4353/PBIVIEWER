import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');

const isPrimitive = process.argv.includes('--primitive');
const PREFIX = isPrimitive ? 'primitive' : 'baseline';

const loadFrames = (s) => {
  const p = path.join(OUT, `${s}.frames.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};

const results = [];
let anyFail = false;

function assert(id, scenario, pass, detail) {
  if (!pass) anyFail = true;
  results.push({ id, scenario, status: pass ? 'PASS' : 'FAIL', detail });
}

const MIN_MORPH_SPAN = 20;

function selfCheck(frames, expectMorph) {
  if (!frames || frames.length < 2) return { pass: false, detail: 'no frames' };
  const rects = frames.map((f) => f.rect).filter(Boolean);
  if (rects.length === 0) {
    return { pass: false, detail: `All ${frames.length} frames: rect=null — DOM node absent throughout. EXPECTED VT BASELINE FAILURE.` };
  }
  if (rects.length < 2) return { pass: true, detail: '1 rect frame — borderline, accepted' };
  const allSame = rects.every((r) =>
    Math.abs(r.x - rects[0].x) < 0.5 && Math.abs(r.y - rects[0].y) < 0.5 &&
    Math.abs(r.width - rects[0].width) < 0.5 && Math.abs(r.height - rects[0].height) < 0.5,
  );
  if (allSame) {
    if (!expectMorph) return { pass: true, detail: `${rects.length}/${frames.length} rects all identical — static/instant is correct for this scenario` };
    return { pass: false, detail: `${rects.length}/${frames.length} rects all identical {w:${rects[0].width.toFixed(0)},h:${rects[0].height.toFixed(0)}} — static capture, no measurable motion.` };
  }
  if (expectMorph) {
    const span = Math.max(
      Math.max(...rects.map((r) => r.x)) - Math.min(...rects.map((r) => r.x)),
      Math.max(...rects.map((r) => r.y)) - Math.min(...rects.map((r) => r.y)),
      Math.max(...rects.map((r) => r.width)) - Math.min(...rects.map((r) => r.width)),
      Math.max(...rects.map((r) => r.height)) - Math.min(...rects.map((r) => r.height)),
    );
    if (span < MIN_MORPH_SPAN) {
      return { pass: false, detail: `${rects.length}/${frames.length} rects present but max span=${span.toFixed(1)}px < ${MIN_MORPH_SPAN}px — near-static, dead-band creep detected.` };
    }
  }
  return { pass: true, detail: `${frames.length} frames, rects vary (span >= ${MIN_MORPH_SPAN}px) — capture is real` };
}

function monotonicCheck(rects, axis, direction, expectMotion) {
  const OVERSHOOT_TOL = 0.08;
  const vals = rects.map((r) => (axis === 'x' ? r.x : axis === 'y' ? r.y : axis === 'w' ? r.width : r.height));
  if (vals.length < 2) return { pass: true, detail: 'insufficient data' };
  const first = vals[0];
  const last = vals[vals.length - 1];
  const totalDelta = last - first;
  if (Math.abs(totalDelta) < 2) {
    if (expectMotion) return { pass: false, detail: `axis=${axis} totalDelta=${totalDelta.toFixed(2)}px — motion expected but absent (< 2px)` };
    return { pass: true, detail: `axis=${axis} delta < 2px, static (no motion expected)` };
  }
  const sign = direction === 'grow' ? 1 : -1;
  if (totalDelta * sign <= 0) return { pass: false, detail: `axis=${axis} first=${first.toFixed(1)} last=${last.toFixed(1)} expected direction=${direction}` };
  let violations = 0;
  for (let i = 1; i < vals.length; i++) {
    if ((vals[i] - vals[i - 1]) * sign < -(Math.abs(totalDelta) * OVERSHOOT_TOL)) violations++;
  }
  const pass = violations <= 2;
  return { pass, detail: `axis=${axis} first=${first.toFixed(1)} last=${last.toFixed(1)} direction=${direction} overshoot_violations=${violations}` };
}

function checkA1(openFrames, closeFrames) {
  const openRects = openFrames.map((f) => f.rect).filter(Boolean);
  const closeRects = closeFrames.map((f) => f.rect).filter(Boolean);
  if (openRects.length < 4) {
    assert('A-1', `${PREFIX}-open`, false, `Only ${openRects.length} frames with rect — VT does not expose DOM node during transition`);
    assert('A-1', `${PREFIX}-close`, false, `Only ${closeRects.length} frames with rect during close — expected for baseline VT`);
    return;
  }
  for (const [lbl, ax, dir] of [[`${PREFIX}-open-width`, 'w', 'grow'], [`${PREFIX}-open-height`, 'h', 'grow']]) {
    const c = monotonicCheck(openRects, ax, dir, true);
    assert('A-1', lbl, c.pass, c.detail);
  }
  if (closeRects.length >= 4) {
    for (const [lbl, ax, dir] of [[`${PREFIX}-close-width`, 'w', 'shrink'], [`${PREFIX}-close-height`, 'h', 'shrink']]) {
      const c = monotonicCheck(closeRects, ax, dir, true);
      assert('A-1', lbl, c.pass, c.detail);
    }
    const closingRects = closeFrames.filter((f) => f.phase === 'closing' && f.rect).map((f) => f.rect);
    const compareRect = closingRects.length > 0 ? closingRects[closingRects.length - 1] : closeRects[closeRects.length - 1];
    const firstOpen = openRects[0];
    const ORIGIN_TOL = 12;
    const ok = Math.abs(compareRect.x - firstOpen.x) <= ORIGIN_TOL && Math.abs(compareRect.y - firstOpen.y) <= ORIGIN_TOL;
    assert('A-1', `${PREFIX}-close-returns-origin`, ok,
      `lastClosingRect={x:${compareRect.x.toFixed(1)},y:${compareRect.y.toFixed(1)}} vs firstOpen={x:${firstOpen.x.toFixed(1)},y:${firstOpen.y.toFixed(1)}} tol=${ORIGIN_TOL}px`);
  } else {
    assert('A-1', `${PREFIX}-close-width`, false, `Only ${closeRects.length} rects in close — cannot verify monotonic`);
    assert('A-1', `${PREFIX}-close-returns-origin`, false, 'Insufficient close rects');
  }
}

function checkA2(frames, scenario) {
  const animatingFrames = frames.filter((f) => f.phase === 'opening' || f.phase === 'closing');
  const absent = frames.filter((f) => !f.present && (f.phase === 'opening' || f.phase === 'closing'));
  if (absent.length > 0) {
    const pct = ((frames.filter((f) => f.present).length / frames.length) * 100).toFixed(0);
    assert('A-2', scenario, false,
      `${absent.length}/${frames.length} frames have present:false during animation (${pct}% present). First absent at frame ${absent[0]?.frame ?? '?'}. EXPECTED for VT baseline.`);
    return;
  }
  const postIdleAbsent = frames.filter((f) => !f.present && f.phase === 'idle');
  const rects = animatingFrames.length > 0
    ? animatingFrames.map((f) => f.rect).filter(Boolean)
    : frames.map((f) => f.rect).filter(Boolean);
  if (rects.length < 2) { assert('A-2', scenario, true, `No animating rect data (${postIdleAbsent.length} idle-phase absent frames — panel cleanly unmounted after close)`); return; }
  const totalDelta = Math.max(Math.abs(rects[rects.length - 1].x - rects[0].x), Math.abs(rects[rects.length - 1].y - rects[0].y), 1);
  let maxJump = 0;
  for (let i = 1; i < rects.length; i++) {
    maxJump = Math.max(maxJump, Math.abs(rects[i].x - rects[i - 1].x), Math.abs(rects[i].y - rects[i - 1].y));
  }
  const jumpPct = maxJump / totalDelta;
  const detail = `maxJump=${maxJump.toFixed(1)}px totalDelta=${totalDelta.toFixed(1)}px jumpPct=${(jumpPct * 100).toFixed(0)}%${postIdleAbsent.length > 0 ? ` (${postIdleAbsent.length} post-close idle frames null — clean unmount)` : ''}`;
  assert('A-2', scenario, jumpPct <= 0.4, detail);
}

function checkA3(interruptFrames) {
  const rects = interruptFrames.map((f) => f.rect).filter(Boolean);
  if (rects.length < 4) {
    assert('A-3', `${PREFIX}-open-then-reverse-at-40`, false, `Only ${rects.length} frames with rect. Expected for VT baseline — snap not smooth reverse.`);
    return;
  }
  const mid = Math.floor(rects.length / 2);
  const fW = rects[mid - 1]?.width ?? 0;
  const fH = rects[mid - 1]?.height ?? 0;
  const lW = rects[rects.length - 1]?.width ?? 0;
  const lH = rects[rects.length - 1]?.height ?? 0;
  const pass = lW < fW && lH < fH;
  assert('A-3', `${PREFIX}-open-then-reverse-at-40`, pass,
    `At midpoint: w=${fW.toFixed(1)} h=${fH.toFixed(1)}; final: w=${lW.toFixed(1)} h=${lH.toFixed(1)}; wReversed=${lW < fW} hReversed=${lH < fH}`);
}

function checkA4(interruptFrames) {
  const rects = interruptFrames.map((f) => f.rect).filter(Boolean);
  if (rects.length < 4) {
    assert('A-4', `${PREFIX}-open-then-reverse-at-40`, false, `Only ${rects.length} frames with rect. Expected for VT baseline.`);
    return;
  }
  let phaseIdx = -1;
  for (let i = 1; i < interruptFrames.length; i++) {
    if (interruptFrames[i - 1].phase === 'opening' && (interruptFrames[i].phase === 'closing' || interruptFrames[i].phase === 'idle')) {
      phaseIdx = i; break;
    }
  }
  if (phaseIdx >= 0) {
    const pre = interruptFrames[phaseIdx - 1]?.rect;
    const post = interruptFrames[phaseIdx]?.rect;
    const pre2 = phaseIdx >= 2 ? interruptFrames[phaseIdx - 2]?.rect : null;
    if (!pre || !post) { assert('A-4', `${PREFIX}-open-then-reverse-at-40`, false, 'Rects missing around phase-transition frame'); return; }
    const stepAtTransition = Math.hypot(post.x - pre.x, post.y - pre.y);
    const stepBefore = pre2 ? Math.hypot(pre.x - pre2.x, pre.y - pre2.y) : stepAtTransition;
    const SNAP_RATIO = 3.0;
    const isSnap = stepAtTransition > stepBefore * SNAP_RATIO && stepAtTransition > 20;
    const dx = Math.abs(post.x - pre.x);
    const dy = Math.abs(post.y - pre.y);
    assert('A-4', `${PREFIX}-open-then-reverse-at-40`, !isSnap,
      `Phase-check at frame ${phaseIdx}: pre={x:${pre.x.toFixed(1)},y:${pre.y.toFixed(1)}} post={x:${post.x.toFixed(1)},y:${post.y.toFixed(1)}} dx=${dx.toFixed(1)} dy=${dy.toFixed(1)} stepAtTransition=${stepAtTransition.toFixed(1)} stepBefore=${stepBefore.toFixed(1)} snapRatio=${(stepAtTransition/Math.max(stepBefore,0.1)).toFixed(1)} isSnap=${isSnap}`);
    return;
  }
  let hasLargeJump = false;
  let jumpDetail = '';
  for (let i = 2; i < rects.length; i++) {
    const step = Math.hypot(rects[i].x - rects[i-1].x, rects[i].y - rects[i-1].y);
    const prevStep = Math.hypot(rects[i-1].x - rects[i-2].x, rects[i-1].y - rects[i-2].y);
    if (step > prevStep * 3.0 && step > 20) {
      hasLargeJump = true;
      jumpDetail = `step=${step.toFixed(1)} vs prev=${prevStep.toFixed(1)} at pair ${i-1}->${i}`;
      break;
    }
  }
  if (hasLargeJump) {
    assert('A-4', `${PREFIX}-open-then-reverse-at-40`, false, `Numeric backstop: snap detected — ${jumpDetail} (no phase labels)`);
    return;
  }
  assert('A-4', `${PREFIX}-open-then-reverse-at-40`, false, 'No phase transition found — cannot verify momentum.');
}

function checkA5(frames, scenario) {
  const animatingFrames = frames.filter((f) => f.phase === 'opening' || f.phase === 'closing');
  if (animatingFrames.length === 0) {
    assert('A-5', scenario, true, `No animating frames (instant/reduced-motion) — pointer-events check N/A; morph node has pointerEvents:none during any spring animation`);
    return;
  }
  const blocked = animatingFrames.filter((f) => f.pointerBlockedAtCenter);
  assert('A-5', scenario, blocked.length === 0,
    blocked.length === 0
      ? `All ${animatingFrames.length} animating frames: pointerBlockedAtCenter=false`
      : `${blocked.length}/${animatingFrames.length} animating frames had pointerBlockedAtCenter=true (frames: ${blocked.slice(0, 5).map((f) => f.frame).join(',')})`);
}

function selfCheckAssert(frames, scenario, expectMorph) {
  if (!frames) { assert('SELF-CHECK', scenario, false, 'No frames.json found'); return; }
  const r = selfCheck(frames, expectMorph);
  assert('SELF-CHECK', scenario, r.pass, r.detail);
}

const openFrames = loadFrames(`${PREFIX}-open`);
const closeFrames = loadFrames(`${PREFIX}-close`);
const interruptFrames = loadFrames(`${PREFIX}-open-then-reverse-at-40`);
const reducedFrames = loadFrames(`${PREFIX}-reduced-motion`);

selfCheckAssert(openFrames, `${PREFIX}-open`, true);
selfCheckAssert(closeFrames, `${PREFIX}-close`, true);
selfCheckAssert(interruptFrames, `${PREFIX}-open-then-reverse-at-40`, true);
selfCheckAssert(reducedFrames, `${PREFIX}-reduced-motion`, false);

if (openFrames && closeFrames) {
  checkA1(openFrames, closeFrames);
} else {
  assert('A-1', `${PREFIX}-open`, false, 'Missing frames.json');
  assert('A-1', `${PREFIX}-close`, false, 'Missing frames.json');
}

if (openFrames) checkA2(openFrames, `${PREFIX}-open`);
if (closeFrames) checkA2(closeFrames, `${PREFIX}-close`);
if (reducedFrames) checkA2(reducedFrames, `${PREFIX}-reduced-motion`);

if (interruptFrames) {
  checkA3(interruptFrames);
  checkA4(interruptFrames);
} else {
  assert('A-3', `${PREFIX}-open-then-reverse-at-40`, false, 'Missing frames.json');
  assert('A-4', `${PREFIX}-open-then-reverse-at-40`, false, 'Missing frames.json');
}

if (openFrames) checkA5(openFrames, `${PREFIX}-open`);
if (reducedFrames) checkA5(reducedFrames, `${PREFIX}-reduced-motion`);

const colW = [12, 50, 8, 60];
const pad = (s, n) => String(s).padEnd(n);
const line = '-'.repeat(colW.reduce((a, b) => a + b + 3, -3));

process.stdout.write('\n');
process.stdout.write(`Verifying: ${PREFIX}-* scenarios\n`);
process.stdout.write(line + '\n');
process.stdout.write(pad('ID', colW[0]) + ' | ' + pad('Scenario', colW[1]) + ' | ' + pad('Status', colW[2]) + ' | Detail\n');
process.stdout.write(line + '\n');
for (const r of results) {
  process.stdout.write(pad(r.id, colW[0]) + ' | ' + pad(r.scenario, colW[1]) + ' | ' + pad(r.status, colW[2]) + ' | ' + r.detail + '\n');
}
process.stdout.write(line + '\n');

const passCount = results.filter((r) => r.status === 'PASS').length;
const failCount = results.filter((r) => r.status === 'FAIL').length;
process.stdout.write(`\n${passCount} PASS  ${failCount} FAIL\n`);
if (anyFail) { process.stdout.write('\nOVERALL: FAIL\n'); process.exit(1); }
else { process.stdout.write('\nOVERALL: PASS\n'); process.exit(0); }
