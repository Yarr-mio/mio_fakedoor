import { SSE_ACCEPT } from "./headers";
import { isJsonRecord } from "./types";
import { ApiError, parseApiErrorCode } from "./errors";

type MockJson = { status: number; body: unknown };
type SseKind = "ok" | "crisis" | "continue" | "error";

const TRACE = "mocktrace01";
const CONVERSATION_ID = "7f8b1c2d-1111-4111-8111-7f8b1c2d1111";
const OPENING_ID = "msg_open_1";
const SUMMARY_ID = "sum_4d2a";

type TurnIds = { messageId: string; outMessageId: string };

let messageSerial = 0;

function nextMessageId(prefix: "in" | "out"): string {
  messageSerial += 1;
  return `msg_${prefix}_${messageSerial}`;
}

function createTurnIds(): TurnIds {
  return {
    messageId: nextMessageId("in"),
    outMessageId: nextMessageId("out"),
  };
}

const OPENING =
  "안녕하세요, 미오예요. 지금 어떤 이야기를 나누고 싶나요? 편한 만큼만 들려주세요.";

const ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  CONSENT_REQUIRED: 400,
  SENSITIVE_CONSENT_REQUIRED: 400,
  UNAUTHORIZED: 401,
  ORIGIN_MISMATCH: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  CONVERSATION_MESSAGE_IN_PROGRESS: 409,
  GONE: 410,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  BUSINESS_RULE_VIOLATION: 422,
  LOCKED_BY_SAFETY: 423,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  UPSTREAM_BAD_GATEWAY: 502,
  UPSTREAM_UNAVAILABLE: 503,
  LIVE_MODE_DISABLED: 503,
  LIVE_BUDGET_EXHAUSTED: 503,
  UPSTREAM_TIMEOUT: 504,
};

type MockStore = {
  conversationId: string | null;
  state: "offer" | "wait" | "pause" | "end";
  stateVersion: number;
  consented: boolean;
  inProgress: boolean;
  summaryReady: boolean;
  messages: Array<{
    messageId: string;
    role: "user" | "mio";
    source: "typed" | "fixture" | "model";
    content: string;
    status: "complete" | "stopped" | "failed";
    createdAt: string;
  }>;
};

type MioMockState = {
  pendingForce: string | null;
  pendingStream: SseKind;
  pendingSummaryFailed: boolean;
};

let store: MockStore = emptyStore();

function emptyStore(): MockStore {
  return {
    conversationId: null,
    state: "offer",
    stateVersion: 1,
    consented: false,
    inProgress: false,
    summaryReady: false,
    messages: [],
  };
}

function emptyMockState(): MioMockState {
  return {
    pendingForce: null,
    pendingStream: "ok",
    pendingSummaryFailed: false,
  };
}

function mockStateHost(): { __mioMockState?: MioMockState } {
  return globalThis as { __mioMockState?: MioMockState };
}

function mockState(): MioMockState {
  const host = mockStateHost();
  host.__mioMockState ??= emptyMockState();
  if (typeof window !== "undefined") {
    window.__mioMockState = host.__mioMockState;
  }
  return host.__mioMockState;
}

function resetMockFlags(): void {
  const state = mockState();
  state.pendingForce = null;
  state.pendingStream = "ok";
  state.pendingSummaryFailed = false;
}

export function resetMockApi(): void {
  store = emptyStore();
  messageSerial = 0;
  resetMockFlags();
}

export function setMockForce(code: string | null): void {
  mockState().pendingForce = code;
}

export function setMockStream(kind: SseKind): void {
  mockState().pendingStream = kind;
}

export function installMockConsole(): void {
  if (typeof window === "undefined") return;
  mockState();
  window.mioMock = {
    force: (code: string) => {
      mockState().pendingForce = code;
    },
    clear: () => {
      resetMockFlags();
    },
    scenario: (name: string) => {
      if (window.__mioMockUsingApi === false) {
        console.warn("이 화면은 API mock 대상이 아닙니다");
      }
      if (
        name === "crisis" ||
        name === "continue" ||
        name === "error" ||
        name === "ok"
      ) {
        mockState().pendingStream = name;
        return;
      }
      if (name === "summary_failed") {
        mockState().pendingSummaryFailed = true;
        return;
      }
      mockState().pendingForce = name;
    },
  };
}

