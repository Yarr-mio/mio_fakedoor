import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapVisit, resetVisitBootstrap } from "./visit-session";
import { currentJourneyId } from "./need-events";

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  resetVisitBootstrap();
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
  vi.stubGlobal("location", {
    origin: "https://app.example.test",
    search: "?utm_source=community",
  });
  vi.stubGlobal("window", {
    location: {
      search: "?utm_source=community",
      origin: "https://app.example.test",
    },
  });
});

afterEach(() => {
  resetVisitBootstrap();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("visit bootstrap", () => {
  it("starts a visit with the current journey id then reads active conversation", async () => {
    const journeyId = currentJourneyId();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            success: true,
            data: {
              visitorId: null,
              journeyId,
              mode: "scripted_demo",
              isInternal: false,
              liveModeAvailable: false,
              consentRequired: ["age", "terms", "personal", "sensitive"],
              policyVersion: "mio-dialogue-1.0",
            },
            meta: { traceId: "01VISIT1" },
          },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            visitorId: "c71e0a44-1111-4111-8111-c71e0a441111",
            mode: "scripted_demo",
            isInternal: false,
            liveModeAvailable: false,
            consentGranted: [],
            consentRequired: ["age", "terms", "personal", "sensitive"],
            activeConversationId: "7f8b1c2d-1111-4111-8111-7f8b1c2d1111",
          },
          meta: { traceId: "01VISIT2" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const first = await bootstrapVisit();
    const second = await bootstrapVisit();
    expect(first?.activeConversationId).toBe(
      "7f8b1c2d-1111-4111-8111-7f8b1c2d1111",
    );
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const startBody = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body),
    );
    expect(startBody.journeyId).toBe(journeyId);
    expect(startBody.channel).toEqual({ utm_source: "community" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.example.test/v1/visit",
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.example.test/v1/visit",
    );
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe("GET");
  });
});
