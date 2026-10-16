begin;

-- Forward-only cutover: preserve old records privately; they are NOT verified.
alter table private.ranked_runs
  add column seed text check (seed ~ '^[a-f0-9]{32}$'),
  add column rules_version text,
  add column replay_digest text check (replay_digest ~ '^[a-f0-9]{64}$'),
  add column active_ticks integer check (active_ticks between 1 and 90000),
  add column replay_events integer check (replay_events between 0 and 12000);

create table private.ranked_verified_scores (
  id uuid primary key,
  mode text not null check (mode in ('softcore', 'hardcore')),
  player_name text not null check (char_length(player_name) between 1 and 10 and
    player_name = btrim(player_name) and player_name ~ '^[-a-zA-Z0-9 .,]+$'),
  score bigint not null check (score between 0 and 100000000),
  level integer not null,
  rules_version text not null check (rules_version = 'sabo-replay-v1'),
  replay_digest text not null check (replay_digest ~ '^[a-f0-9]{64}$'),
  active_ticks integer not null check (active_ticks between 1 and 90000),
  created_at timestamptz not null default now(),
  check ((mode = 'softcore' and level between 1 and 10) or (mode = 'hardcore' and level = 11))
);
create index ranked_verified_order on private.ranked_verified_scores(mode, score desc, created_at, id);
alter table private.ranked_verified_scores enable row level security;
revoke all on private.ranked_verified_scores from public, anon, authenticated, service_role;

