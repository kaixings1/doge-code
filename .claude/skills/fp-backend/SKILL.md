---
name: 使用 fp-ts 构建类型安全、可测试的后端服务的函数式编程模式
description: "使用 fp-ts 构建类型安全、可测试的后端服务的函数式编程模式。涵盖依赖注入、服务组合和 ReaderTaskEither。"
risk: unknown
source: community
version: 1.0.0
author: kadu
tags:
  - fp-ts
  - typescript
  - backend
  - functional-programming
  - node
  - deno
  - dependency-injection
  - reader-task-either
---

# fp-ts 后端模式

使用 fp-ts 构建类型安全、可测试后端服务的函数式编程模式。

## 何时使用
- 您正在使用 fp-ts 构建或重构 Node.js 或 Deno 后端。
- 任务涉及依赖注入、服务组合或使用 `ReaderTaskEither` 的类型化后端错误。
- 您需要函数式后端架构模式，而非孤立的工具片段。

## 核心概念

### ReaderTaskEither（RTE）

The `ReaderTaskEither<R, E, A>` type is the backbone of functional backend development:
- **R** (Reader): Dependencies/environment (database, config, logger)
- **E** (Either left): Error type
- **A** (Either right): Success value

```typescript
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { pipe } from 'fp-ts/function'

// Define your dependencies
type Deps = {
  db: DatabaseClient
  logger: Logger
  config: Config
}

// Define domain errors
type AppError =
  | { _tag: 'NotFound'; resource: string; id: string }
  | { _tag: 'ValidationError'; message: string }
  | { _tag: 'DatabaseError'; cause: unknown }
  | { _tag: 'Unauthorized'; reason: string }

// A service function
const getUser = (id: string): RTE.ReaderTaskEither<Deps, AppError, User> =>
  pipe(
    RTE.ask<Deps>(),
    RTE.flatMap(({ db, logger }) =>
      pipe(
        RTE.fromTaskEither(db.users.findById(id)),
        RTE.mapLeft((e): AppError => ({ _tag: 'DatabaseError', cause: e })),
        RTE.flatMap(user =>
          user
            ? RTE.right(user)
            : RTE.left({ _tag: 'NotFound', resource: 'User', id })
        ),
        RTE.tap(user => RTE.fromIO(() => logger.info(`Found user: ${user.id}`)))
      )
    )
  )
```

## 服务层模式

### 定义服务模块

Structure services as modules exporting RTE functions:

```typescript
// src/services/user.service.ts
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import * as A from 'fp-ts/Array'
import { pipe } from 'fp-ts/function'

type UserDeps = {
  db: DatabaseClient
  hasher: PasswordHasher
  mailer: EmailService
}

type UserError =
  | { _tag: 'UserNotFound'; id: string }
  | { _tag: 'EmailExists'; email: string }
  | { _tag: 'InvalidPassword' }

// Create user
export const create = (
  input: CreateUserInput
): RTE.ReaderTaskEither<UserDeps, UserError, User> =>
  pipe(
    RTE.ask<UserDeps>(),
    RTE.flatMap(({ db, hasher }) =>
      pipe(
        // Check email uniqueness
        checkEmailUnique(input.email),
        RTE.flatMap(() =>
          RTE.fromTaskEither(hasher.hash(input.password))
        ),
        RTE.flatMap(hashedPassword =>
          RTE.fromTaskEither(
            db.users.create({
              ...input,
              password: hashedPassword,
            })
          )
        )
      )
    )
  )

// Find by ID
export const findById = (
  id: string
): RTE.ReaderTaskEither<UserDeps, UserError, User> =>
  pipe(
    RTE.ask<UserDeps>(),
    RTE.flatMap(({ db }) =>
      pipe(
        RTE.fromTaskEither(db.users.findUnique({ where: { id } })),
        RTE.flatMap(user =>
          user
            ? RTE.right(user)
            : RTE.left({ _tag: 'UserNotFound' as const, id })
        )
      )
    )
  )

// Find many with pagination
export const findMany = (
  params: PaginationParams
): RTE.ReaderTaskEither<UserDeps, UserError, PaginatedResult<User>> =>
  pipe(
    RTE.ask<UserDeps>(),
    RTE.flatMap(({ db }) =>
      RTE.fromTaskEither(
        pipe(
          TE.Do,
          TE.bind('users', () => db.users.findMany({
            skip: params.offset,
            take: params.limit,
          })),
          TE.bind('total', () => db.users.count()),
          TE.map(({ users, total }) => ({
            data: users,
            total,
            ...params,
          }))
        )
      )
    )
  )

const checkEmailUnique = (
  email: string
): RTE.ReaderTaskEither<UserDeps, UserError, void> =>
  pipe(
    RTE.ask<UserDeps>(),
    RTE.flatMap(({ db }) =>
      pipe(
        RTE.fromTaskEither(db.users.findUnique({ where: { email } })),
        RTE.flatMap(existing =>
          existing
            ? RTE.left({ _tag: 'EmailExists' as const, email })
            : RTE.right(undefined)
        )
      )
    )
  )
```

