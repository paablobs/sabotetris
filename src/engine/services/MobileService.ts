/**
 * Mobile detection + touch gesture input for the GameScene.
 *
 * Mobile is detected once at module load via touch capability AND coarse pointer
 * media query. On desktop (no touch / fine pointer) the entire touch layer is
 * skipped, so keyboard and mouse behavior are unaffected.
 *
 * Gesture model (one finger = one discrete action):
 *   - Swipe left  -> move one cell left
 *   - Swipe right -> move one cell right
 *   - Swipe down  -> move one cell down (soft drop step)
 *   - Two-finger swipe (any direction) -> hard drop
 *   - Short tap on the current piece -> rotate
 *   - Pause is NOT triggered by any touch gesture; the phone's back
 *     button is wired to it from GameScene instead.
 */

function detectCoarsePointer(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export const isMobile: boolean = (() => {
  if (typeof window === 'undefined') return false;
  const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
  return hasTouch && detectCoarsePointer();
})();

export interface TouchInputCallbacks {
  moveLeft: () => void;
  moveRight: () => void;
  rotate: (canvasX: number, canvasY: number) => void;
  softDrop: () => void;
  hardDrop: () => void;
}

interface ActiveTouch {
  id: number;
  startX: number;
  startY: number;
  startTime: number;
  firedSwipeOrDrop: boolean;
}

const SWIPE_THRESHOLD = 32;
const TAP_MAX_DURATION_MS = 300;
const TAP_MAX_MOVE = 10;
const BOARD_X = 20;
const BOARD_Y = 30;
const BOARD_WIDTH = 320;
const BOARD_HEIGHT = 640;

export class TouchInput {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: TouchInputCallbacks;
  private readonly touches = new Map<number, ActiveTouch>();
  private onDown: ((e: PointerEvent) => void) | null = null;
  private onMove: ((e: PointerEvent) => void) | null = null;
  private onUp: ((e: PointerEvent) => void) | null = null;
  private onCancel: ((e: PointerEvent) => void) | null = null;
  private enabled = false;
  private twoFingerFired = false;

  constructor(canvas: HTMLCanvasElement, callbacks: TouchInputCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
  }

  enable(): void {
    if (this.enabled || !isMobile) return;
    this.enabled = true;
    this.onDown = (e) => this.handleDown(e);
    this.onMove = (e) => this.handleMove(e);
    this.onUp = (e) => this.handleUp(e);
    this.onCancel = (e) => this.handleUp(e);
    this.canvas.addEventListener('pointerdown', this.onDown, { passive: false });
    this.canvas.addEventListener('pointermove', this.onMove, { passive: true });
    this.canvas.addEventListener('pointerup', this.onUp, { passive: true });
    this.canvas.addEventListener('pointercancel', this.onCancel, { passive: true });
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    if (this.onDown) this.canvas.removeEventListener('pointerdown', this.onDown);
    if (this.onMove) this.canvas.removeEventListener('pointermove', this.onMove);
    if (this.onUp) this.canvas.removeEventListener('pointerup', this.onUp);
    if (this.onCancel) this.canvas.removeEventListener('pointercancel', this.onCancel);
    this.onDown = this.onMove = this.onUp = this.onCancel = null;
    this.touches.clear();
    this.twoFingerFired = false;
  }

  setBlocked(blocked: boolean): void {
    if (blocked) {
      this.touches.clear();
      this.twoFingerFired = false;
    }
  }

  private handleDown(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    this.touches.set(e.pointerId, {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      firedSwipeOrDrop: false,
    });
  }

  private handleMove(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    const t = this.touches.get(e.pointerId);
    if (!t || t.firedSwipeOrDrop) return;

    const dx = e.clientX - t.startX;
    const dy = e.clientY - t.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Two-finger swipe (any direction) -> hard drop, once per gesture.
    if (this.touches.size >= 2 && (absDx > SWIPE_THRESHOLD || absDy > SWIPE_THRESHOLD)) {
      if (!this.twoFingerFired) {
        this.twoFingerFired = true;
        this.callbacks.hardDrop();
        t.firedSwipeOrDrop = true;
        e.preventDefault();
        for (const other of this.touches.values()) {
          other.firedSwipeOrDrop = true;
        }
      }
      return;
    }

    // Single-finger swipes only fire while exactly one finger is down.
    if (this.touches.size !== 1) return;

    if (dy > SWIPE_THRESHOLD && absDy > absDx) {
      t.firedSwipeOrDrop = true;
      e.preventDefault();
      this.callbacks.softDrop();
      return;
    }

    if (absDx > SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD * 1.2) {
      t.firedSwipeOrDrop = true;
      e.preventDefault();
      const dir: -1 | 1 = dx < 0 ? -1 : 1;
      this.fireMove(dir);
    }
  }

  private handleUp(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    const t = this.touches.get(e.pointerId);
    this.touches.delete(e.pointerId);

    if (this.touches.size === 0) {
      this.twoFingerFired = false;
    }

    if (!t || t.firedSwipeOrDrop) return;

    const dt = performance.now() - t.startTime;
    const totalDx = Math.abs(e.clientX - t.startX);
    const totalDy = Math.abs(e.clientY - t.startY);
    if (dt > TAP_MAX_DURATION_MS) return;
    if (totalDx > TAP_MAX_MOVE || totalDy > TAP_MAX_MOVE) return;
    if (!this.isInsideBoard(e.clientX, e.clientY)) return;

    const { x, y } = this.clientToCanvas(e.clientX, e.clientY);
    this.callbacks.rotate(x, y);
  }

  private fireMove(direction: -1 | 1): void {
    if (direction < 0) this.callbacks.moveLeft();
    else this.callbacks.moveRight();
  }

  private clientToCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  private isInsideBoard(x: number, y: number): boolean {
    const { x: lx, y: ly } = this.clientToCanvas(x, y);
    return (
      lx >= BOARD_X &&
      lx < BOARD_X + BOARD_WIDTH &&
      ly >= BOARD_Y &&
      ly < BOARD_Y + BOARD_HEIGHT
    );
  }
}
