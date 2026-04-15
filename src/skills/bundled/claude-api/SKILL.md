# SKILL.md

本文件为 Claude Code 技能系统配置说明。

## 可用技能列表

| 技能名 | 命令前缀 | 描述 |
|-------|--------|------|
| `agents` | `/agents` | 列出已配置的智能体 |
| `api` | `/api` | 访问 Claude API 端点 |
| `cli` | `/cli` | 执行 CLI 命令 |
| `test` | `/test` | 运行测试 |

## 技能调用格式

```bash
claude <skill> <args?>
```

### 示例

```bash
# 列出所有可用技能
claude agents

# 查询 API 文档
claude api --help

# 执行 CLI 命令
claude cli "ls -la"

# 运行测试
claude test src/**/*.ts
```

## 内置技能说明

### `agents` 技能

列出当前已配置的智能体及其功能。

**输出格式：**
```
Available Agents:
┌─────────────────────────────────────────────┐
│ name: statusline-setup                      │
│ description: 设置状态栏 UI                  │
│ tools: [agent, read, edit]                  │
├─────────────────────────────────────────────┤
│ name: code-reviewer                        │
│ description: 代码审查                       │
│ tools: [read, write, search]                │
└─────────────────────────────────────────────┘
```

### `api` 技能

访问 Claude API，支持多种语言客户端。

**可用子命令：**
- `/api python` - Python SDK
- `/api typescript` - TypeScript SDK  
- `/api csharp` - C# SDK
- `/api java` - Java SDK
- `/api php` - PHP SDK
- `/api ruby` - Ruby SDK

### `cli` 技能

执行 CLI 命令，支持多种操作类型。

**可用命令：**
- `claude agents` - 列出智能体
- `claude api` - 访问 API
- `claude cli` - 执行 CLI 命令
- `claude test` - 运行测试

### `files-api` 技能

文件管理操作（上传、下载、搜索）。

**可用命令：**
- `/api files upload <path> <content>` - 上传文件
- `/api files download <path>` - 下载文件
- `/api files search <pattern>` - 搜索文件

### `streaming` 技能

支持流式输出模式。

---
