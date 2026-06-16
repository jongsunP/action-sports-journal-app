alter table public.evidence_results
  add column if not exists pop_observed_facts jsonb,
  add column if not exists pop_validation jsonb;
