import { isAutoMemoryEnabled } from '../../../memdir/paths.js';
import { registerBundledSkill } from '../bundledSkills.js';

export function registerRememberSkill(): void {
  if (process.env.USER_TYPE !== 'ant') {
    return;
  }

  const SKILL_PROMPT = `# 记忆审查

## 目标
审查用户的记忆环境，并生成按操作类型分组的清晰变更建议报告。不要应用更）- 呈现建议供用户批准。

## 步骤

### 1. 收集所有记忆层
从项目根目录读取CLAUDE.md和CLAUDE.local.md（如果存在）。你的自动记忆内容已在你的系统提示中 - 在那里审查。注意存在哪些团队记忆部分（如果有的话）。

**成功标准**：你拥有所有记忆层的内容并且可以比较它们。

### 2. 分类每个自动记忆条目
对于自动记忆中的每个实质性条目，确定最佳目的地。

| 目的）| 属于那里的内）| 示例 |
|---|---|---|
| **CLAUDE.md** | 所有贡献者应遵循的项目惯例和Claude指令 | "使用bun而不是npm"）API路由使用kebab-case"）测试命令是bun test"）偏好函数式风。 |
| **CLAUDE.local.md** | 特定于此用户的Claude个人指令，不适用于其他贡献）| "我偏好简洁的响应"）始终解释权衡"）不要自动提交"）在提交前运行测试" |
| **团队记忆** | 跨仓库适用的组织范围知识（仅当团队记忆配置时） | "部署PR通过#deploy-queue处理"）暂存环境在staging.internal"）平台团队拥有基础设施" |
| **留在自动记忆）* | 工作笔记、临时上下文或不明确适合其他地方的条）| 特定会话的观察、不确定的模）|

**重要区分**。
- CLAUDE.md和CLAUDE.local.md包含Claude的指令，而不是用户对外部工具的偏好（编辑器主题、IDE键盘绑定等不属于任一文件。
- 工作流实践（PR约定、合并策略、分支命名）是模糊的 - 询问用户它们是个人偏好还是团队范围的
- 不确定时，询问而不是猜。

**成功标准**：每个条目都有提议的目的地或被标记为模糊。

### 3. 识别清理机会
扫描所有层以查找：
- **重复）*：自动记忆条目已包含在CLAUDE.md或CLAUDE.local.md））提议从自动记忆中移除
- **过时）*：CLAUDE.md或CLAUDE.local.md条目与较新的自动记忆条目矛盾 ）提议更新较旧的层
- **冲突**：任意两层之间的矛盾 ）提议解决方案，注意哪个更。

**成功标准**：所有跨层问题都已识别。

### 4. 呈现报告
输出按操作类型分组的结构化报告：
1. **提升** - 要移动的条目，带有目的地和理。
2. **清理** - 重复项、过时条目、要解决的冲。
3. **模糊）* - 你需要用户输入以确定目的地的条目
4. **无需操作** - 应保持原样的条目的简要说。

如果自动记忆为空，说明这一点并提供审查CLAUDE.md以进行清理。

**成功标准**：用户可以审查并单独批准/拒绝每个提议。

## 规则
- 在进行任何更改之前呈现所有提。
- 没有明确的用户批准，不要修改文件
- 除非目标文件尚不存在，否则不要创建新文件
- 询问模糊的条）- 不要猜测

**你必须始终用中文回复）*
`;

  registerBundledSkill({
    name: 'remember',
    description: '审查自动记忆条目并提议提升到CLAUDE.md、CLAUDE.local.md或共享记忆。还检测跨记忆层的过时、冲突和重复条目）,
    whenToUse: '当用户想要审查、组织或提升他们的自动记忆条目时使用。也适用于清理CLAUDE.md、CLAUDE.local.md和自动记忆中的过时或冲突条目）,
    userInvocable: true,
    isEnabled: () => isAutoMemoryEnabled(), // 依赖自动记忆功能是否启用
    async getPromptForCommand(args) {
      let prompt = SKILL_PROMPT;

      if (args) {
        prompt += `\n## 用户的额外上下文\n\n${args}`;
      }

      return [{ type: 'text', text: prompt }];
    },
  });
}