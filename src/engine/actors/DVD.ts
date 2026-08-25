import * as ex from 'excalibur';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../types';
import { isScenePaused } from './pauseGuard';

/**
 * Bouncing DVD logo for hardcore mode.
 * Bounces across the entire screen and changes color on every wall hit.
 */
export class DVDActor extends ex.Actor {
  private vx = 180;
  private vy = 130;
  private dvdColor = '#ff4d6d';
  private halfW = 60;
  private halfH = 34;

  constructor() {
    super({
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      width: 120,
      height: 68,
      anchor: ex.Vector.Half,
    });
  }

  onInitialize(): void {
    const graphic = new ex.Canvas({
      cache: false,
      width: 120,
      height: 68,
      draw: (ctx) => {
        ctx.fillStyle = this.dvdColor;
        ctx.beginPath();
        ctx.roundRect(0, 0, 120, 68, 16);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('DVD', 60, 34);
      },
    });
    this.graphics.use(graphic);
  }

  onPreUpdate(_engine: ex.Engine, delta: number): void {
    if (isScenePaused(this.scene)) return;

    const dt = delta / 1000;
    let nextX = this.pos.x + this.vx * dt;
    let nextY = this.pos.y + this.vy * dt;
    let bounced = false;

    if (nextX <= this.halfW || nextX >= CANVAS_WIDTH - this.halfW) {
      this.vx *= -1;
      nextX = Math.max(this.halfW, Math.min(CANVAS_WIDTH - this.halfW, nextX));
      bounced = true;
    }
    if (nextY <= this.halfH || nextY >= CANVAS_HEIGHT - this.halfH) {
      this.vy *= -1;
      nextY = Math.max(this.halfH, Math.min(CANVAS_HEIGHT - this.halfH, nextY));
      bounced = true;
    }

    if (bounced) {
      this.dvdColor = this.randomColor();
    }

    this.pos.x = nextX;
    this.pos.y = nextY;
  }

  private randomColor(): string {
    const colors = ['#ff4d6d', '#4dd0ff', '#b86bff', '#ffb86b', '#88ff4d', '#ff4d88', '#ffdd4d'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}