### 组合服务

```typescript
// src/services/order.service.ts
import * as UserService from './user.service'
import * as ProductService from './product.service'
import * as PaymentService from './payment.service'

type OrderDeps = UserService.UserDeps &
  ProductService.ProductDeps &
  PaymentService.PaymentDeps & {
    db: DatabaseClient
  }

export const createOrder = (
  userId: string,
  items: OrderItem[]
): RTE.ReaderTaskEither<OrderDeps, OrderError, Order> =>
  pipe(
    RTE.Do,
    // Validate user exists
    RTE.bind('user', () =>
      pipe(
        UserService.findById(userId),
        RTE.mapLeft(toOrderError)
      )
    ),
    // Validate and get products
    RTE.bind('products', () =>
      pipe(
        items,
        A.traverse(RTE.ApplicativePar)(item =>
          ProductService.findById(item.productId)
        ),
        RTE.mapLeft(toOrderError)
      )
    ),
    // Calculate total
    RTE.bind('total', ({ products }) =>
      RTE.right(calculateTotal(products, items))
    ),
    // Process payment
    RTE.bind('payment', ({ user, total }) =>
      pipe(
        PaymentService.charge(user, total),
        RTE.mapLeft(toOrderError)
      )
    ),
    // Create order
    RTE.flatMap(({ user, products, total, payment }) =>
      createOrderRecord(user, products, items, total, payment)
    )
  )
```

## 函数式依赖注入

### 构建依赖容器

```typescript
// src/deps.ts
import { pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither'
import * as RTE from 'fp-ts/ReaderTaskEither'

// Layer 0: Config (no dependencies)
type Config = {
  database: { url: string; poolSize: number }
  redis: { url: string }
  jwt: { secret: string; expiresIn: string }
}

const loadConfig = (): TE.TaskEither<Error, Config> =>
  TE.tryCatch(
    async () => ({
      database: {
        url: process.env.DATABASE_URL!,
        poolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
      },
      redis: { url: process.env.REDIS_URL! },
      jwt: {
        secret: process.env.JWT_SECRET!,
        expiresIn: process.env.JWT_EXPIRES || '1d',
      },
    }),
    (e) => new Error(`Config error: ${e}`)
  )

// Layer 1: Infrastructure (depends on config)
type Infrastructure = {
  config: Config
  db: PrismaClient
  redis: RedisClient
  logger: Logger
}

const buildInfrastructure = (
  config: Config
): TE.TaskEither<Error, Infrastructure> =>
  pipe(
    TE.Do,
    TE.bind('db', () =>
      TE.tryCatch(
        async () => {
          const prisma = new PrismaClient({
            datasources: { db: { url: config.database.url } },
          })
          await prisma.$connect()
          return prisma
        },
        (e) => new Error(`Database error: ${e}`)
      )
    ),
    TE.bind('redis', () =>
      TE.tryCatch(
        async () => createRedisClient(config.redis.url),
        (e) => new Error(`Redis error: ${e}`)
      )
    ),
    TE.bind('logger', () => TE.right(createLogger())),
    TE.map(({ db, redis, logger }) => ({
      config,
      db,
      redis,
      logger,
    }))
  )

// Layer 2: Services (depends on infrastructure)
type Services = {
  hasher: PasswordHasher
  jwt: JwtService
  mailer: EmailService
}

const buildServices = (infra: Infrastructure): Services => ({
  hasher: createBcryptHasher(),
  jwt: createJwtService(infra.config.jwt),
  mailer: createEmailService(infra.config),
})

// Full application dependencies
export type AppDeps = Infrastructure & Services

export const buildDeps = (): TE.TaskEither<Error, AppDeps> =>
  pipe(
    loadConfig(),
    TE.flatMap(buildInfrastructure),
    TE.map(infra => ({
      ...infra,
      ...buildServices(infra),
    }))
  )

// Cleanup
export const destroyDeps = (deps: AppDeps): TE.TaskEither<Error, void> =>
  pipe(
    TE.tryCatch(
      async () => {
        await deps.db.$disconnect()
        await deps.redis.quit()
      },
      (e) => new Error(`Cleanup error: ${e}`)
    )
  )
```

