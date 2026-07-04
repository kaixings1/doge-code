---
name: plugin-structure
description: 用于创建插件、搭建插件骨架、理解插件结构、组织插件组件、配置 plugin.json、使用 ${CLAUDE_PLUGIN_ROOT}、添加 commands/agents/skills/hooks、配置自动发现，或需要插件目录布局、清单配置、组件组织、文件命名规范或 Claude Code 插件架构最佳实践指导。
version: 0.1.0
---

# Claude Code 插件结构

## 概述

Claude Code 插件遵循标准化的目录结构，支持自动组件发现。理解此结构可以创建组织良好、可维护且与 Claude Code 无缝集成的插件。

**关键概念：**
- 用于自动发现的约定目录布局
- `.claude-plugin/plugin.json` 中的清单驱动配置
- 基于组件的组织（commands、agents、skills、hooks）
- 使用 `${CLAUDE_PLUGIN_ROOT}` 的可移植路径引用
- 显式 vs 自动发现的组件加载

## 目录结构

每个 Claude Code 插件遵循此组织模式：

```
plugin-name/
├── .claude-plugin/
│   └── plugin.json          # 必需：插件清单
├── commands/                 # 斜杠命令（.md 文件）
├── agents/                   # 子代理定义（.md 文件）
├── skills/                   # 代理技能（子目录）
│   └── skill-name/
│       └── SKILL.md         # 每个技能的必需文件
├── hooks/
│   └── hooks.json           # 事件处理器配置
├── .mcp.json                # MCP 服务器定义
└── scripts/                 # 辅助脚本和工具
```

**关键规则：**

1. **清单位置**：`plugin.json` 清单必须放在 `.claude-plugin/` 目录中
2. **组件位置**：所有组件目录（commands、agents、skills、hooks）必须在插件根级别，不能嵌套在 `.claude-plugin/` 内部
3. **可选组件**：仅为插件实际使用的组件创建目录
4. **命名规范**：所有目录和文件使用 kebab-case

## 插件清单（plugin.json）

清单定义插件元数据和配置。位于 `.claude-plugin/plugin.json`：

### 必需字段

```json
{
  "name": "plugin-name"
}
```

**名称要求：**
- 使用 kebab-case 格式（小写加连字符）
- 在已安装的插件中必须唯一
- 无空格或特殊字符
- 示例：`code-review-assistant`、`test-runner`、`api-docs`

### 推荐元数据

```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "description": "插件用途的简要说明",
  "author": {
    "name": "作者姓名",
    "email": "author@example.com",
    "url": "https://example.com"
  },
  "homepage": "https://docs.example.com",
  "repository": "https://github.com/user/plugin-name",
  "license": "MIT",
  "keywords": ["testing", "automation", "ci-cd"]
}
```

**版本格式**：遵循语义化版本控制（MAJOR.MINOR.PATCH）
**关键词**：用于插件发现和分类

### 组件路径配置

为组件指定自定义路径（补充默认目录）：

```json
{
  "name": "plugin-name",
  "commands": "./custom-commands",
  "agents": ["./agents", "./specialized-agents"],
  "hooks": "./config/hooks.json",
  "mcpServers": "./.mcp.json"
}
```

**重要**：自定义路径补充默认路径——它们不替换默认路径。默认目录和自定义路径中的组件都会被加载。

**路径规则：**
- 必须相对于插件根目录
- 必须以 `./` 开头
- 不能使用绝对路径
- 支持数组用于多个位置

## 组件组织

### 命令

**位置**：`commands/` 目录
**格式**：带 YAML frontmatter 的 Markdown 文件
**自动发现**：`commands/` 中的所有 `.md` 文件自动加载

**示例结构**：
```
commands/
├── review.md        # /review 命令
├── test.md          # /test 命令
└── deploy.md        # /deploy 命令
```

**文件格式**：
```markdown
---
name: 命令名称
description: 命令描述
---

命令的 Markdown 内容...
```

### 代理

**位置**：`agents/` 目录
**格式**：带 YAML frontmatter 的 Markdown 文件（定义角色和说明）

### 技能

**位置**：`skills/` 目录，每个技能一个子目录
**必需文件**：每个技能目录中的 `SKILL.md`
**格式**：带 YAML frontmatter 的 Markdown 文件

### Hooks

**位置**：`hooks/hooks.json`
**格式**：定义事件处理器（UserPromptSubmit、PreToolUse、PostToolUse 等）

## 路径引用

使用 `${CLAUDE_PLUGIN_ROOT}` 引用插件目录中的文件：

```json
{
  "command": "sh \"${CLAUDE_PLUGIN_ROOT}/scripts/helper.sh\""
}
```

这确保无论插件安装在何处，路径始终正确。

## 最佳实践

1. **保持简单**：仅创建插件实际需要的目录
2. **遵循规范**：遵守命名约定和目录结构
3. **使用相对路径**：始终使用 `${CLAUDE_PLUGIN_ROOT}` 引用插件文件
4. **记录配置**：记录插件清单中的所有可配置选项