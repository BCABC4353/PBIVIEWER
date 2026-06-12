import { describe, it, expect } from 'vitest';
import {
  buildTree,
  toggleExpanded,
  setExpanded,
  isExpanded,
  drillPath,
  nodeAtPath,
  flipAxes,
  grandTotalFromLeaves,
  type LedgerRow,
} from './ledger-logic';

const ROWS: LedgerRow[] = [
  { groups: ['APAC', 'Q1'], value: 100 },
  { groups: ['APAC', 'Q2'], value: 200 },
  { groups: ['EMEA', 'Q1'], value: 150 },
  { groups: ['EMEA', 'Q2'], value: 250 },
  { groups: ['AMER', 'Q1'], value: 50 },
];

describe('buildTree — basic structure', () => {
  it('builds correct grand total', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    expect(tree.grandTotal).toBe(750);
  });

  it('has three root nodes', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    expect(tree.roots.length).toBe(3);
  });

  it('APAC root value sums children', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const apac = tree.roots.find((n) => n.key === 'APAC')!;
    expect(apac.value).toBe(300);
  });

  it('EMEA Q1 leaf has value 150', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const emea = tree.roots.find((n) => n.key === 'EMEA')!;
    const q1 = emea.children.find((n) => n.key === 'Q1')!;
    expect(q1.value).toBe(150);
    expect(q1.isLeaf).toBe(true);
  });

  it('AMER has only one child', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const amer = tree.roots.find((n) => n.key === 'AMER')!;
    expect(amer.children.length).toBe(1);
  });

  it('empty rows returns zero grand total', () => {
    const tree = buildTree([], ['Region', 'Quarter']);
    expect(tree.grandTotal).toBe(0);
    expect(tree.roots.length).toBe(0);
  });

  it('empty group levels returns empty tree', () => {
    const tree = buildTree(ROWS, []);
    expect(tree.roots.length).toBe(0);
    expect(tree.grandTotal).toBe(0);
  });

  it('single level grouping', () => {
    const tree = buildTree(ROWS, ['Region']);
    expect(tree.roots.length).toBe(3);
    const apac = tree.roots.find((n) => n.key === 'APAC')!;
    expect(apac.isLeaf).toBe(true);
    expect(apac.value).toBe(300);
  });
});

describe('totals rollup vs leaf sums', () => {
  it('grand total equals sum of all leaf values (2-level tree)', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const leafSum = grandTotalFromLeaves(tree);
    expect(leafSum).toBe(tree.grandTotal);
  });

  it('each parent value equals sum of its leaf descendants', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    for (const root of tree.roots) {
      const leafTotal = root.children.reduce((s, c) => s + c.value, 0);
      expect(root.value).toBe(leafTotal);
    }
  });

  it('single-row tree: leaf value matches grand total', () => {
    const tree = buildTree([{ groups: ['X', 'Y'], value: 42 }], ['A', 'B']);
    expect(tree.grandTotal).toBe(42);
    expect(grandTotalFromLeaves(tree)).toBe(42);
  });
});

describe('expand/collapse state', () => {
  it('initially all collapsed', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    expect(isExpanded(tree, ['APAC'])).toBe(false);
  });

  it('toggleExpanded opens a node', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const t2 = toggleExpanded(tree, ['APAC']);
    expect(isExpanded(t2, ['APAC'])).toBe(true);
  });

  it('toggleExpanded closes an open node', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const t2 = toggleExpanded(tree, ['APAC']);
    const t3 = toggleExpanded(t2, ['APAC']);
    expect(isExpanded(t3, ['APAC'])).toBe(false);
  });

  it('setExpanded true opens node', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const t2 = setExpanded(tree, ['EMEA'], true);
    expect(isExpanded(t2, ['EMEA'])).toBe(true);
  });

  it('setExpanded false closes node', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const t2 = setExpanded(tree, ['EMEA'], true);
    const t3 = setExpanded(t2, ['EMEA'], false);
    expect(isExpanded(t3, ['EMEA'])).toBe(false);
  });

  it('toggle is pure — does not mutate original', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const t2 = toggleExpanded(tree, ['APAC']);
    expect(isExpanded(tree, ['APAC'])).toBe(false);
    expect(isExpanded(t2, ['APAC'])).toBe(true);
  });

  it('expanding two nodes independently', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const t2 = toggleExpanded(tree, ['APAC']);
    const t3 = toggleExpanded(t2, ['EMEA']);
    expect(isExpanded(t3, ['APAC'])).toBe(true);
    expect(isExpanded(t3, ['EMEA'])).toBe(true);
  });
});

describe('drillPath', () => {
  it('returns path up to group level count', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const dp = drillPath(tree, ['APAC', 'Q1', 'extra']);
    expect(dp.path).toEqual(['APAC', 'Q1']);
  });

  it('empty path returns empty', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const dp = drillPath(tree, []);
    expect(dp.path).toEqual([]);
  });

  it('single segment drill', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const dp = drillPath(tree, ['EMEA']);
    expect(dp.path).toEqual(['EMEA']);
  });
});

describe('nodeAtPath', () => {
  it('finds root node', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const node = nodeAtPath(tree, ['APAC']);
    expect(node).not.toBeNull();
    expect(node!.key).toBe('APAC');
  });

  it('finds nested leaf', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const node = nodeAtPath(tree, ['EMEA', 'Q2']);
    expect(node).not.toBeNull();
    expect(node!.value).toBe(250);
  });

  it('returns null for missing path', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const node = nodeAtPath(tree, ['UNKNOWN']);
    expect(node).toBeNull();
  });

  it('returns null for empty path', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const node = nodeAtPath(tree, []);
    expect(node).toBeNull();
  });
});

describe('axis flip — total invariance', () => {
  it('grand total is identical before and after flip', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const flipped = flipAxes(tree, ROWS);
    expect(flipped.grandTotal).toBe(tree.grandTotal);
  });

  it('flipped grand total matches leaf sum', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const flipped = flipAxes(tree, ROWS);
    expect(grandTotalFromLeaves(flipped)).toBe(flipped.grandTotal);
  });

  it('flipped group levels are reversed', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const flipped = flipAxes(tree, ROWS);
    expect(flipped.groupLevels).toEqual(['Quarter', 'Region']);
  });

  it('flipped tree roots are quarters not regions', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const flipped = flipAxes(tree, ROWS);
    const rootKeys = flipped.roots.map((n) => n.key).sort();
    expect(rootKeys).toEqual(['Q1', 'Q2'].sort());
  });

  it('double flip restores original grand total', () => {
    const tree = buildTree(ROWS, ['Region', 'Quarter']);
    const once = flipAxes(tree, ROWS);
    const twice = flipAxes(once, ROWS.map((r) => ({ ...r, groups: [r.groups[1]!, r.groups[0]!] })));
    expect(twice.grandTotal).toBe(tree.grandTotal);
  });
});
