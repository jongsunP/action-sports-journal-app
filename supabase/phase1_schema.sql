-- Phase 1 Supabase schema draft for Action Sports Journal.
-- Run manually in the Supabase SQL editor after creating the development
-- project. This file is not applied automatically.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  display_name text,
  email text,
  locale text default 'ko-KR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid,
  activity_group_id text not null default 'wakeboard',
  title text not null,
  notes text,
  status text not null default 'draft',
  source text not null default 'user_selected_video',
  occurred_at timestamptz not null,
  source_video_uri text,
  thumbnail_uri text,
  duration_ms integer,
  file_name text,
  mime_type text,
  file_size integer,
  start_seconds numeric,
  end_seconds numeric,
  takeoff_seconds numeric,
  representative_frame_seconds numeric,
  intended_trick text,
  user_confirmed_trick text,
  latest_evidence_result_id uuid,
  latest_analysis_job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moments_status_check check (
    status in ('draft', 'queued', 'processing', 'completed', 'failed', 'archived')
  )
);

create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  moment_id uuid not null references public.moments(id) on delete cascade,
  kind text not null,
  status text not null default 'queued',
  provider text not null default 'gemini',
  model text,
  attempts integer not null default 0,
  max_attempts integer not null default 2,
  last_error text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analysis_jobs_kind_check check (
    kind in ('evidence_extraction', 'coaching', 'benchmark')
  ),
  constraint analysis_jobs_status_check check (
    status in ('queued', 'processing', 'completed', 'failed', 'cancelled')
  )
);

create table if not exists public.evidence_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  moment_id uuid not null references public.moments(id) on delete cascade,
  analysis_job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  provider text not null default 'gemini',
  model text,
  status text not null,
  quality_mode text,
  predicted_trick text,
  family text,
  confidence text,
  needs_review boolean not null default false,
  consistency_status text,
  consistency_warnings jsonb not null default '[]',
  approach_observed_facts jsonb,
  approach_observed_facts_v2 jsonb,
  approach_decision_v2 jsonb,
  approach_v2_signals jsonb not null default '[]',
  approach_v2_conflict_summary jsonb,
  pop_observed_facts jsonb,
  pop_validation jsonb,
  rotation_observed_facts jsonb,
  rotation_validation jsonb,
  grab_observed_facts jsonb,
  grab_validation jsonb,
  landing_observed_facts jsonb,
  landing_validation jsonb,
  inversion_observed_facts jsonb,
  temporal_windows jsonb,
  evidence_windows jsonb,
  observations jsonb,
  raw_response_text text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evidence_results_status_check check (status in ('completed', 'failed'))
);

alter table public.moments
  add constraint moments_latest_evidence_result_fk
  foreign key (latest_evidence_result_id)
  references public.evidence_results(id)
  deferrable initially deferred;

alter table public.moments
  add constraint moments_latest_analysis_job_fk
  foreign key (latest_analysis_job_id)
  references public.analysis_jobs(id)
  deferrable initially deferred;

create index if not exists moments_user_occurred_at_idx
  on public.moments (user_id, occurred_at desc);

create index if not exists moments_status_idx
  on public.moments (status);

create index if not exists moments_latest_analysis_job_idx
  on public.moments (latest_analysis_job_id);

create index if not exists analysis_jobs_status_queued_at_idx
  on public.analysis_jobs (status, queued_at);

create index if not exists analysis_jobs_moment_idx
  on public.analysis_jobs (moment_id);

create index if not exists analysis_jobs_user_created_at_idx
  on public.analysis_jobs (user_id, created_at desc);

create index if not exists evidence_results_moment_created_at_idx
  on public.evidence_results (moment_id, created_at desc);

create index if not exists evidence_results_user_created_at_idx
  on public.evidence_results (user_id, created_at desc);

create index if not exists evidence_results_needs_review_idx
  on public.evidence_results (needs_review);

alter table public.users enable row level security;
alter table public.moments enable row level security;
alter table public.analysis_jobs enable row level security;
alter table public.evidence_results enable row level security;

-- Phase 1 locked-down RLS:
-- Service role can manage rows. Authenticated client policies are intentionally
-- not opened yet because Auth UI is not part of this phase.

grant usage on schema public to service_role;
grant all on table public.users to service_role;
grant all on table public.moments to service_role;
grant all on table public.analysis_jobs to service_role;
grant all on table public.evidence_results to service_role;
