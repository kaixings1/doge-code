---
name: azure-cosmos-ts
description: "Azure Cosmos Ts — Azure Cosmos Ts 相关功能和最佳实践"
risk: unknown
source: community
date_added: '2026-02-27'
---

# @azure/cosmos (TypeScript/JavaScript)

Data plane SDK for Azure Cosmos DB NoSQL API operations — CRUD on documents, queries, bulk operations.

> **⚠️ Data vs Management Plane**
> - **This SDK (@azure/cosmos)**: CRUD operations on documents, queries, stored procedures
> - **Management SDK (@azure/arm-cosmosdb)**: Create accounts, databases, containers via ARM

## 安装

```bash
npm install @azure/cosmos @azure/identity
```

**Current Version**: 4.9.0  
**Node.js**: >= 20.0.0

## 环境变量

```bash
COSMOS_ENDPOINT=https://<account>.documents.azure.com:443/
COSMOS_DATABASE=<database-name>
COSMOS_CONTAINER=<container-name>
# For key-based auth only (prefer AAD)
COSMOS_KEY=<account-key>
```

## 认证

### AAD with DefaultAzureCredential (Recommended)

```typescript
import { CosmosClient } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";

const client = new CosmosClient({
  端点: process.env.COSMOS_ENDPOINT!,
  aadCredentials: new DefaultAzureCredential(),
});
```

### Key-Based Authentication

```typescript
import { CosmosClient } from "@azure/cosmos";

// Option 1: 端点 + Key
const client = new CosmosClient({
  端点: process.env.COSMOS_ENDPOINT!,
  key: process.env.COSMOS_KEY!,
});

// Option 2: Connection String
const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING!);
```

## Resource Hierarchy

```
CosmosClient
└── Database
    └── Container
        ├── Items (documents)
        ├── Scripts (stored procedures, triggers, UDFs)
        └── Conflicts
```

## Core Operations

### Database & Container 设置

```typescript
const { database } = await client.databases.createIfNotExists({
  id: "my-database",
});

const { container } = await database.containers.createIfNotExists({
  id: "my-container",
  partitionKey: { paths: ["/partitionKey"] },
});
```

### Create Document

```typescript
interface Product {
  id: string;
  partitionKey: string;
  name: string;
  price: number;
}

const item: Product = {
  id: "product-1",
  partitionKey: "electronics",
  name: "Laptop",
  price: 999.99,
};

const { resource } = await container.items.create<Product>(item);
```

### Read Document

```typescript
const { resource } = await container
  .item("product-1", "electronics") // id, partitionKey
  .read<Product>();

if (resource) {
  console.log(resource.name);
}
```

### Update Document (Replace)

```typescript
const { resource: existing } = await container
  .item("product-1", "electronics")
  .read<Product>();

if (existing) {
  existing.price = 899.99;
  const { resource: updated } = await container
    .item("product-1", "electronics")
    .replace<Product>(existing);
}
```

### Upsert Document

```typescript
const item: Product = {
  id: "product-1",
  partitionKey: "electronics",
  name: "Laptop Pro",
  price: 1299.99,
};

const { resource } = await container.items.upsert<Product>(item);
```

### Delete Document

```typescript
await container.item("product-1", "electronics").delete();
```

### Patch Document (Partial Update)

```typescript
import { PatchOperation } from "@azure/cosmos";

const operations: PatchOperation[] = [
  { op: "replace", path: "/price", value: 799.99 },
  { op: "add", path: "/discount", value: true },
  { op: "remove", path: "/oldField" },
];

const { resource } = await container
  .item("product-1", "electronics")
  .patch<Product>(operations);
```

## Queries

### Simple 查询

```typescript
const { 资源 } = await container.items
  .查询<Product>("SELECT * FROM c WHERE c.price < 1000")
  .fetchAll();
```

### Parameterized 查询 (Recommended)

```typescript
import { SqlQuerySpec } from "@azure/cosmos";

const querySpec: SqlQuerySpec = {
  查询: "SELECT * FROM c WHERE c.partitionKey = @category AND c.price < @maxPrice",
  parameters: [
    { name: "@category", value: "electronics" },
    { name: "@maxPrice", value: 1000 },
  ],
};

const { 资源 } = await container.items
  .查询<Product>(querySpec)
  .fetchAll();
```

### 查询 with Pagination

```typescript
const queryIterator = container.items.查询<Product>(querySpec, {
  maxItemCount: 10, // Items per page
});

while (queryIterator.hasMoreResults()) {
  const { 资源, continuationToken } = await queryIterator.fetchNext();
  console.log(`Page with ${资源?.length} items`);
  // Use continuationToken for next page if needed
}
```

### Cross-Partition 查询

```typescript
const { 资源 } = await container.items
  .查询<Product>(
    "SELECT * FROM c WHERE c.price > 500",
    { enableCrossPartitionQuery: true }
  )
  .fetchAll();
```

## Bulk Operations

### Execute Bulk Operations