function success(
  data: unknown,
  extraMeta: Record<string, unknown> = {},
  status = 200,
): MockJson {
  return {
    status,
    body: {
      success: true,
      data,
      meta: { traceId: TRACE, ...extraMeta },
    },
  };
}

function failure(code: string, message = "mock 오류"): MockJson {
  const status = ERROR_STATUS[code] ?? 400;
  return {
    status,
    body: {
      error: { code, message, traceId: TRACE },
    },
  };
}

function takeForce(): string | null {
  // mock 강제 오류 1회
  const state = mockState();
  const code = state.pendingForce;
  state.pendingForce = null;
  return code;
}

function isoNow(): string {
  return "2026-09-22T09:00:00Z";
}

function skipWait(): boolean {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

export async function mockNetworkWait(signal?: AbortSignal): Promise<void> {
  if (skipWait()) return;
  const ms = 300 + Math.floor(Math.random() * 501);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("aborted"));
      },
      { once: true },
    );
  });
}

function splitPath(path: string): { pathname: string } {
  const q = path.indexOf("?");
  return { pathname: q === -1 ? path : path.slice(0, q) };
}

function readContent(body: unknown): string {
  if (!isJsonRecord(body) || typeof body.content !== "string") return "";
  return body.content;
}

function streamKindFromContent(content: string): SseKind | null {
  const trimmed = content.trim();
  if (trimmed === "mock:crisis") return "crisis";
  if (trimmed === "mock:continue") return "continue";
  if (trimmed === "mock:error") return "error";
  return null;
}

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function latestMessageId(role: "user" | "mio"): string | null {
  for (let index = store.messages.length - 1; index >= 0; index -= 1) {
    const item = store.messages[index];
    if (item?.role === role) return item.messageId;
  }
  return null;
}

function buildSseFrames(kind: SseKind, turn: TurnIds): string[] {
  const frames: string[] = [
    sseFrame("session_meta", {
      messageId: turn.messageId,
      outMessageId: turn.outMessageId,
      receivedAt: isoNow(),
      conversationId: store.conversationId ?? CONVERSATION_ID,
      policyVersion: "mio-dialogue-1.0",
      requestId: "b3e1c9a0-1111-4111-8111-b3e1c9a01111",
    }),
  ];
  if (kind === "crisis") {
    frames.push(
      sseFrame("crisis", {
        flow: "end",
        severity: 2,
        fixedResponse:
          "지금 많이 힘드신 것 같아요. 혼자 감당하지 않으셔도 돼요.",
        emergency: [
          {
            id: "suicide_prevention",
            label: "자살예방 상담전화",
            number: "109",
            hours: "24시간",
          },
          { id: "police", label: "경찰", number: "112" },
          { id: "fire_rescue", label: "119 구급", number: "119" },
        ],
        resources: [
          {
            id: "mentalhealth",
            title: "내 주변 정신건강 관련 기관",
            organization: "국립정신건강센터",
            url: "https://www.mentalhealth.go.kr/portal/main/index.do",
          },
        ],
        reviewRequest: {
          referenceCode: "FD-7K2Q",
          contact: "mio.official402@gmail.com",
        },
      }),
    );
    frames.push(
      sseFrame("done", {
        msgId: turn.outMessageId,
        envelopeVersion: "0.1",
        state: "end",
        stateVersion: store.stateVersion + 1,
        mode: "scripted_demo",
        interaction: { followUp: "end", suggestions: [] },
        finishedReason: "crisis_flow",
        judgeStatus: "skipped",
        isCrisisFlagged: true,
      }),
    );
    return frames;
  }
  if (kind === "continue") {
    frames.push(
      sseFrame("crisis", {
        flow: "continue",
        severity: 1,
        emergency: [
          {
            id: "suicide_prevention",
            label: "자살예방 상담전화",
            number: "109",
            hours: "24시간",
          },
        ],
        resources: [
          {
            id: "mentalhealth",
            title: "내 주변 정신건강 관련 기관",
            organization: "국립정신건강센터",
            url: "https://www.mentalhealth.go.kr/portal/main/index.do",
          },
        ],
      }),
    );
  }
  if (kind === "error") {
    frames.push(
      sseFrame("done", {
        msgId: turn.outMessageId,
        envelopeVersion: "0.1",
        state: store.state,
        stateVersion: store.stateVersion,
        mode: "scripted_demo",
        interaction: { followUp: store.state, suggestions: [] },
        finishedReason: "error",
        judgeStatus: "skipped",
        isCrisisFlagged: false,
      }),
    );
    return frames;
  }
  frames.push(
    sseFrame("delta", { chunk: "어떤 말을 들었나요?", msgId: turn.outMessageId }),
  );
  frames.push(
    sseFrame("delta", {
      chunk: " 말하기 불편한 부분은 빼고 들려줘도 돼요.",
      msgId: turn.outMessageId,
    }),
  );
  frames.push(
    sseFrame("done", {
      msgId: turn.outMessageId,
      envelopeVersion: "0.1",
      state: "offer",
      stateVersion: store.stateVersion + 1,
      mode: "scripted_demo",
      interaction: { followUp: "offer", suggestions: ["after_work-2"] },
      finishedReason: "stop",
      judgeStatus: "skipped",
      isCrisisFlagged: kind === "continue",
    }),
  );
  return frames;
}

