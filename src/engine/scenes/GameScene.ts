import * as ex from 'excalibur';
import { COLS, CANVAS_WIDTH, CANVAS_HEIGHT } from '../../types';
import type { Grid, PieceState, TetrominoType, GameState } from '../../types';
import { TETROMINOES, PIECE_TYPES } from '../../data/tetrominoes';
import { LevelService } from '../services/LevelService';
import { ScoreService } from '../services/ScoreService';
import { ChaosEngine } from '../services/ChaosEngine';
import {
  createEmptyGrid,
  rotateMatrix,
  isValidPosition,
  lockPiece,
  randomInt,
} from '../../utils/helpers';
import { BoardActor } from '../actors/Board';
import { SidePanel } from '../actors/SidePanel';

export class GameScene extends ex.Scene {
  private grid: Grid;
  private currentPiece: PieceState | null = null;
  private nextPieceType: TetrominoType = 'I';

  private boardActor!: BoardActor;
  private sidePanel!: SidePanel;

  private scoreService = new ScoreService();
  private levelService = new LevelService();
  private chaosEngine!: ChaosEngine;

  private dropTimer = 0;
  private chaosAccum = 0;
  private gameOver = false;
  private paused = false;

  private ignoreInput = false;
  private reverseInput = false;
  private ignoreTimer = 0;
  private reverseTimer = 0;

  private readonly KEY_REPEAT = 140;
  private keyRepeatDelay = this.KEY_REPEAT;

  private pauseOverlayActor!: ex.Actor;

  constructor() {
    super();
    this.grid = createEmptyGrid();
  }

