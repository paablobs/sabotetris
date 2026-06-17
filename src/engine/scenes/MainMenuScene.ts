import * as ex from 'excalibur';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../types';
import { APP_VERSION, APP_BRANCH } from '../../generated/version';
import {
  admin,
  ADMIN_TAP_COUNT,
  ADMIN_TAP_WINDOW_MS,
} from '../services/AdminService';
import { audio, drawMuteIcon } from '../services/AudioService';

const TUTORIAL_STORAGE_KEY = 'sabotetris:seenTutorial';

/**
 * MainMenuScene shows the game title and PLAY/RANKING/TUTORIAL buttons.
 * All UI is rendered as Excalibur actors with Canvas graphics.
 */
export class MainMenuScene extends ex.Scene {
  private adminBadgeActor!: ex.Actor;
  private tutorialOverlayActor!: ex.Actor;
  private tapTimestamps: number[] = [];
  private tutorialOpen = false;

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
    this.add(this.createButton(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 220, 200, 50, 'TUTORIAL', () => {
      this.showTutorial();
    }));
    this.adminBadgeActor = this.createAdminBadge();
    this.adminBadgeActor.graphics.visible = admin.isEnabled();
    this.add(this.adminBadgeActor);

    this.tutorialOverlayActor = this.createTutorialOverlay();
    this.tutorialOverlayActor.graphics.visible = false;
    this.tutorialOverlayActor.z = 100;
    this.add(this.tutorialOverlayActor);
  }

  onActivate(): void {
    this.tapTimestamps = [];
    this.tutorialOpen = false;
    this.tutorialOverlayActor.graphics.visible = false;
    this.adminBadgeActor.graphics.visible = admin.isEnabled();
    audio.playMusic('menu');
    this.maybeShowTutorialFirstTime();
  }

  onPreUpdate(engine: ex.Engine): void {
    const kb = engine.input.keyboard;
    if (kb.wasPressed(ex.Input.Keys.M)) {
      audio.toggleMute();
    }
    if (this.tutorialOpen && kb.wasPressed(ex.Input.Keys.Escape)) {
      this.hideTutorial();
      return;
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

  private maybeShowTutorialFirstTime(): void {
    if (typeof localStorage === 'undefined') return;
    const seen = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (!seen) {
      this.showTutorial();
    }
  }

  private showTutorial(): void {
    this.tutorialOpen = true;
    this.tutorialOverlayActor.graphics.visible = true;
  }

  private hideTutorial(): void {
    this.tutorialOpen = false;
    this.tutorialOverlayActor.graphics.visible = false;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
    }
  }

  private createTutorialOverlay(): ex.Actor {
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
        // Dark semi-transparent background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const contentX = 30;
        let y = 40;

        // Title
        ctx.fillStyle = '#ddeeff';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HOW TO PLAY', CANVAS_WIDTH / 2, y);
        y += 36;

        // Helper to draw a section
        const drawSection = (header: string, lines: string[]) => {
          ctx.fillStyle = '#88cc88';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(header, contentX, y);
          y += 20;
          ctx.fillStyle = '#ddeeff';
          ctx.font = '13px monospace';
          for (const line of lines) {
            ctx.fillText(line, contentX, y);
            y += 18;
          }
          y += 8;
        };

        drawSection('OBJECTIVE', [
          'Clear horizontal rows by filling them with tetromino pieces.',
          'Each completed row earns points.',
          'The game ends when the board overflows.',
        ]);

        drawSection('THE SABOTAGE', [
          'The pieces are alive! Every few seconds, a random chaos effect',
          'sabotages your active piece.',
          'Higher levels = more frequent effects.',
        ]);

        drawSection('ADVANCING', [
          'Each level has a target score shown in the side panel.',
          'Reach it to advance automatically to a harder level with', 
          'a fresh board.',
        ]);

        drawSection('HARDCORE', [
          'Extra hard mode — much faster, with additional chaos.',
          'Not for the faint of heart!',
        ]);

        drawSection('KEYBOARD', [
          '← / →  Move piece',
          '↑       Rotate',
          '↓       Soft drop',
          'Space   Hard drop',
          'Escape  Pause',
        ]);

        drawSection('MOBILE', [
          'Swipe left / right  Move piece',
          'Swipe up            Rotate',
          'Swipe down          Soft drop',
          'Double tap          Hard drop',
          'Phone back button   Pause',
        ]);

        // BACK button
        const bw = 200, bh = 44;
        const bx = (CANVAS_WIDTH - bw) / 2;
        const by = CANVAS_HEIGHT - 60;
        ctx.fillStyle = '#1a2a3a';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#4a6a8a';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = '#ddeeff';
        ctx.font = '18px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BACK', CANVAS_WIDTH / 2, by + bh / 2 + 2);
      },
    });
    actor.graphics.use(graphic);

    actor.on('pointerup', (evt) => {
      if (!this.tutorialOpen) return;
      evt.cancel();
      const wp = evt.worldPos;
      const bw = 200, bh = 44;
      const bx = (CANVAS_WIDTH - bw) / 2;
      const by = CANVAS_HEIGHT - 60;
      if (wp.x >= bx && wp.x <= bx + bw && wp.y >= by && wp.y <= by + bh) {
        audio.playSfx('click');
        this.hideTutorial();
      }
    });
    actor.on('pointerdown', (evt) => {
      if (this.tutorialOpen) evt.cancel();
    });
    actor.pointer.useGraphicsBounds = true;

    return actor;
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
