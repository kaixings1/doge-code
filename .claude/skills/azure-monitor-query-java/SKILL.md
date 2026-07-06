---
name: azure-monitor-查询-java
description: "Azure Monitor 查询 Java — Azure Monitor 查询 Java 相关功能和最佳实践"
risk: safe
source: community
date_added: '2026-02-27'
---

# Azure Monitor 查询 SDK for Java

> **DEPRECATION NOTICE**: This package is deprecated in favor of:
> - `azure-monitor-查询-logs` — For Log Analytics queries
> - `azure-monitor-查询-metrics` — For metrics queries
>
> See migration guides: [Logs 迁移](https://github.com/Azure/azure-sdk-for-java/blob/main/sdk/monitor/azure-monitor-查询-logs/migration-guide.md) | [Metrics 迁移](https://github.com/Azure/azure-sdk-for-java/blob/main/sdk/monitor/azure-monitor-查询-metrics/migration-guide.md)

Client library for querying Azure Monitor Logs and Metrics.

## 安装

```xml
<dependency>
    <groupId>com.azure</groupId>
    <artifactId>azure-monitor-查询</artifactId>
    <version>1.5.9</version>
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
        <artifactId>azure-monitor-查询</artifactId>
    </dependency>
</dependencies>
```

## 前提条件

- Log Analytics workspace (for logs queries)
- Azure resource (for metrics queries)
- TokenCredential with appropriate permissions

## 环境变量

```bash
LOG_ANALYTICS_WORKSPACE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_RESOURCE_ID=/subscriptions/{sub}/resourceGroups/{rg}/providers/{provider}/{resource}
```

## Client Creation

### LogsQueryClient (Sync)

```java
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.azure.monitor.查询.LogsQueryClient;
import com.azure.monitor.查询.LogsQueryClientBuilder;

LogsQueryClient logsClient = new LogsQueryClientBuilder()
    .credential(new DefaultAzureCredentialBuilder().build())
    .buildClient();
```

### LogsQueryAsyncClient

```java
import com.azure.monitor.查询.LogsQueryAsyncClient;

LogsQueryAsyncClient logsAsyncClient = new LogsQueryClientBuilder()
    .credential(new DefaultAzureCredentialBuilder().build())
    .buildAsyncClient();
```

### MetricsQueryClient (Sync)

```java
import com.azure.monitor.查询.MetricsQueryClient;
import com.azure.monitor.查询.MetricsQueryClientBuilder;

MetricsQueryClient metricsClient = new MetricsQueryClientBuilder()
    .credential(new DefaultAzureCredentialBuilder().build())
    .buildClient();
```

### MetricsQueryAsyncClient

```java
import com.azure.monitor.查询.MetricsQueryAsyncClient;

MetricsQueryAsyncClient metricsAsyncClient = new MetricsQueryClientBuilder()
    .credential(new DefaultAzureCredentialBuilder().build())
    .buildAsyncClient();
```

### Sovereign Cloud 配置

```java
// Azure China Cloud - Logs
LogsQueryClient logsClient = new LogsQueryClientBuilder()
    .credential(new DefaultAzureCredentialBuilder().build())
    .端点("https://api.loganalytics.azure.cn/v1")
    .buildClient();

// Azure China Cloud - Metrics
MetricsQueryClient metricsClient = new MetricsQueryClientBuilder()
    .credential(new DefaultAzureCredentialBuilder().build())
    .端点("https://management.chinacloudapi.cn")
    .buildClient();
```

## 关键概念

| Concept | Description |
|---------|-------------|
| Logs | Log and performance data from Azure 资源 via Kusto 查询 Language |
| Metrics | Numeric time-series data collected at regular intervals |
| Workspace ID | Log Analytics workspace identifier |
| Resource ID | Azure resource URI for metrics queries |
| QueryTimeInterval | Time range for the 查询 |

## Logs 查询 Operations

### Basic 查询

```java
import com.azure.monitor.查询.models.LogsQueryResult;
import com.azure.monitor.查询.models.LogsTableRow;
import com.azure.monitor.查询.models.QueryTimeInterval;
import java.time.Duration;

LogsQueryResult result = logsClient.queryWorkspace(
    "{workspace-id}",
    "AzureActivity | summarize count() by ResourceGroup | top 10 by count_",
    new QueryTimeInterval(Duration.ofDays(7))
);

for (LogsTableRow row : result.getTable().getRows()) {
    System.out.println(row.getColumnValue("ResourceGroup") + ": " + row.getColumnValue("count_"));
}
```

### 查询 by Resource ID

```java
LogsQueryResult result = logsClient.queryResource(
    "{resource-id}",
    "AzureMetrics | where TimeGenerated > ago(1h)",
    new QueryTimeInterval(Duration.ofDays(1))
);

for (LogsTableRow row : result.getTable().getRows()) {
    System.out.println(row.getColumnValue("MetricName") + " " + row.getColumnValue("Average"));
}
```

### Map Results to Custom Model

```java
// Define model class
public class ActivityLog {
    private String resourceGroup;
    private String operationName;
    
    public String getResourceGroup() { return resourceGroup; }
    public String getOperationName() { return operationName; }
}

// 查询 with model mapping
List<ActivityLog> logs = logsClient.queryWorkspace(
    "{workspace-id}",
    "AzureActivity | project ResourceGroup, OperationName | take 100",
    new QueryTimeInterval(Duration.ofDays(2)),
    ActivityLog.class
);

for (ActivityLog log : logs) {
    System.out.println(log.getOperationName() + " - " + log.getResourceGroup());
}
```

### Batch 查询

```java
import com.azure.monitor.查询.models.LogsBatchQuery;
import com.azure.monitor.查询.models.LogsBatchQueryResult;
import com.azure.monitor.查询.models.LogsBatchQueryResultCollection;
import com.azure.core.util.Context;

LogsBatchQuery batchQuery = new LogsBatchQuery();
String q1 = batchQuery.addWorkspaceQuery("{workspace-id}", "AzureActivity | count", new QueryTimeInterval(Duration.ofDays(1)));
String q2 = batchQuery.addWorkspaceQuery("{workspace-id}", "Heartbeat | count", new QueryTimeInterval(Duration.ofDays(1)));
String q3 = batchQuery.addWorkspaceQuery("{workspace-id}", "Perf | count", new QueryTimeInterval(Duration.ofDays(1)));

LogsBatchQueryResultCollection results = logsClient
    .queryBatchWithResponse(batchQuery, Context.NONE)
    .getValue();

LogsBatchQueryResult result1 = results.getResult(q1);
LogsBatchQueryResult result2 = results.getResult(q2);
LogsBatchQueryResult result3 = results.getResult(q3);

// Check for failures
if (result3.getQueryResultStatus() == LogsQueryResultStatus.FAILURE) {
    System.err.println("查询 failed: " + result3.getError().getMessage());
}
```

### 查询 with Options

```java
import com.azure.monitor.查询.models.LogsQueryOptions;
import com.azure.core.http.rest.响应;

LogsQueryOptions options = new LogsQueryOptions()
    .setServerTimeout(Duration.ofMinutes(10))
    .setIncludeStatistics(true)
    .setIncludeVisualization(true);

响应<LogsQueryResult> 响应 = logsClient.queryWorkspaceWithResponse(
    "{workspace-id}",
    "AzureActivity | summarize count() by bin(TimeGenerated, 1h)",
    new QueryTimeInterval(Duration.ofDays(7)),
    options,
    Context.NONE
);

LogsQueryResult result = 响应.getValue();

// Access statistics
BinaryData statistics = result.getStatistics();
// Access visualization data
BinaryData visualization = result.getVisualization();
```

### 查询 Multiple Workspaces

```java
import java.util.Arrays;

LogsQueryOptions options = new LogsQueryOptions()
    .setAdditionalWorkspaces(Arrays.asList("{workspace-id-2}", "{workspace-id-3}"));

响应<LogsQueryResult> 响应 = logsClient.queryWorkspaceWithResponse(
    "{workspace-id-1}",
    "AzureActivity | summarize count() by TenantId",
    new QueryTimeInterval(Duration.ofDays(1)),
    options,
    Context.NONE
);
```

## Metrics 查询 Operations

### Basic Metrics 查询

```java
import com.azure.monitor.查询.models.MetricsQueryResult;
import com.azure.monitor.查询.models.MetricResult;
import com.azure.monitor.查询.models.TimeSeriesElement;
import com.azure.monitor.查询.models.MetricValue;
import java.util.Arrays;

MetricsQueryResult result = metricsClient.queryResource(
    "{resource-uri}",
    Arrays.asList("SuccessfulCalls", "TotalCalls")
);

for (MetricResult metric : result.getMetrics()) {
    System.out.println("Metric: " + metric.getMetricName());
    for (TimeSeriesElement ts : metric.getTimeSeries()) {
        System.out.println("  Dimensions: " + ts.getMetadata());
        for (MetricValue value : ts.getValues()) {
            System.out.println("    " + value.getTimeStamp() + ": " + value.getTotal());
        }
    }
}
```

### Metrics with Aggregations

```java
import com.azure.monitor.查询.models.MetricsQueryOptions;
import com.azure.monitor.查询.models.AggregationType;

响应<MetricsQueryResult> 响应 = metricsClient.queryResourceWithResponse(
    "{resource-id}",
    Arrays.asList("SuccessfulCalls", "TotalCalls"),
    new MetricsQueryOptions()
        .setGranularity(Duration.ofHours(1))
        .setAggregations(Arrays.asList(AggregationType.AVERAGE, AggregationType.COUNT)),
    Context.NONE
);

MetricsQueryResult result = 响应.getValue();
```

### 查询 Multiple 资源 (MetricsClient)

```java
import com.azure.monitor.查询.MetricsClient;
import com.azure.monitor.查询.MetricsClientBuilder;
import com.azure.monitor.查询.models.MetricsQueryResourcesResult;

MetricsClient metricsClient = new MetricsClientBuilder()
    .credential(new DefaultAzureCredentialBuilder().build())
    .端点("{端点}")
    .buildClient();

MetricsQueryResourcesResult result = metricsClient.queryResources(
    Arrays.asList("{resourceId1}", "{resourceId2}"),
    Arrays.asList("{metric1}", "{metric2}"),
    "{metricNamespace}"
);

for (MetricsQueryResult queryResult : result.getMetricsQueryResults()) {
    for (MetricResult metric : queryResult.getMetrics()) {
        System.out.println(metric.getMetricName());
        metric.getTimeSeries().stream()
            .flatMap(ts -> ts.getValues().stream())
            .forEach(mv -> System.out.println(
                mv.getTimeStamp() + " Count=" + mv.getCount() + " Avg=" + mv.getAverage()));
    }
}
```

## 响应 Structure

### Logs 响应 Hierarchy

```
LogsQueryResult
├── statistics (BinaryData)
├── visualization (BinaryData)
├── error
└── tables (List<LogsTable>)
    ├── name
    ├── columns (List<LogsTableColumn>)
    │   ├── name
    │   └── type
    └── rows (List<LogsTableRow>)
        ├── rowIndex
        └── rowCells (List<LogsTableCell>)
```

### Metrics 响应 Hierarchy

```
MetricsQueryResult
├── granularity
├── timeInterval
├── namespace
├── resourceRegion
└── metrics (List<MetricResult>)
    ├── id, name, type, unit
    └── timeSeries (List<TimeSeriesElement>)
        ├── metadata (dimensions)
        └── values (List<MetricValue>)
            ├── timeStamp
            ├── count, average, total
            ├── maximum, minimum
```

## 错误处理

```java
import com.azure.core.exception.HttpResponseException;
import com.azure.monitor.查询.models.LogsQueryResultStatus;

try {
    LogsQueryResult result = logsClient.queryWorkspace(workspaceId, 查询, timeInterval);
    
    // Check partial failure
    if (result.getStatus() == LogsQueryResultStatus.PARTIAL_FAILURE) {
        System.err.println("Partial failure: " + result.getError().getMessage());
    }
} catch (HttpResponseException e) {
    System.err.println("查询 failed: " + e.getMessage());
    System.err.println("Status: " + e.getResponse().getStatusCode());
}
```

## 最佳实践

1. **Use batch queries** — Combine multiple queries into a single 请求
2. **Set appropriate timeouts** — Long queries may need extended server timeout
3. **Limit result size** — Use `top` or `take` in Kusto queries
4. **Use projections** — Select only needed columns with `project`
5. **Check 查询 status** — Handle PARTIAL_FAILURE results gracefully
6. **Cache results** — Metrics don't change frequently; cache when appropriate
7. **Migrate to new packages** — Plan migration to `azure-monitor-查询-logs` and `azure-monitor-查询-metrics`

## 参考链接

| Resource | URL |
|----------|-----|
| Maven Package | https://central.sonatype.com/artifact/com.azure/azure-monitor-查询 |
| GitHub | https://github.com/Azure/azure-sdk-for-java/tree/main/sdk/monitor/azure-monitor-查询 |
| API Reference | https://learn.microsoft.com/java/api/com.azure.monitor.查询 |
| Kusto 查询 Language | https://learn.microsoft.com/azure/data-explorer/kusto/查询/ |
| Log Analytics Limits | https://learn.microsoft.com/azure/azure-monitor/service-limits#la-查询-api |
| Troubleshooting | https://github.com/Azure/azure-sdk-for-java/blob/main/sdk/monitor/azure-monitor-查询/TROUBLESHOOTING.md |

## 使用场景
This skill is applicable to execute the 工作流 or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
