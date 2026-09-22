import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildConsentGrants, endsConversationOnWithdraw, getConsentStatus, recordConsent, withdrawConsent } from './consent';
import { LEGAL_DOCUMENT_VERSION } from '../legal-version';

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

const retention = {
  conversationContent: 'until_deletion_or_withdrawal',
  deletionDeadlineDays: { database: 7, backup: 30 },
  operationalLogDays: 30,
  consentHistoryYears: 3,
  sunsetPolicy: '서비스를 종료할 때는 미리 알리고, 이용자가 자신의 정보를 확인하거나 삭제를 요청할 방법을 안내합니다.',
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.test');
  vi.stubGlobal('location', { origin: 'https://app.example.test' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('consent grants', () => {
  it('sends all five codes including declined marketing and no extra fields', () => {
    const grants = buildConsentGrants({ age: true, terms: true, personal: true, sensitive: true, marketing: false }, LEGAL_DOCUMENT_VERSION);
    expect(grants).toEqual([
      { documentCode: 'age', documentVersion: LEGAL_DOCUMENT_VERSION, granted: true },
      { documentCode: 'terms', documentVersion: LEGAL_DOCUMENT_VERSION, granted: true },
      { documentCode: 'personal', documentVersion: LEGAL_DOCUMENT_VERSION, granted: true },
      { documentCode: 'sensitive', documentVersion: LEGAL_DOCUMENT_VERSION, granted: true },
      { documentCode: 'marketing', documentVersion: LEGAL_DOCUMENT_VERSION, granted: false },
    ]);
    expect(new Set(grants.map((grant) => grant.documentCode)).size).toBe(5);
    expect(JSON.stringify(grants)).not.toContain('userAgent');
    expect(JSON.stringify(grants)).not.toContain('locale');
    expect(JSON.stringify(grants)).not.toContain('ip');
  });

  it('ends conversation only for personal sensitive or full withdraw', () => {
    expect(endsConversationOnWithdraw(['marketing'])).toBe(false);
    expect(endsConversationOnWithdraw(['sensitive'])).toBe(true);
    expect(endsConversationOnWithdraw(['personal'])).toBe(true);
    expect(endsConversationOnWithdraw(undefined)).toBe(true);
  });
});

describe('consent api spec fixtures', () => {
  it('records consent with idempotency key and parses 201 data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: {
        recordedAt: '2026-09-22T09:00:00Z',
        granted: ['age', 'terms', 'personal', 'sensitive'],
        declined: ['marketing'],
        liveModeUnlocked: true,
        retention,
      },
      meta: { traceId: '01HVZXXZ' },
    }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const grants = buildConsentGrants({ age: true, terms: true, personal: true, sensitive: true, marketing: false }, LEGAL_DOCUMENT_VERSION);
    const result = await recordConsent({
      journeyId: '9f1c3b2a-1111-4111-8111-9f1c3b2a1111',
      grants,
      idempotencyKey: 'idem-1',
    });
    expect(result.data).toEqual({
      recordedAt: '2026-09-22T09:00:00Z',
      granted: ['age', 'terms', 'personal', 'sensitive'],
      declined: ['marketing'],
      liveModeUnlocked: true,
      retention,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/v1/consent');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    const headers = new Headers(init.headers);
    expect(headers.get('Idempotency-Key')).toBe('idem-1');
    expect(headers.get('Content-Type')).toBe('application/json');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      journeyId: '9f1c3b2a-1111-4111-8111-9f1c3b2a1111',
      grants,
    });
    expect(body).not.toHaveProperty('userAgent');
    expect(body).not.toHaveProperty('locale');
    expect(body).not.toHaveProperty('mode');
  });

  it('withdraws with omitted codes for full revoke and reuses the same key', async () => {
    const payload = {
      success: true,
      data: {
        operationId: 'op_7f8b1c2d',
        status: 'pending',
        withdrawn: ['sensitive'],
        deletionScope: ['conversation_content'],
        aggregateRetained: true,
      },
      meta: { traceId: '01HVZXY0' },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(payload, { status: 202 }))
      .mockResolvedValueOnce(jsonResponse(payload, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const first = await withdrawConsent({ documentCodes: ['sensitive'], idempotencyKey: 'idem-del' });
    const second = await withdrawConsent({ documentCodes: ['sensitive'], idempotencyKey: 'idem-del' });
    expect(first.data.operationId).toBe('op_7f8b1c2d');
    expect(second.data.operationId).toBe(first.data.operationId);
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('Idempotency-Key')).toBe('idem-del');
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ documentCodes: ['sensitive'] });
    const full = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: {
        operationId: 'op_all',
        status: 'pending',
        withdrawn: ['age', 'terms', 'personal', 'sensitive', 'marketing'],
        deletionScope: ['conversation_content', 'consent_evidence'],
        aggregateRetained: true,
      },
      meta: { traceId: '01ALL' },
    }, { status: 202 }));
    vi.stubGlobal('fetch', full);
    await withdrawConsent({ idempotencyKey: 'idem-all' });
    expect(JSON.parse(String((full.mock.calls[0][1] as RequestInit).body))).toEqual({});
  });

  it('reads consent status query Retry After and failed retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: {
        consents: [
          { documentCode: 'terms', documentVersion: LEGAL_DOCUMENT_VERSION, granted: true, grantedAt: '2026-09-22T09:00:00Z', withdrawnAt: null },
          { documentCode: 'sensitive', documentVersion: LEGAL_DOCUMENT_VERSION, granted: false, grantedAt: '2026-09-22T09:00:00Z', withdrawnAt: '2026-09-22T10:00:00Z' },
        ],
        deletions: [
          {
            operationId: 'op_7f8b1c2d',
            status: 'failed',
            requestedAt: '2026-09-22T10:00:00Z',
            completedAt: null,
            scope: ['conversation_content'],
            error: { code: 'UPSTREAM_UNAVAILABLE', message: '삭제 작업이 실패했어요' },
            retryable: true,
          },
        ],
      },
      meta: { traceId: '01HVZXY1' },
    }, { headers: { 'Retry-After': '5' } })));
    const result = await getConsentStatus('op_7f8b1c2d');
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://api.example.test/v1/consent/status?operationId=op_7f8b1c2d');
    expect(result.retryAfterSeconds).toBe(5);
    expect(result.data.deletions[0]).toMatchObject({
      status: 'failed',
      retryable: true,
      error: { message: '삭제 작업이 실패했어요' },
    });
  });
});
