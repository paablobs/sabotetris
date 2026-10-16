import * as ex from 'excalibur';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../types';
import { GameSimulation } from '../../../supabase/functions/_shared/game/simulation.ts';
import { INPUT, TICK_MS, RULES_VERSION, ReplayRecorder, actionGroup, MAX_EVENTS_PER_TICK } from '../../../supabase/functions/_shared/game/protocol.ts';
import type { GameMode, InputAction } from '../../../supabase/functions/_shared/game/protocol.ts';
import { BoardActor } from '../actors/Board';
import { SidePanel } from '../actors/SidePanel';
import { DVDActor } from '../actors/DVD';
import { SpaceInvaderActor } from '../actors/SpaceInvader';
import { admin } from '../services/AdminService';
import { isMobile, TouchInput } from '../services/MobileService';
import { audio } from '../services/AudioService';
import { AudioControls } from '../actors/AudioControls';
import { prepareOnlineRun } from '../services/OnlineRanking';
import type { RankedRun } from '../services/RemoteRankingService';

/** Excalibur owns presentation/input only. Shared simulation owns every rule. */
export class GameScene extends ex.Scene {
  private simulation: GameSimulation | null = null;
  private recorder = new ReplayRecorder();
  private pending: InputAction[] = [];
  private accumulator = 0;
  private boardActor!: BoardActor;
  private sidePanel!: SidePanel;
  private backgroundSetColor: (c: string) => void = () => {};
  private touchInput: TouchInput | null = null;
  private popstateHandler: (() => void) | null = null;
  private rankedRun: RankedRun | null = null;
  private rankedEligible = true;
  private localReason = 'Offline / local selected';
  private onlinePreparing = false;
  private onlineController: AbortController | null = null;
  private paused = false;
  private gameOver = false;
  private softRequested = false;
  private keyRepeatDelay = 140;
  private pauseOverlayActor!: ex.Actor;
  private mode: GameMode = 'softcore';
  private dvdActor: DVDActor | null = null;

  onInitialize(engine: ex.Engine): void {
    this.camera.pos = new ex.Vector(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    const bg = this.createBackgroundActor();
    bg.actor.z = -10;
    this.backgroundSetColor = bg.setColor;
    this.add(bg.actor);
    this.boardActor = new BoardActor();
    this.sidePanel = new SidePanel();
    this.add(this.boardActor);
    this.add(this.sidePanel);
    this.add(new SpaceInvaderActor(() => this.simulation));
    this.pauseOverlayActor = this.createPauseOverlay();
    this.pauseOverlayActor.graphics.visible = false;
    this.pauseOverlayActor.z = 100;
    this.add(this.pauseOverlayActor);
    this.add(new AudioControls());
    if (isMobile) {
      this.touchInput = new TouchInput(engine.canvas, engine, {
        moveLeft: () => this.queue(INPUT.left), moveRight: () => this.queue(INPUT.right),
        rotate: () => this.queue(INPUT.rotate), softDrop: () => this.queue(INPUT.softStep),
        hardDrop: () => this.queue(INPUT.hardDrop),
      });
    }
  }

  private createBackgroundActor(): { actor: ex.Actor; setColor: (c: string) => void } {
    let color = '#0d0d1a';
    const actor = new ex.Actor({ x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, anchor: ex.Vector.Zero });
    actor.graphics.use(new ex.Canvas({ cache: false, width: CANVAS_WIDTH, height: CANVAS_HEIGHT,
      draw: ctx => { ctx.fillStyle = color; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); },
    }));
    return { actor, setColor: c => { color = c; } };
  }

  onActivate(context: ex.SceneActivationContext<unknown>): void {
    this.paused = false;
    this.pauseOverlayActor.graphics.visible = false;
    this.mode = (context.data as { mode?: GameMode } | undefined)?.mode ?? 'softcore';
    this.touchInput?.enable();
    this.resetGame();
    if (this.mode === 'hardcore') {
      audio.playMusic('hardcore');
      this.dvdActor = new DVDActor();
      this.add(this.dvdActor);
    } else audio.playMusic('game');
    if (isMobile) {
      history.pushState({ sabo: 'game' }, '');
      this.popstateHandler = () => {
        history.pushState({ sabo: 'game' }, '');
        if (!this.gameOver && !this.onlinePreparing) this.setPaused(!this.paused);
      };
      window.addEventListener('popstate', this.popstateHandler);
    }
  }

