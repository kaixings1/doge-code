---
name: external-context
description: 调用并行 document-specialist 代理进行外部网页搜索和文档查找。
argument-hint: <search query or topic>
level: 4
---

# 外部上下文技能

为某个查询抓取外部文档、参考资料与上下文。它会将查询分解为 2-5 个切面，并并行启动多个 document-specialist Claude 代理。

## 用法

```
/oh-my-claudecode:external-context <topic or question>
```

### 示例

```
/oh-my-claudecode:external-context Node.js 中 JWT 令牌轮换的最佳实践是什么？
/oh-my-claudecode:external-context 对比 Prisma 与 Drizzle ORM 在 PostgreSQL 上的差异
/oh-my-claudecode:external-context 最新的 React Server Components 模式与约定
```

## 协议

### 步骤 1：切面分解

给定一个查询，将其分解为 2-5 个独立的搜索切面：

```markdown
## 搜索分解

**查询：** <original query>

### 切面 1：<facet-name>
- **搜索重点：** 要搜索的内容
- **来源：** 官方文档、GitHub、博客等。

### 切面 2：<facet-name>
...
```

### 步骤 2：并行调用代理

通过 Task 工具并行触发各个独立切面：

```
Task(subagent_type="oh-my-claudecode:document-specialist", model="sonnet", prompt="搜索：<facet 1 description>。使用 WebSearch 和 WebFetch 查找官方文档与示例。引用所有来源并附上 URL。")

Task(subagent_type="oh-my-claudecode:document-specialist", model="sonnet", prompt="搜索：<facet 2 description>。使用 WebSearch 和 WebFetch 查找官方文档与示例。引用所有来源并附上 URL。")
```

最多 5 个并行的 document-specialist 代理。

### 步骤 3：综合结果输出格式

按以下格式呈现综合后的结果：

```markdown
## 外部上下文：<query>

### 关键发现
1. **<finding>** - 来源：[标题](url)
2. **<finding>** - 来源：[标题](url)

### 详细结果

#### 切面 1：<name>
<aggregated findings with citations>

#### 切面 2：<name>
<aggregated findings with citations>

### 来源
- [来源 1](url)
- [来源 2](url)
```

## 配置

- 最多 5 个并行的 document-specialist 代理
- 无魔法关键词触发 - 仅支持显式调用
