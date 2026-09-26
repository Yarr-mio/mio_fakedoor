import { parseCohorts, type CohortReport } from '../retention-cohorts';
import { dashboardMetrics } from '../dashboard-metrics';
import { apiRequest, type ApiRequestOptions } from './client';
import { ApiError, ApiTransportError, isApiError } from './errors';
import { isConversationState, isJsonRecord, isServerMode, type ApiSuccess, type ConversationState, type ServerMode } from './types';

export type AdminRole = 'viewer' | 'safety';
export type AdminAccessToken = string;
export type AdminTokenSource = {
  getAccessToken: () => string | null;
};

export const unsetAdminTokenSource: AdminTokenSource = {
  getAccessToken: () => null,
};

// 인증 토큰 주입 지점

export const ADMIN_METRICS_MODES = ['scripted_demo', 'live', 'all'] as const;
export type AdminMetricsMode = (typeof ADMIN_METRICS_MODES)[number];
export const ADMIN_SAFETY_KINDS = ['crisis', 'contract_violation'] as const;
export type AdminSafetyKind = (typeof ADMIN_SAFETY_KINDS)[number];
export const ADMIN_SEGMENT_ROLES = ['user', 'mio'] as const;
export type AdminSegmentRole = (typeof ADMIN_SEGMENT_ROLES)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type AdminMetricsQuery = {
  start?: string;
  end?: string;
  includeInternal?: boolean;
  mode?: AdminMetricsMode;
};

export type AdminCohortsQuery = {
  asOf: string;
  coreAction: string;
};

export type AdminSafetyEventsQuery = {
  start?: string;
  end?: string;
  kind?: AdminSafetyKind;
  reviewed?: boolean;
  cursor?: string;
  limit?: number;
};

export type AdminFunnelStage = {
  name: string;
  label: string;
  count: number;
};

export type AdminCoverage = {
  eventLossRate: number | null;
  judgeUnresolvedRate: number | null;
  abandonedRate: number | null;
};

export type AdminLiveQuality = {
  followUpMismatchRate: number;
  inquiryRatio: number | null;
  replacedRate: number;
  crisisFlowCount: number;
  turnLimitCount: number;
};

export type AdminMetricsData = {
  range: { start: string; end: string; timezone: string };
  journeys: number;
  byMode: { scripted_demo: number; live: number };
  funnel: AdminFunnelStage[];
  typed: number;
  fixtures: number;
  needs: Record<string, number>;
  feedback: Record<string, number>;
  followup: Record<string, number>;
  orphanJourneys: number;
  coverage: AdminCoverage;
  liveQuality: AdminLiveQuality | null;
  daily: { day: string; events: number; journeys: number }[];
};

export type AdminSafetyEvent = {
  safetyEventId: string;
  conversationId: string;
  messageId: string;
  kind: AdminSafetyKind;
  categories: string[];
  responseAct: string;
  followUpModel: string;
  followUpFinal: string;
  replaced: boolean;
  judgeStatus: string;
  occurredAt: string;
  reviewedAt: string | null;
  contentAvailable: boolean;
};

