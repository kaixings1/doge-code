import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '# 询问 Matt — 技能路由器\n\n你不记得每个技能，所以问。\n\n## 主流程：从想法到交付\n\n1. **/grill-with-docs** — 通过采访精炼想法（如果你有带 CONTEXT.md 的代码库）\n2. 分支：需要可运行的答案？/handoff 出去，/prototype，/handoff 回来\n3. 分支：多会话构建？/to-prd，/to-issues，然后 /implement 每个 issue\n4. 否则：/implement 就在这里\n\n## 入口\n- **Bug/请求堆积** → /triage → /implement\n\n## 代码库健康\n- **/improve-codebase-architecture** — 当你有空闲时间时\n\n## 跨会话\n- **/handoff** — 新会话，保留上下文\n- **/compact** — 留在同一会话，摘要\n\n## 独立\n- **/grill-me** — 与 /grill-with-docs 相同但没有代码库\n- **/teach** — 在多次会话中学习一个概念\n- **/codebase-design** — 深度模块设计的词汇\n- **/domain-modeling** — 构建和精炼领域模型\n- **/diagnosing-bugs** — 系统化调试循环\n- **/tdd** — 测试驱动开发\n- **/prototype** — 一次性代码来回答问题\n- **/writing-great-skills** — 编写技能的参考'

export function registerAskMattSkill(): void {
  registerBundledSkill({
    name: 'ask-matt',
    description: '根据你当前的情况询问该使用哪个技能。这是系统中所有可用技能的路由器。',
    whenToUse: '当你对当前任务该使用哪个技能不确定时。',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}