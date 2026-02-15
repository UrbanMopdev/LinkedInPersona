-- ============================================================
-- Extended Notion properties: platform, post_type, target_icp
-- Matches Notion database columns for full two-way sync
-- ============================================================

-- New columns for Notion-synced properties
alter table public.posts
  add column if not exists platform text default 'LinkedIn',
  add column if not exists post_type text,
  add column if not exists target_icp text;

-- Index for filtering by platform and post type
create index if not exists idx_posts_platform on public.posts(user_id, platform);
create index if not exists idx_posts_post_type on public.posts(user_id, post_type);
create index if not exists idx_posts_target_icp on public.posts(user_id, target_icp);

-- Update default property map in notion_sync_state to include new fields
-- (Existing users keep their current map; this affects the column default only)
alter table public.notion_sync_state
  alter column property_map set default '{
    "title": "Post Title",
    "status": "Status",
    "publish_date": "Post Publish Date",
    "pillar": "Pillar",
    "platform": "Platform",
    "post_type": "Post Type",
    "target_icp": "Target ICP",
    "content": "Draft/Copy",
    "linkedin_url": "Link",
    "tags": "Tags",
    "notes": "Signal Notes",
    "impressions": "Impressions",
    "likes": "Likes",
    "comments": "Comments"
  }'::jsonb;
