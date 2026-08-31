import { describe, it, expect } from 'vitest';
import { LevelService } from '../../src/engine/services/LevelService';
import { LEVELS, MAX_LEVEL, HARDCORE_LEVEL } from '../../src/data/levels';

describe('LevelService', () => {
  it('starts at level 1 with level 1 config', () => {
    const svc = new LevelService();
    expect(svc.getLevel()).toBe(1);
    expect(svc.getSpeed()).toBe(LEVELS[0].speed);
  });

  it('advances one level at a time until max', () => {
    const svc = new LevelService();
    for (let i = 1; i < MAX_LEVEL; i++) {
      expect(svc.advanceLevel()).toBe(true);
      expect(svc.getLevel()).toBe(i + 1);
    }
    expect(svc.advanceLevel()).toBe(false);
    expect(svc.getLevel()).toBe(MAX_LEVEL);
  });

  it('clamps setLevel into [1, MAX_LEVEL]', () => {
    const svc = new LevelService();
    svc.setLevel(0);
    expect(svc.getLevel()).toBe(1);
    svc.setLevel(99);
    expect(svc.getLevel()).toBe(MAX_LEVEL);
    svc.setLevel(3.9);
    expect(svc.getLevel()).toBe(3);
  });

  it('hardcore mode pins all config to the hardcore level', () => {
    const svc = new LevelService();
    svc.advanceLevel();
    svc.enableHardcoreMode();
    expect(svc.getLevel()).toBe(HARDCORE_LEVEL.level);
    expect(svc.getSpeed()).toBe(HARDCORE_LEVEL.speed);
    expect(svc.getChaosInterval()).toBe(HARDCORE_LEVEL.chaosInterval);
    expect(svc.getMaxScore()).toBe(Infinity);
    expect(svc.advanceLevel()).toBe(false);
  });

  it('reset restores defaults and clears hardcore mode', () => {
    const svc = new LevelService();
    svc.enableHardcoreMode();
    svc.reset();
    expect(svc.isHardcoreMode()).toBe(false);
    expect(svc.getLevel()).toBe(1);
  });

  it('interpolates background color between current and next level', () => {
    const svc = new LevelService();
    expect(svc.getBackgroundColorForScore(0)).toBe(LEVELS[0].backgroundColor);

    const full = LEVELS[0].maxScore + 1;
    expect(svc.getBackgroundColorForScore(full)).not.toBe(LEVELS[0].backgroundColor);
    expect(svc.getBackgroundColorForScore(full)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns the last level color at max level', () => {
    const svc = new LevelService();
    svc.setLevel(MAX_LEVEL);
    expect(svc.getBackgroundColorForScore(999999)).toBe(LEVELS[MAX_LEVEL - 1].backgroundColor);
  });
});
