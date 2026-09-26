import { apiRequest, apiRequestStream } from "./client";
import { DELETION_STATUSES, type DeletionStatus } from "./consent";
import { ApiError, ApiTransportError, isApiError } from "./errors";
import { SSE_ACCEPT } from "./headers";
import { readSseStream, type SseBlock } from "./sse";
import {
  isConversationState,
  isJsonRecord,
  isNeedCode,
  isServerMode,
  type ApiSuccess,
  type ConversationState,
  type NeedCode,
  type ServerMode,
} from "./types";

export const MESSAGE_SOURCES = ["typed", "fixture", "model"] as const;
export type MessageSource = (typeof MESSAGE_SOURCES)[number];
export const MESSAGE_STATUSES = ["complete", "stopped", "failed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
export const MESSAGE_ROLES = ["user", "mio"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];
// end는 자살 자해 명시 표현
export const CRISIS_FLOWS = ["end", "continue"] as const;
export type CrisisFlow = (typeof CRISIS_FLOWS)[number];
export const CONTROL_ACTIONS = ["stop", "resume"] as const;
export type ControlAction = (typeof CONTROL_ACTIONS)[number];
export const END_REASONS = ["user_end", "quiet"] as const;
export type EndReason = (typeof END_REASONS)[number];
export const FINISHED_REASONS = [
  // stop은 LLM 실패 폴백 포함
  "stop",
  "replaced_by_guard",
  "crisis_flow",
  "turn_limit",
  "stopped_by_user",
  // error만 오류 화면
  "error",
  "security_refusal",
] as const;
export type FinishedReason = (typeof FINISHED_REASONS)[number];
export const LIVE_FALLBACK_CODES = [
  "LIVE_MODE_DISABLED",
  "LIVE_BUDGET_EXHAUSTED",
] as const;

function parseFailure(field: string): never {
  throw new ApiError({
    code: "UNKNOWN",
    message: `대화 응답 필드 오류 ${field}`,
  });
}

function parseString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0)
    return parseFailure(field);
  return value;
}

function parseInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value))
    return parseFailure(field);
  return value;
}

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") return parseFailure(field);
  return value;
}

export type ConversationOpening = {
  messageId: string;
  role: "mio";
  source: "fixture";
  content: string;
};

export type ConversationLimits = {
  maxUserTurns: number;
  maxContentChars: number;
};

export type CreateConversationData = {
  conversationId: string;
  mode: ServerMode;
  state: ConversationState;
  stateVersion: number;
  policyVersion: string;
  opening: ConversationOpening | null;
  limits: ConversationLimits;
};

export type HistoryMessage = {
  messageId: string;
  role: MessageRole;
  source: MessageSource;
  content: string;
  status: MessageStatus;
  createdAt: string;
};

export type ListMessagesData = {
  conversationId: string;
  state: ConversationState;
  stateVersion: number;
  mode: ServerMode;
  messages: HistoryMessage[];
};

export type ControlConversationData = {
  state: ConversationState;
  stateVersion: number;
  stoppedMessageId?: string;
};

export type DeleteConversationData = {
  operationId: string;
  status: DeletionStatus;
  dbDeadline: string;
  backupDeadline: string;
};

export type EndConversationData = {
  state: "end";
  stateVersion: number;
  endedAt: string;
};

export type SessionMetaEvent = {
  messageId: string;
  outMessageId: string;
  receivedAt: string;
  conversationId: string;
  policyVersion: string;
  requestId: string;
};

export type DeltaEvent = {
  chunk: string;
  msgId: string;
};

export type DeltaReplaceEvent = {
  safeResponse: string;
  msgId: string;
};

export type CrisisEmergency = {
  id: string;
  label: string;
  number: string;
  hours?: string;
};

export type CrisisResource = {
  id: string;
  title: string;
  organization: string;
  url: string;
};

export type CrisisReviewRequest = {
  referenceCode: string;
  contact: string;
};

export type CrisisEvent = {
  // 서버 flow 값만 사용
  flow: CrisisFlow;
  severity: number;
  fixedResponse?: string;
  emergency: CrisisEmergency[];
  resources: CrisisResource[];
  reviewRequest?: CrisisReviewRequest;
};

