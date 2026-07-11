---
name: 插件设置管理
description: 插件设置管理：.local.md 配置文件、YAML frontmatter 解析、按项目插件配置和插件状态持久化。
version: 0.1.0
---

# Claude Code 插件设置模式

## 概述

插件可以在项目目录中的 `.claude/plugin-name.local.md` 文件中存储用户可配置的设置和状态。此模式使用 YAML frontmatter 进行结构化配置，使用 markdown 内容作为提示或附加上下文。

**关键特性：**
- 文件位置：项目根目录下的 `.claude/plugin-name.local.md`
- 结构：YAML frontmatter + markdown 正文
- 用途：按项目的插件配置和状态
- 用法：从 hooks、commands 和 agents 读取
- 生命周期：用户管理（不在 git 中，应加入 `.gitignore`）

## 文件结构

### 基本模板

```markdown
---
enabled: true
features:
  autoReview: true
  notifications: false
maxRetries: 3
theme: dark
---

# 插件提示/辅助内容

此处的 Markdown 内容提供用户注释、提示模板或插件使用的额外上下文。
```

### YAML Frontmatter 字段

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `enabled` | boolean | 否 | 插件/功能开关（默认 true） |
| `features` | object | 否 | 功能级开关 |
| `config` | object | 否 | 用户可修改的配置值 |

### 读取模式

```javascript
// 从本地设置读取
const settings = parseYaml(readFile('.claude/plugin-name.local.md'));
if (settings.enabled) {
  // 按配置操作
}
```

## 最佳实践

1. **Git 忽略：** 将 `*.local.md` 添加到 `.gitignore` 以防止提交用户特定配置
2. **合理默认值：** 在代码中后备默认值，而非要求设置文件存在
3. **文档：** 在插件文档中记录可用设置
4. **验证：** 使用前验证设置值