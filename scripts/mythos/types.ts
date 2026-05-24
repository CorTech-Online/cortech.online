export type SeverityBucket = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
};

export type Digest = {
  as_of: string;
  fetched_at: string;
  headline: {
    disclosed: number;
    acknowledged: number;
    fixed: number;
    advisories: number;
    candidates: number;
    reviewed: number;
    verified: number;
  };
  rates: {
    true_positive_pct: number;
    median_days_to_ack: number;
    median_days_to_patch: number;
  };
  by_bug_class: Record<string, number>;
  by_ecosystem: Record<string, SeverityBucket>;
  project_names: string[];
  revealed_cve_ids: string[];
};

export type Trigger =
  | { kind: 'revealed'; cve_id: string; project: string; bug_class: string; ecosystem: string }
  | { kind: 'new_project'; project: string; ecosystem: string; first_cves: string[] }
  | { kind: 'bug_class_shift'; bug_class: string; delta: number; pct_change: number }
  | {
      kind: 'funnel_shift';
      metric: 'tp_rate' | 'days_to_ack' | 'days_to_patch';
      from: number;
      to: number;
      pct_change: number;
    };
