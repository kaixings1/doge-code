---
name: Claude Code技能查找工具
description: Claude Code技能查找工具
---

# /u67e5/u627e/u6280/u80fd

This skill helps you discover and install skills from the open agent skills ecosystem.

## 何时使用此技能

当用户以下情况时使用此技能：

- 问"如何做 X"，其中 X 可能是已有技能的常见任务
- 说"找 X 的技能"或"有没有 X 的技能"
- 问"你能做 X 吗"，其中 X 是专业化能力
- 表达对扩展代理能力的兴趣
- Wants to search for tools, templates, or workflows
- Mentions they wish they had help with a specific domain (design, testing, 部署, etc.)

## /u4ec0/u4e48/u662f Skills CLI/uff1f

The Skills CLI (`npx skills`) is the package manager for the open agent skills ecosystem. Skills are modular packages that extend agent 能力 with specialized knowledge, workflows, and tools.

**Key commands:**

- `npx skills find [查询]` - Search for skills interactively or by keyword
- `npx skills add <package>` - Install a skill from GitHub or other sources
- `npx skills check` - Check for skill updates
- `npx skills update` - Update all installed skills

**Browse skills at:** https://skills.sh/

## /u5982/u4f55/u5e2e/u52a9/u7528/u6237/u67e5/u627e/u6280/u80fd

### /u6b65/u9aa4 1/uff1a/u4e86/u89e3/u4ed6/u4eec/u7684/u9700/u6c42

When a user asks for help with something, identify:

1. The domain (e.g., React, testing, design, 部署)
2. The specific task (e.g., writing tests, creating animations, reviewing PRs)
3. Whether this is a common enough task that a skill likely exists

### /u6b65/u9aa4 2/uff1a/u641c/u7d22/u6280/u80fd

Run the find command with a relevant 查询:

```bash
npx skills find [查询]
```

For example:

- User asks "how do I make my React app faster?" → `npx skills find react performance`
- User asks "can you help me with PR reviews?" → `npx skills find pr review`
- User asks "I need to create a changelog" → `npx skills find changelog`

The command will return results like:

```
Install with npx skills add <owner/repo@skill>

vercel-labs/agent-skills@vercel-react-best-practices
└ https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
```

### /u6b65/u9aa4 3/uff1a/u5411/u7528/u6237/u5c55/u793a/u9009/u9879

When you find relevant skills, present them to the user with:

1. The skill name and what it does
2. The install command they can run
3. A link to learn more at skills.sh

Example 响应:

```
I found a skill that might help! The "vercel-react-best-practices" skill provides
React and Next.js performance optimization guidelines from Vercel Engineering.

To install it:
npx skills add vercel-labs/agent-skills@vercel-react-best-practices

Learn more: https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
```

### /u6b65/u9aa4 4/uff1a/u63d0/u4f9b/u5b89/u88c5

If the user wants to proceed, you can install the skill for them:

```bash
npx skills add <owner/repo@skill> -g -y
```

The `-g` flag installs globally (user-level) and `-y` skips confirmation prompts.

## /u5e38/u89c1/u6280/u80fd/u5206/u7c7b

When searching, consider these common categories:

| Category        | Example Queries                          |
| --------------- | ---------------------------------------- |
| Web Development | react, nextjs, typescript, css, tailwind |
| Testing         | testing, jest, playwright, e2e           |
| DevOps          | deploy, docker, kubernetes, ci-cd        |
| Documentation   | docs, readme, changelog, api-docs        |
| Code Quality    | review, lint, refactor, best-practices   |
| Design          | ui, ux, design-system, accessibility     |
| Productivity    | 工作流, automation, git                |

## /u6709/u6548/u641c/u7d22/u7684/u6280/u5de7

1. **Use specific keywords**: "react testing" is better than just "testing"
2. **Try alternative terms**: If "deploy" doesn't work, try "部署" or "ci-cd"
3. **Check popular sources**: Many skills come from `vercel-labs/agent-skills` or `ComposioHQ/awesome-claude-skills`

## /u5f53/u672a/u627e/u5230/u6280/u80fd/u65f6

If no relevant skills exist:

1. Acknowledge that no existing skill was found
2. Offer to help with the task directly using your general 能力
3. Suggest the user could create their own skill with `npx skills init`

Example:

```
I searched for skills related to "xyz" but didn't find any matches.
I can still help you with this task directly! Would you like me to proceed?

If this is something you do often, you could create your own skill:
npx skills init my-xyz-skill
```
