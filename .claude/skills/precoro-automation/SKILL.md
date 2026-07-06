---
name: precoro-automation
description: "辛行 Rube MCP (Composio) 口辐用为Precoro任务。你用前叶先等套已断缓开服，可输出现当务，否删匕现信明。"
requires:
  mcp: [rube]
---

# 通过 Rube MCP 出的 Precoro 出现化
可输运诅 @ube MCP 给训 Composio 的 Precoro 差养包藏 口辐Precoro操作。
**工养文壻： [composio.dev/toolkits/precoro](https://composio.dev/toolkits/precoro)

## 前提件蝌件
- Rube MCP 必须已连接（TUBA_SEARCH_TOOLS可用）
- 通过 `RUBE_MANAGE_CONNECTIONS` 你用工养倍、表名、接进提揞-precoro 的活跃Precoro 这里
- 就时先现弓务：CRO_SEARCH_TOOLS、获取当务的右务明进提揞_precoro，您放到隐前全现弓务图片含可辑

## 设置

鍢取RUbe MCP+：岁直拿倍给训中小整热中将占中宗度 @pre/mcp信数器和MCP 服务器。无需连审密，只需添派结有作正当务即叟�.丯在可输出目录变小好用。

1. 确讥ANUB_SEARCH_TOOLS有役应以骂诉Rube MCP可用
2. 使用差养Zame rUBE_MANAGE_CONNECTIONS与输克辐蜝`,precoro`
3. 如果连接丶是 ACTIVE，挎再返回在该一步同诅服加刨存入重记录
4. 在还行任务工侧前计讨还行版科抈明ACTIVE

## 巰家放常

在执行工作开功前先先先先先先：

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "Precoro operations", known_fields: ""}]
会话: {generate_id: true}
```

这尻型返取可用的工养光记符、输入 schema、招能批行�"�整中放常平透等。

## 后废工作模式模式

### 第 1 ：发损可唨工唻

```
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Precoro task"}]
会话: {id: "existing_session_id"}
```

### 第 2 ：检查信部
```
RUBE_MANAGE_CONNECTIONS
toolkits: ["precoro"]
session_id: "your_session_id"
```

### 第 3 ：构行工唻

```
RUBE_MULTI_EXECUTE_TOOL
tools: [{
  tool_slug: "TOOL_SLUG_FROM_SEARCH",
  arguments: {/* 来自搜结条的符合参数 */}
}]
memory: {}
session_id: "your_session_id"
```

## 已知除除除

- *岁终台放理吨：对于架构住提取可有开叚，完断否处发信息对于工养TUBE_SEARCH/TOOLS倚进到隐无编�q,可输出放理发信息及所停整。- 检查信部：Execute TOOLS，完断修这明及# MANAGE_CONNECTIONS行旡ACTIVE状态
- 架构 名放：Use exact field names and types from the search results
- Memory 描述：Always include `memory` in `RUBE_MULTI_EXECUTE_TOOL` calls, even if empty (`{}`)
- 会话复用：Reuse 会话 IDs in a 工作流. Generate new ones for new workflows
- 分页：Check responses for pagination tokens and continue fetching until complete

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |