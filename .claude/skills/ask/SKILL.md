---
name: ask
description: 通过 omc ask 路由 Claude、Codex、Gemini、Antigravity、Grok 或 Cursor 的流程优先顾问，支持产物捕获，不直接组装 CLI 命令。
---

# 提问

使用 OMC 的规范化顾问技能，把提示词经由本地的 Claude、Codex、Gemini、Antigravity、Grok 或 Cursor CLI 路由出去，并把结果保存为 ask 产物。

## 用法

```bash
/oh-my-claudecode:ask <claude|codex|gemini|antigravity|grok|cursor> <question or task>
```

示例：

```bash
/oh-my-claudecode:ask codex "从安全视角审查这个补丁"
/oh-my-claudecode:ask gemini "为这个流程提出 UX 改进建议"
/oh-my-claudecode:ask antigravity "为这个流程提出 UX 改进建议"
/oh-my-claudecode:ask claude "为 issue #123 起草一份实施方案"
/oh-my-claudecode:ask cursor "应用这份实施方案"
```

## 路由

**要求的执行路径 —— 始终使用此命令：**

```bash
omc ask {{ARGUMENTS}}
```

**不要手动拼装原始的 provider CLI 命令。** 绝不要为了完成本技能而直接运行 `codex`、`claude`、`gemini`、`agy`、`grok` 或 `cursor-agent`。`omc ask` 包装器会自动处理正确的参数选择、产物持久化以及 provider 版本兼容性。手动拼装 provider CLI 参数会产生错误或过时的调用。

## 前置要求

- 所选的本地 CLI 必须已安装并完成认证。
- 用对应的命令确认其可用性：

```bash
claude --version
codex --version
gemini --version
agy --version
grok --version
cursor-agent --version
```

- **安装 Antigravity CLI**（Google 出品的 Gemini CLI 后继者）：请按照
  [官方 Antigravity 说明](https://antigravity.google) 安装 `agy` 二进制文件（运行任何
  安装脚本前先检查其内容）。验证：`agy --version`
  > **平台说明：** `omc ask antigravity` 在 macOS/Linux 上受支持。在 Windows 上它会被一个明确的错误拦住，因为 `agy --print` 把提示词作为 argv 值接收（无法读取 stdin），并且上游已知存在 Windows 下 `-p` 的限制；在 Windows 上请使用 `omc ask gemini`。
- **Gemini CLI** 在企业/API-key 场景下仍然受支持。

## 产物

`omc ask` 会把产物写入：

```text
.omc/artifacts/ask/<provider>-<slug>-<timestamp>.md
```

任务：{{ARGUMENTS}}
