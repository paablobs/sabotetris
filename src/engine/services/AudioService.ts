/**
 * AudioService — procedural 8-bit chiptune audio for Sabotetris.
 *
 * All sounds are generated in real time with the Web Audio API using
 * square / triangle / sawtooth oscillators with short attack/release
 * envelopes. No binary audio assets.
 *
 * The browser's autoplay policy blocks AudioContext until a user
 * gesture. The service registers a one-shot pointerdown/keydown
 * listener on the window to resume the context and start any music
 * that was requested before the unlock.
 */

type SfxId = 'click' | 'lineClear' | 'levelUp' | 'gameOver' | 'chaos';
type TrackId = 'menu' | 'game';

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

interface NoteEntry {
  freq: number;
  beats: number;
}

class AudioService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private activeVoices: Voice[] = [];
  private musicTimer: number | null = null;
  private currentTrack: TrackId | null = null;
  private trackStartTime = 0;
  private pausedAt = 0;
  private musicPaused = false;
  private pendingTrack: TrackId | null = null;
  private unlocked = false;

  private readonly masterVolume = 0.4;
  private readonly musicVolume = 0.28;
  private readonly sfxVolume = 0.55;

  playMusic(track: TrackId): void {
    if (this.currentTrack === track) return;
    this.stopMusic();
    this.currentTrack = track;
    this.musicPaused = false;
    this.pausedAt = 0;

    if (!this.ensureContext()) {
      this.pendingTrack = track;
      return;
    }
    this.startTrack(track);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    this.killActiveVoices();
    this.currentTrack = null;
    this.musicPaused = false;
    this.pausedAt = 0;
  }

  pauseMusic(): void {
    if (!this.currentTrack || this.musicPaused) return;
    if (!this.ctx) return;
    this.musicPaused = true;
    this.pausedAt = this.ctx.currentTime - this.trackStartTime;
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    this.killActiveVoices();
  }

  resumeMusic(): void {
    if (!this.currentTrack || !this.musicPaused) return;
    this.musicPaused = false;
    if (!this.ensureContext()) {
      this.pendingTrack = this.currentTrack;
      return;
    }
    const remaining = this.computeRemainingFromOffset(this.currentTrack, this.pausedAt);
    this.scheduleTrackFrom(this.currentTrack, remaining, this.pausedAt);
  }

  playSfx(id: SfxId): void {
    if (!this.ensureContext()) return;
    switch (id) {
      case 'click': this.sfxClick(); break;
      case 'lineClear': this.sfxLineClear(); break;
      case 'levelUp': this.sfxLevelUp(); break;
      case 'gameOver': this.sfxGameOver(); break;
      case 'chaos': this.sfxChaos(); break;
    }
  }

  setMasterVolume(v: number): void {
    if (this.masterGain) this.masterGain.gain.value = clamp01(v);
  }

  private ensureContext(): boolean {
    if (typeof window === 'undefined') return false;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.masterGain);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);

      document.addEventListener('visibilitychange', this.handleVisibility);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        this.unlocked = true;
        this.drainPendingTrack();
      }).catch(() => { /* user gesture will retry */ });
    } else {
      this.unlocked = true;
    }
    if (!this.unlocked) {
      this.installUnlockListener();
    }
    return true;
  }

  private installUnlockListener(): void {
    if (this.unlocked) return;
    const onGesture = () => {
      if (!this.ctx) return;
      this.ctx.resume().then(() => {
        this.unlocked = true;
        this.drainPendingTrack();
        window.removeEventListener('pointerdown', onGesture, true);
        window.removeEventListener('keydown', onGesture, true);
      }).catch(() => { /* ignore */ });
    };
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
  }

  private drainPendingTrack(): void {
    if (this.pendingTrack && this.currentTrack === this.pendingTrack) {
      const t = this.pendingTrack;
      this.pendingTrack = null;
      this.startTrack(t);
    } else if (this.pendingTrack && !this.currentTrack) {
      const t = this.pendingTrack;
      this.pendingTrack = null;
      this.playMusic(t);
    } else {
      this.pendingTrack = null;
    }
  }

  private startTrack(track: TrackId): void {
    if (!this.ctx) return;
    this.trackStartTime = this.ctx.currentTime;
    this.scheduleTrackFrom(track, 0, 0);
  }

  private scheduleTrackFrom(track: TrackId, fromSec: number, baseOffset: number): void {
    if (!this.ctx) return;
    const def = TRACKS[track];
    const beatSec = 60 / def.bpm;
    const leadNotes = def.lead;
    const bassNotes = def.bass;
    const totalBeats = leadNotes.reduce((sum, n) => sum + n.beats, 0);
    const totalSec = totalBeats * beatSec;

    const cursor = this.ctx.currentTime - fromSec;
    let beatCursor = -baseOffset;
    for (const note of leadNotes) {
      const start = cursor + beatCursor * beatSec;
      const dur = note.beats * beatSec;
      if (note.freq > 0 && dur > 0 && start + dur > this.ctx.currentTime) {
        this.scheduleLead(start, note.freq, Math.max(0.04, dur * 0.92));
      }
      beatCursor += note.beats;
    }

    let bassCursor = 0;
    for (const note of bassNotes) {
      const start = this.ctx.currentTime + bassCursor * beatSec - fromSec;
      const dur = note.beats * beatSec;
      if (note.freq > 0 && dur > 0 && start + dur > this.ctx.currentTime) {
        this.scheduleBass(start, note.freq, Math.max(0.05, dur * 0.88));
      }
      bassCursor += note.beats;
    }

    const remaining = Math.max(0.05, totalSec - fromSec);
    this.musicTimer = window.setTimeout(() => {
      if (!this.currentTrack || this.musicPaused) return;
      this.killActiveVoices();
      this.scheduleTrackFrom(track, 0, 0);
    }, remaining * 1000);
  }

  private computeRemainingFromOffset(track: TrackId, offsetSec: number): number {
    const def = TRACKS[track];
    const beatSec = 60 / def.bpm;
    const totalBeats = def.lead.reduce((s, n) => s + n.beats, 0);
    const totalSec = totalBeats * beatSec;
    return Math.max(0.05, totalSec - offsetSec);
  }

  private scheduleLead(startTime: number, freq: number, duration: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.7, startTime + 0.01);
    gain.gain.setValueAtTime(0.7, startTime + Math.max(0.01, duration - 0.04));
    gain.gain.linearRampToValueAtTime(0, startTime + duration);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
    this.registerVoice(osc, gain);
  }

  private scheduleBass(startTime: number, freq: number, duration: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.5, startTime + 0.02);
    gain.gain.setValueAtTime(0.5, startTime + Math.max(0.02, duration - 0.04));
    gain.gain.linearRampToValueAtTime(0, startTime + duration);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
    this.registerVoice(osc, gain);
  }

  private registerVoice(osc: OscillatorNode, gain: GainNode): void {
    const voice: Voice = { osc, gain };
    this.activeVoices.push(voice);
    const cleanup = () => {
      const i = this.activeVoices.indexOf(voice);
      if (i >= 0) this.activeVoices.splice(i, 1);
    };
    osc.onended = cleanup;
  }

  private killActiveVoices(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const v of this.activeVoices) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.linearRampToValueAtTime(0, now + 0.04);
        v.osc.stop(now + 0.05);
      } catch {
        // oscillator may already have stopped
      }
    }
    this.activeVoices = [];
  }

  private handleVisibility = (): void => {
    if (typeof document === 'undefined') return;
    if (!this.ctx) return;
    if (document.hidden) {
      if (this.currentTrack && !this.musicPaused) {
        this.pauseMusic();
        this.shouldResumeOnVisible = true;
      }
    } else if (this.shouldResumeOnVisible && this.currentTrack) {
      this.shouldResumeOnVisible = false;
      this.resumeMusic();
    }
  };

  private shouldResumeOnVisible = false;

  private sfxClick(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.tone(t, NOTE_FREQ.A5, 0.05, 0.5, 'square', 0.005, 0.02);
    this.tone(t + 0.04, NOTE_FREQ.F5, 0.05, 0.4, 'square', 0.005, 0.02);
  }

  private sfxLineClear(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const seq: Array<[number, number]> = [
      [NOTE_FREQ.C5, 0.04],
      [NOTE_FREQ.E5, 0.04],
      [NOTE_FREQ.G5, 0.04],
      [NOTE_FREQ.C6, 0.08],
    ];
    let cursor = t;
    for (const [freq, dur] of seq) {
      this.tone(cursor, freq, dur, 0.55, 'square', 0.005, 0.015);
      cursor += dur * 0.85;
    }
  }

  private sfxLevelUp(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const seq: Array<[number, number]> = [
      [NOTE_FREQ.C5, 0.06],
      [NOTE_FREQ.E5, 0.06],
      [NOTE_FREQ.G5, 0.06],
      [NOTE_FREQ.C6, 0.08],
      [NOTE_FREQ.E6, 0.18],
    ];
    let cursor = t;
    for (const [freq, dur] of seq) {
      this.tone(cursor, freq, dur, 0.6, 'square', 0.005, 0.03);
      cursor += dur * 0.8;
    }
  }

  private sfxGameOver(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const seq: Array<[number, number]> = [
      [NOTE_FREQ.G4, 0.14],
      [NOTE_FREQ.E4, 0.14],
      [NOTE_FREQ.C4, 0.14],
      [NOTE_FREQ.G3, 0.32],
    ];
    let cursor = t;
    for (const [freq, dur] of seq) {
      this.tone(cursor, freq, dur, 0.65, 'triangle', 0.01, 0.05);
      cursor += dur * 0.95;
    }
  }

  private sfxChaos(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    const baseFreq = NOTE_FREQ.E5;
    osc.frequency.setValueAtTime(baseFreq, t);
    const wobbleDepth = 80;
    for (let i = 0; i < 26; i++) {
      const ti = t + i * 0.01;
      const v = Math.sin(i * 0.4) * wobbleDepth;
      osc.frequency.setValueAtTime(baseFreq + v, ti);
      osc.frequency.linearRampToValueAtTime(baseFreq + Math.sin((i + 1) * 0.4) * wobbleDepth, ti + 0.01);
    }
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.55, t + 0.01);
    gain.gain.setValueAtTime(0.55, t + 0.18);
    gain.gain.linearRampToValueAtTime(0, t + 0.28);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.3);
    osc.onended = () => {
      try { osc.disconnect(); gain.disconnect(); } catch { /* ignore */ }
    };
  }

  private tone(
    startTime: number,
    freq: number,
    duration: number,
    peak: number,
    type: OscillatorType,
    attack: number,
    release: number
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const a = Math.max(0.001, attack);
    const r = Math.max(0.005, release);
    const sustain = Math.max(0.005, duration - a - r);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + a);
    gain.gain.setValueAtTime(peak, startTime + a + sustain);
    gain.gain.linearRampToValueAtTime(0, startTime + a + sustain + r);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(startTime);
    osc.stop(startTime + a + sustain + r + 0.01);
    osc.onended = () => {
      try { osc.disconnect(); gain.disconnect(); } catch { /* ignore */ }
    };
  }
}

