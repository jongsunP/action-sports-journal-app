-- Phase 1 service-role grants repair script.
-- Run this in the Supabase SQL editor if the tables exist but the smoke test
-- reports "permission denied for table ...".

grant usage on schema public to service_role;

grant all on table public.users to service_role;
grant all on table public.moments to service_role;
grant all on table public.analysis_jobs to service_role;
grant all on table public.evidence_results to service_role;
