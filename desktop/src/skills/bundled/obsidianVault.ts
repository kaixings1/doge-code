import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# Obsidian 知识库\n\n在 Obsidian 知识库中搜索、创建和管理笔记，支持 wikilinks 和索引笔记。\n\n## 约定\n- 所有笔记名称使用**标题大小写**\n- 不使用文件夹组织——使用 wikilinks 和索引笔记代替\n- **索引笔记**聚合相关主题（例如，"RAG Index.md"、"Skills Index.md"）\n\n## 查找笔记\n询问用户他们在寻找什么。搜索知识库中匹配的标题和内容。使用 wikilinks 展示结果。\n\n## 创建笔记\n创建笔记时，使用 [[wikilinks]] 将它们链接到相关的索引笔记和交叉链接到相关笔记。\n\n## 更新\n当用户要求更新或添加到笔记时，先读取当前内容，然后进行修改。保留现有的 wikilinks。\n\n## 组织\n如果一个主题增长超过单个笔记的范围，为其创建一个索引笔记并在此索引下重新组织相关笔记。\n\n如果未指定，询问用户知识库路径。默认搜索常见的 Obsidian 知识库位置。'

export function registerObsidianVaultSkill(): void {
  registerBundledSkill({
    name: 'obsidian-vault',
    description: '在 Obsidian 知识库中搜索、创建和管理笔记，支持 wikilinks 和索引笔记。',
    whenToUse: '当用户想要在 Obsidian 中查找、创建或组织笔记时。',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}