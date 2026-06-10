import type { GameState, ChaosEffect, TetrominoType } from '../../types';
import { randomInt } from '../../utils/helpers';

interface LeveledEffect {
  minLevel: number;
  effect: ChaosEffect;
}

/**
 * ChaosEngine is the core sabotage system.
 * It applies random chaos effects to the active piece at timed intervals.
 * The effect pool grows with the level: 3 effects at level 1, one new effect per
 * level afterwards (12 effects total at level 10).
 */
export class ChaosEngine {
  private effects: LeveledEffect[] = [];
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
  registerEffect(effect: ChaosEffect, minLevel = 1): void {
    this.effects.push({ minLevel, effect });
  }

  /**
   * Pick and execute a random chaos effect from the currently-available pool.
   * Returns the effect that was applied or null if no effects registered.
   */
  applyRandomEffect(): ChaosEffect | null {
    const available = this.effects.filter(e => e.minLevel <= this.level);
    if (available.length === 0) return null;
    const picked = available[randomInt(0, available.length - 1)];
    picked.effect.execute(this.gameState);
    return picked.effect;
  }

  private registerDefaultEffects(): void {
    this.effects = [
      { minLevel: 1, effect: new PanicDropEffect() },
      { minLevel: 1, effect: new LockedControlsEffect(1) },
      { minLevel: 1, effect: new MagneticDriftEffect() },
      { minLevel: 2, effect: new GreasedGripEffect() },
      { minLevel: 3, effect: new SlipperyFingersEffect() },
      { minLevel: 4, effect: new SpinningOutEffect() },
      { minLevel: 5, effect: new GravitySurgeEffect(5) },
      { minLevel: 6, effect: new ReversePolarityEffect(6) },
      { minLevel: 7, effect: new PhantomLockEffect() },
      { minLevel: 8, effect: new ColorBlindEffect() },
      { minLevel: 9, effect: new FamineEffect() },
      { minLevel: 10, effect: new QuakeEffect() },
    ];
  }
}

class GreasedGripEffect implements ChaosEffect {
  readonly name = 'Greased Grip';
  readonly description = 'Piece slips left!';
  execute(state: GameState): void {
    state.movePiece(0, -1);
  }
}

class SlipperyFingersEffect implements ChaosEffect {
  readonly name = 'Slippery Fingers';
  readonly description = 'Piece slides right!';
  execute(state: GameState): void {
    state.movePiece(0, 1);
  }
}

class SpinningOutEffect implements ChaosEffect {
  readonly name = 'Spinning Out';
  readonly description = 'Piece rotates!';
  execute(state: GameState): void {
    state.rotatePiece();
  }
}

class GravitySurgeEffect implements ChaosEffect {
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

class LockedControlsEffect implements ChaosEffect {
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

class ReversePolarityEffect implements ChaosEffect {
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

class MagneticDriftEffect implements ChaosEffect {
  readonly name = 'Magnetic Drift';
  readonly description = 'Piece drifts sideways!';
  execute(state: GameState): void {
    const direction = Math.random() > 0.5 ? -1 : 1;
    state.movePiece(0, direction);
  }
}

const PIECE_TYPES: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

class PhantomLockEffect implements ChaosEffect {
  readonly name = 'Phantom Lock';
  readonly description = 'A phantom block appears on the board!';
  execute(state: GameState): void {
    state.lockPhantomCell();
  }
}

class ColorBlindEffect implements ChaosEffect {
  readonly name = 'Color Blind';
  readonly description = 'Next piece hidden from view!';
  execute(state: GameState): void {
    state.setNextPieceHidden(3000);
  }
}

class FamineEffect implements ChaosEffect {
  readonly name = 'Famine';
  readonly description = 'The same piece type repeats!';
  execute(state: GameState): void {
    const t = PIECE_TYPES[randomInt(0, PIECE_TYPES.length - 1)];
    state.forceNextPieceType(t);
  }
}

class QuakeEffect implements ChaosEffect {
  readonly name = 'Quake';
  readonly description = 'The board shifts up!';
  execute(state: GameState): void {
    state.shiftBoardUp();
  }
}
