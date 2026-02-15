-- ============================================================
-- Add LinkedIn import profile fields
-- ============================================================
alter table public.profiles
  add column if not exists linkedin_profile_url text,
  add column if not exists linkedin_headline text,
  add column if not exists linkedin_about text,
  add column if not exists linkedin_experience jsonb default '[]'::jsonb,
  add column if not exists positioning_summary text,
  add column if not exists voice_fingerprint text,
  add column if not exists linkedin_last_imported_at timestamptz;
