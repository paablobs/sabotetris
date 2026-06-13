import { LEVELS, MAX_LEVEL, HARDCORE_LEVEL } from '../../data/levels';
import type { LevelDef } from '../../types';

/**
 * LevelService tracks current level and provides level-specific configuration.
 * Level advances when the score target for the current level is reached.
 */
export class LevelService {
  private level = 1;
  private hardcoreMode = false;

  getLevel(): number {
    return this.hardcoreMode ? HARDCORE_LEVEL.level : this.level;
  }

  isHardcoreMode(): boolean {
    return this.hardcoreMode;
  }

  enableHardcoreMode(): void {
    this.hardcoreMode = true;
  }

  getLevelDef(): LevelDef {
    if (this.hardcoreMode) return HARDCORE_LEVEL;
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

  getBackgroundColorForScore(score: number): string {
    if (this.hardcoreMode) return HARDCORE_LEVEL.backgroundColor;
    if (this.level >= MAX_LEVEL) return LEVELS[MAX_LEVEL - 1].backgroundColor;

    const currentDef = LEVELS[this.level - 1];
    const nextDef = LEVELS[this.level];
    const progress = Math.min(score / currentDef.maxScore, 1);

    return this.interpolateHex(currentDef.backgroundColor, nextDef.backgroundColor, progress);
  }

  private interpolateHex(color1: string, color2: string, factor: number): string {
    const r1 = parseInt(color1.substring(1, 3), 16);
    const g1 = parseInt(color1.substring(3, 5), 16);
    const b1 = parseInt(color1.substring(5, 7), 16);
    const r2 = parseInt(color2.substring(1, 3), 16);
    const g2 = parseInt(color2.substring(3, 5), 16);
    const b2 = parseInt(color2.substring(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);

    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  advanceLevel(): boolean {
    if (this.hardcoreMode) return false;
    if (this.level >= MAX_LEVEL) return false;
    this.level++;
    return true;
  }

  setLevel(level: number): void {
    this.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  }

  reset(): void {
    this.level = 1;
    this.hardcoreMode = false;
  }
}
