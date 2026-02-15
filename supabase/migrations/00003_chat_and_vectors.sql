-- ============================================================
-- Enable pgvector
-- ============================================================
create extension if not exists vector with schema extensions;

-- ============================================================
-- 1. conversations
-- ============================================================
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.conversations enable row level security;

create policy "Users can view their own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert their own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own conversations"
  on public.conversations for update
  using (auth.uid() = user_id);

create policy "Users can delete their own conversations"
  on public.conversations for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 2. messages
-- ============================================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now() not null
);

alter table public.messages enable row level security;

create policy "Users can view their own messages"
  on public.messages for select
  using (auth.uid() = user_id);

create policy "Users can insert their own messages"
  on public.messages for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- 3. user_memory
-- ============================================================
create table public.user_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  category text,
  embedding extensions.vector(512),
  created_at timestamptz default now() not null
);

alter table public.user_memory enable row level security;

create policy "Users can view their own memory"
  on public.user_memory for select
  using (auth.uid() = user_id);

create policy "Users can insert their own memory"
  on public.user_memory for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own memory"
  on public.user_memory for update
  using (auth.uid() = user_id);

create policy "Users can delete their own memory"
  on public.user_memory for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 4. linkedin_posts_archive
-- ============================================================
create table public.linkedin_posts_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  posted_at timestamptz,
  linkedin_url text,
  embedding extensions.vector(512),
  created_at timestamptz default now() not null
);

alter table public.linkedin_posts_archive enable row level security;

create policy "Users can view their own archive"
  on public.linkedin_posts_archive for select
  using (auth.uid() = user_id);

create policy "Users can insert their own archive"
  on public.linkedin_posts_archive for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own archive"
  on public.linkedin_posts_archive for update
  using (auth.uid() = user_id);

create policy "Users can delete their own archive"
  on public.linkedin_posts_archive for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Indexes
-- ============================================================
create index idx_conversations_user_id on public.conversations(user_id);
create index idx_messages_conversation_id on public.messages(conversation_id);
create index idx_messages_user_id on public.messages(user_id);
create index idx_user_memory_user_id on public.user_memory(user_id);
create index idx_linkedin_posts_archive_user_id on public.linkedin_posts_archive(user_id);

-- Vector similarity indexes (IVFFlat for performance)
create index idx_user_memory_embedding on public.user_memory
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 10);

create index idx_linkedin_posts_archive_embedding on public.linkedin_posts_archive
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 10);

-- ============================================================
-- Similarity search functions
-- ============================================================

-- Match user_memory rows by embedding similarity
create or replace function public.match_user_memory(
  query_embedding extensions.vector(512),
  match_user_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  category text,
  similarity float
)
language plpgsql
security definer set search_path = ''
as $$
begin
  return query
  select
    um.id,
    um.content,
    um.category,
    1 - (um.embedding <=> query_embedding) as similarity
  from public.user_memory um
  where um.user_id = match_user_id
    and um.embedding is not null
  order by um.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Match linkedin_posts_archive rows by embedding similarity
create or replace function public.match_linkedin_posts(
  query_embedding extensions.vector(512),
  match_user_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  posted_at timestamptz,
  linkedin_url text,
  similarity float
)
language plpgsql
security definer set search_path = ''
as $$
begin
  return query
  select
    lpa.id,
    lpa.content,
    lpa.posted_at,
    lpa.linkedin_url,
    1 - (lpa.embedding <=> query_embedding) as similarity
  from public.linkedin_posts_archive lpa
  where lpa.user_id = match_user_id
    and lpa.embedding is not null
  order by lpa.embedding <=> query_embedding
  limit match_count;
end;
$$;
