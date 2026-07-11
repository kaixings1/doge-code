---
name: Go gRPC 服务开发
description: "在 Go 中构建带 mTLS、流式传输和可观察性的生产就绪 gRPC 服务。适用于使用 Buf 设计 Protobuf 契约或实现安全的服务间通信。"
risk: safe
source: self
date_added: "2026-02-27"
---

# gRPC Golang (gRPC-Go)

## 概述

在 Go 中设计和实现生产级 gRPC 服务的全面指南。涵盖使用 Buf 进行契约标准化、通过 mTLS 的传输层安全以及使用 OpenTelemetry 拦截器的深度可观测性。

## 何时使用本技能

- 在 Go 中使用 gRPC 设计微服务通信时。
- 使用 Protobuf 构建高性能内部 API 时。
- 实现流式工作负载（单向或双向）时。
- 使用 Protobuf 和 Buf 标准化 API 契约时。
- 配置 mTLS 实现服务到服务认证时。

## 何时不使用本技能

- 构建纯 REST/HTTP 公共 API 且无 gRPC 需求时。
- 修改遗留 `.proto` 文件但无法引入新 API 版本（例如 `api.v2`）或确保向后兼容时。
- 管理服务网格流量路由（例如 Istio/Linkerd），这超出了应用代码范围。

## 分步指南

1. **确认技术上下文**：确定 Go 版本、gRPC-Go 版本以及项目使用 Buf 还是原始 protoc。
2. **确认需求**：确定 mTLS 需求、负载模式（一元/流式）、SLO 和消息大小限制。
3. **规划 架构**：定义包版本控制（例如 `api.v1`）、资源类型和错误映射。
4. **安全设计**：实现 mTLS 进行服务到服务认证。
5. **可观测性**：配置拦截器用于追踪、指标和结构化日志。
6. **验证**：在最终确定代码生成之前，始终运行 `buf lint` 和破坏性变更检查。

有关详细的模式、代码示例和反模式，请参考 `resources/implementation-playbook.md`。

## 示例

### 示例 1：定义服务与消息（v1 API）

```proto
syntax = "proto3";
package api.v1;
option go_package = "github.com/org/repo/gen/api/v1;apiv1";

service UserService {
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
}

message User {
  string id = 1;
  string name = 2;
}

message GetUserRequest {
  string id = 1;
}

message GetUserResponse {
  User user = 1;
}
```

## 最佳实践

- ✅ **应做：** 使用 Buf 通过 `buf.yaml` 和 `buf.gen.yaml` 标准化工具链和代码检查。
- ✅ **应做：** 始终在包路径中使用语义版本控制（例如 `package api.v1`）。
- ✅ **应做：** 对所有内部服务间通信强制使用 mTLS。
- ✅ **应做：** 在所有流式处理器中处理 `ctx.Done()` 以防止资源泄漏。
- ✅ **应做：** 将领域错误映射到标准 gRPC 状态码（例如 `codes.NotFound`）。
- ❌ **不应：** 向 gRPC 客户端返回原始内部错误字符串或堆栈跟踪。
- ❌ **不应：** 为每个请求创建新的 `grpc.ClientConn`；始终复用连接。

## 故障排除

- **错误：生成不一致**：如果生成的代码与 架构 不匹配，运行 `buf generate` 并验证 `go_package` 选项。
- **错误：上下文超时**：检查客户端超时并确保服务器在流式处理器中不会无限阻塞。
- **错误：mTLS 握手**：确保 CA 证书已正确添加到客户端和服务端的 `x509.CertPool`。

## 局限性

- 不涵盖服务网格流量路由（Istio/Linkerd 配置）。
- 不涵盖 gRPC-Web 或基于浏览器的 gRPC 集成。
- 假定 Go 1.21+ 和 gRPC-Go v1.60+；旧版本可能有不同的 API（例如 `grpc.Dial` 与 `grpc.NewClient`）。
- 不涵盖 L7 gRPC 感知负载均衡器配置（例如 Envoy、NGINX）。
- 不涉及超出 Buf lint 范围的 Protobuf 架构 注册中心或大规模 架构 治理。

## 资源

- `resources/implementation-playbook.md` 包含详细的模式、代码示例和反模式。
- [Google API 设计指南](https://cloud.google.com/apis/design)
- [Buf 文档](https://buf.build/docs)
- [gRPC-Go 文档](https://grpc.io/docs/languages/go/)
- [OpenTelemetry Go 插桩](https://opentelemetry.io/docs/instrumentation/go/)

## 相关技能

- @golang-pro - gRPC 层外的通用 Go 模式和性能优化。
- @go-concurrency-patterns - 流式处理器的高级 goroutine 生命周期管理。
- @api-design-principles - 编写 `.proto` 文件前的资源命名和版本控制策略。
- @docker-expert - 容器化 gRPC 服务并通过 Docker 密钥配置 TLS 证书注入。
