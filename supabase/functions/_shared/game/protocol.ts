// v1 freezes rules, PRNG, data tables, input ordering and 20ms tick semantics.
// Any gameplay change requires a new version; never reinterpret old runs.
export const RULES_VERSION = 'sabo-replay-v1';
export const TICK_MS = 20;
export const MAX_TICKS = 90_000; // 30 active minutes; beyond this, continue locally.
export const MAX_EVENTS = 12_000;
export const MAX_EVENTS_PER_TICK = 4;
export const MAX_REPLAY_BYTES = 192 * 1024;
export const ELAPSED_TOLERANCE_MS = 2_000;
export type GameMode = 'softcore' | 'hardcore';
export const INPUT = { left: 0, right: 1, rotate: 2, softStep: 3, hardDrop: 4, softOn: 5, softOff: 6 } as const;
export type InputAction = typeof INPUT[keyof typeof INPUT];
export type ReplayEvent = [tick: number, action: InputAction];
export interface Replay { ticks: number; events: ReplayEvent[] }
export interface RunDescriptor {
  id: string; mode: GameMode; seed: string; rulesVersion: string; expiresAt: string;
}
export function actionGroup(action: InputAction): number {
  return action <= 1 ? 0 : action >= 5 ? 4 : action - 1;
}
export function validReplay(value: unknown): value is Replay {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (Object.keys(r).some(key => !['ticks', 'events'].includes(key)) ||
      typeof r.ticks !== 'number' || !Number.isInteger(r.ticks) || r.ticks < 1 || r.ticks > MAX_TICKS ||
      !Array.isArray(r.events) || r.events.length > MAX_EVENTS) return false;
  let previous = 0;
  let groups = 0;
  let count = 0;
  for (const event of r.events) {
    if (!Array.isArray(event) || event.length !== 2) return false;
    const [tick, action] = event;
    if (!Number.isInteger(tick) || tick < 1 || tick > r.ticks || tick < previous ||
        !Number.isInteger(action) || action < 0 || action > 6) return false;
    if (tick !== previous) { groups = 0; count = 0; }
    const bit = 1 << actionGroup(action);
    if ((groups & bit) !== 0 || ++count > MAX_EVENTS_PER_TICK) return false;
    groups |= bit;
    previous = tick;
  }
  return true;
}

/** Client budget tracking; exceeding a budget never ends a local game. */
export class ReplayRecorder {
  private events: ReplayEvent[] = [];
  private eligible = true;
  record(tick: number, actions: readonly InputAction[]): void {
    if (!this.eligible) return;
    if (tick > MAX_TICKS || this.events.length + actions.length > MAX_EVENTS) {
      this.eligible = false;
      this.events = [];
      return;
    }
    for (const action of actions) this.events.push([tick, action]);
  }
  finish(ticks: number): Replay | null {
    return this.eligible && ticks > 0 && ticks <= MAX_TICKS
      ? { ticks, events: this.events.map(([tick, action]) => [tick, action]) } : null;
  }
  get withinBudget(): boolean { return this.eligible; }
}
