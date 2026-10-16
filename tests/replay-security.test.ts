import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createHandler } from '../supabase/functions/_shared/http.ts';
import { GameSimulation } from '../supabase/functions/_shared/game/simulation.ts';
import { seededRandom } from '../supabase/functions/_shared/game/random.ts';
import { RULES_VERSION, MAX_EVENTS, MAX_TICKS, MAX_REPLAY_BYTES, INPUT, ReplayRecorder, validReplay } from '../supabase/functions/_shared/game/protocol.ts';
import type { GameMode } from '../supabase/functions/_shared/game/protocol.ts';
import { submissionDigest, verifyReplay } from '../supabase/functions/_shared/game/verify.ts';
import { BOARD_X, BOARD_Y, ROWS, COLS } from '../supabase/functions/_shared/game/types.ts';
import { SEED, finishedReplay } from './fixtures/replays.ts';

const context = { seed: SEED, mode: 'softcore' as const, rulesVersion: RULES_VERSION, elapsedMs: 2_000_000 };
const ID = '00000000-0000-4000-8000-000000000001';
const ORIGIN = 'https://paablobs.github.io';
const snapshot = (g: GameSimulation) => JSON.stringify([g.grid, g.currentPiece, g.nextPieceType, g.invaders, g.bullets]);

test('specified integer PRNG has frozen vectors, rejects malformed seeds', () => {
  const random = seededRandom(SEED);
  assert.deepEqual(Array.from({ length: 8 }, () => random() * 4294967296),
    [19088742, 4127578482, 1651034390, 799975818, 3224277892, 2972529764, 3296506093, 2446566329]);
  for (const seed of ['', 'x'.repeat(32), SEED.toUpperCase(), '0'.repeat(31)]) assert.throws(() => seededRandom(seed), /invalid_seed/);
});

test('frozen v1 end-to-end vectors: both modes, idle/held movement/rotation/drop and terminal snapshots', () => {
  const vectors = [
    ['softcore', 'idle', 3150, 0, '76fac580535e387273a29c83ab367e698812bc1d26b00a54e3ea3ce29c91491e'],
    ['softcore', 'drop', 51, 206, '3f6354b2fd7224a21c1372addc6db657026e9efa737d76602dd4f8c94fd52a83'],
    ['softcore', 'mixed', 64, 194, '52260c8e7fc52a037b2070c0cdd617ac938a9a8ff7068d7e057481fb7493db22'],
    ['hardcore', 'idle', 416, 0, '9ea03889dc8e7eb6553d452eab2dfa10191864550a8756c674386d191281cf3e'],
    ['hardcore', 'drop', 46, 170, 'f9638ad97a28604d0cfdf2d988921d3c18f3dab6beafe65baabcae3dc940becd'],
    ['hardcore', 'mixed', 52, 158, 'f83bbc074099c0764a266dd828899022741d8e4d3994a257b557121d3c3a4399'],
  ] as const;
  for (const [mode, kind, ticks, score, hash] of vectors) {
    const { game, replay } = finishedReplay(mode, kind);
    assert.equal(game.gameOver, true);
    assert.equal(game.ticks, ticks); assert.equal(game.score, score);
    assert.equal(createHash('sha256').update(snapshot(game)).digest('hex'), hash);
    assert.deepEqual(verifyReplay({ ...context, mode }, replay), { score, level: mode === 'hardcore' ? 11 : 1, ticks });
    const before = snapshot(game);
    game.step([INPUT.hardDrop]);
    assert.equal(snapshot(game), before); assert.equal(game.score, score); assert.equal(game.ticks, ticks);
  }
});

test('protocol rejects out-of-order, same-group bursts, oversized, nonfinite, extra fields and unknown actions', () => {
  for (const value of [null, [], {}, { ticks: 0, events: [] }, { ticks: 1.1, events: [] },
    { ticks: MAX_TICKS + 1, events: [] }, { ticks: Infinity, events: [] }, { ticks: 1, events: [], score: 100 },
    { ticks: 1, events: Array(MAX_EVENTS + 1).fill([1, 4]) }, { ticks: 1, events: [[1, 7]] },
    { ticks: 1, events: [[1, -1]] }, { ticks: 1, events: [[0, 4]] }, { ticks: 1, events: [[2, 4]] },
    { ticks: 2, events: [[2, 4], [1, 0]] }, { ticks: 1, events: [[1, 0], [1, 1]] },
    { ticks: 1, events: [[1, 5], [1, 6]] }, { ticks: 1, events: [[1, 4], [1, 4]] },
    { ticks: 1, events: [[1, 0], [1, 2], [1, 3], [1, 4], [1, 5]] },
    { ticks: 1, events: [[1, 4, 'extra']] }, { ticks: 1, events: [[1, NaN]] }]) {
    assert.equal(validReplay(value), false, JSON.stringify(value));
  }
  assert.equal(validReplay({ ticks: MAX_TICKS, events: [[1, 0], [1, 2], [1, 4], [1, 5], [MAX_TICKS, 6]] }), true);
});

