---
name: fp-types-ref
description: "fp-ts 类型选择快速参考：Option、Either、Task、TaskEither 等核心类型的选用指南和常见模式。"
risk: safe
source: community
version: 1.0.0
tags: [fp-ts, typescript, quick-reference, option, either, task]
---

# fp-ts /u5feb/u901f/u53c2/u8003

## /u4f55/u65f6/u4f7f/u7528
- /u9700/u8981/u5e2e/u52a9/u9009/u62e9 `Option`/u3001`Either`/u3001`Task`/u3001`TaskEither` /u6216/u76f8/u5173 fp-ts /u7c7b/u578b
- /u6d89/u53ca/u5bfc/u5165/u3001/u51b3/u7b56/u6307/u5bfc/u6216/u4e3a TypeScript /u6d41/u7a0b/u9009/u62e9/u5408/u9002/u7684/u62bd/u8c61/u5c42
- /u60a8/u5e0c/u671b/u83b7/u5f97/u5e38/u89c1 fp-ts /u7c7b/u578b/u9009/u62e9/u548c/u6a21/u5f0f/u7684/u7b80/u6d01/u53c2/u8003

## /u5e94/u8be5/u4f7f/u7528/u54ea/u4e2a/u7c7b/u578b/uff1f

```
Is the operation async?
├─ NO: Does it involve errors?
│   ├─ YES → Either<Error, Value>
│   └─ NO: Might value be missing?
│       ├─ YES → Option<Value>
│       └─ NO → Just use the value
└─ YES: Does it involve errors?
    ├─ YES → TaskEither<Error, Value>
    └─ NO: Might value be missing?
        ├─ YES → TaskOption<Value>
        └─ NO → Task<Value>
```

## /u5e38/u89c1/u5bfc/u5165

```typescript
// Core
import { pipe, flow } from 'fp-ts/function'

// Types
import * as O from 'fp-ts/Option'      // Maybe exists
import * as E from 'fp-ts/Either'      // Success or failure
import * as TE from 'fp-ts/TaskEither' // Async + failure
import * as T from 'fp-ts/Task'        // Async (no failure)
import * as A from 'fp-ts/Array'       // Array utilities
```

## /u4e00/u884c/u6a21/u5f0f

| Need | Code |
|------|------|
| Wrap nullable | `O.fromNullable(value)` |
| 默认 value | `O.getOrElse(() => default)` |
| Transform if exists | `O.map(fn)` |
| Chain optionals | `O.flatMap(fn)` |
| Wrap try/catch | `E.tryCatch(() => risky(), toError)` |
| Wrap async | `TE.tryCatch(() => fetch(url), toError)` |
| Run pipe | `pipe(value, fn1, fn2, fn3)` |

## /u6a21/u5f0f/u5339/u914d

```typescript
// Option
pipe(maybe, O.match(
  () => 'nothing',
  (val) => `got ${val}`
))

// Either
pipe(result, E.match(
  (err) => `error: ${err}`,
  (val) => `success: ${val}`
))
```

## /u9650/u5236
- /u4ec5/u5f53/u4efb/u52a1/u660e/u786e/u5339/u914d/u4e0a/u8ff0/u8303/u56f4/u65f6/u4f7f/u7528/u6b64/u6280/u80fd/u3002
- /u4e0d/u8981/u5c06/u8f93/u51fa/u89c6/u4e3a/u7279/u5b9a/u73af/u5883/u9a8c/u8bc1/u3001/u6d4b/u8bd5/u6216/u4e13/u5bb6/u5ba1/u67e5/u7684/u66ff/u4ee3/u54c1/u3002
- /u5982/u679c/u7f3a/u5c11/u5fc5/u8981/u7684/u8f93/u5165/u3001/u6743/u9650/u3001/u5b89/u5168/u8fb9/u754c/u6216/u6210/u529f/u6807/u51c6/uff0c/u8bf7/u505c/u4e0b/u6765/u5e76/u8981/u6c42/u6f84/u6e05/u3002
