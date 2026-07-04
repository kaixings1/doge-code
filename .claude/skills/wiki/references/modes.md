# Wiki 模式

六种模式覆盖最常见的用例。选择适合的，或组合使用。

---

## 模式 A：网站 / 站点地图

使用场景："为我的网站构建站点地图 Wiki"、"映射内容缺口"、"SEO 审计 Wiki"

```
vault/
├── .raw/              # 爬取导出、分析数据、抓取页面、GSC 数据
├── wiki/
│   ├── pages/         # 每个 URL 一条笔记：状态、元数据、内容摘要
│   ├── structure/     # 站点架构、导航层次结构、内部链接映射
│   ├── audits/        # 内容缺口、重定向需求、内容单薄标记
│   ├── keywords/      # 关键词集群、目标页面分配
│   └── entities/      # 品牌、作者、主题中心
├── _meta/
│   ├── index.md
│   └── log.md
└── CLAUDE.md
```

`wiki/pages/` 笔记的前置元数据：
```yaml
---
type: page
url: "https://example.com/page-slug"
status: live          # live | redirect | 404 | stub | no-index
title: ""
h1: ""
meta_description: ""
word_count: 0
has_schema: false
indexed: true
canonical: ""
internal_links_in: 0
internal_links_out: 0
last_crawled: YYYY-MM-DD
tags: [page]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

要创建的关键 Wiki 页面：`[[站点概览]]`、`[[导航结构]]`、`[[内容缺口]]`、`[[重定向映射]]`、`[[关键词集群]]`

---

## 模式 B：GitHub / 仓库

使用场景："映射我的代码库"、"为我的仓库构建架构 Wiki"、"理解这个项目"

```
vault/
├── .raw/              # README、git 日志导出、代码转储、议题导出
├── wiki/
│   ├── modules/       # 每个主要模块/包/服务一条笔记
│   ├── components/    # 可复用的 UI 或功能组件
│   ├── decisions/     # 架构决策记录（ADR）
│   ├── dependencies/  # 外部依赖、版本、风险评估
│   └── flows/         # 数据流、请求路径、认证流程
├── _meta/
│   ├── index.md
│   └── log.md
└── CLAUDE.md
```

`wiki/modules/` 笔记的前置元数据：
```yaml
---
type: module           # module | component | decision | dependency | flow
path: "src/auth/"
status: active         # active | deprecated | experimental | planned
language: typescript
purpose: ""
maintainer: ""
last_updated: YYYY-MM-DD
linked_issues: []
depends_on: []
used_by: []
tags: [module]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

要创建的关键 Wiki 页面：`[[架构概览]]`、`[[数据流]]`、`[[技术栈]]`、`[[依赖图]]`、`[[关键决策]]`

---

## 模式 C：商业 / 项目

使用场景："项目 Wiki"、"竞争情报"、"团队知识库"、"会议笔记"

```
vault/
├── .raw/              # 会议记录、Slack 导出、文档、邮件
├── wiki/
│   ├── stakeholders/  # 人员、公司、决策者
│   ├── decisions/     # 关键决策及理由和日期
│   ├── deliverables/  # 里程碑、产出、状态跟踪
│   ├── intel/         # 竞品分析、市场调研
│   └── comms/         # 综合会议笔记、关键话题
├── _meta/
│   ├── index.md
│   └── log.md
└── CLAUDE.md
```

