import * as ex from 'excalibur';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../types';
import type { ScoreEntry } from '../../types';
import { RankingService } from '../services/RankingService';
import { onlineRanking } from '../services/OnlineRanking';
import type { RankingMode } from '../services/RemoteRankingService';
import { audio } from '../services/AudioService';

/** Bounded local/global rankings. Generation guards discard stale scene requests. */
export class RankingScene extends ex.Scene {
  private rankingService = new RankingService();
  private cachedEntries: ScoreEntry[] = [];
  private source: 'local' | 'global' = 'local';
  private mode: RankingMode = 'softcore';
  private status = '';
  private generation = 0;

  onInitialize(engine: ex.Engine): void {
    this.camera.pos = new ex.Vector(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    const overlay = new ex.Actor({ x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, anchor: ex.Vector.Zero });
    overlay.graphics.use(new ex.Canvas({ cache: false, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, draw: ctx => this.drawOverlay(ctx) }));
    this.add(overlay);
    this.button('LOCAL', 90, 70, () => { this.source = 'local'; this.load(); }, () => this.source === 'local');
    this.button('GLOBAL', 210, 70, () => { this.source = 'global'; this.load(); }, () => this.source === 'global');
    this.button('SOFT', 345, 70, () => { this.mode = 'softcore'; this.load(); }, () => this.mode === 'softcore');
    this.button('HARD', 460, 70, () => { this.mode = 'hardcore'; this.load(); }, () => this.mode === 'hardcore');
    this.button('REFRESH', CANVAS_WIDTH / 2, 610, () => this.load());
    this.button('BACK', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 40, () => { engine.goToScene('menu'); });
  }

  private button(label: string, x: number, y: number, action: () => void, selected: () => boolean = () => false): void {
    const button = new ex.Actor({ x, y, width: 105, height: 36, anchor: ex.Vector.Half, z: 1 });
    button.graphics.use(new ex.Canvas({ cache: false, width: 105, height: 36, draw: ctx => {
      ctx.fillStyle = selected() ? '#28516b' : '#1a2a3a';
      ctx.fillRect(0, 0, 105, 36);
      ctx.strokeStyle = '#4a6a8a';
      ctx.strokeRect(0, 0, 105, 36);
      ctx.fillStyle = '#ddeeff';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 52, 18);
    } }));
    button.pointer.useGraphicsBounds = true;
    button.on('pointerup', () => { audio.playSfx('click'); action(); });
    this.add(button);
  }

  onActivate(): void { this.load(); }
  onDeactivate(): void { this.generation++; }

  onPreUpdate(engine: ex.Engine): void {
    if (engine.input.keyboard.wasPressed(ex.Input.Keys.Escape)) engine.goToScene('menu');
  }

  private load(): void {
    const generation = ++this.generation;
    const mode = this.mode;
    this.cachedEntries = [];
    this.status = '';
    if (this.source === 'local') {
      this.cachedEntries = this.rankingService.getRanking(mode);
      return;
    }
    if (!onlineRanking.configured) { this.status = 'Global ranking not configured yet.'; return; }
    this.status = 'Loading…';
    void onlineRanking.getRanking(mode).then(entries => {
      if (generation !== this.generation) return;
      this.cachedEntries = entries;
      this.status = '';
    }).catch(() => {
      if (generation === this.generation) this.status = 'Unavailable. Check connection and retry.';
    });
  }

  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#ddeeff';
    ctx.font = '28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RANKING', CANVAS_WIDTH / 2, 28);
    ctx.fillStyle = '#8899aa';
    ctx.font = '11px monospace';
    ctx.fillText(`${this.source.toUpperCase()} / ${this.mode.toUpperCase()} — TOP 20`, CANVAS_WIDTH / 2, 105);
    if (!this.cachedEntries.length) {
      ctx.font = '13px monospace';
      ctx.fillText(this.status || 'No scores yet.', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      return;
    }
    this.cachedEntries.slice(0, 20).forEach((entry, index) => {
      const y = 135 + index * 23;
      ctx.textAlign = 'left';
      ctx.font = '12px monospace';
      ctx.fillStyle = index < 3 ? '#cc8844' : '#667788';
      ctx.fillText(`${index + 1}.`, 20, y);
      ctx.fillStyle = '#ddeeff';
      ctx.fillText(entry.playerName, 55, y);
      ctx.textAlign = 'right';
      ctx.fillText(String(entry.score), 310, y);
      ctx.fillStyle = '#8899aa';
      ctx.fillText(`Lv.${entry.level}`, 370, y);
      ctx.font = '10px monospace';
      ctx.fillText(entry.date, 520, y);
    });
  }
}
