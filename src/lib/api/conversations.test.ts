import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { SSE_ACCEPT } from "./headers";
import {
  consumeConversationStream,
  controlConversation,
  createConversation,
  createConversationSummary,
  deleteConversation,
  endConversation,
  getConversationSummary,
  isLiveFallbackError,
  isSummaryJudgeFailed,
  listConversationMessages,
  formatConversationSummaryText,
  parseConversationSummary,
  parseCrisisEvent,
  parseDeltaReplaceEvent,
  sendConversationMessage,
  splitFormattedSummarySections,
  summaryErrorMessage,
} from "./conversations";

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse(text: string) {
  return new Response(text, {
    status: 200,
    headers: { "Content-Type": SSE_ACCEPT },
  });
}

const opening = {
  messageId: "msg_open_1",
  role: "mio",
  source: "fixture",
  content: "안녕하세요, 미오예요.",
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
  vi.stubGlobal("location", { origin: "https://app.example.test" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("create conversation", () => {
  it("posts need without client mode and reads opening", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          success: true,
          data: {
            conversationId: "7f8b1c2d-1111-4111-8111-7f8b1c2d1111",
            mode: "scripted_demo",
            state: "offer",
            stateVersion: 1,
            policyVersion: "mio-dialogue-1.0",
            opening,
            limits: { maxUserTurns: 20, maxContentChars: 1000 },
          },
          meta: { traceId: "01HVZXY3" },
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await createConversation({
      need: "listen",
      scenarioId: "after_work",
    });
    expect(result.data.state).toBe("offer");
    expect(result.data.opening?.source).toBe("fixture");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      need: "listen",
      scenarioId: "after_work",
    });
  });

  it("treats live gate errors as fallback codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "LIVE_MODE_DISABLED",
              message: "off",
              traceId: "t1",
            },
          },
          { status: 503 },
        ),
      ),
    );
    const error = await createConversation({ need: "listen" }).catch(
      (value) => value,
    );
    expect(isLiveFallbackError(error)).toBe(true);
  });
});

describe("send message sse", () => {
  it("opens the stream with accept and a stable idempotency key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse("event: done\ndata: {}\n\n"));
    vi.stubGlobal("fetch", fetchMock);
    await sendConversationMessage({
      conversationId: "7f8b1c2d-1111-4111-8111-7f8b1c2d1111",
      content: "퇴근했는데 팀장님이 한 말이 계속 생각나요.",
      source: "typed",
      stateVersion: 3,
      idempotencyKey: "b3e1c9a0-1111-4111-8111-b3e1c9a01111",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.example.test/v1/conversations/7f8b1c2d-1111-4111-8111-7f8b1c2d1111/messages",
    );
    const headers = new Headers(init.headers);
    expect(headers.get("Accept")).toBe(SSE_ACCEPT);
    expect(headers.get("Idempotency-Key")).toBe(
      "b3e1c9a0-1111-4111-8111-b3e1c9a01111",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      content: "퇴근했는데 팀장님이 한 말이 계속 생각나요.",
      source: "typed",
      fixtureId: null,
      stateVersion: 3,
    });
  });

  it("appends delta then replaces the whole bubble", async () => {
    const text = [
      "event: session_meta",
      'data: {"messageId":"in1","outMessageId":"out1","receivedAt":"2026-09-22T09:00:00Z","conversationId":"c1","policyVersion":"p","requestId":"k1"}',
      "",
      "event: delta",
      'data: {"chunk":"첫 문장.","msgId":"out1"}',
      "",
      "event: delta.replace",
      'data: {"safeResponse":"교체 문장.","msgId":"out1"}',
      "",
      "event: done",
      'data: {"msgId":"out1","envelopeVersion":"0.1","state":"wait","stateVersion":9,"mode":"live","interaction":{"followUp":"wait","suggestions":[]},"finishedReason":"replaced_by_guard","judgeStatus":"skipped","isCrisisFlagged":false}',
      "",
      "",
    ].join("\n");
    const events: Array<{ event: string; data: unknown }> = [];
    await consumeConversationStream(sseResponse(text), async (block) => {
      events.push(block);
    });
    expect(events.map((item) => item.event)).toEqual([
      "session_meta",
      "delta",
      "delta.replace",
      "done",
    ]);
    expect(parseDeltaReplaceEvent(events[2].data).safeResponse).toBe(
      "교체 문장.",
    );
  });

  it("keeps crisis strings from the server", () => {
    const crisis = parseCrisisEvent({
      flow: "end",
      severity: 2,
      fixedResponse: "고정 문구",
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
          title: "기관",
          organization: "국립정신건강센터",
          url: "https://www.mentalhealth.go.kr/portal/main/index.do",
        },
      ],
      reviewRequest: {
        referenceCode: "FD-7K2Q",
        contact: "mio.official402@gmail.com",
      },
    });
    expect(crisis.emergency[0].number).toBe("109");
    expect(crisis.resources[0].title).toBe("기관");
    expect(crisis.reviewRequest?.referenceCode).toBe("FD-7K2Q");
  });
});

