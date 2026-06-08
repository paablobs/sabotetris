import type { GameState, ChaosEffect } from '../../types';
import { randomInt } from '../../utils/helpers';

/**
 * ChaosEngine is the core sabotage system.
 * It applies random chaos effects to the active piece at timed intervals.
 * Extensible: add new effects by implementing ChaosEffect and registering them.
 */
export class ChaosEngine {
  private effects: ChaosEffect[] = [];
  private gameState: GameState;
  private level: number;

  constructor(level: number, gameState: GameState) {
    this.level = level;
    this.gameState = gameState;
    this.registerDefaultEffects();
  }

  setLevel(level: number): void {
    this.level = level;
  }

  getInterval(): number {
    return Math.max(800, 5000 - (this.level - 1) * 450);
  }

  /**
   * Register additional effects at runtime for extensibility.
   */
  registerEffect(effect: ChaosEffect): void {
    this.effects.push(effect);
  }

  /**
   * Pick and execute a random chaos effect.
   * Returns the effect that was applied or null if no effects registered.
   */
  applyRandomEffect(): ChaosEffect | null {
    if (this.effects.length === 0) return null;
    const effect = this.effects[randomInt(0, this.effects.length - 1)];
    effect.execute(this.gameState);
    return effect;
  }

  private registerDefaultEffects(): void {
    this.effects = [
      new MoveLeftEffect(),
      new MoveRightEffect(),
      new RotateEffect(),
      new AccelerateEffect(this.level),
      new IgnoreInputEffect(this.level),
      new ReverseCommandEffect(this.level),
      new PanicDropEffect(),
      new DriftEffect(),
    ];
  }
}

class MoveLeftEffect implements ChaosEffect {
  readonly name = 'Greased Grip';
  readonly description = 'Piece slips left!';
  execute(state: GameState): void {
    state.movePiece(0, -1);
  }
}

class MoveRightEffect implements ChaosEffect {
  readonly name = 'Slippery Fingers';
  readonly description = 'Piece slides right!';
  execute(state: GameState): void {
    state.movePiece(0, 1);
  }
}

class RotateEffect implements ChaosEffect {
  readonly name = 'Spinning Out';
  readonly description = 'Piece rotates!';
  execute(state: GameState): void {
    state.rotatePiece();
  }
}

class AccelerateEffect implements ChaosEffect {
  readonly name = 'Gravity Surge';
  readonly description = 'Piece accelerates down!';
  private intensity: number;

  constructor(level: number) {
    this.intensity = Math.min(5, 1 + Math.floor(level / 2));
  }

  execute(state: GameState): void {
    for (let i = 0; i < this.intensity; i++) {
      if (!state.movePiece(1, 0)) break;
    }
  }
}

class IgnoreInputEffect implements ChaosEffect {
  readonly name = 'Locked Controls';
  readonly description = 'Input locked!';
  private duration: number;

  constructor(level: number) {
    this.duration = Math.min(3000, 1500 + level * 150);
  }

  execute(state: GameState): void {
    state.setIgnoreInput(this.duration);
  }
}

class ReverseCommandEffect implements ChaosEffect {
  readonly name = 'Reverse Polarity';
  readonly description = 'Controls reversed!';
  private duration: number;

  constructor(level: number) {
    this.duration = Math.min(4000, 2000 + level * 200);
  }

  execute(state: GameState): void {
    state.setReverseInput(this.duration);
  }
}

class PanicDropEffect implements ChaosEffect {
  readonly name = 'Panic Drop';
  readonly description = 'Piece drops to bottom!';
  execute(state: GameState): void {
    state.panicDrop();
  }
}

class DriftEffect implements ChaosEffect {
  readonly name = 'Magnetic Drift';
  readonly description = 'Piece drifts sideways!';
  execute(state: GameState): void {
    const direction = Math.random() > 0.5 ? -1 : 1;
    state.movePiece(0, direction);
  }
}
