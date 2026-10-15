\set ON_ERROR_STOP on
begin;
create function pg_temp.expect_error(p_sql text, p_error text) returns void language plpgsql as $$
declare caught boolean := false;
begin
  begin execute p_sql;
  exception when others then
    if position(p_error in sqlerrm) = 0 then raise exception 'Expected %, got %', p_error, sqlerrm; end if;
    caught := true;
  end;
  assert caught, 'Expected query to fail: ' || p_sql;
end;
$$;

do $$
declare
  u uuid := gen_random_uuid(); other_user uuid := gen_random_uuid(); r uuid; receipt jsonb; again jsonb;
  i integer; test_user uuid; test_run uuid; m text;
begin
  assert not has_schema_privilege('anon', 'private', 'USAGE');
  assert not has_schema_privilege('authenticated', 'private', 'USAGE');
  assert not has_function_privilege('anon', 'public.start_ranked_run(uuid,text,text)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.submit_ranked_run(uuid,uuid,text,bigint,integer,text)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.cleanup_ranked_data()', 'EXECUTE');
  assert not has_function_privilege('service_role', 'public.cleanup_ranked_data()', 'EXECUTE');
  assert has_function_privilege('anon', 'public.get_leaderboard(text)', 'EXECUTE');
  insert into auth.users(id) values (u), (other_user);
  assert exists(select 1 from private.ranked_guests where user_id = u);
  r := (public.start_ranked_run(u, 'softcore', repeat('a',64))->>'id')::uuid;
  perform pg_temp.expect_error(format('select public.submit_ranked_run(%L,%L,''PLAYER'',100,1,''softcore'')', other_user, r), 'run_not_found');
  perform pg_temp.expect_error(format('select public.submit_ranked_run(%L,%L,''PLAYER'',100,11,''hardcore'')', u, r), 'mode_mismatch');
  perform pg_temp.expect_error(format('select public.submit_ranked_run(%L,%L,''<script>'',100,1,''softcore'')', u, r), 'invalid_score');
  perform pg_temp.expect_error(format('select public.submit_ranked_run(%L,%L,''PLAYER'',-1,1,''softcore'')', u, r), 'invalid_score');
  perform pg_temp.expect_error(format('select public.submit_ranked_run(%L,%L,''PLAYER'',9007199254740992,1,''softcore'')', u, r), 'invalid_score');
  perform pg_temp.expect_error(format('select public.submit_ranked_run(%L,%L,''PLAYER'',100,11,''softcore'')', u, r), 'invalid_score');
  receipt := public.submit_ranked_run(u, r, 'PLAYER', 100, 1, 'softcore');
  assert receipt = '{"accepted":true,"inTop":true}'::jsonb;
  update private.ranked_runs set expires_at = now() - interval '1 day' where id = r;
  again := public.submit_ranked_run(u, r, 'PLAYER', 100, 1, 'softcore');
  assert again = receipt, 'Same request must have identical receipt even after expiry';
  assert (select count(*) = 1 from private.ranked_scores where id = r);
  perform pg_temp.expect_error(format('select public.submit_ranked_run(%L,%L,''PLAYER'',101,1,''softcore'')', u, r), 'run_already_submitted');
  r := (public.start_ranked_run(u, 'softcore', repeat('a',64))->>'id')::uuid;
  update private.ranked_runs set expires_at = now() - interval '1 second' where id = r;
  perform pg_temp.expect_error(format('select public.submit_ranked_run(%L,%L,''PLAYER'',100,1,''softcore'')', u, r), 'run_expired');
  -- Both modes retain their own 20; lower results still get an accepted receipt.
  for i in 1..25 loop
    test_user := gen_random_uuid(); insert into auth.users(id) values(test_user);
    foreach m in array array['softcore', 'hardcore'] loop
      test_run := (public.start_ranked_run(test_user, m, repeat('b',64))->>'id')::uuid;
      perform public.submit_ranked_run(test_user, test_run, 'PLAYER', i * 1000,
        case when m = 'hardcore' then 11 else 1 end, m);
    end loop;
  end loop;
  assert (select count(*) = 40 from private.ranked_scores);
  assert (select count(*) = 20 from public.get_leaderboard('softcore'));
  assert (select count(*) = 20 from public.get_leaderboard('hardcore'));
  assert (select min(score) = 6000 from public.get_leaderboard('softcore'));
  assert (select count(*) = 0 from public.get_leaderboard('unknown'));
  test_run := (public.start_ranked_run(other_user, 'softcore', repeat('c',64))->>'id')::uuid;
  assert public.submit_ranked_run(other_user, test_run, 'LOW', 0, 1, 'softcore') = '{"accepted":true,"inTop":false}'::jsonb;
  -- Persistent rate buckets, with SQL (not JS process memory) as the authority.
  test_user := gen_random_uuid(); insert into auth.users(id) values(test_user);
  for i in 1..10 loop perform public.start_ranked_run(test_user, 'softcore', repeat('d',64)); end loop;
  perform pg_temp.expect_error(format('select public.start_ranked_run(%L,''softcore'',%L)', test_user, repeat('d',64)), 'rate_limited');
  -- Cleanup must not lose public records owned by the removed guest.
  test_run := (public.start_ranked_run(u, 'softcore', repeat('c',64))->>'id')::uuid;
  perform public.submit_ranked_run(u, test_run, 'PRESERVED', 999999, 1, 'softcore');
  update private.ranked_runs set started_at = now() - interval '8 days',
    submitted_at = case when submitted_at is not null then now() - interval '8 days' end;
  update private.ranked_guests set last_seen = now() - interval '31 days' where user_id = u;
  perform public.cleanup_ranked_data();
  assert exists(select 1 from private.ranked_scores where id = test_run);
  assert not exists(select 1 from auth.users where id = u);
  assert exists(select 1 from auth.users where id = other_user);
  assert (select count(*) = 40 from private.ranked_scores);
  assert (select count(*) = 0 from private.ranked_runs);
  -- Receipt retention is measured from acceptance, not creation (late first submit).
  test_user := gen_random_uuid(); insert into auth.users(id) values(test_user);
  test_run := (public.start_ranked_run(test_user, 'softcore', repeat('e',64))->>'id')::uuid;
  receipt := public.submit_ranked_run(test_user, test_run, 'LATE', 0, 1, 'softcore');
  update private.ranked_runs set started_at = now() - interval '8 days',
    submitted_at = now() - interval '6 days' where id = test_run;
  perform public.cleanup_ranked_data();
  assert exists(select 1 from private.ranked_runs where id = test_run);
  assert public.submit_ranked_run(test_user, test_run, 'LATE', 0, 1, 'softcore') = receipt;
  update private.ranked_runs set submitted_at = now() - interval '8 days' where id = test_run;
  perform public.cleanup_ranked_data();
  assert not exists(select 1 from private.ranked_runs where id = test_run);
end;
$$;
-- Exercise actual client roles, not just privilege catalog assertions.
set local role anon;
select count(*) from public.get_leaderboard('softcore');
reset role;
set local role authenticated;
select count(*) from public.get_leaderboard('hardcore');
reset role;
rollback;
