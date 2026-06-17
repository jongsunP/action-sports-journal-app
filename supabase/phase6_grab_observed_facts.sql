alter table public.evidence_results
  add column if not exists grab_observed_facts jsonb,
  add column if not exists grab_validation jsonb;
