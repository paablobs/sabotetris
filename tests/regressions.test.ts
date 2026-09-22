import assert from 'node:assert/strict';
import test from 'node:test';
import { RankingService } from '../src/engine/services/RankingService.ts';
import { TapTracker } from '../src/engine/services/TouchGestureState.ts';

function installStorage(initial: string | null): { value: string | null } {
  const state = { value: initial };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => state.value,
      setItem: (_key: string, value: string) => { state.value = value; },
      removeItem: () => { state.value = null; },
    },
  });
  return state;
}

test('ranking ignores malformed stored rows before they reach the scene', () => {
  installStorage(JSON.stringify([
    { playerName: 'valid', score: 100, level: 2, date: 'today' },
    { playerName: 'missing score', level: 2, date: 'today' },
    null,
    { playerName: 'bad mode', score: 90, level: 1, date: 'today', mode: 'arcade' },
  ]));

  assert.deepEqual(new RankingService().getRanking(), [
    { playerName: 'valid', score: 100, level: 2, date: 'today', mode: 'softcore' },
  ]);
});

test('ranking returns an empty list for non-array storage', () => {
  installStorage(JSON.stringify({ playerName: 'not a list' }));
  assert.deepEqual(new RankingService().getRanking(), []);
});

test('ranking enforces score, level, and persisted string boundaries', () => {
  installStorage(JSON.stringify([
    { playerName: '0123456789', score: 0, level: 11, date: 'x'.repeat(64), mode: 'hardcore' },
    { playerName: 'softcore10', score: 1, level: 10, date: 'today' },
    { playerName: ' ', score: 1, level: 1, date: 'today' },
    { playerName: '01234567890', score: 2, level: 1, date: 'today' },
    { playerName: 'valid', score: -1, level: 1, date: 'today' },
    { playerName: 'valid', score: 1.5, level: 1, date: 'today' },
    { playerName: 'valid', score: 1, level: 0, date: 'today' },
    { playerName: 'valid', score: 1, level: 12, date: 'today' },
    { playerName: 'valid', score: 1, level: 1.5, date: 'today' },
    { playerName: 'valid', score: 1, level: 1, date: ' ' },
    { playerName: 'valid', score: 1, level: 1, date: 'x'.repeat(65) },
    { playerName: 'bad/name', score: 1, level: 1, date: 'today' },
    { playerName: 'softcore11', score: 1, level: 11, date: 'today', mode: 'softcore' },
    { playerName: 'hardcore10', score: 1, level: 10, date: 'today', mode: 'hardcore' },
    { playerName: 'default11', score: 1, level: 11, date: 'today' },
  ]));

  assert.deepEqual(new RankingService().getRanking(), [
    { playerName: 'softcore10', score: 1, level: 10, date: 'today', mode: 'softcore' },
    { playerName: '0123456789', score: 0, level: 11, date: 'x'.repeat(64), mode: 'hardcore' },
  ]);
});

test('ranking rejects malformed entries passed directly to addEntry', () => {
  const storage = installStorage(null);
  new RankingService().addEntry({
    playerName: 'valid',
    score: -1,
    level: 1,
    date: 'today',
  });

  assert.equal(storage.value, null);
});

test('a cancelled pointer clears pending double-tap state', () => {
  const taps = new TapTracker();
  assert.equal(taps.registerTap(100), false);
  taps.cancel();
  assert.equal(taps.registerTap(200), false);
  assert.equal(taps.registerTap(250), true);
});

test('tap timing resets after a hard drop', () => {
  const taps = new TapTracker();
  assert.equal(taps.registerTap(100), false);
  assert.equal(taps.registerTap(200), true);
  assert.equal(taps.registerTap(250), false);
});
