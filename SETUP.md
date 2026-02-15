# LinkedIn Persona — Setup Guide

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **Project Settings → API** and copy:
   - **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`)
   - **anon / public key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
3. In the **SQL Editor**, run the migrations in order:
   - `supabase/migrations/00001_initial_schema.sql`
   - `supabase/migrations/00002_add_voice_guide_and_linkedin_url.sql`
   - `supabase/migrations/00003_chat_and_vectors.sql` (enables pgvector, adds chat tables)
4. Under **Authentication → Providers**, make sure **Email** is enabled.
   Optionally disable "Confirm email" for faster local development.
5. Under **Authentication → URL Configuration**, add your production URL to
   **Site URL** and **Redirect URLs** (e.g. `https://your-app.vercel.app/**`).

## 2. Local development

```bash
cp .env.local.example .env.local
# Fill in the two Supabase values and your Anthropic API key
npm install
npm run dev
```

## 3. Vercel deployment

In the Vercel dashboard for the project, add these environment variables:

| Variable                         | Value                              |
|----------------------------------|------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`       | `https://<ref>.supabase.co`        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Your Supabase anon/public key      |
| `ANTHROPIC_API_KEY`              | Your Anthropic API key             |
| `VOYAGE_API_KEY`                 | Your Voyage AI API key (optional)  |

These are required for **all** environments (Production, Preview, Development).

### Steps

1. Go to **Vercel → your project → Settings → Environment Variables**.
2. Add each variable above.
3. Re-deploy (or push a new commit) for changes to take effect.
4. In Supabase, add your Vercel domain to **Authentication → URL Configuration → Redirect URLs**:
   - `https://your-app.vercel.app/**`

## 4. Database tables

The migration creates the following tables (all with RLS enabled):

| Table              | Purpose                                    |
|--------------------|--------------------------------------------|
| `profiles`         | User profile data (auto-created on signup) |
| `ideas`            | Content ideas / brainstorms                |
| `posts`            | LinkedIn post drafts and published posts   |
| `post_versions`    | Version history for post edits             |
| `post_analytics`   | Engagement metrics per post                |
| `weekly_reports`   | Aggregated weekly performance summaries    |
| `conversations`    | Chat conversation threads                  |
| `messages`         | Chat messages (user + assistant)           |
| `user_memory`      | User context/memories with vector embeddings |
| `linkedin_posts_archive` | Archived posts with vector embeddings |

Every table enforces RLS so that users can only read/write their own rows.

## 5. Voyage AI (optional, for vector search)

The chat system uses [Voyage AI](https://voyageai.com) for generating embeddings.
Without a `VOYAGE_API_KEY`, the chat still works but skips vector-based context retrieval.

1. Sign up at [dash.voyageai.com](https://dash.voyageai.com)
2. Create an API key
3. Add it to your `.env.local` as `VOYAGE_API_KEY`