  onInitialize(_engine: ex.Engine): void {
    this.camera.pos = new ex.Vector(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    this.boardActor = new BoardActor();
    this.add(this.boardActor);

    this.sidePanel = new SidePanel();
    this.add(this.sidePanel);

    this.pauseOverlayActor = this.createPauseOverlay();
    this.pauseOverlayActor.graphics.visible = false;
    this.add(this.pauseOverlayActor);

    this.initChaosEngine();
  }

  onActivate(_context: ex.SceneActivationContext<unknown>): void {
    this.paused = false;
    if (this.pauseOverlayActor) {
      this.pauseOverlayActor.graphics.visible = false;
    }
    this.resetGame();
  }

  onDeactivate(): void {
    this.currentPiece = null;
  }

  private resetGame(): void {
    this.grid = createEmptyGrid();
    this.gameOver = false;
    this.ignoreInput = false;
    this.reverseInput = false;
    this.ignoreTimer = 0;
    this.reverseTimer = 0;
    this.dropTimer = 0;
    this.chaosAccum = 0;
    this.keyRepeatDelay = this.KEY_REPEAT;

    this.scoreService.reset();
    this.levelService.reset();
    this.chaosEngine.setLevel(this.levelService.getLevel());

    this.nextPieceType = this.randomPieceType();
    this.spawnPiece();

    this.updateSidePanel();
    this.updateBoardDisplay();
  }

  onPreUpdate(_engine: ex.Engine, delta: number): void {
    if (this.gameOver) return;

    this.handlePauseToggle(_engine);

    if (this.paused) return;

    this.updateTimedEffects(delta);

    const dt = delta / 1000;
    this.dropTimer += dt;
    if (this.dropTimer >= this.getDropInterval()) {
      this.applyGravity();
      this.dropTimer = 0;
    }

    this.chaosAccum += dt;
    if (this.chaosAccum >= this.getChaosInterval()) {
      this.triggerChaos();
      this.chaosAccum = 0;
    }

    this.handleInput(_engine, delta);

    this.updateBoardDisplay();
    this.sidePanel.updateChaosTimer(delta);
  }

  private getDropInterval(): number {
    return Math.max(0.1, 0.8 - (this.levelService.getLevel() - 1) * 0.07);
  }

  private getChaosInterval(): number {
    return Math.max(0.8, 5 - (this.levelService.getLevel() - 1) * 0.45);
  }

  private initChaosEngine(): void {
    const gameState: GameState = {
      movePiece: (dr, dc) => this.movePieceWithChecks(dr, this.reverseInput ? -dc : dc),
      rotatePiece: () => this.rotatePieceWithChecks(),
      panicDrop: () => this.panicDrop(),
      setIgnoreInput: (d: number) => { this.ignoreInput = true; this.ignoreTimer = d; },
      setReverseInput: (d: number) => { this.reverseInput = true; this.reverseTimer = d; },
    };
    this.chaosEngine = new ChaosEngine(this.levelService.getLevel(), gameState);
  }

  private updateTimedEffects(delta: number): void {
    if (this.ignoreInput) {
      this.ignoreTimer -= delta;
      if (this.ignoreTimer <= 0) {
        this.ignoreInput = false;
        this.sidePanel.setChaosEffect('', 0);
      }
    }

    if (this.reverseInput) {
      this.reverseTimer -= delta;
      if (this.reverseTimer <= 0) {
        this.reverseInput = false;
        this.sidePanel.setChaosEffect('', 0);
      }
    }
  }

  private handlePauseToggle(engine: ex.Engine): void {
    const kb = engine.input.keyboard;
    if (kb.wasPressed(ex.Input.Keys.Escape) || kb.wasPressed(ex.Input.Keys.P)) {
      this.paused = !this.paused;
      this.pauseOverlayActor.graphics.visible = this.paused;
    }
  }

  private createPauseOverlay(): ex.Actor {
    const overlay = new ex.Actor({
      x: 0,
      y: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      anchor: ex.Vector.Zero,
    });

    const graphic = new ex.Canvas({
      cache: true,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      draw: (ctx) => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.fillStyle = '#ddeeff';
        ctx.font = '48px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80);

        const bw = 220, bh = 50;
        const bx = (CANVAS_WIDTH - bw) / 2;
        const by1 = CANVAS_HEIGHT / 2 - 10;
        const by2 = CANVAS_HEIGHT / 2 + 60;

        ctx.fillStyle = '#1a2a3a';
        ctx.fillRect(bx, by1, bw, bh);
        ctx.strokeStyle = '#4a6a8a';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by1, bw, bh);
        ctx.fillStyle = '#ddeeff';
        ctx.font = '22px monospace';
        ctx.fillText('CONTINUE', CANVAS_WIDTH / 2, by1 + bh / 2 + 2);

        ctx.fillStyle = '#1a2a3a';
        ctx.fillRect(bx, by2, bw, bh);
        ctx.strokeStyle = '#4a6a8a';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by2, bw, bh);
        ctx.fillStyle = '#ddeeff';
        ctx.font = '22px monospace';
        ctx.fillText('HOME', CANVAS_WIDTH / 2, by2 + bh / 2 + 2);
      },
    });
    overlay.graphics.use(graphic);

    overlay.on('pointerup', (evt) => {
      const wp = evt.worldPos;
      const bw = 220, bh = 50;
      const bx = (CANVAS_WIDTH - bw) / 2;
      const by1 = CANVAS_HEIGHT / 2 - 10;
      const by2 = CANVAS_HEIGHT / 2 + 60;

      if (wp.x >= bx && wp.x <= bx + bw && wp.y >= by1 && wp.y <= by1 + bh) {
        this.paused = false;
        this.pauseOverlayActor.graphics.visible = false;
      } else if (wp.x >= bx && wp.x <= bx + bw && wp.y >= by2 && wp.y <= by2 + bh) {
        this.paused = false;
        this.pauseOverlayActor.graphics.visible = false;
        this.engine?.goToScene('menu');
      }
    });
    overlay.pointer.useGraphicsBounds = true;

    return overlay;
  }

  private handleInput(engine: ex.Engine, delta: number): void {
    const kb = engine.input.keyboard;

    this.keyRepeatDelay -= delta;

    const moveLeft = () => this.movePieceWithChecks(0, this.reverseInput ? 1 : -1);
    const moveRight = () => this.movePieceWithChecks(0, this.reverseInput ? -1 : 1);

    if (kb.wasPressed(ex.Input.Keys.Left) && !this.ignoreInput) {
      this.keyRepeatDelay = this.KEY_REPEAT;
      moveLeft();
    } else if (kb.wasPressed(ex.Input.Keys.Right) && !this.ignoreInput) {
      this.keyRepeatDelay = this.KEY_REPEAT;
      moveRight();
    } else if (kb.isHeld(ex.Input.Keys.Left) && this.keyRepeatDelay <= 0 && !this.ignoreInput) {
      this.keyRepeatDelay = this.KEY_REPEAT;
      moveLeft();
    } else if (kb.isHeld(ex.Input.Keys.Right) && this.keyRepeatDelay <= 0 && !this.ignoreInput) {
      this.keyRepeatDelay = this.KEY_REPEAT;
      moveRight();
    }

    if (kb.wasPressed(ex.Input.Keys.Up) && !this.ignoreInput) {
      this.rotatePieceWithChecks();
    }

    if (kb.wasPressed(ex.Input.Keys.Down) && !this.ignoreInput) {
      this.hardDrop();
    }
  }

  private movePieceWithChecks(dRow: number, dCol: number): boolean {
    if (!this.currentPiece) return false;

    const newRow = this.currentPiece.row + dRow;
    const newCol = this.currentPiece.col + dCol;

    if (isValidPosition(this.grid, this.currentPiece.shape, newRow, newCol)) {
      this.currentPiece.row = newRow;
      this.currentPiece.col = newCol;
      return true;
    }
    return false;
  }

  private rotatePieceWithChecks(): boolean {
    if (!this.currentPiece) return false;

    const newShape = rotateMatrix(this.currentPiece.shape);
    const offsets = [0, -1, 1, -2, 2];

    for (const offset of offsets) {
      if (
        isValidPosition(this.grid, newShape, this.currentPiece.row, this.currentPiece.col + offset)
      ) {
        this.currentPiece.shape = newShape;
        this.currentPiece.col += offset;
        this.currentPiece.rotation = (this.currentPiece.rotation + 1) % 4;
        return true;
      }
    }

    return false;
  }

  private applyGravity(): void {
    if (!this.currentPiece) return;

    if (isValidPosition(this.grid, this.currentPiece.shape, this.currentPiece.row + 1, this.currentPiece.col)) {
      this.currentPiece.row++;
    } else {
      this.lockCurrentPiece();
    }
  }

  private lockCurrentPiece(): void {
    if (!this.currentPiece) return;

    lockPiece(
      this.grid,
      this.currentPiece.shape,
      this.currentPiece.row,
      this.currentPiece.col,
      this.currentPiece.color
    );

    this.currentPiece = null;

    const rows = this.findCompletedRows();
    if (rows.length > 0) {
      this.clearRows(rows);
      const lineScore = this.getLineClearScore(rows.length);
      this.scoreService.addScore(lineScore);
      this.scoreService.addLines(rows.length);

      if (this.levelService.updateLevel(this.scoreService.getLinesCleared())) {
        this.chaosEngine.setLevel(this.levelService.getLevel());
      }
    }

    this.scoreService.addScore(10 * this.levelService.getLevel());

    this.updateSidePanel();
    this.spawnPiece();
  }

  private findCompletedRows(): number[] {
    const rows: number[] = [];
    for (let y = 0; y < this.grid.length; y++) {
      if (this.grid[y].every(c => c !== null)) rows.push(y);
    }
    return rows;
  }

  private clearRows(rows: number[]): void {
    const flags = new Array<boolean>(this.grid.length).fill(false);
    for (const y of rows) flags[y] = true;

    let writeY = this.grid.length - 1;
    for (let y = this.grid.length - 1; y >= 0; y--) {
      if (!flags[y]) {
        if (writeY !== y) {
          this.grid[writeY] = this.grid[y];
        }
        writeY--;
      }
    }
    for (let y = writeY; y >= 0; y--) {
      this.grid[y] = Array(COLS).fill(null);
    }
  }

  private getLineClearScore(count: number): number {
    const lineScores = [0, 40, 100, 300, 1200];
    return lineScores[Math.min(count, 4)] * this.levelService.getLevel();
  }

  private hardDrop(): void {
    if (!this.currentPiece) return;
    let dropped = 0;
    while (isValidPosition(this.grid, this.currentPiece.shape, this.currentPiece.row + 1, this.currentPiece.col)) {
      this.currentPiece.row++;
      dropped++;
    }
    this.scoreService.addScore(dropped * 2);
    this.lockCurrentPiece();
  }

  private panicDrop(): void {
    if (!this.currentPiece) return;

    while (
      isValidPosition(
        this.grid,
        this.currentPiece.shape,
        this.currentPiece.row + 1,
        this.currentPiece.col
      )
    ) {
      this.currentPiece.row++;
    }

    this.lockCurrentPiece();
  }

  private spawnPiece(): void {
    const type = this.nextPieceType;
    const def = TETROMINOES[type];

    this.currentPiece = {
      type,
      shape: def.shape.map((row) => [...row]),
      color: def.color,
      row: 0,
      col: Math.floor((COLS - def.shape[0].length) / 2),
      rotation: 0,
    };

    this.nextPieceType = this.randomPieceType();

    if (!isValidPosition(this.grid, this.currentPiece.shape, this.currentPiece.row, this.currentPiece.col)) {
      this.endGame();
    }
  }

  private endGame(): void {
    this.gameOver = true;

    this.engine?.goToScene('gameover', {
      sceneActivationData: {
        score: this.scoreService.getScore(),
        level: this.levelService.getLevel(),
      },
    });
  }

  private triggerChaos(): void {
    const effect = this.chaosEngine.applyRandomEffect();
    if (effect) {
      this.sidePanel.setChaosEffect(effect.name, 2000);
    }
  }

  private randomPieceType(): TetrominoType {
    return PIECE_TYPES[randomInt(0, PIECE_TYPES.length - 1)];
  }

  private updateSidePanel(): void {
    this.sidePanel.setNextPiece(this.nextPieceType);
    this.sidePanel.setScore(this.scoreService.getScore());
    this.sidePanel.setLevel(this.levelService.getLevel());
    this.sidePanel.setLines(this.scoreService.getLinesCleared());
  }

  private updateBoardDisplay(): void {
    this.boardActor.setGrid(this.grid);
    this.boardActor.setCurrentPiece(this.currentPiece);
  }
}
