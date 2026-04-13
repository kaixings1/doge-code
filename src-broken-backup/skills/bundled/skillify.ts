import { getSessionMemoryContent } from '../../../services/SessionMemory/sessionMemoryUtils.js';
import type { Message } from '../../../types/message.js';
import { getMessagesAfterCompactBoundary } from '../../../utils/messages.js';
import { registerBundledSkill } from '../bundledSkills.js';

function extractUserMessages(messages: Message[]): string[] {
  return messages
    .filter((m): m is Extract<typeof m, { type: 'user' }> => m.type === 'user')
    .map(m => {
      const content = m.message.content;
      if (typeof content === 'string') return content;
      return content
        .filter(
          (b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text',
        )
        .map(b => b.text)
        .join('\n');
    })
    .filter(text => text.trim().length > 0);
}

const SKILLIFY_PROMPT = `# 技能化 {{userDescriptionBlock}}

你正在将此会话的可重复流程捕获为可重用技能。

## 会话上下。

这是会话记忆摘要。
<session_memory>
{{sessionMemory}}
</session_memory>

这是会话期间用户的消息。注意他们如何引导流程，以帮助在技能中捕获他们的详细偏好：
<user_messages>
{{userMessages}}
</user_messages>

## 你的任务

### 步骤1：分析会。

在提问之前，分析会话以识别：
- 执行了什么可重复的流。
- 输入/参数是什。
- 不同的步骤（按顺序）
- 每个步骤的成功工）标准（例如，不仅仅是"编写代码"，而是"具有完全通过的CI的开放PR"。
- 用户在哪里纠正或引导了你
- 需要什么工具和权限
- 使用了哪些代。
- 目标和成功工件是什。

### 步骤2：采访用。

你将使用AskUserQuestion来理解用户想要自动化什么。重要说明：
- ）*所）*问题使用AskUserQuestion！永远不要通过纯文本提问。
- 对于每一轮，根据需要迭代，直到用户满意。
- 用户总是有一个自由格式的"其他"选项来输入编辑或反馈 - 不要添加你自己的"需要调））我将提供编辑"选项。只提供实质性选择。

**）轮：高层确认**
- 根据你的分析建议技能的名称和描述。请用户确认或重命名。
- 建议技能的高层目标和具体成功标准。

**）轮：更多细节**
- 将你识别的高层步骤呈现为编号列表。告诉用户你将在下一轮深入细节。
- 如果你认为技能需要参数，请根据你观察到的内容建议参数。确保你理解某人需要提供什么。
- 如果不清楚，询问此技能应该内联运行（在当前对话中）还是分叉运行（作为具有自己上下文的子代理）。分叉更适合不需要过程中用户输入的自包含任务；内联更适合当用户想要在过程中引导时。
- 询问技能应该保存在哪里。根据上下文建议默认值（特定于仓库的工作流→仓库，跨仓库的个人工作流→用户）。选项。
  - **此仓）* (\`.claude/skills/<名称>/SKILL.md\`) - 适用于此项目的特定工作流
  - **个人** (\`~/.claude/skills/<名称>/SKILL.md\`) - 在所有仓库中跟随。

**）轮：分解每个步骤**
对于每个主要步骤，如果不是显而易见，请问。
- 此步骤产生什么，后续步骤需要？（数据、工件、ID。
- 什么证明此步骤成功，并且我们可以继续？
- 在继续之前应该要求用户确认吗？（特别是对于不可逆的操作，如合并、发送消息或破坏性操作）
- 是否有任何步骤是独立的并且可以并行运行？（例如，同时发布到Slack和监控CI。
- 应该如何执行技能？（例如，始终使用Task代理进行代码审查，或调用代理团队进行一组并发步骤）
- 什么是硬约束或硬偏好？必须或不得发生的事情。

你在这里可以进行多轮AskUserQuestion，每步一轮，特别是如果有超过3个步骤或许多澄清问题时。根据需要迭代。

重要提示：特别注意用户在会话期间纠正你的地方，以帮助指导你的设计。

**）轮：最终问）*
- 确认此技能应在何时调用，并建）确认触发短语。（例如，对于cherry-pick工作流，你可以说：当用户想要将PR cherry-pick到发布分支时使用。示例：'cherry-pick to release'）CP this PR'）hotfix'。）
- 如果仍然不清楚，你还可以询问任何其他陷阱或需要注意的事项。

一旦你有足够的信息就停止采访。重要提示：对于简单流程不要过度提问！

### 步骤3：编写SKILL.md

在用户在）轮选择的位置创建技能目录和文件。

使用此格式：

\`\`\`markdown
---
名称: {{技能名称}}
描述: {{一行描述}}
允许工具:
  {{会话期间观察到的工具权限模式列表}}
何时使用: {{Claude应自动调用此技能的详细描述，包括触发短语和示例用户消息}}
参数提示: "{{显示参数占位符的提示}}"
参数:
  {{参数名称列表}}
上下。 {{内联或分）- 内联时省略}}
---

# {{技能标题}}
技能描。

## 输入
- \`$参数名称\`: 此输入的描述

## 目标
明确陈述此工作流的目标。最好有明确定义的工件或完成标准。

## 步骤

### 1. 步骤名称
在此步骤中要做什么。具体且可操作。适当时包括命令。

**成功标准**：始终包含此部分！这表明该步骤已完成并且我们可以继续。可以是列表。

重要提示：有关每个步骤的可选注释，请参见下一节。

...

\`\`\`

**每个步骤的注）*。
- **成功标准** 在每个步骤上都是必需的。这有助于模型理解用户对其工作流的期望，以及何时应该有信心继续。
- **执行**：\`直接\`（默认、\`任务代理\`（直接的子代理）、\`队友\`（具有真正并行性和代理间通信的代理）或\`[人工]\`（用户执行）。仅在不直接时需要指定。
- **工件**：此步骤产生的数据，后续步骤需要（例如，PR编号、提交SHA）。仅当后续步骤依赖它时包括。
- **人工检查点**：在继续之前暂停并询问用户。包括不可逆操作（合并、发送消息）、错误判断（合并冲突）或输出审查。
- **规则**：工作流的硬规则。参考会话期间的用户纠正可能特别有用。

**步骤结构提示**。
- 可以并发运行的步骤使用子编号）a）b
- 需要用户操作的步骤在标题中加上\`[人工]\`
- 保持简单技能的简单）- 2步技能不需要每个步骤都有注。

**前置规则**。
- \`允许工具\`：所需的最低权限（使用模式如\`Bash(gh:*)\`，而不是\`Bash\`。
- \`上下文\`：仅对不需要过程中用户输入的自包含技能设置\`上下。 分叉\`。
- \`何时使用\`至关重要 - 告诉模型何时自动调用。以"）.."开头并包括触发短语。示例："当用户想要将PR cherry-pick到发布分支时使用。示例：'cherry-pick to release'）CP this PR'）hotfix'。
- \`参数\`和\`参数提示\`：仅当技能接受参数时包括。在正文中使用\`$名称\`进行替换。

### 步骤4：确认并保存

在编写文件之前，将完整的SKILL.md内容作为yaml代码块输出在你的响应中，以便用户可以正确语法高亮查看。然后使用AskUserQuestion请求确认，使用简单的问题）此SKILL.md看起来可以保存吗。 - 不要使用正文字段，保持问题简洁。

编写后，告诉用户。
- 技能保存在哪里
- 如何调用：\`/{{技能名称}} [参数]\`
- 他们可以直接编辑SKILL.md来优化它
`

export function registerSkillifySkill(): void {
  if (process.env.USER_TYPE !== 'ant') {
    return;
  }

  registerBundledSkill({
    name: 'skillify',
    description: "将此会话的可重复流程捕获为技能。在要捕获的流程结束时调用，可附带可选描述）,
    allowedTools: [
      '读取',
      '写入',
      '编辑',
      'Glob',
      'Grep',
      '询问用户问题',
      'Bash(mkdir:*)',
    ],
    userInvocable: true,
    disableModelInvocation: true,
    argumentHint: '[要捕获的流程描述]',
    async getPromptForCommand(args, context) {
      const sessionMemory =
        (await getSessionMemoryContent()) ?? '无可用会话记）;
      const userMessages = extractUserMessages(
        getMessagesAfterCompactBoundary(context.messages),
      );

      const userDescriptionBlock = args
        ? `用户将此流程描述为："${args}"`
        : '';

      const prompt = SKILLIFY_PROMPT.replace('{{sessionMemory}}', sessionMemory)
        .replace('{{userMessages}}', userMessages.join('\n\n---\n\n'))
        .replace('{{userDescriptionBlock}}', userDescriptionBlock);

      return [{ type: 'text', text: prompt }];
    },
  });
}