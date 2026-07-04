---
name: accesslint-scan
description: "审计实时页面的无障碍问题，精确定位每个 WCAG 违规，并返回基于选择器的修复工作清单，不进行编辑。"
risk: safe
source: "https://github.com/AccessLint/skills"
date_added: "2026-06-02"
---

审计实时页面并报告哪些地方有问题以及在哪里。定位问题；不要修复。如果 `$ARGUMENTS` 中没有 URL，请询问。

## 何时使用
- 当任务与此描述匹配时使用此技能：审计实时页面的无障碍问题，精确定位每个 WCAG 违规，并返回基于选择器的修复工作清单，不进行编辑。

## 1. 审计

```bash
PORT=$(npx -y @accesslint/chrome@latest ensure | node -e 'process.stdin.on("data",d=>process.stdout.write(""+JSON.parse(d).port))')
npx -y @accesslint/cli@latest "<url>" --port "$PORT" --format json
```

按需使用标志：`--selector`、`--wait-for "<selector>"`、`--include-aaa`、`--disable <rules>`。

## 2. 报告

按影响计数，然后每个违规一个条目：

- **位置** — 选择器原文 + `file:line (symbol)`（如果存在 `source`）— 绝不编造。如果没有违规有 `source`，注明 "source mapping unavailable — located by selector only"。
- **证据** — 对比度、缺少属性、空名称
- **修复** — 机械变更或 `NEEDS HUMAN`

不要编辑。对于修复：应用机械修复然后重新运行验证；批量工作移交给 `accesslint:audit`。

## 3. 清理

```bash
npx -y @accesslint/chrome@latest stop --all  # 如果 ensure 报告 "managed":false 则跳过
```

## 注意事项

- `ensure` 始终决定端口 — 永远不要硬编码 9222。
- CLI exit 2 = URL 错误或页面从未加载；检查 dev server。

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
