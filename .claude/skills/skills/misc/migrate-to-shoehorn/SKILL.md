---
name: migrate-to-shoehorn
description: 将测试文件从 `as` 类型断言迁移到 @total-typescript/shoehorn。当用户提到 shoehorn、想要替换测试中的 `as` 或需要部分测试数据时使用。
---

# Migrate to Shoehorn

## Why shoehorn?

`shoehorn` lets you pass partial data in tests while keeping TypeScript happy. It replaces `as` assertions with type-safe alternatives.

**Test code only.** Never use shoehorn in production code.

Problems with `as` in tests:

- Trained not to use it
- Must manually specify target type
- Double-as (`as unknown as Type`) for intentionally wrong data

## Install

```bash
npm i @total-typescript/shoehorn
```

## Migration patterns

### Large objects with few needed properties

Before:

```ts
type Request = {
  body: { id: string };
  headers: Record<string, string>;
  cookies: Record<string, string>;
  // ...20 more properties
};

it("gets user by id", () => {
  // Only care about body.id but must fake entire Request
  getUser({
    body: { id: "123" },
    headers: {},
    cookies: {},
    // ...fake all 20 properties
  });
});
```

After:

```ts
import { fromPartial } from "@total-typescript/shoehorn";

it("gets user by id", () => {
  getUser(
    fromPartial({
      body: { id: "123" },
    }),
  );
});
```

### `as Type` → `fromPartial()`

Before:

```ts
getUser({ body: { id: "123" } } as Request);
```

After:

```ts
import { fromPartial } from "@total-typescript/shoehorn";

getUser(fromPartial({ body: { id: "123" } }));
```

### `as unknown as Type` → `fromAny()`

Before:

```ts
getUser({ body: { id: 123 } } as unknown as Request); // wrong type on purpose
```

After:

```ts
import { fromAny } from "@total-typescript/shoehorn";

getUser(fromAny({ body: { id: 123 } }));
```

## When to use each

| Function        | Use case                                           |
| --------------- | -------------------------------------------------- |
| `fromPartial()` | Pass partial data that still type-checks           |
| `fromAny()`     | Pass intentionally wrong data (keeps autocomplete) |
| `fromExact()`   | Force full object (swap with fromPartial later)    |

## 工作流

1. **Gather requirements** - ask user:
   - What test files have `as` assertions causing problems?
   - Are they dealing with large objects where only some properties matter?
   - Do they need to pass intentionally wrong data for error testing?

2. **Install and migrate**:
   - [ ] Install: `npm i @total-typescript/shoehorn`
   - [ ] Find test files with `as` assertions: `grep -r " as [A-Z]" --include="*.test.ts" --include="*.spec.ts"`
   - [ ] Replace `as Type` with `fromPartial()`
   - [ ] Replace `as unknown as Type` with `fromAny()`
   - [ ] Add imports from `@total-typescript/shoehorn`
   - [ ] Run type check to verify
