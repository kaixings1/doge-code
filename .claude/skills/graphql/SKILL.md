---
name: graphql
description: "Graphql — Graphql 相关功能和最佳实践"
  less. One endpoint, typed schema, introspection. But the flexibility that
  makes it powerful also makes it dangerous. Without proper controls, clients
  can craft queries that bring down your server.
risk: safe
source: vibeship-spawner-skills (Apache 2.0)
date_added: 2026-02-27
---

# GraphQL

GraphQL 为客户端提供恰好所需的数据——不多不少。一个
端点，类型化 schema，内省。但使其强大的灵活性
同时也使其危险。如果没有适当的控制，客户端可以
构造出击垮您服务器的查询。

本技能涵盖 schema 设计、解析器、用于 N+1 预防的 DataLoader、
微服务联邦以及与 Apollo/urql 的客户端集成。
关键洞察：GraphQL 是一个契约。schema 就是 API 文档。
请仔细设计。

2025 年的教训：GraphQL 并不总是答案。对于简单的 CRUD，REST
更简单。对于高性能公共 API，带缓存的 REST 胜出。当
您有复杂的数据关系和多样化的客户端需求时，使用 GraphQL。

## 原则

- Schema 优先设计——schema 即契约
- 使用 DataLoader 预防 N+1 查询
- 限制查询深度和复杂度
- 使用片段实现可复用的选择
- 变更操作应具体，而非通用的更新操作
- 错误也是数据——使用联合类型处理预期失败
- 可空性是有意义的——有意图地设计它

## 能力

- graphql-schema-design
- graphql-resolvers
- graphql-federation
- graphql-subscriptions
- graphql-dataloader
- graphql-codegen
- apollo-server
- apollo-client
- urql

## 范围

- database-queries -> postgres-wizard
- authentication -> authentication-oauth
- rest-api-design -> backend
- websocket-infrastructure -> backend

## 工具

### 服务端

- @apollo/server - 何时使用：Apollo Server v4 注意：最流行的 GraphQL 服务器
- graphql-yoga - 何时使用：轻量级替代方案 注意：适合无服务器环境
- mercurius - 何时使用：Fastify 集成 注意：快速，使用 JIT

### 客户端

- @apollo/client - 何时使用：功能完整的客户端 注意：缓存，状态管理
- urql - 何时使用：轻量级替代方案 注意：更小，更简单
- graphql-request - 何时使用：简单请求 注意：最小化，无缓存

### 工具

- graphql-codegen - 何时使用：类型生成 注意：TypeScript 必备
- dataloader - 何时使用：N+1 预防 注意：批量处理与缓存

## 模式

### Schema 设计

具有适当可空性的类型安全 schema

**何时使用**：设计任何 GraphQL API

# SCHEMA DESIGN:

"""
The schema is your API contract. Design nullability
intentionally - non-null fields must always resolve.
"""

type Query {
  # Non-null - will always return user or throw
  user(id: ID!): User!

  # Nullable - returns null if not found
  userByEmail(email: String!): User

  # Non-null list with non-null items
  users(limit: Int = 10, offset: Int = 0): [User!]!

  # Search with pagination
  searchUsers(
    query: String!
    first: Int
    after: String
  ): UserConnection!
}

type Mutation {
  # Input types for complex mutations
  createUser(input: CreateUserInput!): CreateUserPayload!
  updateUser(id: ID!, input: UpdateUserInput!): UpdateUserPayload!
  deleteUser(id: ID!): DeleteUserPayload!
}

type Subscription {
  userCreated: User!
  messageReceived(roomId: ID!): Message!
}

# Input types
input CreateUserInput {
  email: String!
  name: String!
  role: Role = USER
}

input UpdateUserInput {
  email: String
  name: String
  role: Role
}

# Payload types (for errors as data)
type CreateUserPayload {
  user: User
  errors: [Error!]!
}

union UpdateUserPayload = UpdateUserSuccess | NotFoundError | ValidationError

type UpdateUserSuccess {
  user: User!
}

# Enums
enum Role {
  USER
  ADMIN
  MODERATOR
}

