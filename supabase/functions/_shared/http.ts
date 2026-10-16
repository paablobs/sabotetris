import { MAX_REPLAY_BYTES, validReplay } from './game/protocol.ts';
import type { Replay } from './game/protocol.ts';
import { submissionDigest, verifyReplay } from './game/verify.ts';

export type Action = 'start' | 'submit' | 'read';
export interface Dependencies {
  allowedOrigins: string[];
  ipSalt: string;
  userId: (token: string) => Promise<string | null>;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERRORS = new Set(['rate_limited', 'invalid_mode', 'invalid_user', 'invalid_score', 'run_not_found',
  'mode_mismatch', 'run_expired', 'run_already_submitted', 'rules_mismatch', 'invalid_replay',
  'replay_too_fast', 'replay_not_finished', 'replay_after_game_over']);
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function validSubmission(value: Record<string, unknown>): boolean {
  return Object.keys(value).every(key => ['runId', 'playerName', 'mode', 'replay'].includes(key)) &&
    typeof value.runId === 'string' && UUID.test(value.runId) &&
    typeof value.playerName === 'string' && value.playerName === value.playerName.trim() &&
    /^[-a-zA-Z0-9 .,]{1,10}$/.test(value.playerName) &&
    (value.mode === 'softcore' || value.mode === 'hardcore') && validReplay(value.replay);
}

async function ipBucket(request: Request, salt: string): Promise<string> {
  // Supplementary only: verify gateway header sanitization in production.
  const ip = (request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown').slice(0, 128);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createHandler(action: Action, deps: Dependencies): (request: Request) => Promise<Response> {
  return async request => {
    const origin = request.headers.get('origin') ?? '';
    const headers = new Headers({ 'Content-Type': 'application/json', 'Vary': 'Origin', 'Cache-Control': 'no-store' });
    const reply = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers });
    const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers });
    if (!deps.allowedOrigins.includes(origin)) return reply(403, 'origin_not_allowed');
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, 'method_not_allowed');
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, 'json_required');
    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (action !== 'read' && !token) return reply(401, 'unauthorized');
    try {
      const userId = action === 'read' ? null : await deps.userId(token!);
      if (action !== 'read' && !userId) return reply(401, 'unauthorized');
      const ip = await ipBucket(request, deps.ipSalt);
      const rpc = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
        const { data, error } = await deps.rpc(name, args);
        if (error) throw new Error(ERRORS.has(error.message) ? error.message : 'service_unavailable');
        if (object(data) && typeof data.error === 'string') throw new Error(ERRORS.has(data.error) ? data.error : 'service_unavailable');
        return data;
      };
      // Its own committed RPC transaction. Later HTTP/SQL/replay failures cannot
      // roll back these counters. Denied attempts also commit saturated counts.
      const attempt = await rpc('ranking_attempt', { p_user: userId, p_action: action, p_ip_bucket: ip });
      if (!object(attempt) || attempt.allowed !== true) return reply(503, 'service_unavailable');
      const reader = request.body?.getReader();
      if (!reader) return reply(400, 'invalid_body');
      const chunks: Uint8Array[] = [];
      let length = 0;
      const limit = action === 'submit' ? MAX_REPLAY_BYTES : 2048;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) { await reader.cancel(); return reply(413, 'body_too_large'); }
        chunks.push(value);
      }
      const buffer = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
      let body: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(new TextDecoder().decode(buffer));
        if (!object(parsed)) return reply(400, 'invalid_body');
        body = parsed;
      } catch { return reply(400, 'invalid_body'); }
      if (action !== 'submit') {
        if (!['softcore', 'hardcore'].includes(String(body.mode))) return reply(400, 'invalid_mode');
        return ok(await rpc(action === 'start' ? 'start_ranked_run' : 'get_leaderboard', action === 'start'
          ? { p_user: userId, p_mode: body.mode, p_ip_bucket: ip } : { p_mode: body.mode }));
      }
      if (!validSubmission(body)) return reply(400, 'invalid_replay');
      const replay = body.replay as Replay;
      const digest = await submissionDigest(body.playerName as string, replay);
      const run = await rpc('inspect_ranked_run', { p_user: userId, p_run: body.runId, p_name: body.playerName, p_digest: digest });
      if (!object(run)) return reply(503, 'service_unavailable');
      if (run.mode !== body.mode) return reply(400, 'mode_mismatch');
      if (object(run.receipt) && run.receipt.accepted === true && typeof run.receipt.inTop === 'boolean') return ok(run.receipt);
      if (typeof run.seed !== 'string' || !/^[a-f0-9]{32}$/.test(run.seed) || typeof run.rulesVersion !== 'string' ||
          typeof run.elapsedMs !== 'number') return reply(503, 'service_unavailable');
      const result = verifyReplay({ seed: run.seed, mode: body.mode as 'softcore' | 'hardcore',
        rulesVersion: run.rulesVersion, elapsedMs: run.elapsedMs }, replay);
      return ok(await rpc('finalize_verified_run', { p_user: userId, p_run: body.runId, p_name: body.playerName,
        p_score: result.score, p_level: result.level, p_mode: run.mode, p_rules: run.rulesVersion,
        p_digest: digest, p_ticks: result.ticks, p_events: replay.events.length }));
    } catch (error) {
      // Never return/log raw SQL, aliases, IPs, credentials or bearer tokens.
      const message = error instanceof Error && ERRORS.has(error.message) ? error.message : 'service_unavailable';
      return reply(message === 'rate_limited' ? 429 : message === 'service_unavailable' ? 503 : 400, message);
    }
  };
}
