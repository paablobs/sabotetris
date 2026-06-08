export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export type CellColor = string | null;

export type Grid = CellColor[][];

export interface PieceState {
  type: TetrominoType;
  shape: number[][];
  color: string;
  row: number;
  col: number;
  rotation: number;
}

export interface TetrominoDef {
  shape: number[][];
  color: string;
}

export interface LevelDef {
  level: number;
  speed: number;
  chaosInterval: number;
  scoreMultiplier: number;
  backgroundColor: string;
}

export interface ScoreEntry {
  playerName: string;
  score: number;
  level: number;
  date: string;
}

export interface GameState {
  movePiece(dRow: number, dCol: number): boolean;
  rotatePiece(): boolean;
  panicDrop(): void;
  setIgnoreInput(duration: number): void;
  setReverseInput(duration: number): void;
}

export interface ChaosEffect {
  readonly name: string;
  readonly description: string;
  execute(state: GameState): void;
}

export const COLS = 10;
export const ROWS = 20;
export const CELL_SIZE = 32;
export const BOARD_WIDTH = COLS * CELL_SIZE;
export const BOARD_HEIGHT = ROWS * CELL_SIZE;
export const BOARD_X = 20;
export const BOARD_Y = 30;
export const PANEL_X = BOARD_X + BOARD_WIDTH + 20;
export const CANVAS_WIDTH = 540;
export const CANVAS_HEIGHT = 700;