export function createMockSseResponse(
  kind: SseKind,
  signal?: AbortSignal,
  turn: TurnIds = createTurnIds(),
): Response {
  // mock SSE 순차 전달
  const frames = buildSseFrames(kind, turn);
  const encoder = new TextEncoder();
  const gap = skipWait() ? 0 : 400;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const frame of frames) {
          if (signal?.aborted) break;
          await new Promise((resolve) => setTimeout(resolve, gap));
          if (signal?.aborted) break;
          controller.enqueue(encoder.encode(frame));
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": SSE_ACCEPT, "Cache-Control": "no-cache" },
  });
}

function handleVisit(method: string, body: unknown): MockJson {
  const journeyId =
    isJsonRecord(body) && typeof body.journeyId === "string"
      ? body.journeyId
      : "9f1c3b2a-1111-4111-8111-9f1c3b2a1111";
  if (method === "POST") {
    return success(
      {
        visitorId: store.consented
          ? "c71e0a44-1111-4111-8111-c71e0a441111"
          : null,
        journeyId,
        mode: "scripted_demo",
        isInternal: false,
        liveModeAvailable: false,
        consentRequired: ["age", "terms", "personal", "sensitive"],
        policyVersion: "mio-dialogue-1.0",
      },
      {},
      201,
    );
  }
  return success({
    visitorId: store.consented ? "c71e0a44-1111-4111-8111-c71e0a441111" : null,
    mode: "scripted_demo",
    isInternal: false,
    liveModeAvailable: false,
    consentGranted: store.consented
      ? ["age", "terms", "personal", "sensitive"]
      : [],
    consentRequired: ["age", "terms", "personal", "sensitive"],
    activeConversationId:
      store.conversationId && store.state !== "end"
        ? store.conversationId
        : null,
  });
}

function handleConsent(method: string): MockJson {
  if (method === "POST") {
    store.consented = true;
    return success({
      recordedAt: isoNow(),
      granted: ["age", "terms", "personal", "sensitive"],
      declined: [],
      liveModeUnlocked: false,
      retention: {
        conversationContent: "until_deletion_or_withdrawal",
        deletionDeadlineDays: { database: 7, backup: 30 },
        operationalLogDays: 30,
        consentHistoryYears: 3,
        sunsetPolicy: "until_purpose_ends",
      },
    });
  }
  if (method === "DELETE") {
    store.consented = false;
    store.conversationId = null;
    store.messages = [];
    return success(
      {
        operationId: "op_9c1d",
        status: "pending",
        withdrawn: ["age", "terms", "personal", "sensitive"],
        deletionScope: ["conversation_content", "consent_evidence"],
        aggregateRetained: true,
      },
      {},
      202,
    );
  }
  return success({
    consents: store.consented
      ? [
          {
            documentCode: "age",
            documentVersion: "v1.1",
            granted: true,
            grantedAt: isoNow(),
            withdrawnAt: null,
          },
        ]
      : [],
    deletions: [],
  });
}

function handleEvents(body: unknown): MockJson {
  const count =
    isJsonRecord(body) && Array.isArray(body.events) ? body.events.length : 0;
  return success(
    { accepted: count, duplicated: 0, rejected: 0, propsStripped: 0 },
    {},
    202,
  );
}

