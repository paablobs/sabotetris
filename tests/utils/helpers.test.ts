import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEmptyGrid,
  rotateMatrix,
  isValidPosition,
  lockPiece,
  randomInt,
} from '../../src/utils/helpers';
import { COLS, ROWS } from '../../src/types';

describe('createEmptyGrid', () => {
  it('creates a ROWS x COLS grid of null cells', () => {
    const grid = createEmptyGrid();
    expect(grid).toHaveLength(ROWS);
    for (const row of grid) {
      expect(row).toHaveLength(COLS);
      expect(row.every((cell) => cell === null)).toBe(true);
    }
  });
});

describe('rotateMatrix', () => {
  it('rotates a matrix 90 degrees clockwise', () => {
    const input = [
      [1, 2],
      [3, 4],
    ];
    expect(rotateMatrix(input)).toEqual([
      [3, 1],
      [4, 2],
    ]);
  });

  it('does not mutate the input', () => {
    const input = [
      [1, 0],
      [0, 1],
    ];
    rotateMatrix(input);
    expect(input).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it('handles a 4x4 shape (I piece)', () => {
    const i = [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const rotated = rotateMatrix(i);
    expect(rotated.map((row) => row[2])).toEqual([1, 1, 1, 1]);
    expect(rotated[1]).toEqual([0, 0, 1, 0]);
  });
});

describe('isValidPosition', () => {
  let grid: string[][];
  beforeEach(() => {
    grid = createEmptyGrid();
  });

  it('accepts an in-bounds empty spot', () => {
    const shape = [
      [1, 1],
      [1, 1],
    ];
    expect(isValidPosition(grid, shape, 0, 4)).toBe(true);
  });

  it('rejects columns outside the board', () => {
    const shape = [[1]];
    expect(isValidPosition(grid, shape, 5, -1)).toBe(false);
    expect(isValidPosition(grid, shape, 5, COLS)).toBe(false);
  });

  it('rejects rows below the board', () => {
    const shape = [[1]];
    expect(isValidPosition(grid, shape, ROWS, 0)).toBe(false);
  });

  it('allows cells above the top of the board', () => {
    const shape = [[1]];
    expect(isValidPosition(grid, shape, -1, 0)).toBe(true);
  });

  it('rejects overlaps with placed blocks', () => {
    grid[10][5] = '#ff0000';
    const shape = [[1]];
    expect(isValidPosition(grid, shape, 10, 5)).toBe(false);
    expect(isValidPosition(grid, shape, 9, 5)).toBe(true);
  });

  it('ignores empty cells of the shape', () => {
    const shape = [
      [0, 1],
      [0, 0],
    ];
    grid[10][4] = '#ff0000';
    expect(isValidPosition(grid, shape, 10, 4)).toBe(true);
  });
});

describe('lockPiece', () => {
  it('writes only filled cells into the grid', () => {
    const grid = createEmptyGrid();
    const shape = [
      [1, 0],
      [1, 1],
    ];
    lockPiece(grid, shape, 3, 4, '#00ff00');
    expect(grid[3][4]).toBe('#00ff00');
    expect(grid[4][4]).toBe('#00ff00');
    expect(grid[4][5]).toBe('#00ff00');
    expect(grid[3][5]).toBeNull();
  });

  it('silently drops cells outside the board', () => {
    const grid = createEmptyGrid();
    const shape = [[1]];
    expect(() => lockPiece(grid, shape, -1, 0, '#ffffff')).not.toThrow();
    expect(grid[0][0]).toBeNull();
  });
});

describe('randomInt', () => {
  it('stays within [min, max] inclusive', () => {
    for (let i = 0; i < 200; i++) {
      const v = randomInt(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('returns min when min equals max', () => {
    expect(randomInt(3, 3)).toBe(3);
  });
});
