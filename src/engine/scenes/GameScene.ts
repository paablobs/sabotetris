import * as ex from 'excalibur';
import { COLS, CANVAS_WIDTH, CANVAS_HEIGHT } from '../../types';
import type { Grid, PieceState, TetrominoType, GameState } from '../../types';
import { TETROMINOES, PIECE_TYPES } from '../../data/tetrominoes';
import { LevelService } from '../services/LevelService';
import { MAX_LEVEL } from '../../data/levels';
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
import { DVDActor } from '../actors/DVD';
import { SpaceInvaderActor } from '../actors/SpaceInvader';
import { admin } from '../services/AdminService';
import { isMobile, TouchInput } from '../services/MobileService';
import { audio, drawMuteIcon } from '../services/AudioService';

export class GameScene extends ex.Scene {
  private grid: Grid;
  private currentPiece: PieceState | null = null;
  private nextPieceType: TetrominoType = 'I';

  private boardActor!: BoardActor;
  private sidePanel!: SidePanel;
  private backgroundActor!: ex.Actor;
  private backgroundSetColor: (c: string) => void = () => {};
  private touchInput: TouchInput | null = null;
  private popstateHandler: (() => void) | null = null;

  private scoreService = new ScoreService();
  private levelService = new LevelService();
  private chaosEngine!: ChaosEngine;

  private dropTimer = 0;
  private chaosAccum = 0;
  private nextChaosInterval = 5;
  private gameOver = false;
  private paused = false;
  private softDropping = false;

  private highestReachedLevel = 1;
  private levelCompleteShown = false;
  private levelStartScore = 0;
  private levelStartLines = 0;

  private ignoreInput = false;
  private reverseInput = false;
  private ignoreTimer = 0;
  private reverseTimer = 0;
  private nextPieceHidden = false;
  private nextPieceHiddenTimer = 0;

  private readonly KEY_REPEAT = 140;
  private keyRepeatDelay = this.KEY_REPEAT;

  private pauseOverlayActor!: ex.Actor;
  private levelCompleteOverlayActor!: ex.Actor;

  private mode: 'softcore' | 'hardcore' = 'softcore';
  private dvdActor: DVDActor | null = null;

  constructor() {
    super();
    this.grid = createEmptyGrid();
  }

