import { BOARD_X, BOARD_Y, BOARD_WIDTH, BOARD_HEIGHT, CELL_SIZE, COLS, ROWS } from './types.ts';
import type { Grid, PieceState, TetrominoType, GameState } from './types.ts';
import { PIECE_TYPES, TETROMINOES } from './pieces.ts';
import { createEmptyGrid, rotateMatrix, isValidPosition, lockPiece } from './helpers.ts';
import { LevelService } from './level.ts';
import { ChaosEngine } from './chaos.ts';
import { seededRandom } from './random.ts';
import { INPUT, TICK_MS } from './protocol.ts';
import type { GameMode, InputAction } from './protocol.ts';

export interface Invader { x: number; direction: number; shotTimer: number; shots: number }
export interface Bullet { x: number; y: number }
export interface PresentationEvents { lineClear: boolean; levelUp: boolean; chaos: string }

/** Single source of gameplay truth for browser and Edge. No clocks, IO or rendering.
 * Order: tick/timers -> gravity (carry remainder) -> chaos -> input -> projectiles.
 * Terminal state is absorbing. Pause is simply not calling step(). */
export class GameSimulation {
  readonly grid: Grid = createEmptyGrid();
  readonly levels = new LevelService();
  readonly mode: GameMode;
  currentPiece: PieceState | null = null;
  nextPieceType: TetrominoType;
  score = 0;
  lines = 0;
  levelStartScore = 0;
  levelStartLines = 0;
  ticks = 0;
  gameOver = false;
  ignoreTimer = 0;
  reverseTimer = 0;
  hiddenTimer = 0;
  invaders: Invader[] = [];
  bullets: Bullet[] = [];
  // Reused flags; server never allocates visual snapshots per tick.
  readonly presentation: PresentationEvents = { lineClear: false, levelUp: false, chaos: '' };
  private readonly random: () => number;
  private readonly chaos: ChaosEngine;
  private gravityMs = 0;
  private chaosMs = 0;
  private chaosIntervalMs: number;
  private softDropping = false;
  private horizontalAt = 0;
  private rotateAt = 0;
  private hardDropAt = 0;
  private softStepAt = 0;

  constructor(seed: string, mode: GameMode) {
    this.mode = mode;
    this.random = seededRandom(seed);
    if (mode === 'hardcore') this.levels.enableHardcoreMode();
    this.chaosIntervalMs = mode === 'hardcore' ? this.randomChaosInterval() : this.levels.getChaosInterval();
    const state: GameState = {
      movePiece: (dr, dc) => this.movePiece(dr, this.reverseTimer > 0 ? -dc : dc),
      rotatePiece: () => this.rotatePiece(), panicDrop: () => this.drop(false),
      setIgnoreInput: ms => { this.ignoreTimer = ms; },
      setReverseInput: ms => { this.reverseTimer = ms; },
      setNextPieceHidden: ms => { this.hiddenTimer = ms; },
      forceNextPieceType: type => { this.nextPieceType = type; },
      lockPhantomCell: () => this.lockPhantomCell(), shiftBoardUp: () => this.shiftBoardUp(),
      spawnSpaceInvader: () => this.invaders.push({ x: BOARD_X + 40 + this.random() * (BOARD_WIDTH - 80), direction: 1, shotTimer: 0, shots: 0 }),
      getLevel: () => this.levels.getLevel(),
    };
    this.chaos = new ChaosEngine(this.levels.getLevel(), state, mode, this.random);
    this.nextPieceType = this.randomPiece();
    this.spawnPiece();
  }

