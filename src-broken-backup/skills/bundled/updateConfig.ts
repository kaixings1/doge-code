import { toJSONSchema } from 'zod/v4'
import { SettingsSchema } from '../../../utils/settings/types.js'
import { jsonStringify } from '../../../utils/slowOperations.js'
import { registerBundledSkill } from '../bundledSkills.js'

/**
 * 从设）Zod 模式生成 JSON Schema。
 * 这样可以使技能提示与实际类型保持同步。
 */
function generateSettingsSchema(): string {
  try {
    // 使用 unrepresentable: 'any' 来处理模式中）.catch(undefined)
    // 这无法在 JSON Schema 中表。
    const jsonSchema = toJSONSchema(SettingsSchema(), {
      io: 'input',
      unrepresentable: 'any',
    })
    return jsonStringify(jsonSchema, null, 2)
  } catch (error) {
    // 如果模式生成失败，返回一个最小有效模。
    return jsonStringify(
      {
        type: 'object',
        properties: {},
        additionalProperties: true,
      },
      null,
      2,
    )
  }
}

const SETTINGS_EXAMPLES_DOCS = `## 设置文件位置

根据作用域选择合适的文件。

| 文件 | 作用）| Git | 用）|
|------|-------|-----|---------|
| \`~/.claude/settings.json\` | 全局 | N/A | 所有项目的个人偏好设置 |
| \`.claude/settings.json\` | 项目 | 提交 | 团队范围的钩子、权限、插）|
| \`.claude/settings.local.json\` | 项目 | Git忽略 | 此项目的个人覆盖配置 |

设置按以下顺序加载：用户 ）项目 ）本地（后者覆盖前者）。

## 设置模式参。

### 权限
\`\`\`json
{
  "permissions": {
    "allow": ["Bash(npm:*)", "Edit(.claude)", "Read"],
    "deny": ["Bash(rm -rf:*)"],
    "ask": ["Write(/etc/*)"],
    "defaultMode": "default" | "plan" | "acceptEdits" | "dontAsk",
    "additionalDirectories": ["/extra/dir"]
  }
}
\`\`\`

**权限规则语法）*
- 精确匹配：\`"Bash(npm run test)"\`
- 前缀通配符：\`"Bash(git:*)"\` - 匹配 \`git status\`、\`git commit\` 。
- 仅工具：\`"Read"\` - 允许所）Read 操作

### 环境变量
\`\`\`json
{
  "env": {
    "DEBUG": "true",
    "MY_API_KEY": "value"
  }
}
\`\`\`

### 模型与代。
\`\`\`json
{
  "model": "sonnet",  // ）"opus"）haiku"、完整模）ID
  "agent": "agent-name",
  "alwaysThinkingEnabled": true
}
\`\`\`

### 归属信息（提交与 PR。
\`\`\`json
{
  "attribution": {
    "commit": "自定义提交尾部文）,
    "pr": "自定）PR 描述文本"
  }
}
\`\`\`
）\`commit\` ）\`pr\` 设置为空字符）\`""\` 可隐藏对应的归属信息。

### MCP 服务器管。
\`\`\`json
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["server1", "server2"],
  "disabledMcpjsonServers": ["blocked-server"]
}
\`\`\`

### 插件
\`\`\`json
{
  "enabledPlugins": {
    "formatter@anthropic-tools": true
  }
}
\`\`\`
插件语法：\`plugin-name@source\`，其）source ）\`claude-code-marketplace\`、\`claude-plugins-official\` ）\`builtin\`。

### 其他设置
- \`language\`：首选响应语言（例）"japanese"。
- \`cleanupPeriodDays\`：保留转录的天数（默认：30；设置为 0 完全禁用持久化）
- \`respectGitignore\`：是否尊）.gitignore（默认：true。
- \`spinnerTipsEnabled\`：在旋转指示器中显示提示
- \`spinnerVerbs\`：自定义旋转指示器动词（\`{ "mode": "append" | "replace", "verbs": [...] }\`。
- \`spinnerTipsOverride\`：覆盖旋转指示器提示（\`{ "excludeDefault": true, "tips": ["Custom tip"] }\`。
- \`syntaxHighlightingDisabled\`：禁用差异高。
`

