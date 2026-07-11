---
name: 指导 Python 开发者使用 Azure Cosmos DB 客户端库处理 NoSQL 数据。
description: "指导 Python 开发者使用 Azure Cosmos DB 客户端库处理 NoSQL 数据。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# Azure Cosmos DB (Python) 服务实现

Build production-grade Azure Cosmos DB NoSQL services following clean code, security best practices, and TDD principles.

## 安装

```bash
pip install azure-cosmos azure-identity
```

## 环境变量

```bash
COSMOS_ENDPOINT=https://<account>.documents.azure.com:443/
COSMOS_DATABASE_NAME=<database-name>
COSMOS_CONTAINER_ID=<container-id>
# For emulator only (not production)
COSMOS_KEY=<emulator-key>
```

## 认证

**DefaultAzureCredential (preferred)**:
```python
from azure.cosmos import CosmosClient
from azure.identity import DefaultAzureCredential

client = CosmosClient(
    url=os.environ["COSMOS_ENDPOINT"],
    credential=DefaultAzureCredential()
)
```

**Emulator (local development)**:
```python
from azure.cosmos import CosmosClient

client = CosmosClient(
    url="https://localhost:8081",
    credential=os.environ["COSMOS_KEY"],
    connection_verify=False
)
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FastAPI Router                          │
│  - Auth dependencies (get_current_user, get_current_user_required)
│  - HTTP error responses (HTTPException)                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                        Service Layer                            │
│  - Business logic and validation                                │
│  - Document ↔ Model conversion                                  │
│  - Graceful degradation when Cosmos unavailable                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                     Cosmos DB Client Module                     │
│  - Singleton container initialization                           │
│  - Dual auth: DefaultAzureCredential (Azure) / Key (emulator)   │
│  - Async wrapper via run_in_threadpool                          │
└─────────────────────────────────────────────────────────────────┘
```

## 快速入门

### 1. Client Module 设置

Create a singleton Cosmos client with dual authentication:

```python
# db/cosmos.py
from azure.cosmos import CosmosClient
from azure.identity import DefaultAzureCredential
from starlette.concurrency import run_in_threadpool

_cosmos_container = None

def _is_emulator_endpoint(端点: str) -> bool:
    return "localhost" in 端点 or "127.0.0.1" in 端点

async def get_container():
    global _cosmos_container
    if _cosmos_container is None:
        if _is_emulator_endpoint(settings.cosmos_endpoint):
            client = CosmosClient(
                url=settings.cosmos_endpoint,
                credential=settings.cosmos_key,
                connection_verify=False
            )
        else:
            client = CosmosClient(
                url=settings.cosmos_endpoint,
                credential=DefaultAzureCredential()
            )
        db = client.get_database_client(settings.cosmos_database_name)
        _cosmos_container = db.get_container_client(settings.cosmos_container_id)
    return _cosmos_container
```

**Full implementation**: See references/client-设置.md

### 2. Pydantic Model Hierarchy

Use five-tier model pattern for clean separation:

```python
class ProjectBase(BaseModel):           # Shared fields
    name: str = Field(..., min_length=1, max_length=200)

class ProjectCreate(ProjectBase):       # Creation 请求
    workspace_id: str = Field(..., alias="workspaceId")

class ProjectUpdate(BaseModel):         # Partial updates (all optional)
    name: Optional[str] = Field(None, min_length=1)

class Project(ProjectBase):             # API 响应
    id: str
    created_at: datetime = Field(..., alias="createdAt")

class ProjectInDB(Project):             # Internal with docType
    doc_type: str = "project"
```

### 3. Service Layer Pattern

```python
class ProjectService:
    def _use_cosmos(self) -> bool:
        return get_container() is not None
    
    async def get_by_id(self, project_id: str, workspace_id: str) -> Project | None:
        if not self._use_cosmos():
            return None
        doc = await get_document(project_id, partition_key=workspace_id)
        if doc is None:
            return None
        return self._doc_to_model(doc)
```

**Full patterns**: See references/service-layer.md

## 核心原则

### Security Requirements

1. **RBAC Authentication**: Use `DefaultAzureCredential` in Azure — never store keys in code
2. **Emulator-Only Keys**: Hardcode the well-known emulator key only for local development
3. **Parameterized Queries**: Always use `@参数` syntax — never string concatenation
4. **Partition Key Validation**: Validate partition key access matches user authorization

### Clean Code Conventions

1. **Single Responsibility**: Client module handles connection; services handle business logic
2. **Graceful Degradation**: Services return `None`/`[]` when Cosmos unavailable
3. **Consistent Naming**: `_doc_to_model()`, `_model_to_doc()`, `_use_cosmos()`
4. **Type Hints**: Full typing on all public methods
5. **CamelCase Aliases**: Use `Field(alias="camelCase")` for JSON serialization

### TDD Requirements

Write tests BEFORE implementation using these patterns:

```python
@pytest.fixture
def mock_cosmos_container(mocker):
    container = mocker.MagicMock()
    mocker.patch("app.db.cosmos.get_container", return_value=container)
    return container

@pytest.mark.asyncio
async def test_get_project_by_id_returns_project(mock_cosmos_container):
    # Arrange
    mock_cosmos_container.read_item.return_value = {"id": "123", "name": "Test"}
    
    # Act
    result = await project_service.get_by_id("123", "workspace-1")
    
    # Assert
    assert result.id == "123"
    assert result.name == "Test"
```

**Full testing guide**: See references/testing.md

## 参考文件

| File | When to Read |
|------|--------------|
| references/client-设置.md | Setting up Cosmos client with dual auth, SSL config, singleton pattern |
| references/service-layer.md | Implementing full service class with CRUD, conversions, graceful degradation |
| references/testing.md | Writing pytest tests, mocking Cosmos, integration test 设置 |
| references/partitioning.md | Choosing partition keys, cross-partition queries, move operations |
| references/error-handling.md | Handling CosmosResourceNotFoundError, logging, HTTP error mapping |

## Template Files

| File | Purpose |
|------|---------|
| assets/cosmos_client_template.py | Ready-to-use client module |
| assets/service_template.py | Service class skeleton |
| assets/conftest_template.py | pytest fixtures for Cosmos mocking |

## Quality Attributes (NFRs)

### Reliability
- Graceful degradation when Cosmos unavailable
- Retry logic with exponential backoff for transient failures
- Connection pooling via singleton pattern

### Security
- Zero secrets in code (RBAC via DefaultAzureCredential)
- Parameterized queries prevent injection
- Partition key isolation enforces data boundaries

### Maintainability
- Five-tier model pattern enables 架构 evolution
- Service layer decouples business logic from storage
- Consistent patterns across all entity services

### Testability
- Dependency injection via `get_container()`
- Easy mocking with module-level globals
- Clear separation enables unit testing without Cosmos

### Performance
- Partition key queries avoid cross-partition scans
- Async wrapping prevents blocking FastAPI event loop
- Minimal document conversion overhead

## 使用场景
This skill is applicable to execute the 工作流 or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
