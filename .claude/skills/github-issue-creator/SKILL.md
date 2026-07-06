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
> so I was trying to deploy the agent and it just failed silently no error nothing the 工作流 ran but then poof gone from the list had to refresh and try again three times

**Output**:
```markdown
## 摘要
Agent 部署 fails silently - no error displayed, agent disappears from list

## 环境
- **Product/Service**: Azure AI Foundry
- **Region/Version**: westus2

## 复现步骤
1. Navigate to agent 部署
2. Configure and deploy agent
3. Observe 工作流 completes
4. Check agent list

## 预期行为
Agent appears in list with 部署 status, errors shown if 部署 fails

## 实际行为
Agent disappears from list. No error message. Requires page refresh and retry.

## 影响
**High** - Blocks agent 部署 工作流, no feedback on failure cause

## 附加上下文
Required 3 retry attempts before successful 部署
```

---

**Input (error paste)**:
> Error: PERMISSION_DENIED when publishing to Teams channel. Code: 403. Was working yesterday.

**Output**:
```markdown
## 摘要
403 PERMISSION_DENIED error when publishing to Teams channel

## 环境
- **Product/Service**: Copilot Studio → Teams 集成
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
**High** - Blocks Teams 集成, regression from previous working state

## 附加上下文
Was working yesterday - possible permission/[Issue 的一行描述/]onfig change or service regression
```

## 何时使用
当您有非结构化的错误输入（如粘贴的错误、支持说明、截图或语音听写）并需要将其转化为干净的 GitHub 议题（包含摘要、复现步骤、预期与实际行为、影响和附件引用）时使用此技能。

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
