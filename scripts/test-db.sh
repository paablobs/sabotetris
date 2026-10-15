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
ready=false
for _ in {1..60}; do
  if docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 0.5
done
if [[ "$ready" != true ]]; then printf 'PostgreSQL did not become ready\n' >&2; exit 1; fi
psql=(docker exec -i "$name" psql -X -v ON_ERROR_STOP=1 -U postgres)
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
printf 'PASS: PostgreSQL permissions, validation, retention, quotas and concurrent submissions\n'
