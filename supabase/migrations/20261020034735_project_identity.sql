-- Protect the identity assumptions used by authenticated project notifications.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create function public.guard_project_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  project_owner uuid;
begin
  if current_user not in ('anon','authenticated') then return new; end if;
  if actor is null then
    raise exception 'Sign in before creating a project or Project Room.' using errcode = '42501';
  end if;
  if tg_table_name = 'jobs' then
    if new.user_id is distinct from actor then
      raise exception 'Projects must be created under your own account.' using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if row(new.id,new.job_id,new.homeowner_id,new.contractor_id)
      is distinct from row(old.id,old.job_id,old.homeowner_id,old.contractor_id) then
      raise exception 'Project Room participants cannot be replaced from the client.' using errcode = '42501';
    end if;
    return new;
  end if;
  select j.user_id into project_owner from public.jobs j where j.id=new.job_id;
  if project_owner is null or new.homeowner_id is distinct from project_owner then
    raise exception 'The Project Room must belong to the project owner.' using errcode = '42501';
  end if;
  if actor is distinct from new.homeowner_id and actor is distinct from new.contractor_id then
    raise exception 'Only project participants can create this Project Room.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_project_identity() from public, anon, authenticated;
create trigger guard_project_identity before insert on public.jobs
for each row execute function public.guard_project_identity();
create trigger guard_project_identity before insert or update on public.project_rooms
for each row execute function public.guard_project_identity();
-- Existing legacy rooms are retained. New or changed participant IDs must
-- reference real Auth accounts; existing rows are not rewritten or deleted.
alter table public.project_rooms add constraint project_rooms_homeowner_auth_fk
  foreign key(homeowner_id) references auth.users(id) on delete set null not valid;
alter table public.project_rooms add constraint project_rooms_contractor_auth_fk
  foreign key(contractor_id) references auth.users(id) on delete set null not valid;
create index if not exists project_rooms_homeowner_identity on public.project_rooms(homeowner_id);
create index if not exists project_rooms_contractor_identity on public.project_rooms(contractor_id);
notify pgrst, 'reload schema';
commit;
