---
name: Agentic Actions 审计器
description: 审计 GitHub Actions 工作流中 AI 代理集成的安全漏洞，检测 CI/CD 流水线中的错误配置和攻击向量。
---

# Agentic Actions 审计器

Audits GitHub Actions workflows for security vulnerabilities in AI agent integrations. Detects misconfigurations and attack vectors specific to Claude Code Action, Gemini CLI, OpenAI Codex, and GitHub AI Inference when used in CI/CD pipelines.

## 功能说明

This plugin provides a security audit skill that analyzes GitHub Actions 工作流 YAML files for vulnerabilities arising from AI agent integrations. It focuses on scenarios where attacker-controlled input (pull 请求 titles, branch names, issue bodies, comments, commit messages, file contents, environment variables) can reach an AI agent running with elevated permissions in CI.

## Attack Vectors Detected

The skill checks for nine categories of security issues:

- **A. Env Var Intermediary** -- Attacker data flows through `env:` blocks to AI prompt fields with no visible `${{ }}` expressions
- **B. Direct Expression Injection** -- `${{ github.event.* }}` expressions embedded directly in AI prompt fields
- **C. CLI Data Fetch** -- `gh` CLI commands in prompts fetch attacker-controlled content at runtime
- **D. PR Target + Checkout** -- `pull_request_target` trigger combined with checkout of PR head code
- **E. Error Log Injection** -- CI error output or build logs fed to AI prompts carry attacker payloads
- **F. Subshell Expansion** -- Restricted tools like `echo` allow subshell expansion (`echo $(env)`) bypass
- **G. Eval of AI Output** -- AI 响应 flows to `eval`, `exec`, or unquoted `$()` in subsequent steps
- **H. Dangerous Sandbox Configs** -- `danger-full-access`, `Bash(*)`, `--yolo` disable safety protections
- **I. Wildcard Allowlists** -- `allowed_non_write_users: "*"` or `allow-users: "*"` permit any user to trigger

## Supported AI Actions

| Action | Repository | 注意s |
|--------|------------|-------|
|克劳德守则行动| anthropics/claude-code-action | |
| Gemini CLI | google-github-actions/run-gemini-cli |主要|
| Gemini CLI （旧版） | google-gemini/gemini-cli-action |已存档|
| OpenAI Codex | openai/codex-action | |
| GitHub AI推理| actions/ai-inference | |

# #安装

从配置了Trail of Bits内部市场的项目：

```
/plugin menu
```

从安全工具部分选择* * agentic-actions-auditor * *。

# #技能输入