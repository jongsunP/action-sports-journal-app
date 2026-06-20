-- Phase 8: storage-backed analysis draft.
-- Purpose:
-- - Add nullable storage reference fields for durable video analysis.
-- - Keep all existing legacy Moment and AnalysisJob rows valid.
-- - Prepare, but do not require, Supabase Storage-backed worker processing.
--
-- This file is a draft until explicitly applied in the Supabase SQL editor.

alter table public.moments
  add column if not exists source_video_storage_provider text,
  add column if not exists source_video_storage_bucket text,
  add column if not exists source_video_storage_path text,
  add column if not exists source_video_storage_uploaded_at timestamptz,
  add column if not exists source_video_storage_status text;

alter table public.analysis_jobs
  add column if not exists input_video_storage_provider text,
  add column if not exists input_video_storage_bucket text,
  add column if not exists input_video_storage_path text;

create index if not exists moments_source_video_storage_path_idx
  on public.moments (source_video_storage_bucket, source_video_storage_path)
  where source_video_storage_path is not null;

create index if not exists analysis_jobs_input_video_storage_path_idx
  on public.analysis_jobs (input_video_storage_bucket, input_video_storage_path)
  where input_video_storage_path is not null;

-- Optional bucket setup for the MVP source-video bucket.
-- Supabase Storage buckets can be created through Dashboard, client libraries,
-- or SQL. This idempotent insert keeps the bucket private.
--
-- Current product max video size is 20 MB, so this draft sets the bucket limit
-- to 20 MiB. Increase this intentionally if MAX_VIDEO_MB changes.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'moment-videos',
  'moment-videos',
  false,
  20971520,
  array[
    'video/mp4',
    'video/quicktime',
    'video/mov',
    'video/x-m4v'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
