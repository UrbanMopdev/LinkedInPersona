-- ============================================================
-- Notion Sync: Add fields to posts table
-- ============================================================

-- Add Notion sync fields to existing posts table
alter table public.posts
  add column notion_page_id text unique,
  add column notion_last_synced_at timestamptz,
  add column notion_last_seen_edit_time timestamptz,
  add column sync_status text default 'synced' check (sync_status in ('synced', 'pending', 'conflict', 'error')),
  add column source_of_truth text default 'app' check (source_of_truth in ('notion', 'app', 'hybrid'));

-- Add linkedin_url if it doesn't exist (already exists from earlier migration)
-- alter table public.posts add column if not exists linkedin_url text;

-- Additional content fields that map to common Notion properties
alter table public.posts
  add column pillar text,
  add column tags text[] default '{}',
  add column notes text;

create index idx_posts_notion_page_id on public.posts(notion_page_id);
create index idx_posts_sync_status on public.posts(user_id, sync_status);

-- ============================================================
-- notion_sync_state: per-user Notion connection config
-- ============================================================
create table public.notion_sync_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notion_access_token text not null,
  notion_database_id text,
  notion_workspace_name text,
  notion_bot_id text,
  property_map jsonb default '{
    "title": "Name",
    "status": "Status",
    "publish_date": "Publish Date",
    "pillar": "Pillar",
    "content": "Draft/Copy",
    "linkedin_url": "LinkedIn URL",
    "tags": "Tags",
    "notes": "Notes",
    "impressions": "Impressions",
    "likes": "Likes",
    "comments": "Comments"
  }'::jsonb,
  auto_create_in_notion boolean default false,
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  sync_cursor text,
  last_error text,
  is_connected boolean default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(user_id)
);

alter table public.notion_sync_state enable row level security;

create policy "Users can view their own notion sync state"
  on public.notion_sync_state for select
  using (auth.uid() = user_id);

create policy "Users can insert their own notion sync state"
  on public.notion_sync_state for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own notion sync state"
  on public.notion_sync_state for update
  using (auth.uid() = user_id);

create policy "Users can delete their own notion sync state"
  on public.notion_sync_state for delete
  using (auth.uid() = user_id);

create index idx_notion_sync_state_user_id on public.notion_sync_state(user_id);

-- ============================================================
-- sync_events: log all sync operations
-- ============================================================
create table public.sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'full_sync', 'incremental_notion_to_app', 'incremental_app_to_notion',
    'push_single', 'conflict_detected', 'conflict_resolved', 'connect', 'disconnect', 'error'
  )),
  direction text check (direction in ('notion_to_app', 'app_to_notion', 'both')),
  pages_processed int default 0,
  pages_created int default 0,
  pages_updated int default 0,
  pages_skipped int default 0,
  conflicts_found int default 0,
  error_message text,
  metadata jsonb default '{}'::jsonb,
  started_at timestamptz default now() not null,
  completed_at timestamptz,
  created_at timestamptz default now() not null
);

alter table public.sync_events enable row level security;

create policy "Users can view their own sync events"
  on public.sync_events for select
  using (auth.uid() = user_id);

create policy "Users can insert their own sync events"
  on public.sync_events for insert
  with check (auth.uid() = user_id);

create index idx_sync_events_user_id on public.sync_events(user_id);
create index idx_sync_events_type on public.sync_events(user_id, event_type);

-- ============================================================
-- sync_locks: prevent concurrent syncs per user
-- ============================================================
create table public.sync_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locked_at timestamptz default now() not null,
  expires_at timestamptz default (now() + interval '5 minutes') not null
);

alter table public.sync_locks enable row level security;

create policy "Users can manage their own sync locks"
  on public.sync_locks for all
  using (auth.uid() = user_id);
