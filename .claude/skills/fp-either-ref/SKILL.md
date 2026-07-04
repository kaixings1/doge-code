---
name: fp-either-ref
description: "fp-ts Either 快速参考：类型安全的同步错误处理模式，包括创建、转换、提取和验证链。"
risk: unknown
source: community
version: 1.0.0
tags: [fp-ts, either, error-handling, validation, quick-reference]
---

# Either /u5feb/u901f/u53c2/u8003

Either = /u6210/u529f/u6216/u5931/u8d25/u3002`Right(value)` /u6216 `Left(error)`/u3002

## /u4f55/u65f6/u4f7f/u7528
- /u9700/u8981/u5904/u7406/u7c7b/u578b/u5316/u540c/u6b65/u9519/u8bef/u5904/u7406/u7684/u5feb/u901f/u53c2/u8003
- /u6d89/u53ca/u9a8c/u8bc1/u3001/u53ef/u80fd/u5931/u8d25/u7684/u64cd/u4f5c/u6216/u5c06/u629b/u51fa/u5f02/u5e38/u7684/u4ee3/u7801/u8f6c/u6362/u4e3a `Either`
- /u60a8/u5e0c/u671b/u83b7/u5f97/u7b80/u6d01/u7684/u5c0f/u6284/u800c/u975e/u957f/u7bc7/u6559/u7a0b

## /u521b/u5efa

```typescript
import * as E from 'fp-ts/Either'

E.right(value)           // Success
E.left(error)            // Failure
E.fromNullable(err)(x)   // null → Left(err), else Right(x)
E.tryCatch(fn, toError)  // try/catch → Either
```

## /u8f6c/u6362

```typescript
E.map(fn)                // Transform Right value
E.mapLeft(fn)            // Transform Left error
E.flatMap(fn)            // Chain (fn returns Either)
E.filterOrElse(pred, toErr) // Right → Left if pred fails
```

## /u63d0/u53d6

```typescript
E.getOrElse(err => default)  // Get Right or default
E.match(onLeft, onRight)     // Pattern match
E.toUnion(either)            // E | A (loses type info)
```

## /u5e38/u89c1/u6a21/u5f0f

```typescript
import { pipe } from 'fp-ts/function'
import * as E from 'fp-ts/Either'

// Validation
const validateEmail = (s: string): E.Either<string, string> =>
  s.includes('@') ? E.right(s) : E.left('Invalid email')

// Chain validations (stops at first error)
pipe(
  E.right({ email: 'test@example.com', age: 25 }),
  E.flatMap(d => pipe(validateEmail(d.email), E.map(() => d))),
  E.flatMap(d => d.age >= 18 ? E.right(d) : E.left('Must be 18+'))
)

// Convert throwing code
const parseJson = (s: string) => E.tryCatch(
  () => JSON.parse(s),
  (e) => `Parse error: ${e}`
)
```

## /u5bf9/u6bd4 try/catch

```typescript
// ❌ try/catch - errors not in types
try {
  const data = JSON.parse(input)
  process(data)
} catch (e) {
  handleError(e)
}

// ✅ Either - errors explicit in types
pipe(
  E.tryCatch(() => JSON.parse(input), String),
  E.map(process),
  E.match(handleError, identity)
)
```

/u5728/u9519/u8bef/u7c7b/u578b/u91cd/u8981/u4e14/u9700/u8981/u94fe/u5f0f/u64cd/u4f5c/u65f6/u4f7f/u7528 Either/u3002

## /u9650/u5236
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