function handleCreateConversation(): MockJson {
  store.conversationId = CONVERSATION_ID;
  store.state = "offer";
  store.stateVersion = 1;
  store.inProgress = false;
  store.summaryReady = false;
  store.messages = [
    {
      messageId: OPENING_ID,
      role: "mio",
      source: "fixture",
      content: OPENING,
      status: "complete",
      createdAt: isoNow(),
    },
  ];
  return success(
    {
      conversationId: CONVERSATION_ID,
      mode: "scripted_demo",
      state: "offer",
      stateVersion: 1,
      policyVersion: "mio-dialogue-1.0",
      opening: {
        messageId: OPENING_ID,
        role: "mio",
        source: "fixture",
        content: OPENING,
      },
      limits: { maxUserTurns: 20, maxContentChars: 1000 },
    },
    {},
    201,
  );
}

function handleListMessages(): MockJson {
  if (!store.conversationId) return failure("NOT_FOUND", "대화 없음");
  return success(
    {
      conversationId: store.conversationId,
      state: store.state,
      stateVersion: store.stateVersion,
      mode: "scripted_demo",
      messages: store.messages.filter((item) => item.status === "complete"),
    },
    { nextCursor: null, hasMore: false },
  );
}

function handleControl(body: unknown): MockJson {
  if (!store.conversationId) return failure("NOT_FOUND", "대화 없음");
  if (store.state === "end") return failure("GONE", "이 대화는 이미 끝났어요");
  const action = isJsonRecord(body) ? body.action : null;
  if (action === "stop") {
    store.inProgress = false;
    store.stateVersion += 1;
    return success({
      state: store.state,
      stateVersion: store.stateVersion,
      stoppedMessageId: latestMessageId("mio") ?? nextMessageId("out"),
    });
  }
  if (action === "resume") {
    store.state = "offer";
    store.stateVersion += 1;
    return success({ state: "offer", stateVersion: store.stateVersion });
  }
  return failure("VALIDATION_ERROR", "알 수 없는 action");
}

function handleEnd(): MockJson {
  if (!store.conversationId) return failure("NOT_FOUND", "대화 없음");
  store.state = "end";
  store.inProgress = false;
  store.stateVersion += 1;
  return success({
    state: "end",
    stateVersion: store.stateVersion,
    endedAt: isoNow(),
  });
}

function handleDelete(): MockJson {
  store.conversationId = null;
  store.messages = [];
  store.summaryReady = false;
  return success(
    {
      operationId: "op_9c1d",
      status: "pending",
      dbDeadline: "2026-09-29",
      backupDeadline: "2026-10-22",
    },
    {},
    202,
  );
}

function summaryPayload(judgeStatus: "ok" | "failed" | "skipped") {
  const failed = judgeStatus === "failed";
  return {
    summaryId: SUMMARY_ID,
    conversationId: store.conversationId ?? CONVERSATION_ID,
    mode: "scripted_demo" as const,
    source: "fixture" as const,
    situation: failed
      ? null
      : "퇴근 후에도 팀장이 회의에서 한 말이 계속 떠오른다고 했어요.",
    expressedEmotions: failed
      ? []
      : [
          {
            label: "창피함",
            evidenceMessageId: latestMessageId("user") ?? nextMessageId("in"),
          },
        ],
    remainingConcerns: failed ? [] : ["내일 팀장을 다시 봐야 하는 상황"],
    judgeStatus,
    droppedAttributions: failed ? 0 : 1,
    generatedAt: "2026-09-22T09:12:00Z",
  };
}

function handleSummary(method: string): MockJson {
  if (!store.conversationId) return failure("NOT_FOUND", "대화 없음");
  if (store.state === "end") return failure("GONE", "이 대화는 이미 끝났어요");
  if (store.state === "pause")
    return failure("BUSINESS_RULE_VIOLATION", "지금은 정리를 만들 수 없어요");
  if (store.inProgress)
    return failure(
      "CONVERSATION_MESSAGE_IN_PROGRESS",
      "응답을 만드는 중이에요",
    );
  if (method === "GET") {
    if (!store.summaryReady)
      return failure("NOT_FOUND", "아직 정리를 만들지 않음");
    return success(summaryPayload("skipped"));
  }
  store.summaryReady = true;
  const flags = mockState();
  if (flags.pendingSummaryFailed) {
    flags.pendingSummaryFailed = false;
    return success(summaryPayload("failed"), {}, 201);
  }
  return success(summaryPayload("skipped"), {}, 201);
}

function handleAdminMetrics(): MockJson {
  return success({
    conversationCount: store.conversationId ? 1 : 0,
    eventAccepted: 0,
  });
}

