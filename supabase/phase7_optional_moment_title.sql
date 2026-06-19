-- Phase 7: make moment titles optional.
-- Moment identity comes from id/session_id/created_at/video metadata.
-- Title is now a user-editable label, not a required upload field.

alter table public.moments
  alter column title drop not null;
