---
name: C4 容器级文档专家。
description: C4 容器级文档专家。
risk: unknown
source: community
date_added: '2026-02-27'
---

# C4 容器层级：系统部署

## 使用此技能的场景

- 处理 c4 容器层级：系统部署任务或工作流时
- 需要 c4 容器层级：系统部署的指导、最佳实践或检查清单时

## 不要使用此技能的场景

- The task is unrelated to c4 container level: system 部署
- You need a different domain or tool outside this scope

## 使用说明

- Clarify goals, constraints, and required inputs.
- Apply relevant best practices and validate outcomes.
- Provide actionable steps and verification.
- If detailed examples are required, open `resources/implementation-playbook.md`.

## Containers

### [Container Name]

- **Name**: [Container name]
- **Description**: [Short description of container purpose and 部署]
- **Type**: [Web Application, API, Database, Message Queue, etc.]
- **Technology**: [Primary technologies: Node.js, Python, PostgreSQL, Redis, etc.]
- **部署**: [Docker, Kubernetes, Cloud Service, etc.]

## 目的

[Detailed description of what this container does and how it's deployed]

## Components

This container deploys the following components:

- [Component Name]: [Description]
  - Documentation: c4-component-name.md

## Interfaces

### [API/Interface Name]

- **Protocol**: [REST/GraphQL/gRPC/Events/etc.]
- **Description**: [What this interface provides]
- **Specification**: [Link to OpenAPI/Swagger/API Spec file]
- **Endpoints**:
  - `GET /api/resource` - [Description]
  - `POST /api/resource` - [Description]

## 依赖项

### Containers Used

- [Container Name]: [How it's used, communication protocol]

### External Systems

- [External System]: [How it's used, 集成 type]

## Infrastructure

- **部署 Config**: [Link to Dockerfile, K8s manifest, etc.]
- **Scaling**: [Horizontal/vertical scaling strategy]
- **Resources**: [CPU, memory, storage requirements]

## Container Diagram

Use proper Mermaid C4Container syntax:

```mermaid
C4Container
    title Container Diagram for [System Name]

    Person(user, "User", "Uses the system")
    System_Boundary(system, "System Name") {
        Container(webApp, "Web Application", "Spring Boot, Java", "Provides web interface")
        Container(api, "API Application", "Node.js, Express", "Provides REST API")
        ContainerDb(database, "Database", "PostgreSQL", "Stores data")
        Container_Queue(messageQueue, "Message Queue", "RabbitMQ", "Handles async messaging")
    }
    System_Ext(external, "External System", "Third-party service")

    Rel(user, webApp, "Uses", "HTTPS")
    Rel(webApp, api, "Makes API calls to", "JSON/HTTPS")
    Rel(api, database, "Reads from and writes to", "SQL")
    Rel(api, messageQueue, "Publishes messages to")
    Rel(api, external, "Uses", "API")
```
````

**Key Principles** (from [c4model.com](https://c4model.com/diagrams/container)):

- Show **high-level technology choices** (this is where technology details belong)
- Show how **responsibilities are distributed** across containers
- Include **container types**: Applications, Databases, Message Queues, File Systems, etc.
- Show **communication protocols** between containers
- Include **external systems** that containers interact with

````

## API Specification Template

For each container API, create an OpenAPI/Swagger specification:

```yaml
openapi: 3.1.0
info:
  title: [Container Name] API
  description: [API description]
  version: 1.0.0
servers:
  - url: https://api.example.com
    description: Production server
paths:
  /api/resource:
    get:
      summary: [操作 summary]
      description: [操作 description]
      parameters:
        - name: param1
          in: 查询
          架构:
            type: string
      responses:
        '200':
          description: [响应 description]
          content:
            application/json:
              架构:
                type: object
````

## 交互示例

- "Synthesize all components into containers based on 部署 definitions"
- "Map the API components to containers and document their APIs as OpenAPI specs"
- "Create container-level documentation for the microservices architecture"
- "Document container interfaces as Swagger/OpenAPI specifications"
- "Analyze Kubernetes manifests and create container documentation"

## 关键区别

- **vs C4-Component agent**: Maps components to 部署 units; Component agent focuses on logical grouping
- **vs C4-上下文 agent**: Provides container-level detail; 上下文 agent creates high-level system diagrams
- **vs C4-Code agent**: Focuses on 部署 architecture; Code agent documents individual code elements

## 输出示例

When synthesizing containers, provide:

- Clear container boundaries with 部署 rationale
- Descriptive container names and 部署 characteristics
- Complete API documentation with OpenAPI/Swagger specifications
- Links to all contained components
- Mermaid container diagrams showing 部署 architecture
- Links to 部署 configurations (Dockerfiles, K8s manifests, etc.)
- Infrastructure requirements and scaling considerations
- Consistent documentation format across all containers

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
