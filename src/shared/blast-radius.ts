
import type { InsightsRefreshable, InsightsSnapshot } from './types';

export interface BlastRadius {
  suspectsByDataflow: Map<string, InsightsRefreshable[]>;
  reportsByDataset: Map<string, Array<{ id: string; name: string }>>;
  suspectDatasetIds: Set<string>;
}

function implicates(dataflow: InsightsRefreshable, _dataset: InsightsRefreshable): boolean {
  return dataflow.lastStatus === 'Failed';
}

export function computeBlastRadius(snapshot: InsightsSnapshot): BlastRadius {
  const dataflowsById = new Map<string, InsightsRefreshable>();
  for (const r of snapshot.refreshables) {
    if (r.kind === 'dataflow') dataflowsById.set(r.id.toLowerCase(), r);
  }

  const suspectsByDataflow = new Map<string, InsightsRefreshable[]>();
  const suspectDatasetIds = new Set<string>();

  for (const dataset of snapshot.refreshables) {
    if (dataset.kind !== 'dataset') continue;
    if (dataset.lastStatus !== 'Completed') continue;
    for (const flowId of dataset.upstreamDataflowIds ?? []) {
      const dataflow = dataflowsById.get(flowId.toLowerCase());
      if (!dataflow) continue;
      if (!implicates(dataflow, dataset)) continue;
      const suspects = suspectsByDataflow.get(dataflow.id) ?? [];
      if (!suspects.includes(dataset)) suspects.push(dataset);
      suspectsByDataflow.set(dataflow.id, suspects);
      suspectDatasetIds.add(dataset.id);
    }
  }

  const reportsByDataset = new Map<string, Array<{ id: string; name: string }>>();
  for (const report of snapshot.reports ?? []) {
    if (!report.datasetId || !suspectDatasetIds.has(report.datasetId)) continue;
    const list = reportsByDataset.get(report.datasetId) ?? [];
    list.push({ id: report.id, name: report.name });
    reportsByDataset.set(report.datasetId, list);
  }

  return { suspectsByDataflow, reportsByDataset, suspectDatasetIds };
}
