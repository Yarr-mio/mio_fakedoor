import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildApiHeaders, createIdempotencyKey, SSE_ACCEPT } from './headers';
import { apiRequest, apiRequestStream } from './client';
import { ApiError, ApiTransportError, classifyApiError, isUnauthorizedError } from './errors';
import {
  hasServerVisitor,
  isJudgeNotPassed,
  isJudgePassed,
  readRequiredDocuments,
  type JudgeNotPassed,
  type JudgePassed,
} from './types';
import { getVisit, startVisit } from './visit';

const API_DIR = join(process.cwd(), 'src/lib/api');

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

function sourceFiles(): string {
  return ['admin.ts', 'client.ts', 'config.ts', 'conversations.ts', 'errors.ts', 'events.ts', 'headers.ts', 'index.ts', 'sse.ts', 'types.ts', 'visit.ts']
    .map((file) => readFileSync(join(API_DIR, file), 'utf8'))
    .join('\n');
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.test');
  vi.stubGlobal('location', { origin: 'https://app.example.test', search: '?internal=1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('api headers', () => {
  it('sets json content type and optional idempotency key without a script origin', () => {
    const key = createIdempotencyKey();
    const headers = buildApiHeaders({ idempotencyKey: key });
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Origin')).toBeNull();
    expect(headers.get('Idempotency-Key')).toBe(key);
    expect(headers.get('X-Device-Id')).toBeNull();
    expect(headers.get('X-App-Version')).toBeNull();
    expect(headers.get('X-Platform')).toBeNull();
  });
});

describe('api request envelope', () => {
  it('parses success data meta and sends credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: { ok: true },
      meta: { traceId: '01TRACE' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await apiRequest<{ ok: boolean }>({ method: 'GET', path: '/v1/visit' });
    expect(result).toEqual({ success: true, data: { ok: true }, meta: { traceId: '01TRACE' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/v1/visit');
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('GET');
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Origin')).toBeNull();
    expect(headers.has('Idempotency-Key')).toBe(false);
  });

  it('strips client authored mode internal fields from the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: {},
      meta: { traceId: '01TRACE' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest({
      method: 'POST',
      path: '/v1/visit',
      body: { journeyId: 'abc', mode: 'live', internal: true, isInternal: true },
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ journeyId: 'abc' });
  });

  it('wraps network failures without an error code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(apiRequest({ method: 'GET', path: '/v1/visit' })).rejects.toBeInstanceOf(ApiTransportError);
  });
});

describe('api error handler', () => {
  it('branches on error code not http status', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        error: { code: 'VALIDATION_ERROR', message: 'invalid', details: { field: 'journeyId' }, traceId: 't1' },
      }, { status: 400 }))
      .mockResolvedValueOnce(jsonResponse({
        error: { code: 'CONSENT_REQUIRED', message: 'consent', details: { requiredDocuments: ['age'] }, traceId: 't2' },
      }, { status: 400 }))
      .mockResolvedValueOnce(jsonResponse({
        error: { code: 'LIVE_BUDGET_EXHAUSTED', message: 'budget', traceId: 't3' },
      }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({
        error: { code: 'LOCKED_BY_SAFETY', message: 'reserved', traceId: 't4' },
      }, { status: 423 }));
    vi.stubGlobal('fetch', fetchMock);

    const validation = await apiRequest({ method: 'POST', path: '/v1/visit', body: {} }).catch((error) => error);
    const consent = await apiRequest({ method: 'POST', path: '/v1/visit', body: {} }).catch((error) => error);
    const budget = await apiRequest({ method: 'POST', path: '/v1/visit', body: {} }).catch((error) => error);
    const locked = await apiRequest({ method: 'POST', path: '/v1/visit', body: {} }).catch((error) => error);

    expect(validation).toBeInstanceOf(ApiError);
    expect(consent).toBeInstanceOf(ApiError);
    expect(validation.httpStatus).toBe(consent.httpStatus);
    expect(classifyApiError(validation).code).toBe('VALIDATION_ERROR');
    expect(classifyApiError(consent).code).toBe('CONSENT_REQUIRED');
    expect(classifyApiError(budget).code).toBe('LIVE_BUDGET_EXHAUSTED');
    expect(classifyApiError(locked)).toEqual({ code: 'LOCKED_BY_SAFETY', deferred: true, details: null });
    expect(locked.deferred).toBe(true);
    expect(isUnauthorizedError(validation)).toBe(false);
  });

  it('reads rate limit headers for RATE_LIMITED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      error: { code: 'RATE_LIMITED', message: 'slow down', traceId: 't5' },
    }, {
      status: 429,
      headers: {
        'X-RateLimit-Limit': '120',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '30',
      },
    })));
    const error = await apiRequest({ method: 'GET', path: '/v1/visit' }).catch((value) => value);
    expect(classifyApiError(error)).toMatchObject({
      code: 'RATE_LIMITED',
      rateLimit: { limit: 120, remaining: 0, reset: 30 },
    });
  });
});

