-- Phase 13: Account recovery / account linking attempt observability.
--
-- Purpose:
-- - Record Kakao and Email recovery/linking attempt outcomes.
-- - Keep recovery behavior unchanged.
-- - Avoid storing raw emails, OAuth codes, callback URLs, or auth tokens.
--
-- Run manually in the Supabase SQL editor after review. Do not apply
-- automatically from Codex unless the target project is explicitly confirmed.

create table if not exists public.recovery_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  auth_user_id uuid,
  provider text not null,
  flow text not null,
  event text not null,
  status text not null,
  reason_code text,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint recovery_attempts_provider_check check (
    provider in ('kakao', 'email')
  ),
  constraint recovery_attempts_flow_check check (
    flow in ('link', 'recovery_sign_in', 'email_connection', 'email_callback')
  ),
  constraint recovery_attempts_status_check check (
    status in ('started', 'succeeded', 'failed', 'cancelled', 'dismissed', 'blocked')
  )
);

create index if not exists recovery_attempts_user_created_idx
  on public.recovery_attempts (user_id, created_at desc);

create index if not exists recovery_attempts_provider_flow_created_idx
  on public.recovery_attempts (provider, flow, created_at desc);

create index if not exists recovery_attempts_status_created_idx
  on public.recovery_attempts (status, created_at desc);

alter table public.recovery_attempts enable row level security;

grant all on table public.recovery_attempts to service_role;
