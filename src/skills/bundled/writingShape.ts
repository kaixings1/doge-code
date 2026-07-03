import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# 写作形状\n\n获取原始素材的 markdown 文件并通过对话会话将其塑造为文章。\n\n## 流程\n\n1. **阅读素材堆。** 完整读取输入文件。不要编辑它——它是只读的。\n\n2. **塑造开头。** 草拟 2-3 个候选开头。向用户展示，获取反馈，将选择的写入输出文件。\n\n3. **逐段生长。** 重新读取输出，然后提供接下来什么的选项：列表、表格、引用、引言、叙事部分。用户选择一个，你写入。\n\n4. **循环。** 继续直到文章感觉完整。\n\n5. **结尾。** 提供 2-3 个结尾选项。选择后，运行最终一致性重读。\n\n如果用户没有说要保存到哪里，问一次并记住路径。'

export function registerWritingShapeSkill(): void {
  registerBundledSkill({
    name: 'writing-shape',
    description: '获取原始素材并通过对话会话将其塑造为文章——开头、段落、格式决策。',
    whenToUse: '当用户有一堆笔记、碎片或粗略草稿，并希望帮助将其转变为可发布的内容时。',
    argumentHint: '<path to raw material markdown file>',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}