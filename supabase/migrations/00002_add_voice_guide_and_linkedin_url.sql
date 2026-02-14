-- Add voice_guide column to profiles for AI voice conditioning
alter table public.profiles add column voice_guide text;

-- Add linkedin_url column to posts for tracking published post URLs
alter table public.posts add column linkedin_url text;