  step(actions: readonly InputAction[] = []): void {
    if (this.gameOver) return;
    this.ticks++;
    this.presentation.lineClear = false;
    this.presentation.levelUp = false;
    this.presentation.chaos = '';
    this.ignoreTimer = Math.max(0, this.ignoreTimer - TICK_MS);
    this.reverseTimer = Math.max(0, this.reverseTimer - TICK_MS);
    this.hiddenTimer = Math.max(0, this.hiddenTimer - TICK_MS);
    this.gravityMs += TICK_MS;
    // At level 11 soft gravity is 8ms: multiple sub-tick moves are intentional.
    let interval = this.levels.getSpeed() * (this.softDropping && !this.ignoreTimer ? 0.1 : 1);
    while (!this.gameOver && this.gravityMs >= interval) {
      this.gravityMs -= interval;
      if (!this.movePiece(1, 0)) this.lockCurrentPiece();
      interval = this.levels.getSpeed() * (this.softDropping && !this.ignoreTimer ? 0.1 : 1);
    }
    if (this.gameOver) return;
    this.chaosMs += TICK_MS;
    const target = this.mode === 'hardcore' ? this.chaosIntervalMs : this.levels.getChaosInterval();
    if (this.chaosMs >= target) {
      if (this.mode === 'hardcore' || this.random() < 0.65) this.triggerChaos();
      if (!this.gameOver && this.mode === 'hardcore' && this.random() < 0.35) this.triggerChaos();
      this.chaosMs = 0;
      if (this.mode === 'hardcore') this.chaosIntervalMs = this.randomChaosInterval();
    }
    for (const action of actions) {
      if (this.gameOver) break;
      this.input(action);
    }
    if (!this.gameOver) this.updateInvaders();
  }

  private input(action: InputAction): void {
    // Release must work during input locks. Held state resumes only after unlock.
    if (action === INPUT.softOff) { this.softDropping = false; return; }
    if (action === INPUT.softOn) { this.softDropping = true; return; }
    if (this.ignoreTimer > 0) return;
    if (action === INPUT.left || action === INPUT.right) {
      if (this.ticks < this.horizontalAt) return;
      this.horizontalAt = this.ticks + 2; // At most one horizontal move per 40ms.
      const direction = action === INPUT.left ? -1 : 1;
      this.movePiece(0, this.reverseTimer > 0 ? -direction : direction);
    } else if (action === INPUT.rotate) {
      if (this.ticks < this.rotateAt) return;
      this.rotateAt = this.ticks + 2;
      this.rotatePiece();
    } else if (action === INPUT.hardDrop) {
      if (this.ticks < this.hardDropAt) return;
      this.hardDropAt = this.ticks + 5; // Multiple pieces cannot be dropped in one tick.
      this.drop(true);
    } else if (action === INPUT.softStep && this.ticks >= this.softStepAt) {
      this.softStepAt = this.ticks + 2;
      this.movePiece(1, 0); // Mobile swipe, unlike held keyboard Down.
    }
  }