### 使用依赖运行程序

```typescript
// src/main.ts
import { pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither'
import * as RTE from 'fp-ts/ReaderTaskEither'

const program: RTE.ReaderTaskEither<AppDeps, AppError, void> = pipe(
  RTE.ask<AppDeps>(),
  RTE.flatMap(deps =>
    pipe(
      startServer(deps),
      RTE.fromTaskEither
    )
  )
)

const main = async () => {
  const result = await pipe(
    buildDeps(),
    TE.mapLeft((e): AppError => ({ _tag: 'StartupError', cause: e })),
    TE.flatMap(deps =>
      pipe(
        program(deps),
        TE.tap(() => TE.fromIO(() => console.log('Server running'))),
        // Cleanup on exit
        TE.tapError(() => destroyDeps(deps))
      )
    )
  )()

  if (result._tag === 'Left') {
    console.error('Failed to start:', result.left)
    process.exit(1)
  }
}

main()
```

## 数据库操作

### Prisma 封装

```typescript
// src/lib/db.ts
import * as TE from 'fp-ts/TaskEither'
import * as O from 'fp-ts/Option'
import { PrismaClient, Prisma } from '@prisma/client'

type DbError =
  | { _tag: 'RecordNotFound'; model: string; id: string }
  | { _tag: 'UniqueViolation'; field: string }
  | { _tag: 'ForeignKeyViolation'; field: string }
  | { _tag: 'UnknownDbError'; cause: unknown }

// Wrap Prisma operations
const wrapPrisma = <A>(
  操作: () => Promise<A>
): TE.TaskEither<DbError, A> =>
  TE.tryCatch(操作, (error): DbError => {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002':
          return {
            _tag: 'UniqueViolation',
            field: (error.meta?.target as string[])?.join(', ') || 'unknown',
          }
        case 'P2003':
          return {
            _tag: 'ForeignKeyViolation',
            field: error.meta?.field_name as string || 'unknown',
          }
        case 'P2025':
          return {
            _tag: 'RecordNotFound',
            model: error.meta?.modelName as string || 'unknown',
            id: 'unknown',
          }
      }
    }
    return { _tag: 'UnknownDbError', cause: error }
  })

// Repository factory
export const createRepository = <
  Model,
  CreateInput,
  UpdateInput,
  WhereUnique,
  WhereMany
>(
  db: PrismaClient,
  delegate: {
    findUnique: (args: { where: WhereUnique }) => Promise<Model | null>
    findMany: (args: { where?: WhereMany; skip?: number; take?: number }) => Promise<Model[]>
    create: (args: { data: CreateInput }) => Promise<Model>
    update: (args: { where: WhereUnique; data: UpdateInput }) => Promise<Model>
    delete: (args: { where: WhereUnique }) => Promise<Model>
    count: (args?: { where?: WhereMany }) => Promise<number>
  }
) => ({
  findUnique: (where: WhereUnique): TE.TaskEither<DbError, O.Option<Model>> =>
    pipe(
      wrapPrisma(() => delegate.findUnique({ where })),
      TE.map(O.fromNullable)
    ),

  findMany: (
    where?: WhereMany,
    pagination?: { skip: number; take: number }
  ): TE.TaskEither<DbError, Model[]> =>
    wrapPrisma(() => delegate.findMany({ where, ...pagination })),

  create: (data: CreateInput): TE.TaskEither<DbError, Model> =>
    wrapPrisma(() => delegate.create({ data })),

  update: (
    where: WhereUnique,
    data: UpdateInput
  ): TE.TaskEither<DbError, Model> =>
    wrapPrisma(() => delegate.update({ where, data })),

  delete: (where: WhereUnique): TE.TaskEither<DbError, Model> =>
    wrapPrisma(() => delegate.delete({ where })),

  count: (where?: WhereMany): TE.TaskEither<DbError, number> =>
    wrapPrisma(() => delegate.count({ where })),
})

// Usage
const userRepo = createRepository(prisma, prisma.user)
```

