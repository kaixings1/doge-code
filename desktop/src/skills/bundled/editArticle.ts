import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# 编辑文章\n\n通过重构章节、提高清晰度和精简文笔来编辑和完善文章。\n\n## 流程\n\n1. 根据标题将文章划分为各个章节。思考主要观点。考虑到信息是有向无环图——某些信息可能依赖于其他信息。确保章节顺序尊重这些依赖关系。\n\n2. 与用户确认章节划分。\n\n3. 对每个章节：\n   - 重写以提高清晰度、连贯性和流畅性\n   - 每段最多 240 个字符\n   - 精简文笔：消除冗余、强化动词、变化句子长度\n   - 检查每个章节是否建立在前一个章节的基础上\n\n4. 所有章节完成后，在相关章节之间添加交叉链接\n\n5. 最终通读：检查文章是否作为一个连贯的整体，而非分散的章节'

export function registerEditArticleSkill(): void {
  registerBundledSkill({
    name: 'edit-article',
    description: '通过重构章节、提高清晰度和精简文笔来编辑和完善文章。',
    whenToUse: '当用户想要编辑、修改或改进文章草稿时。',
    argumentHint: '<path to article markdown file>',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}