# Types with relationships
type User {
  id: ID!
  email: String!
  name: String!
  role: Role!
  posts(limit: Int = 10): [Post!]!
  createdAt: DateTime!
}

type Post {
  id: ID!
  title: String!
  content: String!
  author: User!
  comments: [Comment!]!
  published: Boolean!
}

# Pagination (Relay-style)
type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type UserEdge {
  node: User!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

### 用于 N+1 预防的 DataLoader

批量处理和缓存数据库查询

**何时使用**：解析关系时

# DATALOADER：

"""
没有 DataLoader，获取 10 篇帖子及其作者
需要 11 次查询（1 次获取帖子 + 10 次获取每个作者）。
DataLoader 将其批量化为 2 次查询。
"""

import DataLoader from 'dataloader';

// Create loaders per request
function createLoaders(db) {
  return {
    userLoader: new DataLoader(async (ids) => {
      // Single query for all users
      const users = await db.user.findMany({
        where: { id: { in: ids } }
      });

      // Return in same order as ids
      const userMap = new Map(users.map(u => [u.id, u]));
      return ids.map(id => userMap.get(id) || null);
    }),

    postsByAuthorLoader: new DataLoader(async (authorIds) => {
      const posts = await db.post.findMany({
        where: { authorId: { in: authorIds } }
      });

      // Group by author
      const postsByAuthor = new Map();
      posts.forEach(post => {
        const existing = postsByAuthor.get(post.authorId) || [];
        postsByAuthor.set(post.authorId, [...existing, post]);
      });

      return authorIds.map(id => postsByAuthor.get(id) || []);
    })
  };
}

// Attach to context
const server = new ApolloServer({
  typeDefs,
  resolvers,
});

app.use('/graphql', expressMiddleware(server, {
  context: async ({ req }) => ({
    db,
    loaders: createLoaders(db),
    user: req.user
  })
}));

// Use in resolvers
const resolvers = {
  Post: {
    author: (post, _, { loaders }) => {
      return loaders.userLoader.load(post.authorId);
    }
  },
  User: {
    posts: (user, _, { loaders }) => {
      return loaders.postsByAuthorLoader.load(user.id);
    }
  }
};

### Apollo 客户端缓存

使用类型策略的规范化缓存

**何时使用**：客户端数据管理

# APOLLO 客户端缓存：

"""
Apollo 客户端将响应规范化为扁平缓存。
配置类型策略以实现自定义缓存行为。
"""

import { ApolloClient, InMemoryCache } from '@apollo/client';

const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        // Paginated field
        users: {
          keyArgs: ['query'],  // Cache separately per query
          merge(existing = { edges: [] }, incoming, { args }) {
            // Append for infinite scroll
            if (args?.after) {
              return {
                ...incoming,
                edges: [...existing.edges, ...incoming.edges]
              };
            }
            return incoming;
          }
        }
      }
    },
    User: {
      keyFields: ['id'],  // How to identify users
      fields: {
        fullName: {
          read(_, { readField }) {
            // Computed field
            return `${readField('firstName')} ${readField('lastName')}`;
          }
        }
      }
    }
  }
});

const client = new ApolloClient({
  uri: '/graphql',
  cache,
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network'
    }
  }
});

// Queries with hooks
import { useQuery, useMutation } from '@apollo/client';

const GET_USER = gql`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
      email
    }
  }
`;

function UserProfile({ userId }) {
  const { data, loading, error } = useQuery(GET_USER, {
    variables: { id: userId }
  });

  if (loading) return <Spinner />;
  if (error) return <Error message={error.message} />;

  return <div>{data.user.name}</div>;
}

// Mutations with cache updates
const CREATE_USER = gql`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      user {
        id
        name
        email
      }
      errors {
        field
        message
      }
    }
  }
`;

function CreateUserForm() {
  const [createUser, { loading }] = useMutation(CREATE_USER, {
    update(cache, { data: { createUser } }) {
      // Update cache after mutation
      if (createUser.user) {
        cache.modify({
          fields: {
            users(existing = []) {
              const newRef = cache.writeFragment({
                data: createUser.user,
                fragment: gql`
                  fragment NewUser on User {
                    id
                    name
                    email
                  }
                `
              });
              return [...existing, newRef];
            }
          }
        });
      }
    }
  });
}