// 注意：我们保留常见模式的手写示例，因为它们比自动生成的模式文。
// 更具可操作性。生成的模式列表提供完整性，而示例提供清晰性。

const HOOKS_DOCS = `## 钩子配置

钩子）Claude Code 生命周期的特定点运行命令。

### 钩子结构
\`\`\`json
{
  "hooks": {
    "EVENT_NAME": [
      {
        "matcher": "ToolName|OtherTool",
        "hooks": [
          {
            "type": "command",
            "command": "your-command-here",
            "timeout": 60,
            "statusMessage": "Running..."
          }
        ]
      }
    ]
  }
}
\`\`\`

### 钩子事件

| 事件 | 匹配）| 用）|
|-------|---------|---------|
| PermissionRequest | 工具名称 | 在权限提示前运行 |
| PreToolUse | 工具名称 | 在工具运行前运行，可阻止执行 |
| PostToolUse | 工具名称 | 在工具成功后运行 |
| PostToolUseFailure | 工具名称 | 在工具失败后运行 |
| Notification | 通知类型 | 在通知时运）|
| Stop | - | ）Claude 停止时运行（包括 clear、resume、compact）|
| PreCompact | "manual"/"auto" | 在压缩前运行 |
| PostCompact | "manual"/"auto" | 在压缩后运行（接收摘要） |
| UserPromptSubmit | - | 当用户提交时运行 |
| SessionStart | - | 当会话开始时运行 |

**常用工具匹配器：** \`Bash\`、\`Write\`、\`Edit\`、\`Read\`、\`Glob\`、\`Grep\`

### 钩子类型

**1. 命令钩子** - 运行 shell 命令。
\`\`\`json
{ "type": "command", "command": "prettier --write $FILE", "timeout": 30 }
\`\`\`

**2. 提示词钩）* - 使用 LLM 评估条件。
\`\`\`json
{ "type": "prompt", "prompt": "Is this safe? $ARGUMENTS" }
\`\`\`
仅适用于工具事件：PreToolUse、PostToolUse、PermissionRequest。

**3. 代理钩子** - 运行带工具的代理。
\`\`\`json
{ "type": "agent", "prompt": "Verify tests pass: $ARGUMENTS" }
\`\`\`
仅适用于工具事件：PreToolUse、PostToolUse、PermissionRequest。

### 钩子输入（stdin JSON。
\`\`\`json
{
  "session_id": "abc123",
  "tool_name": "Write",
  "tool_input": { "file_path": "/path/to/file.txt", "content": "..." },
  "tool_response": { "success": true }  // ）PostToolUse
}
\`\`\`

### 钩子 JSON 输出

钩子可以返回 JSON 来控制行为：

\`\`\`json
{
  "systemMessage": "向用户显示的警告信息",
  "continue": false,
  "stopReason": "阻止执行时显示的消息",
  "suppressOutput": false,
  "decision": "block",
  "reason": "决策说明",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "注入回模型的上下。
  }
}
\`\`\`

**字段说明）*
- \`systemMessage\` - 向用户显示消息（所有钩子）
- \`continue\` - 设置）\`false\` 以阻）停止（默认：true。
- \`stopReason\` - ）\`continue\` ）false 时显示的消息
- \`suppressOutput\` - 隐藏 stdout 不记录到转录（默认：false。
- \`decision\` - 用于 PostToolUse/Stop/UserPromptSubmit 钩子）"block"（PreToolUse 已弃用，改用 hookSpecificOutput.permissionDecision。
- \`reason\` - 决策说明
- \`hookSpecificOutput\` - 事件特定的输出（必须包含 \`hookEventName\`）：
  - \`additionalContext\` - 注入到模型上下文的文。
  - \`permissionDecision\` - "allow"）deny" ）"ask"（仅 PreToolUse。
  - \`permissionDecisionReason\` - 权限决策的原因（）PreToolUse。
  - \`updatedInput\` - 修改后的工具输入（仅 PreToolUse。

### 常用模式

**写入后自动格式化）*
\`\`\`json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_response.filePath // .tool_input.file_path' | { read -r f; prettier --write \\"$f\\"; } 2>/dev/null || true"
      }]
    }]
  }
}
\`\`\`

**记录所）bash 命令）*
\`\`\`json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_input.command' >> ~/.claude/bash-log.txt"
      }]
    }]
  }
}
\`\`\`

**停止钩子 - 向用户显示消息：**

命令必须输出包含 \`systemMessage\` 字段）JSON。
\`\`\`bash
# 示例命令，输出：{"systemMessage": "Session complete!"}
echo '{"systemMessage": "Session complete!"}'
\`\`\`

**代码更改后运行测试：**
\`\`\`json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_input.file_path // .tool_response.filePath' | grep -E '\\\\.(ts|js)$' && npm test || true"
      }]
    }]
  }
}
\`\`\`
`

