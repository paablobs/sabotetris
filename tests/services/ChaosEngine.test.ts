import { describe, it, expect, vi } from 'vitest';
import { ChaosEngine } from '../../src/engine/services/ChaosEngine';
import type { GameState } from '../../src/types';

const LEVEL_1_EFFECTS = ['Panic Drop', 'Locked Controls', 'Magnetic Drift'];
const ALL_SOFTCORE_EFFECTS = [
  'Panic Drop',
  'Locked Controls',
  'Magnetic Drift',
  'Greased Grip',
  'Slippery Fingers',
  'Spinning Out',
  'Gravity Surge',
  'Reverse Polarity',
  'Phantom Lock',
  'Color Blind',
  'Famine',
  'Quake',
];

function mockState(level: number): GameState {
  return {
    movePiece: vi.fn(() => true),
    rotatePiece: vi.fn(() => true),
    panicDrop: vi.fn(),
    setIgnoreInput: vi.fn(),
    setReverseInput: vi.fn(),
    lockPhantomCell: vi.fn(),
    setNextPieceHidden: vi.fn(),
    forceNextPieceType: vi.fn(),
    shiftBoardUp: vi.fn(),
    spawnSpaceInvader: vi.fn(),
    getLevel: () => level,
  };
}

function drawMany(engine: ChaosEngine, state: GameState, times = 400): string[] {
  const names: string[] = [];
  for (let i = 0; i < times; i++) {
    const effect = engine.applyRandomEffect();
    if (effect) names.push(effect.name);
  }
  return names;
}

describe('ChaosEngine', () => {
  it('only draws from the level-1 pool at level 1 in softcore', () => {
    const engine = new ChaosEngine(1, mockState(1), 'softcore');
    const names = drawMany(engine, mockState(1));
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => LEVEL_1_EFFECTS.includes(n))).toBe(true);
  });

  it('never draws locked effects even after many draws', () => {
    const engine = new ChaosEngine(3, mockState(3), 'softcore');
    const names = drawMany(engine, mockState(3), 1000);
    // Level 3 unlocks the first five effects (minLevel <= 3).
    expect(names.every((n) => ALL_SOFTCORE_EFFECTS.slice(0, 5).includes(n))).toBe(true);
  });

  it('unlocks all effects at high levels', () => {
    const engine = new ChaosEngine(10, mockState(10), 'softcore');
    const names = new Set(drawMany(engine, mockState(10), 2000));
    for (const name of ALL_SOFTCORE_EFFECTS) {
      expect(names.has(name)).toBe(true);
    }
  });

  it('executes the effect it returns', () => {
    const state = mockState(1);
    const engine = new ChaosEngine(1, state, 'softcore');
    const effect = engine.applyRandomEffect();
    expect(effect).not.toBeNull();
    // The executed callback must belong to the returned effect. Every
    // level-1 effect calls exactly one of these callbacks.
    const called =
      vi.mocked(state.movePiece).mock.calls.length +
      vi.mocked(state.rotatePiece).mock.calls.length +
      vi.mocked(state.panicDrop).mock.calls.length +
      vi.mocked(state.setIgnoreInput).mock.calls.length;
    expect(called).toBeGreaterThanOrEqual(1);
  });

  it('setMode adds the Space Invader to the hardcore pool', () => {
    const engine = new ChaosEngine(1, mockState(1), 'softcore');
    engine.setMode('hardcore');
    const names = drawMany(engine, mockState(1), 1000);
    expect(names).toContain('Space Invader');
    // Softcore effects stay available too.
    expect(names.some((n) => LEVEL_1_EFFECTS.includes(n))).toBe(true);
  });

  it('setMode removes the Space Invader when switching back', () => {
    const engine = new ChaosEngine(1, mockState(1), 'hardcore');
    engine.setMode('softcore');
    engine.setMode('hardcore');
    engine.setMode('softcore');
    const names = drawMany(engine, mockState(1), 1000);
    expect(names).not.toContain('Space Invader');
  });

  it('setLevel widens the pool without recreating effects', () => {
    const state = mockState(1);
    const engine = new ChaosEngine(1, state, 'softcore');
    engine.setLevel(12);
    const names = drawMany(engine, state, 1000);
    expect(names).toContain('Quake');
  });
});