### 事务处理

```typescript
// src/lib/transaction.ts
import * as TE from 'fp-ts/TaskEither'
import * as RTE from 'fp-ts/ReaderTaskEither'
import { PrismaClient } from '@prisma/client'
import { pipe } from 'fp-ts/function'

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
>

type TxDeps = { tx: TxClient }

// Transaction wrapper
export const withTransaction = <R extends { db: PrismaClient }, E, A>(
  program: RTE.ReaderTaskEither<R & TxDeps, E, A>
): RTE.ReaderTaskEither<R, E | DbError, A> =>
  pipe(
    RTE.ask<R>(),
    RTE.flatMap(deps =>
      RTE.fromTaskEither(
        TE.tryCatch(
          () =>
            deps.db.$transaction(async tx => {
              const result = await program({ ...deps, tx })()
              if (result._tag === 'Left') {
                throw result.left // Rollback
              }
              return result.right
            }),
          (error): E | DbError => {
            // Re-throw domain errors
            if (typeof error === 'object' && error !== null && '_tag' in error) {
              return error as E
            }
            return { _tag: 'UnknownDbError', cause: error }
          }
        )
      )
    )
  )

// Usage in service
export const transferFunds = (
  fromId: string,
  toId: string,
  amount: number
): RTE.ReaderTaskEither<AppDeps, TransferError, Transfer> =>
  withTransaction(
    pipe(
      RTE.Do,
      RTE.bind('from', () => debitAccount(fromId, amount)),
      RTE.bind('to', () => creditAccount(toId, amount)),
      RTE.bind('transfer', ({ from, to }) =>
        createTransferRecord(from, to, amount)
      ),
      RTE.map(({ transfer }) => transfer)
    )
  )

// Inside transaction, use tx instead of db
const debitAccount = (
  accountId: string,
  amount: number
): RTE.ReaderTaskEither<TxDeps, TransferError, Account> =>
  pipe(
    RTE.ask<TxDeps>(),
    RTE.flatMap(({ tx }) =>
      RTE.fromTaskEither(
        pipe(
          TE.tryCatch(
            () =>
              tx.account.update({
                where: { id: accountId },
                data: { balance: { decrement: amount } },
              }),
            toDbError
          ),
          TE.flatMap(account =>
            account.balance < 0
              ? TE.left({ _tag: 'InsufficientFunds' as const, accountId })
              : TE.right(account)
          )
        )
      )
    )
  )
```

## 中间件模式

### Express 中间件

```typescript
// src/中间件/fp-express.ts
import { 请求, 响应, NextFunction, RequestHandler } from 'express'
import * as TE from 'fp-ts/TaskEither'
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'

// Convert RTE 处理器 to Express 中间件
export const toHandler =
  <R, E, A>(
    getDeps: (req: 请求) => R,
    处理器: (req: 请求) => RTE.ReaderTaskEither<R, E, A>,
    onError: (error: E, res: 响应) => void
  ): RequestHandler =>
  async (req, res, next) => {
    const deps = getDeps(req)
    const result = await 处理器(req)(deps)()

    pipe(
      result,
      E.fold(
        error => onError(error, res),
        data => res.json(data)
      )
    )
  }

// Error 处理器
const handleError = (error: AppError, res: 响应): void => {
  switch (error._tag) {
    case 'NotFound':
      res.status(404).json({ error: error.resource + ' not found' })
      break
    case 'ValidationError':
      res.status(400).json({ error: error.message })
      break
    case 'Unauthorized':
      res.status(401).json({ error: error.reason })
      break
    default:
      res.status(500).json({ error: 'Internal server error' })
  }
}

// Usage
const getUserHandler = toHandler(
  req => req.app.locals.deps as AppDeps,
  req => UserService.findById(req.params.id),
  handleError
)

app.get('/users/:id', getUserHandler)
```

