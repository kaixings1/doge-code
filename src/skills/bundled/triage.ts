import { registerBundledSkill } from '../bundledSkills.js'

const PROMPT = `# 问题分类 (Triage)

通过小型状态机推进问题分类角色，生成可供 Agent 处理的简报。

## 分类角色
- **bug** — 某处存在缺陷
- **enhancement** — 新功能或改进

## 状态角色
- **needs-triage** — 维护者需要评估
- **needs-info** — 等待报告者提供更多信息
- **ready-for-agent** — 完全指定，可供实现
- **ready-for-human** — 需要人类实现
- **wontfix** — 不会处理

## 分类流程

### 1. 收集上下文
阅读完整的问题（正文、评论、标签、作者、日期）。解析之前的分类笔记。
使用领域术语表探索代码库，尊重 ADR。

### 2. 验证声明
对于 bug：按照报告者步骤复现它。
对于 enhancement：通过领域概念搜索现有实现。
报告：已确认、失败或信息不足。

### 3. 推荐
告诉维护者分类和状态建议及理由。
如果可用，使用问题跟踪器应用标签。

### 4. 追问（如需）
如果需要进一步细化，运行 /grilling 逐个问题 sharpen 它。

### 5. 应用结果
- **ready-for-agent**：编写 Agent 简报
- **ready-for-human**：相同结构，注明为何不能委托
- **needs-info**：发布包含具体可操作问题的分类笔记
- **wontfix**：关闭并说明原因

## Agent 简报模板

\`\`\`
## Agent 简报

### 目标
Agent 需要完成什么。

### 上下文
相关的代码库信息（文件、模块、模式）。

### 验收标准
完成状态的检查清单。

### 不在范围内
Agent 不应该做什么。
\`\`\`

## 需要信息模板

\`\`\`
## 分类笔记

**我们目前已确认的：**
- 要点 1

**我们仍需要从您那里获得的：**
- 问题 1
\`\`\`
`

export function registerTriageSkill(): void {
  registerBundledSkill({
    name: 'triage',
    description: '通过状态机对问题进行分类和分级（bug/enhancement），生成可供 Agent 处理的简报。',
    whenToUse: '当用户希望对收到的 bug 报告、功能请求进行分类，或将积压工作整理为可操作项时。',
    userInvocable: true,
    disableModelInvocation: true,
    getPromptForCommand() {
      return [{ type: 'text', text: PROMPT }]
    },
  })
}