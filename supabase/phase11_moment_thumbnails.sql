-- Phase 11: durable Moment thumbnails.
--
-- Purpose:
-- - Store app-generated thumbnail images separately from source videos.
-- - Keep source videos private analysis inputs.
-- - Reuse public.moments.thumbnail_uri for a storage reference:
--   supabase://moment-thumbnails/users/{userId}/thumbnails/{uploadId}/thumbnail.jpg
-- - /api/moments resolves that storage reference to a signed URL for Home/Video.
--
-- Run manually in the Supabase SQL editor before relying on durable thumbnail
-- persistence in preview/internal builds.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'moment-thumbnails',
  'moment-thumbnails',
  false,
  2097152,
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
