import * as ex from 'excalibur';
import { AUDIO_CONTROLS_HEIGHT, AUDIO_CONTROLS_Y, PANEL_WIDTH, PANEL_X } from '../../types';
import { audio, drawMuteIcon } from '../services/AudioService';

const BUTTON_SIZE = AUDIO_CONTROLS_HEIGHT;
const BUTTON_X = PANEL_WIDTH - BUTTON_SIZE;
const SLIDER_WIDTH = BUTTON_X - 8;
const TRACK_X = 12;
const TRACK_WIDTH = SLIDER_WIDTH - TRACK_X * 2;
const TRACK_Y = 28;
const HIDE_DELAY_MS = 3000;

/** A compact audio button that reveals volume and mute controls on demand. */
export class AudioControls extends ex.Actor {
  private expanded = false;
  private dragging = false;
  private idleMs = 0;

  constructor() {
    super({
      x: PANEL_X,
      y: AUDIO_CONTROLS_Y,
      width: PANEL_WIDTH,
      height: AUDIO_CONTROLS_HEIGHT,
      anchor: ex.Vector.Zero,
      z: 50,
    });

    this.graphics.use(new ex.Canvas({
      cache: false,
      width: PANEL_WIDTH,
      height: AUDIO_CONTROLS_HEIGHT,
      draw: (ctx) => this.draw(ctx),
    }));
    this.pointer.useGraphicsBounds = true;

    this.on('pointerdown', (event) => {
      const localX = event.worldPos.x - this.pos.x;
      if (localX >= BUTTON_X) {
        // The first tap opens the controls; the revealed speaker toggles mute.
        if (this.expanded) audio.toggleMute();
        this.expanded = true;
        this.idleMs = 0;
      } else if (this.expanded && localX <= SLIDER_WIDTH) {
        this.dragging = true;
        this.updateVolume(localX);
      }
    });
    this.on('pointermove', (event) => {
      if (this.dragging) this.updateVolume(event.worldPos.x - this.pos.x);
    });
    const stopDragging = (): void => { this.dragging = false; };
    this.on('pointerup', stopDragging);
    this.on('pointerleave', stopDragging);
    this.on('pointercancel', stopDragging);
  }

  onPreUpdate(_engine: ex.Engine, delta: number): void {
    if (!this.expanded || this.dragging) return;
    this.idleMs += delta;
    if (this.idleMs >= HIDE_DELAY_MS) this.expanded = false;
  }

  private updateVolume(localX: number): void {
    const value = Math.round((localX - TRACK_X) / TRACK_WIDTH * 100) / 100;
    audio.setMasterVolume(value);
    if (audio.getMasterVolume() > 0) audio.setMuted(false);
    this.idleMs = 0;
  }

  private draw(ctx: CanvasRenderingContext2D): void {
    const value = audio.getMasterVolume();
    const muted = audio.isMuted() || value === 0;
    const accent = muted ? '#ff4d6d' : '#4dd0ff';

    if (this.expanded) {
      ctx.fillStyle = '#16213e';
      ctx.fillRect(0, 0, SLIDER_WIDTH, AUDIO_CONTROLS_HEIGHT);
      ctx.fillStyle = '#29465a';
      ctx.fillRect(TRACK_X, TRACK_Y - 2, TRACK_WIDTH, 4);
      ctx.fillStyle = '#4dd0ff';
      ctx.fillRect(TRACK_X, TRACK_Y - 2, TRACK_WIDTH * value, 4);
      ctx.beginPath();
      ctx.arc(TRACK_X + TRACK_WIDTH * value, TRACK_Y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ddeeff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.round(value * 100)}%`, SLIDER_WIDTH / 2, 10);
    }

    ctx.save();
    ctx.translate(BUTTON_X, 0);
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, BUTTON_SIZE, BUTTON_SIZE);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, BUTTON_SIZE - 1, BUTTON_SIZE - 1);
    drawMuteIcon(ctx, BUTTON_SIZE, muted, accent);
    ctx.restore();
  }
}
