export class ApiConfigError extends Error {
  constructor(message = "API Base URL 없음") {
    super(message);
    this.name = "ApiConfigError";
  }
}

export function isMockMode(): boolean {
  // 명시적 true 만 mock
  const value = process.env.NEXT_PUBLIC_USE_MOCK_API;
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

export function getApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiConfigError();
  }
  return value.replace(/\/+$/, "");
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalized}`;
}