### Hono 中间件

```typescript
// src/中间件/fp-hono.ts
import { Hono, Context, MiddlewareHandler } from 'hono'
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'

// Store deps in context
declare module 'hono' {
  interface ContextVariableMap {
    deps: AppDeps
  }
}

// Dependency injection 中间件
export const withDeps = (deps: AppDeps): MiddlewareHandler =>
  async (c, next) => {
    c.set('deps', deps)
    await next()
  }

// Convert RTE to Hono 处理器
export const toHonoHandler =
  <E, A>(
    处理器: (c: Context) => RTE.ReaderTaskEither<AppDeps, E, A>,
    onError: (error: E, c: Context) => 响应
  ) =>
  async (c: Context): Promise<响应> => {
    const deps = c.get('deps')
    const result = await 处理器(c)(deps)()

    return pipe(
      result,
      E.fold(
        error => onError(error, c),
        data => c.json(data)
      )
    )
  }

// Validation 中间件
export const validate =
  <T>(架构: z.ZodSchema<T>): MiddlewareHandler =>
  async (c, next) => {
    const body = await c.req.json()
    const result = 架构.safeParse(body)

    if (!result.success) {
      return c.json(
        { error: 'Validation failed', details: result.error.flatten() },
        400
      )
    }

    c.set('validatedBody', result.data)
    await next()
  }

// Auth 中间件 using RTE
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const deps = c.get('deps')
  const 令牌 = c.req.header('授权')?.replace('Bearer ', '')

  if (!令牌) {
    return c.json({ error: 'No 令牌 provided' }, 401)
  }

  const result = await pipe(
    deps.jwt.verify(令牌),
    TE.mapLeft(() => ({ _tag: 'Unauthorized' as const, reason: 'Invalid 令牌' }))
  )()

  if (E.isLeft(result)) {
    return c.json({ error: result.left.reason }, 401)
  }

  c.set('user', result.right)
  await next()
}

// Usage
const app = new Hono()

app.use('*', withDeps(deps))
app.use('/api/*', requireAuth)

app.get(
  '/api/users/:id',
  toHonoHandler(
    c => UserService.findById(c.req.param('id')),
    (error, c) => {
      if (error._tag === 'UserNotFound') {
        return c.json({ error: 'User not found' }, 404)
      }
      return c.json({ error: 'Internal error' }, 500)
    }
  )
)
```

### 请求上下文模式

```typescript
// src/context.ts
import * as RTE from 'fp-ts/ReaderTaskEither'
import { pipe } from 'fp-ts/function'

// 请求-scoped context
type RequestContext = {
  requestId: string
  userId: O.Option<string>
  startTime: number
}

type ContextDeps = AppDeps & { ctx: RequestContext }

// Logging with context
const logWithContext =
  (level: 'info' | 'warn' | 'error') =>
  (message: string, meta?: object): RTE.ReaderTaskEither<ContextDeps, never, void> =>
    pipe(
      RTE.ask<ContextDeps>(),
      RTE.flatMap(({ logger, ctx }) =>
        RTE.fromIO(() =>
          loggerlevel,
            elapsed: Date.now() - ctx.startTime,
          })
        )
      )
    )

export const log = {
  info: logWithContext('info'),
  warn: logWithContext('warn'),
  error: logWithContext('error'),
}

// 中间件 to create context
export const withContext: MiddlewareHandler = async (c, next) => {
  const deps = c.get('deps')
  const ctx: RequestContext = {
    requestId: crypto.randomUUID(),
    userId: O.fromNullable(c.get('user')?.id),
    startTime: Date.now(),
  }

  c.set('deps', { ...deps, ctx })

  // Log 请求 start
  deps.logger.info('请求 started', {
    requestId: ctx.requestId,
    method: c.req.method,
    path: c.req.path,
  })

  await next()

  // Log 请求 end
  deps.logger.info('请求 completed', {
    requestId: ctx.requestId,
    status: c.res.status,
    elapsed: Date.now() - ctx.startTime,
  })
}
```

## 错误处理模式

### 类型化错误层级