export type AdminSafetyEventsPage = {
  events: AdminSafetyEvent[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type AdminTurnPlan = {
  maxQuestions: number;
  maxSentences: number;
  forbidden: string[];
};

export type AdminConversationTurn = {
  messageId: string;
  responseAct: string;
  plan: AdminTurnPlan;
  contractViolations: string[];
  followUpModel: string;
  followUpFinal: string;
  modelId: string;
  promptVersion: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costKrw: number;
};

export const ADMIN_NLI_LABELS = ['entailed', 'neutral', 'contradicted'] as const;
export type AdminNliLabel = (typeof ADMIN_NLI_LABELS)[number];
export const ADMIN_JUDGE_DECISIONS = ['accepted', 'rejected'] as const;
export type AdminJudgeDecision = (typeof ADMIN_JUDGE_DECISIONS)[number];

export type AdminSummaryAttribution = {
  type: string;
  value: string;
  evidenceMessageId: string;
  nli: AdminNliLabel | null;
  judge?: AdminJudgeDecision;
  kept: boolean;
};

export type AdminConversationSummary = {
  summaryId: string;
  judgeStatus: string;
  attributions: AdminSummaryAttribution[];
  contractViolations: string[];
  modelId: string;
  promptVersion: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costKrw: number;
};

export type AdminConversationTrace = {
  conversationId: string;
  mode: ServerMode;
  state: ConversationState;
  userTurns: number;
  policyVersion: string;
  turns: AdminConversationTurn[];
  summary: AdminConversationSummary | null;
};

export type AdminSafetySegmentMessage = {
  messageId: string;
  role: AdminSegmentRole;
  content: string;
  createdAt: string;
};

export type AdminSafetySegment = {
  safetyEventId: string;
  conversationId: string;
  flow: string;
  flaggedMessageId: string;
  segment: AdminSafetySegmentMessage[];
};

export const ADMIN_REVIEW_ACTIONS = ['confirmed', 'false_positive', 'no_action'] as const;
export type AdminReviewAction = (typeof ADMIN_REVIEW_ACTIONS)[number];
export const ADMIN_REVIEW_NOTE_CODES = [
  'context_misread',
  'keyword_bypass',
  'user_requested_review',
  'pattern_update_needed',
  'other',
] as const;
export type AdminReviewNoteCode = (typeof ADMIN_REVIEW_NOTE_CODES)[number];

export type AdminSafetyReviewBody = {
  action: AdminReviewAction;
  noteCode?: AdminReviewNoteCode;
};

export type AdminSafetyReviewResult = {
  safetyEventId: string;
  reviewedAt: string;
  action: AdminReviewAction;
  retainUntil: string;
};

function parseFailure(field: string): never {
  throw new ApiError({ code: 'UNKNOWN', message: `관리자 응답 필드 오류 ${field}` });
}

export function hasAdminAccessToken(token: string | null | undefined): token is AdminAccessToken {
  return typeof token === 'string' && token.trim().length > 0;
}

export function readAdminAccessToken(token: string | null | undefined): AdminAccessToken {
  if (!hasAdminAccessToken(token)) {
    throw new ApiError({ code: 'UNAUTHORIZED', message: '관리자 토큰 없음' });
  }
  return token.trim();
}

export function adminBearerAuthorization(token: string): string {
  return `Bearer ${readAdminAccessToken(token)}`;
}

export function canOpenSafetySegment(role: AdminRole): boolean {
  return role === 'safety';
}

function isAdminMetricsMode(value: unknown): value is AdminMetricsMode {
  return value === 'scripted_demo' || value === 'live' || value === 'all';
}

function isAdminSafetyKind(value: unknown): value is AdminSafetyKind {
  return value === 'crisis' || value === 'contract_violation';
}

function isAdminSegmentRole(value: unknown): value is AdminSegmentRole {
  return value === 'user' || value === 'mio';
}

function parseDateQuery(value: string | undefined, field: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!DATE.test(value)) {
    throw new ApiError({ code: 'VALIDATION_ERROR', message: `날짜 형식 오류 ${field}` });
  }
  return value;
}

function assertDateRange(start?: string, end?: string): void {
  if (start && end && start > end) {
    throw new ApiError({ code: 'VALIDATION_ERROR', message: '시작일이 종료일보다 늦음' });
  }
}

function queryString(params: Record<string, string | boolean | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

function parseInteger(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  return parseFailure(field);
}

function parseFinite(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return parseFailure(field);
}

function parseNullableRate(value: unknown, field: string): number | null {
  if (value === null) return null;
  return parseFinite(value, field);
}

function parseText(value: unknown, field: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  return parseFailure(field);
}

function parseNullableText(value: unknown, field: string): string | null {
  if (value === null) return null;
  return parseText(value, field);
}

function parseStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) return parseFailure(field);
  return value.map((item, index) => parseText(item, `${field}${index}`));
}

function parseCountMap(value: unknown, field: string): Record<string, number> {
  if (!isJsonRecord(value)) return parseFailure(field);
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    result[key] = parseInteger(count, `${field}${key}`);
  }
  return result;
}

function parseFunnel(value: unknown): AdminFunnelStage[] {
  if (!Array.isArray(value)) return parseFailure('funnel');
  return value.map((row, index) => {
    if (!isJsonRecord(row)) return parseFailure(`funnel${index}`);
    return {
      name: parseText(row.name, `funnel${index}name`),
      label: parseText(row.label, `funnel${index}label`),
      count: parseInteger(row.count, `funnel${index}count`),
    };
  });
}

