---
name: typescript-advanced
description: TypeScript高级 — 包括泛型、条件类型、映射类型、模板字面量类型和装饰器。
---

# TypeScript 高级

## 带约束的泛型

```typescript
interface HasId {
  id: string;
}

function findById<T extends HasId>(items: T[], id: string): T | undefined {
  return items.find(item => item.id === id);
}

function groupBy<T, K extends string | number>(
  items: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] ??= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

type ApiResponse<T> = {
  data: T;
  meta: { page: number; total: number };
};

async function fetchApi<T>(url: string): Promise<ApiResponse<T>> {
  const res = await fetch(url);
  return res.json();
}
```

## 条件类型

```typescript
type IsString<T> = T extends string ? true : false;

type Flatten<T> = T extends Array<infer U> ? U : T;

type UnwrapPromise<T> = T extends Promise<infer U> ? UnwrapPromise<U> : T;

type FunctionReturn<T> = T extends (...args: any[]) => infer R ? R : never;

type ExtractRouteParams<T extends string> =
  T extends `${string}:${infer Param}/${infer Rest}`
    ? Param | ExtractRouteParams<Rest>
    : T extends `${string}:${infer Param}`
      ? Param
      : never;

type Params = ExtractRouteParams<"/users/:userId/posts/:postId">;
```

## 映射类型

```typescript
type Readonly<T> = { readonly [K in keyof T]: T[K] };

type Optional<T> = { [K in keyof T]?: T[K] };

type Nullable<T> = { [K in keyof T]: T[K] | null };

type PickByType<T, V> = {
  [K in keyof T as T[K] extends V ? K : never]: T[K];
};

interface User {
  id: string;
  name: string;
  age: number;
  active: boolean;
}

type StringFields = PickByType<User, string>;

type EventMap<T> = {
  [K in keyof T as `on${Capitalize<string & K>}`]: (value: T[K]) => void;
};

type UserEvents = EventMap<{ login: User; logout: string }>;
```

## 可辨识联合类型

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) return { ok: false, error: "Division by zero" };
  return { ok: true, value: a / b };
}

const result = divide(10, 2);
if (result.ok) {
  console.log(result.value);
} else {
  console.error(result.error);
}

type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rect"; width: number; height: number }
  | { kind: "triangle"; base: number; height: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle": return Math.PI * shape.radius ** 2;
    case "rect": return shape.width * shape.height;
    case "triangle": return 0.5 * shape.base * shape.height;
  }
}
```

## 类型守卫

```typescript
function isNonNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return typeof obj === "object" && obj !== null && key in obj;
}

const values = [1, null, 2, undefined, 3].过滤器(isNonNull);

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}
```

## 工具类型组合

```typescript
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

type StrictOmit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  { [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>> }[Keys];

type UpdateUserInput = RequireAtLeastOne<{ name: string; email: string; age: number }>;
```

## 反模式

- 对不确定类型的值使用 `any` 而非 `unknown`
- 在类型守卫更安全时使用类型断言（`as`）
- 过度复杂的泛型签名降低可读性
- 不为状态机或结果类型使用可辨识联合类型
- 在字符串字面量联合类型足够时使用 `enum`
- 在 tsconfig 中忽略 `strictNullChecks`

## 检查清单

- [ ] tsconfig 中启用 `strict: true`
- [ ] 外部数据使用 `unknown` 而非 `any`
- [ ] 类型守卫安全验证运行时类型
- [ ] 可辨识联合类型使用穷举 switch 建模状态
- [ ] 泛型约束（`extends`）防止误用
- [ ] 映射类型用于从源类型派生相关类型
- [ ] 优先使用工具类型（`Pick`、`Omit`、`Partial`）而非手动重写类型
- [ ] 模板字面量类型用于字符串模式强制执行
