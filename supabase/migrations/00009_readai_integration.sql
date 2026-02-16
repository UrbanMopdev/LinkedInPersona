-- ============================================================
-- Read.ai Integration: meetings, artifacts, themes, idea_sources
-- ============================================================

-- ============================================================
-- 1. readai_sync_state: per-user Read.ai connection config
-- ============================================================
create table public.readai_sync_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  api_key text not null,
  is_connected boolean default true,
  -- Scope / filters
  date_range_start date,
  date_range_end date,
  include_keywords text[] default '{}',
  exclude_keywords text[] default '{}',
  -- Privacy controls
  exclude_meeting_patterns text[] default '{}',
  redact_participant_names boolean default false,
  privacy_level text default 'standard' check (privacy_level in ('standard', 'redacted', 'minimal')),
  -- Sync state
  last_import_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  meetings_imported int default 0,
  artifacts_extracted int default 0,
  -- Timestamps
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(user_id)
);

alter table public.readai_sync_state enable row level security;

create policy "Users can view their own readai sync state"
  on public.readai_sync_state for select
  using (auth.uid() = user_id);

create policy "Users can insert their own readai sync state"
  on public.readai_sync_state for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own readai sync state"
  on public.readai_sync_state for update
  using (auth.uid() = user_id);

create policy "Users can delete their own readai sync state"
  on public.readai_sync_state for delete
  using (auth.uid() = user_id);

create index idx_readai_sync_state_user_id on public.readai_sync_state(user_id);

-- ============================================================
-- 2. meetings: ingested meeting data
-- ============================================================
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'read_ai',
  external_meeting_id text not null,
  title text not null,
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes int,
  participants jsonb default '[]'::jsonb,
  summary text,
  transcript text,
  key_points jsonb default '[]'::jsonb,
  action_items jsonb default '[]'::jsonb,
  sentiment text,
  source_url text,
  privacy_level text default 'standard' check (privacy_level in ('standard', 'redacted', 'minimal')),
  raw_data jsonb default '{}'::jsonb,
  processed boolean default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(user_id, external_meeting_id)
);

alter table public.meetings enable row level security;

create policy "Users can view their own meetings"
  on public.meetings for select
  using (auth.uid() = user_id);

create policy "Users can insert their own meetings"
  on public.meetings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own meetings"
  on public.meetings for update
  using (auth.uid() = user_id);

create policy "Users can delete their own meetings"
  on public.meetings for delete
  using (auth.uid() = user_id);

create index idx_meetings_user_id on public.meetings(user_id);
create index idx_meetings_external_id on public.meetings(user_id, external_meeting_id);
create index idx_meetings_start_time on public.meetings(user_id, start_time desc);
create index idx_meetings_processed on public.meetings(user_id, processed);

-- ============================================================
-- 3. meeting_artifacts: extracted structured items
-- ============================================================
create table public.meeting_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  type text not null check (type in (
    'decision', 'insight', 'story_moment', 'metric',
    'tension_tradeoff', 'quote', 'action_item', 'lesson', 'framework'
  )),
  content text not null,
  context text,
  theme text,
  pillar text,
  confidence float default 0.8,
  embedding extensions.vector(512),
  created_at timestamptz default now() not null
);

alter table public.meeting_artifacts enable row level security;

create policy "Users can view their own meeting artifacts"
  on public.meeting_artifacts for select
  using (auth.uid() = user_id);

create policy "Users can insert their own meeting artifacts"
  on public.meeting_artifacts for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own meeting artifacts"
  on public.meeting_artifacts for update
  using (auth.uid() = user_id);

create policy "Users can delete their own meeting artifacts"
  on public.meeting_artifacts for delete
  using (auth.uid() = user_id);

create index idx_meeting_artifacts_user_id on public.meeting_artifacts(user_id);
create index idx_meeting_artifacts_meeting_id on public.meeting_artifacts(meeting_id);
create index idx_meeting_artifacts_type on public.meeting_artifacts(user_id, type);
create index idx_meeting_artifacts_pillar on public.meeting_artifacts(user_id, pillar);

-- Vector similarity index for meeting artifacts
create index idx_meeting_artifacts_embedding on public.meeting_artifacts
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 10);

-- ============================================================
-- 4. themes: clustered theme groupings
-- ============================================================
create table public.themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  pillar text,
  confidence float default 0.5,
  artifact_count int default 0,
  meeting_count int default 0,
  sample_artifacts jsonb default '[]'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.themes enable row level security;

create policy "Users can view their own themes"
  on public.themes for select
  using (auth.uid() = user_id);

create policy "Users can insert their own themes"
  on public.themes for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own themes"
  on public.themes for update
  using (auth.uid() = user_id);

create policy "Users can delete their own themes"
  on public.themes for delete
  using (auth.uid() = user_id);

create index idx_themes_user_id on public.themes(user_id);
create index idx_themes_pillar on public.themes(user_id, pillar);

-- ============================================================
-- 5. idea_sources: links ideas/posts to meeting_artifacts
-- ============================================================
create table public.idea_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references public.ideas(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  artifact_id uuid not null references public.meeting_artifacts(id) on delete cascade,
  created_at timestamptz default now() not null,
  -- At least one of idea_id or post_id should be set
  constraint idea_or_post check (idea_id is not null or post_id is not null)
);

alter table public.idea_sources enable row level security;

create policy "Users can view their own idea sources"
  on public.idea_sources for select
  using (auth.uid() = user_id);

create policy "Users can insert their own idea sources"
  on public.idea_sources for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own idea sources"
  on public.idea_sources for delete
  using (auth.uid() = user_id);

create index idx_idea_sources_idea on public.idea_sources(idea_id);
create index idx_idea_sources_post on public.idea_sources(post_id);
create index idx_idea_sources_artifact on public.idea_sources(artifact_id);

-- ============================================================
-- 6. Similarity search function for meeting artifacts
-- ============================================================
create or replace function public.match_meeting_artifacts(
  query_embedding extensions.vector(512),
  match_user_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  meeting_id uuid,
  type text,
  content text,
  context text,
  theme text,
  pillar text,
  meeting_title text,
  meeting_start_time timestamptz,
  similarity float
)
language plpgsql
security definer set search_path = ''
as $$
begin
  return query
  select
    ma.id,
    ma.meeting_id,
    ma.type,
    ma.content,
    ma.context,
    ma.theme,
    ma.pillar,
    m.title as meeting_title,
    m.start_time as meeting_start_time,
    1 - (ma.embedding <=> query_embedding) as similarity
  from public.meeting_artifacts ma
  join public.meetings m on m.id = ma.meeting_id
  where ma.user_id = match_user_id
    and ma.embedding is not null
  order by ma.embedding <=> query_embedding
  limit match_count;
end;
$$;