function parseCoverage(value: unknown): AdminCoverage {
  if (!isJsonRecord(value)) return parseFailure('coverage');
  return {
    eventLossRate: parseNullableRate(value.eventLossRate, 'eventLossRate'),
    judgeUnresolvedRate: parseNullableRate(value.judgeUnresolvedRate, 'judgeUnresolvedRate'),
    abandonedRate: parseNullableRate(value.abandonedRate, 'abandonedRate'),
  };
}

function parseLiveQuality(value: unknown): AdminLiveQuality | null {
  if (value === null) return null;
  if (!isJsonRecord(value)) return parseFailure('liveQuality');
  return {
    followUpMismatchRate: parseFinite(value.followUpMismatchRate, 'followUpMismatchRate'),
    inquiryRatio: parseNullableRate(value.inquiryRatio, 'inquiryRatio'),
    replacedRate: parseFinite(value.replacedRate, 'replacedRate'),
    crisisFlowCount: parseInteger(value.crisisFlowCount, 'crisisFlowCount'),
    turnLimitCount: parseInteger(value.turnLimitCount, 'turnLimitCount'),
  };
}

function parseDaily(value: unknown): AdminMetricsData['daily'] {
  if (!Array.isArray(value)) return parseFailure('daily');
  return value.map((row, index) => {
    if (!isJsonRecord(row)) return parseFailure(`daily${index}`);
    return {
      day: parseText(row.day, `daily${index}day`),
      events: parseInteger(row.events, `daily${index}events`),
      journeys: parseInteger(row.journeys, `daily${index}journeys`),
    };
  });
}

export function parseAdminMetricsData(value: unknown): AdminMetricsData {
  if (!isJsonRecord(value)) return parseFailure('data');
  if (!isJsonRecord(value.range)) return parseFailure('range');
  if (!isJsonRecord(value.byMode)) return parseFailure('byMode');
  return {
    range: {
      start: parseText(value.range.start, 'rangeStart'),
      end: parseText(value.range.end, 'rangeEnd'),
      timezone: parseText(value.range.timezone, 'timezone'),
    },
    journeys: parseInteger(value.journeys, 'journeys'),
    byMode: {
      scripted_demo: parseInteger(value.byMode.scripted_demo, 'scriptedDemo'),
      live: parseInteger(value.byMode.live, 'live'),
    },
    funnel: parseFunnel(value.funnel),
    typed: parseInteger(value.typed, 'typed'),
    fixtures: parseInteger(value.fixtures, 'fixtures'),
    needs: parseCountMap(value.needs, 'needs'),
    feedback: parseCountMap(value.feedback, 'feedback'),
    followup: parseCountMap(value.followup, 'followup'),
    orphanJourneys: parseInteger(value.orphanJourneys, 'orphanJourneys'),
    coverage: parseCoverage(value.coverage),
    liveQuality: parseLiveQuality(value.liveQuality),
    daily: parseDaily(value.daily),
  };
}

function parseSafetyEvent(value: unknown, field: string): AdminSafetyEvent {
  if (!isJsonRecord(value)) return parseFailure(field);
  if (!isAdminSafetyKind(value.kind)) return parseFailure(`${field}kind`);
  return {
    safetyEventId: parseText(value.safetyEventId, `${field}safetyEventId`),
    conversationId: parseText(value.conversationId, `${field}conversationId`),
    messageId: parseText(value.messageId, `${field}messageId`),
    kind: value.kind,
    categories: parseStringList(value.categories, `${field}categories`),
    responseAct: parseText(value.responseAct, `${field}responseAct`),
    followUpModel: parseText(value.followUpModel, `${field}followUpModel`),
    followUpFinal: parseText(value.followUpFinal, `${field}followUpFinal`),
    replaced: typeof value.replaced === 'boolean' ? value.replaced : parseFailure(`${field}replaced`),
    judgeStatus: parseText(value.judgeStatus, `${field}judgeStatus`),
    occurredAt: parseText(value.occurredAt, `${field}occurredAt`),
    reviewedAt: parseNullableText(value.reviewedAt, `${field}reviewedAt`),
    contentAvailable: typeof value.contentAvailable === 'boolean' ? value.contentAvailable : parseFailure(`${field}contentAvailable`),
  };
}

