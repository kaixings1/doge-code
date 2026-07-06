---
name: wiki
description: "Wiki — Wiki 相关功能和最佳实践"
triggers: ["wiki", "wiki this", "wiki add", "wiki lint", "wiki 查询"]
---

# Wiki

持久化、自维护的 Markdown 知识库，用于项目和会话知识管理。受 Karpathy 的 LLM Wiki 概念启发。

## 操作

### 导入（Ingest）
将知识处理为 Wiki 页面。单次导入可涉及多个页面。

```
wiki_ingest({ title: "认证架构", content: "...", tags: ["auth", "architecture"], category: "architecture" })
```

### 查询（查询）
通过关键词和标签搜索所有 Wiki 页面。返回匹配页面及摘要片段——你（LLM）根据结果综合回答并附上引用。

```
wiki_query({ 查询: "认证", tags: ["auth"], category: "architecture" })
```

### 检查（Lint）
对 Wiki 运行健康检查。检测孤儿页面、过期内容、损坏的交叉引用、过大页面和结构矛盾。

```
wiki_lint()
```

### 快速添加（Quick Add）
快速添加单个页面（比导入更简单）。

```
wiki_add({ title: "页面标题", content: "...", tags: ["tag1"], category: "decision" })
```

### 列表 / 读取 / 删除
```
wiki_list()           # 显示所有页面（读取 index.md）
wiki_read({ page: "auth-architecture" })  # 读取特定页面
wiki_delete({ page: "outdated-page" })    # 删除页面
```

### 日志（Log）
通过读取 `.omc/wiki/log.md` 查看 Wiki 操作历史。

## 分类
页面按类别组织：`architecture`（架构）、`decision`（决策）、`pattern`（模式）、`debugging`（调试）、`environment`（环境）、`会话-log`（会话日志）

## 存储
- 页面：`.omc/wiki/*.md`（带 YAML 前置元数据的 Markdown）
- 索引：`.omc/wiki/index.md`（自动维护的目录）
- 日志：`.omc/wiki/log.md`（仅追加的操作记录）

## 交叉引用
使用 `[[page-name]]` Wiki 链接语法创建页面之间的交叉引用。

## 自动捕获
会话结束时，重要发现会自动捕获为会话日志页面。通过 `.omc-config.json` 中的 `wiki.autoCapture` 配置（默认：启用）。

## 硬约束
- 无向量嵌入——查询仅使用关键词 + 标签匹配
- Wiki 页面默认被 git 忽略（`.omc/wiki/` 是项目本地目录）
