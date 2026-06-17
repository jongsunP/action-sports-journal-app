alter table public.evidence_results
  add column if not exists rotation_observed_facts jsonb,
  add column if not exists rotation_validation jsonb;
