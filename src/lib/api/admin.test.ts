import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COHORT_TEMPLATE } from "../retention-cohorts";
import { ApiError } from "./errors";
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
  adminInclusiveDayCount,
  getAdminMetrics,
  getAdminSafetyEventSegment,
  getAdminSafetyEvents,
  hasAdminAccessToken,
  parseAdminConversationTrace,
  parseAdminMetricsData,
  reviewAdminSafetyEvent,
  shouldShowLiveQuality,
  unsetAdminTokenSource,
} from "./admin";

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

function errorBody(code: string, status: number) {
  return jsonResponse(
    { error: { code, message: code, traceId: "01ERR" } },
    { status },
  );
}

const metricsData = {
  range: { start: "2026-09-01", end: "2026-09-22", timezone: "Asia/Seoul" },
  journeys: 412,
  byMode: { scripted_demo: 412, live: 0 },
  funnel: [
    { name: "landing_viewed", label: "홈 노출", count: 412 },
    { name: "entry_clicked", label: "시작 버튼", count: 188 },
  ],
  typed: 44,
  fixtures: 96,
  needs: { listen: 51, organize: 38 },
  feedback: { helpful: 22, unclear: 9 },
  followup: { perspective: 14, existing: 8, none: 17 },
  orphanJourneys: 23,
  coverage: {
    eventLossRate: null,
    judgeUnresolvedRate: null,
    abandonedRate: 0.07,
  },
  liveQuality: null,
  daily: [{ day: "2026-09-22", events: 310, journeys: 41 }],
};

const cohortData = {
  ...COHORT_TEMPLATE,
  asOf: "2026-09-21",
  coreAction: "live_typed_message_sent",
  sourceRef: "fd-cohort-2026-09-21",
  cohorts: [
    { weekStart: "2026-09-07", size: 34, retained: [34, 6, null] },
    { weekStart: "2026-09-14", size: 41, retained: [41, null, null] },
  ],
};

