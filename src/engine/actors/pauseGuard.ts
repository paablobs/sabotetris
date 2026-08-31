import type * as ex from 'excalibur';

export function isScenePaused(scene: ex.Scene | null): boolean {
  const pausable = scene as { isPaused?: () => boolean } | null;
  return pausable?.isPaused?.() ?? false;
}
