import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COHORT_TEMPLATE } from '../retention-cohorts';
import { ApiError } from './errors';
import {
  adminBearerAuthorization,
  adminErrorMessage,
  applySafetyReview,
  canOpenSafetySegment,
  createAdminApi,
  formatCoverageRate,
  formatJudgeStatus,
  formatSafetyKind,
  getAdminCohorts,
  getAdminConversation,
  getAdminMetrics,
  getAdminSafetyEventSegment,
  getAdminSafetyEvents,
  hasAdminAccessToken,
  parseAdminConversationTrace,
  parseAdminMetricsData,
  reviewAdminSafetyEvent,
  shouldShowLiveQuality,
  unsetAdminTokenSource,
} from './admin';

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorBody(code: string, status: number) {
  return jsonResponse({ error: { code, message: code, traceId: '01ERR' } }, { status });
}

const metricsData = {
  range: { start: '2026-09-01', end: '2026-09-22', timezone: 'Asia/Seoul' },
  journeys: 412,
  byMode: { scripted_demo: 412, live: 0 },
  funnel: [
    { name: 'landing_viewed', label: '홈 노출', count: 412 },
    { name: 'entry_clicked', label: '시작 버튼', count: 188 },
  ],
  typed: 44,
  fixtures: 96,
  needs: { listen: 51, organize: 38 },
  feedback: { helpful: 22, unclear: 9 },
  followup: { perspective: 14, existing: 8, none: 17 },
  orphanJourneys: 23,
  coverage: { eventLossRate: null, judgeUnresolvedRate: null, abandonedRate: 0.07 },
  liveQuality: null,
  daily: [{ day: '2026-09-22', events: 310, journeys: 41 }],
};

const cohortData = {
  ...COHORT_TEMPLATE,
  asOf: '2026-09-21',
  coreAction: 'live 대화에서 메시지 전송',
  sourceRef: 'fd-cohort-2026-09-21',
  cohorts: [
    { weekStart: '2026-09-07', size: 34, retained: [34, 6, null] },
    { weekStart: '2026-09-14', size: 41, retained: [41, null, null] },
  ],
};

