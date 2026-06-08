import * as ex from 'excalibur';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../types';
import { MainMenuScene } from './scenes/MainMenuScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { RankingScene } from './scenes/RankingScene';

/**
 * SabotetrisGame is the main Excalibur Engine wrapper.
 * Registers all scenes and manages the engine lifecycle.
 */
export class SabotetrisGame {
  private engine: ex.Engine;

  constructor(canvasElement?: HTMLCanvasElement) {
    this.engine = new ex.Engine({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      displayMode: ex.DisplayMode.Fixed,
      backgroundColor: ex.Color.fromHex('#1a1a2e'),
      suppressPlayButton: true,
      antialiasing: false,
      canvasElement,
    });

    this.registerScenes();
  }

  private registerScenes(): void {
    this.engine.addScene('menu', new MainMenuScene());
    this.engine.addScene('game', new GameScene());
    this.engine.addScene('gameover', new GameOverScene());
    this.engine.addScene('ranking', new RankingScene());
  }

  async start(): Promise<void> {
    await this.engine.start();
    await this.engine.goToScene('menu');
  }

  stop(): void {
    try {
      this.engine.stop();
    } catch {
      // Silently handle cleanup errors
    }
  }
}