export const SUMMARY_SOURCES = ["fixture", "model"] as const;
export type SummarySource = (typeof SUMMARY_SOURCES)[number];
export const SUMMARY_JUDGE_STATUSES = ["ok", "failed", "skipped"] as const;
export type SummaryJudgeStatus = (typeof SUMMARY_JUDGE_STATUSES)[number];

export type ExpressedEmotion = {
  label: string;
  evidenceMessageId: string;
};

export type ConversationSummaryData = {
  summaryId: string;
  conversationId: string;
  mode: ServerMode;
  source: SummarySource;
  situation: string | null;
  expressedEmotions: ExpressedEmotion[];
  remainingConcerns: string[];
  judgeStatus: SummaryJudgeStatus;
  // 제거 건수는 정수
  droppedAttributions: number;
  generatedAt: string;
};

// 빈 감정은 클라이언트 고정 문구
export const EMPTY_EXPRESSED_EMOTIONS_COPY =
  "아직 구체적인 감정을 말하지 않았어요";

export type DoneInteraction = {
  followUp: ConversationState;
  suggestions: string[];
};

export type DoneEvent = {
  msgId: string;
  envelopeVersion: string;
  state: ConversationState;
  stateVersion: number;
  mode: ServerMode;
  interaction: DoneInteraction;
  finishedReason: string;
  judgeStatus: string;
  isCrisisFlagged: boolean;
};

export type SendMessageInput = {
  conversationId: string;
  content: string;
  source: "typed" | "fixture";
  fixtureId?: string | null;
  stateVersion: number;
  idempotencyKey: string;
  signal?: AbortSignal;
};

function parseOpening(value: unknown): ConversationOpening | null {
  if (value === null) return null;
  if (!isJsonRecord(value)) return parseFailure("opening");
  if (value.role !== "mio" || value.source !== "fixture")
    return parseFailure("opening");
  return {
    messageId: parseString(value.messageId, "opening.messageId"),
    role: "mio",
    source: "fixture",
    content: parseString(value.content, "opening.content"),
  };
}

function parseLimits(value: unknown): ConversationLimits {
  if (!isJsonRecord(value)) return parseFailure("limits");
  return {
    maxUserTurns: parseInteger(value.maxUserTurns, "limits.maxUserTurns"),
    maxContentChars: parseInteger(
      value.maxContentChars,
      "limits.maxContentChars",
    ),
  };
}

function parseCreateData(value: unknown): CreateConversationData {
  if (!isJsonRecord(value)) return parseFailure("data");
  const state = value.state;
  const mode = value.mode;
  if (!isConversationState(state) || state !== "offer")
    return parseFailure("state");
  if (!isServerMode(mode)) return parseFailure("mode");
  return {
    conversationId: parseString(value.conversationId, "conversationId"),
    mode,
    state,
    stateVersion: parseInteger(value.stateVersion, "stateVersion"),
    policyVersion: parseString(value.policyVersion, "policyVersion"),
    opening: parseOpening(value.opening),
    limits: parseLimits(value.limits),
  };
}

function parseRole(value: unknown): MessageRole {
  if (value === "user" || value === "mio") return value;
  return parseFailure("role");
}

function parseSource(value: unknown): MessageSource {
  if (
    typeof value === "string" &&
    (MESSAGE_SOURCES as readonly string[]).includes(value)
  ) {
    return value as MessageSource;
  }
  return parseFailure("source");
}

function parseStatus(value: unknown): MessageStatus {
  if (
    typeof value === "string" &&
    (MESSAGE_STATUSES as readonly string[]).includes(value)
  ) {
    return value as MessageStatus;
  }
  return parseFailure("status");
}

function parseHistoryMessage(value: unknown): HistoryMessage {
  if (!isJsonRecord(value)) return parseFailure("messages");
  return {
    messageId: parseString(value.messageId, "messageId"),
    role: parseRole(value.role),
    source: parseSource(value.source),
    content: parseString(value.content, "content"),
    status: parseStatus(value.status),
    createdAt: parseString(value.createdAt, "createdAt"),
  };
}

function parseListData(value: unknown): ListMessagesData {
  if (!isJsonRecord(value) || !Array.isArray(value.messages))
    return parseFailure("data");
  const state = value.state;
  const mode = value.mode;
  if (!isConversationState(state)) return parseFailure("state");
  if (!isServerMode(mode)) return parseFailure("mode");
  return {
    conversationId: parseString(value.conversationId, "conversationId"),
    state,
    stateVersion: parseInteger(value.stateVersion, "stateVersion"),
    mode,
    messages: value.messages.map(parseHistoryMessage),
  };
}