describe("conversation rest endpoints", () => {
  it("lists complete messages with cursor meta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          data: {
            conversationId: "c1",
            state: "wait",
            stateVersion: 9,
            mode: "scripted_demo",
            messages: [
              {
                messageId: "msg_open_1",
                role: "mio",
                source: "fixture",
                content: "안녕하세요",
                status: "complete",
                createdAt: "2026-09-22T09:00:00Z",
              },
            ],
          },
          meta: { traceId: "01HVZXY4", nextCursor: null, hasMore: false },
        }),
      ),
    );
    const result = await listConversationMessages("c1");
    expect(result.data.messages).toHaveLength(1);
    expect(result.meta.nextCursor).toBeNull();
    expect(result.meta.hasMore).toBe(false);
  });

  it("stops generation without ending the conversation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          state: "wait",
          stateVersion: 5,
          stoppedMessageId: "msg_out_xyz",
        },
        meta: { traceId: "01HVZXY5" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await controlConversation("c1", {
      action: "stop",
      targetMessageId: "msg_out_xyz",
      stateVersion: 4,
    });
    expect(result.data.state).toBe("wait");
    expect((fetchMock.mock.calls[0][1] as RequestInit).keepalive).toBe(false);
    expect(
      JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)),
    ).toEqual({
      action: "stop",
      targetMessageId: "msg_out_xyz",
      stateVersion: 4,
    });
  });

  it("sends stop with keepalive when asked", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          state: "wait",
          stateVersion: 5,
          stoppedMessageId: "msg_out_xyz",
        },
        meta: { traceId: "01HVZXY5" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await controlConversation(
      "c1",
      { action: "stop", targetMessageId: "msg_out_xyz", stateVersion: 4 },
      { keepalive: true },
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).keepalive).toBe(true);
  });

  it("ends with user reason and no follow up fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          data: {
            state: "end",
            stateVersion: 12,
            endedAt: "2026-09-22T09:10:00Z",
          },
          meta: { traceId: "01HVZXY6" },
        }),
      ),
    );
    const result = await endConversation("c1", "user_end");
    expect(result.data).toEqual({
      state: "end",
      stateVersion: 12,
      endedAt: "2026-09-22T09:10:00Z",
    });
  });

  it("deletes with a pending operation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: true,
            data: {
              operationId: "op_9c1d",
              status: "pending",
              dbDeadline: "2026-09-29",
              backupDeadline: "2026-10-22",
            },
            meta: { traceId: "01HVZXYB" },
          },
          { status: 202 },
        ),
      ),
    );
    const result = await deleteConversation("c1");
    expect(result.data.status).toBe("pending");
  });

  it("accepts a completed deletion status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            success: true,
            data: {
              operationId: "op_9c1d",
              status: "succeeded",
              dbDeadline: "2026-09-29",
              backupDeadline: "2026-10-22",
            },
            meta: { traceId: "01HVZXYB" },
          },
          { status: 202 },
        ),
      ),
    );
    const result = await deleteConversation("c1");
    expect(result.data.status).toBe("succeeded");
  });

  it("maps json errors before the stream opens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "CONVERSATION_MESSAGE_IN_PROGRESS",
              message: "busy",
              traceId: "t2",
            },
          },
          { status: 409 },
        ),
      ),
    );
    const error = await sendConversationMessage({
      conversationId: "c1",
      content: "hello",
      source: "typed",
      stateVersion: 1,
      idempotencyKey: "k1",
    }).catch((value) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "CONVERSATION_MESSAGE_IN_PROGRESS" });
  });
});

