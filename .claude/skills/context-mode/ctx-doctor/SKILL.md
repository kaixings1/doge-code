---
name: ctx-doctor
description: |
  运行 context-mode 诊断。检查运行时、hook、FTS5、
  插件注册、npm 与市场版本。
  触发：/context-mode:ctx-doctor
user-invocable: true
---

# Context Mode 诊断

运行诊断，并把结果直接显示在对话中。

## 操作步骤

1. 直接调用 `ctx_doctor` MCP 工具。它在服务端完成全部检查，并返回一份纯文本状态报告。
2. 原样显示结果 —— 它们已按纯文本状态前缀排版好：`[OK]` 表示 PASS，`[FAIL]` 表示 FAIL，`[WARN]` 表示 WARN。为保证跨客户端兼容（例如 Z.ai GLM），格式对渲染器安全（不使用 markdown 任务列表语法）。
3. **兜底方案**（仅在 MCP 工具调用失败时）：从本技能的所在目录推导出**插件根目录**（向上两层 —— 去掉 `/skills/ctx-doctor`），然后用 Bash 运行：
   ```
   CLI="<PLUGIN_ROOT>/cli.bundle.mjs"; [ ! -f "$CLI" ] && CLI="<PLUGIN_ROOT>/build/cli.js"; node "$CLI" doctor
   ```
   用相同的 `[OK]`/`[FAIL]`/`[WARN]` 前缀原样重新显示结果。