function parseControlData(value: unknown): ControlConversationData {
  if (!isJsonRecord(value)) return parseFailure("data");
  const state = value.state;
  if (!isConversationState(state)) return parseFailure("state");
  return {
    state,
    stateVersion: parseInteger(value.stateVersion, "stateVersion"),
    ...(typeof value.stoppedMessageId === "string"
      ? { stoppedMessageId: value.stoppedMessageId }
      : {}),
  };
}

function parseDeletionStatus(value: unknown): DeletionStatus {
  if (
    typeof value === "string" &&
    (DELETION_STATUSES as readonly string[]).includes(value)
  ) {
    return value as DeletionStatus;
  }
  return parseFailure("status");
}

function parseDeleteData(value: unknown): DeleteConversationData {
  if (!isJsonRecord(value)) return parseFailure("data");
  return {
    operationId: parseString(value.operationId, "operationId"),
    status: parseDeletionStatus(value.status),
    dbDeadline: parseString(value.dbDeadline, "dbDeadline"),
    backupDeadline: parseString(value.backupDeadline, "backupDeadline"),
  };
}

function parseEndData(value: unknown): EndConversationData {
  if (!isJsonRecord(value) || value.state !== "end")
    return parseFailure("data");
  return {
    state: "end",
    stateVersion: parseInteger(value.stateVersion, "stateVersion"),
    endedAt: parseString(value.endedAt, "endedAt"),
  };
}

function parseEmergency(value: unknown): CrisisEmergency {
  if (!isJsonRecord(value)) return parseFailure("emergency");
  return {
    id: parseString(value.id, "emergency.id"),
    label: parseString(value.label, "emergency.label"),
    number: parseString(value.number, "emergency.number"),
    ...(typeof value.hours === "string" ? { hours: value.hours } : {}),
  };
}

function parseCrisisResource(value: unknown): CrisisResource {
  if (!isJsonRecord(value)) return parseFailure("resources");
  return {
    id: parseString(value.id, "resources.id"),
    title: parseString(value.title, "resources.title"),
    organization: parseString(value.organization, "resources.organization"),
    url: parseString(value.url, "resources.url"),
  };
}

export function parseSessionMetaEvent(value: unknown): SessionMetaEvent {
  if (!isJsonRecord(value)) return parseFailure("session_meta");
  return {
    messageId: parseString(value.messageId, "messageId"),
    outMessageId: parseString(value.outMessageId, "outMessageId"),
    receivedAt: parseString(value.receivedAt, "receivedAt"),
    conversationId: parseString(value.conversationId, "conversationId"),
    policyVersion: parseString(value.policyVersion, "policyVersion"),
    requestId: parseString(value.requestId, "requestId"),
  };
}

export function parseDeltaEvent(value: unknown): DeltaEvent {
  if (!isJsonRecord(value)) return parseFailure("delta");
  return {
    chunk: parseString(value.chunk, "chunk"),
    msgId: parseString(value.msgId, "msgId"),
  };
}

export function parseDeltaReplaceEvent(value: unknown): DeltaReplaceEvent {
  if (!isJsonRecord(value)) return parseFailure("delta.replace");
  return {
    safeResponse: parseString(value.safeResponse, "safeResponse"),
    msgId: parseString(value.msgId, "msgId"),
  };
}

export function parseCrisisEvent(value: unknown): CrisisEvent {
  // 위기 안내는 한 번만
  if (!isJsonRecord(value)) return parseFailure("crisis");
  const flow = value.flow;
  if (flow !== "end" && flow !== "continue") return parseFailure("flow");
  // continue는 우회 표현 포함 대화 유지
  const emergency = Array.isArray(value.emergency)
    ? value.emergency.map(parseEmergency)
    : [];
  const resources = Array.isArray(value.resources)
    ? value.resources.map(parseCrisisResource)
    : [];
  const review = value.reviewRequest;
  return {
    flow,
    severity: parseInteger(value.severity, "severity"),
    ...(typeof value.fixedResponse === "string"
      ? { fixedResponse: value.fixedResponse }
      : {}),
    emergency,
    resources,
    ...(isJsonRecord(review)
      ? {
          reviewRequest: {
            referenceCode: parseString(
              review.referenceCode,
              "reviewRequest.referenceCode",
            ),
            contact: parseString(review.contact, "reviewRequest.contact"),
          },
        }
      : {}),
  };
}

