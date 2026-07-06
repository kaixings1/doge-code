---
name: seo-backlinks
description: "反向链接画像分析：引用域名、锚文本分布、毒性链接检测、竞争对手差距分析。使用免费 API（Moz、Bing Webmaster、Common Crawl）和 DataForSEO 扩展。当用户提到反向链接、链接画像、引用域名、锚文本、毒性链接、链接差距、链接建设、拒绝或反向链接审计时使用。"
user-invocable: true
参数-hint: "<url>"
license: MIT
compatibility: "Free: Common Crawl + verify always available. Optional: Moz API, Bing Webmaster (free signup). Premium: DataForSEO extension."
metadata:
  author: AgriciDaniel
  version: "2.2.0"
  category: seo
---

# 反向链接画像分析

## 来源检测

分析前，检测可用的数据源：

1. **DataForSEO MCP**（付费）：检查 `dataforseo_backlinks_summary` 工具是否可用
2. **Moz API**（免费注册）：`python3 scripts/backlinks_auth.py --check moz --json`
3. **Bing Webmaster**（免费注册）：`python3 scripts/backlinks_auth.py --check bing --json`
4. **Common Crawl**（始终可用）：域级图与 PageRank
5. **验证爬虫**（始终可用）：检查已知反向链接是否仍然存在

运行 `python3 scripts/backlinks_auth.py --check --json` 一次性检测所有源。

如果除了始终可用层外没有配置其他源：
- 仍可使用 Common Crawl 域指标生成报告
- 建议："运行 `/seo backlinks 设置` 添加免费的 Moz 和 Bing API 密钥以获得更丰富的数据"

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

| 命令 | 用途 |