function parseTurnPlan(value: unknown, field: string): AdminTurnPlan {
  if (!isJsonRecord(value)) return parseFailure(field);
  return {
    maxQuestions: parseInteger(value.maxQuestions, `${field}maxQuestions`),
    maxSentences: parseInteger(value.maxSentences, `${field}maxSentences`),
    forbidden: parseStringList(value.forbidden, `${field}forbidden`),
  };
}

function isAdminNliLabel(value: unknown): value is AdminNliLabel {
  return value === 'entailed' || value === 'neutral' || value === 'contradicted';
}

function isAdminJudgeDecision(value: unknown): value is AdminJudgeDecision {
  return value === 'accepted' || value === 'rejected';
}

function isAdminReviewAction(value: unknown): value is AdminReviewAction {
  return value === 'confirmed' || value === 'false_positive' || value === 'no_action';
}

function isAdminReviewNoteCode(value: unknown): value is AdminReviewNoteCode {
  return (
    value === 'context_misread' ||
    value === 'keyword_bypass' ||
    value === 'user_requested_review' ||
    value === 'pattern_update_needed' ||
    value === 'other'
  );
}

function parseAttribution(value: unknown, field: string): AdminSummaryAttribution {
  if (!isJsonRecord(value)) return parseFailure(field);
  const attribution: AdminSummaryAttribution = {
    type: parseText(value.type, `${field}type`),
    value: parseText(value.value, `${field}value`),
    evidenceMessageId: parseText(value.evidenceMessageId, `${field}evidenceMessageId`),
    nli: value.nli === null ? null : isAdminNliLabel(value.nli) ? value.nli : parseFailure(`${field}nli`),
    kept: typeof value.kept === 'boolean' ? value.kept : parseFailure(`${field}kept`),
  };
  if ('judge' in value) {
    if (!isAdminJudgeDecision(value.judge)) return parseFailure(`${field}judge`);
    attribution.judge = value.judge;
  }
  return attribution;
}

function parseConversationSummary(value: unknown): AdminConversationSummary | null {
  if (value === null || value === undefined) return null;
  if (!isJsonRecord(value)) return parseFailure('summary');
  if (!Array.isArray(value.attributions)) return parseFailure('summaryAttributions');
  return {
    summaryId: parseText(value.summaryId, 'summaryId'),
    judgeStatus: parseText(value.judgeStatus, 'judgeStatus'),
    attributions: value.attributions.map((row, index) => parseAttribution(row, `summaryAttributions${index}`)),
    contractViolations: parseStringList(value.contractViolations, 'summaryContractViolations'),
    modelId: parseText(value.modelId, 'summaryModelId'),
    promptVersion: parseText(value.promptVersion, 'summaryPromptVersion'),
    latencyMs: parseInteger(value.latencyMs, 'summaryLatencyMs'),
    tokensIn: parseInteger(value.tokensIn, 'summaryTokensIn'),
    tokensOut: parseInteger(value.tokensOut, 'summaryTokensOut'),
    costKrw: parseFinite(value.costKrw, 'summaryCostKrw'),
  };
}

function parseConversationTurn(value: unknown, field: string): AdminConversationTurn {
  if (!isJsonRecord(value)) return parseFailure(field);
  if ('content' in value) return parseFailure(`${field}content`);
  return {
    messageId: parseText(value.messageId, `${field}messageId`),
    responseAct: parseText(value.responseAct, `${field}responseAct`),
    plan: parseTurnPlan(value.plan, `${field}plan`),
    contractViolations: parseStringList(value.contractViolations, `${field}contractViolations`),
    followUpModel: parseText(value.followUpModel, `${field}followUpModel`),
    followUpFinal: parseText(value.followUpFinal, `${field}followUpFinal`),
    modelId: parseText(value.modelId, `${field}modelId`),
    promptVersion: parseText(value.promptVersion, `${field}promptVersion`),
    latencyMs: parseInteger(value.latencyMs, `${field}latencyMs`),
    tokensIn: parseInteger(value.tokensIn, `${field}tokensIn`),
    tokensOut: parseInteger(value.tokensOut, `${field}tokensOut`),
    costKrw: parseFinite(value.costKrw, `${field}costKrw`),
  };
}

