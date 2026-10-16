import { GameSimulation } from '../../supabase/functions/_shared/game/simulation.ts';
import type { GameMode, InputAction, Replay } from '../../supabase/functions/_shared/game/protocol.ts';
export const SEED = '0123456789abcdeffedcba9876543210';
export function finishedReplay(mode: GameMode, kind: 'idle' | 'drop' | 'mixed' = 'drop') {
  const game = new GameSimulation(SEED, mode);
  const replay: Replay = { ticks: 0, events: [] };
  for (let tick = 1; tick <= 90_000 && !game.gameOver; tick++) {
    const actions: InputAction[] = kind === 'idle' ? [] : kind === 'drop' ? (tick % 5 === 1 ? [4] : [])
      : tick % 7 === 1 ? [tick % 3 === 0 ? 0 : 1, 2, 4] : [];
    for (const action of actions) replay.events.push([tick, action]);
    game.step(actions);
  }
  replay.ticks = game.ticks;
  return { game, replay };
}