  private movePiece(dr: number, dc: number): boolean {
    const p = this.currentPiece;
    if (!p || this.gameOver || !isValidPosition(this.grid, p.shape, p.row + dr, p.col + dc)) return false;
    p.row += dr; p.col += dc;
    return true;
  }
  private rotatePiece(): boolean {
    const p = this.currentPiece;
    if (!p || this.gameOver) return false;
    const shape = rotateMatrix(p.shape);
    for (const offset of [0, -1, 1, -2, 2]) {
      if (!isValidPosition(this.grid, shape, p.row, p.col + offset)) continue;
      p.shape = shape; p.col += offset; p.rotation = (p.rotation + 1) % 4;
      return true;
    }
    return false;
  }
  private drop(points: boolean): void {
    let distance = 0;
    while (this.movePiece(1, 0)) distance++;
    if (points && !this.gameOver) this.score += distance * 2;
    this.lockCurrentPiece();
  }
  private lockCurrentPiece(): void {
    const p = this.currentPiece;
    if (!p || this.gameOver) return;
    // Locking a partly above-board piece is a top-out, never discard those cells.
    if (p.shape.some((row, r) => row.some(cell => cell !== 0 && p.row + r < 0))) {
      this.gameOver = true;
      return;
    }
    lockPiece(this.grid, p.shape, p.row, p.col, p.color);
    this.currentPiece = null;
    const remaining = this.grid.filter(row => !row.every(cell => cell !== null));
    const cleared = ROWS - remaining.length;
    if (cleared) {
      while (remaining.length < ROWS) remaining.unshift(Array<string | null>(COLS).fill(null));
      for (let r = 0; r < ROWS; r++) this.grid[r] = remaining[r];
      this.score += [0, 40, 100, 300, 1200][Math.min(cleared, 4)] * this.levels.getScoreMultiplier();
      this.lines += cleared;
      this.presentation.lineClear = true;
    }
    if (this.score - this.levelStartScore >= this.levels.getMaxScore() && this.levels.advanceLevel()) {
      this.chaos.setLevel(this.levels.getLevel());
      this.levelStartScore = this.score;
      this.levelStartLines = this.lines;
      this.presentation.levelUp = true;
    }
    this.spawnPiece();
  }
  private spawnPiece(): void {
    if (this.gameOver) return;
    const type = this.nextPieceType;
    const def = TETROMINOES[type];
    this.currentPiece = { type, shape: def.shape.map(row => [...row]), color: def.color,
      row: 0, col: Math.floor((COLS - def.shape[0].length) / 2), rotation: 0 };
    this.nextPieceType = this.randomPiece();
    const p = this.currentPiece;
    if (!isValidPosition(this.grid, p.shape, p.row, p.col)) this.gameOver = true;
  }
  private randomPiece(): TetrominoType { return PIECE_TYPES[Math.floor(this.random() * PIECE_TYPES.length)]; }
  private randomChaosInterval(): number { return (this.random() * 4 + 1) * 1000; }
  private triggerChaos(): void {
    if (this.gameOver) return;
    this.presentation.chaos = this.chaos.applyRandomEffect()?.name ?? '';
  }
  private lockPhantomCell(): void {
    const empty: [number, number][] = [];
    for (let r = ROWS / 2; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (this.grid[r][c] === null) empty.push([r, c]);
    }
    if (!empty.length) return;
    const [r, c] = empty[Math.floor(this.random() * empty.length)];
    this.grid[r][c] = '#888888';
  }
  private shiftBoardUp(): void {
    for (let r = 0; r < ROWS - 1; r++) this.grid[r] = [...this.grid[r + 1]];
    this.grid[ROWS - 1] = Array.from({ length: COLS }, () => this.random() < 0.3 ? '#556666' : null);
    const p = this.currentPiece;
    if (!p) return;
    while (!isValidPosition(this.grid, p.shape, p.row, p.col)) {
      p.row--;
      if (!p.shape.some((row, r) => row.some(cell => cell !== 0 && p.row + r >= 0))) {
        this.gameOver = true;
        return;
      }
    }
  }
  private updateInvaders(): void {
    for (const ship of this.invaders) {
      ship.x += ship.direction * 80 * TICK_MS / 1000;
      if (ship.x <= BOARD_X + 18 || ship.x >= BOARD_X + BOARD_WIDTH - 18) ship.direction *= -1;
      ship.shotTimer += TICK_MS;
      if (ship.shotTimer >= 1500) {
        ship.shotTimer -= 1500;
        ship.shots++;
        this.bullets.push({ x: ship.x, y: BOARD_Y - 2 });
      }
    }
    // Ship disappears after shot five; its bullets remain until collision/exit.
    this.invaders = this.invaders.filter(ship => ship.shots < 5);
    this.bullets = this.bullets.filter(bullet => {
      bullet.y += 300 * TICK_MS / 1000;
      const c = Math.floor((bullet.x - BOARD_X) / CELL_SIZE);
      const r = Math.floor((bullet.y - BOARD_Y) / CELL_SIZE);
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS && this.grid[r][c] !== null) {
        this.grid[r][c] = null;
        return false;
      }
      return bullet.y <= BOARD_Y + BOARD_HEIGHT + 20;
    });
  }
}
