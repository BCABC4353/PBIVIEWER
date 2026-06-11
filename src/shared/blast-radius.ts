// ============================================
// Blast Radius — pure cascade logic (v1)
// ============================================
// Computes the damage path for the Insights board's expanding workspace tile:
// dataflow → false-positive datasets → reports currently lying to clients.
//
// PURE on purpose: no Electron, no fetch, no Date.now(). Importable by the
// renderer today and the mobile app later. All inputs come from the
// InsightsSnapshot the main process already assembles.
//
// Cascade rule v1 (docs/design/BLAST-RADIUS.md):
//   suspect(dataset) := lastStatus === 'Completed'
//     AND any upstream dataflow d where
//         d.lastStatus === 'Failed'
//      OR (d.lastSuccessTime && dataset.lastSuccessTime &&
//          d.lastSuccessTime < dataset.lastSuccessTime)  // refreshed BEFORE flow
//   inaccurate(report) := report.datasetId ∈ suspects

import type { InsightsRefreshable, InsightsSnapshot } from './types';

export interface BlastRadius {
  /** dataflowId → datasets that are FALSE POSITIVES because of it ("refreshed
   *  against stale data" — lastStatus says Completed, the data behind it is
   *  not). Keyed by the dataflow refreshable's canonical id. */
  suspectsByDataflow: Map<string, InsightsRefreshable[]>;
  /** datasetId → reports bound to it. Populated ONLY for suspect datasets —
   *  these are the reports currently lying to clients. */
  reportsByDataset: Map<string, Array<{ id: string; name: string }>>;
  /** Every dataset id implicated by at least one upstream dataflow. */
  suspectDatasetIds: Set<string>;
}

/** True when the dataflow makes a Completed dataset a false positive. */
function implicates(dataflow: InsightsRefreshable, dataset: InsightsRefreshable): boolean {
  if (dataflow.lastStatus === 'Failed') return true;
  // "Refreshed before the flow delivered": both success times must be KNOWN,
  // and the dataflow's last success must be strictly OLDER than the dataset's.
  // Date.parse on a malformed stamp yields NaN, and NaN comparisons are false,
  // so garbage timestamps never implicate.
  if (!dataflow.lastSuccessTime || !dataset.lastSuccessTime) return false;
  return Date.parse(dataflow.lastSuccessTime) < Date.parse(dataset.lastSuccessTime);
}

export function computeBlastRadius(snapshot: InsightsSnapshot): BlastRadius {
  // Index dataflows by lowercased id: the lineage link ids and the dataflow
  // listing ids come from different endpoints, so match case-insensitively
  // (GUID casing is not guaranteed consistent across Power BI APIs).
  const dataflowsById = new Map<string, InsightsRefreshable>();
  for (const r of snapshot.refreshables) {
    if (r.kind === 'dataflow') dataflowsById.set(r.id.toLowerCase(), r);
  }

  const suspectsByDataflow = new Map<string, InsightsRefreshable[]>();
  const suspectDatasetIds = new Set<string>();

  for (const dataset of snapshot.refreshables) {
    if (dataset.kind !== 'dataset') continue;
    // Only Completed datasets can be false positives — anything else already
    // shows its real state on the board.
    if (dataset.lastStatus !== 'Completed') continue;
    for (const flowId of dataset.upstreamDataflowIds ?? []) {
      const dataflow = dataflowsById.get(flowId.toLowerCase());
      // Lineage can reference a dataflow the snapshot cannot see (other
      // workspace, no access) — without its health there is no signal.
      if (!dataflow) continue;
      if (!implicates(dataflow, dataset)) continue;
      // Key by the dataflow's CANONICAL id so consumers can join back to
      // snapshot.refreshables directly.
      const suspects = suspectsByDataflow.get(dataflow.id) ?? [];
      // A dataset can be implicated by several of its flows; list it under
      // each (the tile shows the damage per dataflow root) but only once per
      // flow.
      if (!suspects.includes(dataset)) suspects.push(dataset);
      suspectsByDataflow.set(dataflow.id, suspects);
      suspectDatasetIds.add(dataset.id);
    }
  }

  // Reports lying to clients: ONLY the ones bound to a suspect dataset.
  const reportsByDataset = new Map<string, Array<{ id: string; name: string }>>();
  for (const report of snapshot.reports ?? []) {
    if (!report.datasetId || !suspectDatasetIds.has(report.datasetId)) continue;
    const list = reportsByDataset.get(report.datasetId) ?? [];
    list.push({ id: report.id, name: report.name });
    reportsByDataset.set(report.datasetId, list);
  }

  return { suspectsByDataflow, reportsByDataset, suspectDatasetIds };
}
