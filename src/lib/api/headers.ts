export const SSE_ACCEPT = 'text/event-stream';

export type ApiHeaderOptions = {
  idempotencyKey?: string;
  accept?: string;
  authorization?: string;
};

export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function buildApiHeaders(options: ApiHeaderOptions = {}): Headers {
  // 공통 요청 헤더
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  // 스크립트 Origin 지정 금지
  // 브라우저 문서 출처 자동 부착
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  if (options.accept) headers.set('Accept', options.accept);
  if (options.authorization) headers.set('Authorization', options.authorization);
  return headers;
}