const HOOK_VERIFICATION_FLOW = `## 构建钩子（含验证。

给定一个事件、匹配器、目标文件和期望的行为，按照以下流程操作。每一步都捕获一类不同的失败情况——一个什么都不做的钩子比没有钩子更糟。

1. **去重检查）* 读取目标文件。如果同一事件+匹配器上已存在钩子，显示现有命令并询问：保留它、替换它，还是并排添加。

2. **为当前项目构建命令——不要假设）* 钩子通过 stdin 接收 JSON。构建一个命令：
   - 安全地提取所需的负载——使）\`jq -r\` 配合带引号的变量）\`{ read -r f; ... "$f"; }\`，不要用不带引号）\`| xargs\`（会在空格处拆分。
   - 按照此项目的运行方式调用底层工具（npx/bunx/yarn/pnpm？Makefile 目标？全局安装的？。
   - 跳过工具不处理的输入（格式化器通常）\`--ignore-unknown\`；如果没有，按扩展名守卫。
   - 暂时保持原始状态——不）\`|| true\`，不抑制 stderr。管道测试通过后再包装。

3. **管道测试原始命令）* 综合钩子将接收的 stdin 负载并直接管道传输：
   - \`Pre|PostToolUse\` ）\`Write|Edit\` 上：\`echo '{"tool_name":"Edit","tool_input":{"file_path":"<此仓库中的真实文）"}}' | <cmd>\`
   - \`Pre|PostToolUse\` ）\`Bash\` 上：\`echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | <cmd>\`
   - \`Stop\`/\`UserPromptSubmit\`/\`SessionStart\`：大多数命令不读）stdin，所）\`echo '{}' | <cmd>\` 即可

   检查退出代）AND 副作用（文件确实被格式化、测试确实运行了）。如果失败你会得到真实的错误——修复（包管理器不对？工具未安装？jq 路径错误？）然后重新测试。成功后，用 \`2>/dev/null || true\` 包装（除非用户需要阻止检查）。

4. **写入 JSON）* 合并到目标文件中（模式形状见上方）钩子结构"部分）。如果这是首次创）\`.claude/settings.local.json\`，将其添加到 .gitignore——Write 工具不会自动将其加入 gitignore。

5. **一次性验证语）+ 模式）*

   \`jq -e '.hooks.<event>[] | select(.matcher == "<matcher>") | .hooks[] | select(.type == "command") | .command' <target-file>\`

   退）0 + 打印你的命令 = 正确。退）4 = 匹配器不匹配。退）5 = JSON 格式错误或嵌套不正确。损坏的 settings.json 会静默禁用该文件的所有设置——同时也要修复任何预先存在的格式问题。

6. **证明钩子触发**——仅适用于你可在本轮触发的匹配器上的 \`Pre|PostToolUse\`（\`Write|Edit\` 通过 Edit，\`Bash\` 通过 Bash）。\`Stop\`/\`UserPromptSubmit\`/\`SessionStart\` 在本轮之外触发——跳到第 7 步。

   对于 \`PostToolUse\`/\`Write|Edit\` 上的**格式化器**：通过 Edit 引入可检测的违规（两个连续空行、错误的缩进、缺少分号——此格式化器能修正的内容；不要用尾随空格，Edit 在写入前会剥离它），重新读取，确认钩）*修复**了它。对）*其他任何情况**：在 settings.json 中临时在命令前加 \`echo "$(date) hook fired" >> /tmp/claude-hook-check.txt; \`，触发匹配的工具（\`Write|Edit\` ）Edit，\`Bash\` 用无害的 \`true\`），读取哨兵文件。

   **始终清理**——无论证明成功还是失败——还原违规，剥离哨兵前缀。

   **如果证明失败但管道测试通过）\`jq -e\` 通过**：设置监视器没有监视 \`.claude/\`——它只监视此会话启动时已有设置文件的目录。钩子已正确写入。告诉用户打开 \`/hooks\` 一次（重新加载配置）或重启——你无法自己做到这一点；\`/hooks\` 是用）UI 菜单，打开它会结束本轮。

7. **交接）* 告诉用户钩子已生效（或根据监视器注意事项需）\`/hooks\`/重启）。指引他们使）\`/hooks\` 查看、编辑或稍后禁用。UI 仅在钩子出错或过慢时显示"运行）N 个钩）——静默成功在设计上是不可见的。
`

