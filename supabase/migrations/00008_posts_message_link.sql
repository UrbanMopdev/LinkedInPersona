-- ============================================================
-- Link posts to the chat message that created them
-- ============================================================
alter table public.posts
  add column if not exists message_id uuid references public.messages(id) on delete set null;

create index idx_posts_message_id on public.posts(message_id);
