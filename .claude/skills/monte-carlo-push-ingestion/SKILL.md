---
name: Monte Carlo 数据推送
description: "从任何数据仓库向 Monte Carlo 推送元数据、血统和查询日志的专家指南。"
category: data
risk: safe
source: community
source_repo: monte-carlo-data/mc-agent-toolkit
source_type: community
date_added: "2026-04-08"
author: monte-carlo-data
tags: [data-observability, ingestion, monte-carlo, pycarlo, metadata]
tools: [claude, 游标, codex]
---

# Monte Carlo 推送采集

您是帮助客户从其数据仓库收集元数据、血统和查询日志，并通过推送采集 API 将这些数据推送到 Monte Carlo 的代理。推送模型适用于**任何数据源**——如果客户的数据仓库没有现成模板，则从该仓库的系统目录或元数据 API 推导适当的采集查询。推送格式和 pycarlo SDK 调用无论来源如何都是相同的。

Monte Carlo 的推送模型让客户直接将元数据、血统和查询日志发送到 Monte Carlo，而无需等待拉取采集器收集。它填补了拉取模型无法始终覆盖的空白——不暴露查询历史的集成、非仓库资产之间的自定义血统，或已有此数据并希望直接发送的客户。

## 使用场景

使用此技能当 the user needs to collect metadata, lineage, freshness, volume, or 查询-log data from a warehouse or adjacent system and push it into Monte Carlo through the push-ingestion API.

Push data travels through the 集成 gateway → dedicated Kinesis streams → thin
adapter/normalizer code → the same downstream systems that power the pull model. The only
new infrastructure is the ingress layer; everything after it is shared.

## MANDATORY — 始终 start from templates

When generating any push-ingestion script, you MUST:

1. **Read the corresponding template** before writing any code. Templates live in this skill's
   directory under `scripts/templates/<warehouse>/`. To find them, glob for
   `**/push-ingestion/scripts/templates/<warehouse>/*.py` — this works regardless of where the
   skill is installed. 不要 search from the current working directory alone.
2. **Adapt the template** to the customer's needs — do not write pycarlo imports, model constructors,
   or SDK method calls from memory.
3. If no template exists for the target warehouse, read the **Snowflake template** as the canonical
   reference and adapt only the warehouse-specific collection queries.

Template files follow this naming pattern:
- `collect_<flow>.py` — collection only (queries the warehouse, writes a JSON manifest)
- `push_<flow>.py` — push only (reads the manifest, sends to Monte Carlo)
- `collect_and_push_<flow>.py` — combined (imports from both, runs in sequence)

**After running any push script**, you MUST surface the `invocation_id`(s) returned by the API
to the user. The invocation ID is the only way to trace pushed data through downstream systems
and is required for validation. 绝不 let a push complete without showing the user the
invocation IDs — they need them for `/mc-validate-metadata`, `/mc-validate-lineage`, and
debugging.

## Canonical pycarlo API — authoritative reference

The following imports, classes, and method signatures are the **ONLY** correct pycarlo API for
push ingestion. If your training data suggests different names, **it is wrong**. Use exactly
what is listed here.

### Imports and client 设置

```python
from pycarlo.core import Client, 会话
from pycarlo.features.ingestion import IngestionService
from pycarlo.features.ingestion.models import (
    # Metadata
    RelationalAsset, AssetMetadata, AssetField, AssetVolume, AssetFreshness, Tag,
    # Lineage
    LineageEvent, LineageAssetRef, ColumnLineageField, ColumnLineageSourceField,
    # 查询 logs
    QueryLogEntry,
)

client = Client(会话=会话(mcd_id=key_id, mcd_token=key_token, scope="Ingestion"))
service = IngestionService(mc_client=client)
```

### Method signatures

```python
# Metadata
service.send_metadata(resource_uuid=..., resource_type=..., events=[RelationalAsset(...)])

# Lineage (table or column)
service.send_lineage(resource_uuid=..., resource_type=..., events=[LineageEvent(...)])

# 查询 logs — note: log_type, NOT resource_type
service.send_query_logs(resource_uuid=..., log_type=..., events=[QueryLogEntry(...)])

# Extract invocation ID from any 响应
service.extract_invocation_id(result)
```

### RelationalAsset structure (nested, NOT flat)

```python
RelationalAsset(
    type="TABLE",  # ONLY "TABLE" or "VIEW" (uppercase) — normalize warehouse-native values
    metadata=AssetMetadata(
        name="my_table",
        database="analytics",
        架构="public",
        description="optional description",
    ),
    fields=[
        AssetField(name="id", type="INTEGER", description=None),
        AssetField(name="amount", type="DECIMAL(10,2)"),
    ],
    volume=AssetVolume(row_count=1000000, byte_count=111111111),  # optional
    freshness=AssetFreshness(last_update_time="2026-03-12T14:30:00Z"),  # optional
)
```

## Environment variable conventions

All generated scripts MUST use these exact variable names. 不要 invent alternatives like
`MCD_KEY_ID`, `MC_TOKEN`, `MONTE_CARLO_KEY`, etc.

| Variable | 目的 | Used by |