const UPDATE_CONFIG_PROMPT = `# 更新配置技。

通过更新 settings.json 文件来修）Claude Code 配置。

## 何时需要钩子（而非记忆。

如果用户希望在响应某个事件时自动执行某些操作，他们需要在 settings.json 中配）*钩子**。记）偏好设置无法触发自动化操作。

**这些情况需要钩子：**
- "压缩前，询问我保留什。 ）PreCompact 钩子
- "写入文件后，运行 prettier" ）PostToolUse 钩子，匹配器）Write|Edit
- "当我运行 bash 命令时，记录日志" ）PreToolUse 钩子，匹配器）Bash
- "代码更改后始终运行测。 ）PostToolUse 钩子

**钩子事件）* PreToolUse、PostToolUse、PreCompact、PostCompact、Stop、Notification、SessionStart

## 关键：先读后。

**在修改之前，始终读取现有）settings 文件）* 将新设置与现有设置合并——绝不要替换整个文件。

## 关键：使）AskUserQuestion 处理模糊请求

当用户请求存在歧义时，使）AskUserQuestion 进行澄清。
- 修改哪个设置文件（用）项目/本地。
- 是添加到现有数组还是替换它们
- 当存在多个选项时的具体。

## 决策：使）Config 工具还是直接编辑

**使用 Config 工具**处理这些简单设置：
- \`theme\`、\`editorMode\`、\`verbose\`、\`model\`
- \`language\`、\`alwaysThinkingEnabled\`
- \`permissions.defaultMode\`

**直接编辑 settings.json** 处理。
- 钩子（PreToolUse、PostToolUse 等）
- 复杂权限规则（allow/deny 数组。
- 环境变量
- MCP 服务器配。
- 插件配置

## 工作。

1. **明确意图** - 如果请求不明确，先询。
2. **读取现有文件** - 对目标设置文件使）Read 工具
3. **谨慎合并** - 保留现有设置，尤其是数组
4. **编辑文件** - 使用 Edit 工具（如果文件不存在，先让用户创建）
5. **确认** - 告诉用户更改了什。

## 合并数组（重要！。

在向权限数组或钩子数组添加内容时）*与现有内容合）*，不要替换：

**错误**（替换了现有权限）：
\`\`\`json
{ "permissions": { "allow": ["Bash(npm:*)"] } }
\`\`\`

**正确**（保留现）+ 添加新内容）。
\`\`\`json
{
  "permissions": {
    "allow": [
      "Bash(git:*)",      // 现有
      "Edit(.claude)",    // 现有
      "Bash(npm:*)"       // 新增
    ]
  }
}
\`\`\`

${SETTINGS_EXAMPLES_DOCS}

${HOOKS_DOCS}

${HOOK_VERIFICATION_FLOW}

## 工作流示。

### 添加钩子

用户））Claude 写入文件后格式化代码"

1. **明确**：使用哪个格式化器？（prettier、gofmt 等）
2. **读取**：\`.claude/settings.json\`（如果不存在则创建）
3. **合并**：添加到现有钩子，不要替。
4. **结果**。
\`\`\`json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_response.filePath // .tool_input.file_path' | { read -r f; prettier --write \\"$f\\"; } 2>/dev/null || true"
      }]
    }]
  }
}
\`\`\`

### 添加权限

用户）允许 npm 命令无需提示"

1. **读取**：现有权。
2. **合并**：将 \`Bash(npm:*)\` 添加）allow 数组
3. **结果**：与现有 allow 合并

### 环境变量

用户）设置 DEBUG=true"

1. **决策**：用户设置（全局）还是项目设置？
2. **读取**：目标文。
3. **合并**：添加到 env 对象
\`\`\`json
{ "env": { "DEBUG": "true" } }
\`\`\`

## 常见错误

1. **替换而非合并** - 始终保留现有设置
2. **错误的文）* - 如果作用域不明确，询问用。
3. **无效）JSON** - 更改后验证语。
4. **忘记先读）* - 始终先读后写

## 钩子故障排除

如果钩子没有运行。
1. **检查设置文）* - 读取 ~/.claude/settings.json ）.claude/settings.json
2. **验证 JSON 语法** - 无效）JSON 会静默失。
3. **检查匹配器** - 它是否匹配工具名称？（例）"Bash"）Write"）Edit"。
4. **检查钩子类）* - ）"command"）prompt" 还是 "agent"。
5. **测试命令** - 手动运行钩子命令看是否有。
6. **使用 --debug** - 运行 \`claude --debug\` 查看钩子执行日志

**你必须始终用中文回复）*
`

