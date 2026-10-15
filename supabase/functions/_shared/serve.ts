import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { createHandler } from './http.ts';
import type { Action } from './http.ts';

export function serveRanking(action: Action): void {
  const url = Deno.env.get('SUPABASE_URL');
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const origins = Deno.env.get('ALLOWED_ORIGINS')?.split(',').map(value => value.trim()).filter(Boolean);
  const salt = Deno.env.get('RATE_LIMIT_SALT');
  if (!url || !secret || !origins?.length || !salt || salt.length < 32) {
    // Fail closed instead of starting with permissive CORS or an empty HMAC key.
    Deno.serve(() => new Response('Service not configured', { status: 503 }));
    return;
  }
  const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  Deno.serve(createHandler(action, {
    allowedOrigins: origins,
    ipSalt: salt,
    userId: async token => {
      const { data, error } = await client.auth.getUser(token);
      return !error && data.user?.is_anonymous ? data.user.id : null;
    },
    rpc: async (name, args) => {
      const { data, error } = await client.rpc(name, args);
      return { data, error };
    },
  }));
}
