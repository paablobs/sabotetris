/**
 * Admin mode state, kept in-memory only. Refresh exits admin mode.
 * Activated by a hidden easter-egg: pressing 'L' 5 times within 1.5s on the main menu.
 */
class AdminService {
  private _enabled = false;
  private listeners: Array<(enabled: boolean) => void> = [];

  isEnabled(): boolean {
    return this._enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this._enabled === enabled) return;
    this._enabled = enabled;
    for (const fn of this.listeners) fn(enabled);
  }

  toggle(): boolean {
    this.setEnabled(!this._enabled);
    return this._enabled;
  }

  onChange(fn: (enabled: boolean) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }
}

export const admin = new AdminService();

export const ADMIN_TAP_KEY = 'L';
export const ADMIN_TAP_COUNT = 5;
export const ADMIN_TAP_WINDOW_MS = 1500;
