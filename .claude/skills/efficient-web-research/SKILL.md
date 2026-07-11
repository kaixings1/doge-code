---
name: 高效网络研究相关功能和最佳实践
risk: safe
description: "Efficient Web Research — 高效网络研究相关功能和最佳实践"
  面向 token 高效网络研究的协议。访问 URL、GitHub 仓库或运行搜索查询时使用。防止整页获取浪费。
---

# 高效网络研究技能

以最 token 高效、准确和结构化的方式访问 Web 内容的协议——
在适当的深度使用正确的工具，并在问题可回答时立即停止。

---

## 核心原则

> **只获取回答问题所需的最少内容。先略读再深入。能回答时就停止。**

每次不必要的获取都会浪费 token 并增加噪音。此技能强制执行分层方法，
仅在较浅层失败时才加深获取深度。

---

## 步骤 1 — 分类输入

在获取任何内容之前，先识别收到的输入类型：

| Input Type | Example | Go To |
|---|---|---|
| GitHub repo URL | `github.com/user/repo` | [GitHub Protocol](#github-protocol) |
| Specific page URL | `docs.python.org/3/library/os` | [URL Protocol](#url-protocol) |
| Topic / 查询 (no URL) | "how does RAFT consensus work" | [Search Protocol](#search-protocol) |
| Multiple URLs | List of links | [Multi-URL Protocol](#multi-url-protocol) |
| PDF / file link | `.pdf`, `.txt`, `.md` URL | [File Protocol](#file-protocol) |

---

## GitHub 协议

当输入是 GitHub URL（仓库、文件、PR、议题等）时使用

### 步骤 1 — 解析 URL

```
github.com/{owner}/{repo}                → Repo root
github.com/{owner}/{repo}/tree/{branch}  → Directory
github.com/{owner}/{repo}/blob/{branch}/{path} → Single file
github.com/{owner}/{repo}/issues/{n}     → Issue
github.com/{owner}/{repo}/pull/{n}       → Pull 请求
```

### 步骤 2 — 使用 GitHub API（优先于爬取）

始终优先使用 GitHub API。它返回干净的 JSON — 无需 HTML 解析。

```
# 仓库元数据（名称、描述、语言、星标、主题）
GET https://api.github.com/repos/{owner}/{repo}

# 文件树（查看存在哪些文件 — 非常廉价）
GET https://api.github.com/repos/{owner}/{repo}/git/trees/{ref}?recursive=1

# 单个文件内容（base64 编码）
GET https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={ref}

# 仅 README（通常足以理解仓库）
GET https://api.github.com/repos/{owner}/{repo}/readme
```

### 步骤 3 — 仓库分层获取

```
第 1 层（始终先做）：
  → 仅获取仓库元数据 + README
  → 现在可以回答用户的问题了吗？是 → 停止。否 → 继续。

第 2 层（仅在需要时）：
  → 获取文件树以了解结构
  → 根据问题识别最相关的 1-3 个文件
  → 现在可以回答了吗？是 → 停止。否 → 继续。

第 3 层（最后手段）：
  → 仅获取特定的相关文件（绝不获取所有文件）
  → 优先级：主入口点、配置文件、关键模块
```

### GitHub 的 Token 规则

- 仅 README 即可回答约 70% 的"此仓库做什么"问题 — 始终先尝试
- 单次研究轮次中绝不获取超过 3 个文件
- 如果文件超过约 300 行，只读取顶部（导入 + 类/函数签名）
- 在传递给上下文之前解码 API 返回的 base64 内容

---

## URL 协议

当用户给出特定的非 GitHub URL（文档、文章、博客等）时使用

### 步骤 1 — 评估 URL 类型

| 站点类型 | 适用工具 | 备注 |
|---|---|---|
| 静态文档 / MDN / ReadTheDocs | `read_url_content` | 快速、干净、廉价 |
| 新闻文章 / 博客 | `read_url_content` | 通常可用 |
| SPA / React/Next.js 应用 | `browser_subagent` | JS 渲染 |
| 需要认证的页面 | `browser_subagent` | 需要登录 |
| 原始 GitHub 文件 (raw.githubusercontent) | `read_url_content` | 直接文本 |

### 步骤 2 — 分层获取

```
第 1 层 — 略读
  → 使用 read_url_content 获取 URL
  → 只读取标题（H1、H2、H3）和第一段
  → 此页面包含用户需要的内容吗？否 → 尝试不同的 URL 或搜索。是 → 继续。

第 2 层 — 定向提取
  → 如果页面有锚点链接（例如 /docs/page#section），附带锚点获取
  → 仅提取相关部分（最多 200-500 token）
  → 可以回答了吗？是 → 停止。

第 3 层 — 完整获取
  → 获取整页，去除样板内容（导航、页脚、广告、Cookie 横幅、侧边栏）
  → 上限 2000 token。在传递给答案之前先总结。

第 4 层 — 浏览器子代理（仅最后手段）
  → 仅在 read_url_content 返回空、乱码或 JS 占位符内容时使用
  → 指示子代理："导航到 [URL]，等待内容加载，提取 [特定部分]"
  → 不要对静态页面使用 browser_subagent — 很昂贵
```

### 从获取页面中去除的内容

在使用获取的内容之前始终移除：
- 导航菜单和面包屑
- Cookie 横幅和 GDPR 通知
- "相关文章"/"你可能也喜欢"块
- 页脚内容（版权、链接）
- 社交分享按钮
- 广告和赞助内容

提取并保留：
- 主要文章/文档正文
- 代码块
- 数据表格
- 编号步骤或流程

---

## 搜索协议

当用户给出主题、问题或查询 — 而非特定 URL 时使用

### 步骤 1 — 在搜索前优化查询

不要搜索用户的原始查询。先转换它：

```
Raw: "how to deploy fastapi on aws"
Sharpened: "fastapi AWS 部署 tutorial 2024"

Raw: "python async vs threads"
Sharpened: "Python asyncio vs threading performance comparison"

Raw: "best way to structure react project"
Sharpened: "React project folder structure 最佳实践"
```

**查询优化规则：**
- 增加具体性：版本号、技术名称、"教程"/"指南"/"比较"
- 如果相关则增加时效性：当前年份
- 移除填充词："如何做"、"什么是"、"你能解释"
- 对于代码问题：明确添加语言 + 框架名称

### 步骤 2 — 搜索和选择

```
1. 使用优化后的查询运行 search_web
2. 获取结果（标题 + 片段）
3. 仅扫描标题 + 片段 — 暂不获取
4. 选择最相关的前 1-2 个结果（复杂情况最多 3 个）
5. 跳过以下来源：论坛（如果有文档）、聚合博客、付费站点
6. 优先选择：官方文档、GitHub 仓库、知名技术博客、学术来源
```

### 步骤 3 — 获取选中的结果

对每个选中的 URL 应用 URL 协议（上文）。
一次处理一个结果 — 仅当第一个未能回答问题时才获取第二个 URL。

### 搜索的 Token 规则

- 每次搜索查询最多读取 3 个 URL
- 如果摘要已包含答案 → 不要获取整页，使用摘要
- 对于事实性问题（日期、名称、简单事实）→ 摘要通常就足够了
- 对于流程性问题（如何做 X）→ 获取 1 个相关页面，仅定向部分

---

## 多 URL 协议

当用户提供要比较或总结的 URL 列表时使用。

```
1. 先略读所有 URL（每个进行第 1 层获取）
2. 按与用户问题的相关性分组
3. 仅深度获取最相关的 1-3 个 URL
4. 在合并之前每个总结 3-5 句话
5. 绝不转储来自多个页面的原始内容 — 始终先按来源总结
```

---

## 文件协议

当 URL 直接指向文件（PDF、.txt、.md、.csv 等）时使用

- `.md` / `.txt` / `.csv` → `read_url_content` 直接工作，读取完整内容
- `.pdf` → 使用 browser_subagent 或 PDF 提取工具；仅提取文本
- `.json` / `.yaml` → `read_url_content`，解析结构，总结架构 + 关键值
- 大文件（>500 行）→ 读取前 100 行 + 最后 20 行 + 搜索相关部分

---

## 反模式（绝不要这样做）

| 反模式 | 为什么不好 | 应该这样做 |
|---|---|---|
| 为简单事实获取整页 | 浪费数千 token | 使用摘要或定向锚点 |
| 对静态站点使用 browser_subagent | 非常昂贵 | 先使用 read_url_content |
| 使用用户原始查询搜索 | 结果模糊 | 先优化查询 |
| 获取 5+ 个搜索结果 | token 爆炸 | 最多 3 个，能回答就停止 |
| 将原始 HTML 转储到上下文 | 嘈杂且浪费 | 始终简化为 Markdown |
| "以防万一"获取 | 不必要的 token | 只获取回答问题所需的内容 |
| 重复获取相同 URL | 冗余 | 在上下文中缓存结果，复用 |
| 获取整个 GitHub 仓库 | 极其浪费 | 仅 README + 定向文件 |

---

## Decision Flowchart (快速参考)

```
Input received
│
├─ GitHub URL?
│   ├─ Fetch README + metadata via API
│   ├─ Answered? → STOP
│   ├─ Need more? → Fetch file tree, pick 1-3 files
│   └─ Still need more? → Fetch specific files only
│
├─ Specific URL?
│   ├─ Try read_url_content → skim headings
│   ├─ Answered? → STOP
│   ├─ Need more? → Targeted section fetch
│   ├─ Still need more? → Full fetch, stripped
│   └─ JS-rendered / broken? → browser_subagent (last resort)
│
├─ Topic/查询?
│   ├─ Sharpen 查询
│   ├─ search_web → scan snippets
│   ├─ Snippet enough? → Answer from snippet, STOP
│   ├─ Need more? → Fetch top 1 result (targeted)
│   └─ Still need more? → Fetch top 2nd result (targeted)
│
└─ List of URLs?
    ├─ Skim all (Layer 1 each)
    ├─ Deep fetch top 1-3 relevant ones
    └─ Summarize per-source, then combine
```

---

## Output Format Rules

After fetching, structure your 响应 as:

```
Source: [URL or "Web search for: 查询"]
Summary: [2-5 sentences of what was found]
Answer: [Direct answer to user's question]
Confidence: [High / Medium / Low — based on source quality]
```

For multiple sources:
```
Source 1: ...
Source 2: ...
Combined Answer: ...
```

Never output:
- Raw HTML fragments
- Full page dumps
- Unattributed information
- More than needed to answer the question

---

## 令牌 Budget Guide

| 操作 | Approximate 令牌 cost | 使用场景 |
|---|---|---|
| GitHub README fetch | ~300–800 tokens | Always first for repos |
| GitHub API metadata | ~200 tokens | Always for repos |
| Skim (headings only) | ~100–200 tokens | Always first for URLs |
| Targeted section fetch | ~300–600 tokens | When skim isn't enough |
| Full page fetch (stripped) | ~1000–2000 tokens | Only when targeted fails |
| browser_subagent | ~2000–5000 tokens | Last resort only |
| Search snippet scan | ~300–500 tokens | Always before fetching |

**Rule of thumb:** If you're about to spend >2000 tokens on a fetch, ask yourself if there's a cheaper path first.

---

## 局限性

- **JavaScript Reliance**: Standard fetching may not fully render Single Page Applications (SPAs). You must fallback to `browser_subagent` for these, which is slower and more expensive.
- **Paywalls & Protections**: This skill cannot bypass CAPTCHAs, bot protections (e.g., strict Cloudflare rules), or hard paywalls.
- **GitHub API Limits**: Frequent GitHub API requests without 认证 may hit rate limits.
