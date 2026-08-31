import * as ex from 'excalibur';
import { CANVAS_WIDTH } from '../../types';
import { audio, drawMuteIcon } from '../services/AudioService';

export function createMuteButton(at?: { x: number; y: number }): ex.Actor {
  const size = 44;
  const x = at?.x ?? CANVAS_WIDTH - 12 - size / 2;
  const y = at?.y ?? 12 + size / 2;
  const actor = new ex.Actor({
    x,
    y,
    width: size,
    height: size,
    anchor: ex.Vector.Half,
    z: 50,
  });
  const graphic = new ex.Canvas({
    cache: false,
    width: size,
    height: size,
    draw: (ctx) => {
      const muted = audio.isMuted();
      const accent = muted ? '#ff4d6d' : '#4dd0ff';
      ctx.fillStyle = muted ? 'rgba(255, 77, 109, 0.18)' : 'rgba(77, 208, 255, 0.18)';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = muted ? 'rgba(255, 77, 109, 0.6)' : 'rgba(77, 208, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, size, size);
      drawMuteIcon(ctx, size, muted, accent);
    },
  });
  actor.graphics.use(graphic);

  actor.on('pointerdown', () => {
    audio.toggleMute();
  });
  actor.pointer.useGraphicsBounds = true;

  return actor;
}
