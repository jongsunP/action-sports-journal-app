alter table public.evidence_results
  add column if not exists approach_observed_facts_v2 jsonb,
  add column if not exists approach_decision_v2 jsonb,
  add column if not exists approach_v2_signals jsonb not null default '[]',
  add column if not exists approach_v2_conflict_summary jsonb;
