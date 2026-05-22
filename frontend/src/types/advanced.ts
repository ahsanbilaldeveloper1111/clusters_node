/**
 * Advanced TypeScript patterns used across the frontend:
 * - Generics with constraints
 * - Conditional types
 * - Mapped types
 * - Template literal types
 * - Discriminated unions
 * - Utility type composition
 */

/** API response wrapper — generic over payload type */
export interface ApiResponse<T> {
  data: T;
  cached?: boolean;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Discriminated union for async state machine */
export type AsyncState<T, E = string> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: E };

/** Conditional type: extract array element type */
export type ElementOf<T> = T extends readonly (infer U)[] ? U : never;

/** Mapped type: make specific keys optional */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Template literal for route paths */
export type ApiRoute = `/api/${string}`;

/** Role-based access — keyof + union narrowing */
export const ROLES = ['admin', 'manager', 'customer'] as const;
export type UserRole = (typeof ROLES)[number];

export type RolePermissions = {
  [K in UserRole]: readonly string[];
};

export const PERMISSIONS: RolePermissions = {
  admin: ['analytics', 'orders', 'products', 'system'],
  manager: ['analytics', 'orders', 'products'],
  customer: ['orders', 'products'],
} as const;

/** Type guard */
export function hasPermission(role: UserRole, permission: string): boolean {
  return (PERMISSIONS[role] as readonly string[]).includes(permission);
}

/** Branded type for type-safe IDs */
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };
export type UserId = Brand<string, 'UserId'>;
export type ProductId = Brand<string, 'ProductId'>;

export function asUserId(id: string): UserId {
  return id as UserId;
}

/** Deep readonly utility */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/** Extract promise resolution type */
export type AwaitedReturn<T> = T extends (...args: never[]) => Promise<infer R> ? R : never;
