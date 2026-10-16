\set ON_ERROR_STOP on
begin;
create function pg_temp.expect_error(p_sql text,p_error text) returns void language plpgsql as $$
declare caught boolean := false;
begin
  begin execute p_sql;
  exception when others then
    if position(p_error in sqlerrm)=0 then raise exception 'Expected %, got %',p_error,sqlerrm; end if;
    caught := true;
  end;
  assert caught,'Expected query to fail: ' || p_sql;
end;
$$;

do $$
declare
  u uuid := gen_random_uuid(); other_user uuid := gen_random_uuid(); r uuid; old_run uuid;
  d jsonb; receipt jsonb; i integer; t uuid; tr uuid; m text;
begin
  assert (select count(*)=40 from private.ranked_scores), 'Legacy records were destroyed';
  assert (select count(*)=0 from public.get_leaderboard('softcore')), 'Legacy points must not be labelled verified';
  select id into old_run from private.ranked_runs limit 1;
  assert not has_function_privilege('anon','public.get_leaderboard(text)','EXECUTE');
  assert not has_function_privilege('authenticated','public.get_leaderboard(text)','EXECUTE');
  assert not has_function_privilege('service_role','public.submit_ranked_run(uuid,uuid,text,bigint,integer,text)','EXECUTE');
  for m in select unnest(array['anon','authenticated']) loop
    assert not has_schema_privilege(m,'private','USAGE');
    assert not has_function_privilege(m,'public.ranking_attempt(uuid,text,text)','EXECUTE');
    assert not has_function_privilege(m,'public.inspect_ranked_run(uuid,uuid,text,text)','EXECUTE');
    assert not has_function_privilege(m,'public.finalize_verified_run(uuid,uuid,text,bigint,integer,text,text,text,integer,integer)','EXECUTE');
    assert not has_function_privilege(m,'public.start_ranked_run(uuid,text,text)','EXECUTE');
    assert not has_table_privilege(m,'private.ranked_verified_scores','INSERT');
  end loop;
  insert into auth.users(id) values(u),(other_user);
  d := public.start_ranked_run(u,'softcore',repeat('7',64)); r := (d->>'id')::uuid;
  assert d->>'seed' ~ '^[a-f0-9]{32}$'; assert d->>'rulesVersion' = 'sabo-replay-v1';
  assert public.inspect_ranked_run(other_user,r,'PLAYER',repeat('a',64))->>'error' = 'run_not_found';
  assert public.inspect_ranked_run(u,r,'PLAYER',repeat('a',64))->>'seed' = d->>'seed';
  perform pg_temp.expect_error(format('select public.submit_ranked_run(%L,%L,''PLAYER'',100,1,''softcore'')',u,r),'verification_required');
  perform pg_temp.expect_error(format('select public.finalize_verified_run(%L,%L,''PLAYER'',100,1,''softcore'',''old'',%L,1,0)',u,r,repeat('a',64)),'invalid_score');
  perform pg_temp.expect_error(format('select public.finalize_verified_run(%L,%L,''PLAYER'',100,1,''softcore'',''sabo-replay-v1'',%L,90000,0)',u,r,repeat('a',64)),'replay_too_fast');
  perform pg_temp.expect_error(format('select public.finalize_verified_run(%L,%L,''PLAYER'',100,1,''softcore'',''sabo-replay-v1'',%L,1,0)',other_user,r,repeat('a',64)),'run_not_found');
  perform pg_temp.expect_error(format('select public.finalize_verified_run(%L,%L,''PLAYER'',100,11,''hardcore'',''sabo-replay-v1'',%L,1,0)',u,r,repeat('a',64)),'mode_mismatch');
  receipt := public.finalize_verified_run(u,r,'PLAYER',100,1,'softcore','sabo-replay-v1',repeat('a',64),1,0);
  assert receipt = '{"accepted":true,"inTop":true}'::jsonb;
  update private.ranked_runs set expires_at=now()-interval '1 second' where id=r;
  assert public.finalize_verified_run(u,r,'PLAYER',100,1,'softcore','sabo-replay-v1',repeat('a',64),1,0) = receipt;
  assert public.inspect_ranked_run(u,r,'PLAYER',repeat('a',64))->'receipt' = receipt;
  assert public.inspect_ranked_run(u,r,'PLAYER',repeat('b',64))->>'error' = 'run_already_submitted';
  perform pg_temp.expect_error(format('select public.finalize_verified_run(%L,%L,''PLAYER'',101,1,''softcore'',''sabo-replay-v1'',%L,1,0)',u,r,repeat('a',64)),'run_already_submitted');
  r := (public.start_ranked_run(u,'softcore',repeat('7',64))->>'id')::uuid;
  update private.ranked_runs set expires_at=now()-interval '1 second' where id=r;
  assert public.inspect_ranked_run(u,r,'PLAYER',repeat('c',64))->>'error' = 'run_expired';
  perform pg_temp.expect_error(format('select public.finalize_verified_run(%L,%L,''PLAYER'',100,1,''softcore'',''sabo-replay-v1'',%L,1,0)',u,r,repeat('c',64)),'run_expired');
  -- Per-run failed inspection counters must survive errors (return, not raise).
  for i in 1..7 loop assert public.inspect_ranked_run(u,r,'PLAYER',repeat('c',64))->>'error' = 'run_expired'; end loop;
  assert public.inspect_ranked_run(u,r,'PLAYER',repeat('c',64))->>'error' = 'rate_limited';
  assert (select sum(hits)=9 from private.ranked_rate_limits where bucket='attempt:run:' || r);
  -- A pre-cutover descriptor cannot acquire verification retroactively.
  r := (public.start_ranked_run(u,'softcore',repeat('7',64))->>'id')::uuid;
  update private.ranked_runs set seed=null,rules_version=null where id=r;
  assert public.inspect_ranked_run(u,r,'PLAYER',repeat('d',64))->>'error' = 'rules_mismatch';
  perform pg_temp.expect_error(format('select public.finalize_verified_run(%L,%L,''PLAYER'',100,1,''softcore'',''sabo-replay-v1'',%L,1,0)',u,r,repeat('d',64)),'rules_mismatch');
  -- Quotas: denial commits; unrelated later validation failure cannot undo it.
  for i in 1..30 loop assert public.ranking_attempt(u,'submit',repeat('8',64))->>'allowed' = 'true'; end loop;
  assert public.ranking_attempt(u,'submit',repeat('8',64))->>'error' = 'rate_limited';
  assert public.ranking_attempt(u,'submit',repeat('8',64))->>'error' = 'rate_limited';
  assert (select sum(hits)=31 from private.ranked_rate_limits where bucket='attempt:submit:user:' || u);
  assert public.ranking_attempt(null,'read',repeat('8',64))->>'allowed' = 'true';
  for i in 1..25 loop
    t:=gen_random_uuid(); insert into auth.users(id) values(t);
    foreach m in array array['softcore','hardcore'] loop
      tr:=(public.start_ranked_run(t,m,lpad(md5(t::text),64,'0'))->>'id')::uuid;
      perform public.finalize_verified_run(t,tr,'PLAYER',i*1000,case when m='hardcore' then 11 else 1 end,m,
        'sabo-replay-v1',repeat('e',64),1,0);
    end loop;
  end loop;
  assert (select count(*)=40 from private.ranked_verified_scores);
  assert (select count(*)=20 from public.get_leaderboard('softcore'));
  assert (select count(*)=20 from public.get_leaderboard('hardcore'));
  assert (select min(score)=6000 from public.get_leaderboard('softcore'));
  assert (select count(*)=0 from public.get_leaderboard('unknown'));
  tr:=(public.start_ranked_run(other_user,'softcore',repeat('9',64))->>'id')::uuid;
  receipt:=public.finalize_verified_run(other_user,tr,'LOW',0,1,'softcore','sabo-replay-v1',repeat('f',64),1,0);
  assert receipt = '{"accepted":true,"inTop":false}'::jsonb;
  -- Cleanup of guests/receipts must not delete verified results. Legacy is untouched.
  tr:=(public.start_ranked_run(other_user,'softcore',repeat('9',64))->>'id')::uuid;
  perform public.finalize_verified_run(other_user,tr,'PRESERVED',999999,1,'softcore','sabo-replay-v1',repeat('f',64),1,0);
  update private.ranked_runs set started_at=now()-interval '8 days',
    submitted_at=case when submitted_at is not null then now()-interval '8 days' end;
  update private.ranked_guests set last_seen=now()-interval '31 days' where user_id=other_user;
  perform public.cleanup_ranked_data();
  assert exists(select 1 from private.ranked_verified_scores where id=tr);
  assert not exists(select 1 from auth.users where id=other_user);
  assert (select count(*)=40 from private.ranked_verified_scores);
  assert (select count(*)=40 from private.ranked_scores);
