import * as ex from 'excalibur';
import { PANEL_X, BOARD_Y, PANEL_WIDTH, PANEL_HEIGHT } from '../../types';
import { TETROMINOES } from '../../data/tetrominoes';
import type { TetrominoType } from '../../types';

/**
 * SidePanel displays next piece preview, score, level, and lines cleared.
 * Uses Excalibur Canvas graphics for rendering.
 */
export class SidePanel extends ex.Actor {
  private nextPieceType: TetrominoType = 'I';
  private nextPieceHidden = false;
  private score = 0;
  private level = 1;
  private lines = 0;
  private maxScore = 0;
  private chaosEffectName = '';
  private chaosTimer = 0;

  constructor() {
    super({
      x: PANEL_X,
      y: BOARD_Y,
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      anchor: ex.Vector.Zero,
    });
  }

  onInitialize(): void {
    const graphic = new ex.Canvas({
      cache: false,
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      draw: (ctx) => this.draw(ctx),
    });
    this.graphics.use(graphic);
  }

  setNextPiece(type: TetrominoType): void {
    this.nextPieceType = type;
  }

  setNextPieceHidden(hidden: boolean): void {
    this.nextPieceHidden = hidden;
  }

  setScore(score: number): void {
    this.score = score;
  }

  setLevel(level: number): void {
    this.level = level;
  }

  setLines(lines: number): void {
    this.lines = lines;
  }

  setMaxScore(maxScore: number): void {
    this.maxScore = maxScore;
  }

  setChaosEffect(name: string, duration: number): void {
    this.chaosEffectName = name;
    this.chaosTimer = duration;
  }

  updateChaosTimer(delta: number): void {
    if (this.chaosTimer > 0) {
      this.chaosTimer -= delta;
      if (this.chaosTimer <= 0) {
        this.chaosEffectName = '';
      }
    }
  }

  private draw(ctx: CanvasRenderingContext2D): void {
    this.drawNextPiece(ctx, 0, 0);
    this.drawInfo(ctx, 0, 130);
    this.drawChaosEffect(ctx, 0, 360);
  }

  private drawNextPiece(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#16213e';
    ctx.fillRect(x, y, PANEL_WIDTH, 120);
    ctx.strokeStyle = '#2a3a5c';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, PANEL_WIDTH, 120);

    ctx.fillStyle = '#8899aa';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('NEXT', x + 8, y + 16);

    if (this.nextPieceHidden) {
      ctx.fillStyle = '#445566';
      ctx.font = '48px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', x + 70, y + 70);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      return;
    }

    const def = TETROMINOES[this.nextPieceType];
    const previewSize = 16;
    const shape = def.shape;
    const rows = shape.length;
    const cols = shape[0].length;
    const offsetX = x + (PANEL_WIDTH - cols * previewSize) / 2;
    const offsetY = y + 10 + (110 - rows * previewSize) / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (shape[r][c]) {
          ctx.fillStyle = def.color;
          ctx.fillRect(offsetX + c * previewSize, offsetY + r * previewSize, previewSize - 1, previewSize - 1);
        }
      }
    }
  }

  private drawInfo(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#16213e';
    ctx.fillRect(x, y, PANEL_WIDTH, 220);
    ctx.strokeStyle = '#2a3a5c';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, PANEL_WIDTH, 220);

    ctx.font = '12px monospace';
    ctx.textAlign = 'left';

    const labelColor = '#667788';
    const valueColor = '#ddeeff';
    const reachedColor = '#88cc88';
    let drawY = y + 24;

    ctx.fillStyle = labelColor;
    ctx.fillText('SCORE', x + 8, drawY);
    drawY += 16;
    ctx.fillStyle = valueColor;
    ctx.font = '22px monospace';
    ctx.fillText(this.score.toString(), x + 8, drawY);

    drawY += 30;
    ctx.font = '12px monospace';
    ctx.fillStyle = labelColor;
    ctx.fillText('TARGET', x + 8, drawY);
    drawY += 16;
    ctx.fillStyle = this.score >= this.maxScore && this.maxScore > 0 ? reachedColor : valueColor;
    ctx.font = '16px monospace';
    ctx.fillText(this.maxScore.toString(), x + 8, drawY);

    drawY += 30;
    ctx.font = '12px monospace';
    ctx.fillStyle = labelColor;
    ctx.fillText('LEVEL', x + 8, drawY);
    drawY += 16;
    ctx.fillStyle = valueColor;
    ctx.font = '22px monospace';
    ctx.fillText(this.level.toString(), x + 8, drawY);

    drawY += 30;
    ctx.font = '12px monospace';
    ctx.fillStyle = labelColor;
    ctx.fillText('LINES', x + 8, drawY);
    drawY += 16;
    ctx.fillStyle = valueColor;
    ctx.font = '22px monospace';
    ctx.fillText(this.lines.toString(), x + 8, drawY);
  }

  private drawChaosEffect(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.chaosEffectName) return;

    ctx.fillStyle = 'rgba(180, 60, 60, 0.15)';
    ctx.fillRect(x, y, PANEL_WIDTH, 36);
    ctx.strokeStyle = 'rgba(180, 60, 60, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, PANEL_WIDTH, 36);

    ctx.fillStyle = '#cc4444';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.chaosEffectName, x + 70, y + 22);
  }
}
