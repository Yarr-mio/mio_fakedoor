import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "./route";

const accessKey = "a".repeat(64);
const sessionSecret = "b".repeat(64);
let clock = Date.parse("2026-01-01T00:00:00Z");

function loginRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3100/api/admin/session", {
    method: "POST",
    headers: {
      origin: "http://localhost:3100",
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  clock += 16 * 60 * 1000;
  vi.useFakeTimers();
  vi.setSystemTime(clock);
  vi.stubEnv("MIO_ADMIN_ACCESS_KEY", accessKey);
  vi.stubEnv("MIO_ADMIN_SESSION_SECRET", sessionSecret);
  vi.stubEnv("MIO_ADMIN_ORIGIN", "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("admin session errors", () => {
  it("keeps the login message and adds an error code", async () => {
    const mismatch = await POST(
      loginRequest({ key: accessKey }, { origin: "https://evil.example" }),
    );
    expect(mismatch.status).toBe(403);
    expect(await mismatch.json()).toEqual({
      message: "허용되지 않은 요청입니다.",
      code: "ORIGIN_MISMATCH",
    });

    vi.stubEnv("MIO_ADMIN_ACCESS_KEY", "");
    vi.stubEnv("MIO_ADMIN_SESSION_SECRET", "");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const missing = await POST(loginRequest({ key: accessKey }));
    expect(missing.status).toBe(503);
    expect(await missing.json()).toEqual({
      message:
        "관리자 인증이 설정되지 않았습니다. 서버 환경변수를 확인해주세요.",
      code: "ADMIN_AUTH_NOT_CONFIGURED",
    });
    expect(errorLog).toHaveBeenCalledWith(
      "[admin-session] ADMIN_AUTH_NOT_CONFIGURED",
      "MIO_ADMIN_ACCESS_KEY 미설정, MIO_ADMIN_SESSION_SECRET 미설정",
    );
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(accessKey);
    errorLog.mockRestore();
  });

  it("rejects a non string key before comparing the secret", async () => {
    const response = await POST(loginRequest({ key: 1234 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: "요청 형식이 올바르지 않습니다.",
      code: "VALIDATION_ERROR",
    });
  });

  it("returns unauthorized only when the key string does not match", async () => {
    const response = await POST(loginRequest({ key: "wrong-key" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: "접근 키를 확인해주세요.",
      code: "UNAUTHORIZED",
    });
  });

  it("returns the existing status codes for size and media type", async () => {
    const media = await POST(
      loginRequest({ key: accessKey }, { "content-type": "text/plain" }),
    );
    expect(media.status).toBe(415);
    expect(await media.json()).toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
    });

    const large = await POST(loginRequest({ key: "x".repeat(1200) }));
    expect(large.status).toBe(413);
    expect(await large.json()).toEqual({
      message: "요청이 너무 큽니다.",
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("logs in without an error code and logs out by clearing the cookie", async () => {
    const response = await POST(loginRequest({ key: accessKey }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "로그인했습니다." });

    const logout = await DELETE(
      new Request("http://localhost:3100/api/admin/session", {
        method: "DELETE",
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(logout.status).toBe(403);
    expect(await logout.json()).toEqual({
      message: "허용되지 않은 요청입니다.",
      code: "ORIGIN_MISMATCH",
    });
  });
});
