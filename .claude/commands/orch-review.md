---
description: 对一个 diff（本地变更或 GitHub PR）运行 orch-review 原生 Workflow，并报告阻塞性与建议性发现。orch-review 工作流的入口。
argument-hint: [pr-number | pr-url | blank for local uncommitted changes]
---

# /orch-review

`workflows/orch-review.workflow.js` 的入口 —— orch-pipeline 阶段 5（审查）的原生 Workflow 移植版。此命令计算 diff、交给工作流，并呈现结果。工作流负责扇出（每个维度一个审查者、去重、对抗性验证）；此命令负责输入和输出。

**输入**：$ARGUMENTS

---

## 模式选择

| Input | Mode |
|---|---|
| 留空 | **本地模式** —— 审查未提交的变更 |
| 数字（如 `42`）或 PR URL | **PR 模式** —— 审查一个 GitHub PR |

---

## 阶段 1 —— 收集

构建统一 diff 和工作流所需的元数据。

**本地模式：**

```bash
git diff --name-only HEAD          # changedFiles
git diff HEAD                      # diff text
```

如果 diff 为空，停止："Nothing to review."

**PR 模式：**

先从 `$ARGUMENTS` 推导出一个**安全的数字 PR id** —— 绝不要把原始参数传给 shell。接受裸整数，或 `https://github.com/<owner>/<repo>/pull/<N>` URL 末尾的数字。拒绝其他任何形式（多余文本、shell 元字符、非 PR URL）并以错误停止。下面只使用提取出的整数 `<NUMBER>`：

```bash
gh pr diff <NUMBER>                       # diff text
gh pr view <NUMBER> --json files \
  --jq '.files[].path'                    # changedFiles
```

如果找不到 PR，以错误停止。

然后从占主导的变更文件扩展名推导 `language`（例如 `.ts`/`.tsx` → `typescript`，`.py` → `python`，`.go` → `go`）。当变更是混合的或非代码时，保持未设置 —— 工作流会直接跳过语言专属的审查者。

## 阶段 2 —— 调用

调用 Workflow 工具。工作流会校验自己的输入，并在 diff 缺失或为空时失败关闭（fail closed），因此始终传入非空的 `diff`。

```jsonc
Workflow({
  scriptPath: "workflows/orch-review.workflow.js",
  args: {
    diff: "<unified diff text from Phase 1>",   // required
    language: "typescript",                      // optional
    changedFiles: ["src/auth.ts"]                // optional — feeds the security trigger
  }
})
```

工作流并行扇出审查者，基于归一化的证据片段对发现项去重，并对每个唯一的 CRITICAL/HIGH 发现项运行对抗性验证器。它返回：

```jsonc
{
  "verdict": "APPROVE" | "CHANGES_REQUESTED",
  "incomplete": false,                 // true if a review dimension failed to run
  "failedDimensions": [ /* { dimension, error } */ ],
  "blocking": [ /* confirmed CRITICAL/HIGH + unverifiable findings */ ],
  "advisory": [ /* MEDIUM/LOW + adversarially-refuted findings */ ],
  "stats": { "dimensions": 3, "failed": 0, "raw": 11, "unique": 4, "confirmed": 3, "unverified": 0, "uncertain": 0, "refuted": 1 }
}
```

## 阶段 3 —— 报告

向用户呈现结果（这是人工审查关卡；工作流不做任何提交）：

- 先给出 `verdict` 和 `stats` 行（维度数、raw 到 unique 的收敛）。
- 逐条列出所有 `blocking` 发现项，附文件、严重程度和证据 —— 这些必须在提交前清除。标记为 "could not be verified" 的发现项按设计保留在 `blocking` 中；请明确指出它们需要人工确认。
- 简要列出 `advisory` 发现项（MEDIUM/LOW 以及被验证器驳回的项）。
- 如果 `incomplete` 为 true，说明 `failedDimensions` 中有哪些维度未运行，因此该裁决并非干净的批准。

## 失败关闭契约

当审查无法完整运行时，此命令绝不可呈现一个干净的 APPROVE。如果 Workflow 工具本身出错，报告该失败 —— 不要退回手工审查，也不要暗示该 diff 已获批准。

---

## 边界情况

- **没有 `gh` CLI（PR 模式）**：停止并告知用户 PR 模式需要 `gh`；改为建议对已检出分支使用本地模式。
- **大型 diff**：工作流会自动限制审查者并发，因此大 diff 更慢但安全；提醒用户可能需要更长时间。
- **二进制或生成的文件**：调用前把它们从 `changedFiles` 中剔除 —— 它们会给安全触发条件增加噪音，却没有可审查的内容。
