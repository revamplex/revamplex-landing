-- Run with the existing project's administrative SQL connection.
-- Uses two existing user IDs without reading their personal details. All fixture
-- jobs, reactions, and comments are rolled back; no accounts or emails are created.
begin;
set local statement_timeout = '30s';
do $test$
declare
  owner_id uuid;
  other_id uuid;
  shared_job bigint := -1000000000000 - floor(random()*1000000)::bigint;
  private_job bigint := shared_job - 1;
  owner_comment uuid;
  own_comment uuid;
  denied boolean;
  changed integer;
begin
  select id into owner_id from auth.users order by id limit 1;
  select id into other_id from auth.users order by id offset 1 limit 1;
  if owner_id is null or other_id is null then raise exception 'Two existing accounts are required for the permission check'; end if;

  insert into public.jobs(id,user_id,title,trade,lat,lng,is_live,is_demo)
  overriding system value values
    (shared_job,owner_id,'rx_permission_probe_20261020','Test',0,0,false,true),
    (private_job,owner_id,'rx_permission_probe_20261020','Test',0,0,false,true);
  if exists(select 1 from public.jobs where id in (shared_job,private_job) and (share_activity or activity_public or public_showcase)) then
    raise exception 'New projects must be unshared by default';
  end if;
  -- Legacy rows on a private project must remain unreadable through the new policies.
  insert into public.community_comments(job_id,user_id,body) values(private_job,owner_id,'Rollback verification');
  insert into public.community_reactions(job_id,user_id) values(private_job,owner_id);

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  update public.jobs set share_activity=true where id=shared_job;
  if not exists(select 1 from public.jobs where id=shared_job and share_activity) then raise exception 'Owner could not opt in'; end if;
  insert into public.community_reactions(job_id,user_id) values(shared_job,owner_id);
  insert into public.community_comments(job_id,user_id,body) values(shared_job,owner_id,'Rollback verification') returning id into owner_comment;

  denied := false;
  begin
    insert into public.community_comments(job_id,user_id,body) values(shared_job,other_id,'Spoofed author');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Comment author spoofing was allowed'; end if;
  denied := false;
  begin
    insert into public.community_reactions(job_id,user_id) values(shared_job,other_id);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Reaction author spoofing was allowed'; end if;
  denied := false;
  begin
    insert into public.community_comments(job_id,user_id,body) values(private_job,owner_id,'Private project comment');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Commenting on an unshared project was allowed'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  denied := false;
  begin update public.jobs set share_activity=true where id=private_job;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Another user could change sharing consent'; end if;
  denied := false;
  begin update public.jobs set user_id=other_id where id=private_job;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Another user could take project ownership'; end if;
  denied := false;
  begin update public.jobs set title='Changed by another user' where id=shared_job;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Another user could alter a shared story'; end if;
  denied := false;
  begin
    insert into public.jobs(id,user_id,title,trade,lat,lng,share_activity)
    overriding system value values(shared_job-2,owner_id,'rx_permission_probe_20261020','Test',0,0,true);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Another user could create shared content under a different owner'; end if;

  insert into public.community_comments(job_id,user_id,body) values(shared_job,other_id,'Rollback verification') returning id into own_comment;
  insert into public.community_reactions(job_id,user_id) values(shared_job,other_id);
  delete from public.community_comments where id=owner_comment;
  get diagnostics changed = row_count;
  if changed<>0 then raise exception 'Another author comment could be deleted'; end if;
  delete from public.community_reactions where job_id=shared_job and user_id=owner_id;
  get diagnostics changed = row_count;
  if changed<>0 then raise exception 'Another author reaction could be deleted'; end if;
  delete from public.community_comments where id=own_comment;
  get diagnostics changed = row_count;
  if changed<>1 then raise exception 'Own comment could not be removed'; end if;
  delete from public.community_reactions where job_id=shared_job and user_id=other_id;
  get diagnostics changed = row_count;
  if changed<>1 then raise exception 'Own reaction could not be removed'; end if;
  -- Existing contractor status updates remain compatible with the consent guard.
  update public.jobs set contractor_completed=true where id=shared_job;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  if (select count(*) from public.community_comments where job_id=shared_job)<>1 then raise exception 'Shared comments were not publicly readable'; end if;
  if (select count(*) from public.community_reactions where job_id=shared_job)<>1 then raise exception 'Shared reactions were not publicly readable'; end if;
  if exists(select 1 from public.community_comments where job_id=private_job) or exists(select 1 from public.community_reactions where job_id=private_job) then
    raise exception 'Private project activity was publicly readable';
  end if;
  denied := false;
  begin update public.jobs set share_activity=false where id=shared_job;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Anonymous sharing changes were allowed'; end if;
  denied := false;
  begin insert into public.community_comments(job_id,user_id,body) values(shared_job,owner_id,'Anonymous comment');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Anonymous comments were allowed'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  update public.jobs set share_activity=false where id=shared_job;
  if exists(select 1 from public.community_comments where job_id=shared_job) or exists(select 1 from public.community_reactions where job_id=shared_job) then
    raise exception 'Withdrawing sharing consent did not hide activity';
  end if;
  execute 'reset role';
end;
$test$;
rollback;
select 'Community permission checks passed; fixture writes rolled back.' as result,
       (select count(*) from public.jobs where title='rx_permission_probe_20261020') as remaining_fixtures;
