import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '⚠️ 注意: # 改进代码库架构\n\n揭示架构摩擦并提出深化机会——将浅层模块转为深度的重构。\n\n## 流程\n\n### 1. 探索\n首先阅读 CONTEXT.md 和 ADRs。使用 Explore 子代理遍历代码库。注意以下情况：\n- 理解一个概念需要在许多小模块之间来回切换\n- 模块是浅层的（接口复杂度等于实现复杂度）\n- 仅为可测试性提取的纯函数，但真正的 bug 隐藏在调用模式中\n- 紧密耦合的模块跨越接缝泄漏\n- 代码未测试或通过当前接口难以测试\n\n应用删除测试：删除它会集中复杂度还是只是转移它？\n\n### 2. 以 HTML 报告呈现候选项\n将自包含的 HTML 文件写入 OS 临时目录。对每个候选项包括：\n- 涉及的文件\n- 问题描述\n- 英语中的解决方案\n- 局部性和杠杆率的收益\n- 前后 diagram（并排，可视化）\n- 推荐强度：强烈 / 值得探索 / 推测性\n\n使用 CDN 上的 Mermaid 进行关系图。使用 CONTEXT.md 术语表中的领域术语。\n\n以 Top recommendation 部分结束。\n\n### 3. Grilling 循环\n用户选择一个候选项后，运行 /grilling 以遍历设计树。\n\n## 架构词汇\n使用 /codebase-design 术语：模块、接口、深度、接缝、适配器、杠杆率、局部性。'

export function registerImproveCodebaseArchitectureSkill(): void {
  registerBundledSkill({
    name: 'improve-codebase-architecture',
    description: '扫描代码库以发现深化机会，展示可视化 HTML 报告，然后盘问候选方案。',
    whenToUse: '当你想要改进代码库可测试性、AI 可导航性，或查找架构摩擦点时。',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}