  onDeactivate(): void {
    this.onlineController?.abort();
    this.onlineController = null;
    this.onlinePreparing = false;
    this.simulation = null;
    this.pending = [];
    this.touchInput?.disable();
    audio.stopMusic();
    if (this.popstateHandler) window.removeEventListener('popstate', this.popstateHandler);
    this.popstateHandler = null;
    this.dvdActor?.kill();
    this.dvdActor = null;
  }

  private resetGame(): void {
    this.onlineController?.abort();
    const controller = new AbortController();
    this.onlineController = controller;
    this.onlinePreparing = true;
    this.simulation = null;
    this.rankedRun = null;
    this.rankedEligible = true;
    this.localReason = 'Offline / local selected';
    this.recorder = new ReplayRecorder();
    this.pending = [];
    this.accumulator = 0;
    this.softRequested = false;
    this.keyRepeatDelay = 140;
    this.gameOver = false;
    this.touchInput?.setBlocked(true);
    // Seed and rules come from the server BEFORE any gameplay randomness.
    void prepareOnlineRun(this.mode, controller.signal).then(candidate => {
      if (this.onlineController !== controller || controller.signal.aborted) return;
      const run = candidate?.rulesVersion === RULES_VERSION ? candidate : null;
      const seed = run?.seed ?? [...crypto.getRandomValues(new Uint8Array(16))].map(v => v.toString(16).padStart(2, '0')).join('');
      this.rankedRun = run;
      this.simulation = new GameSimulation(seed, this.mode);
      this.onlinePreparing = false;
      this.touchInput?.setBlocked(this.paused);
      this.sidePanel.setChaosEffect(run ? 'GLOBAL VERIFIED' : 'LOCAL ONLY', 2500);
      this.updateDisplay();
    });
  }

  private queue(action: InputAction): void {
    if (this.onlinePreparing || this.paused || this.gameOver || !this.simulation) return;
    const index = this.pending.findIndex(a => actionGroup(a) === actionGroup(action));
    if (index >= 0) this.pending[index] = action;
    else if (this.pending.length < MAX_EVENTS_PER_TICK) this.pending.push(action);
  }

  onPreUpdate(engine: ex.Engine, delta: number): void {
    if (this.gameOver || this.onlinePreparing || !this.simulation) return;
    const kb = engine.input.keyboard;
    if (kb.wasPressed(ex.Input.Keys.Escape) || kb.wasPressed(ex.Input.Keys.P)) this.setPaused(!this.paused);
    if (this.paused) return;
    this.handleInput(kb, delta);
    // Bound catch-up work. Background-tab lag slows active time, never accelerates it.
    this.accumulator += Math.min(delta, 250);
    while (this.accumulator >= TICK_MS && !this.simulation.gameOver) {
      const actions = this.pending;
      this.pending = [];
      this.recorder.record(this.simulation.ticks + 1, actions);
      this.simulation.step(actions);
      this.accumulator -= TICK_MS;
      const events = this.simulation.presentation;
      if (events.lineClear) audio.playSfx('lineClear');
      if (events.levelUp) audio.playSfx('levelUp');
      if (events.chaos) { this.sidePanel.setChaosEffect(events.chaos, 2000); audio.playSfx('chaos'); }
    }
    if (this.rankedEligible && !this.recorder.withinBudget) {
      this.rankedEligible = false;
      this.localReason = 'Ranked replay limit reached';
      this.sidePanel.setChaosEffect('REPLAY LIMIT: LOCAL ONLY', 5000);
    }
    this.updateDisplay();
    this.sidePanel.updateChaosTimer(delta);
    if (this.simulation.gameOver) this.endGame();
  }

