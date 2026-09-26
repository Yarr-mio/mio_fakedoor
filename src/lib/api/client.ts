import { apiUrl, isMockMode } from "./config";
import {
  ApiError,
  ApiTransportError,
  parseApiErrorCode,
  type RateLimitInfo,
} from "./errors";
import { buildApiHeaders, SSE_ACCEPT, type ApiHeaderOptions } from "./headers";
import { isJsonRecord, type ApiSuccess, type ApiSuccessMeta } from "./types";
import {
  dispatchMockJson,
  dispatchMockStream,
  mockNetworkWait,
  throwMockJsonError,
} from "./mock-api";

// 서버 소유 필드 요청 제외
const SERVER_OWNED_REQUEST_KEYS = new Set(["mode", "internal", "isInternal"]);

export type ApiRequestOptions = ApiHeaderOptions & {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  signal?: AbortSignal;
  keepalive?: boolean;
  cache?: RequestCache;
  credentials?: RequestCredentials;
};

function omitServerOwnedRequestFields(value: unknown): unknown {
  if (!isJsonRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => !SERVER_OWNED_REQUEST_KEYS.has(key),
    ),
  );
}

function parseIntegerHeader(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseRetryAfterSeconds(headers: Headers): number | null {
  const raw = headers.get("Retry-After");
  if (raw === null || raw.trim() === "") return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }
  const at = Date.parse(trimmed);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

function readRateLimit(headers: Headers): RateLimitInfo | null {
  const limit = parseIntegerHeader(headers.get("X-RateLimit-Limit"));
  const remaining = parseIntegerHeader(headers.get("X-RateLimit-Remaining"));
  const reset = parseIntegerHeader(headers.get("X-RateLimit-Reset"));
  if (limit === null && remaining === null && reset === null) return null;
  return { limit, remaining, reset };
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError({
      code: "UNKNOWN",
      message: "응답 JSON 파싱 실패",
      httpStatus: response.status,
      rateLimit: readRateLimit(response.headers),
    });
  }
}

function parseTraceId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function throwApiError(
  body: unknown,
  httpStatus: number,
  rateLimit: RateLimitInfo | null,
): never {
  const errorBody =
    isJsonRecord(body) && isJsonRecord(body.error) ? body.error : null;
  const rawCode =
    errorBody && typeof errorBody.code === "string" ? errorBody.code : null;
  throw new ApiError({
    code: parseApiErrorCode(rawCode),
    message:
      errorBody && typeof errorBody.message === "string"
        ? errorBody.message
        : "API 오류",
    details: errorBody?.details ?? null,
    traceId: parseTraceId(errorBody?.traceId),
    httpStatus,
    rateLimit,
    rawCode,
  });
}

function parseSuccessEnvelope<T>(
  body: unknown,
  httpStatus: number,
  rateLimit: RateLimitInfo | null,
  retryAfterSeconds: number | null,
): ApiSuccess<T> {
  if (
    !isJsonRecord(body) ||
    body.success !== true ||
    !("data" in body) ||
    !isJsonRecord(body.meta)
  ) {
    throwApiError(body, httpStatus, rateLimit);
  }
  const traceId = parseTraceId(body.meta.traceId);
  if (traceId === null) {
    throw new ApiError({
      code: "UNKNOWN",
      message: "응답 봉투 파싱 실패",
      httpStatus,
      rateLimit,
    });
  }
  const meta: ApiSuccessMeta = { traceId };
  if ("nextCursor" in body.meta) {
    const cursor = body.meta.nextCursor;
    meta.nextCursor =
      cursor === null || typeof cursor === "string" ? cursor : null;
  }
  if (typeof body.meta.hasMore === "boolean") {
    meta.hasMore = body.meta.hasMore;
  }
  // 성공 응답 봉투
  return {
    success: true,
    data: body.data as T,
    meta,
    ...(retryAfterSeconds !== null ? { retryAfterSeconds } : {}),
  };
}

export async function apiRequest<T>(
  options: ApiRequestOptions,
): Promise<ApiSuccess<T>> {
  if (isMockMode()) {
    // mock 모드 실제 요청 생략
    await mockNetworkWait(options.signal);
    const mocked = dispatchMockJson(options.method, options.path, options.body);
    if (
      mocked.status >= 200 &&
      mocked.status < 300 &&
      isJsonRecord(mocked.body) &&
      mocked.body.success === true
    ) {
      return parseSuccessEnvelope<T>(mocked.body, mocked.status, null, null);
    }
    throwMockJsonError(mocked);
  }
  const headers = buildApiHeaders(options);
  const init: RequestInit = {
    method: options.method,
    headers,
    credentials: options.credentials ?? "include", // 쿠키 자동 전송
    cache: options.cache,
    signal: options.signal,
    keepalive: options.keepalive,
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(omitServerOwnedRequestFields(options.body));
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(options.path), init);
  } catch (cause) {
    throw new ApiTransportError(cause);
  }

  const rateLimit = readRateLimit(response.headers);
  const retryAfterSeconds = parseRetryAfterSeconds(response.headers);
  const body = await readBody(response);
  if (response.ok && isJsonRecord(body) && body.success === true) {
    return parseSuccessEnvelope<T>(
      body,
      response.status,
      rateLimit,
      retryAfterSeconds,
    );
  }
  throwApiError(body, response.status, rateLimit);
}

export async function apiRequestStream(
  options: ApiRequestOptions,
): Promise<Response> {
  if (isMockMode()) {
    await mockNetworkWait(options.signal);
    const mocked = dispatchMockStream(
      options.path,
      options.body,
      options.signal,
    );
    if (mocked instanceof Response) return mocked;
    throwMockJsonError(mocked);
  }
  const headers = buildApiHeaders({
    ...options,
    accept: options.accept ?? SSE_ACCEPT,
  });
  const init: RequestInit = {
    method: options.method,
    headers,
    credentials: options.credentials ?? "include",
    cache: options.cache,
    signal: options.signal,
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(omitServerOwnedRequestFields(options.body));
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(options.path), init);
  } catch (cause) {
    throw new ApiTransportError(cause);
  }

  if (response.ok) return response;
  const rateLimit = readRateLimit(response.headers);
  const body = await readBody(response);
  throwApiError(body, response.status, rateLimit);
}
