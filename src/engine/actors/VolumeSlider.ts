import * as ex from 'excalibur';
import { CANVAS_WIDTH } from '../../types';
import { audio } from '../services/AudioService';

const SLIDER_WIDTH = 120;
const SLIDER_HEIGHT = 44;
const SLIDER_X = CANVAS_WIDTH - 12 - 44 - 10 - SLIDER_WIDTH / 2;

export function createVolumeSlider(): ex.Actor {
  const actor = new ex.Actor({
    x: SLIDER_X,
    y: 34,
    width: SLIDER_WIDTH,
    height: SLIDER_HEIGHT,
    anchor: ex.Vector.Half,
    z: 50,
  });

  const graphic = new ex.Canvas({
    cache: false,
    width: SLIDER_WIDTH,
    height: SLIDER_HEIGHT,
    draw: (ctx) => {
      const value = audio.getMasterVolume();
      const trackX = 10;
      const trackY = 25;
      const trackWidth = SLIDER_WIDTH - 20;

      ctx.fillStyle = 'rgba(77, 208, 255, 0.18)';
      ctx.fillRect(0, 0, SLIDER_WIDTH, SLIDER_HEIGHT);
      ctx.strokeStyle = 'rgba(77, 208, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, SLIDER_WIDTH, SLIDER_HEIGHT);
      ctx.fillStyle = '#29465a';
      ctx.fillRect(trackX, trackY - 2, trackWidth, 4);
      ctx.fillStyle = '#4dd0ff';
      ctx.fillRect(trackX, trackY - 2, trackWidth * value, 4);
      ctx.beginPath();
      ctx.arc(trackX + trackWidth * value, trackY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ddeeff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`VOL ${Math.round(value * 100)}%`, SLIDER_WIDTH / 2, 10);
    },
  });
  actor.graphics.use(graphic);

  let dragging = false;
  const updateVolume = (evt: ex.PointerEvent): void => {
    const localX = evt.worldPos.x - (SLIDER_X - SLIDER_WIDTH / 2);
    audio.setMasterVolume(localX / SLIDER_WIDTH);
  };
  actor.on('pointerdown', (evt) => {
    dragging = true;
    updateVolume(evt);
  });
  actor.on('pointermove', (evt) => {
    if (dragging) updateVolume(evt);
  });
  actor.on('pointerup', () => { dragging = false; });
  actor.on('pointerleave', () => { dragging = false; });
  actor.pointer.useGraphicsBounds = true;

  return actor;
}
