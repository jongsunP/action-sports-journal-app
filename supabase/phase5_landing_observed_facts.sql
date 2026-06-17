alter table public.evidence_results
  add column if not exists landing_observed_facts jsonb,
  add column if not exists landing_validation jsonb;
