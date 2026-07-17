export interface PaginationQuery {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function parsePagination(query: Record<string, unknown>, maxLimit = 100): PaginationQuery {
  const pageRaw = typeof query['page'] === 'string' ? Number(query['page']) : Number(query['page'] ?? 1);
  const limitRaw =
    typeof query['limit'] === 'string' ? Number(query['limit']) : Number(query['limit'] ?? 20);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), maxLimit) : 20;
  return { page, limit, offset: (page - 1) * limit };
}

export function toPaginated<T>(items: T[], total: number, page: number, limit: number): PaginatedResult<T> {
  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