test('verification rejects accelerated, nonterminal, trailing, tampered and old-rules submissions', () => {
  const { replay } = finishedReplay('softcore');
  assert.throws(() => verifyReplay({ ...context, rulesVersion: 'old' }, replay), /rules_mismatch/);
  const idle = finishedReplay('softcore', 'idle').replay;
  assert.throws(() => verifyReplay({ ...context, elapsedMs: idle.ticks * 20 - 2001 }, idle), /replay_too_fast/);
  assert.throws(() => verifyReplay(context, { ticks: replay.ticks - 1, events: replay.events.slice(0, -1) }), /replay_not_finished/);
  assert.throws(() => verifyReplay(context, { ...replay, ticks: replay.ticks + 1 }), /replay_after_game_over/);
  assert.throws(() => verifyReplay(context, { ...replay, events: [] }), /replay_not_finished/);
  // Different server seed/mode produces different authoritative outcomes, not client points.
  const result = verifyReplay(context, replay);
  assert.equal(result.score, 206);
  assert.throws(() => verifyReplay({ ...context, mode: 'hardcore' }, replay), /replay_after_game_over/);
});

test('held soft gravity, releases during locks, reversal, cooldowns and pause are deterministic', () => {
  const game = new GameSimulation(SEED, 'hardcore');
  game.step([INPUT.softOn]);
  const row = game.currentPiece!.row;
  game.step(); assert.ok(game.currentPiece!.row >= row + 2, '8ms gravity carries remainder within 20ms ticks');
  game.ignoreTimer = 200;
  game.step([INPUT.softOff]);
  game.ignoreTimer = 0;
  const after = game.currentPiece!.row;
  game.step(); assert.equal(game.currentPiece!.row, after, 'release is honored even while locked');
  game.reverseTimer = 200;
  const col = game.currentPiece!.col;
  game.step([INPUT.left]); assert.equal(game.currentPiece!.col, col + 1);
  game.step([INPUT.left]); assert.equal(game.currentPiece!.col, col + 1, 'server enforces cooldown');
  const paused = snapshot(game);
  assert.equal(snapshot(game), paused, 'pause means no tick, including bullets');
});

test('line clear points and level advancement are owned by simulation', () => {
  const game = new GameSimulation(SEED, 'softcore');
  game.currentPiece = { type: 'I', color: '#fff', shape: [[1, 1, 1, 1]], col: 3, row: ROWS - 1, rotation: 0 };
  game.grid[ROWS - 1] = Array.from({ length: COLS }, (_, c) => c >= 3 && c <= 6 ? null : '#fff');
  game.score = 999;
  game.step([INPUT.hardDrop]);
  assert.equal(game.lines, 1); assert.equal(game.score, 1039);
  assert.equal(game.levels.getLevel(), 2); assert.equal(game.levelStartScore, 1039);
});

test('fifth invader shot survives ship removal and bullets clear placed cells', () => {
  const game = new GameSimulation(SEED, 'hardcore');
  game.invaders.push({ x: BOARD_X + 10, direction: 1, shotTimer: 1480, shots: 4 });
  game.step(); assert.equal(game.invaders.length, 0); assert.equal(game.bullets.length, 1);
  game.bullets = [{ x: BOARD_X + 10, y: BOARD_Y - 2 }]; game.grid[0][0] = '#fff';
  game.step(); assert.equal(game.grid[0][0], null); assert.equal(game.bullets.length, 0);
});

test('budget overflow makes recorder local-only; snapshots cannot mutate recorded evidence', () => {
  const recorder = new ReplayRecorder();
  recorder.record(1, [INPUT.left]);
  const one = recorder.finish(1)!; one.events[0][1] = INPUT.right;
  assert.deepEqual(recorder.finish(1)!.events, [[1, INPUT.left]]);
  recorder.record(MAX_TICKS + 1, []); assert.equal(recorder.withinBudget, false); assert.equal(recorder.finish(1), null);
  const many = new ReplayRecorder();
  for (let t = 1; t <= MAX_EVENTS + 1; t++) many.record(t, [INPUT.rotate]);
  assert.equal(many.finish(MAX_EVENTS + 1), null);
});