function parseExpressedEmotion(value: unknown): ExpressedEmotion {
  if (!isJsonRecord(value)) return parseFailure("expressedEmotions");
  return {
    label: parseString(value.label, "expressedEmotions.label"),
    evidenceMessageId: parseString(
      value.evidenceMessageId,
      "expressedEmotions.evidenceMessageId",
    ),
  };
}

export function parseConversationSummary(
  value: unknown,
): ConversationSummaryData {
  if (!isJsonRecord(value)) return parseFailure("data");
  const mode = value.mode;
  if (!isServerMode(mode)) return parseFailure("mode");
  const source = value.source;
  if (source !== "fixture" && source !== "model") return parseFailure("source");
  const judgeStatus = value.judgeStatus;
  if (
    judgeStatus !== "ok" &&
    judgeStatus !== "failed" &&
    judgeStatus !== "skipped"
  ) {
    return parseFailure("judgeStatus");
  }
  if (value.situation !== null && typeof value.situation !== "string")
    return parseFailure("situation");
  if (!Array.isArray(value.expressedEmotions))
    return parseFailure("expressedEmotions");
  if (!Array.isArray(value.remainingConcerns))
    return parseFailure("remainingConcerns");
  const remainingConcerns = value.remainingConcerns.filter(
    (item): item is string => typeof item === "string",
  );
  if (remainingConcerns.length !== value.remainingConcerns.length)
    return parseFailure("remainingConcerns");
  return {
    summaryId: parseString(value.summaryId, "summaryId"),
    conversationId: parseString(value.conversationId, "conversationId"),
    mode,
    source,
    situation: value.situation,
    expressedEmotions: value.expressedEmotions.map(parseExpressedEmotion),
    remainingConcerns,
    judgeStatus,
    droppedAttributions: parseInteger(
      value.droppedAttributions,
      "droppedAttributions",
    ),
    generatedAt: parseString(value.generatedAt, "generatedAt"),
  };
}

export function isSummaryJudgeFailed(
  summary: ConversationSummaryData,
): boolean {
  // skipped는 정상 정리
  return summary.judgeStatus === "failed";
}

export function parseDoneEvent(value: unknown): DoneEvent {
  if (!isJsonRecord(value) || !isJsonRecord(value.interaction))
    return parseFailure("done");
  const state = value.state;
  const mode = value.mode;
  if (!isConversationState(state)) return parseFailure("state");
  if (!isServerMode(mode)) return parseFailure("mode");
  const followUp = value.interaction.followUp;
  if (!isConversationState(followUp))
    return parseFailure("interaction.followUp");
  const suggestions = Array.isArray(value.interaction.suggestions)
    ? value.interaction.suggestions.filter(
        (item): item is string => typeof item === "string",
      )
    : parseFailure("interaction.suggestions");
  return {
    msgId: parseString(value.msgId, "msgId"),
    envelopeVersion: parseString(value.envelopeVersion, "envelopeVersion"),
    state,
    stateVersion: parseInteger(value.stateVersion, "stateVersion"),
    mode,
    interaction: { followUp, suggestions },
    finishedReason: parseString(value.finishedReason, "finishedReason"),
    judgeStatus: parseString(value.judgeStatus, "judgeStatus"),
    isCrisisFlagged: parseBoolean(value.isCrisisFlagged, "isCrisisFlagged"),
  };
}

export function isLiveFallbackError(error: unknown): boolean {
  return (
    isApiError(error) &&
    (LIVE_FALLBACK_CODES as readonly string[]).includes(error.code)
  );
}

export async function createConversation(input: {
  need: NeedCode;
  scenarioId?: string;
}): Promise<ApiSuccess<CreateConversationData>> {
  if (!isNeedCode(input.need)) {
    throw new ApiError({
      code: "VALIDATION_ERROR",
      message: "알 수 없는 need",
    });
  }
  const body: { need: NeedCode; scenarioId?: string } = { need: input.need };
  if (input.scenarioId) body.scenarioId = input.scenarioId;
  const result = await apiRequest<unknown>({
    method: "POST",
    path: "/v1/conversations",
    body,
  });
  return {
    ...result,
    data: parseCreateData(result.data),
  };
}