const NOTE_FREQ: Record<string, number> = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.50, D6: 1174.66, E6: 1318.51, F6: 1396.91,
  REST: 0,
};

interface TrackDef {
  bpm: number;
  lead: NoteEntry[];
  bass: NoteEntry[];
}

function lead(...entries: Array<[string, number]>): NoteEntry[] {
  return entries.map(([name, beats]) => ({ freq: NOTE_FREQ[name] ?? 0, beats }));
}

function bass(...entries: Array<[string, number]>): NoteEntry[] {
  return entries.map(([name, beats]) => ({ freq: NOTE_FREQ[name] ?? 0, beats }));
}

const TRACKS: Record<TrackId, TrackDef> = {
  menu: {
    bpm: 100,
    lead: lead(
      ['E5', 0.5], ['B4', 0.25], ['C5', 0.25],
      ['D5', 0.5], ['C5', 0.25], ['B4', 0.25],
      ['A4', 0.5], ['A4', 0.5],
      ['D5', 0.5], ['F5', 0.25], ['A5', 0.25],
      ['G5', 0.5], ['F5', 0.5], ['E5', 0.5], ['C5', 0.5],
      ['C5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 0.5],
      ['B4', 0.5], ['B4', 0.5], ['C5', 0.5], ['D5', 0.5],
      ['E5', 0.5], ['C5', 0.5], ['A4', 0.5], ['A4', 0.5],
      ['D5', 0.5], ['F5', 0.25], ['A5', 0.25],
      ['C6', 0.5], ['B5', 0.5], ['A5', 0.5], ['G5', 0.5],
      ['F5', 0.5], ['E5', 0.5], ['C5', 0.5], ['D5', 0.5],
      ['A4', 0.5], ['B4', 0.5], ['G4', 0.5], ['A4', 0.5],
      ['D4', 0.5], ['E4', 0.5], ['A4', 0.5], ['C5', 0.5],
      ['D5', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5],
      ['B4', 0.5], ['C5', 0.5], ['D5', 0.5], ['E5', 0.5],
      ['C5', 0.5], ['A4', 0.5], ['A4', 1.0], ['REST', 1.0]
    ),
    bass: bass(
      ['A3', 4], ['A3', 4], ['F3', 4], ['C4', 4],
      ['C4', 4], ['G3', 4], ['A3', 4], ['A3', 4],
      ['D4', 4], ['A3', 4], ['A3', 4], ['A3', 4],
      ['D4', 4], ['A3', 4], ['A3', 4], ['A3', 4]
    ),
  },
  game: {
    bpm: 144,
    lead: lead(
      ['E5', 0.5], ['B4', 0.25], ['C5', 0.25],
      ['D5', 0.5], ['C5', 0.25], ['B4', 0.25],
      ['A4', 0.5], ['A4', 0.5],
      ['D5', 0.5], ['F5', 0.25], ['A5', 0.25],
      ['G5', 0.5], ['F5', 0.5], ['E5', 0.5], ['C5', 0.5],
      ['C5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 0.5],
      ['B4', 0.5], ['B4', 0.5], ['C5', 0.5], ['D5', 0.5],
      ['E5', 0.5], ['C5', 0.5], ['A4', 0.5], ['A4', 0.5],
      ['D5', 0.5], ['F5', 0.25], ['A5', 0.25],
      ['C6', 0.5], ['B5', 0.5], ['A5', 0.5], ['G5', 0.5],
      ['F5', 0.5], ['E5', 0.5], ['C5', 0.5], ['D5', 0.5],
      ['A4', 0.5], ['B4', 0.5], ['G4', 0.5], ['A4', 0.5],
      ['D4', 0.5], ['E4', 0.5], ['A4', 0.5], ['C5', 0.5],
      ['D5', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5],
      ['B4', 0.5], ['C5', 0.5], ['D5', 0.5], ['E5', 0.5],
      ['C5', 0.5], ['A4', 0.5], ['A4', 1.0], ['REST', 1.0]
    ),
    bass: bass(
      ['A2', 1], ['A2', 1], ['E3', 1], ['A2', 1],
      ['D3', 1], ['A2', 1], ['C3', 1], ['G2', 1],
      ['C3', 1], ['G2', 1], ['A2', 1], ['E3', 1],
      ['A2', 1], ['E3', 1], ['G2', 1], ['D3', 1],
      ['D3', 1], ['A2', 1], ['E3', 1], ['A2', 1],
      ['F3', 1], ['C3', 1], ['A2', 1], ['D3', 1],
      ['D3', 1], ['A2', 1], ['C3', 1], ['G2', 1],
      ['C3', 1], ['G2', 1], ['A2', 1], ['E3', 1],
      ['A2', 1], ['A2', 1], ['A2', 1], ['A2', 1],
      ['D3', 1], ['A2', 1], ['A2', 1], ['A2', 1],
      ['D3', 1], ['A2', 1], ['D3', 1], ['A2', 1],
      ['E3', 1], ['A2', 1], ['A2', 1], ['E3', 1],
      ['A2', 1], ['E3', 1], ['A2', 1], ['A2', 1],
      ['C3', 1], ['G2', 1], ['A2', 1], ['E3', 1],
      ['A2', 2], ['REST', 2]
    ),
  },
};

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export const audio = new AudioService();
