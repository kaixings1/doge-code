---
name: ccg
description: 通过 /ask codex + /ask antigravity（或 gemini）实现 Claude-Codex-Gemini 三模型编排，然后由 Claude 综合结果
level: 5
---

# CCG - Claude-Codex-Gemini 三模型编排

CCG 通过规范的 `/ask` 技能路由（`/ask codex` + `/ask antigravity`），然后 Claude 把两份输出综合为一个答案。

当你想要并行的外部视角、又不想启动 tmux 团队 worker 时使用此技能。

## 何时使用

- 在一次请求中同时处理后端/分析 + 前端/UI 工作
- 从多视角进行代码审查（架构 + 设计/UX）
- 在 Codex 与 Antigravity/Gemini 可能分歧时做交叉验证
- 无需团队运行时编排的快速顾问式并行输入

## 要求

- **Codex CLI**：`npm install -g @openai/codex`（或 `@openai/codex`）
- **Antigravity CLI**（Google 对 Gemini CLI 的继任者）：按 [Antigravity 官方说明](https://antigravity.google)
  安装 `agy` 二进制（运行任何安装器前先检查它）。验证：`agy --version`
- **Gemini CLI** 仍支持企业/API 密钥场景：`npm install -g @google/gemini-cli`
- `omc ask` 命令可用
- 如果任一 CLI 不可用，就用可用的那个提供方继续，并注明该限制

## 工作原理

```text
1. Claude 把请求分解为两个顾问提示：
   - Codex 提示（分析/架构/后端）
   - Antigravity 提示（UX/设计/文档/替代方案）—— 企业场景用 gemini

2. Claude 通过 CLI 运行（不支持技能嵌套）：
   - `omc ask codex "<codex prompt>"`
   - `omc ask antigravity "<antigravity prompt>"`
     （企业场景用 `omc ask gemini "<gemini prompt>"`）

3. 工件写入 `.omc/artifacts/ask/` 下

4. Claude 把两份输出综合为一个最终回复
```

## 执行协议

被调用时，Claude **必须**遵循此工作流：

### 1. 分解请求
把用户请求拆分为：

- **Codex 提示：** 架构、正确性、后端、风险、测试策略
- **Antigravity 提示：** UX/内容清晰度、替代方案、边界情况可用性、文档润色
- **综合计划：** 如何调和冲突

### 2. 通过 CLI 调用顾问

> **注意：** Claude Code 不支持技能嵌套（在活动技能内调用技能）。始终通过 Bash 工具走直接 CLI 路径。

运行两个顾问（根据你的配置使用 antigravity 或 gemini）：

```bash
omc ask codex "<codex prompt>"
omc ask antigravity "<antigravity prompt>"
```

企业回退：

```bash
omc ask gemini "<gemini prompt>"
```

### 3. 收集工件

从以下位置读取最新的 ask 工件：

```text
.omc/artifacts/ask/codex-*.md
.omc/artifacts/ask/antigravity-*.md
.omc/artifacts/ask/gemini-*.md
```

### 4. 综合

返回一个统一答案，包含：

- 一致的建议
- 冲突的建议（明确点出）
- 选定的最终方向 + 理由
- 行动清单

## 回退方案

如果一个提供方不可用：

- 用可用的提供方 + Claude 综合继续
- 清楚注明缺失的视角和风险

如果两者都不可用：

- 回退到仅 Claude 的回答，并说明 CCG 外部顾问不可用

## 调用

```bash
/oh-my-claudecode:ccg <task description>
```

示例：

```bash
/oh-my-claudecode:ccg 审查这个 PR —— 架构/安全交给 Codex，UX/可读性交给 Antigravity
```