```typescript
// src/errors.ts
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'

// Base error types
type DomainError =
  | NotFoundError
  | ValidationError
  | ConflictError
  | AuthError
  | InfrastructureError

type NotFoundError = {
  _tag: 'NotFoundError'
  resource: string
  id: string
}

type ValidationError = {
  _tag: 'ValidationError'
  field: string
  message: string
  value?: unknown
}

type ConflictError = {
  _tag: 'ConflictError'
  resource: string
  field: string
  value: string
}

type AuthError =
  | { _tag: 'Unauthenticated' }
  | { _tag: 'Unauthorized'; required: string }
  | { _tag: 'TokenExpired' }

type InfrastructureError = {
  _tag: 'InfrastructureError'
  service: string
  cause: unknown
}

// Smart constructors
export const notFound = (resource: string, id: string): NotFoundError => ({
  _tag: 'NotFoundError',
  resource,
  id,
})

export const validation = (
  field: string,
  message: string,
  value?: unknown
): ValidationError => ({
  _tag: 'ValidationError',
  field,
  message,
  value,
})

export const conflict = (
  resource: string,
  field: string,
  value: string
): ConflictError => ({
  _tag: 'ConflictError',
  resource,
  field,
  value,
})

// Error to HTTP status mapping
export const toHttpStatus = (error: DomainError): number => {
  switch (error._tag) {
    case 'NotFoundError':
      return 404
    case 'ValidationError':
      return 400
    case 'ConflictError':
      return 409
    case 'Unauthenticated':
      return 401
    case 'Unauthorized':
      return 403
    case 'TokenExpired':
      return 401
    case 'InfrastructureError':
      return 503
    default:
      return 500
  }
}

// Error to 响应 body
export const toResponseBody = (
  error: DomainError
): { error: string; details?: unknown } => {
  switch (error._tag) {
    case 'NotFoundError':
      return { error: `${error.resource} not found` }
    case 'ValidationError':
      return {
        error: 'Validation failed',
        details: { field: error.field, message: error.message },
      }
    case 'ConflictError':
      return {
        error: `${error.resource} with ${error.field} already exists`,
      }
    case 'Unauthenticated':
      return { error: '认证 required' }
    case 'Unauthorized':
      return { error: `Permission denied: ${error.required}` }
    case 'TokenExpired':
      return { error: '令牌 expired' }
    case 'InfrastructureError':
      return { error: 'Service temporarily unavailable' }
  }
}
```

### 错误恢复

```typescript
// src/lib/recovery.ts
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { pipe } from 'fp-ts/function'

// Retry with exponential backoff
export const withRetry =
  <R, E, A>(
    maxAttempts: number,
    baseDelayMs: number,
    shouldRetry: (error: E) => boolean
  ) =>
  (
    操作: RTE.ReaderTaskEither<R, E, A>
  ): RTE.ReaderTaskEither<R, E, A> =>
    pipe(
      RTE.ask<R>(),
      RTE.flatMap(deps => {
        const attempt = (
          remaining: number,
          delay: number
        ): TE.TaskEither<E, A> =>
          pipe(
            操作(deps),
            TE.orElse(error => {
              if (remaining <= 0 || !shouldRetry(error)) {
                return TE.left(error)
              }
              return pipe(
                TE.fromTask(() => new Promise(r => setTimeout(r, delay))),
                TE.flatMap(() => attempt(remaining - 1, delay * 2))
              )
            })
          )

        return RTE.fromTaskEither(attempt(maxAttempts - 1, baseDelayMs))
      })
    )

// Fallback to cached value
export const withFallback =
  <R extends { cache: CacheClient }, E, A>(
    cacheKey: string,
    ttlSeconds: number
  ) =>
  (
    操作: RTE.ReaderTaskEither<R, E, A>
  ): RTE.ReaderTaskEither<R, E, A> =>
    pipe(
      RTE.ask<R>(),
      RTE.flatMap(({ cache, ...rest }) =>
        pipe(
          操作,
          // On success, cache the result
          RTE.tap(result =>
            RTE.fromTaskEither(cache.set(cacheKey, result, ttlSeconds))
          ),
          // On failure, try to get cached value
          RTE.orElse(error =>
            pipe(
              RTE.fromTaskEither(cache.get<A>(cacheKey)),
              RTE.flatMap(cached =>
                cached ? RTE.right(cached) : RTE.left(error)
              )
            )
          )
        )
      )
    )

// Circuit breaker
type CircuitState = 'closed' | 'open' | 'half-open'

export const createCircuitBreaker = <E>(
  failureThreshold: number,
  resetTimeoutMs: number,
  isFailure: (error: E) => boolean
) => {
  let state: CircuitState = 'closed'
  let failures = 0
  let lastFailure = 0

  return <R, A>(
    操作: RTE.ReaderTaskEither<R, E, A>
  ): RTE.ReaderTaskEither<R, E | { _tag: 'CircuitOpen' }, A> =>
    pipe(
      RTE.ask<R>(),
      RTE.flatMap(deps => {
        // Check if circuit should reset
        if (
          state === 'open' &&
          Date.now() - lastFailure > resetTimeoutMs
        ) {
          state = 'half-open'
        }

        if (state === 'open') {
          return RTE.left({ _tag: 'CircuitOpen' as const })
        }

        return pipe(
          操作,
          RTE.tap(() => {
            if (state === 'half-open') {
              state = 'closed'
              failures = 0
            }
            return RTE.right(undefined)
          }),
          RTE.tapError(error => {
            if (isFailure(error)) {
              failures++
              lastFailure = Date.now()
              if (failures >= failureThreshold) {
                state = 'open'
              }
            }
            return RTE.right(undefined)
          })
        )
      })
    )
}
```