test('retry digest canonicalizes keys, binds complete replay and player alias', async () => {
  const { replay } = finishedReplay('softcore');
  const digest = await submissionDigest('PLAYER', replay);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(await submissionDigest('PLAYER', { events: replay.events, ticks: replay.ticks }), digest);
  assert.notEqual(await submissionDigest('OTHER', replay), digest);
  assert.notEqual(await submissionDigest('PLAYER', { ...replay, events: [] }), digest);
});

function request(body: unknown, raw = false) {
  return new Request('https://test/submit-score', { method: 'POST',
    headers: { origin: ORIGIN, authorization: 'Bearer valid', 'content-type': 'application/json' },
    body: raw ? body as string : JSON.stringify(body) });
}
function api(options: { mode?: GameMode; seed?: string; elapsedMs?: number; receipt?: boolean; deny?: boolean } = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const handler = createHandler('submit', { allowedOrigins: [ORIGIN], ipSalt: 's'.repeat(32), userId: async () => 'verified-user',
    rpc: async (name, args) => {
      calls.push({ name, args });
      const data = name === 'ranking_attempt' ? (options.deny ? { error: 'rate_limited' } : { allowed: true })
        : name === 'inspect_ranked_run' ? { mode: options.mode ?? 'softcore', seed: options.seed ?? SEED, rulesVersion: RULES_VERSION,
          elapsedMs: options.elapsedMs ?? context.elapsedMs, ...(options.receipt ? { receipt: { accepted: true, inTop: true } } : {}) }
        : { accepted: true, inTop: true };
      return { data, error: null };
    } });
  return { handler, calls };
}
const body = () => ({ runId: ID, playerName: 'PLAYER', mode: 'softcore', replay: finishedReplay('softcore').replay });

test('HTTP replays server descriptor and finalizes only computed score/level and canonical hash', async () => {
  const { handler, calls } = api();
  const response = await handler(request(body())); assert.equal(response.status, 200);
  assert.deepEqual(calls.map(call => call.name), ['ranking_attempt', 'inspect_ranked_run', 'finalize_verified_run']);
  assert.equal(calls[2].args.p_score, 206); assert.equal(calls[2].args.p_level, 1);
  assert.equal(calls[2].args.p_user, 'verified-user'); assert.match(String(calls[2].args.p_digest), /^[a-f0-9]{64}$/);
});

test('malformed, forged-score, oversized and invalid replay attempts consume quota but NEVER finalize', async () => {
  for (const payload of ['{broken', JSON.stringify({ ...body(), score: 99999999 }),
    JSON.stringify({ ...body(), replay: { ticks: 1, events: [] } }),
    JSON.stringify({ ...body(), padding: 'x'.repeat(MAX_REPLAY_BYTES) })]) {
    const { handler, calls } = api();
    const response = await handler(request(payload, true));
    assert.ok([400, 413].includes(response.status));
    assert.equal(calls[0].name, 'ranking_attempt');
    assert.ok(!calls.some(call => call.name === 'finalize_verified_run'));
  }
  const { handler, calls } = api({ elapsedMs: 0 });
  const idle = finishedReplay('softcore', 'idle').replay;
  assert.equal((await handler(request({ ...body(), replay: idle }))).status, 400);
  assert.ok(!calls.some(call => call.name === 'finalize_verified_run'));
});

test('denied attempts stop before descriptor/replay; receipts skip replay but not quota/mode checks', async () => {
  const denied = api({ deny: true });
  assert.equal((await denied.handler(request(body()))).status, 429);
  assert.equal(denied.calls.length, 1);
  const retry = api({ receipt: true });
  assert.equal((await retry.handler(request(body()))).status, 200);
  assert.equal(retry.calls.length, 2);
  assert.equal((await retry.handler(request({ ...body(), mode: 'hardcore' }))).status, 400);
});

test('public leaderboard uses rate-limited read RPC, never arbitrary SQL or Auth', async () => {
  const calls: string[] = [];
  const read = createHandler('read', { allowedOrigins: [ORIGIN], ipSalt: 's'.repeat(32),
    userId: async () => { throw new Error('not required to view'); },
    rpc: async (name, args) => { calls.push(name); assert.ok(!('p_score' in args));
      return { data: name === 'ranking_attempt' ? { allowed: true } : [], error: null }; } });
  const response = await read(new Request('https://test/leaderboard', { method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{"mode":"hardcore"}' }));
  assert.equal(response.status, 200); assert.deepEqual(calls, ['ranking_attempt', 'get_leaderboard']);
});
