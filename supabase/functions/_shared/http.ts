export type Action = 'start' | 'submit';
export interface Dependencies {
  allowedOrigins: string[];
  ipSalt: string;
  userId: (token: string) => Promise<string | null>;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validSubmission(value: Record<string, unknown>): boolean {
  return typeof value.runId === 'string' && UUID.test(value.runId) &&
    typeof value.playerName === 'string' && value.playerName === value.playerName.trim() &&
    value.playerName.length >= 1 && value.playerName.length <= 10 && /^[-a-zA-Z0-9 .,]+$/.test(value.playerName) &&
    typeof value.score === 'number' && Number.isSafeInteger(value.score) && value.score >= 0 &&
    typeof value.level === 'number' && Number.isInteger(value.level) &&
    ((value.mode === 'softcore' && value.level >= 1 && value.level <= 10) ||
      (value.mode === 'hardcore' && value.level === 11));
}

async function ipBucket(request: Request, salt: string): Promise<string> {
  // Supplementary only: proxy topology/header sanitization must be checked after
  // deployment. User and global limits do not rely on this header being trusted.
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
    if (!deps.allowedOrigins.includes(origin)) return reply(403, 'origin_not_allowed');
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, 'method_not_allowed');
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, 'json_required');
    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return reply(401, 'unauthorized');
    try {
      // Read at most 2 KiB, even if Content-Length is absent or forged.
      const reader = request.body?.getReader();
      if (!reader) return reply(400, 'invalid_body');
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 2048) { await reader.cancel(); return reply(413, 'body_too_large'); }
        chunks.push(value);
      }
      const buffer = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
      let body: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(new TextDecoder().decode(buffer));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reply(400, 'invalid_body');
        body = parsed as Record<string, unknown>;
      } catch { return reply(400, 'invalid_body'); }
      if (action === 'start' ? (typeof body.mode !== 'string' || !['softcore', 'hardcore'].includes(body.mode)) : !validSubmission(body)) {
        return reply(400, 'invalid_score');
      }
      const userId = await deps.userId(token);
      if (!userId) return reply(401, 'unauthorized');
      const args = action === 'start'
        ? { p_user: userId, p_mode: body.mode, p_ip_bucket: await ipBucket(request, deps.ipSalt) }
        : { p_user: userId, p_run: body.runId, p_name: body.playerName, p_score: body.score, p_level: body.level, p_mode: body.mode };
      const { data, error } = await deps.rpc(action === 'start' ? 'start_ranked_run' : 'submit_ranked_run', args);
      if (error) {
        const known = ['rate_limited', 'invalid_mode', 'invalid_user', 'invalid_score', 'run_not_found', 'mode_mismatch', 'run_expired', 'run_already_submitted'];
        const message = known.find(value => error.message === value);
        if (!message) return reply(503, 'service_unavailable');
        return reply(message === 'rate_limited' ? 429 : 400, message);
      }
      return new Response(JSON.stringify(data), { status: 200, headers });
    } catch {
      // Do not return/log credentials, SQL details, aliases or bearer tokens.
      return reply(503, 'service_unavailable');
    }
  };
}
