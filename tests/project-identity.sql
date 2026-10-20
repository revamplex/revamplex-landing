-- Fixture writes are rolled back. Existing account IDs are used only to simulate
-- authorization; no accounts, profile rows, emails, or real notifications are created.
begin;
set local statement_timeout = '30s';
do $test$
declare
  owner_id uuid;
  other_id uuid;
  fixture_job bigint := -2000000000000 - floor(random()*1000000)::bigint;
  room_id uuid;
  denied boolean;
  changed integer;
begin
  select id into owner_id from auth.users order by id limit 1;
  select id into other_id from auth.users order by id offset 1 limit 1;
  if owner_id is null or other_id is null then raise exception 'Two existing accounts are required'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  insert into public.jobs(id,user_id,title,trade,lat,lng,is_live,is_demo)
    overriding system value values(fixture_job,owner_id,'rx_identity_probe_20261020','Test',0,0,false,true);
  denied := false;
  begin
    insert into public.jobs(id,user_id,title,trade,lat,lng,is_live,is_demo)
      overriding system value values(fixture_job-1,other_id,'rx_identity_probe_20261020','Test',0,0,false,true);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Posting under another account was allowed'; end if;

  insert into public.project_rooms(job_id,homeowner_id,contractor_id)
    values(fixture_job,owner_id,other_id) returning id into room_id;
  update public.project_rooms set status='active' where id=room_id;
  get diagnostics changed = row_count;
  if changed<>1 then raise exception 'Member status update failed'; end if;
  denied := false;
  begin update public.project_rooms set contractor_id=owner_id where id=room_id;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Participant identity could be replaced'; end if;
  denied := false;
  begin update public.project_rooms set job_id=fixture_job+1 where id=room_id;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Room could be moved to another project'; end if;
  denied := false;
  begin
    insert into public.project_rooms(job_id,homeowner_id,contractor_id) values(fixture_job,other_id,owner_id);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Room creation with a different job owner was allowed'; end if;
  denied := false;
  begin
    insert into public.project_rooms(job_id,homeowner_id,contractor_id) values(fixture_job,owner_id,gen_random_uuid());
  exception when foreign_key_violation then denied := true; end;
  if not denied then raise exception 'A room accepted a nonexistent participant account'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  insert into public.project_rooms(job_id,homeowner_id,contractor_id) values(fixture_job,owner_id,other_id);
  if not exists(select 1 from public.project_rooms where id=room_id) then raise exception 'Contractor could not read the shared room'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  denied := false;
  begin
    insert into public.jobs(id,user_id,title,trade,lat,lng,is_live,is_demo)
      overriding system value values(fixture_job-2,owner_id,'rx_identity_probe_20261020','Test',0,0,false,true);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Anonymous posting under a registered account was allowed'; end if;
  if exists(select 1 from public.project_rooms where id=room_id) then raise exception 'Private room was publicly readable'; end if;
  execute 'reset role';
end;
$test$;
rollback;
select 'Project identity checks passed; fixture writes rolled back.' as result,
       (select count(*) from public.jobs where title='rx_identity_probe_20261020') as remaining_fixtures;
