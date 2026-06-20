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
  private speed = 80;
  private shotsFired = 0;
  private readonly maxShots = 5;
  private shotTimer = 0;
  private readonly shotInterval = 1500;
  private alive = true;
  private readonly onBlockDestroyed?: (row: number, col: number) => void;

  constructor(grid: Grid, onBlockDestroyed?: (row: number, col: number) => void) {
    const startX = BOARD_X + 40 + Math.random() * (BOARD_WIDTH - 80);
    super({
      x: startX,
      y: BOARD_Y - 30,
      width: 36,
      height: 24,
      anchor: ex.Vector.Half,
    });
    this.grid = grid;
    this.onBlockDestroyed = onBlockDestroyed;
  }

  onInitialize(): void {
    const graphic = new ex.Canvas({
      cache: false,
      width: 36,
      height: 24,
      draw: (ctx) => {
        ctx.fillStyle = '#ff4d6d';
        ctx.fillRect(4, 0, 28, 14);
        ctx.fillRect(0, 10, 36, 4);
        ctx.fillRect(6, 14, 6, 10);
        ctx.fillRect(24, 14, 6, 10);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(14, 4, 8, 6);
      },
    });
    this.graphics.use(graphic);
  }

  onPreUpdate(_engine: ex.Engine, delta: number): void {
    if (!this.alive) return;

    const dt = delta / 1000;
    this.pos.x += this.direction * this.speed * dt;

    if (this.pos.x <= BOARD_X + 18 || this.pos.x >= BOARD_X + BOARD_WIDTH - 18) {
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
    const bullet = new InvaderBullet(this.pos.x, this.pos.y + 28, this.grid, this.onBlockDestroyed);
    this.scene?.add(bullet);
  }
}

class InvaderBullet extends ex.Actor {
  private readonly grid: Grid;
  private speed = 300;
  private readonly onBlockDestroyed?: (row: number, col: number) => void;

  constructor(x: number, y: number, grid: Grid, onBlockDestroyed?: (row: number, col: number) => void) {
    super({
      x,
      y,
      width: 8,
      height: 8,
      anchor: ex.Vector.Half,
    });
    this.grid = grid;
    this.onBlockDestroyed = onBlockDestroyed;
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
        this.onBlockDestroyed?.(row, col);
        this.kill();
        return;
      }
    }

    if (this.pos.y > BOARD_Y + BOARD_HEIGHT + 20) {
      this.kill();
    }
  }
}
