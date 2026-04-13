# Superpowers 技能循环修复

## 问题描述

当用户使用 superpowers 插件的 `brainstorming` 技能时，AI 陷入无限循环：

```
❯ 用 superpowers:brainstorming 思考开发一个雷电游戏
● 使用 superpowers:brainstorming 思考开发一个雷电游戏。
❯ 继续下一步
● 使用 superpowers:brainstorming 思考开发一个雷电游戏。  ← 重复！
```

## 根本原因

1. **`using-superpowers` 技能的强制规则**：
   - "IF YOU THINK THERE IS EVEN A 1% CHANCE A SKILL MIGHT APPLY, YOU ABSOLUTELY MUST INVOKE THE SKILL"
   - 这条规则覆盖了 SkillTool 本身的 "Do not invoke a skill that is already running" 指令

2. **`brainstorming` 技能的描述**：
   - "在进行任何创造性工作之前你必须使用此技能"
   - AI 每次响应时都重新判断"这是创造性工作"→ 调用 brainstorming → 循环

3. **缺少防循环机制**：
   - SkillTool 的 `validateInput` 没有检查技能是否已经被调用过
   - AI 可以无限次调用同一个技能

## 修复方案

### 修改 1: `src2/tools/SkillTool/SkillTool.ts`

**添加防循环检测逻辑**：

```typescript
// Anti-loop protection: check if this skill was already invoked recently
// in the current session. If so, reject the invocation to prevent infinite loops.
const invokedSkills = getInvokedSkillsForAgent(null) // null = main session
const skillKey = `:${normalizedCommandName}`
const alreadyInvoked = invokedSkills.has(skillKey)

if (alreadyInvoked) {
  return {
    result: false,
    message: `Skill "${normalizedCommandName}" is already loaded and active in this session. Do not invoke it again — follow the skill's instructions directly. If you find yourself repeating this invocation, you are in a loop. Stop and proceed with the skill's actual workflow.`,
    errorCode: 7,
  }
}
```

**工作原理**：
- 使用 `getInvokedSkillsForAgent(null)` 获取主会话中已调用的技能
- 如果技能已经在当前会话中调用过，拒绝再次调用
- 返回明确的错误消息，指导 AI 继续执行技能的工作流而不是重复调用

### 修改 2: `skills/using-superpowers/SKILL.md`（插件缓存目录）

**添加 Anti-Loop Protection 章节**：

在技能优先级和类型之间插入防循环保护规则：

```markdown
## Anti-Loop Protection

**CRITICAL: Do NOT invoke a skill that is already loaded and active in the current conversation.**

If you see a `<COMMAND_NAME_TAG>` tag in the conversation history for a skill (e.g., `<COMMAND_NAME>brainstorming</COMMAND_NAME>`), that skill is ALREADY loaded and its instructions are active. Do NOT call the Skill tool again for the same skill.

**Loop Detection Rules:**

1. **Check conversation history** — if the same skill was invoked in the last 2 turns, DO NOT invoke it again
2. **Check for active skill tags** — if `<COMMAND_NAME_TAG>` is present for a skill, it's already loaded
3. **If you catch yourself repeating** — if you notice your response would repeat a skill invocation announcement, STOP and instead follow the skill's actual instructions
```

## 测试方法

1. 启动 Claude Code
2. 调用 brainstorming 技能：
   ```
   ❯ 用 brainstorming 思考开发一个雷电游戏
   ```
3. 预期行为：
   - 第一次调用：Skill tool 加载 brainstorming 技能
   - AI 开始执行 brainstorming 流程（探索项目上下文、问澄清问题等）
   - 如果 AI 尝试再次调用 brainstorming，会被拒绝并收到错误消息

## 影响范围

- **正面影响**：防止所有技能的无限循环调用
- **潜在风险**：如果用户确实需要重新调用同一个技能（极少见），需要先 `/clear` 清空会话
- **向后兼容**：不影响现有技能的正常调用，只阻止重复调用

## 相关文件

- `src2/tools/SkillTool/SkillTool.ts` - 核心防循环逻辑
- `C:\Users\Administrator\.doge\plugins\cache\superpowers-marketplace\superpowers\5.0.7\skills\using-superpowers\SKILL.md` - 技能级防循环规则

## 长期建议

1. 向 superpowers 插件作者提交 Issue，建议上游合并这些防循环规则
2. 考虑在 SkillTool 的 prompt 中强化 "Do not invoke a skill that is already running" 的权重
3. 监控其他技能是否也有类似的循环问题
