import { describe, expect, it } from 'vitest';
import { parseManifest, tilesOfRender, type RenderType } from './manifest-types';
import { buildTree, grandTotalFromLeaves, isExpanded, toggleExpanded } from './ledger-logic';
import { advance, canAdvance, canRewind, goTo, rewind } from './carousel-logic';
import { PAYOR_CATEGORY_LEDGER, DENIAL_CODE_LEDGER, DRIVER_LEDGER, DENIALS_BAR_DATA } from '../ui/denials-mock-data';
import DENIALS_MANIFEST_RAW from '../../design-lab/board11-data/denials-manifest.json';

const VALID_MANIFEST = [
  {
    id: 'v0',
    source: 'columnChart',
    render: 'bar (grouped)',
    layout: { x: 15, y: 14, w: 1254, h: 323 },
    group: ["'SALES'[ORDER WEEK]"],
    measure: ["SUM('SALES'[Revenue])"],
  },
  {
    id: 'v1',
    source: 'pivotTable',
    render: 'ledger',
    layout: { x: 15, y: 349, w: 350, h: 354 },
    group: ["'SALES'[REGION]", "'SALES'[CHANNEL]"],
    measure: ["SUM('SALES'[Revenue])"],
  },
];

describe('parseManifest', () => {
  it('parses a valid manifest array and returns all tiles typed', () => {
    const result = parseManifest(VALID_MANIFEST);
    expect(result.tiles).toHaveLength(2);
    expect(result.malformed).toBe(0);
    expect(result.unknownRenderIds).toHaveLength(0);
  });

  it('preserves render type for known renders', () => {
    const result = parseManifest(VALID_MANIFEST);
    expect(result.tiles[0]!.render).toBe('bar (grouped)');
    expect(result.tiles[1]!.render).toBe('ledger');
  });

  it('parses group and measure arrays correctly', () => {
    const result = parseManifest(VALID_MANIFEST);
    expect(result.tiles[1]!.group).toHaveLength(2);
    expect(result.tiles[1]!.measure).toHaveLength(1);
  });

  it('returns malformed count 1 for non-array input', () => {
    const result = parseManifest('not an array');
    expect(result.tiles).toHaveLength(0);
    expect(result.malformed).toBe(1);
  });

  it('increments malformed for null items in array', () => {
    const result = parseManifest([null, null]);
    expect(result.malformed).toBe(2);
  });

  it('increments malformed for items missing required fields', () => {
    const result = parseManifest([{ id: 'x', source: 'foo' }]);
    expect(result.malformed).toBe(1);
    expect(result.tiles).toHaveLength(0);
  });

  it('handles unknown render type tolerantly: falls back to text and records id', () => {
    const withUnknown = [
      ...VALID_MANIFEST,
      {
        id: 'vX',
        source: 'mysteryVisual',
        render: 'hologram',
        layout: { x: 0, y: 0, w: 100, h: 100 },
        group: [],
        measure: [],
      },
    ];
    const result = parseManifest(withUnknown);
    expect(result.unknownRenderIds).toContain('vX');
    const fallback = result.tiles.find((t) => t.id === 'vX');
    expect(fallback?.render).toBe('text');
    expect(result.malformed).toBe(0);
  });

  it('treats missing group/measure as empty arrays (tolerant)', () => {
    const lenient = [
      {
        id: 'v99',
        source: 'kpiVisual',
        render: 'kpi',
        layout: { x: 0, y: 0, w: 100, h: 100 },
      },
    ];
    const result = parseManifest(lenient);
    expect(result.tiles[0]!.group).toEqual([]);
    expect(result.tiles[0]!.measure).toEqual([]);
    expect(result.malformed).toBe(0);
  });
});

describe('tilesOfRender', () => {
  it('filters tiles by render type', () => {
    const result = parseManifest(VALID_MANIFEST);
    const bars = tilesOfRender(result, 'bar (grouped)');
    const ledgers = tilesOfRender(result, 'ledger');
    expect(bars).toHaveLength(1);
    expect(bars[0]!.id).toBe('v0');
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]!.id).toBe('v1');
  });

  it('returns empty array when no tiles match', () => {
    const result = parseManifest(VALID_MANIFEST);
    expect(tilesOfRender(result, 'donut')).toHaveLength(0);
  });
});

