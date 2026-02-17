-- ============================================================
-- Read.ai Webhook Support: switch from REST polling to webhooks
-- ============================================================

-- Add webhook_secret column for authenticating incoming webhooks
alter table public.readai_sync_state
  add column if not exists webhook_secret text;

-- Make api_key nullable (no longer required for webhook-based flow)
alter table public.readai_sync_state
  alter column api_key drop not null;

-- Index for fast webhook token lookup
create index if not exists idx_readai_sync_state_webhook_secret
  on public.readai_sync_state(webhook_secret);

-- Allow service-role inserts into meetings table (for webhook handler)
-- The webhook endpoint uses the admin client since it's not user-authenticated
create policy "Service role can insert meetings"
  on public.meetings for insert
  with check (true);
