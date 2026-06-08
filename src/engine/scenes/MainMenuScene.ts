import * as ex from 'excalibur';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../types';

/**
 * MainMenuScene shows the game title and PLAY/RANKING buttons.
 * All UI is rendered as Excalibur actors with Canvas graphics.
 */
export class MainMenuScene extends ex.Scene {
  onInitialize(): void {
    this.camera.pos = new ex.Vector(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    this.add(this.createTitle());
    this.add(this.createSubtitle());
    this.add(this.createVersion());
    this.add(this.createButton(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20, 200, 50, 'PLAY', () => {
      this.engine?.goToScene('game');
    }));
    this.add(this.createButton(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 90, 200, 50, 'RANKING', () => {
      this.engine?.goToScene('ranking');
    }));
  }

  onActivate(_context: ex.SceneActivationContext<unknown>): void {
    // Reset scene state when activated
  }

  private createTitle(): ex.Actor {
    const actor = new ex.Actor({
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2 - 120,
      width: 400,
      height: 60,
      anchor: ex.Vector.Half,
    });
    const graphic = new ex.Canvas({
      cache: true,
      width: 400,
      height: 60,
      draw: (ctx) => {
        ctx.fillStyle = '#ddeeff';
        ctx.font = '48px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SABOTETRIS', 200, 30);
      },
    });
    actor.graphics.use(graphic);
    return actor;
  }

  private createSubtitle(): ex.Actor {
    const actor = new ex.Actor({
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2 - 70,
      width: 300,
      height: 30,
      anchor: ex.Vector.Half,
    });
    const graphic = new ex.Canvas({
      cache: true,
      width: 300,
      height: 30,
      draw: (ctx) => {
        ctx.fillStyle = '#667788';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('The pieces are fighting back...', 150, 15);
      },
    });
    actor.graphics.use(graphic);
    return actor;
  }

  private createVersion(): ex.Actor {
    const actor = new ex.Actor({
      x: CANVAS_WIDTH - 60,
      y: CANVAS_HEIGHT - 20,
      width: 60,
      height: 20,
      anchor: ex.Vector.Half,
    });
    const graphic = new ex.Canvas({
      cache: true,
      width: 60,
      height: 20,
      draw: (ctx) => {
        ctx.fillStyle = '#556677';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('v1.0', 30, 10);
      },
    });
    actor.graphics.use(graphic);
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

    actor.on('pointerup', () => onClick());
    actor.pointer.useGraphicsBounds = true;

    return actor;
  }
}
