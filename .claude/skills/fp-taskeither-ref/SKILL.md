---
name: fp-ts TaskEither 快速参考：异步操作错误处理模式，涵盖 API
description: "fp-ts TaskEither 快速参考：异步操作错误处理模式，涵盖 API 调用、Promise 封装和异步管道组合。"
risk: unknown
source: community
version: 1.0.0
tags: [fp-ts, taskeither, async, promise, error-handling, quick-reference]
---

# TaskEither /u5feb/u901f/u53c2/u8003

TaskEither = /u53ef/u80fd/u5931/u8d25/u7684/u5f02/u6b65/u64cd/u4f5c/u3002/u7c7b/u4f3c `Promise<Either<E, A>>`/u3002

## /u4f55/u65f6/u4f7f/u7528
- /u9700/u8981/u5904/u7406/u53ef/u80fd/u5931/u8d25/u7684/u5f02/u6b65/u64cd/u4f5c/u7684/u5feb/u901f/u53c2/u8003
- /u6d89/u53ca API /u8c03/u7528/u3001Promise /u5c01/u88c5/u6216/u7ec4/u5408/u5f02/u6b65/u9519/u8bef/u5904/u7406/u7ba1/u9053
- /u60a8/u5e0c/u671b/u83b7/u5f97/u7b80/u6d01/u7684 `TaskEither` /u64cd/u4f5c/u7b26/u548c/u6a21/u5f0f/u5c0f/u6284

## /u521b/u5efa

```typescript
import * as TE from 'fp-ts/TaskEither'

TE.right(value)          // Async success
TE.left(error)           // Async failure
TE.tryCatch(asyncFn, toError)  // Promise → TaskEither
TE.fromEither(either)    // Either → TaskEither
```

## /u8f6c/u6362

```typescript
TE.map(fn)               // Transform success value
TE.mapLeft(fn)           // Transform error
TE.flatMap(fn)           // Chain (fn returns TaskEither)
TE.orElse(fn)            // Recover from error
```

## /u6267/u884c

```typescript
// TaskEither is lazy - must call () to run
const result = await myTaskEither()  // Either<E, A>

// Or pattern match
await pipe(
  myTaskEither,
  TE.match(
    (err) => console.error(err),
    (val) => console.log(val)
  )
)()
```

## /u5e38/u89c1/u6a21/u5f0f

```typescript
import { pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither'

// Wrap fetch
const fetchUser = (id: string) => TE.tryCatch(
  () => fetch(`/api/users/${id}`).then(r => r.json()),
  (e) => ({ type: 'NETWORK_ERROR', message: String(e) })
)

// Chain async calls
pipe(
  fetchUser('123'),
  TE.flatMap(user => fetchPosts(user.id)),
  TE.map(posts => posts.length)
)

// Parallel calls
import { sequenceT } from 'fp-ts/Apply'
sequenceT(TE.ApplyPar)(
  fetchUser('1'),
  fetchPosts('1'),
  fetchComments('1')
)

// With recovery
pipe(
  fetchUser('123'),
  TE.orElse(() => TE.right(defaultUser)),
  TE.getOrElse(() => defaultUser)
)
```

## /u5bf9/u6bd4 async/await

```typescript
// ❌ async/await - errors hidden
async function getUser(id: string) {
  try {
    const res = await fetch(`/api/users/${id}`)
    return await res.json()
  } catch (e) {
    return null  // Error info lost
  }
}

// ✅ TaskEither - errors typed and composable
const getUser = (id: string) => pipe(
  TE.tryCatch(() => fetch(`/api/users/${id}`), toNetworkError),
  TE.flatMap(res => TE.tryCatch(() => res.json(), toParseError))
)
```

/u5728/u9700/u8981/u4e3a/u5f02/u6b65/u64cd/u4f5c/u63d0/u4f9b/u7c7b/u578b/u5316/u9519/u8bef/u5904/u7406/u65f6/u4f7f/u7528 TaskEither/u3002

## /u9650/u5236
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