## 测试策略

### 模拟依赖

```typescript
// src/services/__tests__/user.service.test.ts
import * as TE from 'fp-ts/TaskEither'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import { describe, it, expect, vi } from 'vitest'
import * as UserService from '../user.service'

// Create mock dependencies
const createMockDeps = (overrides: Partial<UserDeps> = {}): UserDeps => ({
  db: {
    users: {
      findUnique: vi.fn(() => Promise.resolve(null)),
      create: vi.fn(data => Promise.resolve({ id: '1', ...data })),
      update: vi.fn((where, data) => Promise.resolve({ id: where.id, ...data })),
    },
  },
  hasher: {
    hash: vi.fn(password => TE.right(`hashed_${password}`)),
    verify: vi.fn(() => TE.right(true)),
  },
  mailer: {
    send: vi.fn(() => TE.right(undefined)),
  },
  ...overrides,
})

describe('UserService', () => {
  describe('create', () => {
    it('should create a user with hashed password', async () => {
      const deps = createMockDeps()
      const input = {
        email: 'test@example.com',
        password: 'secret123',
        name: 'Test User',
      }

      const result = await UserService.create(input)(deps)()

      expect(E.isRight(result)).toBe(true)
      if (E.isRight(result)) {
        expect(result.right.email).toBe(input.email)
      }
      expect(deps.hasher.hash).toHaveBeenCalledWith('secret123')
    })

    it('should fail when email already exists', async () => {
      const existingUser = { id: '1', email: 'test@example.com' }
      const deps = createMockDeps({
        db: {
          users: {
            findUnique: vi.fn(() => Promise.resolve(existingUser)),
            create: vi.fn(),
          },
        },
      })

      const result = await UserService.create({
        email: 'test@example.com',
        password: 'secret',
        name: 'Test',
      })(deps)()

      expect(E.isLeft(result)).toBe(true)
      if (E.isLeft(result)) {
        expect(result.left._tag).toBe('EmailExists')
      }
    })
  })

  describe('findById', () => {
    it('should return user when found', async () => {
      const user = { id: '1', email: 'test@example.com', name: 'Test' }
      const deps = createMockDeps({
        db: {
          users: {
            findUnique: vi.fn(() => Promise.resolve(user)),
          },
        },
      })

      const result = await UserService.findById('1')(deps)()

      expect(E.isRight(result)).toBe(true)
      if (E.isRight(result)) {
        expect(result.right).toEqual(user)
      }
    })

    it('should return NotFound when user does not exist', async () => {
      const deps = createMockDeps()

      const result = await UserService.findById('nonexistent')(deps)()

      expect(E.isLeft(result)).toBe(true)
      if (E.isLeft(result)) {
        expect(result.left._tag).toBe('UserNotFound')
        expect(result.left.id).toBe('nonexistent')
      }
    })
  })
})
```

### 使用测试容器的集成测试

