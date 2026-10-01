import { describe, expect, it } from "vitest";
import { ApiError } from "./api/errors";
import {
  ADMIN_API_KEY_STORAGE,
  ADMIN_LOGIN_NOTICE,
  adminApiKeyTokenSource,
  clearAdminApiKey,
  handleAdminUnauthorized,
  readAdminApiKey,
  rememberAdminApiKey,
  rememberAdminLoginNotice,
  takeAdminLoginNotice,
} from "./admin-api-key";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
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
}

describe("admin api key", () => {
  it("keeps the login key for bearer calls and drops it on logout", () => {
    const storage = memoryStorage();
    rememberAdminApiKey("a".repeat(64), storage);
    expect(readAdminApiKey(storage)).toBe("a".repeat(64));
    expect(storage.getItem(ADMIN_API_KEY_STORAGE)).toBe("a".repeat(64));
    clearAdminApiKey(storage);
    expect(readAdminApiKey(storage)).toBeNull();
  });

  it("ignores an empty key", () => {
    const storage = memoryStorage();
    rememberAdminApiKey("", storage);
    expect(readAdminApiKey(storage)).toBeNull();
  });

  it("reads the tab key from the shared token source", () => {
    const storage = memoryStorage();
    rememberAdminApiKey("shared-key", storage);
    expect(readAdminApiKey(storage)).toBe("shared-key");
    expect(adminApiKeyTokenSource.getAccessToken()).toBeNull();
  });

  it("shows a login notice once", () => {
    const storage = memoryStorage();
    rememberAdminLoginNotice("관리자 인증이 필요합니다", storage);
    expect(takeAdminLoginNotice(storage)).toBe("관리자 인증이 필요합니다");
    expect(storage.getItem(ADMIN_LOGIN_NOTICE)).toBeNull();
    expect(takeAdminLoginNotice(storage)).toBe("");
  });

  it("clears the stored key when the API rejects the bearer", () => {
    const storage = memoryStorage();
    rememberAdminApiKey("shared-key", storage);
    const message = handleAdminUnauthorized(
      new ApiError({
        code: "UNAUTHORIZED",
        message: "x",
        httpStatus: 401,
      }),
      "metrics",
      storage,
    );
    expect(message).toBe("관리자 인증이 필요합니다");
    expect(readAdminApiKey(storage)).toBeNull();
    expect(
      handleAdminUnauthorized(
        new ApiError({ code: "FORBIDDEN", message: "x", httpStatus: 403 }),
        "segment",
        storage,
      ),
    ).toBeNull();
    rememberAdminApiKey("shared-key", storage);
    expect(
      handleAdminUnauthorized(
        new ApiError({
          code: "RATE_LIMITED",
          message: "x",
          httpStatus: 429,
        }),
        "metrics",
        storage,
      ),
    ).toBeNull();
    expect(readAdminApiKey(storage)).toBe("shared-key");
  });
});
