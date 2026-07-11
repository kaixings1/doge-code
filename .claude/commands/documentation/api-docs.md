根据路由定义和处理器生成 API 文档。

## 步骤

1. 检测正在使用的 Web 框架（Express、Fastify、FastAPI、Gin、Actix 等）。
2. 扫描路由定义：
   - Express/Fastify：`app.get()`、`router.post()`、路由文件。
   - FastAPI：`@app.get()`、`@router.post()` 装饰器。
   - Go：`http.HandleFunc()`、gin 路由组。
3. 对每个端点，提取：
   - HTTP 方法和路径（包括路径参数）。
   - 来自 TypeScript 类型、Pydantic 模型或结构体标签的请求体 schema。
   - 查询参数及其类型。
   - 来自返回类型或响应调用的响应格式。
   - 来自中间件的认证要求。
   - 速率限制或其他中间件约束。
4. 以指定的格式（OpenAPI/Swagger、Markdown 或两者）生成文档。
5. 包含带有真实数据的请求/响应示例。
6. 将输出写入 `docs/api/` 或指定位置。

## 格式

```markdown
## <方法> <路径>

<描述>

**认证**：需要 | 公开
**速率限制**：<限制>

### 参数
| 名称 | 位置 | 类型 | 必需 | 描述 |
|------|-----|------|----------|-------------|

### 请求体
```json
{ "example": "value" }
```

### 响应（200）
```json
{ "example": "response" }
```
```

## 规则

- 记录每个公共端点；跳过仅内部路由。
- 包含错误响应（400、401、403、404、500）及示例体。
- 使用实际的 TypeScript/Python 类型作为 schema，而非泛型 `object` 或 `any`。
- 保持示例真实且在相关端点间一致。
- 清晰标注已弃用的端点并附迁移指南。
