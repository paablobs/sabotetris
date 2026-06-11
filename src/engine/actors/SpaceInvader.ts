import * as ex from 'excalibur';
import {
  BOARD_X,
  BOARD_Y,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  COLS,
  ROWS,
  CELL_SIZE,
} from '../../types';
import type { Grid } from '../../types';

/**
 * Space invader ship that appears in hardcore mode and shoots bullets
 * that destroy existing blocks on the board.
 */
export class SpaceInvaderActor extends ex.Actor {
  private readonly grid: Grid;
  private direction = 1;
  private speed = 60;
  private shotsFired = 0;
  private readonly maxShots = 5;
  private shotTimer = 0;
  private readonly shotInterval = 2000;
  private alive = true;

  constructor(grid: Grid) {
    super({
      x: BOARD_X + BOARD_WIDTH / 2,
      y: BOARD_Y - 40,
      width: 28,
      height: 20,
      anchor: ex.Vector.Half,
    });
    this.grid = grid;
  }

  onInitialize(): void {
    const graphic = new ex.Canvas({
      cache: false,
      width: 28,
      height: 20,
      draw: (ctx) => {
        ctx.fillStyle = '#ff4d6d';
        ctx.fillRect(4, 0, 20, 12);
        ctx.fillRect(0, 8, 28, 4);
        ctx.fillRect(4, 12, 4, 8);
        ctx.fillRect(20, 12, 4, 8);
      },
    });
    this.graphics.use(graphic);
  }

  onPreUpdate(_engine: ex.Engine, delta: number): void {
    if (!this.alive) return;

    const dt = delta / 1000;
    this.pos.x += this.direction * this.speed * dt;

    if (this.pos.x <= BOARD_X + 14 || this.pos.x >= BOARD_X + BOARD_WIDTH - 14) {
      this.direction *= -1;
    }

    this.shotTimer += delta;
    if (this.shotTimer >= this.shotInterval) {
      this.shotTimer = 0;
      this.fireBullet();
    }

    if (this.shotsFired >= this.maxShots) {
      this.alive = false;
      this.kill();
    }
  }

  private fireBullet(): void {
    this.shotsFired++;
    const bullet = new InvaderBullet(this.pos.x, this.pos.y + 20, this.grid);
    this.scene?.add(bullet);
  }
}

class InvaderBullet extends ex.Actor {
  private readonly grid: Grid;
  private speed = 200;

  constructor(x: number, y: number, grid: Grid) {
    super({
      x,
      y,
      width: 8,
      height: 8,
      anchor: ex.Vector.Half,
    });
    this.grid = grid;
  }

  onInitialize(): void {
    const graphic = new ex.Canvas({
      cache: false,
      width: 8,
      height: 8,
      draw: (ctx) => {
        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(0, 0, 8, 8);
      },
    });
    this.graphics.use(graphic);
  }

  onPreUpdate(_engine: ex.Engine, delta: number): void {
    this.pos.y += this.speed * (delta / 1000);

    const col = Math.floor((this.pos.x - BOARD_X) / CELL_SIZE);
    const row = Math.floor((this.pos.y - BOARD_Y) / CELL_SIZE);

    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
      if (this.grid[row][col] !== null) {
        this.grid[row][col] = null;
        this.kill();
        return;
      }
    }

    if (this.pos.y > BOARD_Y + BOARD_HEIGHT + 20) {
      this.kill();
    }
  }
}
