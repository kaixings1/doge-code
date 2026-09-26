---
name: wiki
description: LLM Wiki — 跨会话持久化的 Markdown 知识库，随使用而复利增长（Karpathy 模型）。
triggers: ["wiki", "wiki this", "wiki add", "wiki lint", "wiki query"]
---

# Wiki

面向项目知识与会话知识的、持久化且自我维护的 Markdown 知识库。灵感来自 Karpathy 的 LLM Wiki 构想。

## 操作

### 录入
把知识加工成 wiki 页面。一次录入可以涉及多个页面。

```
wiki_ingest({ title: "Auth Architecture", content: "...", tags: ["auth", "architecture"], category: "architecture" })
```

### 查询
按关键词和标签搜索所有 wiki 页面。返回带摘要片段的匹配页面——由你（LLM）根据结果综合出带引用的答案。

```
wiki_query({ query: "authentication", tags: ["auth"], category: "architecture" })
```

### 检查
对 wiki 运行健康检查。可检测孤儿页面、过时内容、失效的交叉引用、体积过大的页面以及结构性矛盾。

```
wiki_lint()
```

### 快速添加
快速添加单个页面（比录入更简单）。

```
wiki_add({ title: "Page Title", content: "...", tags: ["tag1"], category: "decision" })
```

### 列表 / 读取 / 删除
```
wiki_list()           # 列出所有页面（读取 index.md）
wiki_read({ page: "auth-architecture" })  # 读取指定页面
wiki_delete({ page: "outdated-page" })    # 删除一个页面
```

### 日志
通过读取 `.omc/wiki/log.md` 查看 wiki 的操作历史。

## 分类
页面按分类组织：`architecture`、`decision`、`pattern`、`debugging`、`environment`、`session-log`

## 存储
- 页面：`.omc/wiki/*.md`（带 YAML frontmatter 的 markdown 文件）
- 索引：`.omc/wiki/index.md`（自动维护的目录）
- 日志：`.omc/wiki/log.md`（只追加的操作编年记录）

## 交叉引用
使用 `[[page-name]]` 这种 wiki 链接语法在页面之间建立交叉引用。

## 自动捕获
会话结束时，重要的发现会被自动捕获为 session-log 页面。可通过 `.omc-config.json` 中的 `wiki.autoCapture` 配置（默认：启用）。

## 硬性约束
- 不使用向量嵌入——查询只做关键词 + 标签匹配
- wiki 页面默认被 git 忽略（`.omc/wiki/` 属于项目本地）
