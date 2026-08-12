import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '❌ 错误: # 原型设计\n\n构建可丢弃的原型来充实设计。原型代码回答问题，然后被删除。\n\n## 选择分支\n\n- **逻辑/状态问题** — 构建一个微小的交互式终端应用，通过边界情况推送状态机。\n- **UI 问题** — 在单个路由上生成几种截然不同的 UI 变体，通过 URL 参数切换。\n\n## 规则\n\n1. **从一开始就是一次的。** 清晰地将文件命名为原型，而非生产代码。\n2. **一个命令运行。** 使用项目现有的任务运行器。\n3. **默认不持久化。** 状态驻留在内存中。\n4. **跳过抛光。** 无测试，除可运行外无错误处理。\n5. **暴露状态。** 每次操作或变体切换后，显示所有相关状态。\n6. **完成后删除或吸收。** 将发现融入真实代码，不要让原型腐烂。\n\n## 逻辑原型\n- 在编写代码前明确陈述问题\n- 使用宿主项目的语言和工具\n- 将逻辑隔离到可移植的纯模块（TUI 是一次性的，逻辑模块不是）\n- 让用户按下按钮并观察状态变化\n\n## UI 原型\n- 优先修改现有页面并使用 ?variant= 参数，而非独立路由\n- 如果不行，在现有路由约定下创建临时路由变体\n- 生成 3-5 种截然不同的视觉方法\n- 包括显示所有可用变体的浮动底部栏\n\n## 完成后\n捕获答案（提交消息、ADRs 或 NOTES.md）连同它所回答的问题，然后删除原型代码。'

export function registerPrototypeSkill(): void {
  registerBundledSkill({
    name: 'prototype',
    description: '构建可丢弃的原型来验证设计 — 逻辑问题用终端应用，设计问题用 UI 变体。',
    whenToUse: '当需要通过可运行代码探索设计决策，然后再承诺实现时。',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}