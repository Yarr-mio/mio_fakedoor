export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'CONSENT_REQUIRED',
  'SENSITIVE_CONSENT_REQUIRED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'ORIGIN_MISMATCH',
  'NOT_FOUND',
  'CONFLICT',
  'CONVERSATION_MESSAGE_IN_PROGRESS',
  'GONE',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'BUSINESS_RULE_VIOLATION',
  'LOCKED_BY_SAFETY',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'UPSTREAM_BAD_GATEWAY',
  'UPSTREAM_UNAVAILABLE',
  'ADMIN_AUTH_NOT_CONFIGURED',
  'LIVE_MODE_DISABLED',
  'LIVE_BUDGET_EXHAUSTED',
  'UPSTREAM_TIMEOUT',
] as const;

export type KnownApiErrorCode = (typeof API_ERROR_CODES)[number];
export type ApiErrorCode = KnownApiErrorCode | 'UNKNOWN';
export type DeferredApiErrorCode = 'LOCKED_BY_SAFETY';

export type RateLimitInfo = {
  limit: number | null;
  remaining: number | null;
  reset: number | null;
};

export function isKnownApiErrorCode(value: unknown): value is KnownApiErrorCode {
  return typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value);
}

export function isDeferredErrorCode(code: string): code is DeferredApiErrorCode {
  // 예약 에러코드
  return code === 'LOCKED_BY_SAFETY';
}

export function parseApiErrorCode(value: unknown): ApiErrorCode {
  return isKnownApiErrorCode(value) ? value : 'UNKNOWN';
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details: unknown;
  readonly traceId: string | null;
  readonly httpStatus: number | null;
  readonly rateLimit: RateLimitInfo | null;
  readonly retryAfterSeconds: number | null;
  readonly deferred: boolean;
  readonly rawCode: string | null;

  constructor(init: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    traceId?: string | null;
    httpStatus?: number | null;
    rateLimit?: RateLimitInfo | null;
    retryAfterSeconds?: number | null;
    rawCode?: string | null;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.details = init.details ?? null;
    this.traceId = init.traceId ?? null;
    this.httpStatus = init.httpStatus ?? null;
    this.rateLimit = init.rateLimit ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
    this.rawCode = init.rawCode ?? (init.code === 'UNKNOWN' ? null : init.code);
    this.deferred = isDeferredErrorCode(init.code);
  }
}

export class ApiTransportError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super('네트워크 오류');
    this.name = 'ApiTransportError';
    this.cause = cause;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function isUnauthorizedError(error: ApiError): boolean {
  return error.code === 'UNAUTHORIZED';
}

export type ClassifiedApiError =
  | { code: 'VALIDATION_ERROR'; details: unknown }
  | { code: 'ORIGIN_MISMATCH'; details: unknown }
  | { code: 'RATE_LIMITED'; rateLimit: RateLimitInfo | null; details: unknown }
  | { code: 'CONSENT_REQUIRED'; details: unknown }
  | { code: 'SENSITIVE_CONSENT_REQUIRED'; details: unknown }
  | { code: 'CONFLICT'; details: unknown }
  | { code: 'UNAUTHORIZED'; details: unknown }
  | { code: 'NOT_FOUND'; details: unknown }
  | { code: 'PAYLOAD_TOO_LARGE'; details: unknown }
  | { code: 'UNSUPPORTED_MEDIA_TYPE'; details: unknown }
  | { code: 'LIVE_MODE_DISABLED'; details: unknown }
  | { code: 'LIVE_BUDGET_EXHAUSTED'; details: unknown }
  | { code: 'CONVERSATION_MESSAGE_IN_PROGRESS'; details: unknown }
  | { code: 'GONE'; details: unknown }
  | { code: 'LOCKED_BY_SAFETY'; deferred: true; details: unknown }
  | { code: Exclude<ApiErrorCode, HandledApiErrorCode>; details: unknown };

type HandledApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'ORIGIN_MISMATCH'
  | 'RATE_LIMITED'
  | 'CONSENT_REQUIRED'
  | 'SENSITIVE_CONSENT_REQUIRED'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'LIVE_MODE_DISABLED'
  | 'LIVE_BUDGET_EXHAUSTED'
  | 'CONVERSATION_MESSAGE_IN_PROGRESS'
  | 'GONE'
  | 'LOCKED_BY_SAFETY';

export function classifyApiError(error: ApiError): ClassifiedApiError {
  // 에러코드 기준 분기
  switch (error.code) {
    case 'VALIDATION_ERROR':
    case 'ORIGIN_MISMATCH':
    case 'CONSENT_REQUIRED':
    case 'SENSITIVE_CONSENT_REQUIRED':
    case 'CONFLICT':
    case 'UNAUTHORIZED':
    case 'NOT_FOUND':
    case 'PAYLOAD_TOO_LARGE':
    case 'UNSUPPORTED_MEDIA_TYPE':
    case 'LIVE_MODE_DISABLED':
    case 'LIVE_BUDGET_EXHAUSTED':
    case 'CONVERSATION_MESSAGE_IN_PROGRESS':
    case 'GONE':
      return { code: error.code, details: error.details };
    case 'RATE_LIMITED':
      return { code: 'RATE_LIMITED', rateLimit: error.rateLimit, details: error.details };
    case 'LOCKED_BY_SAFETY':
      return { code: 'LOCKED_BY_SAFETY', deferred: true, details: error.details };
    default:
      return { code: error.code, details: error.details };
  }
}