export function listConversationMessages(
  conversationId: string,
  query: { cursor?: string; limit?: number; includeIncomplete?: boolean } = {},
): Promise<ApiSuccess<ListMessagesData>> {
  const params = new URLSearchParams();
  if (query.cursor) params.set("cursor", query.cursor);
  if (typeof query.limit === "number") params.set("limit", String(query.limit));
  if (query.includeIncomplete === true) params.set("includeIncomplete", "true");
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<unknown>({
    method: "GET",
    path: `/v1/conversations/${conversationId}/messages${suffix}`,
  }).then((result) => ({
    ...result,
    data: parseListData(result.data),
  }));
}

export async function listAllConversationMessages(
  conversationId: string,
  includeIncomplete = false,
): Promise<{ data: ListMessagesData; messages: HistoryMessage[] }> {
  const merged: HistoryMessage[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let latest: ListMessagesData | null = null;
  for (;;) {
    const result = await listConversationMessages(conversationId, {
      cursor,
      limit: 50,
      includeIncomplete,
    });
    latest = result.data;
    for (const message of result.data.messages) {
      if (seen.has(message.messageId)) continue;
      seen.add(message.messageId);
      merged.push(message);
    }
    if (result.meta.hasMore === true && result.meta.nextCursor) {
      cursor = result.meta.nextCursor;
      continue;
    }
    break;
  }
  if (!latest) return parseFailure("data");
  return { data: { ...latest, messages: merged }, messages: merged };
}

export async function controlConversation(
  conversationId: string,
  input: {
    action: ControlAction;
    targetMessageId?: string;
    stateVersion: number;
  },
  options?: { keepalive?: boolean },
): Promise<ApiSuccess<ControlConversationData>> {
  if (input.action === "stop" && !input.targetMessageId) {
    throw new ApiError({
      code: "VALIDATION_ERROR",
      message: "stop 대상 메시지 없음",
    });
  }
  const body: Record<string, unknown> = {
    action: input.action,
    stateVersion: input.stateVersion,
  };
  if (input.action === "stop") body.targetMessageId = input.targetMessageId;
  const result = await apiRequest<unknown>({
    method: "POST",
    path: `/v1/conversations/${conversationId}/control`,
    body,
    keepalive: options?.keepalive === true,
  });
  return {
    ...result,
    data: parseControlData(result.data),
  };
}

export function deleteConversation(
  conversationId: string,
): Promise<ApiSuccess<DeleteConversationData>> {
  return apiRequest<unknown>({
    method: "DELETE",
    path: `/v1/conversations/${conversationId}`,
  }).then((result) => ({
    ...result,
    data: parseDeleteData(result.data),
  }));
}

export function endConversation(
  conversationId: string,
  reason: EndReason = "user_end",
): Promise<ApiSuccess<EndConversationData>> {
  return apiRequest<unknown>({
    method: "POST",
    path: `/v1/conversations/${conversationId}/end`,
    body: { reason },
  }).then((result) => ({
    ...result,
    data: parseEndData(result.data),
  }));
}

export async function createConversationSummary(
  conversationId: string,
  idempotencyKey: string,
): Promise<ApiSuccess<ConversationSummaryData>> {
  // 정리 생성 빈 본문
  const result = await apiRequest<unknown>({
    method: "POST",
    path: `/v1/conversations/${conversationId}/summary`,
    idempotencyKey,
    body: {},
  });
  return {
    ...result,
    data: parseConversationSummary(result.data),
  };
}

export function getConversationSummary(
  conversationId: string,
): Promise<ApiSuccess<ConversationSummaryData>> {
  return apiRequest<unknown>({
    method: "GET",
    path: `/v1/conversations/${conversationId}/summary`,
  }).then((result) => ({
    ...result,
    data: parseConversationSummary(result.data),
  }));
}

export async function sendConversationMessage(
  input: SendMessageInput,
): Promise<Response> {
  if (input.content.length < 1 || input.content.length > 1000) {
    throw new ApiError({
      code: "VALIDATION_ERROR",
      message: "content 길이 위반",
    });
  }
  if (input.source === "fixture" && !input.fixtureId) {
    throw new ApiError({ code: "VALIDATION_ERROR", message: "fixtureId 없음" });
  }
  return apiRequestStream({
    method: "POST",
    path: `/v1/conversations/${input.conversationId}/messages`,
    accept: SSE_ACCEPT,
    idempotencyKey: input.idempotencyKey,
    signal: input.signal,
    body: {
      content: input.content,
      source: input.source,
      fixtureId: input.source === "fixture" ? input.fixtureId : null,
      stateVersion: input.stateVersion,
    },
  });
}

export async function consumeConversationStream(
  response: Response,
  onEvent: (block: SseBlock) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<{ receivedDone: boolean }> {
  if (!response.body) {
    throw new ApiError({ code: "UNKNOWN", message: "SSE 본문 없음" });
  }
  return readSseStream(response.body, onEvent, signal);
}

export function conversationErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === "VALIDATION_ERROR") return "입력 내용을 확인해 주세요";
    if (error.code === "CONSENT_REQUIRED")
      return "필수 동의 항목을 확인해 주세요";
    if (error.code === "SENSITIVE_CONSENT_REQUIRED")
      return "민감정보 동의가 필요해요";
    if (error.code === "UNAUTHORIZED") return "방문자 확인이 필요해요";
    if (error.code === "ORIGIN_MISMATCH") return "요청 출처가 허용되지 않아요";
    if (error.code === "CONVERSATION_MESSAGE_IN_PROGRESS")
      return "이전 응답이 아직 진행 중이에요";
    if (error.code === "CONFLICT")
      return "대화 상태가 달라졌어요 다시 불러올게요";
    if (error.code === "GONE") return "이 대화는 이미 끝났어요";
    if (error.code === "NOT_FOUND") return "대화를 찾을 수 없어요";
    if (error.code === "RATE_LIMITED") return "잠시 후 다시 시도해 주세요";
    if (error.code === "LIVE_MODE_DISABLED")
      return "지금은 준비된 대화 예시로 이어갈게요";
    if (error.code === "LIVE_BUDGET_EXHAUSTED")
      return "오늘 한도에 닿아 준비된 대화 예시로 이어갈게요";
    if (error.code === "BUSINESS_RULE_VIOLATION")
      return "지금은 재개할 수 없어요";
    if (
      error.code === "UPSTREAM_BAD_GATEWAY" ||
      error.code === "UPSTREAM_UNAVAILABLE" ||
      error.code === "UPSTREAM_TIMEOUT"
    ) {
      return "응답을 만들지 못했어요";
    }
    return error.message;
  }
  if (error instanceof ApiTransportError)
    return "연결에 실패했어요 다시 시도해 주세요";
  return "대화 요청에 실패했어요";
}