describe('visitor cookie contract', () => {
  it('does not read or parse the visitor cookie', async () => {
    const source = sourceFiles();
    expect(source).not.toContain('document.cookie');
    expect(source).not.toContain('mio_fd_visitor');
    const cookie = vi.fn(() => 'mio_fd_visitor=forbidden');
    vi.stubGlobal('document', { get cookie() { return cookie(); } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: {
        visitorId: null,
        mode: 'scripted_demo',
        isInternal: false,
        liveModeAvailable: false,
        consentGranted: [],
        consentRequired: ['age'],
        activeConversationId: null,
      },
      meta: { traceId: '01VISITOR' },
    })));
    const result = await getVisit();
    expect(cookie).not.toHaveBeenCalled();
    expect(hasServerVisitor(result.data.visitorId)).toBe(false);
  });
});

describe('server assigned mode and internal', () => {
  it('uses only response fields and ignores local query state', async () => {
    const source = sourceFiles();
    expect(source).not.toContain('location.search');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: {
        visitorId: 'c71e0a44-1111-4111-8111-c71e0a441111',
        journeyId: '9f1c3b2a-1111-4111-8111-9f1c3b2a1111',
        mode: 'scripted_demo',
        isInternal: false,
        liveModeAvailable: false,
        consentRequired: ['age', 'terms', 'personal', 'sensitive'],
        policyVersion: 'mio-dialogue-1.0',
      },
      meta: { traceId: '01VISIT' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await startVisit({
      journeyId: '9f1c3b2a-1111-4111-8111-9f1c3b2a1111',
      channel: { utm_source: 'community', utm_medium: 'post', extra: 'drop' } as never,
    });
    expect(result.data.mode).toBe('scripted_demo');
    expect(result.data.isInternal).toBe(false);
    expect(result.data.visitorId).toBe('c71e0a44-1111-4111-8111-c71e0a441111');
    expect(hasServerVisitor(result.data.visitorId)).toBe(true);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      journeyId: '9f1c3b2a-1111-4111-8111-9f1c3b2a1111',
      channel: { utm_source: 'community', utm_medium: 'post' },
    });
  });
});

describe('judge status types', () => {
  it('does not treat skipped as passed', () => {
    expect(isJudgePassed({ judgeStatus: 'ok' })).toBe(true);
    expect(isJudgePassed({ judgeStatus: 'skipped' })).toBe(false);
    expect(isJudgeNotPassed({ judgeStatus: 'skipped' })).toBe(true);
    expect(isJudgePassed({ judgeStatus: 'error' })).toBe(false);
    expectTypeOf<JudgePassed>().not.toMatchTypeOf<JudgeNotPassed>();
    expectTypeOf<JudgeNotPassed>().not.toMatchTypeOf<JudgePassed>();
    expectTypeOf(isJudgePassed).guards.toEqualTypeOf<JudgePassed>();
  });
});

