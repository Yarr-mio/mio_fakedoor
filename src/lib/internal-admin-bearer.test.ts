import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_API_KEY_STORAGE,
  readAdminApiKey,
  rememberAdminApiKey,
} from "./admin-api-key";
import { recordConsent, withdrawConsent } from "./api/consent";
import { createConversation } from "./api/conversations";
import { postEvents, type FunnelEvent } from "./api/events";
import { getVisit, startVisit } from "./api/visit";
import { clearNeedEvents, flushNeedEvents, trackNeed } from "./need-events";

const TAB_KEY_A = "tab-key-a";
const TAB_KEY_B = "tab-key-b";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorized() {
  return jsonResponse(
    { error: { code: "UNAUTHORIZED", message: "no", traceId: "t401" } },
    401,
  );
}

function memoryStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return values.has(key) ? (values.get(key) ?? null) : null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
  vi.stubGlobal("sessionStorage", storage);
  return storage;
}

function authorization(init: RequestInit): string | null {
  return new Headers(init.headers).get("Authorization");
}

const event: FunnelEvent = {
  id: "a1b2c3d4-e5f6-4789-a012-3456789abcde",
  journeyId: "9f1c3b2a-1111-4111-8111-9f1c3b2a1111",
  at: "2026-09-22T09:00:01.234Z",
  version: "need-flow-v5.2",
  mode: "scripted_demo",
  internal: false,
  name: "landing_viewed",
  props: { screen: "landing" },
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test");
  vi.stubEnv("NEXT_PUBLIC_USE_MOCK_API", "false");
  vi.stubGlobal("location", { origin: "https://app.example.test", search: "" });
  vi.stubGlobal("window", {
    location: { origin: "https://app.example.test", search: "" },
    addEventListener() {},
  });
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  });
  clearNeedEvents();
});

afterEach(() => {
  clearNeedEvents();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("internal admin bearer", () => {
  it("adds the tab key to visit events and consent and omits it when absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(unauthorized());
    vi.stubGlobal("fetch", fetchMock);
    const storage = memoryStorage();
    rememberAdminApiKey(TAB_KEY_A, storage);

    await startVisit({ journeyId: event.journeyId }).catch(() => undefined);
    await getVisit().catch(() => undefined);
    await postEvents([event]).catch(() => undefined);
    await recordConsent({
      journeyId: event.journeyId,
      grants: [
        {
          documentCode: "terms",
          documentVersion: "v1",
          granted: true,
        },
      ],
      idempotencyKey: "idem-1",
    }).catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const paths = fetchMock.mock.calls.map((call) => call[0]);
    expect(paths).toEqual([
      "https://api.example.test/v1/visit",
      "https://api.example.test/v1/visit",
      "https://api.example.test/v1/events",
      "https://api.example.test/v1/consent",
    ]);
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect(authorization(init)).toBe(`Bearer ${TAB_KEY_A}`);
      expect(init.credentials).toBe("include");
      expect(String(init.body ?? "")).not.toContain(TAB_KEY_A);
    }
    expect(readAdminApiKey(storage)).toBe(TAB_KEY_A);

    fetchMock.mockClear();
    storage.removeItem(ADMIN_API_KEY_STORAGE);
    await startVisit({ journeyId: event.journeyId }).catch(() => undefined);
    await postEvents([event]).catch(() => undefined);
    await recordConsent({
      journeyId: event.journeyId,
      grants: [],
      idempotencyKey: "idem-2",
    }).catch(() => undefined);
    for (const call of fetchMock.mock.calls) {
      expect(authorization(call[1] as RequestInit)).toBeNull();
    }
  });

  it("leaves conversations and consent withdrawal without the admin key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(unauthorized());
    vi.stubGlobal("fetch", fetchMock);
    rememberAdminApiKey(TAB_KEY_A, memoryStorage());
    await createConversation({ need: "listen" }).catch(() => undefined);
    await withdrawConsent({ idempotencyKey: "idem-3" }).catch(() => undefined);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://api.example.test/v1/conversations",
      "https://api.example.test/v1/consent",
    ]);
    for (const call of fetchMock.mock.calls) {
      expect(authorization(call[1] as RequestInit)).toBeNull();
    }
    expect(readAdminApiKey()).toBe(TAB_KEY_A);
  });

  it("reads the key again when an event batch is resent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { accepted: 1, duplicated: 0, rejected: 0, propsStripped: 0 },
          meta: { traceId: "t202" },
        }, 202),
      );
    vi.stubGlobal("fetch", fetchMock);
    const storage = memoryStorage();
    rememberAdminApiKey(TAB_KEY_A, storage);
    trackNeed("landing_viewed", { screen: "landing" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(authorization(fetchMock.mock.calls[0][1] as RequestInit)).toBe(
      `Bearer ${TAB_KEY_A}`,
    );
    expect(readAdminApiKey(storage)).toBe(TAB_KEY_A);
    const firstBody = String(
      (fetchMock.mock.calls[0][1] as RequestInit).body,
    );
    expect(firstBody).not.toContain(TAB_KEY_A);
    rememberAdminApiKey(TAB_KEY_B, storage);
    await flushNeedEvents();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authorization(fetchMock.mock.calls[1][1] as RequestInit)).toBe(
      `Bearer ${TAB_KEY_B}`,
    );
    expect(String((fetchMock.mock.calls[1][1] as RequestInit).body)).not.toContain(
      TAB_KEY_B,
    );
  });

  it("sends no header when session storage is absent and keeps mock mode off the network", async () => {
    const fetchMock = vi.fn().mockResolvedValue(unauthorized());
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("sessionStorage", undefined);
    await expect(
      startVisit({ journeyId: event.journeyId }),
    ).rejects.toBeTruthy();
    expect(authorization(fetchMock.mock.calls[0][1] as RequestInit)).toBeNull();

    vi.stubEnv("NEXT_PUBLIC_USE_MOCK_API", "true");
    fetchMock.mockClear();
    const mocked = await startVisit({ journeyId: event.journeyId });
    expect(mocked.data.journeyId).toBe(event.journeyId);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
