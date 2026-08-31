import { describe, it, expect, beforeEach } from 'vitest';
import { RankingService } from '../../src/engine/services/RankingService';
import type { ScoreEntry } from '../../src/types';

class FakeStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

function entry(name: string, score: number): ScoreEntry {
  return { playerName: name, score, level: 1, date: '2026-01-01', mode: 'softcore' };
}

describe('RankingService', () => {
  let svc: RankingService;

  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new FakeStorage();
    svc = new RankingService();
  });

  it('starts empty', () => {
    expect(svc.getRanking()).toEqual([]);
  });

  it('returns entries sorted by score descending', () => {
    svc.addEntry(entry('a', 100));
    svc.addEntry(entry('b', 500));
    svc.addEntry(entry('c', 250));
    const scores = svc.getRanking().map((e) => e.score);
    expect(scores).toEqual([500, 250, 100]);
  });

  it('defaults missing mode to softcore (backward compat)', () => {
    svc.addEntry({ playerName: 'old', score: 1, level: 1, date: '' });
    expect(svc.getRanking()[0].mode).toBe('softcore');
  });

  it('trims the table to 20 entries', () => {
    for (let i = 0; i < 25; i++) {
      svc.addEntry(entry(`p${i}`, i * 10));
    }
    expect(svc.getRanking()).toHaveLength(20);
    const scores = svc.getRanking().map((e) => e.score);
    expect(Math.min(...scores)).toBe(5 * 10);
  });

  it('isHighScore is true when the table is not full', () => {
    svc.addEntry(entry('a', 100000));
    expect(svc.isHighScore(1)).toBe(true);
  });

  it('isHighScore requires beating the lowest entry when full', () => {
    for (let i = 0; i < 20; i++) {
      svc.addEntry(entry(`p${i}`, (i + 1) * 100));
    }
    expect(svc.isHighScore(50)).toBe(false);
    expect(svc.isHighScore(101)).toBe(true);
  });

  it('clear removes all entries', () => {
    svc.addEntry(entry('a', 1));
    svc.clear();
    expect(svc.getRanking()).toEqual([]);
  });
});