-- Unlike take_rate, denial is a value, not an exception: counters COMMIT.
-- Saturate at limit+1 to bound counter growth under prolonged attack.
create function private.allow_ranked_attempt(p_bucket text, p_seconds integer, p_limit integer)
returns boolean language plpgsql set search_path = '' as $$
declare v_hits integer; v_window timestamptz;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);
  insert into private.ranked_rate_limits(bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update
    set hits = least(private.ranked_rate_limits.hits + 1, p_limit + 1)
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

-- Separate transaction invoked BEFORE reading/parsing/replaying user payloads.
-- IP is supplementary; global and identity limits do not trust proxy headers.
create function public.ranking_attempt(p_user uuid, p_action text, p_ip_bucket text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_action is null or p_action not in ('start','submit','read') or
     p_ip_bucket is null or p_ip_bucket !~ '^[a-f0-9]{64}$' then raise exception 'invalid_attempt'; end if;
  if p_action <> 'read' and not exists (
    select 1 from auth.users where id = p_user and is_anonymous is true
  ) then return jsonb_build_object('error','invalid_user'); end if;
  -- Ordered gates: once denied, never allocate downstream user/IP buckets.
  -- Otherwise spoofed IPs could grow storage AFTER global denial.
  if p_action = 'read' then
    if not private.allow_ranked_attempt('attempt:read:global',60,1200) then
      return jsonb_build_object('error','rate_limited');
    end if;
    if not private.allow_ranked_attempt('attempt:read:daily',86400,20000) then
      return jsonb_build_object('error','rate_limited');
    end if;
    if not private.allow_ranked_attempt('attempt:read:ip:' || p_ip_bucket,60,120) then
      return jsonb_build_object('error','rate_limited');
    end if;
  else
    if not private.allow_ranked_attempt('attempt:' || p_action || ':global',60,300) then
      return jsonb_build_object('error','rate_limited');
    end if;
    if not private.allow_ranked_attempt('attempt:' || p_action || ':daily',86400,20000) then
      return jsonb_build_object('error','rate_limited');
    end if;
    if not private.allow_ranked_attempt('attempt:' || p_action || ':user:' || p_user,600,
      case when p_action = 'start' then 20 else 30 end) then
      return jsonb_build_object('error','rate_limited');
    end if;
    if not private.allow_ranked_attempt('attempt:' || p_action || ':ip:' || p_ip_bucket,600,120) then
      return jsonb_build_object('error','rate_limited');
    end if;
  end if;
  return jsonb_build_object('allowed',true);
end;
$$;

create or replace function public.start_ranked_run(p_user uuid, p_mode text, p_ip_bucket text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_run private.ranked_runs;
begin
  if p_mode is null or p_mode not in ('softcore', 'hardcore') then raise exception 'invalid_mode'; end if;
  if not exists (select 1 from auth.users where id = p_user and is_anonymous is true) then raise exception 'invalid_user'; end if;
  if p_ip_bucket is null or p_ip_bucket !~ '^[a-f0-9]{64}$' then raise exception 'invalid_ip_bucket'; end if;
  -- Successful-start quotas remain in addition to committed attempt quotas.
  perform private.take_rate('start:user:' || p_user,600,10);
  perform private.take_rate('start:daily:' || p_user,86400,120);
  perform private.take_rate('start:ip:' || p_ip_bucket,600,60);
  perform private.take_rate('start:global',86400,10000);
  insert into private.ranked_guests(user_id) values(p_user)
    on conflict(user_id) do update set last_seen = now();
  insert into private.ranked_runs(user_id,mode,seed,rules_version)
    values(p_user,p_mode,replace(gen_random_uuid()::text,'-',''),'sabo-replay-v1') returning * into v_run;
  return jsonb_build_object('id',v_run.id,'mode',v_run.mode,'seed',v_run.seed,
    'rulesVersion',v_run.rules_version,'expiresAt',v_run.expires_at);
end;
$$;

-- Disable the vulnerable path even for an accidentally redeployed old backend.
create or replace function public.submit_ranked_run(
  p_user uuid,p_run uuid,p_name text,p_score bigint,p_level integer,p_mode text
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin raise exception 'verification_required'; end;
$$;
revoke all on function public.submit_ranked_run(uuid,uuid,text,bigint,integer,text)
  from public,anon,authenticated,service_role;

create function public.inspect_ranked_run(p_user uuid,p_run uuid,p_name text,p_digest text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_run private.ranked_runs;
begin
  select * into v_run from private.ranked_runs where id=p_run and user_id=p_user;
  if not found then return jsonb_build_object('error','run_not_found'); end if;
  if not private.allow_ranked_attempt('attempt:run:' || p_run,600,8) then
    return jsonb_build_object('error','rate_limited');
  end if;
  if v_run.seed is null or v_run.rules_version <> 'sabo-replay-v1' then
    return jsonb_build_object('error','rules_mismatch');
  end if;
  if v_run.submitted_at is not null then
    if v_run.replay_digest = p_digest and v_run.player_name = p_name then
      return jsonb_build_object('receipt',v_run.receipt,'mode',v_run.mode);
    end if;
    return jsonb_build_object('error','run_already_submitted');
  end if;
  if v_run.expires_at <= clock_timestamp() then return jsonb_build_object('error','run_expired'); end if;
  return jsonb_build_object('seed',v_run.seed,'mode',v_run.mode,'rulesVersion',v_run.rules_version,
    'elapsedMs',greatest(0,extract(epoch from (clock_timestamp()-v_run.started_at))*1000));
end;
$$;

-- Only trusted Edge replay code can supply these computed values. RLS alone is
-- not anti-cheat; never grant this RPC to a browser or expose the service key.
create function public.finalize_verified_run(
  p_user uuid,p_run uuid,p_name text,p_score bigint,p_level integer,p_mode text,
  p_rules text,p_digest text,p_ticks integer,p_events integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_run private.ranked_runs; v_receipt jsonb;
begin
  if p_name is null or char_length(p_name) not between 1 and 10 or p_name <> btrim(p_name) or p_name !~ '^[-a-zA-Z0-9 .,]+$' or
     p_score is null or p_score not between 0 and 100000000 or p_level is null or p_mode is null or not (
       (p_mode='softcore' and p_level between 1 and 10) or (p_mode='hardcore' and p_level=11)) or
     p_rules is distinct from 'sabo-replay-v1' or p_digest is null or p_digest !~ '^[a-f0-9]{64}$' or
     p_ticks is null or p_ticks not between 1 and 90000 or p_events is null or p_events not between 0 and 12000
     then raise exception 'invalid_score'; end if;
  select * into v_run from private.ranked_runs where id=p_run and user_id=p_user for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.seed is null or v_run.rules_version is distinct from p_rules then raise exception 'rules_mismatch'; end if;
  if v_run.mode <> p_mode then raise exception 'mode_mismatch'; end if;
  if v_run.submitted_at is not null then
    if v_run.replay_digest <> p_digest or v_run.player_name <> p_name or v_run.score <> p_score or
       v_run.level <> p_level or v_run.active_ticks <> p_ticks or v_run.replay_events <> p_events then
      raise exception 'run_already_submitted';
    end if;
    return v_run.receipt;
  end if;
  if v_run.expires_at <= clock_timestamp() then raise exception 'run_expired'; end if;
  if p_ticks::bigint*20 > extract(epoch from (clock_timestamp()-v_run.started_at))*1000+2000 then
    raise exception 'replay_too_fast';
  end if;
  perform pg_advisory_xact_lock(hashtext('sabotetris:verified:' || p_mode));
  insert into private.ranked_verified_scores(id,mode,player_name,score,level,rules_version,replay_digest,active_ticks)
    values(p_run,p_mode,p_name,p_score,p_level,p_rules,p_digest,p_ticks);
  delete from private.ranked_verified_scores where id in (
    select id from private.ranked_verified_scores where mode=p_mode order by score desc,created_at,id offset 20
  );
  v_receipt := jsonb_build_object('accepted',true,'inTop',exists(select 1 from private.ranked_verified_scores where id=p_run));
  update private.ranked_runs set submitted_at=now(),player_name=p_name,score=p_score,level=p_level,
    receipt=v_receipt,replay_digest=p_digest,active_ticks=p_ticks,replay_events=p_events where id=p_run;
  update private.ranked_guests set last_seen=now() where user_id=p_user;
  return v_receipt;
end;
$$;

-- Public reads now go through the rate-limited leaderboard Edge Function.
create or replace function public.get_leaderboard(p_mode text)
returns table(player_name text,score bigint,level integer,mode text,created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.player_name,s.score,s.level,s.mode,s.created_at from private.ranked_verified_scores s
  where s.mode=p_mode and p_mode in ('softcore','hardcore')
  order by s.score desc,s.created_at,s.id limit 20;
$$;
revoke all on function public.get_leaderboard(text) from public,anon,authenticated;
grant execute on function public.get_leaderboard(text) to service_role;

revoke all on function private.allow_ranked_attempt(text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.ranking_attempt(uuid,text,text) from public,anon,authenticated;
revoke all on function public.inspect_ranked_run(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.finalize_verified_run(uuid,uuid,text,bigint,integer,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.ranking_attempt(uuid,text,text) to service_role;
grant execute on function public.inspect_ranked_run(uuid,uuid,text,text) to service_role;
grant execute on function public.finalize_verified_run(uuid,uuid,text,bigint,integer,text,text,text,integer,integer) to service_role;

-- Default EXECUTE is PUBLIC in PostgreSQL. Scope hardening to this private
-- schema/creator, not unrelated application objects in the public schema.
alter default privileges for role postgres in schema private revoke execute on functions from public,anon,authenticated;
alter default privileges for role postgres in schema private revoke all on tables from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
