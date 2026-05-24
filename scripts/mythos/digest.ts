import type { Digest, SeverityBucket } from './types';

type RawPayload = {
  as_of: string;
  headline: {
    disclosed: number;
    acknowledged: number;
    fixed_in_response: number;
    advisories: number;
    analyzed: number;
    triaged: number;
    verified: number;
    tpr_pct: number;
  };
  median_days_to_ack: number;
  median_days_to_patch: number;
  by_bug_class: Record<string, number>;
  by_ecosystem: Record<string, SeverityBucket>;
  by_project: Array<{ project: string; ecosystem: string; cve_ids: string[] }>;
  cve_records: Array<{
    identifier: string;
    findings: Array<{ project: string; bug_class: string; ecosystem: string }>;
  }>;
  // TODO: field name is misleading — ghsa_records has the same shape as cve_records
  ghsa_records: Array<{
    identifier: string;
    findings: Array<{ project: string; bug_class: string; ecosystem: string }>;
  }>;
};

export function digest(raw: RawPayload, fetchedAt: string): Digest {
  const projectNames = Array.from(new Set(raw.by_project.map((p) => p.project))).sort();
  // TODO: field name `revealed_cve_ids` is a misnomer — it now stores both CVE and GHSA IDs.
  // Renaming would break the snapshot bootstrap; update when snapshot format is versioned.
  const cveIds = Array.from(
    new Set([
      ...raw.cve_records.map((r) => r.identifier),
      ...(raw.ghsa_records ?? []).map((r) => r.identifier),
    ]),
  ).sort();
  return {
    as_of: raw.as_of,
    fetched_at: fetchedAt,
    headline: {
      disclosed: raw.headline.disclosed,
      acknowledged: raw.headline.acknowledged,
      fixed: raw.headline.fixed_in_response,
      advisories: raw.headline.advisories,
      candidates: raw.headline.analyzed,
      reviewed: raw.headline.triaged,
      verified: raw.headline.verified,
    },
    rates: {
      true_positive_pct: raw.headline.tpr_pct,
      median_days_to_ack: raw.median_days_to_ack,
      median_days_to_patch: raw.median_days_to_patch,
    },
    by_bug_class: { ...raw.by_bug_class },
    by_ecosystem: { ...raw.by_ecosystem },
    project_names: projectNames,
    revealed_cve_ids: cveIds,
  };
}
