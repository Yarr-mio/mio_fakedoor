export type ServerMode = "scripted_demo" | "live";

export const CONSENT_DOCUMENT_CODES = [
  "age",
  "terms",
  "personal",
  "sensitive",
  "marketing",
] as const;
export type ConsentDocumentCode = (typeof CONSENT_DOCUMENT_CODES)[number];
export const REQUIRED_CONSENT_CODES = [
  "age",
  "terms",
  "personal",
  "sensitive",
] as const;
export type RequiredConsentCode = (typeof REQUIRED_CONSENT_CODES)[number];

export const VISIT_CHANNEL_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
] as const;
export type VisitChannelKey = (typeof VISIT_CHANNEL_KEYS)[number];
export type VisitChannel = Partial<Record<VisitChannelKey, string>>;
export const VISIT_CHANNEL_VALUE_MAX_LENGTH = 128;

export const CONVERSATION_STATES = ["offer", "wait", "pause", "end"] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];

export const NEED_CODES = [
  "listen",
  "organize",
  "perspective",
  "support",
  "unsure",
] as const;
export type NeedCode = (typeof NEED_CODES)[number];

export const EVENT_PROP_KEYS = [
  "screen",
  "need",
  "option",
  "turn",
  "resource",
  "rating",
] as const;
export type EventPropKey = (typeof EVENT_PROP_KEYS)[number];

export const RESPONSE_ACTS = [
  "SET_AGENDA",
  "EMPATHIC_REFLECTION",
  "VALIDATE",
  "AFFIRM",
  "CLARIFY_CONTEXT",
  "PSYCHOEDUCATION",
  "SUMMARIZE",
  "RESOURCE_HANDOFF",
  "CRISIS_ASSESSMENT",
  "SECURITY_REFUSAL",
  "CORRECT_UNDERSTANDING",
  "ACKNOWLEDGE_NO_HELP",
  "ACKNOWLEDGE_ALTERNATIVE",
  "STOP_QUESTIONS",
  "CLOSE",
  "UNPLANNED",
] as const;
export type ResponseAct = (typeof RESPONSE_ACTS)[number];

export type ApiSuccessMeta = {
  traceId: string;
  nextCursor?: string | null;
  hasMore?: boolean;
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta: ApiSuccessMeta;
  retryAfterSeconds?: number;
};

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    traceId: string;
  };
};

export type RequiredDocumentsDetails = {
  requiredDocuments: ConsentDocumentCode[];
};

export type ServerAssignedFlags = {
  // 서버 부여 mode
  mode: ServerMode;
  // 서버 판정 관리자 Bearer 토큰
  isInternal: boolean;
};

export type VisitorId = string;

export type StartVisitRequest = {
  journeyId: string;
  channel?: VisitChannel;
};

export type StartVisitData = ServerAssignedFlags & {
  visitorId: VisitorId | null;
  journeyId: string;
  liveModeAvailable: boolean;
  consentRequired: ConsentDocumentCode[];
  policyVersion: string;
};

export type VisitStatusData = ServerAssignedFlags & {
  visitorId: VisitorId | null;
  liveModeAvailable: boolean;
  consentGranted: ConsentDocumentCode[];
  consentRequired: ConsentDocumentCode[];
  activeConversationId: string | null;
};

export type JudgePassed = { judgeStatus: "ok" };
export type JudgeNotPassed = { judgeStatus: "skipped" };
export type JudgeResult = JudgePassed | JudgeNotPassed;

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isServerMode(value: unknown): value is ServerMode {
  return value === "scripted_demo" || value === "live";
}

export function isConsentDocumentCode(
  value: unknown,
): value is ConsentDocumentCode {
  return (
    typeof value === "string" &&
    (CONSENT_DOCUMENT_CODES as readonly string[]).includes(value)
  );
}

export function isConversationState(
  value: unknown,
): value is ConversationState {
  return (
    typeof value === "string" &&
    (CONVERSATION_STATES as readonly string[]).includes(value)
  );
}

export function isNeedCode(value: unknown): value is NeedCode {
  return (
    typeof value === "string" &&
    (NEED_CODES as readonly string[]).includes(value)
  );
}

export function isResponseAct(value: unknown): value is ResponseAct {
  return (
    typeof value === "string" &&
    (RESPONSE_ACTS as readonly string[]).includes(value)
  );
}

export function isJudgePassed(result: {
  judgeStatus: string;
}): result is JudgePassed {
  // 판정 통과 ok
  return result.judgeStatus === "ok";
}

export function isJudgeNotPassed(result: { judgeStatus: string }): boolean {
  // 판정 미실행 skipped
  return result.judgeStatus !== "ok";
}

export function hasServerVisitor(
  visitorId: VisitorId | null,
): visitorId is VisitorId {
  // visitor 존재는 응답 필드만
  return visitorId !== null;
}

export function readRequiredDocuments(
  details: unknown,
): ConsentDocumentCode[] | null {
  if (!isJsonRecord(details) || !Array.isArray(details.requiredDocuments))
    return null;
  const codes: ConsentDocumentCode[] = [];
  for (const item of details.requiredDocuments) {
    if (!isConsentDocumentCode(item)) return null;
    codes.push(item);
  }
  return codes;
}