describe("conversation summary", () => {
  const summaryBody = {
    summaryId: "sum_1",
    conversationId: "c1",
    mode: "live",
    source: "model",
    situation: null,
    expressedEmotions: [],
    remainingConcerns: ["다음에 말하고 싶은 일"],
    judgeStatus: "ok",
    droppedAttributions: 1,
    generatedAt: "2026-09-25T01:00:00Z",
  };

  it("posts an empty body with a new idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          success: true,
          data: summaryBody,
          meta: { traceId: "01HVZSUM" },
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await createConversationSummary(
      "c1",
      "b3e1c9a0-1111-4111-8111-b3e1c9a01111",
    );
    expect(result.data.situation).toBeNull();
    expect(result.data.source).toBe("model");
    expect(result.data.droppedAttributions).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.test/v1/conversations/c1/summary");
    expect(JSON.parse(String(init.body))).toEqual({});
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
      "b3e1c9a0-1111-4111-8111-b3e1c9a01111",
    );
  });

  it("reads the latest summary and treats skipped as success", () => {
    const skipped = parseConversationSummary({
      ...summaryBody,
      mode: "scripted_demo",
      source: "fixture",
      judgeStatus: "skipped",
      situation: "퇴근 후 생각이 남음",
    });
    expect(isSummaryJudgeFailed(skipped)).toBe(false);
    expect(skipped.judgeStatus).toBe("skipped");
  });

  it("treats failed judge as empty success payload not an upstream error", () => {
    const failed = parseConversationSummary({
      ...summaryBody,
      judgeStatus: "failed",
      situation: null,
      expressedEmotions: [],
      remainingConcerns: [],
    });
    expect(isSummaryJudgeFailed(failed)).toBe(true);
    expect(summaryErrorMessage({ name: "Error" })).toBe(
      "정리를 요청하지 못했어요",
    );
  });

  it("gets summary and maps not found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          data: summaryBody,
          meta: { traceId: "01HVZGET" },
        }),
      ),
    );
    const result = await getConversationSummary("c1");
    expect(result.data.summaryId).toBe("sum_1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: { code: "NOT_FOUND", message: "none", traceId: "t3" },
          },
          { status: 404 },
        ),
      ),
    );
    const missing = await getConversationSummary("c1").catch((value) => value);
    expect(missing).toMatchObject({ code: "NOT_FOUND" });
  });

  it("separates upstream summary errors from judge failed copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "UPSTREAM_TIMEOUT",
              message: "timeout",
              traceId: "t4",
            },
          },
          { status: 504 },
        ),
      ),
    );
    const error = await createConversationSummary("c1", "k2").catch(
      (value) => value,
    );
    expect(summaryErrorMessage(error)).toBe("정리 문장을 만들지 못했어요");
  });

  it("splits a formatted summary into the three sections", () => {
    const text = formatConversationSummaryText({
      summaryId: "sum_1",
      conversationId: "c1",
      mode: "scripted_demo",
      source: "fixture",
      situation: "퇴근 후 말이 계속 떠오른다",
      expressedEmotions: [
        { label: "창피함", evidenceMessageId: "msg_in_1" },
      ],
      remainingConcerns: ["내일 팀장을 다시 봐야 한다"],
      judgeStatus: "skipped",
      droppedAttributions: 0,
      generatedAt: "2026-09-22T09:12:00Z",
    });
    expect(splitFormattedSummarySections(text)).toEqual([
      { label: "상황", body: "퇴근 후 말이 계속 떠오른다" },
      { label: "표현한 감정", body: "창피함" },
      { label: "남아 있는 고민", body: "내일 팀장을 다시 봐야 한다" },
    ]);
    expect(splitFormattedSummarySections("자유롭게 고친 문장")).toBeNull();
  });
});
