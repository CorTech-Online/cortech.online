import type { Digest, SeverityBucket } from './types';

type RawPayload = {
  as_of: string;
  total_disclosed: number;
  total_acknowledged: number;
  total_fixed: number;
  total_cves: number;
  headline: {
    advisories: number;
    analyzed: number;
    triaged: number;
    verified: number;
    tpr_pct?: number;
  };
  fp_rate: number;
  median_days_to_ack: number;
  median_days_to_patch: number;
  by_bug_class: Record<string, number>;
  by_ecosystem: Record<string, SeverityBucket>;
  by_project: Array<{ project: string; ecosystem: string; cve_ids: string[] }>;
  cve_records: Array<{
    identifier: string;
    findings: Array<{ project: string; bug_class: string; ecosystem: string }>;
  }>;
  ghsa_records: Array<unknown>;
};

export function digest(raw: RawPayload, fetchedAt: string): Digest {
  const projectNames = Array.from(new Set(raw.by_project.map((p) => p.project))).sort();
  const cveIds = Array.from(new Set(raw.cve_records.map((r) => r.identifier))).sort();
  return {
    as_of: raw.as_of,
    fetched_at: fetchedAt,
    headline: {
      disclosed: raw.total_disclosed,
      acknowledged: raw.total_acknowledged,
      fixed: raw.total_fixed,
      advisories: raw.headline.advisories,
      candidates: raw.headline.analyzed,
      reviewed: raw.headline.triaged,
      verified: raw.headline.verified,
    },
    rates: {
      true_positive_pct:
        raw.headline.tpr_pct !== undefined
          ? raw.headline.tpr_pct
          : Math.round((1 - raw.fp_rate) * 1000) / 10,
      median_days_to_ack: raw.median_days_to_ack,
      median_days_to_patch: raw.median_days_to_patch,
    },
    by_bug_class: { ...raw.by_bug_class },
    by_ecosystem: { ...raw.by_ecosystem },
    project_names: projectNames,
    revealed_cve_ids: cveIds,
  };
}
