import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');

function loadFrames(scenario) {
  const p = path.join(OUT, `${scenario}.frames.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

const results = [];
let anyFail = false;

function assert(id, scenario, pass, detail) {
  const status = pass ? 'PASS' : 'FAIL';
  if (!pass) anyFail = true;
  results.push({ id, scenario, status, detail });
}

function selfCheck(frames) {
  if (!frames || frames.length < 2) return { pass: false, detail: 'no frames' };
  const rects = frames.map((f) => f.rect).filter(Boolean);
  if (rects.length === 0) {
    return {
      pass: false,
      detail: `All ${frames.length} frames: rect=null — DOM node absent throughout. VT explanation: sheet is removed before close VT starts; tile is absent during open VT. EXPECTED VT BASELINE FAILURE — Sprint 2 FLIP will keep element in DOM.`,
    };
  }
  if (rects.length < 2) {
    return { pass: true, detail: `1 rect frame — borderline, accepted` };
  }
  const allSame = rects.every((r) =>
    Math.abs(r.x - rects[0].x) < 0.5 &&
    Math.abs(r.y - rects[0].y) < 0.5 &&
    Math.abs(r.width - rects[0].width) < 0.5 &&
    Math.abs(r.height - rects[0].height) < 0.5,
  );
  if (allSame) {
    return {
      pass: false,
      detail: `${rects.length}/${frames.length} rects all identical {w:${rects[0].width.toFixed(0)},h:${rects[0].height.toFixed(0)}} — VT mounts sheet at final size before pseudo-element animation; only the CSS pseudo-elements move (not JS-measurable). EXPECTED VT BASELINE FAILURE — Sprint 2 FLIP will expose continuously-varying rect.`,
    };
  }
  return { pass: true, detail: `${frames.length} frames, rects vary (not all-identical) — capture is real` };
}

function monotonicCheck(rects, axis, direction) {
  const OVERSHOOT_TOL = 0.08;
  const vals = rects.map((r) => (axis === 'x' ? r.x : axis === 'y' ? r.y : axis === 'w' ? r.width : r.height));
  if (vals.length < 2) return { pass: true, detail: 'insufficient data' };
  const first = vals[0];
  const last = vals[vals.length - 1];
  const totalDelta = last - first;
  if (Math.abs(totalDelta) < 2) return { pass: true, detail: 'delta < 2px, skip' };
  const sign = direction === 'grow' ? 1 : -1;
  const expected = totalDelta * sign > 0;
  if (!expected) return { pass: false, detail: `axis=${axis} first=${first.toFixed(1)} last=${last.toFixed(1)} expected direction=${direction}` };
  let violations = 0;
  for (let i = 1; i < vals.length; i++) {
    const step = (vals[i] - vals[i - 1]) * sign;
    const maxAllowedReverse = Math.abs(totalDelta) * OVERSHOOT_TOL;
    if (step < -maxAllowedReverse) violations++;
  }
  const pass = violations <= 2;
  return { pass, detail: `axis=${axis} first=${first.toFixed(1)} last=${last.toFixed(1)} direction=${direction} overshoot_violations=${violations}` };
}

function checkA1(openFrames, closeFrames) {
  const openRects = openFrames.map((f) => f.rect).filter(Boolean);
  const closeRects = closeFrames.map((f) => f.rect).filter(Boolean);

  if (openRects.length < 4) {
    assert('A-1', 'open', false, `Only ${openRects.length} frames with rect — View-Transition does not expose DOM node during transition (expected for baseline)`);
    assert('A-1', 'close', false, `Only ${closeRects.length} frames with rect during close — expected for baseline VT`);
    return;
  }

  const wCheck = monotonicCheck(openRects, 'w', 'grow');
  const hCheck = monotonicCheck(openRects, 'h', 'grow');
  assert('A-1', 'open-width', wCheck.pass, wCheck.detail);
  assert('A-1', 'open-height', hCheck.pass, hCheck.detail);

  if (closeRects.length >= 4) {
    const cwCheck = monotonicCheck(closeRects, 'w', 'shrink');
    const chCheck = monotonicCheck(closeRects, 'h', 'shrink');
    assert('A-1', 'close-width', cwCheck.pass, cwCheck.detail);
    assert('A-1', 'close-height', chCheck.pass, chCheck.detail);

    const lastClose = closeRects[closeRects.length - 1];
    const firstOpen = openRects[0];
    const originMatch = Math.abs(lastClose.x - firstOpen.x) <= 1 && Math.abs(lastClose.y - firstOpen.y) <= 1;
    assert('A-1', 'close-returns-origin', originMatch,
      `lastClose={x:${lastClose.x.toFixed(1)},y:${lastClose.y.toFixed(1)}} vs firstOpen={x:${firstOpen.x.toFixed(1)},y:${firstOpen.y.toFixed(1)}}`);
  } else {
    assert('A-1', 'close-width', false, `Only ${closeRects.length} rects in close — cannot verify monotonic`);
    assert('A-1', 'close-returns-origin', false, `Insufficient close rects`);
  }
}

function checkA2(frames, scenario) {
  const presentFrames = frames.filter((f) => f.present);
  const absentFrames = frames.filter((f) => !f.present);

  const presentPct = ((presentFrames.length / frames.length) * 100).toFixed(0);
  const allPresent = absentFrames.length === 0;

  if (!allPresent) {
    assert('A-2', scenario, false,
      `${absentFrames.length}/${frames.length} frames have present:false (${presentPct}% present). ` +
      `First absent at frame ${absentFrames[0]?.frame ?? '?'}. ` +
      `This is EXPECTED for VT baseline — pseudo-elements are not DOM nodes.`);
    return;
  }

  const rects = frames.map((f) => f.rect).filter(Boolean);
  if (rects.length < 2) {
    assert('A-2', scenario, false, 'No rect data to check jumps');
    return;
  }

  const xVals = rects.map((r) => r.x);
  const yVals = rects.map((r) => r.y);
  const totalDx = Math.abs(xVals[xVals.length - 1] - xVals[0]);
  const totalDy = Math.abs(yVals[yVals.length - 1] - yVals[0]);
  const totalDelta = Math.max(totalDx, totalDy, 1);

  let maxJump = 0;
  for (let i = 1; i < rects.length; i++) {
    const dx = Math.abs(rects[i].x - rects[i - 1].x);
    const dy = Math.abs(rects[i].y - rects[i - 1].y);
    maxJump = Math.max(maxJump, dx, dy);
  }

  const jumpPct = maxJump / totalDelta;
  const pass = jumpPct <= 0.4;
  assert('A-2', scenario, pass, `maxJump=${maxJump.toFixed(1)}px totalDelta=${totalDelta.toFixed(1)}px jumpPct=${(jumpPct * 100).toFixed(0)}%`);
}

function checkA3(interruptFrames) {
  const rects = interruptFrames.map((f) => f.rect).filter(Boolean);
  if (rects.length < 4) {
    assert('A-3', 'open-then-reverse-at-40', false,
      `Only ${rects.length} frames with rect. Cannot verify direction reversal. ` +
      `Expected for VT baseline — skipTransition() causes snap not smooth reverse.`);
    return;
  }

  const midIdx = Math.floor(rects.length / 2);
  const firstHalf = rects.slice(0, midIdx);
  const secondHalf = rects.slice(midIdx);

  const firstW = firstHalf[firstHalf.length - 1]?.width ?? 0;
  const firstH = firstHalf[firstHalf.length - 1]?.height ?? 0;
  const lastW = secondHalf[secondHalf.length - 1]?.width ?? 0;
  const lastH = secondHalf[secondHalf.length - 1]?.height ?? 0;

  const wReversed = lastW < firstW;
  const hReversed = lastH < firstH;
  const pass = wReversed && hReversed;
  assert('A-3', 'open-then-reverse-at-40', pass,
    `At interrupt midpoint: w=${firstW.toFixed(1)} h=${firstH.toFixed(1)}; final: w=${lastW.toFixed(1)} h=${lastH.toFixed(1)}; wReversed=${wReversed} hReversed=${hReversed}`);
}

function checkA4(interruptFrames) {
  const rects = interruptFrames.map((f) => f.rect).filter(Boolean);
  if (rects.length < 4) {
    assert('A-4', 'open-then-reverse-at-40', false,
      `Only ${rects.length} frames with rect. Cannot verify momentum continuity. ` +
      `Expected for VT baseline — skipTransition() causes position snap.`);
    return;
  }

  let interruptIdx = -1;
  for (let i = 1; i < interruptFrames.length; i++) {
    const prev = interruptFrames[i - 1];
    const curr = interruptFrames[i];
    if (prev.phase === 'opening' && (curr.phase === 'closing' || curr.phase === 'idle')) {
      interruptIdx = i;
      break;
    }
  }

  if (interruptIdx < 0) {
    assert('A-4', 'open-then-reverse-at-40', false,
      'No phase transition from opening->closing found in frames. Cannot verify momentum.');
    return;
  }

  const preRect = interruptFrames[interruptIdx - 1]?.rect;
  const postRect = interruptFrames[interruptIdx]?.rect;
  if (!preRect || !postRect) {
    assert('A-4', 'open-then-reverse-at-40', false, 'Rects missing around interrupt frame');
    return;
  }

  const dx = Math.abs(postRect.x - preRect.x);
  const dy = Math.abs(postRect.y - preRect.y);
  const snap = dx > 2 || dy > 2;
  assert('A-4', 'open-then-reverse-at-40', !snap,
    `At interrupt frame ${interruptIdx}: preRect={x:${preRect.x.toFixed(1)},y:${preRect.y.toFixed(1)}} ` +
    `postRect={x:${postRect.x.toFixed(1)},y:${postRect.y.toFixed(1)}} dx=${dx.toFixed(1)} dy=${dy.toFixed(1)} snap=${snap}`);
}

function checkA5(frames, scenario) {
  const blocked = frames.filter((f) => f.pointerBlockedAtCenter);
  const pass = blocked.length === 0;
  assert('A-5', scenario, pass,
    pass
      ? `All ${frames.length} frames: pointerBlockedAtCenter=false`
      : `${blocked.length}/${frames.length} frames had pointerBlockedAtCenter=true (frames: ${blocked.slice(0, 5).map((f) => f.frame).join(',')})`);
}

function selfCheckAssert(frames, scenario) {
  if (!frames) {
    assert('SELF-CHECK', scenario, false, 'No frames.json found');
    return;
  }
  const result = selfCheck(frames);
  assert('SELF-CHECK', scenario, result.pass, result.detail);
}

const openFrames = loadFrames('baseline-open');
const closeFrames = loadFrames('baseline-close');
const interruptFrames = loadFrames('baseline-open-then-reverse-at-40');
const reducedFrames = loadFrames('baseline-reduced-motion');

selfCheckAssert(openFrames, 'baseline-open');
selfCheckAssert(closeFrames, 'baseline-close');
selfCheckAssert(interruptFrames, 'baseline-open-then-reverse-at-40');
selfCheckAssert(reducedFrames, 'baseline-reduced-motion');

if (openFrames && closeFrames) {
  checkA1(openFrames, closeFrames);
} else {
  assert('A-1', 'open', false, 'Missing frames.json');
  assert('A-1', 'close', false, 'Missing frames.json');
}

if (openFrames) checkA2(openFrames, 'baseline-open');
if (closeFrames) checkA2(closeFrames, 'baseline-close');
if (reducedFrames) checkA2(reducedFrames, 'baseline-reduced-motion');

if (interruptFrames) {
  checkA3(interruptFrames);
  checkA4(interruptFrames);
} else {
  assert('A-3', 'open-then-reverse-at-40', false, 'Missing frames.json');
  assert('A-4', 'open-then-reverse-at-40', false, 'Missing frames.json');
}

if (openFrames) checkA5(openFrames, 'baseline-open');
if (reducedFrames) checkA5(reducedFrames, 'baseline-reduced-motion');

const colW = [12, 40, 8, 60];
const pad = (s, n) => String(s).padEnd(n);
const line = '-'.repeat(colW.reduce((a, b) => a + b + 3, -3));

process.stdout.write('\n');
process.stdout.write(line + '\n');
process.stdout.write(pad('ID', colW[0]) + ' | ' + pad('Scenario', colW[1]) + ' | ' + pad('Status', colW[2]) + ' | ' + pad('Detail', colW[3]) + '\n');
process.stdout.write(line + '\n');
for (const r of results) {
  process.stdout.write(pad(r.id, colW[0]) + ' | ' + pad(r.scenario, colW[1]) + ' | ' + pad(r.status, colW[2]) + ' | ' + r.detail + '\n');
}
process.stdout.write(line + '\n');

const passCount = results.filter((r) => r.status === 'PASS').length;
const failCount = results.filter((r) => r.status === 'FAIL').length;
process.stdout.write(`\n${passCount} PASS  ${failCount} FAIL\n`);

if (anyFail) {
  process.stdout.write('\nOVERALL: FAIL\n');
  process.exit(1);
} else {
  process.stdout.write('\nOVERALL: PASS\n');
  process.exit(0);
}
