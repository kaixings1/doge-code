---
name: setup
description: 首次安装/更新路由 — 将 setup、doctor 或 MCP 请求发送到正确的 OMC 设置流程。
level: 2
---

# 安装设置

使用 `/oh-my-claudecode:setup` 作为统一的安装/配置入口。

## 用法

```bash
/oh-my-claudecode:setup                # 完整安装向导
/oh-my-claudecode:setup doctor         # 安装诊断
/oh-my-claudecode:setup mcp            # MCP 服务器配置
/oh-my-claudecode:setup wizard --local # 显式指定向导路径
```

## 路由

仅依据**第一个参数**处理请求，让安装/设置类问题立即落到正确的流程：

- 无参数、`wizard`、`local`、`global` 或 `--force` -> 路由到 `/oh-my-claudecode:omc-setup`，并原样传递剩余参数
- `doctor` -> 路由到 `/oh-my-claudecode:omc-doctor`，并传递 `doctor` 标记之后的所有内容
- `mcp` -> 路由到 `/oh-my-claudecode:mcp-setup`，并传递 `mcp` 标记之后的所有内容

示例：

```bash
/oh-my-claudecode:setup --local          # => /oh-my-claudecode:omc-setup --local
/oh-my-claudecode:setup doctor --json    # => /oh-my-claudecode:omc-doctor --json
/oh-my-claudecode:setup mcp github       # => /oh-my-claudecode:mcp-setup github
```

## 说明

- `/oh-my-claudecode:omc-setup`、`/oh-my-claudecode:omc-doctor` 和 `/oh-my-claudecode:mcp-setup` 仍是有效的兼容入口。
- 在新的文档和用户指引中，优先使用 `/oh-my-claudecode:setup`。

任务：{{ARGUMENTS}}