const safetyEvent = {
  safetyEventId: "se_01H",
  conversationId: "7f8b1c2d-1111-4111-8111-7f8b1c2d1111",
  messageId: "msg_out_r1",
  kind: "contract_violation",
  categories: ["guaranteed_outcome"],
  responseAct: "EMPATHIC_REFLECTION",
  followUpModel: "offer",
  followUpFinal: "wait",
  replaced: true,
  judgeStatus: "skipped",
  occurredAt: "2026-09-22T09:05:00Z",
  reviewedAt: null,
  contentAvailable: true,
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("admin token gate", () => {
  it("does not fetch without a token and omits prototype session code", async () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/api/admin.ts"),
      "utf8",
    );
    expect(source).not.toContain("admin-session");
    expect(source).not.toContain("/api/admin/session");
    expect(source).not.toContain("idempotencyKey");
    expect(hasAdminAccessToken(unsetAdminTokenSource.getAccessToken())).toBe(
      false,
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const api = createAdminApi(unsetAdminTokenSource);
    await expect(api.getMetrics()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends bearer authorization and omits cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: metricsData,
        meta: { traceId: "01MET" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await getAdminMetrics("token-1", {
      start: "2026-09-01",
      end: "2026-09-22",
      mode: "all",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.example.test/v1/admin/metrics?start=2026-09-01&end=2026-09-22&includeInternal=false&mode=all",
    );
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      adminBearerAuthorization("token-1"),
    );
  });
});

describe("admin metrics", () => {
  it("keeps coverage null distinct from zero and hides empty live quality", () => {
    const parsed = parseAdminMetricsData(metricsData);
    expect(parsed.journeys).toBe(412);
    expect(parsed.byMode).toEqual({ scripted_demo: 412, live: 0 });
    expect(parsed).not.toHaveProperty("total");
    expect(formatCoverageRate(parsed.coverage.eventLossRate)).toBe(
      "측정 안 됨",
    );
    expect(formatCoverageRate(parsed.coverage.judgeUnresolvedRate)).toBe(
      "측정 안 됨",
    );
    expect(formatCoverageRate(parsed.coverage.abandonedRate)).toBe("7.0%");
    expect(formatCoverageRate(0)).toBe("0.0%");
    expect(shouldShowLiveQuality(parsed.liveQuality)).toBe(false);
    expect(
      shouldShowLiveQuality({
        followUpMismatchRate: 0.04,
        inquiryRatio: 0.31,
        replacedRate: 0.02,
        crisisFlowCount: 1,
        turnLimitCount: 3,
      }),
    ).toBe(true);
  });

  it("keeps a null inquiry ratio when live quality exists", () => {
    const parsed = parseAdminMetricsData({
      ...metricsData,
      liveQuality: {
        followUpMismatchRate: 0.04,
        inquiryRatio: null,
        replacedRate: 0.02,
        crisisFlowCount: 1,
        turnLimitCount: 3,
      },
    });
    expect(parsed.liveQuality?.inquiryRatio).toBeNull();
    expect(formatCoverageRate(parsed.liveQuality?.inquiryRatio ?? null)).toBe(
      "측정 안 됨",
    );
  });

  it("rejects a span longer than 366 inclusive days before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(adminInclusiveDayCount("2025-01-01", "2026-01-01")).toBe(366);
    await expect(
      getAdminMetrics("token-1", { start: "2024-01-01", end: "2025-01-01" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(
      getAdminMetrics("token-1", { start: "2026-02-31", end: "2026-03-01" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects inverted dates before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      getAdminMetrics("token-1", { start: "2026-09-22", end: "2026-09-01" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("admin cohorts", () => {
  it("reuses parseCohorts and keeps immature weeks as null", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: cohortData,
        meta: { traceId: "01COH" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await getAdminCohorts("token-1", {
      asOf: "2026-09-21",
      coreAction: "live_typed_message_sent",
    });
    expect(result.data.version).toBe("mio-cohort-v1");
    expect(result.data.cohorts[0].retained[2]).toBeNull();
    expect(result.data.cohorts[1].retained[1]).toBeNull();
  });

  it("does not send an empty or oversized core action", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      getAdminCohorts("token-1", { asOf: "2026-09-21", coreAction: "   " }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(
      getAdminCohorts("token-1", {
        asOf: "2026-09-21",
        coreAction: "x".repeat(161),
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("distinguishes a locked bearer from a missing one and shows Retry-After", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: "RATE_LIMITED", message: "locked", traceId: "t429" },
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "12",
            },
          },
        ),
      ),
    );
    try {
      await getAdminMetrics("token-1");
      throw new Error("expected failure");
    } catch (error) {
      expect(adminErrorMessage(error, "metrics")).toBe(
        "인증 실패가 많아 잠시 후 다시 시도해주세요 (Retry-After: 12초)",
      );
    }
    expect(
      adminErrorMessage(
        new ApiError({ code: "RATE_LIMITED", message: "x", httpStatus: 429 }),
        "metrics",
      ),
    ).toBe("인증 실패가 많아 잠시 후 다시 시도해주세요");
    expect(
      adminErrorMessage(
        new ApiError({ code: "UNAUTHORIZED", message: "x", httpStatus: 401 }),
        "metrics",
      ),
    ).toBe("관리자 인증이 필요합니다");
  });

  it("maps core action 422 to an explicit message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(errorBody("BUSINESS_RULE_VIOLATION", 422)),
    );
    try {
      await getAdminCohorts("token-1", {
        asOf: "2026-09-21",
        coreAction: "placeholder",
      });
      throw new Error("expected failure");
    } catch (error) {
      expect(adminErrorMessage(error, "cohorts")).toBe(
        "요청한 핵심 행동 코드가 서버 정의와 다릅니다",
      );
    }
  });
});

describe("admin safety and conversation", () => {
  it("rejects reserved safety filters before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      getAdminSafetyEvents("token-1", { kind: "security" as "crisis" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(
      getAdminSafetyEvents("token-1", { kind: "judge_failed" as "crisis" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(
      getAdminSafetyEvents("token-1", {
        reviewed: "yes" as unknown as boolean,
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(
      getAdminSafetyEvents("token-1", { limit: 101 }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(
      getAdminSafetyEvents("token-1", { limit: 1.5 }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists metadata without content and keeps kinds separate", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { events: [safetyEvent] },
        meta: { traceId: "01SAF", nextCursor: "se_01G", hasMore: true },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await getAdminSafetyEvents("token-1", {
      kind: "contract_violation",
    });
    expect(result.data.events[0]).not.toHaveProperty("content");
    expect(result.data.nextCursor).toBe("se_01G");
    expect(result.data.hasMore).toBe(true);
    expect(formatSafetyKind("crisis")).toBe("위기");
    expect(formatSafetyKind("contract_violation")).toBe("계약 위반");
    expect(formatJudgeStatus("skipped")).toBe("판정 미실행");
    expect(formatJudgeStatus("skipped")).not.toContain("완료");
    expect(canOpenSafetySegment("viewer")).toBe(false);
    expect(canOpenSafetySegment("safety")).toBe(true);
  });

  it("rejects conversation payloads that include message content", () => {
    expect(() =>
      parseAdminConversationTrace({
        conversationId: "7f8b1c2d-1111-4111-8111-7f8b1c2d1111",
        mode: "live",
        state: "wait",
        userTurns: 1,
        policyVersion: "mio-dialogue-1.0",
        turns: [
          {
            messageId: "msg_out_xyz",
            content: "secret",
            responseAct: "EMPATHIC_REFLECTION",
            plan: { maxQuestions: 0, maxSentences: 3, forbidden: ["advice"] },
            contractViolations: [],
            followUpModel: "offer",
            followUpFinal: "wait",
            modelId: "m",
            promptVersion: "p",
            latencyMs: 10,
            tokensIn: 1,
            tokensOut: 1,
            costKrw: 1,
          },
        ],
      }),
    ).toThrow(ApiError);
  });

  it("drops deferred root fields and reads summary attributions", () => {
    const parsed = parseAdminConversationTrace({
      conversationId: "7f8b1c2d-1111-4111-8111-7f8b1c2d1111",
      mode: "live",
      state: "wait",
      userTurns: 7,
      policyVersion: "mio-dialogue-1.0",
      turns: [],
      riskState: { level: 1 },
      attributions: [{ type: "emotion", value: "루트" }],
      summary: {
        summaryId: "sum_4d2a",
        judgeStatus: "failed",
        attributions: [
          {
            type: "emotion",
            value: "창피함",
            evidenceMessageId: "msg_in_abc",
            nli: "entailed",
            kept: true,
          },
          {
            type: "emotion",
            value: "분노",
            evidenceMessageId: "msg_in_abc",
            nli: null,
            judge: "rejected",
            kept: false,
          },
        ],
        contractViolations: ["s3"],
        modelId: "model",
        promptVersion: "fd-summary-0.1",
        latencyMs: 2310,
        tokensIn: 880,
        tokensOut: 140,
        costKrw: 5.4,
      },
    });
    expect(parsed).not.toHaveProperty("riskState");
    expect(parsed).not.toHaveProperty("attributions");
    expect(parsed.summary?.judgeStatus).toBe("failed");
    expect(parsed.summary?.contractViolations).toEqual(["s3"]);
    expect(parsed.summary?.attributions[0]).not.toHaveProperty("judge");
    expect(parsed.summary?.attributions[1].nli).toBeNull();
    expect(parsed.summary?.attributions[1].judge).toBe("rejected");
    expect(parsed.summary?.attributions[1].kept).toBe(false);
  });

  it("fetches conversation traces without content fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          data: {
            conversationId: "7f8b1c2d-1111-4111-8111-7f8b1c2d1111",
            mode: "live",
            state: "wait",
            userTurns: 7,
            policyVersion: "mio-dialogue-1.0",
            turns: [
              {
                messageId: "msg_out_xyz",
                responseAct: "EMPATHIC_REFLECTION",
                plan: {
                  maxQuestions: 0,
                  maxSentences: 3,
                  forbidden: ["advice", "task"],
                },
                contractViolations: [],
                followUpModel: "offer",
                followUpFinal: "wait",
                modelId: "model",
                promptVersion: "fd-prompt",
                latencyMs: 1840,
                tokensIn: 412,
                tokensOut: 96,
                costKrw: 3.1,
              },
            ],
          },
          meta: { traceId: "01CONV" },
        }),
      ),
    );
    const result = await getAdminConversation(
      "token-1",
      "7f8b1c2d-1111-4111-8111-7f8b1c2d1111",
    );
    expect(result.data.turns[0]).not.toHaveProperty("content");
    expect(result.data.summary).toBeNull();
  });

  it("disables cache on segment fetch and distinguishes auth errors", async () => {
    const segmentPayload = {
      success: true,
      data: {
        safetyEventId: "se_01H",
        conversationId: "7f8b1c2d-1111-4111-8111-7f8b1c2d1111",
        flow: "end",
        flaggedMessageId: "msg_in_c1",
        segment: [
          {
            messageId: "msg_out_b9",
            role: "mio",
            content: "a",
            createdAt: "2026-09-22T09:04:40Z",
          },
        ],
      },
      meta: { traceId: "01SEG" },
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(() => jsonResponse(segmentPayload));
    vi.stubGlobal("fetch", fetchMock);
    await getAdminSafetyEventSegment("token-1", "se_01H");
    await getAdminSafetyEventSegment("token-1", "se_01H");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe("no-store");
    expect(
      adminErrorMessage(
        new ApiError({ code: "UNAUTHORIZED", message: "x" }),
        "segment",
      ),
    ).toBe("관리자 인증이 필요합니다");
    expect(
      adminErrorMessage(
        new ApiError({ code: "FORBIDDEN", message: "x" }),
        "segment",
      ),
    ).toBe("Safety 역할이 없어 원문에 접근할 수 없습니다");
    expect(
      adminErrorMessage(
        new ApiError({ code: "GONE", message: "x" }),
        "segment",
      ),
    ).toBe("이용자 삭제·철회로 원문 구간이 없습니다");
    expect(
      adminErrorMessage(
        new ApiError({ code: "FORBIDDEN", message: "x" }),
        "review",
      ),
    ).toBe("Safety 역할이 없어 재검토를 기록할 수 없습니다");
    expect(
      adminErrorMessage(
        new ApiError({ code: "ADMIN_AUTH_NOT_CONFIGURED", message: "x" }),
        "metrics",
      ),
    ).toBe("관리자 인증이 설정되지 않았습니다");
  });

  it("updates reviewedAt after a successful review", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          safetyEventId: "se_01H",
          reviewedAt: "2026-09-22T10:11:00Z",
          action: "false_positive",
          retainUntil: "2026-12-21",
        },
        meta: { traceId: "01REV" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await reviewAdminSafetyEvent("token-1", "se_01H", {
      action: "false_positive",
      noteCode: "context_misread",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has("Idempotency-Key")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({
      action: "false_positive",
      noteCode: "context_misread",
    });
    expect(result.data).toEqual({
      safetyEventId: "se_01H",
      reviewedAt: "2026-09-22T10:11:00Z",
      action: "false_positive",
      retainUntil: "2026-12-21",
    });
    const updated = applySafetyReview(
      [
        {
          ...safetyEvent,
          kind: "contract_violation",
          reviewedAt: null,
          categories: ["guaranteed_outcome"],
        },
      ],
      "se_01H",
      result.data.reviewedAt,
    );
    expect(updated[0].reviewedAt).toBe("2026-09-22T10:11:00Z");
  });
});
