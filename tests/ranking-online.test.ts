import assert from 'node:assert/strict';
import test from 'node:test';
import { RankingService } from '../src/engine/services/RankingService.ts';
import { RemoteRankingService } from '../src/engine/services/RemoteRankingService.ts';
import type { RankedRun, RankingBackend, RankingMode } from '../src/engine/services/RemoteRankingService.ts';
import { createHandler, validSubmission } from '../supabase/functions/_shared/http.ts';
import { RULES_VERSION } from '../supabase/functions/_shared/game/protocol.ts';
import { finishedReplay, SEED } from './fixtures/replays.ts';

const run: RankedRun = { id: '00000000-0000-4000-8000-000000000001', mode: 'softcore',
  expiresAt: '2099-01-01T00:00:00Z', seed: SEED, rulesVersion: RULES_VERSION };
const submission = { playerName: 'PLAYER', mode: 'softcore' as const, replay: finishedReplay('softcore').replay };
const entry = { playerName: 'PLAYER', score: 100, level: 1, mode: 'softcore' as const, date: '2026-06-01' };
function backend(): RankingBackend {
  return { hasSession: async () => true, signIn: async () => {}, start: async () => run,
    submit: async () => ({ accepted: true, inTop: true }), read: async () => [entry] };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

test('local ranking preserves legacy entries and keeps 20 per mode, not 20 mixed', () => {
  let stored = JSON.stringify([{ playerName: 'LEGACY', score: 1000, level: 1, date: 'old' }]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; },
  } });
  const service = new RankingService();
  for (let score = 0; score < 25; score++) {
    for (const mode of ['softcore', 'hardcore'] as RankingMode[]) {
      assert.equal(service.addEntry({ ...entry, mode, score, level: mode === 'hardcore' ? 11 : 1 }), true);
    }
  }
  assert.equal(service.getRanking('softcore').length, 20);
  assert.equal(service.getRanking('hardcore').length, 20);
  assert.equal(service.getRanking().length, 40);
  assert.equal(service.getRanking('softcore')[0].playerName, 'LEGACY');
  assert.equal(service.getRanking('hardcore')[0].score, 24);
});

test('storage failures are reported instead of crashing or claiming a successful save', () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => { throw new Error('disabled'); }, setItem: () => { throw new Error('quota'); },
  } });
  const service = new RankingService();
  assert.deepEqual(service.getRanking(), []);
  assert.equal(service.addEntry(entry), false);
});

test('disabled online service never asks for CAPTCHA or publishes local history', async () => {
  const service = new RemoteRankingService(null);
  assert.equal(service.configured, false);
  assert.equal(await service.beginRun('softcore', () => { throw new Error('must not run'); }, new AbortController().signal), null);
  await assert.rejects(service.getRanking('softcore'));
  await assert.rejects(service.submit(run, submission));
});

test('a guest needs CAPTCHA once; returning guests do not', async () => {
  const api = backend();
  let signedIn = false;
  let challenges = 0;
  api.hasSession = async () => signedIn;
  api.signIn = async token => { assert.equal(token, 'captcha'); signedIn = true; };
  const service = new RemoteRankingService(api);
  const captcha = async () => { challenges++; return 'captcha'; };
  assert.equal(await service.beginRun('softcore', captcha, new AbortController().signal), run);
  assert.equal(await service.beginRun('softcore', captcha, new AbortController().signal), run);
  assert.equal(challenges, 1);
});

test('cancelled setup cannot start or return a ranked run; network errors fall back to local', async () => {
  const api = backend();
  const check = deferred<boolean>();
  api.hasSession = () => check.promise;
  api.start = async () => { throw new Error('must not start'); };
  const controller = new AbortController();
  const pending = new RemoteRankingService(api).beginRun('softcore', async () => 'captcha', controller.signal);
  controller.abort();
  check.resolve(true);
  assert.equal(await pending, null);
  api.hasSession = async () => { throw new Error('offline'); };
  assert.equal(await new RemoteRankingService(api).beginRun('softcore', async () => 'captcha', new AbortController().signal), null);
});

