---
name: exa-search
description: 通过 Exa MCP 进行神经搜索，用于网页、代码和公司研究。当用户需要网页搜索、代码示例、公司情报、人员查找或使用 Exa 神经搜索引擎进行 AI 深度研究时使用。
---

# Exa 搜索

通过 Exa MCP 服务器进行网页内容、代码、公司和人员搜索。

## 何时激活

- 用户需要最新的网页信息或新闻
- 搜索代码示例、API 文档或技术参考
- 研究公司、竞争对手或市场参与者
- 查找专业档案或某个领域的人员
- 为任何开发任务进行背景调研
- 用户说"搜索"、"查找"、"查一下"或"最新的情况"

## MCP 要求

必须配置 Exa MCP 服务器。添加到 `~/.claude.json`：

```json
"exa-web-search": {
  "command": "npx",
  "args": ["-y", "exa-mcp-server"],
  "env": { "EXA_API_KEY": "你的 EXA_API_KEY" }
}
```

在 [exa.ai](https://exa.ai) 获取 API 密钥。

## 核心工具

### web_search_exa
通用网页搜索，用于获取最新信息、新闻或事实。

```
web_search_exa(query: "2026 年 AI 最新发展", numResults: 5)
```

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `query` | string | 必填 | 搜索查询 |
| `numResults` | number | 8 | 返回结果数量 |

### web_search_advanced_exa
带域名和日期限制的筛选搜索。

```
web_search_advanced_exa(
  query: "React Server Components 最佳实践",
  numResults: 5,
  includeDomains: ["github.com", "react.dev"],
  startPublishedDate: "2025-01-01"
)
```

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `query` | string | 必填 | 搜索查询 |
| `numResults` | number | 8 | 返回结果数量 |
| `includeDomains` | string[] | 无 | 限定特定域名 |
| `excludeDomains` | string[] | 无 | 排除特定域名 |
| `startPublishedDate` | string | 无 | ISO 日期筛选（开始） |
| `endPublishedDate` | string | 无 | ISO 日期筛选（结束） |

### get_code_context_exa
查找来自 GitHub、Stack Overflow 和文档站点的代码示例和文档。

```
get_code_context_exa(query: "Python asyncio 模式", tokensNum: 3000)
```

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `query` | string | 必填 | 代码或 API 搜索查询 |
| `tokensNum` | number | 5000 | 内容 token 数（1000-50000） |

### company_research_exa
研究公司，用于商业情报和新闻。

```
company_research_exa(companyName: "Anthropic", numResults: 5)
```

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `companyName` | string | 必填 | 公司名称 |
| `numResults` | number | 5 | 返回结果数量 |

### people_search_exa
查找专业档案和个人简介。

```
people_search_exa(query: "AI 安全研究员 Anthropic", numResults: 5)
```

### crawling_exa
从 URL 提取完整页面内容。

```
crawling_exa(url: "https://example.com/article", tokensNum: 5000)
```

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `url` | string | 必填 | 要提取的 URL |
| `tokensNum` | number | 5000 | 内容 token 数 |

### deep_researcher_start / deep_researcher_check
启动异步运行的 AI 研究代理。

```
# 开始研究
deep_researcher_start(query: "2026 年 AI 代码编辑器的全面分析")

# 检查状态（完成后返回结果）
deep_researcher_check(researchId: "<start 返回的 ID>")
```

## 使用模式

### 快速查询
```
web_search_exa(query: "Node.js 22 新特性", numResults: 3)
```

### 代码研究
```
get_code_context_exa(query: "Rust 错误处理模式 Result 类型", tokensNum: 3000)
```

### 公司尽职调查
```
company_research_exa(companyName: "Vercel", numResults: 5)
web_search_advanced_exa(query: "Vercel 融资估值 2026", numResults: 3)
```

### 技术深入分析
```
# 启动异步研究
deep_researcher_start(query: "WebAssembly 组件模型现状与采用情况")
# ... 做其他工作 ...
deep_researcher_check(researchId: "<id>")
```

## 小贴士

- 用 `web_search_exa` 进行宽泛查询，用 `web_search_advanced_exa` 获取筛选结果
- 针对聚焦的代码片段降低 `tokensNum`（1000-2000），针对全面上下文提高（5000+）
- 将 `company_research_exa` 与 `web_search_advanced_exa` 结合使用，进行全面的公司分析
- 使用 `crawling_exa` 从搜索结果中发现的特定 URL 获取完整内容
- `deep_researcher_start` 最适合受益于 AI 综合分析的全面性主题

## 相关技能

- `deep-research` — 使用 firecrawl + exa 的完整研究工作流
- `market-research` — 面向商业的研究与决策框架
