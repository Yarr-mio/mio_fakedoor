import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isMockMode } from "./config";
import { apiRequest, apiRequestStream } from "./client";
import {
  consumeConversationStream,
  parseSessionMetaEvent,
} from "./conversations";
import {
  resetMockApi,
  setMockForce,
  setMockStream,
  installMockConsole,
} from "./mock-api";
import { startVisit } from "./visit";
import { ApiError } from "./errors";

beforeEach(() => {
  resetMockApi();
  vi.stubEnv("NEXT_PUBLIC_USE_MOCK_API", "true");
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
  vi.stubGlobal("location", { origin: "https://app.example.test" });
});

afterEach(() => {
  resetMockApi();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("mock api switch", () => {
  it("treats only the true flag as mock mode", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK_API", "false");
    expect(isMockMode()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK_API", "true");
    expect(isMockMode()).toBe(true);
  });

  it("returns visit data without fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await startVisit({
      journeyId: "9f1c3b2a-1111-4111-8111-9f1c3b2a1111",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.data.mode).toBe("scripted_demo");
    expect(result.data.journeyId).toBe("9f1c3b2a-1111-4111-8111-9f1c3b2a1111");
  });

  it("forces consent required on the next call", async () => {
    setMockForce("CONSENT_REQUIRED");
    const error = await apiRequest({
      method: "POST",
      path: "/v1/conversations",
      body: { need: "listen" },
    }).catch((value) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "CONSENT_REQUIRED" });
  });

  it("streams session meta delta and done in order", async () => {
    setMockStream("ok");
    await apiRequest({
      method: "POST",
      path: "/v1/conversations",
      body: { need: "listen" },
    });
    const response = await apiRequestStream({
      method: "POST",
      path: `/v1/conversations/7f8b1c2d-1111-4111-8111-7f8b1c2d1111/messages`,
      body: {
        content: "퇴근했는데 팀장님이 한 말이 계속 생각나요.",
        source: "typed",
        fixtureId: null,
        stateVersion: 1,
      },
    });
    const events: string[] = [];
    await consumeConversationStream(response, async (block) => {
      events.push(block.event);
    });
    expect(events).toEqual(["session_meta", "delta", "delta", "done"]);
  });

  it("assigns a new message id on every turn", async () => {
    await apiRequest({
      method: "POST",
      path: "/v1/conversations",
      body: { need: "listen" },
    });
    const ids: string[] = [];
    for (const content of ["첫 이야기", "두 번째 이야기"]) {
      const response = await apiRequestStream({
        method: "POST",
        path: "/v1/conversations/7f8b1c2d-1111-4111-8111-7f8b1c2d1111/messages",
        body: {
          content,
          source: "typed",
          fixtureId: null,
          stateVersion: 1,
        },
      });
      await consumeConversationStream(response, async (block) => {
        if (block.event !== "session_meta") return;
        const meta = parseSessionMetaEvent(block.data);
        ids.push(meta.messageId, meta.outMessageId);
      });
    }
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it("applies mioMock scenario crisis through shared window state", async () => {
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("console", { ...console, warn: vi.fn() });
    installMockConsole();
    window.__mioMockUsingApi = true;
    window.mioMock?.scenario("crisis");
    expect(window.__mioMockState?.pendingStream).toBe("crisis");
    await apiRequest({
      method: "POST",
      path: "/v1/conversations",
      body: { need: "listen" },
    });
    const response = await apiRequestStream({
      method: "POST",
      path: `/v1/conversations/7f8b1c2d-1111-4111-8111-7f8b1c2d1111/messages`,
      body: {
        content: "너무 힘들어요",
        source: "typed",
        fixtureId: null,
        stateVersion: 1,
      },
    });
    const events: string[] = [];
    await consumeConversationStream(response, async (block) => {
      events.push(block.event);
    });
    expect(events).toEqual(["session_meta", "crisis", "done"]);
    expect(window.__mioMockState?.pendingStream).toBe("ok");
  });

  it("warns when scenario is used outside api chat", () => {
    const warn = vi.fn();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("console", { ...console, warn });
    installMockConsole();
    window.__mioMockUsingApi = false;
    window.mioMock?.scenario("crisis");
    expect(warn).toHaveBeenCalledWith("이 화면은 API mock 대상이 아닙니다");
    expect(window.__mioMockState?.pendingStream).toBe("crisis");
  });
});
