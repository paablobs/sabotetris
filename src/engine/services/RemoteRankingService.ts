import type { ScoreEntry } from '../../types/index.ts';

export type RankingMode = 'softcore' | 'hardcore';
export interface RankedRun { id: string; mode: RankingMode; expiresAt: string }
export interface Submission { playerName: string; score: number; level: number; mode: RankingMode }
export interface Receipt { accepted: true; inTop: boolean }
export interface RankingBackend {
  hasSession(): Promise<boolean>;
  signIn(captchaToken: string): Promise<void>;
  start(mode: RankingMode): Promise<RankedRun>;
  submit(run: RankedRun, result: Submission): Promise<Receipt>;
  read(mode: RankingMode): Promise<ScoreEntry[]>;
}

/** Framework/env-free coordinator: a disabled backend never performs IO. */
export class RemoteRankingService {
  private cache = new Map<RankingMode, { entries: ScoreEntry[]; until: number }>();
  private pendingReads = new Map<RankingMode, Promise<ScoreEntry[]>>();
  private revision = 0;

  private backend: RankingBackend | null;
  private now: () => number;

  constructor(backend: RankingBackend | null, now: () => number = Date.now) {
    this.backend = backend;
    this.now = now;
  }

  get configured(): boolean { return this.backend !== null; }

  async beginRun(mode: RankingMode, captcha: () => Promise<string>, signal: AbortSignal): Promise<RankedRun | null> {
    if (!this.backend || signal.aborted) return null;
    try {
      if (!await this.backend.hasSession()) {
        if (signal.aborted) return null;
        const token = await captcha();
        if (signal.aborted || !token) return null;
        await this.backend.signIn(token);
      }
      if (signal.aborted) return null;
      const run = await this.backend.start(mode);
      return signal.aborted ? null : run;
    } catch { return null; }
  }

  async submit(run: RankedRun, result: Submission): Promise<Receipt> {
    if (!this.backend || run.mode !== result.mode) throw new Error('Invalid ranked run');
    const receipt = await this.backend.submit(run, result);
    this.revision++;
    this.cache.delete(result.mode);
    this.pendingReads.delete(result.mode);
    return receipt;
  }

  getRanking(mode: RankingMode): Promise<ScoreEntry[]> {
    if (!this.backend) return Promise.reject(new Error('Online ranking not configured'));
    const cached = this.cache.get(mode);
    if (cached && cached.until > this.now()) return Promise.resolve(cached.entries.map(entry => ({ ...entry })));
    const pending = this.pendingReads.get(mode);
    if (pending) return pending.then(entries => entries.map(entry => ({ ...entry })));
    const revision = this.revision;
    const request = this.backend.read(mode).then(entries => {
      const bounded = entries.filter(entry => entry.mode === mode).slice(0, 20);
      if (revision === this.revision) this.cache.set(mode, { entries: bounded, until: this.now() + 60_000 });
      return bounded;
    }).finally(() => {
      if (this.pendingReads.get(mode) === request) this.pendingReads.delete(mode);
    });
    this.pendingReads.set(mode, request);
    return request.then(entries => entries.map(entry => ({ ...entry })));
  }
}
