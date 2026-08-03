import { getSessionMemoryContent } from '../../services/SessionMemory/sessionMemoryUtils.js'
import type { Message } from '../../types/message.js'
import { getMessagesAfterCompactBoundary } from '../../utils/messages.js'
import { registerBundledSkill } from '../bundledSkills.js'

function extractUserMessages(messages: Message[]): string[] {
  return messages
    .filter((m): m is Extract<typeof m, { type: 'user' }> => m.type === 'user')
    .map(m => {
      const content = m.message.content
      if (typeof content === 'string') return content
      return content
        .filter(
          (b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text',
        )
        .map(b => b.text)
        .join('\n')
    })
    .filter(text => text.trim().length > 0)
}

const SKILLIFY_PROMPT = `# Skillify {{userDescriptionBlock}}

你正在将本次会话的可重复流程捕获为可复用技能。

## 你的会话上下文

以下是会话记忆摘要：
<session_memory>
{{sessionMemory}}
</session_memory>

以下是用户在此会话中的消息。注意他们如何引导流程，以帮助在技能中捕获他们的详细偏好：
<user_messages>
{{userMessages}}
</user_messages>

## 你的任务

### 步骤 1：分析会话

在提出任何问题之前，分析会话以识别：
- 执行了什么可重复的流程
- 输入/参数是什么
- 不同的步骤（按顺序）
- 每个步骤的成功产物/标准（例如，不仅是"编写代码"，而是"CI 完全通过的开放 PR"）
- 用户在哪些地方纠正或引导了你
- 需要什么工具和权限
- 使用了哪些代理
- 目标和成功产物是什么

### 步骤 2：采访用户

你将使用 AskUserQuestion 来了解用户想要自动化的内容。重要说明：
- 对所有问题都使用 AskUserQuestion！绝不通过纯文本提问。
- 对于每轮，根据需要迭代，直到用户满意。
- 用户始终有一个自由的"其他"选项来输入编辑或反馈——不要添加你自己的"需要调整"或"我将提供编辑"选项。只提供实质性选择。

**第 1 轮：高级确认**
- 根据你的分析，建议技能名称和描述。请用户确认或重命名。
- 建议技能的高级目标和具体成功标准。

**第 2 轮：更多细节**
- 将你识别的高级步骤呈现为编号列表。告诉用户你将在下一轮深入研究细节。
- 如果你认为技能需要参数，根据你观察到的建议参数。确保你理解某人需要提供什么。
- 如果不清楚，询问此技能应该内联运行（在当前对话中）还是分叉运行（作为具有自己上下文的子代理）。分叉更适合不需要中途用户输入的自包含任务；内联更适合用户希望在中途引导的情况。
- 询问技能应该保存在哪里。根据上下文建议默认值（特定于仓库的工作流 → 仓库，跨仓库个人工作流 → 用户）。选项：
  - **此仓库**（\`.claude/skills/<name>/SKILL.md\`）——特定于此项目的工作流
  - **个人**（\`~/.claude/skills/<name>/SKILL.md\`）——跨所有仓库跟随你

**第 3 轮：分解每个步骤**
对于每个主要步骤，如果不是一目了然，询问：
- 此步骤产生什么后续步骤需要的内容？（数据、产物、ID）
- 什么证明此步骤成功，我们可以继续？
- 在继续之前是否应该要求用户确认？（特别是对于不可逆操作，如合并、发送消息或破坏性操作）
- 任何步骤是否独立，可以并行运行？（例如，同时发布到 Slack 和监控 CI）
- 技能应如何执行？（例如，始终使用任务代理进行代码审查，或调用代理团队执行一组并发步骤）
- 什么是硬约束或硬偏好？必须或不能发生的事情？

你可以在此进行多轮 AskUserQuestion，每轮一个步骤，特别是如果有超过 3 个步骤或许多澄清问题。根据需要迭代。

重要：特别注意用户在会话中纠正你的地方，以帮助告知你的设计。

**第 4 轮：最终问题**
- 确认何时应调用此技能，并建议/确认触发短语。（例如，对于 cherry-pick 工作流，你可以说：当用户想要将 PR cherry-pick 到发布分支时使用。示例：'cherry-pick to release'、'CP this PR'、'hotfix'。）
- 如果仍不清楚，你也可以询问任何其他注意事项或需要注意的事项。

一旦你有足够的信息就停止面试。重要：不要对简单的流程过度要求！

### 步骤 3：编写 SKILL.md

在用户第 2 轮选择的位置创建技能目录和文件。

使用此格式：

\`\`\`markdown
---
name: {{skill-name}}
description: {{one-line description}}
allowed-tools:
  {{list of tool permission patterns observed during session}}
when_to_use: {{detailed description of when Claude should automatically invoke this skill, including trigger phrases and example user messages}}
argument-hint: "{{hint showing argument placeholders}}"
arguments:
  {{list of argument names}}
context: {{inline or fork -- omit for inline}}
---

# {{技能标题}}
技能描述

## 输入
- \`$arg_name\`：此输入的说明

## 目标
清晰陈述此工作流的目标。最佳情况是你明确定义了产物或完成标准。

## 步骤

### 1. 步骤名称
在此步骤中做什么。要具体且可操作。在适当时包括命令。

**成功标准**：始终包括这个！这有助于模型理解用户对其工作流的期望，以及何时应该有信心继续。

重要：参见下面的每个步骤注释部分，你可以为每个步骤选择性地包括这些内容。

...
\`\`\`

**每步注释**：
- **成功标准**在每个步骤上都是必需的。这有助于模型理解用户对其工作流的期望，以及何时应该有信心继续。
- **执行**：\`Direct\`（默认）、\`Task agent\`（直接的子代理）、\`Teammate\`（具有真正并行性和代理间通信的代理）或 \`[human]\`（用户执行）。仅在不为 Direct 时需要指定。
- **产物**：此步骤生成的数据，后续步骤需要（例如，PR 编号、提交 SHA）。仅在后续步骤依赖它时包括。
- **人工检查点**：何时暂停并询问用户再继续。包括不可逆操作（合并、发送消息）、错误判断（合并冲突）或输出审查。
- **规则**：工作流的硬性规则。参考会话期间用户的纠正可能特别有用。

**步骤结构提示**：
- 可以并发运行的步骤使用子编号：3a、3b
- 需要用户操作的步骤在标题中加上 \`[human]\`
- 保持简单技能简单——2 步技能不需要在每个步骤上都加注释

**Frontmatter 规则**：
- \`allowed-tools\`：所需的最小权限（使用模式如 \`Bash(gh:*)\` 而不是 \`Bash\`）
- \`context\`：仅为不需要中途用户输入的自包含技能设置 \`context: fork\`。
- \`when_to_use\` 是关键——告诉模型何时自动调用。以"Use when..."开头，包括触发短语。示例："当用户想要将 PR cherry-pick 到发布分支时使用。示例：'cherry-pick to release'、'CP this PR'、'hotfix'。"
- \`arguments\` 和 \`argument-hint\`：仅在技能需要参数时包括。在正文中使用 \`$name\` 进行替换。

### 步骤 4：确认并保存

在写入文件之前，将完整的 SKILL.md 内容作为 yaml 代码块输出到你的响应中，以便用户可以用正确的语法高亮审查。然后使用 AskUserQuestion 请求确认，简单的问题如"这个 SKILL.md 看起来可以保存吗？"——不要使用 body 字段，保持问题简洁。

写入后，告诉用户：
- 技能保存在哪里
- 如何调用它：\`/{{skill-name}} [arguments]\`
- 他们可以直接编辑 SKILL.md 来完善它
`

export function registerSkillifySkill(): void {
  if (process.env.USER_TYPE !== 'ant') {
    return
  }

  registerBundledSkill({
    name: 'skillify',
    description:
      "将本次会话的可重复流程捕获为技能。在你想捕获的流程结束时调用，可选择提供描述。",
    allowedTools: [
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep',
      'AskUserQuestion',
      'Bash(mkdir:*)',
    ],
    userInvocable: true,
    disableModelInvocation: true,
    argumentHint: '[你想捕获的流程描述]',
    async getPromptForCommand(args, context) {
      const sessionMemory =
        (await getSessionMemoryContent()) ?? '没有可用的会话记忆。'
      const userMessages = extractUserMessages(
        getMessagesAfterCompactBoundary(context.messages),
      )

      const userDescriptionBlock = args
        ? `用户将此流程描述为："${args}"`
        : ''

      const prompt = SKILLIFY_PROMPT.replace('{{sessionMemory}}', sessionMemory)
        .replace('{{userMessages}}', userMessages.join('\n\n---\n\n'))
        .replace('{{userDescriptionBlock}}', userDescriptionBlock)

      return [{ type: 'text', text: prompt }]
    },
  })
}
