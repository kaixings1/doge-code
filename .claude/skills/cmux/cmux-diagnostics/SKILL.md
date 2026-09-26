---
name: cmux-diagnostics
description: "为最终用户运行 cmux 诊断。当 cmux hooks、通知、会话恢复、设置、浏览器自动化、socket 访问、CLI 控制或 agent 恢复行为不工作，或用户要求做 cmux 健康检查、doctor 报告或可安全用于支持求助的调试摘要时使用。"
---

# cmux 诊断

为最终用户收集并解读可安全用于支持求助的 cmux 诊断信息。默认只做只读检查。绝不要导出 hook 配置文件、会话存储、prompt 日志、token 或环境密钥。

## 快速报告

先从实际存在的安装路径运行随附的只读脚本：

```bash
skills/cmux-diagnostics/scripts/cmux-diagnostics            # cmux 仓库检出
~/.agents/skills/cmux-diagnostics/scripts/cmux-diagnostics  # 已安装的技能
~/.codex/skills/cmux-diagnostics/scripts/cmux-diagnostics   # 仅 Codex 的 skills.sh 安装
```

只有当工作区名称、cwd 路径和当前 cmux 标识符与所报告的问题相关时，才加上 `--include-context`。

## 要检查什么

1. **CLI 与 socket 健康状态**：`command -v cmux`、`cmux ping`、`cmux capabilities --json`。如果 socket 命令失败，检查 agent 是否运行在 cmux 终端内，以及 socket 自动化是否已启用。
2. **设置健康状态**：`cmux-settings validate` 和 `cmux-settings get terminal.autoResumeAgentSessions`（脚本来自 `~/.agents/skills/cmux-settings/scripts/`，若是 `skills.sh` 安装则在 `~/.codex/skills/...`）。当 `terminal.autoResumeAgentSessions` 为 false 时，cmux 会恢复 pane，但不会恢复已保存的 agent 会话。
3. **钩子安装情况**：`cmux hooks setup --agent codex`、`--agent opencode`，或不带参数的 `cmux hooks setup`（会安装 PATH 上找到的受支持 agent，跳过缺失的）。只有在用户同意之后才运行安装或卸载命令。
4. **会话恢复证据**：`ls -lh ~/.cmuxterm/*-hook-sessions.json 2>/dev/null`。缺少存储通常意味着自安装钩子以来 agent 从未在 cmux 内运行过、钩子被禁用，或者该集成不支持恢复捕获。
5. **通知链路**：`cmux notify "cmux diagnostic test"`，且仅在用户已准备好接收一条可见测试通知时执行。

## 结果解读

- 找不到 `cmux`：CLI 未安装，或不在当前 shell 的 PATH 上。
- `cmux ping` 失败：app 已关闭、无法通过当前 socket 路径访问，或自动化访问被禁用。
- 没有 `CMUX_WORKSPACE_ID` 或 `CMUX_SURFACE_ID`：该命令运行在 cmux 终端之外。某些钩子在那里会有意什么都不做。
- 有钩子配置但没有会话存储：安装钩子后在 cmux 内运行一个受支持的 agent，然后重新检查。
- 有会话存储但恢复时没有 agent：检查 `terminal.autoResumeAgentSessions`，以及保存的可执行文件是否仍存在于 PATH 上。
- 设置校验失败：先修好配置。配置无效会让后续症状都变得有误导性。

## 规则

- 在用户要求修复之前，保持只读。
- 绝不打印原始钩子文件、会话 JSON、prompt 日志、shell 历史、token 或 API key。改为汇总文件是否存在、大小、修改时间和标记是否出现。
- 优先采用范围窄的修复，例如 `cmux hooks setup --agent codex`，而不是把所有集成都重装一遍。
- 修复之后，重新运行诊断脚本并报告发生变化的那些行。
