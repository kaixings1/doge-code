---
name: 使用 Plankton 实现编写时代码质量强制执行
description: "使用 Plankton 实现编写时代码质量强制执行 —— 通过钩子在每次文件编辑时进行自动格式化、代码检查，并由 Claude 驱动自动修复。"
origin: community
---

# Plankton 代码质量技能（Plankton Code Quality Skill）

Plankton（感谢 @alxfazio）的集成参考，这是一个针对 Claude Code 的编写时（Write-time）代码质量强制执行系统。Plankton 通过工具调用后钩子（PostToolUse hooks）在每次文件编辑时运行格式化程序和 Linter，然后启动 Claude 子进程（Subprocess）来修复智能体（Agent）未捕捉到的违规项。

## 适用场景

- 你希望在每次文件编辑时（而不只是提交时）自动进行格式化和代码检查。
- 你需要防御智能体通过修改 Linter 配置来绕过检查，而不是真正修复代码。
- 你希望针对修复任务进行分级模型路由（Haiku 用于简单样式，Sonnet 用于逻辑，Opus 用于类型）。
- 你使用多种语言进行开发（Python, TypeScript, Shell, YAML, JSON, TOML, Markdown, Dockerfile）。

## 工作原理

### 三阶段架构

每当 Claude Code 编辑或写入文件时，Plankton 的 `multi_linter.sh` 工具调用后钩子（PostToolUse hook）就会运行：

```
阶段 1: 自动格式化 (静默)
├─ 运行格式化程序 (ruff format, biome, shfmt, taplo, markdownlint)
├─ 静默修复 40-50% 的问题
└─ 不向主智能体输出任何内容

阶段 2: 收集违规项 (JSON)
├─ 运行 Linter 并收集无法自动修复的违规项
├─ 返回结构化 JSON: {line, column, code, message, linter}
└─ 仍不向主智能体输出任何内容

阶段 3: 委派 + 验证
├─ 启动带有违规 JSON 的 claude -p 子进程
├─ 根据违规复杂性路由到不同层级的模型：
│   ├─ Haiku: 格式化、导入、样式 (E/W/F 代码) — 120s 超时
│   ├─ Sonnet: 复杂性、重构 (C901, PLR 代码) — 300s 超时
│   └─ Opus: 类型系统、深度推理 (unresolved-attribute) — 600s 超时
├─ 重新运行阶段 1+2 以验证修复结果
└─ 如果清理完成则 Exit 0，如果仍存在违规项则 Exit 2（报告给主智能体）
```

### 主智能体看到的内容

| 场景 | 智能体看到的内容 | 钩子退出码 |
|------|----------------|------------|
| 全部通过 | 无输出 —— 零干扰 | 0 |
| 已修复 | 无输出 —— 零干扰 | 0 |
| 仍有违规 | 违规摘要以 `⛔ 未修复的违规项:` 开头 | 2 |