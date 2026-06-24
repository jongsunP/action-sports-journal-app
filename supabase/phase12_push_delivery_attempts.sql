-- Phase 12: Push delivery observability for analysis completion notifications.
--
-- Purpose:
-- - Keep Push delivery behavior unchanged.
-- - Record why an analysis completion Push was or was not sent.
-- - Preserve token ownership boundaries without duplicating raw Expo push tokens.
-- - Enable manual/internal receipt checks before adding any scheduler.
--
-- Run manually in the Supabase SQL editor after phase 9.

create table if not exists public.analysis_push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  moment_id uuid references public.moments(id) on delete set null,
  evidence_result_id uuid references public.evidence_results(id) on delete set null,
  status text not null,
  registered_token_count integer not null default 0,
  enabled_token_count integer not null default 0,
  disabled_token_count integer not null default 0,
  invalid_token_count integer not null default 0,
  ticket_ids text[] not null default '{}',
  token_results jsonb not null default '[]'::jsonb,
  receipt_results jsonb not null default '[]'::jsonb,
  error_message text,
  receipt_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analysis_push_delivery_attempts_status_check check (
    status in (
      'skipped_no_tokens',
      'skipped_disabled_only',
      'skipped_no_valid_tokens',
      'send_started',
      'send_request_error',
      'ticket_ok',
      'ticket_error',
      'receipt_ok',
      'receipt_error',
      'receipt_missing'
    )
  )
);

create index if not exists analysis_push_delivery_attempts_user_created_idx
  on public.analysis_push_delivery_attempts (user_id, created_at desc);

create index if not exists analysis_push_delivery_attempts_receipt_pending_idx
  on public.analysis_push_delivery_attempts (receipt_checked_at, created_at)
  where receipt_checked_at is null
    and status in ('ticket_ok', 'ticket_error');

alter table public.analysis_push_delivery_attempts enable row level security;

grant all on table public.analysis_push_delivery_attempts to service_role;
