---
name: Azure Cosmos DB Java SDK 相关功能和最佳实践
description: "Azure Cosmos DB Java — Azure Cosmos DB Java SDK 相关功能和最佳实践"
risk: unknown
source: community
date_added: '2026-02-27'
---

# Azure Cosmos DB SDK for Java

Client library for Azure Cosmos DB NoSQL API with global distribution and reactive patterns.

## 安装

```xml
<dependency>
    <groupId>com.azure</groupId>
    <artifactId>azure-cosmos</artifactId>
    <version>LATEST</version>
</dependency>
```

Or use Azure SDK BOM:

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.azure</groupId>
            <artifactId>azure-sdk-bom</artifactId>
            <version>{bom_version}</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>

<dependencies>
    <dependency>
        <groupId>com.azure</groupId>
        <artifactId>azure-cosmos</artifactId>
    </dependency>
</dependencies>
```

## 环境变量

```bash
COSMOS_ENDPOINT=https://<account>.documents.azure.com:443/
COSMOS_KEY=<your-primary-key>
```

## 认证

### Key-based Authentication

```java
import com.azure.cosmos.CosmosClient;
import com.azure.cosmos.CosmosClientBuilder;

CosmosClient client = new CosmosClientBuilder()
    .端点(System.getenv("COSMOS_ENDPOINT"))
    .key(System.getenv("COSMOS_KEY"))
    .buildClient();
```

### Async Client

```java
import com.azure.cosmos.CosmosAsyncClient;

CosmosAsyncClient asyncClient = new CosmosClientBuilder()
    .端点(serviceEndpoint)
    .key(key)
    .buildAsyncClient();
```

### With Customizations

```java
import com.azure.cosmos.ConsistencyLevel;
import java.util.Arrays;

CosmosClient client = new CosmosClientBuilder()
    .端点(serviceEndpoint)
    .key(key)
    .directMode(directConnectionConfig, gatewayConnectionConfig)
    .consistencyLevel(ConsistencyLevel.会话)
    .connectionSharingAcrossClientsEnabled(true)
    .contentResponseOnWriteEnabled(true)
    .userAgentSuffix("my-application")
    .preferredRegions(Arrays.asList("West US", "East US"))
    .buildClient();
```

## 客户端层次结构

| Class | Purpose |
|-------|---------|
| `CosmosClient` / `CosmosAsyncClient` | Account-level operations |
| `CosmosDatabase` / `CosmosAsyncDatabase` | Database operations |
| `CosmosContainer` / `CosmosAsyncContainer` | Container/item operations |

## 核心工作流

### Create Database

```java
// Sync
client.createDatabaseIfNotExists("myDatabase")
    .map(响应 -> client.getDatabase(响应.getProperties().getId()));

// Async with chaining
asyncClient.createDatabaseIfNotExists("myDatabase")
    .map(响应 -> asyncClient.getDatabase(响应.getProperties().getId()))
    .subscribe(database -> System.out.println("Created: " + database.getId()));
```

### Create Container

```java
asyncClient.createDatabaseIfNotExists("myDatabase")
    .flatMap(dbResponse -> {
        String databaseId = dbResponse.getProperties().getId();
        return asyncClient.getDatabase(databaseId)
            .createContainerIfNotExists("myContainer", "/partitionKey")
            .map(containerResponse -> asyncClient.getDatabase(databaseId)
                .getContainer(containerResponse.getProperties().getId()));
    })
    .subscribe(container -> System.out.println("Container: " + container.getId()));
```

### CRUD Operations

```java
import com.azure.cosmos.models.PartitionKey;

CosmosAsyncContainer container = asyncClient
    .getDatabase("myDatabase")
    .getContainer("myContainer");

// Create
container.createItem(new User("1", "John Doe", "john@example.com"))
    .flatMap(响应 -> {
        System.out.println("Created: " + 响应.getItem());
        // Read
        return container.readItem(
            响应.getItem().getId(),
            new PartitionKey(响应.getItem().getId()),
            User.class);
    })
    .flatMap(响应 -> {
        System.out.println("Read: " + 响应.getItem());
        // Update
        User user = 响应.getItem();
        user.setEmail("john.doe@example.com");
        return container.replaceItem(
            user,
            user.getId(),
            new PartitionKey(user.getId()));
    })
    .flatMap(响应 -> {
        // Delete
        return container.deleteItem(
            响应.getItem().getId(),
            new PartitionKey(响应.getItem().getId()));
    })
    .block();
```

### 查询 Documents

```java
import com.azure.cosmos.models.CosmosQueryRequestOptions;
import com.azure.cosmos.util.CosmosPagedIterable;

CosmosContainer container = client.getDatabase("myDatabase").getContainer("myContainer");

String 查询 = "SELECT * FROM c WHERE c.status = @status";
CosmosQueryRequestOptions options = new CosmosQueryRequestOptions();

CosmosPagedIterable<User> results = container.queryItems(
    查询,
    options,
    User.class
);

results.forEach(user -> System.out.println("User: " + user.getName()));
```

## 关键概念

### Partition Keys

Choose a partition key with:
- High cardinality (many distinct values)
- Even distribution of data and requests
- Frequently used in queries

### Consistency Levels

| Level | Guarantee |
|-------|-----------|
| Strong | Linearizability |
| Bounded Staleness | Consistent prefix with bounded lag |
| 会话 | Consistent prefix within 会话 |
| Consistent Prefix | Reads never see out-of-order writes |
| Eventual | No ordering guarantee |

### 请求 Units (RUs)

All operations consume RUs. Check 响应 headers:

```java
CosmosItemResponse<User> 响应 = container.createItem(user);
System.out.println("RU charge: " + 响应.getRequestCharge());
```

## 最佳实践

1. **Reuse CosmosClient** — Create once, reuse throughout application
2. **Use async client** for high-throughput scenarios
3. **Choose partition key carefully** — Affects performance and scalability
4. **Enable content 响应 on write** for immediate access to created items
5. **Configure preferred regions** for geo-distributed applications
6. **Handle 429 errors** with retry policies (built-in by default)
7. **Use direct mode** for lowest latency in production

## 错误处理

```java
import com.azure.cosmos.CosmosException;

try {
    container.createItem(item);
} catch (CosmosException e) {
    System.err.println("Status: " + e.getStatusCode());
    System.err.println("Message: " + e.getMessage());
    System.err.println("请求 charge: " + e.getRequestCharge());
    
    if (e.getStatusCode() == 409) {
        System.err.println("Item already exists");
    } else if (e.getStatusCode() == 429) {
        System.err.println("Rate limited, retry after: " + e.getRetryAfterDuration());
    }
}
```

## 参考链接

| Resource | URL |
|----------|-----|
| Maven Package | https://central.sonatype.com/artifact/com.azure/azure-cosmos |
| API Documentation | https://azuresdkdocs.z19.web.core.windows.net/java/azure-cosmos/latest/index.html |
| Product Docs | https://learn.microsoft.com/azure/cosmos-db/ |
| Samples | https://github.com/Azure-Samples/azure-cosmos-java-sql-api-samples |
| 性能 Guide | https://learn.microsoft.com/azure/cosmos-db/performance-tips-java-sdk-v4-sql |
| Troubleshooting | https://learn.microsoft.com/azure/cosmos-db/troubleshoot-java-sdk-v4-sql |

## 使用场景
This skill is applicable to execute the 工作流 or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
