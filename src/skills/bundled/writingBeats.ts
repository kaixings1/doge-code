import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# 写作节拍\n\n将文章塑造为一系列节拍的旅程，类似"选择你自己的冒险"风格。\n\n## 流程\n\n用户传递一个原始素材的 markdown 文件。\n\n1. 从原始素材中撰写 2-3 个候选**起始节拍**。每个是不同的入口点。在写入文章文件前向用户展示。用户选择一个。\n\n2. **仅写入那个节拍**到文章文件。一个节拍可以是一句话或几个段落。\n\n3. 从磁盘重新读取文章文件。提供 2-3 个候选**下一个节拍**——旅程可以转向的不同方向。\n\n4. 循环步骤 2-4，直到文章到达自然的结尾。\n\n如果用户没有说要保存到哪里，问一次并记住路径。'

export function registerWritingBeatsSkill(): void {
  registerBundledSkill({
    name: 'writing-beats',
    description: '将文章塑造为一系列节拍的旅程，类似"选择你自己的冒险"。逐节拍写作直到文章到达自然的结尾。',
    whenToUse: '当用户有原始素材并希望将其组装为叙事而非论点时。',
    argumentHint: '<path to raw material markdown file>',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}