test('reads are deduplicated, bounded, mode-specific and cached for 60 seconds', async () => {
  let now = 0;
  let reads = 0;
  const api = backend();
  api.read = async mode => { reads++; return Array.from({ length: 30 }, () => ({ ...entry, mode })); };
  const service = new RemoteRankingService(api, () => now);
  const results = await Promise.all([service.getRanking('softcore'), service.getRanking('softcore')]);
  assert.equal(reads, 1);
  assert.equal(results[0].length, 20);
  results[0][0].playerName = 'MUTATED';
  assert.equal((await service.getRanking('softcore'))[0].playerName, 'PLAYER');
  await service.getRanking('hardcore');
  assert.equal(reads, 2);
  now = 60_000;
  await service.getRanking('softcore');
  assert.equal(reads, 3);
});

test('failed reads can retry; a late pre-publication read cannot refill stale cache', async () => {
  const api = backend();
  api.read = async () => { throw new Error('offline'); };
  const service = new RemoteRankingService(api);
  await assert.rejects(service.getRanking('softcore'));
  const stale = deferred<typeof entry[]>();
  api.read = () => stale.promise;
  const pending = service.getRanking('softcore');
  await service.submit(run, submission);
  api.read = async () => [{ ...entry, score: 200 }];
  stale.resolve([entry]);
  await pending;
  assert.equal((await service.getRanking('softcore'))[0].score, 200);
});

test('HTTP rejects ALL caller scores/levels/seeds/rules and validates the replay-only contract', () => {
  const body = { ...submission, runId: run.id };
  assert.equal(validSubmission(body), true);
  for (const patch of [{ score: 100 }, { score: -1 }, { score: 1.5 }, { score: Number.MAX_SAFE_INTEGER + 1 },
    { level: 1 }, { seed: SEED }, { rulesVersion: RULES_VERSION }, { playerName: ' ' },
    { playerName: '01234567890' }, { playerName: '<script>' }, { runId: 'bad' }, { mode: 'other' },
    { replay: { ticks: 1, events: [[1, 7]] } }, { replay: { ticks: 1, events: [[2, 4]] } }]) {
    assert.equal(validSubmission({ ...body, ...patch }), false, JSON.stringify(patch));
  }
  assert.equal(validSubmission({ ...body, mode: 'hardcore' }), true);
});

function handler(action: 'start' | 'submit' = 'start', rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> = async () => ({ data: run, error: null })) {
  return createHandler(action, { allowedOrigins: ['https://paablobs.github.io'], ipSalt: 's'.repeat(32),
    userId: async token => token === 'valid' ? 'verified-user' : null,
    rpc: async (name, args) => name === 'ranking_attempt' ? { data: { allowed: true }, error: null } : rpc(name, args) });
}
function request(body: unknown = { mode: 'softcore' }, overrides: Record<string, string> = {}): Request {
  return new Request('https://example.test/functions/v1/start-run', { method: 'POST',
    headers: { origin: 'https://paablobs.github.io', authorization: 'Bearer valid', 'content-type': 'application/json', ...overrides },
    body: JSON.stringify(body) });
}

test('HTTP denies wrong origins, wrong methods, invalid auth and oversized/chunked bodies', async () => {
  const serve = handler();
  assert.equal((await serve(request(undefined, { origin: 'https://evil.test' }))).status, 403);
  assert.equal((await serve(request(undefined, { authorization: 'Bearer forged' }))).status, 401);
  assert.equal((await serve(request(undefined, { authorization: '' }))).status, 401);
  assert.equal((await serve(request(undefined, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await serve(request({ mode: 'softcore', padding: 'x'.repeat(3000) }))).status, 413);
  assert.equal((await serve(request([]))).status, 400);
  assert.equal((await serve(new Request('https://example.test', { headers: { origin: 'https://paablobs.github.io' } }))).status, 405);
  const preflight = await serve(new Request('https://example.test', { method: 'OPTIONS', headers: { origin: 'https://paablobs.github.io' } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://paablobs.github.io');
});

test('HTTP uses server-verified identity and HMAC IP bucket, never caller userId', async () => {
  const serve = handler('start', async (name, args) => {
    assert.equal(name, 'start_ranked_run');
    assert.equal(args.p_user, 'verified-user');
    assert.match(String(args.p_ip_bucket), /^[a-f0-9]{64}$/);
    return { data: run, error: null };
  });
  assert.equal((await serve(request({ mode: 'softcore', p_user: 'attacker' }))).status, 200);
});

test('HTTP returns rate limits but hides unknown SQL/internal errors', async () => {
  const limited = handler('start', async () => ({ data: run, error: { message: 'rate_limited' } }));
  assert.equal((await limited(request())).status, 429);
  const broken = handler('start', async () => ({ data: run, error: { message: 'secret SQL details' } }));
  const response = await broken(request());
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('secret'), false);
});
