/**
 * Admin mode state, kept in-memory only. Refresh exits admin mode.
 * Activated by a hidden easter-egg: pressing 'L' 5 times within 1.5s on the main menu.
 */
class AdminService {
  private _enabled = false;

  isEnabled(): boolean {
    return this._enabled;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  toggle(): boolean {
    this._enabled = !this._enabled;
    return this._enabled;
  }
}

export const admin = new AdminService();

export const ADMIN_TAP_KEY = 'L';
export const ADMIN_TAP_COUNT = 5;
export const ADMIN_TAP_WINDOW_MS = 1500;
