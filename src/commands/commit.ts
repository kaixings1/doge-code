import type { Command } from '../commands.js'
import { getAttributionTexts } from '../utils/attribution.js'
import { executeShellCommandsInPrompt } from '../utils/promptShellExecution.js'
import { getUndercoverInstructions, isUndercover } from '../utils/undercover.js'

const ALLOWED_TOOLS = [
  'Bash(git add:*)',
  'Bash(git status:*)',
  'Bash(git commit:*)',
]

function getPromptContent(): string {
  const { commit: commitAttribution } = getAttributionTexts()

  let prefix = ''
  if (process.env.USER_TYPE === 'ant' && isUndercover()) {
    prefix = getUndercoverInstructions() + '\n'
  }

  return `${prefix}## Context

- 当前 git 状态: !\`git status\`
- 当前 git diff（已暂存和未暂存的更改）: !\`git diff HEAD\`
- 当前分支: !\`git branch --show-current\`
- 最近的提交: !\`git log --oneline -10\`

## Git 安全协议

- 绝不更新 git 配置
- 绝不跳过钩子（--no-verify、--no-gpg-sign 等），除非用户明确要求
- 关键：始终创建新的提交。绝不使用 git commit --amend，除非用户明确要求
- 不要提交可能包含秘密的文件（.env、credentials.json 等）。如果用户特别要求提交这些文件，则警告用户
- 如果没有要提交的更改（即没有未跟踪的文件和没有修改），不要创建空提交
- 绝不使用带 -i 标志的 git 命令（如 git rebase -i 或 git add -i），因为它们需要交互式输入，而这是不支持的

## 你的任务

基于上述更改，创建单个 git 提交。必须按顺序执行以下**标准操作流程（修改 → 检查 → 编译 → 运行 → 提交）**：

### 第 1 步：确认修改已完成
- 确保所有需要的代码修改已经写入磁盘
- 如有需要，补充修改不完整的地方

### 第 2 步：语法检查
- 运行项目对应的语法/静态检查工具：
  * **C/C++**：\`cppcheck --enable=warning,performance . 2>&1\` 或 \`clang-tidy *.cpp -- 2>&1\`
  * **Rust**：\`cargo check 2>&1\`
  * **Go**：\`go vet ./... 2>&1\`
  * **Python**：\`python -m py_compile \$(git diff --name-only -- '*.py') 2>&1\`
  * **TypeScript**：\`bun run tsc --noEmit --skipLibCheck 2>&1\`
  * **Java**：\`mvn checkstyle:check -q 2>&1\` 或 \`./gradlew check 2>&1\`
  * **其他**：运行对应的 lint 工具
- 失败则修复，直到通过

### 第 3 步：编译/构建
- 运行项目对应的编译命令：
  * **C/C++**：\`cmake --build build 2>&1\` 或 \`make 2>&1\` 或 \`g++ -Wall -o /dev/null -fsyntax-only *.cpp 2>&1\`
  * **Rust**：\`cargo build 2>&1\`
  * **Go**：\`go build ./... 2>&1\`
  * **TypeScript/Node**：\`bun run build 2>&1\` 或 \`npm run build 2>&1\`
  * **Java**：\`mvn compile -q 2>&1\` 或 \`./gradlew compileJava 2>&1\`
  * **其他**：运行对应的编译命令
- 失败则修复，直到通过

### 第 4 步：运行测试
- 运行项目对应的测试命令：\`bun run test 2>&1\`、\`npm test 2>&1\`、\`cargo test 2>&1\`、\`go test ./...\`、\`pytest 2>&1\` 等
- 如果测试耗时超过 30 秒或需要特殊环境，可跳过此步
- 如果项目没有测试框架，跳过此步

### 第 5 步：提交代码
- 上述 2-4 步全部通过后，执行 git 提交流程：

1. 分析所有已暂存的更改并起草高质量的提交消息：
   - 查看最近上面的提交，以遵循此仓库的提交消息风格
   - 严格遵循 Conventional Commits 格式：
     \`<类型>: <简短描述>\`
   - 类型必须是以下之一：\`feat\`（新功能）、\`fix\`（修复）、\`refactor\`（重构）、\`perf\`（性能）、\`docs\`（文档）、\`test\`（测试）、\`chore\`（杂项）、\`style\`（样式）、\`ci\`（CI/CD）
   - 总结更改的性质，确保消息准确反映更改及其目的
   - 简短描述控制在 50-70 字符以内
   - 对于**复杂变更**（涉及多个文件或跨模块改动），**必须**在标题后空一行，然后写明详细说明（改了哪些文件、改了什么、为什么改）
   - 对于简单变更（1-2 个文件），可以只用一行标题

2. 暂存相关文件并使用 HEREDOC 语法创建提交：
\`\`\`
git commit -m "$(cat <<'EOF'
提交消息在这里。${commitAttribution ? `\n\n${commitAttribution}` : ''}
EOF
)"
\`\`\`

你具有在单个响应中调用多个工具的能力。在一条消息中暂存文件并创建提交。不要使用任何其他工具或做任何其他事情。除了这些工具调用外，不要发送任何其他文本或消息。`
}

const command = {
  type: 'prompt',
  name: 'commit',
  description: '创建 git 提交',
  allowedTools: ALLOWED_TOOLS,
  contentLength: 0, // Dynamic content
  progressMessage: '正在创建提交',
  source: 'builtin',
  async getPromptForCommand(_args, context) {
    const promptContent = getPromptContent()
    const finalContent = await executeShellCommandsInPrompt(
      promptContent,
      {
        ...context,
        getAppState() {
          const appState = context.getAppState()
          return {
            ...appState,
            toolPermissionContext: {
              ...appState.toolPermissionContext,
              alwaysAllowRules: {
                ...appState.toolPermissionContext.alwaysAllowRules,
                command: ALLOWED_TOOLS,
              },
            },
          }
        },
      },
      '/commit',
    )

    return [{ type: 'text', text: finalContent }]
  },
} satisfies Command

export default command
