import * as ex from 'excalibur';
import { CANVAS_WIDTH, CANVAS_HEIGHT, BOARD_Y } from '../../types';
import type { GameSimulation } from '../../../supabase/functions/_shared/game/simulation.ts';

/** Read-only renderer: ships, shots and block destruction belong to simulation. */
export class SpaceInvaderActor extends ex.Actor {
  private readonly state: () => GameSimulation | null;
  constructor(state: () => GameSimulation | null) {
    super({ x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, anchor: ex.Vector.Zero, z: 5 });
    this.state = state;
  }
  onInitialize(): void {
    this.graphics.use(new ex.Canvas({ cache: false, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, draw: ctx => {
      const state = this.state();
      if (!state) return;
      for (const ship of state.invaders) {
        const x = ship.x - 18, y = BOARD_Y - 42;
        ctx.fillStyle = '#ff4d6d';
        ctx.fillRect(x + 4, y, 28, 14); ctx.fillRect(x, y + 10, 36, 4);
        ctx.fillRect(x + 6, y + 14, 6, 10); ctx.fillRect(x + 24, y + 14, 6, 10);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 14, y + 4, 8, 6);
      }
      ctx.fillStyle = '#ffaa00';
      for (const bullet of state.bullets) ctx.fillRect(bullet.x - 4, bullet.y - 4, 8, 8);
    } }));
  }
}