```typescript
// src/__tests__/集成/user.集成.test.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { PrismaClient } from '@prisma/client'
import * as TE from 'fp-ts/TaskEither'
import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildDeps, destroyDeps, AppDeps } from '../../deps'
import * as UserService from '../../services/user.service'

describe('UserService 集成', () => {
  let container: PostgreSqlContainer
  let deps: AppDeps

  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new PostgreSqlContainer().start()

    // Build real dependencies with test database
    process.env.DATABASE_URL = container.getConnectionUri()

    const depsResult = await buildDeps()()
    if (E.isLeft(depsResult)) {
      throw new Error(`Failed to build deps: ${depsResult.left}`)
    }
    deps = depsResult.right

    // Run migrations
    await deps.db.$executeRaw`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`
    // ... run Prisma migrations
  }, 60000)

  afterAll(async () => {
    await destroyDeps(deps)()
    await container.stop()
  })

  it('should create and retrieve a user', async () => {
    // Create user
    const createResult = await UserService.create({
      email: '集成@test.com',
      password: 'password123',
      name: '集成 Test',
    })(deps)()

    expect(E.isRight(createResult)).toBe(true)
    if (E.isLeft(createResult)) return

    const user = createResult.right

    // Retrieve user
    const findResult = await UserService.findById(user.id)(deps)()

    expect(E.isRight(findResult)).toBe(true)
    if (E.isRight(findResult)) {
      expect(findResult.right.email).toBe('集成@test.com')
    }
  })
})
```

### 基于属性的测试

```typescript
// src/__tests__/property/user.property.test.ts
import * as fc from 'fast-check'
import * as E from 'fp-ts/Either'
import { describe, it, expect } from 'vitest'
import { validateEmail, validatePassword } from '../../validation'

describe('Validation Properties', () => {
  it('valid emails should pass validation', () => {
    fc.assert(
      fc.property(fc.emailAddress(), email => {
        const result = validateEmail(email)
        return E.isRight(result)
      })
    )
  })

  it('passwords meeting requirements should pass', () => {
    const validPassword = fc
      .tuple(
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), {
          minLength: 4,
        }),
        fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), {
          minLength: 1,
        }),
        fc.stringOf(fc.constantFrom(...'0123456789'), { minLength: 1 }),
        fc.stringOf(fc.constantFrom(...'!@#$%^&*'), { minLength: 1 })
      )
      .map(parts => parts.join(''))

    fc.assert(
      fc.property(validPassword, password => {
        const result = validatePassword(password)
        return E.isRight(result)
      })
    )
  })

  it('empty strings should fail email validation', () => {
    const result = validateEmail('')
    expect(E.isLeft(result)).toBe(true)
  })
})
```

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

### Common Imports

```typescript
import * as RTE from 'fp-ts/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as A from 'fp-ts/Array'
import * as T from 'fp-ts/Task'
import { pipe, flow } from 'fp-ts/function'
```

### RTE Cheat Sheet

| 操作 | Description |
|-----------|-------------|
| `RTE.right(a)` | Lift value into success |
| `RTE.left(e)` | Create error |
| `RTE.ask<R>()` | Get dependencies |
| `RTE.fromTaskEither(te)` | Lift TaskEither |
| `RTE.fromEither(e)` | Lift Either |
| `RTE.fromOption(onNone)(o)` | Lift Option |
| `RTE.flatMap(f)` | Chain operations |
| `RTE.map(f)` | Transform success |
| `RTE.mapLeft(f)` | Transform error |
| `RTE.tap(f)` | Side effect on success |
| `RTE.tapError(f)` | Side effect on error |
| `RTE.orElse(f)` | Recover from error |
| `RTE.getOrElse(f)` | Extract with fallback |

### Service Template

```typescript
// Template for a new service
import * as RTE from 'fp-ts/ReaderTaskEither'
import { pipe } from 'fp-ts/function'

type MyServiceDeps = {
  db: DatabaseClient
  // ... other dependencies
}

type MyServiceError =
  | { _tag: 'NotFound'; id: string }
  | { _tag: 'ValidationFailed'; reason: string }

export const myOperation = (
  input: Input
): RTE.ReaderTaskEither<MyServiceDeps, MyServiceError, Output> =>
  pipe(
    RTE.ask<MyServiceDeps>(),
    RTE.flatMap(deps =>
      // Your implementation here
      RTE.right(output)
    )
  )
```

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
