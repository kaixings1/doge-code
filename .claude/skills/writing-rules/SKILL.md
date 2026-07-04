---
name: writing-hookify-rules
description: 当用户要求创建 hookify 规则、编写 hook 规则、配置 hookify、添加 hookify 规则或需要 hookify 规则语法与模式指导时使用此技能。
version: 0.1.0
---

# 编写 Hookify 规则

## 概述

Hookify 规则是带有 YAML 前置元数据的 Markdown 文件，用于定义要监视的模式，以及在匹配这些模式时显示的消息。规则存储在 .claude/hookify.{规则名称}.local.md 文件中。

## 规则文件格式

### 基本结构

```markdown
---
name: my-rule
description: 简短描述此规则的用途
---

# 规则名称

## 模式

- 描述要监视的内容
- 使用正则表达式或文本匹配

## 消息

- 当模式匹配时显示的内容
- 提供指导或警告
```