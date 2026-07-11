---
name: GraphQL设计
description: GraphQL设计 — 架构设计、解析器模式、订阅、数据加载器和联邦网关。
---

# GraphQL 设计

## 架构 设计

```graphql
type 查询 {
  user(id: ID!): User
  users(过滤器: UserFilter, first: Int = 20, after: String): UserConnection!
}

type Mutation {
  createUser(input: CreateUserInput!): CreateUserPayload!
  updateUser(id: ID!, input: UpdateUserInput!): UpdateUserPayload!
}

type Subscription {
  orderStatusChanged(orderId: ID!): Order!
}

type User {
  id: ID!
  email: String!
  name: String!
  orders(first: Int = 10, after: String): OrderConnection!
  createdAt: DateTime!
}

input CreateUserInput {
  email: String!
  name: String!
}

type CreateUserPayload {
  user: User
  errors: [UserError!]!
}

type UserError {
  field: String!
  message: String!
}

type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type UserEdge {
  node: User!
  游标: String!
}

type PageInfo {
  hasNextPage: Boolean!
  endCursor: String
}
```

为分页使用 Relay 风格的连接。从变更操作返回负载类型，包含结果和错误。

## 解析器

```typescript
const resolvers: Resolvers = {
  查询: {
    user: async (_, { id }, ctx) => {
      return ctx.dataloaders.user.load(id);
    },
    users: async (_, { 过滤器, first, after }, ctx) => {
      const 游标 = after ? decodeCursor(after) : undefined;
      const users = await ctx.db.user.findMany({
        where: buildFilter(过滤器),
        take: first + 1,
        游标: 游标 ? { id: 游标 } : undefined,
        orderBy: { createdAt: "desc" },
      });

      const hasNextPage = users.length > first;
      const edges = users.slice(0, first).map(user => ({
        node: user,
        游标: encodeCursor(user.id),
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          endCursor: edges[edges.length - 1]?.游标 ?? null,
        },
      };
    },
  },

  Mutation: {
    createUser: async (_, { input }, ctx) => {
      const existing = await ctx.db.user.findUnique({ where: { email: input.email } });
      if (existing) {
        return { user: null, errors: [{ field: "email", message: "Already taken" }] };
      }
      const user = await ctx.db.user.create({ data: input });
      return { user, errors: [] };
    },
  },

  User: {
    orders: async (parent, { first, after }, ctx) => {
      return ctx.dataloaders.userOrders.load({ userId: parent.id, first, after });
    },
  },
};
```

## 用于 N+1 预防的 DataLoader

```typescript
import DataLoader from "dataloader";

function createLoaders(db: Database) {
  return {
    user: new DataLoader<string, User>(async (ids) => {
      const users = await db.user.findMany({ where: { id: { in: [...ids] } } });
      const userMap = new Map(users.map(u => [u.id, u]));
      return ids.map(id => userMap.get(id) ?? new Error(`User ${id} not found`));
    }),

    userOrders: new DataLoader<{ userId: string }, Order[]>(async (keys) => {
      const userIds = keys.map(k => k.userId);
      const orders = await db.order.findMany({
        where: { userId: { in: userIds } },
        orderBy: { createdAt: "desc" },
      });
      const grouped = new Map<string, Order[]>();
      orders.forEach(o => {
        const list = grouped.get(o.userId) ?? [];
        list.push(o);
        grouped.set(o.userId, list);
      });
      return keys.map(k => grouped.get(k.userId) ?? []);
    }),
  };
}
```

为每个请求创建新的 DataLoader 实例，以避免跨用户的过期缓存。

## 订阅

```typescript
const pubsub = new PubSub();

const resolvers = {
  Subscription: {
    orderStatusChanged: {
      subscribe: (_, { orderId }) => {
        return pubsub.asyncIterableIterator(`ORDER_STATUS_${orderId}`);
      },
    },
  },
  Mutation: {
    updateOrderStatus: async (_, { id, status }, ctx) => {
      const order = await ctx.db.order.update({ where: { id }, data: { status } });
      await pubsub.publish(`ORDER_STATUS_${id}`, { orderStatusChanged: order });
      return { order, errors: [] };
    },
  },
};
```

## 反模式

- 直接将数据库 架构 暴露为 GraphQL 架构
- 不使用 DataLoader 解析嵌套字段（导致 N+1 查询）
- 对于大数据集使用基于偏移量的分页而非基于游标的分页
- 从解析器抛出原始错误而非返回类型化的错误负载
- 创建单个庞大的 架构 文件而非模块化类型定义
- 允许无界查询而不设深度或复杂度限制

## 检查清单

- [ ] 所有列表字段使用 Relay 风格游标分页
- [ ] 所有批量实体查询使用 DataLoader
- [ ] 变更操作返回同时包含结果和错误字段的负载类型
- [ ] 使用输入类型作为变更参数
- [ ] 配置了查询深度和复杂度限制
- [ ] 在上下文中按请求创建 DataLoader 实例
- [ ] 架构 按领域拆分为独立模块
- [ ] 订阅使用过滤主题以避免广播给所有客户端
