import * as ex from 'excalibur';
import { COLS, ROWS, CELL_SIZE, BOARD_WIDTH, BOARD_HEIGHT, BOARD_X, BOARD_Y } from '../../types';
import type { Grid, PieceState } from '../../types';

/**
 * BoardActor renders the Tetris game board and current piece using Excalibur's Canvas graphics.
 * It draws the grid background, placed cells, current piece, and grid lines.
 */
export class BoardActor extends ex.Actor {
  private grid: Grid;
  private currentPiece: PieceState | null = null;
  private backgroundColor = '#0d0d1a';

  constructor() {
    super({
      x: BOARD_X,
      y: BOARD_Y,
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      anchor: ex.Vector.Zero,
    });
    this.grid = Array.from({ length: ROWS }, () => Array<string | null>(COLS).fill(null));
  }

  onInitialize(): void {
    const graphic = new ex.Canvas({
      cache: false,
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      draw: (ctx) => this.draw(ctx),
    });
    this.graphics.use(graphic);
  }

  setGrid(grid: Grid): void {
    this.grid = grid;
  }

  setCurrentPiece(piece: PieceState | null): void {
    this.currentPiece = piece;
  }

  setBackgroundColor(color: string): void {
    this.backgroundColor = color;
  }

  private draw(ctx: CanvasRenderingContext2D): void {
    this.drawBackground(ctx);
    this.drawPlacedCells(ctx);
    this.drawGhostPiece(ctx);
    this.drawCurrentPiece(ctx);
    this.drawGridLines(ctx);
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  }

  private drawPlacedCells(ctx: CanvasRenderingContext2D): void {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const color = this.grid[row][col];
        if (color) {
          this.drawCell(ctx, col * CELL_SIZE, row * CELL_SIZE, color);
        }
      }
    }
  }

  private drawGhostPiece(ctx: CanvasRenderingContext2D): void {
    if (!this.currentPiece) return;
    const { shape } = this.currentPiece;
    let ghostRow = this.currentPiece.row;
    const ghostCol = this.currentPiece.col;

    while (this.isValidGhost(ghostRow + 1, ghostCol, shape)) {
      ghostRow++;
    }

    ctx.globalAlpha = 0.2;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const x = (ghostCol + c) * CELL_SIZE;
          const y = (ghostRow + r) * CELL_SIZE;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        }
      }
    }
    ctx.globalAlpha = 1.0;
  }

  private isValidGhost(row: number, col: number, shape: number[][]): boolean {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const boardRow = row + r;
        const boardCol = col + c;
        if (boardCol < 0 || boardCol >= COLS || boardRow >= ROWS) return false;
        if (boardRow < 0) continue;
        if (this.grid[boardRow][boardCol] !== null) return false;
      }
    }
    return true;
  }

  private drawCurrentPiece(ctx: CanvasRenderingContext2D): void {
    if (!this.currentPiece) return;
    const { shape, color, row, col } = this.currentPiece;

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const x = (col + c) * CELL_SIZE;
          const y = (row + r) * CELL_SIZE;
          this.drawCell(ctx, x, y, color);
        }
      }
    }
  }

  private drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, 2);
    ctx.fillRect(x + 1, y + 1, 2, CELL_SIZE - 2);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 1, y + CELL_SIZE - 3, CELL_SIZE - 2, 2);
    ctx.fillRect(x + CELL_SIZE - 3, y + 1, 2, CELL_SIZE - 2);
  }

  private drawGridLines(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let row = 0; row <= ROWS; row++) {
      ctx.beginPath();
      ctx.moveTo(0, row * CELL_SIZE);
      ctx.lineTo(BOARD_WIDTH, row * CELL_SIZE);
      ctx.stroke();
    }
    for (let col = 0; col <= COLS; col++) {
      ctx.beginPath();
      ctx.moveTo(col * CELL_SIZE, 0);
      ctx.lineTo(col * CELL_SIZE, BOARD_HEIGHT);
      ctx.stroke();
    }
  }
}