export function registerUpdateConfigSkill(): void {
  registerBundledSkill({
    name: 'update-config',
    description:
      '使用此技能通过 settings.json 配置 Claude Code  harness。自动化行为）从现在开始当 X"）每次 X"）每当 X"）X 之前/之后"）需要在 settings.json 中配）hooks - ）harness 执行这些 hooks，而不）Claude，因此记）偏好设置无法满足。还用于：权限（"允许 X"）添加权限"）将权限移动到"）、环境变量（"设置 X=Y"）、hook 故障排除，或）settings.json/settings.local.json 文件的任何更改。示例："允许 npm 命令"）向全局设置添加 bq 权限"）将权限移动到用户设置"）设置 DEBUG=true"））claude 停止时显）X"。对于主）模型等简单设置，请使）Config 工具）,
    allowedTools: ['Read'],
    userInvocable: true,
    async getPromptForCommand(args) {
      if (args.startsWith('[hooks-only]')) {
        const req = args.slice('[hooks-only]'.length).trim()
        let prompt = HOOKS_DOCS + '\n\n' + HOOK_VERIFICATION_FLOW
        if (req) {
          prompt += `\n\n## Task\n\n${req}`
        }
        return [{ type: 'text', text: prompt }]
      }

      // Generate schema dynamically to stay in sync with types
      const jsonSchema = generateSettingsSchema()

      let prompt = UPDATE_CONFIG_PROMPT
      prompt += `\n\n## Full Settings JSON Schema\n\n\`\`\`json\n${jsonSchema}\n\`\`\``

      if (args) {
        prompt += `\n\n## User Request\n\n${args}`
      }

      return [{ type: 'text', text: prompt }]
    },
  })
}
