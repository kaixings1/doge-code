---
description: 对单个文件运行 ECC 格式化器质量门禁，并报告修复步骤。
---

# 质量门禁命令

格式化器质量门禁的操作入口，该门禁通常作为 `post:quality-gate` PostToolUse hook（`scripts/hooks/quality-gate.js`）运行。

## 它实际如何工作

该门禁是由 hook 输入驱动的单文件格式化器检查，而非 CLI 标志：

- 脚本从 hook 的 stdin JSON（`tool_input.file_path`）读取目标；它不接受路径参数。
- 行为开关是环境变量：
  - `ECC_QUALITY_GATE_FIX=true` - 应用格式化修复，而非仅检查
  - `ECC_QUALITY_GATE_STRICT=true` - 把格式化器失败记录为门禁失败
- 按文件类型的覆盖范围：
  - `.ts/.tsx/.js/.jsx/.json/.md` - Biome `check` 或 Prettier `--check`，
    取决于项目使用哪一个（Biome 下的 JS/TS 在此跳过，因为
    `post-edit-format` 已经运行了 `biome check --write`）
  - `.go` - `gofmt`
  - `.py` - `ruff format`
- lint 和类型检查不属于此门禁。lint/类型/测试流水线请使用 `verification-loop`
  技能或各语言的验证技能。

## 用法

要对单个文件手动运行门禁，把 hook 风格的 JSON 管道输入脚本
（如果想要修复或严格行为，先设置环境变量开关）：

```bash
echo '{"tool_input":{"file_path":"src/example.ts"}}' \
  | ECC_QUALITY_GATE_FIX=true node scripts/hooks/quality-gate.js
```

然后报告格式化器发现项以及具体的修复步骤。

## 说明

Hook 接线通过 `hooks/hooks.json` 中的异步 PostToolUse 分发器进入。其内部注册表保留了 `post:quality-gate` ID 以及 `standard`/`strict` 配置文件。

## 参数

$ARGUMENTS：

- `[path]` 可选，要检查的文件。脚本本身不接受任何 CLI
  参数 —— 当给出路径时，在运行命令之前，把上面 stdin JSON 中的
  `tool_input.file_path` 替换为该路径
