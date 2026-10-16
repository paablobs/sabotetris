import { createClient } from '@supabase/supabase-js';
import { requireFreshPointerActivation } from '../../utils/pointerActivation';
import type { ScoreEntry } from '../../types';
import { RemoteRankingService } from './RemoteRankingService';
import type { RankedRun, RankingBackend, RankingMode, Receipt } from './RemoteRankingService';
import { RULES_VERSION } from '../../../supabase/functions/_shared/game/protocol.ts';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();

function makeBackend(): RankingBackend | null {
  if (!url || !key || !siteKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) return null;
    const client = createClient(url, key, {
      auth: { detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, {
        ...init,
        signal: AbortSignal.any([
          AbortSignal.timeout(8_000),
          ...(init?.signal ? [init.signal] : input instanceof Request ? [input.signal] : []),
        ]),
      }) },
    });
    const invoke = async (name: string, body: Record<string, unknown>): Promise<unknown> => {
      const { data, error } = await client.functions.invoke(name, { body });
      if (error) throw new Error('Online publication unavailable');
      return data;
    };
    return {
      hasSession: async () => {
        const { data: session } = await client.auth.getSession();
        if (!session.session) return false;
        const { data, error } = await client.auth.getUser();
        if (error || !data.user?.is_anonymous) {
          await client.auth.signOut({ scope: 'local' });
          return false;
        }
        return true;
      },
      signIn: async captchaToken => {
        const { error } = await client.auth.signInAnonymously({ options: { captchaToken } });
        if (error) throw new Error('Guest sign-in unavailable');
      },
      start: async mode => {
        const data = await invoke('start-run', { mode }) as Partial<RankedRun> | null;
        if (!data || typeof data.id !== 'string' || data.mode !== mode || typeof data.expiresAt !== 'string' ||
            typeof data.seed !== 'string' || !/^[a-f0-9]{32}$/.test(data.seed) || data.rulesVersion !== RULES_VERSION) throw new Error('Invalid run');
        return data as RankedRun;
      },
      submit: async (run, result) => {
        const data = await invoke('submit-score', { runId: run.id, ...result }) as Partial<Receipt> | null;
        if (!data || data.accepted !== true || typeof data.inTop !== 'boolean') throw new Error('Invalid receipt');
        return data as Receipt;
      },
      read: async mode => {
        const data = await invoke('leaderboard', { mode });
        if (!Array.isArray(data)) throw new Error('Ranking unavailable');
        return data.slice(0, 20).map((row: Record<string, unknown>): ScoreEntry => {
          if (typeof row.player_name !== 'string' || !/^[-a-zA-Z0-9 .,]{1,10}$/.test(row.player_name) ||
              typeof row.score !== 'number' || !Number.isSafeInteger(row.score) || row.score < 0 ||
              typeof row.level !== 'number' || !Number.isInteger(row.level) || row.mode !== mode ||
              (mode === 'hardcore' ? row.level !== 11 : row.level < 1 || row.level > 10) ||
              typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) throw new Error('Invalid ranking');
          return { playerName: row.player_name, score: row.score, level: row.level, mode, date: row.created_at.slice(0, 10) };
        });
      },
    };
  } catch { return null; }
}

export const onlineRanking = new RemoteRankingService(makeBackend());

type Turnstile = {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
};
declare global { interface Window { turnstile?: Turnstile } }
let scriptPromise: Promise<Turnstile> | undefined;
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise<Turnstile>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('CAPTCHA unavailable'));
      script.onerror = () => { script.remove(); reject(new Error('CAPTCHA unavailable')); };
      document.head.append(script);
    }).catch(error => { scriptPromise = undefined; throw error; });
  }
  return scriptPromise;
}

async function captcha(host: HTMLElement, signal: AbortSignal): Promise<string> {
  const turnstile = await loadTurnstile();
  if (signal.aborted) return '';
  return new Promise(resolve => {
    const widget: { id?: string } = {};
    let done = false;
    const finish = (token: string) => {
      if (done) return;
      done = true;
      signal.removeEventListener('abort', cancel);
      if (widget.id !== undefined) turnstile.remove(widget.id);
      resolve(token);
    };
    const cancel = () => finish('');
    signal.addEventListener('abort', cancel, { once: true });
    widget.id = turnstile.render(host, {
      sitekey: siteKey, theme: 'dark', callback: (token: string) => finish(token),
      'error-callback': cancel, 'expired-callback': cancel,
    });
    if (done) turnstile.remove(widget.id);
  });
}

/** Finite, cancellable setup before gameplay. No background publication of local games. */
export function prepareOnlineRun(mode: RankingMode, externalSignal: AbortSignal): Promise<RankedRun | null> {
  if (!onlineRanking.configured || externalSignal.aborted) return Promise.resolve(null);
  const controller = new AbortController();
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Prepare global ranking');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#111d;display:flex;align-items:center;justify-content:center;color:#ddeeff;font:14px monospace';
  const panel = document.createElement('div');
  panel.style.cssText = 'background:#1a1a2e;padding:20px;max-width:340px;text-align:center;border:1px solid #4a6a8a';
  const title = document.createElement('p');
  title.textContent = 'Preparing global ranking…';
  const privacy = document.createElement('p');
  privacy.textContent = 'Your alias and result will be public if you save.';
  privacy.style.fontSize = '12px';
  const host = document.createElement('div');
  const local = document.createElement('button');
  local.textContent = 'PLAY LOCAL / SKIP';
  local.style.cssText = 'padding:12px;margin-top:16px;font:14px monospace;cursor:pointer';
  panel.append(title, privacy, host, local);
  overlay.append(panel);
  document.body.append(overlay);
  local.focus();
  return new Promise(resolve => {
    let done = false;
    const finish = (run: RankedRun | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      externalSignal.removeEventListener('abort', cancel);
      document.removeEventListener('keydown', onKey, true);
      controller.abort();
      overlay.remove();
      resolve(run);
    };
    const cancel = () => finish(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
    };
    const timer = setTimeout(cancel, 30_000);
    externalSignal.addEventListener('abort', cancel, { once: true });
    document.addEventListener('keydown', onKey, true);
    requireFreshPointerActivation(local, cancel);
    void onlineRanking.beginRun(mode, () => captcha(host, controller.signal), controller.signal).then(finish);
  });
}
