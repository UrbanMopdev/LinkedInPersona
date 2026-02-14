-- ============================================================
-- 1. profiles
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  linkedin_handle text,
  avatar_url text,
  timezone text default 'UTC',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ============================================================
-- 2. ideas
-- ============================================================
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  status text default 'draft' check (status in ('draft', 'ready', 'published', 'archived')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.ideas enable row level security;

create policy "Users can view their own ideas"
  on public.ideas for select
  using (auth.uid() = user_id);

create policy "Users can insert their own ideas"
  on public.ideas for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own ideas"
  on public.ideas for update
  using (auth.uid() = user_id);

create policy "Users can delete their own ideas"
  on public.ideas for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 3. posts
-- ============================================================
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid references public.ideas(id) on delete set null,
  content text not null,
  status text default 'draft' check (status in ('draft', 'scheduled', 'published')),
  scheduled_at timestamptz,
  published_at timestamptz,
  linkedin_post_id text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.posts enable row level security;

create policy "Users can view their own posts"
  on public.posts for select
  using (auth.uid() = user_id);

create policy "Users can insert their own posts"
  on public.posts for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own posts"
  on public.posts for update
  using (auth.uid() = user_id);

create policy "Users can delete their own posts"
  on public.posts for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 4. post_versions
-- ============================================================
create table public.post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  version_number int not null default 1,
  created_at timestamptz default now() not null
);

alter table public.post_versions enable row level security;

create policy "Users can view their own post versions"
  on public.post_versions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own post versions"
  on public.post_versions for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- 5. post_analytics
-- ============================================================
create table public.post_analytics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  impressions int default 0,
  likes int default 0,
  comments int default 0,
  shares int default 0,
  clicks int default 0,
  fetched_at timestamptz default now() not null
);

alter table public.post_analytics enable row level security;

create policy "Users can view their own post analytics"
  on public.post_analytics for select
  using (auth.uid() = user_id);

create policy "Users can insert their own post analytics"
  on public.post_analytics for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own post analytics"
  on public.post_analytics for update
  using (auth.uid() = user_id);

-- ============================================================
-- 6. weekly_reports
-- ============================================================
create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  total_impressions int default 0,
  total_likes int default 0,
  total_comments int default 0,
  total_shares int default 0,
  posts_published int default 0,
  summary text,
  created_at timestamptz default now() not null
);

alter table public.weekly_reports enable row level security;

create policy "Users can view their own weekly reports"
  on public.weekly_reports for select
  using (auth.uid() = user_id);

create policy "Users can insert their own weekly reports"
  on public.weekly_reports for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- Trigger: auto-create profile on sign-up
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Indexes
-- ============================================================
create index idx_ideas_user_id on public.ideas(user_id);
create index idx_posts_user_id on public.posts(user_id);
create index idx_posts_idea_id on public.posts(idea_id);
create index idx_post_versions_post_id on public.post_versions(post_id);
create index idx_post_analytics_post_id on public.post_analytics(post_id);
create index idx_weekly_reports_user_id on public.weekly_reports(user_id);
create index idx_weekly_reports_week on public.weekly_reports(user_id, week_start);
