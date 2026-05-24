import type { Digest, Trigger } from './types';

export const BUG_CLASS_MIN_DELTA = 5;
export const BUG_CLASS_MIN_PCT = 25;
export const FUNNEL_MIN_PCT = 5;

// Shape of the raw payload fields we need for enrichment. Matches the real
// red.anthropic.com payload: cve_records[].identifier + findings[0] with
// project/bug_class/ecosystem.
type RawForEnrichment = {
  cve_records: Array<{
    identifier: string;
    findings: Array<{ project: string; bug_class: string; ecosystem: string }>;
  }>;
  by_project: Array<{ project: string; ecosystem: string; cve_ids: string[] }>;
};

/**
 * Pure: diff two digests and return a list of triggers. Optional `newRaw`
 * enriches `revealed` and `new_project` triggers with project/bug_class/ecosystem
 * pulled from the raw payload; without it, those triggers fall back to 'unknown'.
 */
export function triggersFor(oldD: Digest, newD: Digest, newRaw?: RawForEnrichment): Trigger[] {
  const triggers: Trigger[] = [];
  const oldCves = new Set(oldD.revealed_cve_ids);
  const newProjects = new Set(newD.project_names);
  const oldProjects = new Set(oldD.project_names);

  for (const cveId of newD.revealed_cve_ids) {
    if (oldCves.has(cveId)) continue;
    const record = newRaw?.cve_records.find((r) => r.identifier === cveId);
    const finding = record?.findings[0];
    triggers.push({
      kind: 'revealed',
      cve_id: cveId,
      project: finding?.project ?? 'unknown',
      bug_class: finding?.bug_class ?? 'unknown',
      ecosystem: finding?.ecosystem ?? 'unknown',
    });
  }

  for (const project of newProjects) {
    if (oldProjects.has(project)) continue;
    const meta = newRaw?.by_project.find((p) => p.project === project);
    triggers.push({
      kind: 'new_project',
      project,
      ecosystem: meta?.ecosystem ?? 'unknown',
      first_cves: meta?.cve_ids ?? [],
    });
  }

  for (const [bugClass, count] of Object.entries(newD.by_bug_class)) {
    const oldCount = oldD.by_bug_class[bugClass] ?? 0;
    const delta = count - oldCount;
    if (delta < BUG_CLASS_MIN_DELTA) continue;
    const pct = oldCount === 0 ? 100 : ((count - oldCount) / oldCount) * 100;
    if (pct < BUG_CLASS_MIN_PCT) continue;
    triggers.push({ kind: 'bug_class_shift', bug_class: bugClass, delta, pct_change: pct });
  }

  type FunnelMetric = 'tp_rate' | 'days_to_ack' | 'days_to_patch';
  const funnelChecks: Array<[FunnelMetric, number, number]> = [
    ['tp_rate', oldD.rates.true_positive_pct, newD.rates.true_positive_pct],
    ['days_to_ack', oldD.rates.median_days_to_ack, newD.rates.median_days_to_ack],
    ['days_to_patch', oldD.rates.median_days_to_patch, newD.rates.median_days_to_patch],
  ];
  for (const [metric, from, to] of funnelChecks) {
    if (from === 0) continue;
    const pct = Math.abs(((to - from) / from) * 100);
    if (pct < FUNNEL_MIN_PCT) continue;
    triggers.push({ kind: 'funnel_shift', metric, from, to, pct_change: pct });
  }

  return triggers;
}
