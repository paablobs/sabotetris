begin;

-- Private storage is not exposed by PostgREST. Only the bounded read RPC is public.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.ranked_guests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now()
);
create table private.ranked_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('softcore', 'hardcore')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  submitted_at timestamptz,
  player_name text,
  score bigint,
  level integer,
  receipt jsonb
);
create index ranked_runs_expiry on private.ranked_runs(started_at);
-- Scores intentionally do not reference runs/users: removing expired receipts or
-- anonymous identities must not remove public records. No user IDs are exposed.
create table private.ranked_scores (
  id uuid primary key,
  mode text not null check (mode in ('softcore', 'hardcore')),
  player_name text not null check (
    char_length(player_name) between 1 and 10 and
    player_name = btrim(player_name) and player_name ~ '^[-a-zA-Z0-9 .,]+$'
  ),
  score bigint not null check (score between 0 and 9007199254740991),
  level integer not null,
  created_at timestamptz not null default now(),
  check ((mode = 'softcore' and level between 1 and 10) or (mode = 'hardcore' and level = 11))
);
create index ranked_scores_order on private.ranked_scores(mode, score desc, created_at, id);
create table private.ranked_rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null check (hits > 0),
  primary key (bucket, window_start)
);
alter table private.ranked_guests enable row level security;
alter table private.ranked_runs enable row level security;
alter table private.ranked_scores enable row level security;
alter table private.ranked_rate_limits enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;

-- Atomic, shared across function instances; unlike an in-memory JS counter.
create function private.take_rate(p_bucket text, p_seconds integer, p_limit integer)
returns void language plpgsql set search_path = '' as $$
declare v_hits integer; v_window timestamptz;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);
  insert into private.ranked_rate_limits(bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = private.ranked_rate_limits.hits + 1
  returning hits into v_hits;
  if v_hits > p_limit then raise exception 'rate_limited'; end if;
end;
$$;

create function private.track_ranked_guest() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_anonymous is true then
    insert into private.ranked_guests(user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger track_ranked_guest after insert on auth.users
for each row execute function private.track_ranked_guest();

create function public.start_ranked_run(p_user uuid, p_mode text, p_ip_bucket text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_run private.ranked_runs;
begin
  if p_mode is null or p_mode not in ('softcore', 'hardcore') then raise exception 'invalid_mode'; end if;
  if not exists (select 1 from auth.users where id = p_user and is_anonymous is true) then
    raise exception 'invalid_user';
  end if;
  if p_ip_bucket is null or p_ip_bucket !~ '^[a-f0-9]{64}$' then raise exception 'invalid_ip_bucket'; end if;
  perform private.take_rate('start:user:' || p_user, 600, 10);
  perform private.take_rate('start:daily:' || p_user, 86400, 120);
  perform private.take_rate('start:ip:' || p_ip_bucket, 600, 60);
  perform private.take_rate('start:global', 86400, 10000);
  insert into private.ranked_guests(user_id) values (p_user)
  on conflict (user_id) do update set last_seen = now();
  insert into private.ranked_runs(user_id, mode) values (p_user, p_mode) returning * into v_run;
  return jsonb_build_object('id', v_run.id, 'mode', v_run.mode, 'expiresAt', v_run.expires_at);
end;
$$;

create function public.submit_ranked_run(
  p_user uuid, p_run uuid, p_name text, p_score bigint, p_level integer, p_mode text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_run private.ranked_runs; v_receipt jsonb;
begin
  if p_name is null or char_length(p_name) not between 1 and 10 or
     p_name <> btrim(p_name) or p_name !~ '^[-a-zA-Z0-9 .,]+$' or
     p_score is null or p_score not between 0 and 9007199254740991 or
     p_level is null or p_mode is null or not (
       (p_mode = 'softcore' and p_level between 1 and 10) or
       (p_mode = 'hardcore' and p_level = 11)
     ) then raise exception 'invalid_score'; end if;
  perform private.take_rate('submit:user:' || p_user, 600, 30);
  select * into v_run from private.ranked_runs where id = p_run and user_id = p_user for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.mode <> p_mode then raise exception 'mode_mismatch'; end if;
  -- Retry the same payload even after the initial expiry, while the receipt exists.
  if v_run.submitted_at is not null then
    if v_run.player_name <> p_name or v_run.score <> p_score or v_run.level <> p_level then
      raise exception 'run_already_submitted';
    end if;
    return v_run.receipt;
  end if;
  if v_run.expires_at <= now() then raise exception 'run_expired'; end if;
  -- Serialize insert + trim per mode, including submissions for different runs.
  perform pg_advisory_xact_lock(hashtext('sabotetris:ranking:' || p_mode));
  insert into private.ranked_scores(id, mode, player_name, score, level)
  values (p_run, p_mode, p_name, p_score, p_level);
  delete from private.ranked_scores where id in (
    select id from private.ranked_scores where mode = p_mode
    order by score desc, created_at, id offset 20
  );
  v_receipt := jsonb_build_object('accepted', true, 'inTop', exists (
    select 1 from private.ranked_scores where id = p_run
  ));
  update private.ranked_runs set submitted_at = now(), player_name = p_name,
    score = p_score, level = p_level, receipt = v_receipt where id = p_run;
  update private.ranked_guests set last_seen = now() where user_id = p_user;
  return v_receipt;
end;
$$;

create function public.get_leaderboard(p_mode text)
returns table (player_name text, score bigint, level integer, mode text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.player_name, s.score, s.level, s.mode, s.created_at
  from private.ranked_scores s where s.mode = p_mode and p_mode in ('softcore', 'hardcore')
  order by s.score desc, s.created_at, s.id limit 20;
$$;

create function public.cleanup_ranked_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.ranked_runs where coalesce(submitted_at, started_at) < now() - interval '7 days';
  delete from private.ranked_rate_limits where window_start < now() - interval '2 days';
  delete from auth.users u using private.ranked_guests g
    where u.id = g.user_id and u.is_anonymous is true and g.last_seen < now() - interval '30 days';
end;
$$;

-- Functions otherwise grant EXECUTE to PUBLIC by default, even in private schemas.
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.start_ranked_run(uuid, text, text) from public, anon, authenticated;
revoke all on function public.submit_ranked_run(uuid, uuid, text, bigint, integer, text) from public, anon, authenticated;
revoke all on function public.cleanup_ranked_data() from public, anon, authenticated, service_role;
revoke all on function public.get_leaderboard(text) from public;
grant execute on function public.start_ranked_run(uuid, text, text) to service_role;
grant execute on function public.submit_ranked_run(uuid, uuid, text, bigint, integer, text) to service_role;
grant execute on function public.get_leaderboard(text) to anon, authenticated, service_role;
-- Cleanup is intentionally admin-only; schedule it as postgres (see schedule.sql).
commit;
