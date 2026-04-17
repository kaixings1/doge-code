# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在当前代码库中工作时提供指引。

## 常用命令

### 基础命令
- `claude agents` - 列出已配置的智能体
- `claude api` - 访问 Claude API 端点
- `claude cli` - 执行 CLI 命令
- `claude test` - 运行测试

### 状态栏命令
- `claude statusline` - 显示当前会话状态信息（包括模型、分支等）

## 项目架构

- src/cli/handlers/agents.ts：智能体命令处理器
- skills 目录：CLI 及服务端实现
- dev-entry.ts：应用入口文件

### 技能目录结构

```
skills/
├── bundled/          # 内置技能（随发行版提供）
│   ├── claude-api/   # Claude API 相关技能
│   │   ├── SKILL.md  # 技能使用指南
│   │   ├── version.md    # 版本显示技能
│   │   └── statusline.md  # 状态栏配置技能
│   └── verify/        # 验证工具
├── cli/              # CLI 命令处理器
│   └── commands/     # 命令行接口
│       ├── agents.ts    # 智能体管理
│       ├── version.ts   # 版本显示（受条件保护）
│       └── ...         # 其他命令
└── skills/           # 项目自定义技能
```

## 重要约束

- 在本项目中，请仅使用 Read、Write、Grep 和 PowerShell 工具。
- 不要使用 WebSearch、WebFetch 或任何 MCP 搜索工具。
- 不要生成长篇解释，回答要精简。

---