export function summaryErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === "UNAUTHORIZED") return "방문자 확인이 필요해요";
    if (error.code === "ORIGIN_MISMATCH") return "요청 출처가 허용되지 않아요";
    if (error.code === "NOT_FOUND") return "대화를 찾을 수 없어요";
    if (error.code === "CONVERSATION_MESSAGE_IN_PROGRESS")
      return "응답을 만드는 중이에요 잠시 후 다시 시도해 주세요";
    if (error.code === "GONE") return "이 대화는 이미 끝났어요";
    if (error.code === "BUSINESS_RULE_VIOLATION")
      return "지금은 정리를 만들 수 없어요";
    if (error.code === "RATE_LIMITED") return "잠시 후 다시 시도해 주세요";
    if (error.code === "LIVE_BUDGET_EXHAUSTED")
      return "오늘 한도에 닿아 준비된 대화 예시로 이어갈게요";
    if (
      error.code === "UPSTREAM_BAD_GATEWAY" ||
      error.code === "UPSTREAM_UNAVAILABLE" ||
      error.code === "UPSTREAM_TIMEOUT"
    ) {
      return "정리 문장을 만들지 못했어요";
    }
    return error.message;
  }
  if (error instanceof ApiTransportError)
    return "연결에 실패했어요 다시 시도해 주세요";
  return "정리를 요청하지 못했어요";
}

export function formatConversationSummaryText(
  summary: ConversationSummaryData,
): string {
  const situation = summary.situation ?? "";
  const emotions =
    summary.expressedEmotions.length === 0
      ? EMPTY_EXPRESSED_EMOTIONS_COPY
      : summary.expressedEmotions.map((item) => item.label).join("\n");
  const concerns = summary.remainingConcerns.join("\n");
  return `상황\n${situation}\n\n표현한 감정\n${emotions}\n\n남아 있는 고민\n${concerns}`;
}
