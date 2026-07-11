---
name: 强制：在每次代码更改后运行适当的验证工具。在代码无错误之前不要完成任务。
description: "强制：在每次代码更改后运行适当的验证工具。在代码无错误之前不要完成任务。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# Lint 和验证技能

> **强制：** 在每次代码更改后运行适当的验证工具。在代码无错误之前不要完成任务。

### 各生态系统的步骤

#### Node.js / TypeScript
1. **Lint/修复：** `npm run lint` 或 `npx eslint "path" --fix`
2. **类型检查：** `npx tsc --noEmit`
3. **安全：** `npm audit --audit-level=high`

#### Python
1. **Linter（Ruff）：** `ruff check "path" --fix`（快速且现代）
2. **安全（Bandit）：** `bandit -r "path" -ll`
3. **类型（MyPy）：** `mypy "path"`

## 质量循环
1. **写/编辑代码**
2. **运行审计**针对项目生态系统：
   - **Node.js / TypeScript：** `npm run lint && npx tsc --noEmit`
   - **Python：** `ruff check . --fix && mypy . && bandit -r . -ll`
3. **分析报告：** 检查"最终审计报告"部分。
4. **修复并重复：** 提交带有"最终审计"失败的代码是不允许的。

## 错误处理
- 如果 `lint` 失败：立即修复样式或语法问题。
- 如果 `tsc` 失败：在继续之前纠正类型不匹配。
- 如果没有工具配置：检查项目根目录是否存在 `.eslintrc`、`tsconfig.json`、`pyproject.toml` 并建议创建一个。

