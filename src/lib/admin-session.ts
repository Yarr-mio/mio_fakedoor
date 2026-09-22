// Node-only cryptography. Never import into a client component.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_SECONDS = 60 * 60 * 4;
export const ADMIN_COOKIE = 'mio_admin_session';
export type AdminConfig = { accessKey: string; sessionSecret: string };
export function adminConfig(): AdminConfig | null {
  const accessKey = process.env.MIO_ADMIN_ACCESS_KEY ?? '';
  const sessionSecret = process.env.MIO_ADMIN_SESSION_SECRET ?? '';
  return accessKey.length >= 32 && sessionSecret.length >= 32 && accessKey !== sessionSecret ? { accessKey, sessionSecret } : null;
}
function digest(value: string) { return createHash('sha256').update(value).digest(); }
export function validAccessKey(candidate: string, config: AdminConfig) {
  return candidate.length <= 256 && timingSafeEqual(digest(candidate), digest(config.accessKey));
}
function signature(payload: string, config: AdminConfig) {
  // Rotating either secret invalidates all existing sessions.
  return createHmac('sha256', config.sessionSecret).update(payload).update(digest(config.accessKey)).digest('base64url');
}
export function createAdminSession(config: AdminConfig, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + SESSION_SECONDS, nonce: randomBytes(24).toString('base64url') })).toString('base64url');
  return `${payload}.${signature(payload, config)}`;
}
export function validAdminSession(token: string | undefined, config: AdminConfig | null, now = Date.now()) {
  if (!config || !token || token.length > 512) return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[\w-]+$/.test(parts[0])) return false;
  if (!timingSafeEqual(digest(parts[1]), digest(signature(parts[0], config)))) return false;
  try {
    const { exp, nonce } = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const current = Math.floor(now / 1000);
    return Number.isInteger(exp) && exp > current && exp <= current + SESSION_SECONDS && typeof nonce === 'string' && nonce.length === 32;
  } catch { return false; }
}
export function sameOrigin(request: Request) {
  const expected = process.env.MIO_ADMIN_ORIGIN || new URL(request.url).origin;
  return request.headers.get('origin') === expected;
}

// Single-process guard. Hosting must also apply shared rate limiting for replicas.
const attempts: number[] = [];
export function allowLogin(now = Date.now()) {
  while (attempts.length && attempts[0] <= now - 15 * 60 * 1000) attempts.shift();
  if (attempts.length >= 10) return false;
  attempts.push(now);
  return true;
}
