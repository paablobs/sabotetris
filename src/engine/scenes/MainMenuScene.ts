import * as ex from 'excalibur';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../types';
import { APP_VERSION, APP_BRANCH } from '../../generated/version';
import {
  admin,
  ADMIN_TAP_COUNT,
  ADMIN_TAP_WINDOW_MS,
} from '../services/AdminService';
import { audio, drawMuteIcon } from '../services/AudioService';

/**
 * MainMenuScene shows the game title and PLAY/RANKING buttons.
 * All UI is rendered as Excalibur actors with Canvas graphics.
 */
export class MainMenuScene extends ex.Scene {
  private adminBadgeActor!: ex.Actor;
  private tapTimestamps: number[] = [];

  onInitialize(): void {
    this.camera.pos = new ex.Vector(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    this.add(this.createLogo());
    this.add(this.createVersion());
    this.add(this.createMuteButton());
    this.add(this.createButton(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40, 200, 50, 'PLAY', () => {
      this.engine?.goToScene('game', { sceneActivationData: { mode: 'softcore' } });
    }));
    this.add(this.createHardcoreButton(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 100, 200, 50, 'HARDCORE', () => {
      this.engine?.goToScene('game', { sceneActivationData: { mode: 'hardcore' } });
    }));
    this.add(this.createButton(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 160, 200, 50, 'RANKING', () => {
      this.engine?.goToScene('ranking');
    }));
    this.adminBadgeActor = this.createAdminBadge();
    this.adminBadgeActor.graphics.visible = admin.isEnabled();
    this.add(this.adminBadgeActor);
  }

  onActivate(): void {
    this.tapTimestamps = [];
    this.adminBadgeActor.graphics.visible = admin.isEnabled();
    audio.playMusic('menu');
  }

  onPreUpdate(engine: ex.Engine): void {
    const kb = engine.input.keyboard;
    if (kb.wasPressed(ex.Input.Keys.M)) {
      audio.toggleMute();
    }
    if (kb.wasPressed(ex.Input.Keys.L)) {
      const now = performance.now();
      this.tapTimestamps = this.tapTimestamps.filter(t => now - t < ADMIN_TAP_WINDOW_MS);
      this.tapTimestamps.push(now);
      if (this.tapTimestamps.length >= ADMIN_TAP_COUNT) {
        admin.toggle();
        this.tapTimestamps = [];
        this.adminBadgeActor.graphics.visible = admin.isEnabled();
      }
    }
  }

  private createLogo(): ex.Actor {
    const w = 320;
    const h = 120;
    const actor = new ex.Actor({
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2 - 140,
      width: w,
      height: h,
      anchor: ex.Vector.Half,
    });
    const graphic = new ex.Canvas({
      cache: true,
      width: w,
      height: h,
      draw: (ctx) => {
        const ox = (w - 100) / 2;
        const oy = (h - 96) / 2;
        ctx.save();
        ctx.translate(ox, oy);

        ctx.fillStyle = '#b86bff';
        this.drawBlock(ctx, 14, 0);
        this.drawBlock(ctx, 0, 14);
        this.drawBlock(ctx, 14, 14);
        this.drawBlock(ctx, 28, 14);

        ctx.fillStyle = '#4dd0ff';
        this.drawBlock(ctx, 0, 32);
        this.drawBlock(ctx, 0, 46);
        this.drawBlock(ctx, 0, 60);
        this.drawBlock(ctx, 14, 60);

        ctx.fillStyle = 'rgba(255, 77, 109, 0.55)';
        this.drawBlock(ctx, 18, 78);
        this.drawBlock(ctx, 32, 78);
        this.drawBlock(ctx, 46, 78);
        this.drawBlock(ctx, 60, 78);

        ctx.fillStyle = '#ff4d6d';
        this.drawBlock(ctx, 40, 82);
        this.drawBlock(ctx, 54, 82);
        this.drawBlock(ctx, 68, 82);
        this.drawBlock(ctx, 82, 82);

        ctx.strokeStyle = '#ff4d6d';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(20, 96);
        ctx.lineTo(38, 88);
        ctx.lineTo(58, 98);
        ctx.lineTo(86, 84);
        ctx.stroke();

        ctx.fillStyle = '#ffb86b';
        ctx.beginPath();
        ctx.arc(24, 92, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffb86b';
        ctx.beginPath();
        ctx.arc(62, 94, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.arc(82, 86, 1.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        ctx.fillStyle = '#ddeeff';
        ctx.font = 'bold 30px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('SABOTE', w / 2 + 4, 38);

        ctx.fillStyle = '#ff4d6d';
        ctx.fillText('TRIS', w / 2 + 4, 68);

        ctx.fillStyle = '#667788';
        ctx.font = '9px monospace';
        ctx.fillText('THE PIECES FIGHT BACK', w / 2 + 4, 90);
      },
    });
    actor.graphics.use(graphic);
    return actor;
  }

  private drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillRect(x, y, 14, 14);
  }

  private createVersion(): ex.Actor {
    const label = `v${APP_VERSION}${APP_BRANCH && APP_BRANCH !== 'master' ? ` (${APP_BRANCH})` : ''}`;
    const w = Math.max(110, label.length * 7 + 12);
    const actor = new ex.Actor({
      x: CANVAS_WIDTH - w / 2 - 6,
      y: CANVAS_HEIGHT - 16,
      width: w,
      height: 18,
      anchor: ex.Vector.Half,
    });
    const graphic = new ex.Canvas({
      cache: true,
      width: w,
      height: 18,
      draw: (ctx) => {
        ctx.fillStyle = '#556677';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, w / 2, 9);
      },
    });
    actor.graphics.use(graphic);
    return actor;
  }

  private createAdminBadge(): ex.Actor {
    const w = 64;
    const h = 20;
    const actor = new ex.Actor({
      x: 8 + w / 2,
      y: CANVAS_HEIGHT - 8 - h / 2,
      width: w,
      height: h,
      anchor: ex.Vector.Half,
    });
    const graphic = new ex.Canvas({
      cache: false,
      width: w,
      height: h,
      draw: (ctx) => {
        ctx.fillStyle = 'rgba(255, 77, 109, 0.18)';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(255, 77, 109, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, w, h);
        ctx.fillStyle = '#ff8fa3';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ADMIN', w / 2, h / 2 + 1);
      },
    });
    actor.graphics.use(graphic);
    return actor;
  }

  private createMuteButton(): ex.Actor {
    const size = 44;
    const actor = new ex.Actor({
      x: CANVAS_WIDTH - 12 - size / 2,
      y: 12 + size / 2,
      width: size,
      height: size,
      anchor: ex.Vector.Half,
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

  private createButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void
  ): ex.Actor {
    const actor = new ex.Actor({
      x,
      y,
      width: w,
      height: h,
      anchor: ex.Vector.Half,
    });

    const graphic = new ex.Canvas({
      cache: true,
      width: w,
      height: h,
      draw: (ctx) => {
        ctx.fillStyle = '#1a2a3a';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#4a6a8a';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, w, h);

        ctx.fillStyle = '#ddeeff';
        ctx.font = '22px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, w / 2, h / 2 + 2);
      },
    });
    actor.graphics.use(graphic);

    actor.on('pointerup', () => {
      audio.playSfx('click');
      onClick();
    });
    actor.pointer.useGraphicsBounds = true;

    return actor;
  }

  private createHardcoreButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void
  ): ex.Actor {
    const actor = new ex.Actor({
      x,
      y,
      width: w,
      height: h,
      anchor: ex.Vector.Half,
    });

    const graphic = new ex.Canvas({
      cache: true,
      width: w,
      height: h,
      draw: (ctx) => {
        ctx.fillStyle = '#1a0a0a';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#ff4d6d';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, w, h);

        ctx.fillStyle = '#ff4d6d';
        ctx.font = '22px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, w / 2, h / 2 + 2);
      },
    });
    actor.graphics.use(graphic);

    actor.on('pointerup', () => {
      audio.playSfx('click');
      onClick();
    });
    actor.pointer.useGraphicsBounds = true;

    return actor;
  }
}
