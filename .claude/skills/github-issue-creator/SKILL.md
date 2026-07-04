---
name: github-issue-creator
description: "将错误日志、截图、语音笔记和粗糙的 bug 报告转化为清晰的、开发者就绪的 GitHub Issue，包含复现步骤、影响和证据。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# GitHub Issue 创建器

将杂乱的输入（错误日志、语音笔记、截图）转化为干净、可操作的 GitHub Issue。

## 输出模板

```markdown
## 摘要
[One-line description of the issue]

## 环境
- **Product/Service**: 
- **Region/Version**: 
- **Browser/[Issue 的一行描述/]S**: (if relevant)

## 复现步骤
1. [Step]
2. [Step]
3. [Step]

## 预期行为
[What should happen]

## 实际行为
[What actually happens]

## 错误详情
```
[Error message/[Issue 的一行描述/]ode if applicable]
```

## 可视证据
[Reference to attached screenshots/GIFs]

## 影响
[Severity: Critical/High/Medium/Low + brief explanation]

## 附加上下文
[Any other relevant details]
```

## 输出位置

**Create issues as markdown files** in `/[Issue 的一行描述/]ssues/` directory at the repo root. Use naming convention: `YYYY-MM-DD-short-description.md`

## 指南

**Be crisp**: No fluff. Every word should add value.

**Extract structure from chaos**: Voice dictation and raw notes often contain the facts buried in casual language. Pull them out.

**Infer missing context**: If user mentions "same project" or "the dashboard", use context from conversation or memory to fill in specifics.

**Placeholder sensitive data**: Use `[PROJECT_NAME]`, `[USER_ID]`, etc. for anything that might be sensitive.

**Match severity to impact**:
- Critical: Service down, data loss, security issue
- High: Major feature broken, no workaround
- Medium: Feature impaired, workaround exists
- Low: Minor inconvenience, cosmetic

**Image/GIF handling**: Reference attachments inline. Format: `!Description`

## 示例

**Input (voice dictation)**:
> so I was trying to deploy the agent and it just failed silently no error nothing the workflow ran but then poof gone from the list had to refresh and try again three times

**Output**:
```markdown
## 摘要
Agent deployment fails silently - no error displayed, agent disappears from list

## 环境
- **Product/Service**: Azure AI Foundry
- **Region/Version**: westus2

## 复现步骤
1. Navigate to agent deployment
2. Configure and deploy agent
3. Observe workflow completes
4. Check agent list

## 预期行为
Agent appears in list with deployment status, errors shown if deployment fails

## 实际行为
Agent disappears from list. No error message. Requires page refresh and retry.

## 影响
**High** - Blocks agent deployment workflow, no feedback on failure cause

## 附加上下文
Required 3 retry attempts before successful deployment
```

---

**Input (error paste)**:
> Error: PERMISSION_DENIED when publishing to Teams channel. Code: 403. Was working yesterday.

**Output**:
```markdown
## 摘要
403 PERMISSION_DENIED error when publishing to Teams channel

## 环境
- **Product/Service**: Copilot Studio → Teams integration
- **Region/Version**: [REGION]

## 复现步骤
1. Configure agent for Teams channel
2. Attempt to publish

## 预期行为
Agent publishes successfully to Teams channel

## 实际行为
Returns `PERMISSION_DENIED` with code 403

## 错误详情
```
Error: PERMISSION_DENIED
Code: 403
```

## 影响
**High** - Blocks Teams integration, regression from previous working state

## 附加上下文
Was working yesterday - possible permission/[Issue 的一行描述/]onfig change or service regression
```

## 何时使用
Use this skill when you have unstructured bug input such as pasted errors, support notes, screenshots, or voice dictation and need to turn it into a clean GitHub issue with a summary, reproduction steps, expected vs actual behavior, impact, and attachment references.

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