const safetyEvent = {
  safetyEventId: 'se_01H',
  conversationId: '7f8b1c2d-1111-4111-8111-7f8b1c2d1111',
  messageId: 'msg_out_r1',
  kind: 'contract_violation',
  categories: ['guaranteed_outcome'],
  responseAct: 'EMPATHIC_REFLECTION',
  followUpModel: 'offer',
  followUpFinal: 'wait',
  replaced: true,
  judgeStatus: 'skipped',
  occurredAt: '2026-09-22T09:05:00Z',
  reviewedAt: null,
  contentAvailable: true,
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'https://api.example.test');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('admin token gate', () => {
  it('does not fetch without a token and omits prototype session code', async () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/api/admin.ts'), 'utf8');
    expect(source).not.toContain('admin-session');
    expect(source).not.toContain('/api/admin/session');
    expect(hasAdminAccessToken(unsetAdminTokenSource.getAccessToken())).toBe(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const api = createAdminApi(unsetAdminTokenSource);
    await expect(api.getMetrics()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends bearer authorization and omits cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: metricsData,
      meta: { traceId: '01MET' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await getAdminMetrics('token-1', { start: '2026-09-01', end: '2026-09-22', mode: 'all' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/v1/admin/metrics?start=2026-09-01&end=2026-09-22&includeInternal=false&mode=all');
    expect(init.credentials).toBe('omit');
    expect(new Headers(init.headers).get('Authorization')).toBe(adminBearerAuthorization('token-1'));
  });
});

describe('admin metrics', () => {
  it('keeps coverage null distinct from zero and hides empty live quality', () => {
    const parsed = parseAdminMetricsData(metricsData);
    expect(parsed.journeys).toBe(412);
    expect(parsed.byMode).toEqual({ scripted_demo: 412, live: 0 });
    expect(parsed).not.toHaveProperty('total');
    expect(formatCoverageRate(parsed.coverage.eventLossRate)).toBe('측정 안 됨');
    expect(formatCoverageRate(parsed.coverage.judgeUnresolvedRate)).toBe('측정 안 됨');
    expect(formatCoverageRate(parsed.coverage.abandonedRate)).toBe('7.0%');
    expect(formatCoverageRate(0)).toBe('0.0%');
    expect(shouldShowLiveQuality(parsed.liveQuality)).toBe(false);
    expect(shouldShowLiveQuality({
      followUpMismatchRate: 0.04,
      inquiryRatio: 0.31,
      replacedRate: 0.02,
      crisisFlowCount: 1,
      turnLimitCount: 3,
    })).toBe(true);
  });

  it('rejects inverted dates before fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(getAdminMetrics('token-1', { start: '2026-09-22', end: '2026-09-01' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('admin cohorts', () => {
  it('reuses parseCohorts and keeps immature weeks as null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: cohortData,
      meta: { traceId: '01COH' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await getAdminCohorts('token-1', { asOf: '2026-09-21', coreAction: 'live 대화에서 메시지 전송' });
    expect(result.data.version).toBe('mio-cohort-v1');
    expect(result.data.cohorts[0].retained[2]).toBeNull();
    expect(result.data.cohorts[1].retained[1]).toBeNull();
  });

  it('maps core action 422 to an explicit message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorBody('BUSINESS_RULE_VIOLATION', 422)));
    try {
      await getAdminCohorts('token-1', { asOf: '2026-09-21', coreAction: 'placeholder' });
      throw new Error('expected failure');
    } catch (error) {
      expect(adminErrorMessage(error, 'cohorts')).toBe('핵심 행동 정의가 아직 확정되지 않았습니다');
    }
  });
});

describe('admin safety and conversation', () => {
  it('lists metadata without content and keeps kinds separate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: { events: [safetyEvent] },
      meta: { traceId: '01SAF', nextCursor: 'se_01G', hasMore: true },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await getAdminSafetyEvents('token-1', { kind: 'contract_violation' });
    expect(result.data.events[0]).not.toHaveProperty('content');
    expect(result.data.nextCursor).toBe('se_01G');
    expect(result.data.hasMore).toBe(true);
    expect(formatSafetyKind('crisis')).toBe('위기');
    expect(formatSafetyKind('contract_violation')).toBe('계약 위반');
    expect(formatJudgeStatus('skipped')).toBe('판정 미실행');
    expect(formatJudgeStatus('skipped')).not.toContain('완료');
    expect(canOpenSafetySegment('viewer')).toBe(false);
    expect(canOpenSafetySegment('safety')).toBe(true);
  });

  it('rejects conversation payloads that include message content', () => {
    expect(() => parseAdminConversationTrace({
      conversationId: '7f8b1c2d-1111-4111-8111-7f8b1c2d1111',
      mode: 'live',
      state: 'wait',
      userTurns: 1,
      policyVersion: 'mio-dialogue-1.0',
      turns: [{
        messageId: 'msg_out_xyz',
        content: 'secret',
        responseAct: 'EMPATHIC_REFLECTION',
        plan: { maxQuestions: 0, maxSentences: 3, forbidden: ['advice'] },
        contractViolations: [],
        followUpModel: 'offer',
        followUpFinal: 'wait',
        modelId: 'm',
        promptVersion: 'p',
        latencyMs: 10,
        tokensIn: 1,
        tokensOut: 1,
        costKrw: 1,
      }],
    })).toThrow(ApiError);
  });

  it('keeps deferred conversation fields optional', () => {
    const parsed = parseAdminConversationTrace({
      conversationId: '7f8b1c2d-1111-4111-8111-7f8b1c2d1111',
      mode: 'live',
      state: 'wait',
      userTurns: 7,
      policyVersion: 'mio-dialogue-1.0',
      turns: [],
    });
    expect(parsed).not.toHaveProperty('riskState');
    expect(parsed).not.toHaveProperty('attributions');
  });

  it('fetches conversation traces without content fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: {
        conversationId: '7f8b1c2d-1111-4111-8111-7f8b1c2d1111',
        mode: 'live',
        state: 'wait',
        userTurns: 7,
        policyVersion: 'mio-dialogue-1.0',
        turns: [{
          messageId: 'msg_out_xyz',
          responseAct: 'EMPATHIC_REFLECTION',
          plan: { maxQuestions: 0, maxSentences: 3, forbidden: ['advice', 'task'] },
          contractViolations: [],
          followUpModel: 'offer',
          followUpFinal: 'wait',
          modelId: 'model',
          promptVersion: 'fd-prompt',
          latencyMs: 1840,
          tokensIn: 412,
          tokensOut: 96,
          costKrw: 3.1,
        }],
      },
      meta: { traceId: '01CONV' },
    })));
    const result = await getAdminConversation('token-1', '7f8b1c2d-1111-4111-8111-7f8b1c2d1111');
    expect(result.data.turns[0]).not.toHaveProperty('content');
  });

  it('disables cache on segment fetch and distinguishes auth errors', async () => {
    const segmentPayload = {
      success: true,
      data: {
        safetyEventId: 'se_01H',
        conversationId: '7f8b1c2d-1111-4111-8111-7f8b1c2d1111',
        flow: 'end',
        flaggedMessageId: 'msg_in_c1',
        segment: [
          { messageId: 'msg_out_b9', role: 'mio', content: 'a', createdAt: '2026-09-22T09:04:40Z' },
        ],
      },
      meta: { traceId: '01SEG' },
    };
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse(segmentPayload));
    vi.stubGlobal('fetch', fetchMock);
    await getAdminSafetyEventSegment('token-1', 'se_01H');
    await getAdminSafetyEventSegment('token-1', 'se_01H');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe('no-store');
    expect(adminErrorMessage(new ApiError({ code: 'UNAUTHORIZED', message: 'x' }), 'segment')).toBe('관리자 인증이 필요합니다');
    expect(adminErrorMessage(new ApiError({ code: 'FORBIDDEN', message: 'x' }), 'segment')).toBe('Safety 역할이 없어 원문에 접근할 수 없습니다');
    expect(adminErrorMessage(new ApiError({ code: 'GONE', message: 'x' }), 'segment')).toBe('삭제된 대화입니다');
  });

  it('updates reviewedAt after a successful review', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: true,
      data: { reviewedAt: '2026-09-22T10:00:00Z' },
      meta: { traceId: '01REV' },
    })));
    const result = await reviewAdminSafetyEvent('token-1', 'se_01H', {
      reviewedAt: '2026-09-22T10:00:00Z',
      policyApplied: 'crisis-end',
      actionResult: 'closed',
    });
    const updated = applySafetyReview([
      { ...safetyEvent, kind: 'contract_violation', reviewedAt: null, categories: ['guaranteed_outcome'] },
    ], 'se_01H', result.data.reviewedAt);
    expect(updated[0].reviewedAt).toBe('2026-09-22T10:00:00Z');
  });
});
