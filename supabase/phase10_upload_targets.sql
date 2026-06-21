-- Phase 10: upload target tracking for direct source-video uploads.
--
-- Run manually in the Supabase SQL editor after phase 9.
-- Purpose:
-- - Track signed/direct upload targets.
-- - Make uploaded-but-not-finalized source video objects identifiable.
-- - Do not implement automatic deletion here.

create table if not exists public.upload_targets (
  upload_id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  draft_id text not null,
  storage_provider text not null default 'supabase',
  storage_bucket text not null,
  storage_path text not null,
  status text not null default 'issued',
  file_name text,
  mime_type text,
  file_size bigint,
  duration_ms integer,
  issued_at timestamptz not null default now(),
  uploaded_at timestamptz,
  finalized_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists upload_targets_user_status_idx
  on public.upload_targets (user_id, status, created_at desc);

create index if not exists upload_targets_storage_path_idx
  on public.upload_targets (storage_bucket, storage_path);

create index if not exists upload_targets_orphan_candidates_idx
  on public.upload_targets (status, created_at)
  where status in ('issued', 'uploaded', 'failed');

alter table public.upload_targets enable row level security;

grant all on table public.upload_targets to service_role;
