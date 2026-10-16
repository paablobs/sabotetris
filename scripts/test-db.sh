#!/usr/bin/env bash
# Isolated test container only: no host port, no bind mounts, no user database.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { printf 'Docker is required for test:db\n' >&2; exit 1; }
name="sabotetris-ranking-test-$$"
trap 'docker stop "$name" >/dev/null 2>&1 || true' EXIT
# Pin the tested PostgreSQL image; override explicitly when testing an upgrade.
image="${POSTGRES_TEST_IMAGE:-postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea}"
docker run --rm -d --name "$name" -e POSTGRES_HOST_AUTH_METHOD=trust "$image" >/dev/null
# The image starts a socket-only temporary server during initialization. Wait for
# TCP so readiness cannot succeed before that server stops and the final one starts.
ready=false
for _ in {1..60}; do
  if docker exec "$name" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 0.5
done
if [[ "$ready" != true ]]; then printf 'PostgreSQL did not become ready\n' >&2; exit 1; fi
psql=(docker exec -i "$name" psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U postgres)
"${psql[@]}" < tests/db/bootstrap.sql >/dev/null
"${psql[@]}" < supabase/migrations/20260601000000_global_ranking.sql >/dev/null
"${psql[@]}" < tests/db/ranking.sql

# Different runs/modes contend for the leaderboard: insert + prune must be atomic.
pids=()
for worker in {1..12}; do
  "${psql[@]}" -c "do \$\$ declare u uuid; r uuid; i integer; m text; begin
    for i in 1..4 loop
      u := gen_random_uuid(); insert into auth.users(id) values (u);
      foreach m in array array['softcore','hardcore'] loop
        r := (public.start_ranked_run(u,m,lpad(md5(u::text),64,'0'))->>'id')::uuid;
        perform public.submit_ranked_run(u,r,'PARALLEL',${worker} * 1000 + i,
          case when m = 'hardcore' then 11 else 1 end,m);
      end loop;
    end loop; end; \$\$;" >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
"${psql[@]}" -c "do \$\$ begin
  assert (select count(*) = 40 from private.ranked_scores), 'Concurrent prune exceeded 40';
  assert (select min(score) = 8001 from public.get_leaderboard('softcore')), 'Lost a higher score';
  assert (select count(*) = 20 from public.get_leaderboard('hardcore'));
end; \$\$;" >/dev/null

# Same run, simultaneous retries: every caller receives the same accepted receipt.
user='00000000-0000-4000-8000-000000000099'
"${psql[@]}" -c "insert into auth.users(id) values ('$user');" >/dev/null
run=$("${psql[@]}" -Atc "select public.start_ranked_run('$user','softcore',repeat('f',64))->>'id';")
pids=()
for _ in {1..8}; do
  "${psql[@]}" -c "select public.submit_ranked_run('$user','$run','RETRY',999999,1,'softcore');" >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
"${psql[@]}" -c "do \$\$ begin
  assert (select count(*) = 1 from private.ranked_scores where id = '$run');
  assert (select count(*) = 1 from private.ranked_runs where id = '$run' and submitted_at is not null);
  assert (select count(*) = 40 from private.ranked_scores);
end; \$\$;" >/dev/null
# Forward cutover must preserve legacy rows while hiding them from verified reads.
"${psql[@]}" < supabase/migrations/20260602000000_verified_ranking.sql >/dev/null
"${psql[@]}" < tests/db/verified.sql
pids=()
for worker in {1..12}; do
  "${psql[@]}" -c "do \$\$ declare u uuid; r uuid; i integer; m text; begin
    for i in 1..4 loop
      u := gen_random_uuid(); insert into auth.users(id) values (u);
      foreach m in array array['softcore','hardcore'] loop
        r := (public.start_ranked_run(u,m,lpad(md5(u::text),64,'0'))->>'id')::uuid;
        perform public.finalize_verified_run(u,r,'PARALLEL',${worker} * 1000 + i,
          case when m = 'hardcore' then 11 else 1 end,m,'sabo-replay-v1',repeat('a',64),1,0);
      end loop;
    end loop; end; \$\$;" >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
"${psql[@]}" -c "do \$\$ begin
  assert (select count(*) = 40 from private.ranked_verified_scores), 'Concurrent verified prune exceeded 40';
  assert (select min(score) = 8001 from public.get_leaderboard('softcore')), 'Lost a higher verified score';
  assert (select count(*) = 20 from public.get_leaderboard('hardcore'));
end; \$\$;" >/dev/null

user='00000000-0000-4000-8000-000000000098'
"${psql[@]}" -c "insert into auth.users(id) values ('$user');" >/dev/null
run=$("${psql[@]}" -Atc "select public.start_ranked_run('$user','softcore',repeat('f',64))->>'id';")
pids=()
for _ in {1..8}; do
  "${psql[@]}" -c "select public.finalize_verified_run('$user','$run','RETRY',999999,1,'softcore','sabo-replay-v1',repeat('a',64),1,0);" >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
"${psql[@]}" -c "do \$\$ begin
  assert (select count(*) = 1 from private.ranked_verified_scores where id = '$run');
  assert (select count(*) = 1 from private.ranked_runs where id = '$run' and submitted_at is not null);
end; \$\$;" >/dev/null
# Different submissions racing on the same run: exactly one must win.
run=$("${psql[@]}" -Atc "select public.start_ranked_run('$user','hardcore',repeat('f',64))->>'id';")
pids=()
for score in 999998 999999; do
  "${psql[@]}" -c "select public.finalize_verified_run('$user','$run','RACE',$score,11,'hardcore','sabo-replay-v1',lpad(md5('$score'),64,'0'),1,0);" >/dev/null 2>&1 &
  pids+=("$!")
done
wins=0
for pid in "${pids[@]}"; do if wait "$pid"; then wins=$((wins+1)); fi; done
[[ "$wins" = 1 ]] || { printf 'Expected one concurrent winner, got %s\n' "$wins" >&2; exit 1; }
"${psql[@]}" -c "do \$\$ begin
  assert (select count(*) = 1 from private.ranked_verified_scores where id = '$run');
  assert (select count(*) = 40 from private.ranked_scores), 'Legacy results changed';
  assert (select count(*) = 40 from private.ranked_verified_scores);
end; \$\$;" >/dev/null
# Separate transactions: invalid/expired attempts really persist across requests.
run=$("${psql[@]}" -Atc "select public.start_ranked_run('$user','softcore',repeat('f',64))->>'id';")
"${psql[@]}" -c "update private.ranked_runs set expires_at=now()-interval '1 second' where id='$run';" >/dev/null
for _ in {1..9}; do
  "${psql[@]}" -c "select public.ranking_attempt('$user','submit',repeat('e',64)); select public.inspect_ranked_run('$user','$run','PLAYER',repeat('d',64));" >/dev/null
done
"${psql[@]}" -c "do \$\$ begin
  assert (select sum(hits)=9 from private.ranked_rate_limits where bucket='attempt:run:$run');
  assert public.inspect_ranked_run('$user','$run','PLAYER',repeat('d',64))->>'error'='rate_limited';
end; \$\$;" >/dev/null
printf 'PASS: legacy/verified cutover, permissions, validation, committed quotas, retention and concurrent submissions\n'