end;
$$;

-- Denied global/daily/user gates must not create new spoofable IP buckets.
do $$
declare u uuid := gen_random_uuid(); a text; minute_limit integer; user_limit integer;
begin
  insert into auth.users(id) values(u);
  foreach a in array array['read','start','submit'] loop
    delete from private.ranked_rate_limits where bucket like 'attempt:%';
    minute_limit := case when a='read' then 1200 else 300 end;
    assert public.ranking_attempt(u,a,repeat('a',64))->>'allowed' = 'true';
    update private.ranked_rate_limits set hits=minute_limit where bucket='attempt:' || a || ':global';
    assert public.ranking_attempt(u,a,repeat('b',64))->>'error' = 'rate_limited';
    assert not exists(select 1 from private.ranked_rate_limits where bucket='attempt:' || a || ':ip:' || repeat('b',64));
    assert (select hits=minute_limit+1 from private.ranked_rate_limits where bucket='attempt:' || a || ':global');
    assert (select hits=1 from private.ranked_rate_limits where bucket='attempt:' || a || ':daily');
    update private.ranked_rate_limits set hits=1 where bucket='attempt:' || a || ':global';
    update private.ranked_rate_limits set hits=20000 where bucket='attempt:' || a || ':daily';
    assert public.ranking_attempt(u,a,repeat('b',64))->>'error' = 'rate_limited';
    assert not exists(select 1 from private.ranked_rate_limits where bucket='attempt:' || a || ':ip:' || repeat('b',64));
    assert (select hits=20001 from private.ranked_rate_limits where bucket='attempt:' || a || ':daily');
    if a<>'read' then
      user_limit := case when a='start' then 20 else 30 end;
      update private.ranked_rate_limits set hits=1 where bucket='attempt:' || a || ':daily';
      update private.ranked_rate_limits set hits=user_limit where bucket='attempt:' || a || ':user:' || u;
      assert public.ranking_attempt(u,a,repeat('b',64))->>'error' = 'rate_limited';
      assert not exists(select 1 from private.ranked_rate_limits where bucket='attempt:' || a || ':ip:' || repeat('b',64));
      assert (select hits=user_limit+1 from private.ranked_rate_limits where bucket='attempt:' || a || ':user:' || u);
    end if;
  end loop;
end;
$$;
set local role anon;
select pg_temp.expect_error('select public.get_leaderboard(''softcore'')','permission denied');
select pg_temp.expect_error('select public.ranking_attempt(null,''read'',repeat(''a'',64))','permission denied');
reset role;
set local role authenticated;
select pg_temp.expect_error('select public.get_leaderboard(''softcore'')','permission denied');
select pg_temp.expect_error('select * from private.ranked_verified_scores','permission denied');
reset role;
set local role service_role;
select count(*) from public.get_leaderboard('softcore');
select pg_temp.expect_error('select public.submit_ranked_run(null,null,''PLAYER'',99999999,1,''softcore'')','permission denied');
reset role;
rollback;
