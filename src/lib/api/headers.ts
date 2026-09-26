export const SSE_ACCEPT = 'text/event-stream';

export type ApiHeaderOptions = {
  idempotencyKey?: string;
  accept?: string;
  authorization?: string;
};

export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

function readBrowserOrigin(): string | null {
  if (typeof location === 'undefined') return null;
  return typeof location.origin === 'string' && location.origin.length > 0 ? location.origin : null;
}

export function buildApiHeaders(options: ApiHeaderOptions = {}): Headers {
  // 공통 요청 헤더
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  const origin = readBrowserOrigin();
  if (origin) headers.set('Origin', origin);
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  if (options.accept) headers.set('Accept', options.accept);
  if (options.authorization) headers.set('Authorization', options.authorization);
  return headers;
}
