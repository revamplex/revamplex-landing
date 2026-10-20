-- Add opt-in community sharing without publishing existing projects.
-- Apply to the existing ReVampLEX database; existing jobs policies are retained.
begin;
alter table public.jobs
  add column if not exists share_activity boolean not null default false,
  add column if not exists activity_public boolean not null default false,
  add column if not exists public_showcase boolean not null default false,
  add column if not exists reveal_price boolean not null default false,
  add column if not exists price_visible boolean not null default false,
  add column if not exists heatmap_opt_in boolean not null default false,
  add column if not exists activity_photo_url text,
  add column if not exists contractor_used text;
create table if not exists public.community_reactions (
  job_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id,user_id)
);
create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  job_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Community member' check (length(display_name)<=100),
  body text not null check (length(trim(body)) between 1 and 1200),
  created_at timestamptz not null default now()
);
create index if not exists community_comments_job_created on public.community_comments(job_id,created_at);
alter table public.community_reactions enable row level security;
alter table public.community_comments enable row level security;
-- Policies also honor the existing jobs RLS; no security-definer access expansion.
create policy "Read reactions on shared jobs" on public.community_reactions for select using (
 exists(select 1 from public.jobs j where j.id::text=community_reactions.job_id and (to_jsonb(j)->>'share_activity'='true' or to_jsonb(j)->>'activity_public'='true' or to_jsonb(j)->>'public_showcase'='true'))
);
create policy "React as self to shared jobs" on public.community_reactions for insert with check (
 auth.uid()=user_id and exists(select 1 from public.jobs j where j.id::text=community_reactions.job_id and (to_jsonb(j)->>'share_activity'='true' or to_jsonb(j)->>'activity_public'='true' or to_jsonb(j)->>'public_showcase'='true'))
);
create policy "Remove own reactions" on public.community_reactions for delete using(auth.uid()=user_id);
create policy "Read comments on shared jobs" on public.community_comments for select using (
 exists(select 1 from public.jobs j where j.id::text=community_comments.job_id and (to_jsonb(j)->>'share_activity'='true' or to_jsonb(j)->>'activity_public'='true' or to_jsonb(j)->>'public_showcase'='true'))
);
create policy "Comment as self on shared jobs" on public.community_comments for insert with check (
 auth.uid()=user_id and exists(select 1 from public.jobs j where j.id::text=community_comments.job_id and (to_jsonb(j)->>'share_activity'='true' or to_jsonb(j)->>'activity_public'='true' or to_jsonb(j)->>'public_showcase'='true'))
);
create policy "Remove own comments" on public.community_comments for delete using(auth.uid()=user_id);
grant select on public.community_reactions, public.community_comments to anon;
grant select, insert, delete on public.community_reactions, public.community_comments to authenticated;
commit;
