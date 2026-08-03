import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = '## 领域建模\n\n构建和精炼项目的领域模型。这是对术语提出挑战、发明边界情况场景、并在概念结晶时立即写下术语表和决策的活跃纪律。\n\n### 会话期间\n\n1. **对照术语表挑战** — 当用户使用与现有 CONTEXT.md 语言冲突的术语时，指出它。\n2. **精炼模糊语言** — 为模糊或过载的单词提议精确的标准术语。\n3. **讨论具体场景** — 用特定的边界情况来压力测试领域关系。\n4. **与代码交叉引用** — 检查代码是否与陈述的领域规则一致。\n5. **内联更新 CONTEXT.md** — 立即捕获已解决的术语，不分批。\n6. **谨慎提供 ADRs** — 仅在：(a) 难以逆转，(b) 无上下文令人惊讶，(c) 真实权衡的结果时。\n\n### 文件结构\n- 根目录或每个模块的 CONTEXT.md — 纯术语表，无实现细节\n- docs/adr/ — 架构决策记录\n\n### 何时创建文件\n- 当第一个术语被解决时创建 CONTEXT.md\n- 当第一个 ADR 需要时创建 docs/adr/\n- 惰性创建，只有当你有东西可写时'

export function registerDomainModelingSkill(): void {
  registerBundledSkill({
    name: 'domain-modeling',
    description: '构建和完善项目领域模型 — 跟踪通用语言、记录架构决策记录（ADR）、维护 CONTEXT.md。',
    whenToUse: '确定领域术语、构建术语表，或记录架构决策时。',
    userInvocable: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}