describe('ledger-logic wiring — payor category mock data', () => {
  it('builds a tree with correct root count from payor mock data', () => {
    const tree = buildTree(PAYOR_CATEGORY_LEDGER.rows, PAYOR_CATEGORY_LEDGER.groupLevels);
    expect(tree.roots).toHaveLength(4);
    expect(tree.roots.map((n) => n.key)).toContain('MEDICARE');
    expect(tree.roots.map((n) => n.key)).toContain('MEDICAID');
    expect(tree.roots.map((n) => n.key)).toContain('COMMERCIAL');
  });

  it('computes grand total correctly from leaf values', () => {
    const tree = buildTree(PAYOR_CATEGORY_LEDGER.rows, PAYOR_CATEGORY_LEDGER.groupLevels);
    const expectedTotal = PAYOR_CATEGORY_LEDGER.rows.reduce((s, r) => s + r.value, 0);
    expect(grandTotalFromLeaves(tree)).toBe(expectedTotal);
    expect(tree.grandTotal).toBe(expectedTotal);
  });

  it('MEDICARE node value equals sum of its children', () => {
    const tree = buildTree(PAYOR_CATEGORY_LEDGER.rows, PAYOR_CATEGORY_LEDGER.groupLevels);
    const medicare = tree.roots.find((n) => n.key === 'MEDICARE');
    expect(medicare).toBeDefined();
    const childSum = medicare!.children.reduce((s, c) => s + c.value, 0);
    expect(medicare!.value).toBe(childSum);
  });

  it('nodes start collapsed (no expandedKeys)', () => {
    const tree = buildTree(PAYOR_CATEGORY_LEDGER.rows, PAYOR_CATEGORY_LEDGER.groupLevels);
    expect(tree.expandedKeys.size).toBe(0);
  });

  it('toggleExpanded marks a path as expanded', () => {
    const tree = buildTree(PAYOR_CATEGORY_LEDGER.rows, PAYOR_CATEGORY_LEDGER.groupLevels);
    const path = ['MEDICARE'];
    expect(isExpanded(tree, path)).toBe(false);
    const expanded = toggleExpanded(tree, path);
    expect(isExpanded(expanded, path)).toBe(true);
  });

  it('toggleExpanded again collapses the path', () => {
    const tree = buildTree(PAYOR_CATEGORY_LEDGER.rows, PAYOR_CATEGORY_LEDGER.groupLevels);
    const path = ['COMMERCIAL'];
    const once = toggleExpanded(tree, path);
    const twice = toggleExpanded(once, path);
    expect(isExpanded(twice, path)).toBe(false);
  });
});

describe('ledger-logic wiring — denial code mock data (3 levels)', () => {
  it('builds a tree with 3 group levels', () => {
    const tree = buildTree(DENIAL_CODE_LEDGER.rows, DENIAL_CODE_LEDGER.groupLevels);
    expect(tree.groupLevels).toHaveLength(3);
    expect(tree.roots.map((n) => n.key)).toContain('AUTHORIZATION');
    expect(tree.roots.map((n) => n.key)).toContain('ELIGIBILITY');
    expect(tree.roots.map((n) => n.key)).toContain('MEDICAL NECESSITY');
  });

  it('leaf nodes under AUTHORIZATION have no children', () => {
    const tree = buildTree(DENIAL_CODE_LEDGER.rows, DENIAL_CODE_LEDGER.groupLevels);
    const auth = tree.roots.find((n) => n.key === 'AUTHORIZATION');
    expect(auth).toBeDefined();
    expect(auth!.isLeaf).toBe(false);
    const descNode = auth!.children[0];
    expect(descNode).toBeDefined();
    expect(descNode!.isLeaf).toBe(false);
    const codeNode = descNode!.children[0];
    expect(codeNode).toBeDefined();
    expect(codeNode!.isLeaf).toBe(true);
    expect(codeNode!.children).toHaveLength(0);
  });

  it('grand total matches sum of all rows', () => {
    const tree = buildTree(DENIAL_CODE_LEDGER.rows, DENIAL_CODE_LEDGER.groupLevels);
    const expected = DENIAL_CODE_LEDGER.rows.reduce((s, r) => s + r.value, 0);
    expect(tree.grandTotal).toBe(expected);
  });
});

