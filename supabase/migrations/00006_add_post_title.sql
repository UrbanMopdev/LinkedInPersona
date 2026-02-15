-- Add title column to posts (currently title is derived from first line of content)
alter table public.posts
  add column if not exists title text;

-- Backfill existing posts: use first line of content as title
update public.posts
set title = split_part(content, E'\n', 1)
where title is null and content is not null;

-- Add index for calendar queries
create index if not exists idx_posts_publish_date on public.posts(user_id, status, scheduled_at);
create index if not exists idx_posts_published_at on public.posts(user_id, published_at);

-- Add index on post_analytics for quick lookups
create index if not exists idx_post_analytics_user_post on public.post_analytics(user_id, post_id);

-- Ensure weekly_reports has update policy
create policy "Users can update their own weekly reports"
  on public.weekly_reports for update
  using (auth.uid() = user_id);
