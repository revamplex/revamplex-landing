-- Add opt-in community sharing without publishing existing projects.
-- Existing job workflows are retained; sharing choices and shared content are owner-controlled.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
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
  job_id bigint not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id,user_id)
);
create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  job_id bigint not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Community member' check (length(display_name)<=100),
  body text not null check (length(trim(body)) between 1 and 1200),
  created_at timestamptz not null default now()
);
create index if not exists community_comments_job_created on public.community_comments(job_id,created_at);
create index if not exists community_comments_user on public.community_comments(user_id);
create index if not exists community_reactions_user on public.community_reactions(user_id);
alter table public.community_reactions enable row level security;
alter table public.community_comments enable row level security;
-- Policies also honor the existing jobs RLS; no security-definer access expansion.
create policy "Read reactions on shared jobs" on public.community_reactions for select to anon, authenticated using (
 exists(select 1 from public.jobs j where j.id=community_reactions.job_id and (j.share_activity or j.activity_public or j.public_showcase))
);
create policy "React as self to shared jobs" on public.community_reactions for insert to authenticated with check (
 (select auth.uid())=user_id and exists(select 1 from public.jobs j where j.id=community_reactions.job_id and (j.share_activity or j.activity_public or j.public_showcase))
);
create policy "Remove own reactions" on public.community_reactions for delete to authenticated using((select auth.uid())=user_id);
create policy "Read comments on shared jobs" on public.community_comments for select to anon, authenticated using (
 exists(select 1 from public.jobs j where j.id=community_comments.job_id and (j.share_activity or j.activity_public or j.public_showcase))
);
create policy "Comment as self on shared jobs" on public.community_comments for insert to authenticated with check (
 (select auth.uid())=user_id and exists(select 1 from public.jobs j where j.id=community_comments.job_id and (j.share_activity or j.activity_public or j.public_showcase))
);
create policy "Remove own comments" on public.community_comments for delete to authenticated using((select auth.uid())=user_id);
-- Override broad default grants for the new tables. RLS and explicit privileges both apply.
revoke all on public.community_reactions, public.community_comments from public, anon, authenticated;
grant select on public.community_reactions, public.community_comments to anon;
grant select, insert, delete on public.community_reactions, public.community_comments to authenticated;

-- The existing jobs UPDATE policy is permissive. Guard consent independently so
-- it cannot be changed by another user, or bypassed by changing job ownership.
-- Signature/completion updates retain their existing behavior.
create function public.guard_job_community_consent() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  consent_changed boolean;
  story_changed boolean;
begin
  if current_user not in ('anon','authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    if (new.share_activity or new.activity_public or new.public_showcase or new.reveal_price or new.price_visible or new.heatmap_opt_in)
      and (actor is null or actor is distinct from new.user_id) then
      raise exception 'Only the project owner can choose sharing settings.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'Project ownership cannot be changed from the client.' using errcode = '42501';
  end if;
  consent_changed := row(new.share_activity,new.activity_public,new.public_showcase,new.reveal_price,new.price_visible,new.heatmap_opt_in,new.activity_photo_url,new.contractor_used)
    is distinct from row(old.share_activity,old.activity_public,old.public_showcase,old.reveal_price,old.price_visible,old.heatmap_opt_in,old.activity_photo_url,old.contractor_used);
  story_changed := (old.share_activity or old.activity_public or old.public_showcase or new.share_activity or new.activity_public or new.public_showcase)
    and row(new.title,new.trade,new.city,new.budget,new.description)
    is distinct from row(old.title,old.trade,old.city,old.budget,old.description);
  if (consent_changed or story_changed) and (actor is null or actor is distinct from old.user_id) then
    raise exception 'Only the project owner can change shared project details.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_job_community_consent() from public, anon, authenticated;
create trigger guard_job_community_consent before insert or update on public.jobs
for each row execute function public.guard_job_community_consent();
notify pgrst, 'reload schema';
commit;
