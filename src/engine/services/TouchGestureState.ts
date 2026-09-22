export const DOUBLE_TAP_MS = 300;

/** Tracks tap timing without treating a cancelled pointer as a tap. */
export class TapTracker {
  private lastTapTime: number | null = null;

  registerTap(now: number): boolean {
    if (this.lastTapTime !== null && now - this.lastTapTime < DOUBLE_TAP_MS) {
      this.lastTapTime = null;
      return true;
    }
    this.lastTapTime = now;
    return false;
  }

  cancel(): void {
    this.lastTapTime = null;
  }

  reset(): void {
    this.lastTapTime = null;
  }
}
