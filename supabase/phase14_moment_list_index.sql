-- Keeps summary-first moment lists stable and fast when multiple moments share a timestamp.
create index if not exists moments_user_occurred_at_id_idx
  on public.moments (user_id, occurred_at desc, id desc);
