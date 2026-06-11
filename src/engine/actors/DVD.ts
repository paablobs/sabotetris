import * as ex from 'excalibur';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../types';

/**
 * Bouncing DVD logo for hardcore mode.
 * Bounces across the entire screen and changes color on every wall hit.
 */
export class DVDActor extends ex.Actor {
  private vx = 120;
  private vy = 80;
  private dvdColor = '#ff4d6d';
  private halfW = 16;
  private halfH = 8;

  constructor() {
    super({
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      width: 32,
      height: 16,
      anchor: ex.Vector.Half,
    });
  }

  onInitialize(): void {
    this.updateGraphic();
  }

  onPreUpdate(_engine: ex.Engine, delta: number): void {
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
      this.updateGraphic();
    }

    this.pos.x = nextX;
    this.pos.y = nextY;
  }

  private updateGraphic(): void {
    const c = this.dvdColor;
    const graphic = new ex.Canvas({
      cache: false,
      width: 32,
      height: 16,
      draw: (ctx) => {
        ctx.fillStyle = c;
        ctx.fillRect(2, 2, 28, 12);
      },
    });
    this.graphics.use(graphic);
  }

  private randomColor(): string {
    const colors = ['#ff4d6d', '#4dd0ff', '#b86bff', '#ffb86b', '#88ff4d', '#ff4d88', '#ffdd4d'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}