describe('carousel-logic wiring — measure selection', () => {
  const measures = ["SUM('SALES'[Revenue])", "COUNTA('SALES'[Orders])", "AVERAGE('SALES'[Margin])"];
  const initialState = { index: 0, count: measures.length };

  it('starts at index 0', () => {
    expect(initialState.index).toBe(0);
  });

  it('canAdvance is true when not at last measure', () => {
    expect(canAdvance(initialState)).toBe(true);
  });

  it('canRewind is false when at index 0', () => {
    expect(canRewind(initialState)).toBe(false);
  });

  it('advance moves to next measure', () => {
    const next = advance(initialState);
    expect(next.index).toBe(1);
    expect(measures[next.index]).toBe(measures[1]);
  });

  it('advance then rewind returns to original index', () => {
    const forward = advance(initialState);
    const back = rewind(forward);
    expect(back.index).toBe(0);
  });

  it('canAdvance is false at last measure', () => {
    const atEnd = goTo(initialState, measures.length - 1);
    expect(canAdvance(atEnd)).toBe(false);
  });

  it('goTo clamps out-of-range index', () => {
    const clamped = goTo(initialState, 999);
    expect(clamped.index).toBe(measures.length - 1);
  });

  it('single-measure state cannot advance or rewind', () => {
    const single = { index: 0, count: 1 };
    expect(canAdvance(single)).toBe(false);
    expect(canRewind(single)).toBe(false);
  });
});

describe('denials bar mock data shape', () => {
  it('has the expected number of weekly points', () => {
    expect(DENIALS_BAR_DATA.points).toHaveLength(12);
  });

  it('all points have positive values', () => {
    for (const pt of DENIALS_BAR_DATA.points) {
      expect(pt.value).toBeGreaterThan(0);
    }
  });

  it('all points have non-empty labels', () => {
    for (const pt of DENIALS_BAR_DATA.points) {
      expect(pt.label.length).toBeGreaterThan(0);
    }
  });
});

describe('driver ledger mock data', () => {
  it('builds a tree with driver names as roots', () => {
    const tree = buildTree(DRIVER_LEDGER.rows, DRIVER_LEDGER.groupLevels);
    expect(tree.roots.length).toBeGreaterThan(0);
    const keys = tree.roots.map((n) => n.key);
    expect(keys).toContain('Anderson, J');
    expect(keys).toContain('Brown, K');
  });

  it('grand total is sum of all row values', () => {
    const tree = buildTree(DRIVER_LEDGER.rows, DRIVER_LEDGER.groupLevels);
    const expected = DRIVER_LEDGER.rows.reduce((s, r) => s + r.value, 0);
    expect(tree.grandTotal).toBe(expected);
  });
});

describe('morph-choreo drill transition', () => {
  const STATIC_RENDERS: RenderType[] = ['bar (grouped)', 'ledger'];

  it('TODO: morph drill not yet wired — board-11 manifest has no navigation-triggering tile', () => {
    const parsed = parseManifest(DENIALS_MANIFEST_RAW);
    expect(parsed.tiles.length).toBeGreaterThan(0);
    for (const tile of parsed.tiles) {
      expect(STATIC_RENDERS).toContain(tile.render);
    }
  });

  it('TODO: morph drill not yet wired — no tile resolves to a drill/detail render type', () => {
    const parsed = parseManifest(DENIALS_MANIFEST_RAW);
    expect(tilesOfRender(parsed, 'waterfall')).toHaveLength(0);
    const drillTriggers = parsed.tiles.filter(
      (t) => !STATIC_RENDERS.includes(t.render),
    );
    expect(drillTriggers).toHaveLength(0);
  });
});
