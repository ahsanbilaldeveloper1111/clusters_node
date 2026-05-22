import type { ApiResponse, ApiErrorBody } from '../types/advanced.js';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
};

/** Typed HTTP client with generic response parsing */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${BASE}${path}`, init);

  const json = (await res.json()) as ApiResponse<T> | ApiErrorBody;

  if (!res.ok) {
    const err = json as ApiErrorBody;
    throw new ApiClientError(
      err.error?.message ?? res.statusText,
      res.status,
      err.error?.code ?? 'UNKNOWN'
    );
  }

  return (json as ApiResponse<T>).data;
}

/** Builder pattern for chained API calls */
export function createApiClient(token: string | null) {
  return {
    get: <T>(path: string) => apiRequest<T>(path, { token }),
    post: <T>(path: string, body: unknown) =>
      apiRequest<T>(path, { method: 'POST', body, token }),
  };
}
