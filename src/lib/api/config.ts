export class ApiConfigError extends Error {
  constructor(message = 'API Base URL 없음') {
    super(message);
    this.name = 'ApiConfigError';
  }
}

export function getApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiConfigError();
  }
  return value.replace(/\/+$/, '');
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalized}`;
}
