import { COLS, ROWS } from '../types';
import type { Grid, CellColor } from '../types';

/**
 * Create an empty game grid filled with null values.
 */
export function createEmptyGrid(): Grid {
  return Array.from({ length: ROWS }, () => Array<CellColor>(COLS).fill(null));
}

/**
 * Rotate a matrix 90 degrees clockwise.
 */
export function rotateMatrix(matrix: number[][]): number[][] {
  const N = matrix.length;
  const result = Array.from({ length: N }, () => Array(N).fill(0));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      result[x][N - 1 - y] = matrix[y][x];
    }
  }
  return result;
}

/**
 * Check if a piece at (row, col) with the given shape is valid.
 * Valid = all filled cells are within bounds and not overlapping placed blocks.
 */
export function isValidPosition(
  grid: Grid,
  shape: number[][],
  row: number,
  col: number
): boolean {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const boardRow = row + r;
      const boardCol = col + c;
      if (boardCol < 0 || boardCol >= COLS || boardRow >= ROWS) return false;
      if (boardRow < 0) continue;
      if (grid[boardRow][boardCol] !== null) return false;
    }
  }
  return true;
}

/**
 * Lock a piece into the grid by writing its cells.
 */
export function lockPiece(grid: Grid, shape: number[][], row: number, col: number, color: string): void {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const boardRow = row + r;
      const boardCol = col + c;
      if (boardRow >= 0 && boardRow < ROWS && boardCol >= 0 && boardCol < COLS) {
        grid[boardRow][boardCol] = color;
      }
    }
  }
}

/**
 * Get a random integer between min (inclusive) and max (inclusive).
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
