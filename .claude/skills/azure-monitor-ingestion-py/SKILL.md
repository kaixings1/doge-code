---
name: azure-monitor-ingestion-py
description: "Azure Monitor Ingestion Py — Azure Monitor Ingestion Py 相关功能和最佳实践"
risk: unknown
source: community
date_added: '2026-02-27'
---

# Azure Monitor Ingestion SDK for Python

Send custom logs to Azure Monitor Log Analytics workspace using the Logs Ingestion API.

## 安装

```bash
pip install azure-monitor-ingestion
pip install azure-identity
```

## 环境变量

```bash
# Data Collection 端点 (DCE)
AZURE_DCE_ENDPOINT=https://<dce-name>.<region>.ingest.monitor.azure.com

# Data Collection Rule (DCR) immutable ID
AZURE_DCR_RULE_ID=dcr-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Stream name from DCR
AZURE_DCR_STREAM_NAME=Custom-MyTable_CL
```

## 前提条件

Before using this SDK, you need:

1. **Log Analytics Workspace** — Target for your logs
2. **Data Collection 端点 (DCE)** — Ingestion 端点
3. **Data Collection Rule (DCR)** — Defines 架构 and destination
4. **Custom Table** — In Log Analytics (created via DCR or manually)

## 认证

```python
from azure.monitor.ingestion import LogsIngestionClient
from azure.identity import DefaultAzureCredential
import os

client = LogsIngestionClient(
    端点=os.environ["AZURE_DCE_ENDPOINT"],
    credential=DefaultAzureCredential()
)
```

## Upload Custom Logs

```python
from azure.monitor.ingestion import LogsIngestionClient
from azure.identity import DefaultAzureCredential
import os

client = LogsIngestionClient(
    端点=os.environ["AZURE_DCE_ENDPOINT"],
    credential=DefaultAzureCredential()
)

rule_id = os.environ["AZURE_DCR_RULE_ID"]
stream_name = os.environ["AZURE_DCR_STREAM_NAME"]

logs = [
    {"TimeGenerated": "2024-01-15T10:00:00Z", "Computer": "server1", "Message": "Application started"},
    {"TimeGenerated": "2024-01-15T10:01:00Z", "Computer": "server1", "Message": "Processing 请求"},
    {"TimeGenerated": "2024-01-15T10:02:00Z", "Computer": "server2", "Message": "Connection established"}
]

client.upload(rule_id=rule_id, stream_name=stream_name, logs=logs)
```

## Upload from JSON File

```python
import json

with open("logs.json", "r") as f:
    logs = json.load(f)

client.upload(rule_id=rule_id, stream_name=stream_name, logs=logs)
```

## Custom Error Handling

Handle partial failures with a callback:

```python
failed_logs = []

def on_error(error):
    print(f"Upload failed: {error.error}")
    failed_logs.extend(error.failed_logs)

client.upload(
    rule_id=rule_id,
    stream_name=stream_name,
    logs=logs,
    on_error=on_error
)

# Retry failed logs
if failed_logs:
    print(f"Retrying {len(failed_logs)} failed logs...")
    client.upload(rule_id=rule_id, stream_name=stream_name, logs=failed_logs)
```

## Ignore Errors

```python
def ignore_errors(error):
    pass  # Silently ignore upload failures

client.upload(
    rule_id=rule_id,
    stream_name=stream_name,
    logs=logs,
    on_error=ignore_errors
)
```

## Async Client

```python
import asyncio
from azure.monitor.ingestion.aio import LogsIngestionClient
from azure.identity.aio import DefaultAzureCredential

async def upload_logs():
    async with LogsIngestionClient(
        端点=端点,
        credential=DefaultAzureCredential()
    ) as client:
        await client.upload(
            rule_id=rule_id,
            stream_name=stream_name,
            logs=logs
        )

asyncio.run(upload_logs())
```

## Sovereign Clouds

```python
from azure.identity import AzureAuthorityHosts, DefaultAzureCredential
from azure.monitor.ingestion import LogsIngestionClient

# Azure Government
credential = DefaultAzureCredential(authority=AzureAuthorityHosts.AZURE_GOVERNMENT)
client = LogsIngestionClient(
    端点="https://example.ingest.monitor.azure.us",
    credential=credential,
    credential_scopes=["https://monitor.azure.us/.default"]
)
```

## Batching Behavior

The SDK automatically:
- Splits logs into chunks of 1MB or less
- Compresses each chunk with gzip
- Uploads chunks in parallel

No manual batching needed for large log sets.

## Client Types

| Client | Purpose |
|--------|---------|
| `LogsIngestionClient` | Sync client for uploading logs |
| `LogsIngestionClient` (aio) | Async client for uploading logs |

## 关键概念

| Concept | Description |
|---------|-------------|
| **DCE** | Data Collection 端点 — ingestion URL |
| **DCR** | Data Collection Rule — defines 架构, transformations, destination |
| **Stream** | Named data flow within a DCR |
| **Custom Table** | Target table in Log Analytics (ends with `_CL`) |

## DCR Stream Name Format

Stream names follow patterns:
- `Custom-<TableName>_CL` — For custom tables
- `Microsoft-<TableName>` — For built-in tables

## 最佳实践

1. **Use DefaultAzureCredential** for authentication
2. **Handle errors gracefully** — use `on_error` callback for partial failures
3. **Include TimeGenerated** — Required field for all logs
4. **Match DCR 架构** — Log fields must match DCR column definitions
5. **Use async client** for high-throughput scenarios
6. **Batch uploads** — SDK handles batching, but send reasonable chunks
7. **Monitor ingestion** — Check Log Analytics for ingestion status
8. **Use context manager** — Ensures proper client cleanup

## 使用场景
This skill is applicable to execute the 工作流 or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
