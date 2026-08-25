import type * as ex from 'excalibur';

/**
 * Excalibur keeps updating actors even when a scene skips its own update
 * logic, so pauseable background actors (DVD logo, space invader, bullets)
 * check this guard at the top of onPreUpdate. Scenes opt in by exposing an
 * isPaused() method.
 */
export function isScenePaused(scene: ex.Scene | null): boolean {
  const pausable = scene as { isPaused?: () => boolean } | null;
  return pausable?.isPaused?.() ?? false;
}
