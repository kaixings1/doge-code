---
name: gsd:config
配置 GSD 设置 - 工作流切换、高级参数、集成和模型配置。
argument-hint: "[--advanced | --integrations | --profile <name>]"
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
requires: [code-review, review, settings]
---

<objective>
通过一个统一的命令交互式配置 GSD 设置。

模式路由：
- **默认**（无标志）：常见切换（模型、研究、计划检查、验证器、分支）→ settings 工作流
- **--advanced**：高级用户选项（规划调整、超时、分支模板、跨 AI 执行）→ settings-advanced 工作流
- **--integrations**：第三方 API 密钥、代码审查 CLI 路由、智能体技能注入 → settings-integrations 工作流
- **--profile <name>**：切换模型配置文件（quality|balanced|budget|inherit）→ set-profile（内联）
</objective>

<routing>

| 标志 | 操作 | 工作流 |
|------|--------|----------|
| (none) | 交互式 5 问题常见配置提示 | settings |
| --advanced | 高级用户选项：规划、执行、讨论、跨 AI、git、运行时 | settings-advanced |
| --integrations | API 密钥（Brave/Firecrawl/Exa）、审查 CLI 路由、智能体技能 | settings-integrations |
| --profile &lt;name&gt; | 无交互提示切换模型配置文件 | gsd-sdk config-set-model-profile |

</routing>

<execution_context>
@~/.claude/get-shit-done/workflows/settings.md
@~/.claude/get-shit-done/workflows/settings-advanced.md
@~/.claude/get-shit-done/workflows/settings-integrations.md
</execution_context>

<context>
参数：$ARGUMENTS

解析 $ARGUMENTS 的第一个令牌：
- 如果是 `--advanced`：去掉标志，执行 settings-advanced 工作流
- 如果是 `--integrations`：去掉标志，执行 settings-integrations 工作流
- 如果以 `--profile` 开头：提取配置文件名称（`--profile` 后的剩余部分），然后：
  1. **预检检查（#2439）：** 通过 `command -v gsd-sdk` 验证 `gsd-sdk` 在 PATH 中。
     如果缺失，发出安装提示 `Install GSD via 'npm i -g get-shit-done'` 并停止——
     不要直接调用 `gsd-sdk`（避免模糊的 `command not found: gsd-sdk` 错误）。
  2. 运行：`gsd-sdk query config-set-model-profile <profile-name> --raw` 并逐字显示输出。
- 否则：执行 settings 工作流（无需参数）
</context>

<process>
1. 从 $ARGUMENTS 解析前导标志（如有）。
2. 加载并端到端执行适当的工作流，或为 --profile 运行内联 SDK 命令。
3. 保留目标工作流的所有工作流关卡。
</process>
