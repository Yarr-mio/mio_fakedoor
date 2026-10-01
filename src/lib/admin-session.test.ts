import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminConfig,
  adminConfigProblems,
  allowLogin,
  createAdminSession,
  sameOrigin,
  SESSION_SECONDS,
  validAccessKey,
  validAdminSession,
} from "./admin-session";
const config = { accessKey: "a".repeat(64), sessionSecret: "b".repeat(64) };
afterEach(() => vi.unstubAllEnvs());
describe("admin auth", () => {
  it("fails closed for absent, weak or identical configuration", () => {
    vi.stubEnv("MIO_ADMIN_ACCESS_KEY", "");
    vi.stubEnv("MIO_ADMIN_SESSION_SECRET", "");
    expect(adminConfig()).toBeNull();
    expect(adminConfigProblems()).toEqual([
      "MIO_ADMIN_ACCESS_KEY 미설정",
      "MIO_ADMIN_SESSION_SECRET 미설정",
    ]);
    vi.stubEnv("MIO_ADMIN_ACCESS_KEY", "short");
    vi.stubEnv("MIO_ADMIN_SESSION_SECRET", "short");
    expect(adminConfig()).toBeNull();
    expect(adminConfigProblems()).toEqual([
      "MIO_ADMIN_ACCESS_KEY 32자 미만",
      "MIO_ADMIN_SESSION_SECRET 32자 미만",
      "두 키 동일",
    ]);
    vi.stubEnv("MIO_ADMIN_SESSION_SECRET", config.sessionSecret);
    expect(adminConfig()).toBeNull();
    expect(adminConfigProblems()).toEqual(["MIO_ADMIN_ACCESS_KEY 32자 미만"]);
    vi.stubEnv("MIO_ADMIN_ACCESS_KEY", config.accessKey);
    vi.stubEnv("MIO_ADMIN_SESSION_SECRET", config.accessKey);
    expect(adminConfig()).toBeNull();
    expect(adminConfigProblems()).toEqual(["두 키 동일"]);
    expect(adminConfigProblems().join(" ")).not.toContain(config.accessKey);
    vi.stubEnv("MIO_ADMIN_SESSION_SECRET", config.sessionSecret);
    expect(adminConfig()).toEqual(config);
    expect(adminConfigProblems()).toEqual([]);
  });
  it("rejects wrong keys, tampering, expiration and rotating either secret", () => {
    const now = 1700000000000;
    const token = createAdminSession(config, now);
    expect(validAccessKey("wrong", config)).toBe(false);
    expect(validAccessKey(config.accessKey, config)).toBe(true);
    expect(validAdminSession(token, config, now)).toBe(true);
    expect(validAdminSession(token + "x", config, now)).toBe(false);
    expect(validAdminSession(token, config, now + SESSION_SECONDS * 1000)).toBe(
      false,
    );
    expect(
      validAdminSession(token, { ...config, accessKey: "c".repeat(64) }, now),
    ).toBe(false);
    expect(
      validAdminSession(
        token,
        { ...config, sessionSecret: "c".repeat(64) },
        now,
      ),
    ).toBe(false);
    expect(validAdminSession(token, null, now)).toBe(false);
    expect(validAdminSession("malformed", config, now)).toBe(false);
  });
  it("checks origin, including missing origin and explicit external host configuration", () => {
    vi.stubEnv("MIO_ADMIN_ORIGIN", "");
    expect(
      sameOrigin(
        new Request("http://localhost:3100/api/admin/session", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toBe(false);
    expect(
      sameOrigin(new Request("http://localhost:3100/api/admin/session")),
    ).toBe(false);
    expect(
      sameOrigin(
        new Request("http://localhost:3100/api/admin/session", {
          headers: { origin: "http://localhost:3100" },
        }),
      ),
    ).toBe(true);
    vi.stubEnv("MIO_ADMIN_ORIGIN", "https://mio.example");
    expect(
      sameOrigin(
        new Request("http://internal/api/admin/session", {
          headers: { origin: "https://mio.example" },
        }),
      ),
    ).toBe(true);
  });
  it("bounds attempts within a process and resets after the window", () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) expect(allowLogin(now)).toBe(true);
    expect(allowLogin(now)).toBe(false);
    expect(allowLogin(now + 15 * 60 * 1000)).toBe(true);
  });
});
