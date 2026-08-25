import * as ex from 'excalibur';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../types';
import { RankingService } from '../services/RankingService';
import { audio } from '../services/AudioService';

/**
 * GameOverScene shows final score, level reached, and name input for ranking.
 * Handles keyboard input for entering the player name via Excalibur's input system.
 * Uses actors with Canvas graphics for all UI elements.
 */
export class GameOverScene extends ex.Scene {
  private score = 0;
  private level = 1;
  private mode: 'softcore' | 'hardcore' = 'softcore';
  private playerName = '';
  private saved = false;
  private saveFailed = false;
  private rankingService = new RankingService();
  private overlayActor!: ex.Actor;
  private clickHandler: (() => void) | null = null;

  onInitialize(): void {
    this.camera.pos = new ex.Vector(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    this.overlayActor = new ex.Actor({
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
      draw: (ctx) => this.drawOverlay(ctx),
    });
    this.overlayActor.graphics.use(graphic);
    this.add(this.overlayActor);
  }

  onActivate(context: ex.SceneActivationContext<unknown>): void {
    const data = context.data as { score: number; level: number; mode?: 'softcore' | 'hardcore' } | undefined;
    if (data) {
      this.score = data.score;
      this.level = data.level;
      this.mode = data.mode ?? 'softcore';
    }
    this.playerName = '';
    this.saved = false;
    this.saveFailed = false;

    this.removeClickHandler();
  }

  private readonly LETTER_KEYS = [
    ex.Input.Keys.A, ex.Input.Keys.B, ex.Input.Keys.C,
    ex.Input.Keys.D, ex.Input.Keys.E, ex.Input.Keys.F,
    ex.Input.Keys.G, ex.Input.Keys.H, ex.Input.Keys.I,
    ex.Input.Keys.J, ex.Input.Keys.K, ex.Input.Keys.L,
    ex.Input.Keys.M, ex.Input.Keys.N, ex.Input.Keys.O,
    ex.Input.Keys.P, ex.Input.Keys.Q, ex.Input.Keys.R,
    ex.Input.Keys.S, ex.Input.Keys.T, ex.Input.Keys.U,
    ex.Input.Keys.V, ex.Input.Keys.W, ex.Input.Keys.X,
    ex.Input.Keys.Y, ex.Input.Keys.Z,
  ];

  private readonly DIGIT_KEYS = [
    ex.Input.Keys.Digit0, ex.Input.Keys.Digit1,
    ex.Input.Keys.Digit2, ex.Input.Keys.Digit3,
    ex.Input.Keys.Digit4, ex.Input.Keys.Digit5,
    ex.Input.Keys.Digit6, ex.Input.Keys.Digit7,
    ex.Input.Keys.Digit8, ex.Input.Keys.Digit9,
  ];

  onPreUpdate(engine: ex.Engine): void {
    const kb = engine.input.keyboard;

    if (kb.wasPressed(ex.Input.Keys.Escape)) {
      this.engine?.goToScene('menu');
      return;
    }

    if (this.saved) return;

    for (let i = 0; i < 26; i++) {
      if (kb.wasPressed(this.LETTER_KEYS[i])) {
        if (this.playerName.length < 10) {
          this.playerName += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i];
        }
      }
    }

    for (let i = 0; i < 10; i++) {
      if (kb.wasPressed(this.DIGIT_KEYS[i])) {
        if (this.playerName.length < 10) {
          this.playerName += String(i);
        }
      }
    }

    if (kb.wasPressed(ex.Input.Keys.Space)) {
      if (this.playerName.length < 10) {
        this.playerName += ' ';
      }
    }

    if (kb.wasPressed(ex.Input.Keys.Period)) {
      if (this.playerName.length < 10) {
        this.playerName += '.';
      }
    }

    if (kb.wasPressed(ex.Input.Keys.Comma)) {
      if (this.playerName.length < 10) {
        this.playerName += ',';
      }
    }

    if (kb.wasPressed(ex.Input.Keys.Minus)) {
      if (this.playerName.length < 10) {
        this.playerName += '-';
      }
    }

    if (kb.wasPressed(ex.Input.Keys.Backspace)) {
      this.playerName = this.playerName.slice(0, -1);
    }

    if (kb.wasPressed(ex.Input.Keys.Enter) && this.playerName.length > 0) {
      this.saveScore();
    }
  }

  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#cc4444';
    ctx.font = '48px monospace';
    ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 140);

    ctx.fillStyle = '#ddeeff';
    ctx.font = '22px monospace';
    ctx.fillText(`Score: ${this.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 70);

    ctx.fillStyle = '#8899aa';
    ctx.font = '18px monospace';
    ctx.fillText(`Level: ${this.level}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 35);

    if (this.mode === 'hardcore') {
      ctx.fillStyle = '#ff4d6d';
      ctx.font = '14px monospace';
      ctx.fillText('HARDCORE MODE', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 10);
    }

    if (!this.saved) {
      ctx.fillStyle = '#667788';
      ctx.font = '14px monospace';
      ctx.fillText('Enter your name:', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);

      ctx.fillStyle = '#2a3a5c';
      ctx.fillRect(CANVAS_WIDTH / 2 - 120, CANVAS_HEIGHT / 2 + 40, 240, 36);
      ctx.strokeStyle = '#4a6a8a';
      ctx.lineWidth = 1;
      ctx.strokeRect(CANVAS_WIDTH / 2 - 120, CANVAS_HEIGHT / 2 + 40, 240, 36);

      ctx.fillStyle = '#ddeeff';
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        this.playerName + (Date.now() % 1000 < 500 ? '|' : ''),
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2 + 58
      );

      ctx.fillStyle = '#556677';
      ctx.font = '11px monospace';
      ctx.fillText(
        'Press ENTER to save',
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2 + 100
      );
      ctx.fillStyle = '#445566';
      ctx.fillText(
        'Press ESC to exit',
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2 + 120
      );
    } else if (this.saveFailed) {
      ctx.fillStyle = '#cc4444';
      ctx.font = '16px monospace';
      ctx.fillText('Save failed — storage unavailable', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);

      ctx.fillStyle = '#556677';
      ctx.font = '14px monospace';
      ctx.fillText('Press ENTER to retry or ESC to exit', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 90);
    } else {
      ctx.fillStyle = '#6BB86B';
      ctx.font = '18px monospace';
      ctx.fillText('Score saved!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);

      ctx.fillStyle = '#ddeeff';
      ctx.font = '14px monospace';
      ctx.fillText('Click to continue', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 90);
    }
  }

  private saveScore(): void {
    const ok = this.rankingService.addEntry({
      playerName: this.playerName,
      score: this.score,
      level: this.level,
      date: new Date().toLocaleDateString(),
      mode: this.mode,
    });
    if (ok) {
      this.saved = true;
      this.addClickHandler();
    } else {
      this.saveFailed = true;
    }
  }

  private addClickHandler(): void {
    if (this.clickHandler) return;
    this.clickHandler = () => {
      audio.playSfx('click');
      this.engine?.goToScene('menu');
    };
    this.overlayActor.on('pointerup', this.clickHandler);
    this.overlayActor.pointer.useGraphicsBounds = true;
  }

  private removeClickHandler(): void {
    if (this.clickHandler) {
      this.overlayActor.off('pointerup', this.clickHandler);
      this.clickHandler = null;
    }
  }
}