export function parseAdminConversationTrace(value: unknown): AdminConversationTrace {
  if (!isJsonRecord(value)) return parseFailure('data');
  if (!isServerMode(value.mode)) return parseFailure('mode');
  if (!isConversationState(value.state)) return parseFailure('state');
  if (!Array.isArray(value.turns)) return parseFailure('turns');
  return {
    conversationId: parseText(value.conversationId, 'conversationId'),
    mode: value.mode,
    state: value.state,
    userTurns: parseInteger(value.userTurns, 'userTurns'),
    policyVersion: parseText(value.policyVersion, 'policyVersion'),
    turns: value.turns.map((turn, index) => parseConversationTurn(turn, `turns${index}`)),
    summary: parseConversationSummary(value.summary),
  };
}

function parseSegmentMessage(value: unknown, field: string): AdminSafetySegmentMessage {
  if (!isJsonRecord(value)) return parseFailure(field);
  if (!isAdminSegmentRole(value.role)) return parseFailure(`${field}role`);
  return {
    messageId: parseText(value.messageId, `${field}messageId`),
    role: value.role,
    content: typeof value.content === 'string' ? value.content : parseFailure(`${field}content`),
    createdAt: parseText(value.createdAt, `${field}createdAt`),
  };
}

export function parseAdminSafetySegment(value: unknown): AdminSafetySegment {
  if (!isJsonRecord(value)) return parseFailure('data');
  if (!Array.isArray(value.segment)) return parseFailure('segment');
  return {
    safetyEventId: parseText(value.safetyEventId, 'safetyEventId'),
    conversationId: parseText(value.conversationId, 'conversationId'),
    flow: parseText(value.flow, 'flow'),
    flaggedMessageId: parseText(value.flaggedMessageId, 'flaggedMessageId'),
    segment: value.segment.map((row, index) => parseSegmentMessage(row, `segment${index}`)),
  };
}

function parseCohortReport(value: unknown): CohortReport {
  try {
    return parseCohorts(value);
  } catch (error) {
    throw new ApiError({
      code: 'UNKNOWN',
      message: error instanceof Error ? error.message : '코호트 응답 필드 오류',
    });
  }
}

// 코호트 파서 재사용

function adminRequest<T>(token: string, options: Omit<ApiRequestOptions, 'authorization' | 'credentials'>): Promise<ApiSuccess<T>> {
  return apiRequest<T>({
    ...options,
    authorization: adminBearerAuthorization(token),
    credentials: 'omit',
  });
}

// 관리자 요청 쿠키 제외

export async function getAdminMetrics(token: string, query: AdminMetricsQuery = {}): Promise<ApiSuccess<AdminMetricsData>> {
  const start = parseDateQuery(query.start, 'start');
  const end = parseDateQuery(query.end, 'end');
  assertDateRange(start, end);
  const mode = query.mode ?? 'all';
  if (!isAdminMetricsMode(mode)) {
    throw new ApiError({ code: 'VALIDATION_ERROR', message: 'mode 값 오류' });
  }
  const path = `/v1/admin/metrics${queryString({
    start,
    end,
    includeInternal: query.includeInternal ?? false,
    mode,
  })}`;
  return adminRequest<unknown>(token, { method: 'GET', path }).then((result) => ({
    ...result,
    data: parseAdminMetricsData(result.data),
  }));
}

export async function getAdminCohorts(token: string, query: AdminCohortsQuery): Promise<ApiSuccess<CohortReport>> {
  const asOf = parseDateQuery(query.asOf, 'asOf');
  if (!asOf) throw new ApiError({ code: 'VALIDATION_ERROR', message: 'asOf 미지정' });
  const coreAction = query.coreAction.trim();
  if (!coreAction) throw new ApiError({ code: 'VALIDATION_ERROR', message: 'coreAction 미지정' });
  const path = `/v1/admin/cohorts${queryString({ asOf, coreAction })}`;
  return adminRequest<unknown>(token, { method: 'GET', path }).then((result) => ({
    ...result,
    data: parseCohortReport(result.data),
  }));
}