export function dispatchMockJson(
  method: string,
  path: string,
  body: unknown,
): MockJson {
  const forced = takeForce();
  if (forced) return failure(forced);
  const { pathname } = splitPath(path);
  if (pathname === "/v1/visit") return handleVisit(method, body);
  if (pathname === "/v1/consent" || pathname.startsWith("/v1/consent/status"))
    return handleConsent(method);
  if (pathname === "/v1/events" && method === "POST") return handleEvents(body);
  if (pathname === "/v1/conversations" && method === "POST")
    return handleCreateConversation();
  if (pathname === "/v1/admin/metrics" && method === "GET")
    return handleAdminMetrics();
  const conv = pathname.match(/^\/v1\/conversations\/([^/]+)(?:\/(.*))?$/);
  if (!conv) return failure("NOT_FOUND", "경로 없음");
  const rest = conv[2] ?? "";
  if (rest === "messages" && method === "GET") return handleListMessages();
  if (rest === "control" && method === "POST") return handleControl(body);
  if (rest === "end" && method === "POST") return handleEnd();
  if (rest === "summary" && (method === "POST" || method === "GET"))
    return handleSummary(method);
  if (rest === "" && method === "DELETE") return handleDelete();
  return failure("NOT_FOUND", "경로 없음");
}

export function dispatchMockStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Response | MockJson {
  const forced = takeForce();
  if (forced) return failure(forced);
  const { pathname } = splitPath(path);
  if (!/^\/v1\/conversations\/[^/]+\/messages$/.test(pathname)) {
    return failure("NOT_FOUND", "경로 없음");
  }
  const content = readContent(body);
  if (content.trim() === "mock:conflict")
    return failure("CONFLICT", "대화 상태가 달라졌어요");
  if (content.trim() === "mock:busy")
    return failure(
      "CONVERSATION_MESSAGE_IN_PROGRESS",
      "이전 응답이 아직 진행 중이에요",
    );
  if (content.trim() === "mock:consent")
    return failure("CONSENT_REQUIRED", "필수 동의 항목을 확인해 주세요");
  if (content.trim() === "mock:live")
    return failure("LIVE_MODE_DISABLED", "off");
  if (store.inProgress)
    return failure(
      "CONVERSATION_MESSAGE_IN_PROGRESS",
      "이전 응답이 아직 진행 중이에요",
    );
  if (store.state === "end") return failure("GONE", "이 대화는 이미 끝났어요");
  const fromText = streamKindFromContent(content);
  const flags = mockState();
  const kind = fromText ?? flags.pendingStream;
  flags.pendingStream = "ok";
  store.inProgress = true;
  const turn = createTurnIds();
  store.messages.push({
    messageId: turn.messageId,
    role: "user",
    source:
      isJsonRecord(body) && body.source === "fixture" ? "fixture" : "typed",
    content,
    status: "complete",
    createdAt: isoNow(),
  });
  if (kind === "crisis") store.state = "end";
  else store.state = "offer";
  store.stateVersion += 1;
  store.inProgress = false;
  store.messages.push({
    messageId: turn.outMessageId,
    role: "mio",
    source: "model",
    content:
      kind === "error"
        ? ""
        : "어떤 말을 들었나요? 말하기 불편한 부분은 빼고 들려줘도 돼요.",
    status: kind === "error" ? "failed" : "complete",
    createdAt: isoNow(),
  });
  return createMockSseResponse(kind, signal, turn);
}

export function throwMockJsonError(result: MockJson): never {
  const body = result.body;
  const errorBody =
    isJsonRecord(body) && isJsonRecord(body.error) ? body.error : null;
  const rawCode =
    errorBody && typeof errorBody.code === "string" ? errorBody.code : null;
  throw new ApiError({
    code: parseApiErrorCode(rawCode),
    message:
      errorBody && typeof errorBody.message === "string"
        ? errorBody.message
        : "API 오류",
    traceId:
      errorBody && typeof errorBody.traceId === "string"
        ? errorBody.traceId
        : TRACE,
    httpStatus: result.status,
    rawCode,
  });
}

declare global {
  interface Window {
    // 콘솔과 전송 mock 공유 상태
    __mioMockState?: MioMockState;
    __mioMockUsingApi?: boolean;
    mioMock?: {
      force: (code: string) => void;
      clear: () => void;
      scenario: (name: string) => void;
    };
  }
}
