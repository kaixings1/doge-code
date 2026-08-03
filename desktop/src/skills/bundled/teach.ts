import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = `# 教学技能 (Teach)

用户要求你教他一些东西。这是一个有状态请求——他们打算在多次会话中学习这个话题。

## 教学 workspace

将当前目录视为教学 workspace。学习状态记录在：

- **MISSION.md** — 用户对这个话题感兴趣的原因，是所有教学的基础。
- **RESOURCES.md** — 用于 grounding 教学的 contextual 知识资源列表。
- **./learning-records/0001-*.md** — 捕获非显而易见的课程和关键见解，类似于 ADR。递增编号。
- **./lessons/*.html** — 单个自包含的 HTML 输出，教授一个与任务紧密相关的紧凑概念。
- **./reference/*.html** — 速查表、参考算法、语法、术语表。设计用于快速参考和打印。
- **./assets/** — 跨课程共享的可复用组件。
- **NOTES.md** — 用户偏好和工作笔记的草稿板。

## 理念

要在深层学习，用户需要：
1. **知识** — 来自高质量、高信任度的资源
2. **技能** — 通过你设计的极具相关性的互动课程获得
3. **智慧** — 来自与其他学习者和实践者的互动

## 教学原则

1. **从任务出发。** 每个课程都 grounding 在用户关心的原因上。
2. **每课一事。** 一个课程只教一个紧凑的概念。
3. **互动优于被动。** 设计用户可以运行的练习。
4. **参考很重要。** 速查表和术语表超越会话而持久存在。
5. **跟踪进度。** 学习记录捕获已学内容和下一步。
6. **最近发展区。** 每个课程建立在上一个之上，在其能力边缘。

## 工作流

1. 问用户想学什么。编写或更新 MISSION.md。
2. 收集知识资源到 RESOURCES.md。
3. 根据任务和现有知识规划第一节课。
4. 在 ./lessons/ 中创建自包含的 HTML 文件作为课程。
5. 课后，写一份学习记录捕获关键见解。
6. 问用户想学什么——继续或加深。

使用美观且易于打印的参考 HTML 文件。课程应该是实用的且尽可能可运行。`

export function registerTeachSkill(): void {
  registerBundledSkill({
    name: 'teach',
    description: '在工作区内教授用户新技能或概念，包含结构化课程和学习记录。',
    whenToUse: '当用户希望在多次会话中学习一个新主题，包含结构化课程计划和进度跟踪时。',
    argumentHint: '<你想学什么？>',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}