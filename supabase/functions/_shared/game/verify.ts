import { GameSimulation } from './simulation.ts';
import { ELAPSED_TOLERANCE_MS, RULES_VERSION, TICK_MS, validReplay } from './protocol.ts';
import type { GameMode, InputAction, Replay } from './protocol.ts';

export interface VerificationContext { seed: string; mode: GameMode; rulesVersion: string; elapsedMs: number }
export interface VerifiedResult { score: number; level: number; ticks: number }
export function verifyReplay(context: VerificationContext, replay: Replay): VerifiedResult {
  if (context.rulesVersion !== RULES_VERSION) throw new Error('rules_mismatch');
  if (!validReplay(replay)) throw new Error('invalid_replay');
  if (!Number.isFinite(context.elapsedMs) || replay.ticks * TICK_MS > context.elapsedMs + ELAPSED_TOLERANCE_MS) {
    throw new Error('replay_too_fast');
  }
  const game = new GameSimulation(context.seed, context.mode);
  let index = 0;
  const actions: InputAction[] = [];
  for (let tick = 1; tick <= replay.ticks; tick++) {
    if (game.gameOver) throw new Error('replay_after_game_over');
    actions.length = 0;
    while (index < replay.events.length && replay.events[index][0] === tick) actions.push(replay.events[index++][1]);
    game.step(actions);
  }
  if (!game.gameOver) throw new Error('replay_not_finished');
  return { score: game.score, level: game.levels.getLevel(), ticks: game.ticks };
}

/** Canonical retries bind name + complete replay; JSON key order is irrelevant. */
export async function submissionDigest(playerName: string, replay: Replay): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([RULES_VERSION, playerName, replay.ticks, replay.events]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