  onInitialize(engine: ex.Engine): void {
    this.camera.pos = new ex.Vector(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    const bg = this.createBackgroundActor();
    this.backgroundActor = bg.actor;
    this.backgroundSetColor = bg.setColor;
    this.backgroundActor.z = -10;
    this.add(this.backgroundActor);

    this.boardActor = new BoardActor();
    this.add(this.boardActor);

    this.sidePanel = new SidePanel();
    this.add(this.sidePanel);

    this.pauseOverlayActor = this.createPauseOverlay();
    this.pauseOverlayActor.graphics.visible = false;
    this.pauseOverlayActor.z = 100;
    this.add(this.pauseOverlayActor);

    this.levelCompleteOverlayActor = this.createLevelCompleteOverlay();
    this.levelCompleteOverlayActor.graphics.visible = false;
    this.levelCompleteOverlayActor.z = 100;
    this.add(this.levelCompleteOverlayActor);

    this.add(this.createMuteButton());

    if (isMobile) {
      const canvas = engine.canvas;
      this.touchInput = new TouchInput(canvas, engine, {
        moveLeft: () => {
          if (this.ignoreInput) return;
          this.movePieceWithChecks(0, this.reverseInput ? 1 : -1);
        },
        moveRight: () => {
          if (this.ignoreInput) return;
          this.movePieceWithChecks(0, this.reverseInput ? -1 : 1);
        },
        rotate: () => {
          if (this.ignoreInput) return;
          this.rotatePieceWithChecks();
        },
        softDrop: () => {
          if (this.ignoreInput) return;
          this.movePieceWithChecks(1, 0);
        },
        hardDrop: () => {
          if (this.ignoreInput) return;
          this.hardDrop();
        },
      });
    }

    this.initChaosEngine();
  }

  private createBackgroundActor(): { actor: ex.Actor; setColor: (c: string) => void } {
    let color = '#0d0d1a';
    const actor = new ex.Actor({
      x: 0,
      y: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      anchor: ex.Vector.Zero,
    });
    const graphic = new ex.Canvas({
      cache: false,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      draw: (ctx) => {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      },
    });
    actor.graphics.use(graphic);
    return {
      actor,
      setColor: (c: string) => { color = c; },
    };
  }

  private applyLevelVisuals(): void {
    const color = this.levelService.getBackgroundColor();
    this.backgroundSetColor(color);
    this.boardActor.setBackgroundColor(color);
  }

  private createMuteButton(): ex.Actor {
    const size = 44;
    const actor = new ex.Actor({
      x: CANVAS_WIDTH - 12 - size / 2,
      y: 12 + size / 2,
      width: size,
      height: size,
      anchor: ex.Vector.Half,
      z: 50,
    });
    const graphic = new ex.Canvas({
      cache: false,
      width: size,
      height: size,
      draw: (ctx) => {
        const muted = audio.isMuted();
        const accent = muted ? '#ff4d6d' : '#4dd0ff';
        ctx.fillStyle = muted ? 'rgba(255, 77, 109, 0.18)' : 'rgba(77, 208, 255, 0.18)';
        ctx.fillRect(0, 0, size, size);
        ctx.strokeStyle = muted ? 'rgba(255, 77, 109, 0.6)' : 'rgba(77, 208, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, size, size);
        drawMuteIcon(ctx, size, muted, accent);
      },
    });
    actor.graphics.use(graphic);

    actor.on('pointerdown', () => {
      audio.toggleMute();
    });
    actor.pointer.useGraphicsBounds = true;

    return actor;
  }

  onActivate(_context: ex.SceneActivationContext<unknown>): void {
    this.paused = false;
    if (this.pauseOverlayActor) {
      this.pauseOverlayActor.graphics.visible = false;
    }
    this.touchInput?.enable();

    const data = _context.data as { mode?: 'softcore' | 'hardcore' } | undefined;
    this.mode = data?.mode ?? 'softcore';

    this.resetGame();

    if (this.mode === 'hardcore') {
      audio.playMusic('hardcore');
      this.dvdActor = new DVDActor();
      this.add(this.dvdActor);
    } else {
      audio.playMusic('game');
    }

    if (isMobile) {
      history.pushState({ sabo: 'game' }, '');
      this.popstateHandler = () => {
        history.pushState({ sabo: 'game' }, '');
        this.togglePauseFromTouch();
      };
      window.addEventListener('popstate', this.popstateHandler);
    }
  }

  onDeactivate(): void {
    this.currentPiece = null;
    this.touchInput?.disable();
    audio.stopMusic();
    if (this.popstateHandler) {
      window.removeEventListener('popstate', this.popstateHandler);
      this.popstateHandler = null;
    }
    if (this.dvdActor) {
      this.dvdActor.kill();
      this.dvdActor = null;
    }
  }

  private resetGame(): void {
    this.grid = createEmptyGrid();
    this.gameOver = false;
    this.ignoreInput = false;
    this.reverseInput = false;
    this.ignoreTimer = 0;
    this.reverseTimer = 0;
    this.nextPieceHidden = false;
    this.nextPieceHiddenTimer = 0;
    this.dropTimer = 0;
    this.chaosAccum = 0;
    this.nextChaosInterval = this.mode === 'hardcore' ? Math.random() * 4 + 1 : 5;
    this.softDropping = false;
    this.keyRepeatDelay = this.KEY_REPEAT;
    this.highestReachedLevel = 1;
    this.levelCompleteShown = false;
    this.levelCompleteOverlayActor.graphics.visible = false;

    this.scoreService.reset();
    this.levelService.reset();
    if (this.mode === 'hardcore') {
      this.levelService.enableHardcoreMode();
    }
    this.levelStartScore = 0;
    this.levelStartLines = 0;
    this.chaosEngine.setLevel(this.levelService.getLevel());
    this.chaosEngine.setMode(this.mode);
    this.applyLevelVisuals();

    this.nextPieceType = this.randomPieceType();
    this.spawnPiece();

    this.updateSidePanel();
    this.updateBoardDisplay();
  }

  onPreUpdate(_engine: ex.Engine, delta: number): void {
    if (this.gameOver) {
      this.touchInput?.setBlocked(true);
      return;
    }

    this.touchInput?.setBlocked(this.paused || this.levelCompleteShown);

    if (!this.levelCompleteShown) {
      this.handlePauseToggle(_engine);
    }

    if (this.paused || this.levelCompleteShown) return;

    this.updateTimedEffects(delta);

    const dt = delta / 1000;
    this.dropTimer += dt;
    const interval = this.softDropping ? this.getDropInterval() * 0.1 : this.getDropInterval();
    if (this.dropTimer >= interval) {
      this.applyGravity();
      this.dropTimer = 0;
    }

    this.chaosAccum += dt;
    const target = this.mode === 'hardcore' ? this.nextChaosInterval : this.getChaosInterval();
    if (this.chaosAccum >= target) {
      this.triggerChaos();
      if (this.mode === 'hardcore' && Math.random() < 0.35) {
        this.triggerChaos();
      }
      this.chaosAccum = 0;
      if (this.mode === 'hardcore') {
        this.nextChaosInterval = Math.random() * 4 + 1;
      }
    }

    this.handleInput(_engine, delta);

    this.updateBoardDisplay();
    this.sidePanel.updateChaosTimer(delta);
  }

  private getDropInterval(): number {
    return Math.max(0.1, 0.8 - (this.levelService.getLevel() - 1) * 0.07);
  }

  private getChaosInterval(): number {
    if (this.mode === 'hardcore') {
      return Math.random() * 4 + 1;
    }
    return Math.max(0.8, 5 - (this.levelService.getLevel() - 1) * 0.45);
  }

  private initChaosEngine(): void {
    const gameState: GameState = {
      movePiece: (dr, dc) => this.movePieceWithChecks(dr, this.reverseInput ? -dc : dc),
      rotatePiece: () => this.rotatePieceWithChecks(),
      panicDrop: () => this.panicDrop(),
      setIgnoreInput: (d: number) => { this.ignoreInput = true; this.ignoreTimer = d; },
      setReverseInput: (d: number) => { this.reverseInput = true; this.reverseTimer = d; },
      lockPhantomCell: () => this.lockPhantomCell(),
      setNextPieceHidden: (d: number) => {
        this.nextPieceHidden = true;
        this.nextPieceHiddenTimer = d;
        this.sidePanel.setNextPieceHidden(true);
      },
      forceNextPieceType: (t: TetrominoType) => { this.nextPieceType = t; },
      shiftBoardUp: () => this.shiftBoardUp(),
      spawnSpaceInvader: () => this.spawnSpaceInvader(),
    };
    this.chaosEngine = new ChaosEngine(this.levelService.getLevel(), gameState, this.mode);
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

    if (this.nextPieceHidden) {
      this.nextPieceHiddenTimer -= delta;
      if (this.nextPieceHiddenTimer <= 0) {
        this.nextPieceHidden = false;
        this.sidePanel.setNextPieceHidden(false);
      }
    }
  }

  private handlePauseToggle(engine: ex.Engine): void {
    const kb = engine.input.keyboard;
    if (kb.wasPressed(ex.Input.Keys.Escape) || kb.wasPressed(ex.Input.Keys.P)) {
      this.paused = !this.paused;
      this.pauseOverlayActor.graphics.visible = this.paused;
      if (this.paused) audio.pauseMusic();
      else audio.resumeMusic();
    }
  }

  private togglePauseFromTouch(): void {
    if (this.gameOver || this.levelCompleteShown) return;
    this.paused = !this.paused;
    this.pauseOverlayActor.graphics.visible = this.paused;
    if (this.paused) audio.pauseMusic();
    else audio.resumeMusic();
  }

  private createLevelCompleteOverlay(): ex.Actor {
    const overlay = new ex.Actor({
      x: 0,
      y: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      anchor: ex.Vector.Zero,
    });

    const graphic = new ex.Canvas({
      cache: false,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      draw: (ctx) => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.fillStyle = '#88cc88';
        ctx.font = '44px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LEVEL COMPLETE', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 130);

        ctx.fillStyle = '#ddeeff';
        ctx.font = '20px monospace';
        ctx.fillText(
          `You beat Level ${this.levelService.getLevel()}`,
          CANVAS_WIDTH / 2,
          CANVAS_HEIGHT / 2 - 80
        );

        const bw = 240, bh = 50;
        const bx = (CANVAS_WIDTH - bw) / 2;
        const by1 = CANVAS_HEIGHT / 2 - 20;
        const by2 = CANVAS_HEIGHT / 2 + 50;

        ctx.fillStyle = '#1a3a2a';
        ctx.fillRect(bx, by1, bw, bh);
        ctx.strokeStyle = '#5a9a6a';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by1, bw, bh);
        ctx.fillStyle = '#ddeeff';
        ctx.font = '20px monospace';
        ctx.fillText('ADVANCE', CANVAS_WIDTH / 2, by1 + bh / 2 + 2);

        ctx.fillStyle = '#1a2a3a';
        ctx.fillRect(bx, by2, bw, bh);
        ctx.strokeStyle = '#4a6a8a';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by2, bw, bh);
        ctx.fillStyle = '#ddeeff';
        ctx.fillText('STAY', CANVAS_WIDTH / 2, by2 + bh / 2 + 2);
      },
    });
    overlay.graphics.use(graphic);

    overlay.on('pointerup', (evt) => {
      if (!this.levelCompleteShown) return;
      const wp = evt.worldPos;
      const bw = 240, bh = 50;
      const bx = (CANVAS_WIDTH - bw) / 2;
      const by1 = CANVAS_HEIGHT / 2 - 20;
      const by2 = CANVAS_HEIGHT / 2 + 50;

      if (wp.x >= bx && wp.x <= bx + bw && wp.y >= by1 && wp.y <= by1 + bh) {
        audio.playSfx('click');
        this.advanceToNextLevel();
      } else if (wp.x >= bx && wp.x <= bx + bw && wp.y >= by2 && wp.y <= by2 + bh) {
        audio.playSfx('click');
        this.stayOnLevel();
      }
    });
    overlay.pointer.useGraphicsBounds = true;

    return overlay;
  }

  private showLevelComplete(): void {
    this.levelCompleteShown = true;
    this.levelCompleteOverlayActor.graphics.visible = true;
  }

  private advanceToNextLevel(): void {
    this.levelService.advanceLevel();
    this.levelStartScore = this.scoreService.getScore();
    this.levelStartLines = this.scoreService.getLinesCleared();
    this.highestReachedLevel = this.levelService.getLevel();
    this.chaosEngine.setLevel(this.levelService.getLevel());
    this.applyLevelVisuals();
    this.grid = createEmptyGrid();
    this.dropTimer = 0;
    this.chaosAccum = 0;
    this.softDropping = false;
    this.ignoreInput = false;
    this.reverseInput = false;
    this.ignoreTimer = 0;
    this.reverseTimer = 0;
    this.nextPieceHidden = false;
    this.nextPieceHiddenTimer = 0;
    this.keyRepeatDelay = this.KEY_REPEAT;
    this.sidePanel.setChaosEffect('', 0);
    this.sidePanel.setNextPieceHidden(false);
    this.levelCompleteOverlayActor.graphics.visible = false;
    this.levelCompleteShown = false;
    this.nextPieceType = this.randomPieceType();
    this.spawnPiece();
    this.updateSidePanel();
    this.updateBoardDisplay();
  }

  private stayOnLevel(): void {
    this.levelCompleteOverlayActor.graphics.visible = false;
    this.levelCompleteShown = false;
  }

  private resetCurrentLevel(): void {
    this.grid = createEmptyGrid();
    this.dropTimer = 0;
    this.chaosAccum = 0;
    this.softDropping = false;
    this.ignoreInput = false;
    this.reverseInput = false;
    this.ignoreTimer = 0;
    this.reverseTimer = 0;
    this.nextPieceHidden = false;
    this.nextPieceHiddenTimer = 0;
    this.levelStartScore = this.scoreService.getScore();
    this.levelStartLines = this.scoreService.getLinesCleared();
    this.keyRepeatDelay = this.KEY_REPEAT;
    this.sidePanel.setChaosEffect('', 0);
    this.sidePanel.setNextPieceHidden(false);
    this.nextPieceType = this.randomPieceType();
    this.spawnPiece();
    this.updateSidePanel();
    this.updateBoardDisplay();
  }

  private checkLevelCompletion(): void {
    if (this.mode === 'hardcore') return;
    const levelScore = this.scoreService.getScore() - this.levelStartScore;
    const lvl = this.levelService.getLevel();
    if (levelScore >= this.levelService.getMaxScore() && lvl > this.highestReachedLevel) {
      this.highestReachedLevel = lvl;
    }
    if (
      this.levelCompleteShown === false &&
      this.gameOver === false &&
      levelScore >= this.levelService.getMaxScore() &&
      lvl < MAX_LEVEL
    ) {
      this.showLevelComplete();
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
        ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 120);

        const bw = 220, bh = 50;
        const bx = (CANVAS_WIDTH - bw) / 2;
        const by1 = CANVAS_HEIGHT / 2 - 50;
        const by2 = CANVAS_HEIGHT / 2 + 20;
        const by3 = CANVAS_HEIGHT / 2 + 90;

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
        ctx.fillText('RESET LEVEL', CANVAS_WIDTH / 2, by2 + bh / 2 + 2);

        ctx.fillStyle = '#1a2a3a';
        ctx.fillRect(bx, by3, bw, bh);
        ctx.strokeStyle = '#4a6a8a';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by3, bw, bh);
        ctx.fillStyle = '#ddeeff';
        ctx.fillText('HOME', CANVAS_WIDTH / 2, by3 + bh / 2 + 2);
      },
    });
    overlay.graphics.use(graphic);

    overlay.on('pointerup', (evt) => {
      if (!this.paused) return;
      const wp = evt.worldPos;
      const bw = 220, bh = 50;
      const bx = (CANVAS_WIDTH - bw) / 2;
      const by1 = CANVAS_HEIGHT / 2 - 50;
      const by2 = CANVAS_HEIGHT / 2 + 20;
      const by3 = CANVAS_HEIGHT / 2 + 90;

      if (wp.x >= bx && wp.x <= bx + bw && wp.y >= by1 && wp.y <= by1 + bh) {
        audio.playSfx('click');
        this.paused = false;
        this.pauseOverlayActor.graphics.visible = false;
        audio.resumeMusic();
      } else if (wp.x >= bx && wp.x <= bx + bw && wp.y >= by2 && wp.y <= by2 + bh) {
        audio.playSfx('click');
        this.paused = false;
        this.pauseOverlayActor.graphics.visible = false;
        audio.resumeMusic();
        this.resetCurrentLevel();
      } else if (wp.x >= bx && wp.x <= bx + bw && wp.y >= by3 && wp.y <= by3 + bh) {
        audio.playSfx('click');
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

    this.softDropping = kb.isHeld(ex.Input.Keys.Down) && !this.ignoreInput;

    if (kb.wasPressed(ex.Input.Keys.Space) && !this.ignoreInput) {
      this.hardDrop();
    }

    if (kb.wasPressed(ex.Input.Keys.M)) {
      audio.toggleMute();
    }

    this.handleAdminInput(kb);
  }

  private handleAdminInput(kb: ex.Input.Keyboard): void {
    if (!admin.isEnabled()) return;
    if (this.paused || this.levelCompleteShown || this.gameOver) return;

    if (kb.wasPressed(ex.Input.Keys.BracketRight)) {
      this.adminJumpToLevel(this.levelService.getLevel() + 1);
    } else if (kb.wasPressed(ex.Input.Keys.BracketLeft)) {
      this.adminJumpToLevel(this.levelService.getLevel() - 1);
    } else {
      for (let n = 1; n <= 9; n++) {
        const digitKey = ex.Input.Keys[`Digit${n}` as keyof typeof ex.Input.Keys];
        if (kb.wasPressed(digitKey)) {
          this.adminJumpToLevel(n);
          break;
        }
      }
      if (kb.wasPressed(ex.Input.Keys.Digit0)) {
        this.adminJumpToLevel(10);
      }
    }
  }

  private adminJumpToLevel(target: number): void {
    const clamped = Math.max(1, Math.min(MAX_LEVEL, target));
    if (clamped === this.levelService.getLevel()) return;
    this.levelService.setLevel(clamped);
    this.chaosEngine.setLevel(this.levelService.getLevel());
    this.grid = createEmptyGrid();
    this.dropTimer = 0;
    this.chaosAccum = 0;
    this.softDropping = false;
    this.ignoreInput = false;
    this.reverseInput = false;
    this.ignoreTimer = 0;
    this.reverseTimer = 0;
    this.nextPieceHidden = false;
    this.nextPieceHiddenTimer = 0;
    this.levelStartScore = this.scoreService.getScore();
    this.levelStartLines = this.scoreService.getLinesCleared();
    this.levelCompleteShown = false;
    this.levelCompleteOverlayActor.graphics.visible = false;
    this.keyRepeatDelay = this.KEY_REPEAT;
    this.sidePanel.setChaosEffect('', 0);
    this.sidePanel.setNextPieceHidden(false);
    this.applyLevelVisuals();
    this.nextPieceType = this.randomPieceType();
    this.spawnPiece();
    this.updateSidePanel();
    this.updateBoardDisplay();
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
      audio.playSfx('lineClear');

      if (this.levelService.updateLevel(this.scoreService.getLinesCleared())) {
        this.chaosEngine.setLevel(this.levelService.getLevel());
        this.applyLevelVisuals();
        this.levelStartScore = this.scoreService.getScore();
        this.levelStartLines = this.scoreService.getLinesCleared();
        this.highestReachedLevel = this.levelService.getLevel();
        audio.playSfx('levelUp');
      }
    }

    this.checkLevelCompletion();
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
    audio.stopMusic();
    audio.playSfx('gameOver');

    if (this.dvdActor) {
      this.dvdActor.kill();
      this.dvdActor = null;
    }

    this.engine?.goToScene('gameover', {
      sceneActivationData: {
        score: this.scoreService.getScore(),
        level: this.highestReachedLevel,
        mode: this.mode,
      },
    });
  }

  private triggerChaos(): void {
    const effect = this.chaosEngine.applyRandomEffect();
    if (effect) {
      this.sidePanel.setChaosEffect(effect.name, 2000);
      audio.playSfx('chaos');
    }
  }

  private lockPhantomCell(): void {
    const empties: Array<{ row: number; col: number }> = [];
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        if (this.grid[r][c] === null) empties.push({ row: r, col: c });
      }
    }
    if (empties.length === 0) return;
    const target = empties[randomInt(0, empties.length - 1)];
    this.grid[target.row][target.col] = '#888888';
  }

  private shiftBoardUp(): void {
    if (this.grid[0].every(c => c === null)) {
      for (let r = 0; r < this.grid.length - 1; r++) {
        this.grid[r] = this.grid[r + 1];
      }
      this.grid[this.grid.length - 1] = Array(COLS).fill(null);
    }
  }

  private spawnSpaceInvader(): void {
    const invader = new SpaceInvaderActor(this.grid);
    this.add(invader);
  }

  private randomPieceType(): TetrominoType {
    return PIECE_TYPES[randomInt(0, PIECE_TYPES.length - 1)];
  }

  private updateSidePanel(): void {
    this.sidePanel.setNextPiece(this.nextPieceType);
    this.sidePanel.setScore(this.scoreService.getScore() - this.levelStartScore);
    this.sidePanel.setLevel(this.levelService.getLevel());
    this.sidePanel.setLines(this.scoreService.getLinesCleared() - this.levelStartLines);
    this.sidePanel.setMaxScore(this.levelService.getMaxScore());
  }

  private updateBoardDisplay(): void {
    this.boardActor.setGrid(this.grid);
    this.boardActor.setCurrentPiece(this.currentPiece);
  }
}