describe('api spec fixtures', () => {
  it('parses the visit start success envelope field for field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: {
        visitorId: null,
        journeyId: '9f1c3b2a-1111-4111-8111-9f1c3b2a1111',
        mode: 'scripted_demo',
        isInternal: false,
        liveModeAvailable: false,
        consentRequired: ['age', 'terms', 'personal', 'sensitive'],
        policyVersion: 'mio-dialogue-1.0',
      },
      meta: { traceId: '01HVZXXX' },
    })));
    const result = await startVisit({
      journeyId: '9f1c3b2a-1111-4111-8111-9f1c3b2a1111',
      channel: {
        utm_source: 'community',
        utm_medium: 'post',
        utm_campaign: 'need_flow_v52',
      },
    });
    expect(result).toEqual({
      success: true,
      data: {
        visitorId: null,
        journeyId: '9f1c3b2a-1111-4111-8111-9f1c3b2a1111',
        mode: 'scripted_demo',
        isInternal: false,
        liveModeAvailable: false,
        consentRequired: ['age', 'terms', 'personal', 'sensitive'],
        policyVersion: 'mio-dialogue-1.0',
      },
      meta: { traceId: '01HVZXXX' },
    });
    expect(hasServerVisitor(result.data.visitorId)).toBe(false);
  });

  it('parses the visit status success envelope field for field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: {
        visitorId: 'c71e0a44-1111-4111-8111-c71e0a441111',
        mode: 'scripted_demo',
        isInternal: false,
        liveModeAvailable: false,
        consentGranted: ['terms', 'personal'],
        consentRequired: [],
        activeConversationId: null,
      },
      meta: { traceId: '01HVZXXY' },
    })));
    await expect(getVisit()).resolves.toEqual({
      success: true,
      data: {
        visitorId: 'c71e0a44-1111-4111-8111-c71e0a441111',
        mode: 'scripted_demo',
        isInternal: false,
        liveModeAvailable: false,
        consentGranted: ['terms', 'personal'],
        consentRequired: [],
        activeConversationId: null,
      },
      meta: { traceId: '01HVZXXY' },
    });
  });

  it('parses the error envelope by code and keeps requiredDocuments', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      error: {
        code: 'SENSITIVE_CONSENT_REQUIRED',
        message: '민감정보 처리 동의가 필요합니다.',
        details: { requiredDocuments: ['sensitive'] },
        traceId: '01HVZXXX',
      },
    }, { status: 400 })));
    const error = await startVisit({ journeyId: '9f1c3b2a-1111-4111-8111-9f1c3b2a1111' }).catch((value) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('SENSITIVE_CONSENT_REQUIRED');
    expect(error.traceId).toBe('01HVZXXX');
    expect(error.message).toBe('민감정보 처리 동의가 필요합니다.');
    expect(readRequiredDocuments(error.details)).toEqual(['sensitive']);
    expect(classifyApiError(error).code).toBe('SENSITIVE_CONSENT_REQUIRED');
  });

  it('rejects unknown consent document codes instead of dropping them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: {
        visitorId: null,
        journeyId: '9f1c3b2a-1111-4111-8111-9f1c3b2a1111',
        mode: 'scripted_demo',
        isInternal: false,
        liveModeAvailable: false,
        consentRequired: ['age', 'unknown_doc'],
        policyVersion: 'mio-dialogue-1.0',
      },
      meta: { traceId: '01HVZXXX' },
    })));
    await expect(startVisit({ journeyId: '9f1c3b2a-1111-4111-8111-9f1c3b2a1111' })).rejects.toBeInstanceOf(ApiError);
  });

  it('opens SSE with fetch accept and not EventSource', async () => {
    expect(sourceFiles()).not.toContain('EventSource');
    const fetchMock = vi.fn().mockResolvedValue(new Response('', {
      status: 200,
      headers: { 'Content-Type': SSE_ACCEPT },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await apiRequestStream({
      method: 'POST',
      path: '/v1/conversations/1/messages',
      body: { text: 'hi' },
      idempotencyKey: 'key-1',
    });
    expect(response.ok).toBe(true);
    const headers = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Accept')).toBe(SSE_ACCEPT);
    expect(headers.get('Idempotency-Key')).toBe('key-1');
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe('include');
  });
});
