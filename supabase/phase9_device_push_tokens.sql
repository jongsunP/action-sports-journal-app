-- Phase 9: device push token registry for analysis completion notifications.
--
-- Run manually in the Supabase SQL editor after phase 8.
-- This table is intentionally separate from Auth because the product still uses
-- the standalone default user flow.

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text,
  device_id text,
  app_version text,
  enabled boolean not null default true,
  last_registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_enabled_idx
  on public.device_push_tokens (user_id, enabled);

alter table public.device_push_tokens enable row level security;

grant all on table public.device_push_tokens to service_role;
