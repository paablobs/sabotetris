import type { TetrominoType, TetrominoDef } from '../types';

/**
 * Tetromino definitions using standard SRS base shapes (rotation 0).
 * Each shape is a 2D matrix where 1 = filled cell.
 * Colors use a desaturated/matte palette fitting the game's aesthetic.
 */
export const TETROMINOES: Record<TetrominoType, TetrominoDef> = {
  I: {
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    color: '#6BA5A5',
  },
  O: {
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: '#B8B86B',
  },
  T: {
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: '#9B6BB8',
  },
  S: {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    color: '#6BB86B',
  },
  Z: {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    color: '#B86B6B',
  },
  J: {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: '#6B6BB8',
  },
  L: {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    color: '#B88B6B',
  },
};

export const PIECE_TYPES: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
