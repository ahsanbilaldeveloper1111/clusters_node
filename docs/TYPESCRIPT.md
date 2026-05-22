# TypeScript Advanced Patterns (Frontend)

The frontend demonstrates enterprise TypeScript patterns in `frontend/src/types/advanced.ts`.

## Patterns used

### 1. Generic API wrapper

```typescript
export interface ApiResponse<T> {
  data: T;
  cached?: boolean;
}
```

The `apiRequest<T>()` function returns typed `T` after unwrapping `data`.

### 2. Discriminated unions (async state)

```typescript
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };
```

Used in `useAsync` hook — TypeScript narrows `state.data` only when `status === 'success'`.

### 3. Conditional types

```typescript
type ElementOf<T> = T extends readonly (infer U)[] ? U : never;
```

Extracts element type from array types.

### 4. Mapped types

```typescript
type RolePermissions = {
  [K in UserRole]: readonly string[];
};
```

Maps each role to its permission list for compile-time safety.

### 5. Branded types

```typescript
type UserId = Brand<string, 'UserId'>;
```

Prevents accidentally passing a product ID where a user ID is expected.

### 6. Template literal types

```typescript
type ApiRoute = `/api/${string}`;
```

Documents expected API path shape.

### 7. Type guards

```typescript
export function hasPermission(role: UserRole, permission: string): boolean
```

Runtime check with typed role parameter from `as const` array.

## Backend TypeScript

The backend uses strict mode with:

- `noUncheckedIndexedAccess`
- `noImplicitOverride`
- ESM (`NodeNext` module resolution)
- Zod for runtime validation matching API types
