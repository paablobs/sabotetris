import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('database runner waits for final TCP server and uses it for SQL', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sabotetris-db-startup-'));
  const probes = join(directory, 'probes');
  const log = join(directory, 'docker.log');
  try {
    writeFileSync(probes, '0\n');
    // Simulate the image's temporary socket-only server, followed by its final
    // TCP server. Exit 42 at the first SQL call: real SQL is tested by test:db.
    writeFileSync(join(directory, 'docker'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$STARTUP_TEST_LOG"
case " $* " in
  *" pg_isready "*)
    if [[ " $* " != *" -h 127.0.0.1 "* ]]; then exit 0; fi
    read -r count < "$STARTUP_TEST_PROBES"
    count=$((count + 1))
    printf '%s\\n' "$count" > "$STARTUP_TEST_PROBES"
    [[ "$count" -ge 2 ]]
    ;;
  *" psql "*)
    read -r count < "$STARTUP_TEST_PROBES"
    if [[ "$count" -lt 2 || " $* " != *" -h 127.0.0.1 "* ]]; then
      printf 'SQL reached the temporary server or a missing socket\\n' >&2
      exit 1
    fi
    exit 42
    ;;
esac
`, { mode: 0o700 });
    const result = spawnSync('bash', [fileURLToPath(new URL('../scripts/test-db.sh', import.meta.url))], {
      env: {
        ...process.env,
        PATH: `${directory}${delimiter}${process.env.PATH ?? ''}`,
        STARTUP_TEST_LOG: log,
        STARTUP_TEST_PROBES: probes,
      },
      encoding: 'utf8',
      timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 42, result.stderr);
    assert.equal(readFileSync(probes, 'utf8').trim(), '2', 'must retry until TCP is ready');
    assert.match(readFileSync(log, 'utf8'), /stop sabotetris-ranking-test-\d+/, 'must clean up on exit');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
