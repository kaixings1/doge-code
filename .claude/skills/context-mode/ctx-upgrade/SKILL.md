---
name: ctx-upgrade
description: |
  从 GitHub 更新 context-mode，并修复 hook/设置。
  拉取最新代码、构建、安装、更新 npm 全局包、配置 hook。
  触发：/context-mode:ctx-upgrade
user-invocable: true
---

# Context Mode 升级

从 GitHub 拉取最新代码并重装插件。

## 操作步骤

1. 直接调用 `ctx_upgrade` MCP 工具。它会返回一条要执行的 shell 命令。
2. 用你的 shell 执行工具（Bash、shell_execute 等）运行返回的命令。
3. 把结果显示为 markdown 清单：
   ```
   ## context-mode 升级
   - [x] 已从 GitHub 拉取最新代码
   - [x] 已构建并安装 v1.0.39
   - [x] 已配置 hook
   - [x] 诊断：所有检查 PASS
   ```
   `[x]` 表示成功，`[ ]` 表示失败。显示实际版本号。
4. 告诉用户**重启会话**以启用新版本。
5. **兜底方案**（仅在 MCP 工具调用失败时）：从本技能的所在目录推导出**插件根目录**（向上两层 —— 去掉 `/skills/ctx-upgrade`），然后用 Bash 运行：
   ```
   CLI="<PLUGIN_ROOT>/cli.bundle.mjs"; [ ! -f "$CLI" ] && CLI="<PLUGIN_ROOT>/build/cli.js"; node "$CLI" upgrade
   ```