export async function getAdminSafetyEvents(token: string, query: AdminSafetyEventsQuery = {}): Promise<ApiSuccess<AdminSafetyEventsPage>> {
  const start = parseDateQuery(query.start, 'start');
  const end = parseDateQuery(query.end, 'end');
  assertDateRange(start, end);
  if (query.kind !== undefined && !isAdminSafetyKind(query.kind)) {
    throw new ApiError({ code: 'VALIDATION_ERROR', message: 'kind 값 오류' });
  }
  const path = `/v1/admin/safety-events${queryString({
    start,
    end,
    kind: query.kind,
    reviewed: query.reviewed,
    cursor: query.cursor,
    limit: query.limit,
  })}`;
  return adminRequest<unknown>(token, { method: 'GET', path }).then((result) => {
    if (!isJsonRecord(result.data) || !Array.isArray(result.data.events)) return parseFailure('events');
    return {
      ...result,
      data: {
        events: result.data.events.map((row, index) => parseSafetyEvent(row, `events${index}`)),
        nextCursor: result.meta.nextCursor ?? null,
        hasMore: result.meta.hasMore === true,
      },
    };
  });
}

export async function getAdminConversation(token: string, conversationId: string): Promise<ApiSuccess<AdminConversationTrace>> {
  const id = conversationId.trim();
  if (!id) throw new ApiError({ code: 'VALIDATION_ERROR', message: 'conversationId 미지정' });
  return adminRequest<unknown>(token, {
    method: 'GET',
    path: `/v1/admin/conversations/${encodeURIComponent(id)}`,
  }).then((result) => ({
    ...result,
    data: parseAdminConversationTrace(result.data),
  }));
}

export async function getAdminSafetyEventSegment(token: string, safetyEventId: string): Promise<ApiSuccess<AdminSafetySegment>> {
  const id = safetyEventId.trim();
  if (!id) throw new ApiError({ code: 'VALIDATION_ERROR', message: 'safetyEventId 미지정' });
  return adminRequest<unknown>(token, {
    method: 'GET',
    path: `/v1/admin/safety-events/${encodeURIComponent(id)}/segment`,
    cache: 'no-store',
    // 원문 구간 캐시 없음
  }).then((result) => ({
    ...result,
    data: parseAdminSafetySegment(result.data),
  }));
}

function parseAdminSafetyReview(value: unknown): AdminSafetyReviewResult {
  if (!isJsonRecord(value)) return parseFailure('data');
  if (!isAdminReviewAction(value.action)) return parseFailure('action');
  const retainUntil = parseText(value.retainUntil, 'retainUntil');
  if (!DATE.test(retainUntil)) return parseFailure('retainUntil');
  return {
    safetyEventId: parseText(value.safetyEventId, 'safetyEventId'),
    reviewedAt: parseText(value.reviewedAt, 'reviewedAt'),
    action: value.action,
    retainUntil,
  };
}

export async function reviewAdminSafetyEvent(
  token: string,
  safetyEventId: string,
  body: AdminSafetyReviewBody,
): Promise<ApiSuccess<AdminSafetyReviewResult>> {
  const id = safetyEventId.trim();
  if (!id) throw new ApiError({ code: 'VALIDATION_ERROR', message: 'safetyEventId 미지정' });
  if (!isAdminReviewAction(body.action)) {
    throw new ApiError({ code: 'VALIDATION_ERROR', message: 'action 값 오류' });
  }
  if (body.noteCode !== undefined && !isAdminReviewNoteCode(body.noteCode)) {
    throw new ApiError({ code: 'VALIDATION_ERROR', message: 'noteCode 값 오류' });
  }
  const requestBody: AdminSafetyReviewBody = body.noteCode
    ? { action: body.action, noteCode: body.noteCode }
    : { action: body.action };
  return adminRequest<unknown>(token, {
    method: 'POST',
    path: `/v1/admin/safety-events/${encodeURIComponent(id)}/review`,
    body: requestBody,
  }).then((result) => ({
    ...result,
    data: parseAdminSafetyReview(result.data),
  }));
}