### 代码生成

从 schema 生成类型安全操作

**何时使用**：TypeScript 项目

# GRAPHQL CODEGEN：

"""
从您的 schema 和操作生成 TypeScript 类型。
不再需要手动输入查询响应。
"""

# 安装
npm install -D @graphql-codegen/cli
npm install -D @graphql-codegen/typescript
npm install -D @graphql-codegen/typescript-operations
npm install -D @graphql-codegen/typescript-react-apollo

# codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'http://localhost:4000/graphql',
  documents: ['src/**/*.graphql', 'src/**/*.tsx'],
  generates: {
    './src/generated/graphql.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
        'typescript-react-apollo'
      ],
      config: {
        withHooks: true,
        withComponent: false
      }
    }
  }
};

export default config;

# 运行生成
npx graphql-codegen

# 用法 - 完全类型化！
import { useGetUserQuery, useCreateUserMutation } from './generated/graphql';

function UserProfile({ userId }: { userId: string }) {
  const { data, loading } = useGetUserQuery({
    variables: { id: userId }  // 类型已检查！
  });

  // data.user 是完全类型化的
  return <div>{data?.user?.name}</div>;
}

### 使用联合类型进行错误处理

将预期错误作为数据，而非异常

**何时使用**：可能以预期方式失败的操作

# 错误即数据：

"""
对预期失败情况使用联合类型。
GraphQL 错误用于意外失败。
"""

# Schema
type Mutation {
  login(email: String!, password: String!): LoginResult!
}

union LoginResult = LoginSuccess | InvalidCredentials | AccountLocked

type LoginSuccess {
  user: User!
  token: String!
}

type InvalidCredentials {
  message: String!
}

type AccountLocked {
  message: String!
  unlockAt: DateTime
}

# Resolver
const resolvers = {
  Mutation: {
    login: async (_, { email, password }, { db }) => {
      const user = await db.user.findByEmail(email);

      if (!user || !await verifyPassword(password, user.hash)) {
        return {
          __typename: 'InvalidCredentials',
          message: 'Invalid email or password'
        };
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return {
          __typename: 'AccountLocked',
          message: 'Account temporarily locked',
          unlockAt: user.lockedUntil
        };
      }

      return {
        __typename: 'LoginSuccess',
        user,
        token: generateToken(user)
      };
    }
  },

  LoginResult: {
    __resolveType(obj) {
      return obj.__typename;
    }
  }
};

# Client query
const LOGIN = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      ... on LoginSuccess {
        user { id name }
        token
      }
      ... on InvalidCredentials {
        message
      }
      ... on AccountLocked {
        message
        unlockAt
      }
    }
  }
