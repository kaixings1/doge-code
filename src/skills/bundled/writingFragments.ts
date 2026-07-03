import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# 写作碎片\n\n采访会话从用户那里挖掘碎片——异构的写作碎片（主张、小品文、尖锐的句子、半思考）——并将它们追加到单个文档中作为未来文章的原始素材。\n\n## 流程\n\n运行一个产生碎片的采访会话。 relentless 采访用户关于他们想要写的任何内容。不强加阶段、大纲或结构。\n\n当碎片从对话的任何一边出现时，将它们追加到单个 markdown 文件中。在每次写入前重新读取文件，以保留用户编辑。\n\n从用户说的第一件事开始捕获碎片，包括初始提示。\n\n首次写入时，放置单个 H1 和一个工作标题，没有其他——无元数据、无目录、无日期。\n\n如果用户没有传递路径，问一次将文档保存在哪里。'

export function registerWritingFragmentsSkill(): void {
  registerBundledSkill({
    name: 'writing-fragments',
    description: '采访会话挖掘写作碎片——主张、小品文、半思考——追加到文档中作为未来文章的素材。',
    whenToUse: '当用户想要在强加结构之前发展想法，或提到碎片、构思或写作原始素材时。',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}