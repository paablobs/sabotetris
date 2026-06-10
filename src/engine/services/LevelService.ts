import { LEVELS, MAX_LEVEL, LINES_PER_LEVEL } from '../../data/levels';
import type { LevelDef } from '../../types';

/**
 * LevelService tracks current level and provides level-specific configuration.
 * Level advances every 10 lines cleared, up to level 10.
 */
export class LevelService {
  private level = 1;

  getLevel(): number {
    return this.level;
  }

  getLevelDef(): LevelDef {
    return LEVELS[this.level - 1] || LEVELS[MAX_LEVEL - 1];
  }

  getSpeed(): number {
    return this.getLevelDef().speed;
  }

  getChaosInterval(): number {
    return this.getLevelDef().chaosInterval;
  }

  getScoreMultiplier(): number {
    return this.getLevelDef().scoreMultiplier;
  }

  getMaxScore(): number {
    return this.getLevelDef().maxScore;
  }

  getBackgroundColor(): string {
    return this.getLevelDef().backgroundColor;
  }

  advanceLevel(): boolean {
    if (this.level >= MAX_LEVEL) return false;
    this.level++;
    return true;
  }

  setLevel(level: number): void {
    this.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  }

  /**
   * Check if the level should advance based on total lines cleared.
   * Returns true if level changed.
   */
  updateLevel(linesCleared: number): boolean {
    const newLevel = Math.min(MAX_LEVEL, Math.floor(linesCleared / LINES_PER_LEVEL) + 1);
    if (newLevel !== this.level) {
      this.level = newLevel;
      return true;
    }
    return false;
  }

  reset(): void {
    this.level = 1;
  }
}
