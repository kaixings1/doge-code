import { isAutoMemoryEnabled } from '../../memdir/paths.js'
import { registerBundledSkill } from '../bundledSkills.js'

export function registerRememberSkill(): void {
  if (process.env.USER_TYPE !== 'ant') {
    return
  }

  const SKILL_PROMPT = `# 记忆审查

## 目标

审查用户的记忆景观，生成按行动类型分组的明确变更提案报告。不要应用变更——呈现供用户批准的提案。

## 步骤

### 1. 收集所有记忆层
从项目根目录读取 CLAUDE.md 和 CLAUDE.local.md（如果存在）。你的自动记忆内容已在系统提示中——在那里审查它。注意存在哪些团队记忆部分（如果有）。

**成功标准**：你拥有所有记忆层的内容并能进行比较。

### 2. 分类每个自动记忆条目

对于自动记忆中的每个实质性条目，确定最佳目的地：

| 目的地 | 适合的内容 | 示例 |
|---|---|---|
| **CLAUDE.md** | 所有贡献者应遵循的 Claude 项目和指令 | "使用 bun 而非 npm"、"API 路由使用短横线命名"、"测试命令是 bun test"、"偏好函数式风格" |
| **CLAUDE.local.md** | 特定于用户的个人 Claude 指令，不适用于其他贡献者 | "我偏好简洁回复"、"总是解释权衡"、"不要自动提交"、"提交前运行测试" |
| **团队记忆** | 跨仓库适用的组织级知识（仅在配置了团队记忆时） | "部署 PR 通过 #deploy-queue"、"staging 在 staging.internal"、"平台团队拥有基础设施" |
| **留在自动记忆中** | 工作笔记、临时上下文或不清楚适合其他地方的条目 | 会话特定的观察、不确定的模式 |

**重要区别：**
- CLAUDE.md 和 CLAUDE.local.md 包含 Claude 的指令，而非外部工具的用户偏好（编辑器主题、IDE 快捷键等不属于其中）
- 工作流实践（PR 约定、合并策略、分支命名）是模糊的——询问用户是个人还是团队范围
- 不确定时，询问而非猜测

**成功标准**：每个条目都有提议的目的地或被标记为模糊。

### 3. 识别清理机会

扫描所有层以查找：
- **重复项**：自动记忆条目已捕获在 CLAUDE.md 或 CLAUDE.local.md 中 → 提议从自动记忆中移除
- **过时**：CLAUDE.md 或 CLAUDE.local.md 条目被更新的自动记忆条目矛盾 → 提议更新较旧的层
- **冲突**：任何两层之间的矛盾 → 提议解决，注明哪个更新

**成功标准**：识别所有跨层问题。

### 4. 呈现报告

输出按行动类型分组的结构化报告：
1. **提升** — 要移动的条目，含目的地和理由
2. **清理** — 重复项、过时条目、待解决的冲突
3. **模糊** — 需要你输入目的地的条目
4. **无需操作** — 应保留不动的条目的简要说明

如果自动记忆为空，说明情况并提供审查 CLAUDE.md 以进行清理。

**成功标准**：用户可以单独审查和批准/拒绝每个提案。

## 规则
- 在做出任何变更之前呈现所有提案
- 未经用户明确批准不要修改文件
- 除非目标尚不存在，否则不要创建新文件
- 询问模糊条目——不要猜测
`

  registerBundledSkill({
    name: 'remember',
    description:
      '审查自动记忆条目，提议将其提升到 CLAUDE.md、CLAUDE.local.md 或共享记忆中。同时检测记忆层之间的过期、冲突和重复条目。',
    whenToUse:
      '当用户想要审查、整理或提升自动记忆条目时使用。也适用于清理 CLAUDE.md、CLAUDE.local.md 和自动记忆中的过期或冲突条目。',
    userInvocable: true,
    isEnabled: () => isAutoMemoryEnabled(),
    async getPromptForCommand(args) {
      let prompt = SKILL_PROMPT

      if (args) {
        prompt += `\n## 用户提供的额外上下文\n\n${args}`
      }

      return [{ type: 'text', text: prompt }]
    },
  })
}
