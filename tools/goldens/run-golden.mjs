import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

function refuseUnlessLive() {
  const live = process.env['LIVE'];
  const token = process.env['PBI_TOKEN'];
  if (live !== '1' || !token) {
    process.stderr.write(
      'REFUSED: This command posts live DAX queries to Power BI.\n' +
      'Set LIVE=1 and PBI_TOKEN=<bearer token> to proceed.\n' +
      'Example: LIVE=1 PBI_TOKEN=$(cat token.txt) node tools/goldens/run-golden.mjs <manifest.json> --group <id> --dataset <id>\n',
    );
    process.exit(1);
  }
  return token;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let manifestPath = null;
  let groupId = null;
  let datasetId = null;
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--group' && args[i + 1]) {
      groupId = args[i + 1];
      i += 2;
    } else if (args[i] === '--dataset' && args[i + 1]) {
      datasetId = args[i + 1];
      i += 2;
    } else if (!manifestPath && !args[i].startsWith('--')) {
      manifestPath = args[i];
      i++;
    } else {
      i++;
    }
  }
  return { manifestPath, groupId, datasetId };
}

function usage() {
  process.stderr.write(
    'Usage: LIVE=1 PBI_TOKEN=<token> node tools/goldens/run-golden.mjs <manifest.json> --dataset <id> [--group <id>]\n',
  );
  process.exit(1);
}

function buildUrl(groupId, datasetId) {
  const base = 'https://api.powerbi.com/v1.0/myorg';
  if (groupId) {
    return `${base}/groups/${groupId}/datasets/${datasetId}/executeQueries`;
  }
  return `${base}/datasets/${datasetId}/executeQueries`;
}

function normalizeKey(raw) {
  const m = /\[([^\]]+)\]\s*$/.exec(raw);
  return m ? m[1] : raw;
}

function parseResponse(json) {
  const diagnostics = [];
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    diagnostics.push('response root is not an object');
    return { columns: [], rows: [], diagnostics };
  }
  const results = json['results'];
  if (!Array.isArray(results) || results.length === 0) {
    diagnostics.push('results missing or empty');
    return { columns: [], rows: [], diagnostics };
  }
  const tables = results[0]['tables'];
  if (!Array.isArray(tables) || tables.length === 0) {
    diagnostics.push('tables missing or empty');
    return { columns: [], rows: [], diagnostics };
  }
  const rawRows = tables[0]['rows'];
  if (!Array.isArray(rawRows)) {
    diagnostics.push('rows missing or not an array');
    return { columns: [], rows: [], diagnostics };
  }
  const columns = [];
  const seen = new Set();
  const rows = rawRows.map((raw) => {
    const out = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw)) {
        const norm = normalizeKey(key);
        if (!seen.has(norm)) {
          seen.add(norm);
          columns.push(norm);
        }
        out[norm] = value;
      }
    }
    return out;
  });
  return { columns, rows, diagnostics };
}

function compactRow(row) {
  const entries = Object.entries(row).slice(0, 4);
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
}

async function runTile(tile, url, token) {
  if (!tile['dax']) return null;
  const body = {
    queries: [{ query: tile['dax'] }],
    serializerSettings: { includeNulls: true },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const code = json?.error?.code ?? '';
    const msg = json?.error?.message ?? '';
    return { tileId: tile['id'], error: `HTTP ${res.status} ${code} ${msg}`.trim(), rowCount: 0, firstRow: null, diagnostics: [] };
  }
  const parsed = parseResponse(json);
  return {
    tileId: tile['id'],
    rowCount: parsed.rows.length,
    firstRow: parsed.rows[0] ?? null,
    diagnostics: parsed.diagnostics,
  };
}

async function main() {
  const token = refuseUnlessLive();
  const { manifestPath, groupId, datasetId } = parseArgs(process.argv);

  if (!manifestPath || !datasetId) usage();

  const absManifest = resolve(manifestPath);
  let tiles;
  try {
    const raw = JSON.parse(readFileSync(absManifest, 'utf-8'));
    tiles = Array.isArray(raw) ? raw : (raw['tiles'] ?? []);
  } catch (e) {
    process.stderr.write(`Failed to read manifest: ${e.message}\n`);
    process.exit(1);
  }

  const outDir = resolve('goldens-out');
  mkdirSync(outDir, { recursive: true });

  const url = buildUrl(groupId, datasetId);
  const queryTiles = tiles.filter((t) => t['dax']);

  process.stdout.write(`Manifest: ${absManifest}\n`);
  process.stdout.write(`Dataset:  ${datasetId}${groupId ? ` (group ${groupId})` : ''}\n`);
  process.stdout.write(`Tiles with DAX: ${queryTiles.length} of ${tiles.length}\n\n`);

  const header = 'tile id          rows  first row';
  process.stdout.write(header + '\n');
  process.stdout.write('-'.repeat(header.length) + '\n');

  for (const tile of queryTiles) {
    const result = await runTile(tile, url, token);
    if (!result) continue;

    const outFile = join(outDir, `${result.tileId}.json`);
    writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf-8');

    const tileCol = String(result.tileId).padEnd(16);
    const rowCol = String(result.error ? 'ERR' : result.rowCount).padEnd(5);
    const detail = result.error ?? (result.firstRow ? compactRow(result.firstRow) : '(empty)');
    process.stdout.write(`${tileCol} ${rowCol} ${detail}\n`);

    if (result.diagnostics.length > 0) {
      for (const d of result.diagnostics) {
        process.stdout.write(`  diag: ${d}\n`);
      }
    }
  }

  process.stdout.write(`\nResults written to ${outDir}/\n`);
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${e.message}\n`);
  process.exit(1);
});
