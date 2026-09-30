import {
  adminErrorMessage,
  type AdminTokenSource,
} from "@/lib/api/admin";
import { isApiError } from "@/lib/api/errors";

/** Tab-scoped copy of the login key. Sent as Bearer to /v1/admin/**. */
export const ADMIN_API_KEY_STORAGE = "mio_admin_api_key";
export const ADMIN_LOGIN_NOTICE = "mio_admin_login_notice";

type KeyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): KeyStorage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function rememberAdminApiKey(
  key: string,
  storage: KeyStorage | null = defaultStorage(),
) {
  if (!storage || key.length === 0) return;
  storage.setItem(ADMIN_API_KEY_STORAGE, key);
}

export function readAdminApiKey(
  storage: KeyStorage | null = defaultStorage(),
): string | null {
  const value = storage?.getItem(ADMIN_API_KEY_STORAGE);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function clearAdminApiKey(
  storage: KeyStorage | null = defaultStorage(),
) {
  storage?.removeItem(ADMIN_API_KEY_STORAGE);
}

export function rememberAdminLoginNotice(
  message: string,
  storage: KeyStorage | null = defaultStorage(),
) {
  if (!storage || message.length === 0) return;
  storage.setItem(ADMIN_LOGIN_NOTICE, message);
}

export function takeAdminLoginNotice(
  storage: KeyStorage | null = defaultStorage(),
): string {
  const message = storage?.getItem(ADMIN_LOGIN_NOTICE) ?? "";
  storage?.removeItem(ADMIN_LOGIN_NOTICE);
  return message;
}

export const adminApiKeyTokenSource: AdminTokenSource = {
  getAccessToken() {
    return readAdminApiKey();
  },
};

export function handleAdminUnauthorized(
  error: unknown,
  context: Parameters<typeof adminErrorMessage>[1],
  storage: KeyStorage | null = defaultStorage(),
): string | null {
  if (
    !isApiError(error) ||
    error.code !== "UNAUTHORIZED" ||
    error.httpStatus !== 401
  )
    return null;
  clearAdminApiKey(storage);
  return adminErrorMessage(error, context);
}
