/**
 * ScoreService manages scoring and lines cleared.
 * Tracks current score, lines cleared, and handles score calculation.
 */
export class ScoreService {
  private score = 0;
  private linesCleared = 0;

  getScore(): number {
    return this.score;
  }

  getLinesCleared(): number {
    return this.linesCleared;
  }

  addScore(points: number): void {
    this.score += points;
  }

  addLines(count: number): void {
    this.linesCleared += count;
  }

  reset(): void {
    this.score = 0;
    this.linesCleared = 0;
  }
}
