export interface LedgerRow {
  groups: string[];
  value: number;
}

export interface LedgerNode {
  key: string;
  fullPath: string[];
  value: number;
  children: LedgerNode[];
  isLeaf: boolean;
}

export interface LedgerTree {
  roots: LedgerNode[];
  grandTotal: number;
  groupLevels: string[];
  expandedKeys: Set<string>;
}

export interface DrillPath {
  path: string[];
}

function pathKey(path: string[]): string {
  return path.join('\x00');
}

function buildNodes(
  rows: LedgerRow[],
  levelIndex: number,
  parentPath: string[],
  groupLevels: string[],
): LedgerNode[] {
  if (levelIndex >= groupLevels.length || rows.length === 0) return [];

  const buckets = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const key = row.groups[levelIndex] ?? '';
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  const nodes: LedgerNode[] = [];
  for (const [key, bucket] of buckets) {
    const fullPath = [...parentPath, key];
    const isLastLevel = levelIndex === groupLevels.length - 1;

    if (isLastLevel) {
      const value = bucket.reduce((s, r) => s + r.value, 0);
      nodes.push({ key, fullPath, value, children: [], isLeaf: true });
    } else {
      const children = buildNodes(bucket, levelIndex + 1, fullPath, groupLevels);
      const value = children.reduce((s, c) => s + c.value, 0);
      nodes.push({ key, fullPath, value, children, isLeaf: false });
    }
  }

  return nodes;
}

function sumLeaves(nodes: LedgerNode[]): number {
  let total = 0;
  for (const node of nodes) {
    if (node.isLeaf) {
      total += node.value;
    } else {
      total += sumLeaves(node.children);
    }
  }
  return total;
}

export function buildTree(rows: LedgerRow[], groupLevels: string[]): LedgerTree {
  if (groupLevels.length === 0 || rows.length === 0) {
    return { roots: [], grandTotal: 0, groupLevels, expandedKeys: new Set() };
  }
  const roots = buildNodes(rows, 0, [], groupLevels);
  const grandTotal = roots.reduce((s, n) => s + n.value, 0);
  return { roots, grandTotal, groupLevels, expandedKeys: new Set() };
}

export function toggleExpanded(tree: LedgerTree, path: string[]): LedgerTree {
  const k = pathKey(path);
  const next = new Set(tree.expandedKeys);
  if (next.has(k)) next.delete(k);
  else next.add(k);
  return { ...tree, expandedKeys: next };
}

export function setExpanded(tree: LedgerTree, path: string[], expanded: boolean): LedgerTree {
  const k = pathKey(path);
  const next = new Set(tree.expandedKeys);
  if (expanded) next.add(k);
  else next.delete(k);
  return { ...tree, expandedKeys: next };
}

export function isExpanded(tree: LedgerTree, path: string[]): boolean {
  return tree.expandedKeys.has(pathKey(path));
}

export function drillPath(tree: LedgerTree, path: string[]): DrillPath {
  return { path: path.filter((_, i) => i < tree.groupLevels.length) };
}

export function nodeAtPath(tree: LedgerTree, path: string[]): LedgerNode | null {
  if (path.length === 0) return null;
  let current: LedgerNode | null = null;
  let nodes = tree.roots;
  for (const segment of path) {
    const found = nodes.find((n) => n.key === segment) ?? null;
    if (!found) return null;
    current = found;
    nodes = found.children;
  }
  return current;
}

export function flipAxes(tree: LedgerTree, rows: LedgerRow[]): LedgerTree {
  const flipped = [...tree.groupLevels].reverse();
  const remapped: LedgerRow[] = rows.map((r) => ({
    value: r.value,
    groups: flipped.map((_, newIdx) => {
      const origIdx = tree.groupLevels.length - 1 - newIdx;
      return r.groups[origIdx] ?? '';
    }),
  }));
  return buildTree(remapped, flipped);
}

export function grandTotalFromLeaves(tree: LedgerTree): number {
  return sumLeaves(tree.roots);
}