export type AdminApi = {
  getMetrics: (query?: AdminMetricsQuery) => Promise<ApiSuccess<AdminMetricsData>>;
  getCohorts: (query: AdminCohortsQuery) => Promise<ApiSuccess<CohortReport>>;
  getSafetyEvents: (query?: AdminSafetyEventsQuery) => Promise<ApiSuccess<AdminSafetyEventsPage>>;
  getConversation: (conversationId: string) => Promise<ApiSuccess<AdminConversationTrace>>;
  getSafetyEventSegment: (safetyEventId: string) => Promise<ApiSuccess<AdminSafetySegment>>;
  reviewSafetyEvent: (safetyEventId: string, body: AdminSafetyReviewBody) => Promise<ApiSuccess<AdminSafetyReviewResult>>;
};

export function createAdminApi(tokenSource: AdminTokenSource): AdminApi {
  const token = () => tokenSource.getAccessToken() ?? '';
  return {
    getMetrics: (query = {}) => getAdminMetrics(token(), query),
    getCohorts: (query) => getAdminCohorts(token(), query),
    getSafetyEvents: (query = {}) => getAdminSafetyEvents(token(), query),
    getConversation: (conversationId) => getAdminConversation(token(), conversationId),
    getSafetyEventSegment: (safetyEventId) => getAdminSafetyEventSegment(token(), safetyEventId),
    reviewSafetyEvent: (safetyEventId, body) => reviewAdminSafetyEvent(token(), safetyEventId, body),
  };
}

export function metricsFromLocalDashboard(
  metrics: ReturnType<typeof dashboardMetrics>,
  range: { start: string; end: string },
): AdminMetricsData {
  return {
    range: { start: range.start, end: range.end, timezone: 'Asia/Seoul' },
    journeys: metrics.journeys,
    byMode: { scripted_demo: metrics.journeys, live: 0 },
    funnel: metrics.funnel,
    typed: metrics.typed,
    fixtures: metrics.fixtures,
    needs: metrics.needs,
    feedback: metrics.feedback,
    followup: metrics.followup,
    orphanJourneys: metrics.orphanJourneys,
    coverage: { eventLossRate: null, judgeUnresolvedRate: null, abandonedRate: null },
    liveQuality: null,
    daily: metrics.daily,
  };
}

export function formatCoverageRate(value: number | null): string {
  if (value === null) return '측정 안 됨';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatJudgeStatus(status: string): string {
  return status === 'skipped' ? '판정 미실행' : status;
}

export function formatSafetyKind(kind: AdminSafetyKind): string {
  return kind === 'crisis' ? '위기' : '계약 위반';
}

export function shouldShowLiveQuality(liveQuality: AdminLiveQuality | null): liveQuality is AdminLiveQuality {
  return liveQuality !== null;
}

export function applySafetyReview(
  events: AdminSafetyEvent[],
  safetyEventId: string,
  reviewedAt: string,
): AdminSafetyEvent[] {
  return events.map((event) => (event.safetyEventId === safetyEventId ? { ...event, reviewedAt } : event));
}

export function adminErrorMessage(
  error: unknown,
  context: 'metrics' | 'cohorts' | 'safety' | 'conversation' | 'segment' | 'review',
): string {
  if (isApiError(error)) {
    if (error.code === 'ADMIN_AUTH_NOT_CONFIGURED') return '관리자 인증이 설정되지 않았습니다';
    if (error.code === 'UNAUTHORIZED') return '관리자 인증이 필요합니다';
    if (error.code === 'FORBIDDEN') return 'Safety 역할이 없어 원문에 접근할 수 없습니다';
    if (error.code === 'GONE') return '삭제된 대화입니다';
    if (error.code === 'NOT_FOUND') {
      return context === 'conversation' ? '대화를 찾을 수 없습니다' : '사건을 찾을 수 없습니다';
    }
    if (error.code === 'BUSINESS_RULE_VIOLATION') return '핵심 행동 정의가 아직 확정되지 않았습니다';
    if (error.code === 'VALIDATION_ERROR') return error.message || '요청 값을 확인해주세요';
    return error.message || '관리자 API 오류';
  }
  if (error instanceof ApiTransportError) return '네트워크 오류';
  return '관리자 API 오류';
}
