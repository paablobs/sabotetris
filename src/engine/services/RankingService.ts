import type { ScoreEntry } from '../../types/index.ts';

const STORAGE_KEY = 'sabotetris_ranking';
const MAX_ENTRIES = 20;
const MAX_PLAYER_NAME_LENGTH = 10;
const MAX_DATE_LENGTH = 64;
const HARDCORE_LEVEL = 11;

/**
 * RankingService manages the top-score leaderboard stored in localStorage.
 * Keeps up to 20 entries sorted by score descending.
 */
export class RankingService {
  getRanking(): ScoreEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      const parsed: unknown = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      const entries = parsed.filter(isScoreEntry).map(normalizeEntry);
      return entries.sort((a, b) => b.score - a.score);
    } catch {
      return [];
    }
  }

  addEntry(entry: ScoreEntry): void {
    if (!isScoreEntry(entry)) return;
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

function isScoreEntry(value: unknown): value is ScoreEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<ScoreEntry>;
  return (
    typeof entry.playerName === 'string' &&
    entry.playerName.trim().length > 0 &&
    entry.playerName.length <= MAX_PLAYER_NAME_LENGTH &&
    /^[-a-zA-Z0-9 .,]+$/.test(entry.playerName) &&
    typeof entry.score === 'number' && Number.isSafeInteger(entry.score) && entry.score >= 0 &&
    typeof entry.level === 'number' && Number.isInteger(entry.level) &&
    entry.level >= 1 &&
    (entry.mode === 'hardcore' ? entry.level === HARDCORE_LEVEL : entry.level < HARDCORE_LEVEL) &&
    typeof entry.date === 'string' &&
    entry.date.trim().length > 0 && entry.date.length <= MAX_DATE_LENGTH &&
    (entry.mode === undefined || entry.mode === 'softcore' || entry.mode === 'hardcore')
  );
}

function normalizeEntry(entry: ScoreEntry): ScoreEntry {
  return entry.mode ? entry : { ...entry, mode: 'softcore' };
}