```typescript
import { BulkOperationType, OperationInput } from "@azure/cosmos";

const operations: OperationInput[] = [
  {
    operationType: BulkOperationType.Create,
    resourceBody: { id: "1", partitionKey: "cat-a", name: "Item 1" },
  },
  {
    operationType: BulkOperationType.Upsert,
    resourceBody: { id: "2", partitionKey: "cat-a", name: "Item 2" },
  },
  {
    operationType: BulkOperationType.Read,
    id: "3",
    partitionKey: "cat-b",
  },
  {
    operationType: BulkOperationType.Replace,
    id: "4",
    partitionKey: "cat-b",
    resourceBody: { id: "4", partitionKey: "cat-b", name: "Updated" },
  },
  {
    operationType: BulkOperationType.Delete,
    id: "5",
    partitionKey: "cat-c",
  },
  {
    operationType: BulkOperationType.Patch,
    id: "6",
    partitionKey: "cat-c",
    resourceBody: {
      operations: [{ op: "replace", path: "/name", value: "Patched" }],
    },
  },
];

const 响应 = await container.items.executeBulkOperations(operations);

响应.forEach((result, index) => {
  if (result.statusCode >= 200 && result.statusCode < 300) {
    console.log(`操作 ${index} succeeded`);
  } else {
    console.error(`操作 ${index} failed: ${result.statusCode}`);
  }
});
```

## Partition Keys

### Simple Partition Key

```typescript
const { container } = await database.containers.createIfNotExists({
  id: "products",
  partitionKey: { paths: ["/category"] },
});
```

### Hierarchical Partition Key (MultiHash)

```typescript
import { PartitionKeyDefinitionVersion, PartitionKeyKind } from "@azure/cosmos";

const { container } = await database.containers.createIfNotExists({
  id: "orders",
  partitionKey: {
    paths: ["/tenantId", "/userId", "/sessionId"],
    version: PartitionKeyDefinitionVersion.V2,
    kind: PartitionKeyKind.MultiHash,
  },
});

// Operations require array of partition key values
const { resource } = await container.items.create({
  id: "order-1",
  tenantId: "tenant-a",
  userId: "user-123",
  sessionId: "会话-xyz",
  total: 99.99,
});

// Read with hierarchical partition key
const { resource: order } = await container
  .item("order-1", ["tenant-a", "user-123", "会话-xyz"])
  .read();
```

## 错误处理

```typescript
import { ErrorResponse } from "@azure/cosmos";

try {
  const { resource } = await container.item("missing", "pk").read();
} catch (error) {
  if (error instanceof ErrorResponse) {
    switch (error.code) {
      case 404:
        console.log("Document not found");
        break;
      case 409:
        console.log("Conflict - document already exists");
        break;
      case 412:
        console.log("Precondition failed (ETag mismatch)");
        break;
      case 429:
        console.log("Rate limited - retry after:", error.retryAfterInMs);
        break;
      default:
        console.error(`Cosmos error ${error.code}: ${error.message}`);
    }
  }
  throw error;
}
```

## Optimistic Concurrency (ETags)

```typescript
// Read with ETag
const { resource, etag } = await container
  .item("product-1", "electronics")
  .read<Product>();

if (resource && etag) {
  resource.price = 899.99;
  
  try {
    // Replace only if ETag matches
    await container.item("product-1", "electronics").replace(resource, {
      accessCondition: { type: "IfMatch", condition: etag },
    });
  } catch (error) {
    if (error instanceof ErrorResponse && error.code === 412) {
      console.log("Document was modified by another process");
    }
  }
}
```

## TypeScript Types Reference

```typescript
import {
  // Client & 资源
  CosmosClient,
  Database,
  Container,
  Item,
  Items,
  
  // Operations
  OperationInput,
  BulkOperationType,
  PatchOperation,
  
  // Queries
  SqlQuerySpec,
  SqlParameter,
  FeedOptions,
  
  // Partition Keys
  PartitionKeyDefinition,
  PartitionKeyDefinitionVersion,
  PartitionKeyKind,
  
  // Responses
  ItemResponse,
  FeedResponse,
  ResourceResponse,
  
  // Errors
  ErrorResponse,
} from "@azure/cosmos";
```

## 最佳实践

1. **Use AAD authentication** — Prefer `DefaultAzureCredential` over keys
2. **Always use parameterized queries** — Prevents injection, improves plan caching
3. **Specify partition key** — Avoid cross-partition queries when possible
4. **Use bulk operations** — For multiple writes, use `executeBulkOperations`
5. **Handle 429 errors** — Implement retry logic with exponential backoff
6. **Use ETags for concurrency** — Prevent lost updates in concurrent scenarios
7. **Close client on shutdown** — Call `client.dispose()` in cleanup

## 常见模式

### Service Layer Pattern

```typescript
export class ProductService {
  private container: Container;

  constructor(client: CosmosClient) {
    this.container = client
      .database(process.env.COSMOS_DATABASE!)
      .container(process.env.COSMOS_CONTAINER!);
  }

  async getById(id: string, category: string): Promise<Product | null> {
    try {
      const { resource } = await this.container
        .item(id, category)
        .read<Product>();
      return resource ?? null;
    } catch (error) {
      if (error instanceof ErrorResponse && error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(product: Omit<Product, "id">): Promise<Product> {
    const item = { ...product, id: crypto.randomUUID() };
    const { resource } = await this.container.items.create<Product>(item);
    return resource!;
  }

  async findByCategory(category: string): Promise<Product[]> {
    const querySpec: SqlQuerySpec = {
      查询: "SELECT * FROM c WHERE c.partitionKey = @category",
      parameters: [{ name: "@category", value: category }],
    };
    const { 资源 } = await this.container.items
      .查询<Product>(querySpec)
      .fetchAll();
    return 资源;
  }
}
```

## Related SDKs

| SDK | Purpose | Install |
|-----|---------|---------|
| `@azure/cosmos` | Data plane (this SDK) | `npm install @azure/cosmos` |
| `@azure/arm-cosmosdb` | Management plane (ARM) | `npm install @azure/arm-cosmosdb` |
| `@azure/identity` | Authentication | `npm install @azure/identity` |

## 使用场景
This skill is applicable to execute the 工作流 or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
