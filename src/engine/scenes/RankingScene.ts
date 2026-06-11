import * as ex from 'excalibur';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../types';
import { RankingService } from '../services/RankingService';
import { audio } from '../services/AudioService';

/**
 * RankingScene displays the top 20 scores stored in localStorage.
 * Shows position, name, score, level, and date for each entry.
 * Uses actors with Canvas graphics for all UI elements.
 */
export class RankingScene extends ex.Scene {
  private rankingService = new RankingService();
  private overlayActor!: ex.Actor;

  onInitialize(engine: ex.Engine): void {
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

    const backBtn = new ex.Actor({
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - 50,
      width: 200,
      height: 44,
      anchor: ex.Vector.Half,
    });

    const backGraphic = new ex.Canvas({
      cache: true,
      width: 200,
      height: 44,
      draw: (ctx) => {
        ctx.fillStyle = '#1a2a3a';
        ctx.fillRect(0, 0, 200, 44);
        ctx.strokeStyle = '#4a6a8a';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, 200, 44);
        ctx.fillStyle = '#ddeeff';
        ctx.font = '18px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BACK', 100, 24);
      },
    });
    backBtn.graphics.use(backGraphic);

    backBtn.on('pointerup', () => {
      audio.playSfx('click');
      engine.goToScene('menu');
    });
    backBtn.pointer.useGraphicsBounds = true;

    this.add(backBtn);
  }

  onActivate(_context: ex.SceneActivationContext<unknown>): void {
    // Refresh data when scene becomes active
  }

  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = '#ddeeff';
    ctx.font = '28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RANKING', CANVAS_WIDTH / 2, 30);

    const entries = this.rankingService.getRanking();
    const startY = 65;
    const lineH = 27;

    if (entries.length === 0) {
      ctx.fillStyle = '#667788';
      ctx.font = '14px monospace';
      ctx.fillText('No scores yet.', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      return;
    }

    const displayEntries = entries.slice(0, 20);

    ctx.font = '11px monospace';
    for (let i = 0; i < displayEntries.length; i++) {
      const entry = displayEntries[i];
      const y = startY + i * lineH;
      const rank = i + 1;

      ctx.textAlign = 'left';
      ctx.fillStyle = rank <= 3 ? '#cc8844' : '#556677';
      ctx.fillText(`${rank}.`, 30, y);

      ctx.fillStyle = '#ddeeff';
      ctx.fillText(entry.playerName.padEnd(10).slice(0, 10), 60, y);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#8899aa';
      ctx.fillText(entry.score.toString().padStart(8), 330, y);

      ctx.fillStyle = '#667788';
      ctx.textAlign = 'right';
      ctx.fillText(`Lv.${entry.level}`, 400, y);

      ctx.fillStyle = '#556677';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(entry.date, 510, y);
      ctx.font = '11px monospace';
    }
  }
}
