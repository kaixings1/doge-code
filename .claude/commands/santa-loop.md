---
description: 对抗性双审查收敛循环 —— 两个独立的模型审查者必须都批准，代码才能交付。
---

# Santa Loop

使用 santa-method 技能的对抗性双审查收敛循环。两个独立审查者 —— 不同模型、无共享上下文 —— 必须都返回 NICE，代码才能交付。

## 目的

针对当前任务产出运行两个独立审查者（Claude Opus + 一个外部模型）。代码被推送之前两者都必须返回 NICE。如果任一方返回 NAUGHTY，就修复所有被标记的问题、提交，并重新运行全新的审查者 —— 最多 3 轮。

## 用法

```
/santa-loop [file-or-glob | description]
```

## 工作流

### 第 1 步：确定要审查什么

从 `$ARGUMENTS` 确定范围，或回退到未提交的变更：

```bash
git diff --name-only HEAD
```

读取所有变更文件以构建完整的审查上下文。如果 `$ARGUMENTS` 指定了路径、文件或描述，则改用那个作为范围。

### 第 2 步：构建评分标准

构建适合所审查文件类型的评分标准。每条准则都必须有客观的 PASS/FAIL 条件。至少包含：

| 准则 | 通过条件 |
|-----------|---------------|
| 正确性 | 逻辑健全、无 bug、处理边界情况 |
| 安全性 | 无密钥、注入、XSS 或 OWASP Top 10 问题 |
| 错误处理 | 错误被显式处理，无静默吞错 |
| 完整性 | 所有需求都已满足，无遗漏情况 |
| 内部一致性 | 文件或章节之间无矛盾 |
| 无回归 | 变更不破坏既有行为 |

根据文件类型添加领域专属准则（例如 TS 的类型安全、Rust 的内存安全、SQL 的迁移安全）。

### 第 3 步：双独立审查

使用 Agent 工具**并行**启动两个审查者（两者放在单条消息中以并发执行）。两者都必须完成后才能进入裁决关卡。

每个审查者将每条评分准则评估为 PASS 或 FAIL，然后返回结构化 JSON：

```json
{
  "verdict": "PASS" | "FAIL",
  "checks": [
    {"criterion": "...", "result": "PASS|FAIL", "detail": "..."}
  ],
  "critical_issues": ["..."],
  "suggestions": ["..."]
}
```

裁决关卡（第 4 步）把这些映射为 NICE/NAUGHTY：两者都 PASS → NICE，任一 FAIL → NAUGHTY。

#### 审查者 A：Claude Agent（始终运行）

启动一个 Agent（subagent_type: `code-reviewer`, model: `opus`），带上完整评分标准 + 所有被审查的文件。提示必须包含：
- 完整的评分标准
- 所有被审查文件的内容
- "You are an independent quality reviewer. You have NOT seen any other review. Your job is to find problems, not to approve."
- 返回上面的结构化 JSON 裁决

#### 审查者 B：外部模型（仅当未安装外部 CLI 时回退到 Claude）

首先，检测哪些 CLI 可用：
```bash
command -v codex >/dev/null 2>&1 && echo "codex" || true
command -v gemini >/dev/null 2>&1 && echo "gemini" || true
```

构建审查者提示（与审查者 A 相同的评分标准 + 指令），并写入唯一的临时文件：
```bash
PROMPT_FILE=$(mktemp /tmp/santa-reviewer-b-XXXXXX.txt)
cat > "$PROMPT_FILE" << 'EOF'
... full rubric + file contents + reviewer instructions ...
EOF
```

使用第一个可用的 CLI：

**Codex CLI**（如已安装）
```bash
codex exec --sandbox read-only -m gpt-5.4 -C "$(pwd)" - < "$PROMPT_FILE"
rm -f "$PROMPT_FILE"
```

**Gemini CLI**（如已安装且 codex 不可用）
```bash
gemini -p "$(cat "$PROMPT_FILE")" -m gemini-2.5-pro
rm -f "$PROMPT_FILE"
```

**Claude Agent 回退**（仅当 `codex` 和 `gemini` 都未安装时）
启动第二个 Claude Agent（subagent_type: `code-reviewer`, model: `opus`）。记录一条警告：两个审查者属于同一模型家族 —— 未实现真正的模型多样性，但上下文隔离仍然生效。

在所有情况下，审查者必须返回与审查者 A 相同的结构化 JSON 裁决。

### 第 4 步：裁决关卡

- **两者都 PASS** → **NICE** —— 进入第 6 步（推送）
- **任一 FAIL** → **NAUGHTY** —— 合并两个审查者的所有关键问题，去重，进入第 5 步

### 第 5 步：修复循环（NAUGHTY 路径）

1. 显示两个审查者的所有关键问题
2. 修复每个被标记的问题 —— 只改被标记的内容，不做顺手重构
3. 在单个提交中提交所有修复：
   ```
   fix: address santa-loop review findings (round N)
   ```
4. 用**全新的审查者**重跑第 3 步（对之前轮次无记忆）
5. 重复直到两者都返回 PASS

**最多 3 次迭代。** 如果 3 轮之后仍是 NAUGHTY，停止并呈现剩余问题：

```
SANTA LOOP ESCALATION (exceeded 3 iterations)

Remaining issues after 3 rounds:
- [list all unresolved critical issues from both reviewers]

Manual review required before proceeding.
```

**不要**推送。

### 第 6 步：推送（NICE 路径）

当两个审查者都返回 PASS 时：

```bash
git push -u origin HEAD
```

### 第 7 步：最终报告

打印输出报告（见下面的输出章节）。

## 输出

```
SANTA VERDICT: [NICE / NAUGHTY (escalated)]

Reviewer A (Claude Opus):   [PASS/FAIL]
Reviewer B ([model used]):  [PASS/FAIL]

Agreement:
  Both flagged:      [issues caught by both]
  Reviewer A only:   [issues only A caught]
  Reviewer B only:   [issues only B caught]

Iterations: [N]/3
Result:     [PUSHED / ESCALATED TO USER]
```

## 说明

- 审查者 A（Claude Opus）始终运行 —— 无论工具链如何，都保证至少有一位强力审查者。
- 模型多样性是审查者 B 的目标。GPT-5.4 或 Gemini 2.5 Pro 提供真正的独立性 —— 不同的训练数据、不同的偏见、不同的盲点。纯 Claude 回退仍通过上下文隔离提供价值，但失去了模型多样性。
- 使用可获得的最强模型：审查者 A 用 Opus，审查者 B 用 GPT-5.4 或 Gemini 2.5 Pro。
- 外部审查者以 `--sandbox read-only`（Codex）运行，以防审查期间改动仓库。
- 每轮使用全新审查者可防止先前发现的锚定偏差。
- 评分标准是最重要的输入。如果审查者草率盖章通过或标记主观风格问题，就收紧它。
- 提交发生在 NAUGHTY 轮次，因此即使循环被中断，修复也会被保留。
- 只在 NICE 之后才推送 —— 绝不在循环中途推送。
