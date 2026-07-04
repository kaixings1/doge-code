---
name: fp-pipe-ref
description: "fp-ts pipe 和 flow 快速参考：函数组合模式，pipe 用于值转换，flow 用于创建可复用管道。"
risk: unknown
source: community
version: 1.0.0
tags: [fp-ts, pipe, flow, composition, quick-reference]
---

# pipe /u4e0e flow /u5feb/u901f/u53c2/u8003

## pipe - /u8f6c/u6362/u4e00/u4e2a/u503c

```typescript
import { pipe } from 'fp-ts/function'

// pipe(startValue, fn1, fn2, fn3)
// = fn3(fn2(fn1(startValue)))

const result = pipe(
  '  hello world  ',
  s => s.trim(),
  s => s.toUpperCase(),
  s => s.split(' ')
)
// ['HELLO', 'WORLD']
```

## flow - /u521b/u5efa/u53ef/u590d/u7528/u7684/u7ba1/u9053

```typescript
import { flow } from 'fp-ts/function'

// flow(fn1, fn2, fn3) returns a new function
const process = flow(
  (s: string) => s.trim(),
  s => s.toUpperCase(),
  s => s.split(' ')
)

process('  hello world  ') // ['HELLO', 'WORLD']
process('  foo bar  ')     // ['FOO', 'BAR']
```

## /u4f55/u65f6/u4f7f/u7528
| /u7528/u9014 | /u4f55/u65f6/u4f7f/u7528 |
|-----|------|
| `pipe` | /u7acb/u5373/u8f6c/u6362/u4e00/u4e2a/u5177/u4f53/u503c |
| `flow` | /u521b/u5efa/u53ef/u590d/u7528/u7684/u8f6c/u6362/u51fd/u6570 |

## /u4e0e fp-ts /u7c7b/u578b/u4e00/u8d77/u4f7f/u7528

```typescript
import * as O from 'fp-ts/Option'
import * as A from 'fp-ts/Array'

// Option chain
pipe(
  O.fromNullable(user),
  O.map(u => u.email),
  O.getOrElse(() => 'no email')
)

// Array chain
pipe(
  users,
  A.filter(u => u.active),
  A.map(u => u.name)
)
```

## /u5e38/u89c1/u6a21/u5f0f

```typescript
// /u6570/u636e/u6700/u540e/u7684/u98ce/u683c/u5b9e/u73b0/u90e8/u5206/u5e94/u7528
const getActiveNames = flow(
  A.filter((u: User) => u.active),
  A.map(u => u.name)
)

// /u4efb/u4f55/u5730/u65b9/u90fd/u53ef/u590d/u7528
getActiveNames(users1)
getActiveNames(users2)
```

## /u9650/u5236
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