`;

// Handle all cases
const result = data.login;
switch (result.__typename) {
  case 'LoginSuccess':
    setToken(result.token);
    redirect('/dashboard');
    break;
  case 'InvalidCredentials':
    setError(result.message);
    break;
  case 'AccountLocked':
    setError(`${result.message}. Try again at ${result.unlockAt}`);
    break;
}

## 尖锐边缘

### 每个解析器都发起独立的数据库查询

严重性：严重

情境：您编写的解析器单独获取数据。一个查询请求
10 篇帖子及其作者，会产生 11 次数据库查询。对于 100 篇帖子，
那就是 101 次查询。响应时间变成秒级。

症状：
- API 响应缓慢
- 日志中出现许多类似的数据库查询
- 性能随列表大小增加而下降

为什么这会出问题：
GraphQL 解析器独立运行。没有批处理，作者
解析器会为每篇帖子单独运行。数据库被重复的
类似查询反复冲击。

推荐的修复方案：

# USE DATALOADER

import DataLoader from 'dataloader';

// Create loader per request
const userLoader = new DataLoader(async (ids) => {
  const users = await db.user.findMany({
    where: { id: { in: ids } }
  });
  // IMPORTANT: Return in same order as input ids
  const userMap = new Map(users.map(u => [u.id, u]));
  return ids.map(id => userMap.get(id));
});

// Use in resolver
const resolvers = {
  Post: {
    author: (post, _, { loaders }) =>
      loaders.userLoader.load(post.authorId)
  }
};

# Key points:
# 1. Create new loaders per request (for caching scope)
# 2. Return results in same order as input IDs
# 3. Handle missing items (return null, not skip)

### 深度嵌套的查询可能对您的服务器进行拒绝服务攻击

严重性：严重

情境：您的 schema 具有循环关系（user.posts.author.posts...）。
客户端发送一个深度达 20 层的查询。您的服务器尝试解析
它，结果要么超时要么崩溃。

症状：
- 某些查询出现服务器超时
- 内存耗尽
- 嵌套查询响应缓慢

为什么这会出问题：
GraphQL 允许客户端请求任何有效的查询形状。没有
限制，恶意或有 bug 的客户端可以构造需要指数级
工作量的查询。即使是合法的查询也可能意外地过深。

推荐的修复方案：

# LIMIT QUERY DEPTH AND COMPLEXITY

import depthLimit from 'graphql-depth-limit';
import { createComplexityLimitRule } from 'graphql-validation-complexity';

const server = new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [
    // Limit nesting depth
    depthLimit(10),

    // Limit query complexity
    createComplexityLimitRule(1000, {
      scalarCost: 1,
      objectCost: 2,
      listFactor: 10
    })
  ]
});

# Also consider:
# - Query timeout limits
# - Rate limiting per client
# - Persisted queries (only allow pre-registered queries)

### 生产环境启用内省会暴露您的 schema

严重性：高

情境：您在生产环境部署时启用了内省。任何人都可以
查询您的 schema，发现所有类型、变更操作和字段名称。
攻击者确切知道要攻击什么。

症状：
- 通过内省查询可见 schema
- 生产环境可访问 GraphQL Playground
- 完整的类型信息暴露

为什么这会出问题：
内省对开发和工具是必需的，但在
生产环境中，它为攻击者提供了路线图。他们可以找到管理员
变更操作、内部字段以及已弃用但仍可工作的 API。

推荐的修复方案：

# DISABLE INTROSPECTION IN PRODUCTION

const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: process.env.NODE_ENV !== 'production',
  plugins: [
    process.env.NODE_ENV === 'production'
      ? ApolloServerPluginLandingPageDisabled()
      : ApolloServerPluginLandingPageLocal默认()
  ]
});

# Better: Use persisted queries
# Only allow pre-registered queries in production
const server = new ApolloServer({
  typeDefs,
  resolvers,
  persistedQueries: {
    cache: new InMemoryLRUCache()
  }
});

### 仅在 schema 指令中做授权，不在解析器中

严重性：高

情境：您完全依赖 @auth 指令进行授权。有人
找到了绕过指令的方法，或者复杂的业务规则无法
适配简单的指令。授权失败。

症状：
- 未授权访问数据
- 业务规则未强制执行
- 仅依赖指令的安全性被绕过

为什么这会出问题：
指令适合简单检查，但无法处理复杂的
业务逻辑。"用户可以编辑自己的帖子，或他们管理的
组中的任何帖子"无法适配指令。

推荐的修复方案：

# AUTHORIZE IN RESOLVERS

// Simple check in resolver
Mutation: {
  deletePost: async (_, { id }, { user, db }) => {
    if (!user) {
      throw new AuthenticationError('Must be logged in');
    }

    const post = await db.post.findUnique({ where: { id } });

    if (!post) {
      throw new NotFoundError('Post not found');
    }

    // Business logic authorization
    const canDelete =
      post.authorId === user.id ||
      user.role === 'ADMIN' ||
      await userModeratesGroup(user.id, post.groupId);

    if (!canDelete) {
      throw new ForbiddenError('Cannot delete this post');
    }

    return db.post.delete({ where: { id } });
  }
}

// Helper for field-level authorization
User: {
  email: (user, _, { currentUser }) => {
    // Only show email to self or admin
    if (currentUser?.id === user.id || currentUser?.role === 'ADMIN') {
      return user.email;
    }
    return null;
  }
}

### 对查询做了授权但未对字段做授权

严重性：高

情境：您检查用户是否可以访问资源，但不检查单个
字段。用户 A 可以看到用户 B 的公共资料，并且意外地
也看到了他们的私人邮箱和电话号码。

症状：
- 敏感数据暴露
- 隐私违规
- 字段数据对错误用户可见

为什么这会出问题：
字段解析器在父对象返回后运行。如果父
查询返回一个用户，所有字段都会被解析——包括敏感
字段。每个敏感字段都需要自己的权限检查。

推荐的修复方案：

# FIELD-LEVEL AUTHORIZATION

const resolvers = {
  User: {
    // Public fields - no check needed
    id: (user) => user.id,
    name: (user) => user.name,

    // Private fields - check access
    email: (user, _, { currentUser }) => {
      if (!currentUser) return null;
      if (currentUser.id === user.id) return user.email;
      if (currentUser.role === 'ADMIN') return user.email;
      return null;
    },

    phoneNumber: (user, _, { currentUser }) => {
      if (currentUser?.id !== user.id) return null;
      return user.phoneNumber;
    },

    // Or throw instead of returning null
    privateData: (user, _, { currentUser }) => {
      if (currentUser?.id !== user.id) {
        throw new ForbiddenError('Not authorized');
      }
      return user.privateData;
    }
  }
};

### 非空字段失败会导致整个父对象为空

严重性：中

情境：您为了方便将字段设置为非空。某个解析器抛出异常或
返回 null。错误向上传播，使父对象变为 null，
直到整个查询响应为 null 或出错。

症状：
- 查询意外返回 null
- 一个错误影响无关字段
- 无法返回部分数据

为什么这会出问题：
GraphQL 的 null 传播意味着如果非空字段无法解析，
其父对象变为 null。如果该父对象也是非空，则
进一步传播。一个失败的字段可能破坏整个响应。

推荐的修复方案：

# DESIGN NULLABILITY INTENTIONALLY

# WRONG: Everything non-null
type User {
  id: ID!
  name: String!
  email: String!
  avatar: String!      # What if no avatar?
  lastLogin: DateTime! # What if never logged in?
}

# RIGHT: Nullable where appropriate
type User {
  id: ID!              # 始终 exists
  name: String!        # 必需 field
  email: String!       # 必需 field
  avatar: String       # 可选 - may not exist
  lastLogin: DateTime  # Nullable - may be null
}

# For lists:
# [User!]! - Non-null list of non-null users (recommended)
# [User!]  - Nullable list of non-null users
# [User]!  - Non-null list of nullable users (rarely useful)
# [User]   - Nullable list of nullable users (avoid)

# Rule of thumb:
# - Non-null if always present and failure should fail query
# - Nullable if optional or failure shouldn't break response

### 昂贵查询与廉价查询同等对待

严重性：中

情境：每个查询都得到相同处理。一个简单的 user(id) 查询使用
与 users(first: 1000) { posts { comments } } 相同的资源。
昂贵的查询会挤垮廉价的查询。

症状：
- 昂贵查询拖慢一切
- 无法优先处理查询
- 速率限制无效

为什么这会出问题：
并非所有 GraphQL 操作都是平等的。获取 1000 个用户及其
嵌套数据比获取一个用户要昂贵数个数量级。
没有成本分析，您无法正确地进行速率限制。

推荐的修复方案：

# QUERY COST ANALYSIS

import { createComplexityLimitRule } from 'graphql-validation-complexity';

// Define complexity per field
const complexityRules = createComplexityLimitRule(1000, {
  scalarCost: 1,
  objectCost: 10,
  listFactor: 10,
  // Custom field costs
  fieldCost: {
    'Query.searchUsers': 100,
    'Query.analytics': 500,
    'User.posts': ({ args }) => args.limit || 10
  }
});

// For rate limiting by cost
const costPlugin = {
  requestDidStart() {
    return {
      didResolveOperation({ request, document }) {
        const cost = calculateQueryCost(document);
        if (cost > 1000) {
          throw new Error(`Query too expensive: ${cost}`);
        }
        // Track cost for rate limiting
        rateLimiter.consume(request.userId, cost);
      }
    };
  }
};

### 订阅未正确清理

严重性：中

情境：客户端订阅但没有干净地取消订阅。网络问题
留下孤儿订阅。服务器内存随着死
订阅累积而增长。

症状：
- 内存使用随时间增长
- 死连接累积
- 服务器变慢

为什么这会出问题：
每个订阅占用服务器资源。没有在断开连接时
进行适当清理，资源会不断累积。长时间运行的服务器
最终会耗尽内存。

推荐的修复方案：

# PROPER SUBSCRIPTION CLEANUP

import { PubSub, withFilter } from 'graphql-subscriptions';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';

const pubsub = new PubSub();

// Track active subscriptions
const activeSubscriptions = new Map();

const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql'
});

useServer({
  schema,
  context: (ctx) => ({
    pubsub,
    userId: ctx.connectionParams?.userId
  }),
  onConnect: (ctx) => {
    console.log('Client connected');
  },
  onDisconnect: (ctx) => {
    // Clean up resources for this connection
    const userId = ctx.connectionParams?.userId;
    activeSubscriptions.delete(userId);
  }
}, wsServer);

// Subscription resolver with cleanup
Subscription: {
  messageReceived: {
    subscribe: withFilter(
      (_, { roomId }, { pubsub, userId }) => {
        // Track subscription
        activeSubscriptions.set(userId, roomId);
        return pubsub.asyncIterator(`ROOM_${roomId}`);
      },
      (payload, { roomId }) => {
        return payload.roomId === roomId;
      }
    )
  }
}

## Validation Checks

### Introspection enabled in production

Severity: WARNING

Message: Introspection should be disabled in production

Fix action: Set introspection: process.env.NODE_ENV !== 'production'

### Direct database query in resolver

Severity: WARNING

Message: 考虑 using DataLoader to batch and cache queries

Fix action: Create DataLoader and use .load() instead of direct query

### No query depth limiting

Severity: WARNING

Message: 考虑 adding depth limiting to prevent DoS

Fix action: Add validationRules: [depthLimit(10)]

### Resolver without try-catch

Severity: INFO

Message: 考虑 wrapping resolver logic in try-catch

Fix action: Add error handling to provide better error messages

### JSON or Any type in schema

Severity: INFO

Message: Avoid JSON/Any types - they bypass GraphQL's type safety

Fix action: Define proper input/output types

### Mutation returns bare type instead of payload

Severity: INFO

Message: 考虑 using payload types for mutations (includes errors)

Fix action: Create CreateUserPayload type with user and errors fields

### List field without pagination arguments

Severity: INFO

Message: List fields should have pagination (limit, first, after)

Fix action: Add arguments: field(limit: Int, offset: Int): [Type!]!

### Query hook without error handling

Severity: INFO

Message: Handle query errors in UI

Fix action: Destructure and handle error: const { error } = useQuery(...)

### Using refetch instead of cache update

Severity: INFO

Message: 考虑 cache update instead of refetch for better UX

Fix action: Use update function to modify cache directly

## Collaboration

### Delegation Triggers

- user needs database optimization -> postgres-wizard (Optimize queries for GraphQL resolvers)
- user needs authentication system -> authentication-oauth (Auth for GraphQL context)
- user needs caching layer -> caching-strategies (Response caching, DataLoader caching)
- user needs real-time infrastructure -> backend (WebSocket setup for subscriptions)

## 相关 Skills

Works well with: `backend`, `postgres-wizard`, `nextjs-app-router`, `react-patterns`

## 使用场景
- User mentions or implies: graphql
- User mentions or implies: graphql schema
- User mentions or implies: graphql resolver
- User mentions or implies: apollo server
- User mentions or implies: apollo client
- User mentions or implies: graphql federation
- User mentions or implies: dataloader
- User mentions or implies: graphql codegen
- User mentions or implies: graphql query
- User mentions or implies: graphql mutation

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
