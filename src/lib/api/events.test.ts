import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import {
  EVENTS_BATCH_MAX,
  isMockEventName,
  isPermanentEventError,
  isPostableEventName,
  postEvents,
  sanitizeEventProps,
  splitEventBatches,
  type FunnelEvent,
} from "./events";

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 202,
    headers: { "Content-Type": "application/json" },
  });
}

function sampleEvent(overrides: Partial<FunnelEvent> = {}): FunnelEvent {
  return {
    id: "a1b2c3d4-e5f6-4789-a012-3456789abcde",
    journeyId: "9f1c3b2a-1111-4111-8111-9f1c3b2a1111",
    at: "2026-09-22T09:00:01.234Z",
    version: "need-flow-v5.2",
    mode: "scripted_demo",
    internal: false,
    name: "need_selected",
    props: { need: "listen", screen: "needs" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
  vi.stubGlobal("location", { origin: "https://app.example.test" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("event props allowlist", () => {
  it("keeps only screen need option turn resource rating", () => {
    expect(
      sanitizeEventProps({
        screen: "landing",
        need: "listen",
        option: 1,
        turn: 2,
        resource: "fixture-1",
        rating: "yes",
        message: "PRIVATE",
        email: "private@example.com",
      }),
    ).toEqual({
      screen: "landing",
      need: "listen",
      option: 1,
      turn: 2,
      resource: "fixture-1",
      rating: "yes",
    });
  });

  it("drops tokens and ints that fail server prop rules", () => {
    expect(
      sanitizeEventProps(
        {
          screen: "Landing",
          need: "listen!",
          resource: "id with space",
          rating: "Yes",
          option: 1.5,
          turn: -1,
        },
        "landing_viewed",
      ),
    ).toEqual({});
    expect(
      sanitizeEventProps(
        { option: 0, turn: 10000, resource: "after_work-1" },
        "mock_fixture_sent",
      ),
    ).toEqual({
      option: 0,
      turn: 10000,
      resource: "after_work-1",
    });
  });

  it("drops ratings outside the event allowlist", () => {
    expect(sanitizeEventProps({ rating: "easy" }, "followup_choice")).toEqual(
      {},
    );
    expect(
      sanitizeEventProps({ rating: "perspective" }, "followup_choice"),
    ).toEqual({ rating: "perspective" });
    expect(
      sanitizeEventProps({ rating: "selected_fixtures" }, "summary_opened"),
    ).toEqual({ rating: "selected_fixtures" });
    expect(
      sanitizeEventProps({ rating: "easy" }, "feedback_submitted"),
    ).toEqual({ rating: "easy" });
  });
});

describe("event name lists", () => {
  it("treats mock names as scripted demo only", () => {
    expect(isMockEventName("mock_input_sent")).toBe(true);
    expect(isMockEventName("landing_viewed")).toBe(false);
    expect(isPostableEventName("landing_viewed")).toBe(true);
    expect(isPostableEventName("live_understood")).toBe(true);
    expect(isPostableEventName("demo_option_selected")).toBe(false);
  });
});

describe("event batch split", () => {
  it("caps each batch at 100 events", () => {
    const events = Array.from({ length: 101 }, () =>
      sampleEvent({
        id: crypto.randomUUID(),
        name: "landing_viewed",
        props: { screen: "landing" },
      }),
    );
    const batches = splitEventBatches(events);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(EVENTS_BATCH_MAX);
    expect(batches[1]).toHaveLength(1);
  });
});

describe("post events", () => {
  it("posts keepalive json with nested mode internal kept", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { accepted: 8, duplicated: 2, rejected: 1, propsStripped: 0 },
        meta: { traceId: "01HVZXY2" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const event = sampleEvent();
    const result = await postEvents([event]);
    expect(result.data).toEqual({
      accepted: 8,
      duplicated: 2,
      rejected: 1,
      propsStripped: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.test/v1/events");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.keepalive).toBe(true);
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Origin")).toBeNull();
    expect(JSON.parse(String(init.body))).toEqual({ events: [event] });
  });

  it("rejects a missing array or over 100 before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const tooMany = Array.from({ length: 101 }, () =>
      sampleEvent({ id: crypto.randomUUID() }),
    );
    await expect(postEvents(tooMany)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(postEvents([])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps events error codes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: { code: "VALIDATION_ERROR", message: "bad", traceId: "t1" },
          },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "ORIGIN_MISMATCH",
              message: "origin",
              traceId: "t2",
            },
          },
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "PAYLOAD_TOO_LARGE",
              message: "size",
              traceId: "t3",
            },
          },
          { status: 413 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "UNSUPPORTED_MEDIA_TYPE",
              message: "type",
              traceId: "t4",
            },
          },
          { status: 415 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: "RATE_LIMITED", message: "slow", traceId: "t5" } },
          { status: 429 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const payload = [sampleEvent()];
    const validation = await postEvents(payload).catch((error) => error);
    const origin = await postEvents(payload).catch((error) => error);
    const payloadSize = await postEvents(payload).catch((error) => error);
    const media = await postEvents(payload).catch((error) => error);
    const rate = await postEvents(payload).catch((error) => error);
    expect(validation).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(origin).toMatchObject({ code: "ORIGIN_MISMATCH" });
    expect(payloadSize).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    expect(media).toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    expect(rate).toMatchObject({ code: "RATE_LIMITED" });
    expect(isPermanentEventError(validation)).toBe(true);
    expect(isPermanentEventError(origin)).toBe(true);
    expect(isPermanentEventError(payloadSize)).toBe(true);
    expect(isPermanentEventError(media)).toBe(true);
    expect(isPermanentEventError(rate)).toBe(false);
    expect(
      isPermanentEventError(
        new ApiError({ code: "INTERNAL_ERROR", message: "x" }),
      ),
    ).toBe(false);
  });
});