  private handleInput(kb: ex.Input.Keyboard, delta: number): void {
    this.keyRepeatDelay -= delta;
    if (kb.wasPressed(ex.Input.Keys.Left) || (kb.isHeld(ex.Input.Keys.Left) && this.keyRepeatDelay <= 0)) {
      this.keyRepeatDelay = 140; this.queue(INPUT.left);
    } else if (kb.wasPressed(ex.Input.Keys.Right) || (kb.isHeld(ex.Input.Keys.Right) && this.keyRepeatDelay <= 0)) {
      this.keyRepeatDelay = 140; this.queue(INPUT.right);
    }
    if (kb.wasPressed(ex.Input.Keys.Up)) this.queue(INPUT.rotate);
    const soft = kb.isHeld(ex.Input.Keys.Down);
    if (soft !== this.softRequested) { this.queue(soft ? INPUT.softOn : INPUT.softOff); this.softRequested = soft; }
    if (kb.wasPressed(ex.Input.Keys.Space)) this.queue(INPUT.hardDrop);
    if (kb.wasPressed(ex.Input.Keys.M)) audio.toggleMute();
    if (admin.isEnabled() && (kb.wasPressed(ex.Input.Keys.BracketRight) || kb.wasPressed(ex.Input.Keys.BracketLeft))) {
      // No debug action exists in the replay protocol. Server cannot reproduce it.
      this.rankedEligible = false;
      this.localReason = 'Debug points used';
      this.simulation!.score += 1000;
      this.sidePanel.setChaosEffect('DEBUG: LOCAL ONLY', 2500);
    }
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.pauseOverlayActor.graphics.visible = paused;
    this.pending = [];
    this.accumulator = 0;
    this.softRequested = false;
    // A release queued just before pausing must not leave Down stuck on resume.
    if (!paused) this.queue(INPUT.softOff);
    this.touchInput?.setBlocked(paused || this.onlinePreparing);
    if (paused) audio.pauseMusic(); else audio.resumeMusic();
  }

  private createPauseOverlay(): ex.Actor {
    const overlay = new ex.Actor({ x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, anchor: ex.Vector.Zero });
    overlay.graphics.use(new ex.Canvas({ cache: true, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, draw: ctx => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#ddeeff'; ctx.font = '48px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 120);
      for (const [i, label] of ['CONTINUE', 'RESET', 'HOME'].entries()) {
        const y = CANVAS_HEIGHT / 2 - 50 + i * 70;
        ctx.fillStyle = '#1a2a3a'; ctx.fillRect(CANVAS_WIDTH / 2 - 110, y, 220, 50);
        ctx.strokeStyle = '#4a6a8a'; ctx.lineWidth = 2; ctx.strokeRect(CANVAS_WIDTH / 2 - 110, y, 220, 50);
        ctx.fillStyle = '#ddeeff'; ctx.font = '22px monospace'; ctx.fillText(label, CANVAS_WIDTH / 2, y + 27);
      }
    } }));
    overlay.on('pointerup', evt => {
      if (!this.paused) return;
      const { x, y } = evt.worldPos;
      if (x < CANVAS_WIDTH / 2 - 110 || x > CANVAS_WIDTH / 2 + 110) return;
      const top = CANVAS_HEIGHT / 2 - 50;
      for (let i = 0; i < 3; i++) {
        if (y < top + i * 70 || y > top + i * 70 + 50) continue;
        audio.playSfx('click');
        this.setPaused(false);
        if (i === 1) this.resetGame();
        if (i === 2) this.engine.goToScene('menu');
        return;
      }
    });
    overlay.pointer.useGraphicsBounds = true;
    return overlay;
  }

  private updateDisplay(): void {
    const s = this.simulation;
    if (!s) return;
    const levelScore = s.score - s.levelStartScore;
    const color = s.levels.getBackgroundColorForScore(levelScore);
    this.backgroundSetColor(color);
    this.boardActor.setBackgroundColor(color);
    this.boardActor.setGrid(s.grid);
    this.boardActor.setCurrentPiece(s.currentPiece);
    this.sidePanel.setNextPiece(s.nextPieceType);
    this.sidePanel.setNextPieceHidden(s.hiddenTimer > 0);
    this.sidePanel.setScore(levelScore);
    this.sidePanel.setLevel(s.levels.getLevel());
    this.sidePanel.setLines(s.lines - s.levelStartLines);
    this.sidePanel.setMaxScore(s.levels.getMaxScore());
  }

  private endGame(): void {
    const s = this.simulation;
    if (!s || this.gameOver) return;
    this.gameOver = true;
    audio.stopMusic(); audio.playSfx('gameOver');
    const replay = this.rankedEligible ? this.recorder.finish(s.ticks) : null;
    this.engine.goToScene('gameover', { sceneActivationData: {
      score: s.score, level: s.levels.getLevel(), mode: this.mode,
      rankedRun: replay ? this.rankedRun : null, replay,
      localReason: this.localReason,
    } });
  }
}