`wiki/decisions/` 笔记的前置元数据：
```yaml
---
type: decision         # stakeholder | decision | deliverable | intel | meeting | competitor
status: active         # active | pending | done | blocked | superseded
priority: 3            # 1（最高）到 5（最低）
date: YYYY-MM-DD
owner: ""
due_date: ""
context: ""
tags: [decision]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

要创建的关键 Wiki 页面：`[[项目概览]]`、`[[干系人映射]]`、`[[决策日志]]`、`[[竞争格局]]`

---

## 模式 D：个人 / 第二大脑

使用场景："个人第二大脑"、"追踪我的目标"、"日记综合"、"生活 Wiki"

```
vault/
├── .raw/              # 日记条目、文章、播客笔记、语音转录
├── wiki/
│   ├── goals/         # 个人和职业目标及进度跟踪
│   ├── learning/      # 正在掌握的概念、技能发展
│   ├── people/        # 人际关系、共享上下文、后续跟进
│   ├── areas/         # 生活领域：健康、财务、职业、创意
│   └── resources/     # 值得参考的书籍、课程、工具
├── _meta/
│   ├── index.md
│   ├── log.md
│   └── hot-cache.md   # 约 500 字的最活跃上下文摘要
└── CLAUDE.md
```

`wiki/goals/` 笔记的前置元数据：
```yaml
---
type: goal             # goal | concept | person | area | resource | reflection
status: active         # active | paused | completed | abandoned
area: career           # health | career | finance | creative | relationships | growth
priority: 1
target_date: YYYY-MM-DD
progress: 0            # 0-100 百分比
tags: [goal]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

热缓存笔记：`_meta/hot-cache.md` 是一个约 500 字的文件，Claude 在每个会话结束时更新。它记录了当前关注领域、最近的胜利和未完成的话题。这避免了 Claude 需要爬取整个 Wiki 才能回答"我们进行到哪了？"。

要创建的关键 Wiki 页面：`[[北极星]]`、`[[周回顾模板]]`、`[[年度目标]]`

---

## 模式 E：研究

使用场景："关于[主题]的研究 Wiki"、"追踪我正在阅读的论文"、"构建论文"

```
vault/
├── .raw/              # PDF、网页剪辑、数据文件、原始笔记
├── wiki/
│   ├── papers/        # 论文摘要及关键声明和方法论
│   ├── concepts/      # 提取的概念、模型、框架
│   ├── entities/      # 人物、组织、方法、数据集
│   ├── thesis/        # 演进中的综合："领域现状"页面
│   └── gaps/          # 开放问题、矛盾、需要研究的内容
├── _meta/
│   ├── index.md
│   └── log.md
└── CLAUDE.md
```

`wiki/papers/` 笔记的前置元数据：
```yaml
---
type: paper            # paper | concept | entity | thesis | gap
status: summarized     # raw | summarized | synthesized | superseded
year: 2024
authors: []
venue: ""
key_claim: ""
methodology: ""
contradicts: []
supports: []
tags: [paper]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

要创建的关键 Wiki 页面：`[[研究概览]]`、`[[关键声明映射]]`、`[[开放问题]]`、`[[方法论对比]]`

---

## 模式 F：书籍 / 课程

使用场景："书籍的伴读 Wiki"、"课程笔记 Wiki"、"阅读[书名]时"

```
vault/
├── .raw/              # 章节笔记、重点、练习
├── wiki/
│   ├── characters/    # 角色、人物、代理、专家（根据内容调整）
│   ├── themes/        # 主要主题及支撑证据
│   ├── concepts/      # 领域特定术语和框架
│   ├── timeline/      # 情节结构、课程顺序、章节映射
│   └── synthesis/     # 你自己的收获、问题、应用
├── _meta/
│   ├── index.md
│   └── log.md
└── CLAUDE.md
```

`wiki/concepts/` 笔记的前置元数据：
```yaml
---
type: concept          # concept | character | theme | chapter | synthesis
status: developing     # stub | developing | mature
source_chapters: []
first_appearance: ""
tags: [concept]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

要创建的关键 Wiki 页面：`[[书籍概览]]`、`[[主题映射]]`、`[[角色/专家索引]]`、`[[我的收获]]`

---

## 组合模式

你可以组合模式。示例：

- "GitHub 仓库 + 对所用 AI 方法的研究" -> 模式 B 文件夹 + 模式 E papers/ 文件夹
- "我的 SaaS 业务 + 第二大脑" -> 模式 C intel/ + 模式 D goals/
- "YouTube 频道" -> 模式 F（内容作为"书籍"）+ 模式 E（对覆盖主题的研究）

组合时，保持文件夹名称独立。不要将模式 B 和模式 C 的 `decisions/` 合并为一个文件夹。
