import type { ScoreEntry } from '../../types';

const STORAGE_KEY = 'sabotetris_ranking';
const MAX_ENTRIES = 20;

/**
 * RankingService manages the top-score leaderboard stored in localStorage.
 * Keeps up to 20 entries sorted by score descending.
 */
export class RankingService {
  getRanking(): ScoreEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      const entries: ScoreEntry[] = JSON.parse(data);
      return entries.sort((a, b) => b.score - a.score);
    } catch {
      return [];
    }
  }

  addEntry(entry: ScoreEntry): void {
    const entries = this.getRanking();
    // Backward-compat: entries without mode default to softcore
    const normalized = entry.mode ? entry : { ...entry, mode: 'softcore' as const };
    entries.push(normalized);
    entries.sort((a, b) => b.score - a.score);
    const trimmed = entries.slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }

  isHighScore(score: number): boolean {
    const entries = this.getRanking();
    if (entries.length < MAX_ENTRIES) return true;
    const minScore = Math.min(...entries.map(e => e.score));
    return score > minScore;
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}
