import { feature } from 'bun:bundle'
import { prependBullets } from '../../constants/prompts.js'
import { getAttributionTexts } from '../../utils/attribution.js'
import { hasEmbeddedSearchTools } from '../../utils/embeddedTools.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { shouldIncludeGitInstructions } from '../../utils/gitSettings.js'
import { getClaudeTempDir } from '../../utils/permissions/filesystem.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs,
} from '../../utils/timeouts.js'
import {
  getUndercoverInstructions,
  isUndercover,
} from '../../utils/undercover.js'
import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'
import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../GrepTool/prompt.js'
import { TodoWriteTool } from '../TodoWriteTool/TodoWriteTool.js'
import { BASH_TOOL_NAME } from './toolName.js'

export function getDefaultTimeoutMs(): number {
  return getDefaultBashTimeoutMs()
}

export function getMaxTimeoutMs(): number {
  return getMaxBashTimeoutMs()
}

function getBackgroundUsageNote(): string | null {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
    return null
  }
  return "您可以使用 `run_in_background` 参数在后台运行命令。仅在您不需要立即获取结果且接受稍后收到命令完成通知时使用。您无需立刻检查输出——当命令完成时您会收到通知。使用此参数时，您无需在命令末尾添加 '&'。"
}

function getCommitAndPRInstructions(): string {
  // 纵深防御：即使用户已完全禁用 git 指令，卧底指令也必须保留。
  // 归因剥离和模型 ID 隐藏是机械操作，无论如何都会生效，但明确的“不要暴露身份”指令是防止模型在提交消息中主动透露内部代号的最后一道防线。
  const undercoverSection =
    process.env.USER_TYPE === 'ant' && isUndercover()
      ? getUndercoverInstructions() + '\n'
      : ''

  if (!shouldIncludeGitInstructions()) return undercoverSection

  // 对于 ant 用户，使用指向技能的简短版本
  if (process.env.USER_TYPE === 'ant') {
    const skillsSection = !isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)
      ? `对于 git 提交和拉取请求，请使用 \`/commit\` 和 \`/commit-push-pr\` 技能：
- \`/commit\` - 使用暂存的更改创建 git 提交
- \`/commit-push-pr\` - 提交、推送并创建拉取请求

这些技能会处理 git 安全协议、正确的提交消息格式以及 PR 创建。

在创建拉取请求之前，请运行 \`/simplify\` 审查您的更改，然后进行端到端测试（例如，对于交互功能可通过 \`/tmux\` 进行测试）。

`
      : ''
    return `${undercoverSection}# Git 操作

${skillsSection}重要提示：绝不要跳过钩子（--no-verify、--no-gpg-sign 等），除非用户明确要求。

对于其他 GitHub 相关任务，包括处理议题、检查项和发布，请通过 Bash 工具使用 gh 命令。如果给出了 GitHub URL，请使用 gh 命令获取所需信息。

# 其他常见操作
- 查看 GitHub PR 的评论：gh api repos/foo/bar/pulls/123/comments`
  }

  // 对于外部用户，包含完整的嵌入式指令
  const { commit: commitAttribution, pr: prAttribution } = getAttributionTexts()

  return `# 使用 git 提交更改

仅在用户要求时创建提交。如果不确定，请先询问。当用户要求您创建新的 git 提交时，请仔细遵循以下步骤：

您可以在单次响应中调用多个工具。当请求多个独立的信息且所有命令都可能成功时，请并行运行多个工具调用以获得最佳性能。以下编号步骤指明了哪些命令应并行批量执行。

Git 安全协议：
- 绝不要更新 git 配置
- 绝不要运行破坏性 git 命令（push --force、reset --hard、checkout .、restore .、clean -f、branch -D），除非用户明确要求执行这些操作。擅自执行破坏性操作是无益的，并可能导致工作丢失，因此最好仅在获得直接指示时才运行这些命令
- 绝不要跳过钩子（--no-verify、--no-gpg-sign 等），除非用户明确要求
- 绝不要强制推送到 main/master 分支，如果用户要求这样做，请警告他们
- 关键：始终创建新的提交，而不是修改已有提交，除非用户明确要求执行 git amend。当 pre-commit 钩子失败时，提交实际上并未发生——因此使用 --amend 将修改上一个提交，这可能导致破坏工作或丢失之前的更改。相反，在钩子失败后，请修复问题，重新暂存，然后创建一个新的提交
- 暂存文件时，优先按名称添加特定文件，而不是使用 "git add -A" 或 "git add ."，这些命令可能意外包含敏感文件（.env、凭证）或大型二进制文件
- 绝不要在用户未明确要求时提交更改。仅在明确要求时提交非常重要，否则用户会觉得您过于主动

1. 使用 ${BASH_TOOL_NAME} 工具并行运行以下 bash 命令：
  - 运行 git status 命令查看所有未跟踪的文件。重要提示：绝不要使用 -uall 标志，因为它可能在大型仓库中导致内存问题。
  - 运行 git diff 命令查看将被提交的已暂存和未暂存更改。
  - 运行 git log 命令查看最近的提交消息，以便您能遵循此仓库的提交消息风格。
2. 分析所有已暂存的更改（包括之前暂存的和新增的）并草拟提交消息：
  - 概括更改的性质（例如新功能、现有功能的增强、错误修复、重构、测试、文档等）。确保消息准确反映更改及其目的（即 "add" 表示全新功能，"update" 表示对现有功能的增强，"fix" 表示错误修复等）。
  - 不要提交可能包含机密的文件（.env、credentials.json 等）。如果用户特别要求提交这些文件，请警告他们
  - 草拟简洁（1-2 句）的提交消息，侧重于“为什么”而非“是什么”
  - 确保它准确反映更改及其目的
3. 并行运行以下命令：
   - 将相关的未跟踪文件添加到暂存区。
   - 创建带有消息的提交${commitAttribution ? `，以以下内容结尾：\n   ${commitAttribution}` : '。'}
   - 提交完成后运行 git status 验证成功。
   注意：git status 依赖于提交的完成，因此请在提交后按顺序运行它。
4. 如果由于 pre-commit 钩子导致提交失败：修复问题并创建一个新的提交

重要注意事项：
- 除了 git bash 命令外，绝不要运行额外的命令来读取或探索代码
- 绝不要使用 ${TodoWriteTool.name} 或 ${AGENT_TOOL_NAME} 工具
- 除非用户明确要求，否则不要推送到远程仓库
- 重要提示：绝不要使用带有 -i 标志的 git 命令（如 git rebase -i 或 git add -i），因为它们需要交互式输入，而这不受支持。
- 重要提示：不要在 git rebase 命令中使用 --no-edit，因为 --no-edit 标志不是 git rebase 的有效选项。
- 如果没有要提交的更改（即没有未跟踪的文件也没有修改），不要创建空提交
- 为了确保格式良好，请始终通过 HEREDOC 传递提交消息，例如以下示例：
<示例>
git commit -m "$(cat <<'EOF'
   提交消息在此处。${commitAttribution ? `\n\n   ${commitAttribution}` : ''}
   EOF
   )"
</示例>

# 创建拉取请求
对于所有 GitHub 相关任务，包括处理议题、拉取请求、检查项和发布，请通过 Bash 工具使用 gh 命令。如果给出了 GitHub URL，请使用 gh 命令获取所需信息。

重要提示：当用户要求您创建拉取请求时，请仔细遵循以下步骤：

1. 使用 ${BASH_TOOL_NAME} 工具并行运行以下 bash 命令，以了解分支自偏离主分支以来的当前状态：
   - 运行 git status 命令查看所有未跟踪的文件（绝不要使用 -uall 标志）
   - 运行 git diff 命令查看将被提交的已暂存和未暂存更改
   - 检查当前分支是否跟踪远程分支并与远程保持同步，以便您了解是否需要推送到远程
   - 运行 git log 命令和 \`git diff [base-branch]...HEAD\` 以了解当前分支的完整提交历史（从它偏离基分支时算起）
2. 分析将包含在拉取请求中的所有更改，确保查看所有相关提交（不仅仅是最近的提交，而是将包含在拉取请求中的所有提交！！！），并草拟拉取请求的标题和摘要：
   - 保持 PR 标题简短（少于 70 个字符）
   - 使用描述/正文来提供详细信息，而不是标题
3. 并行运行以下命令：
   - 如果需要，创建新分支
   - 如果需要，使用 -u 标志推送到远程
   - 使用 gh pr create 并按照以下格式创建 PR。使用 HEREDOC 传递正文以确保格式正确。
<示例>
gh pr create --title "pr 标题" --body "$(cat <<'EOF'
## 摘要
<1-3 个要点>

## 测试计划
[用于测试拉取请求的待办事项的 Markdown 清单...]${prAttribution ? `\n\n${prAttribution}` : ''}
EOF
)"
</示例>

重要事项：
- 不要使用 ${TodoWriteTool.name} 或 ${AGENT_TOOL_NAME} 工具
- 完成后返回 PR URL，以便用户查看

# 其他常见操作
- 查看 GitHub PR 的评论：gh api repos/foo/bar/pulls/123/comments`
}

// SandboxManager 从多个来源（设置层、默认值、CLI 标志）合并配置，且不进行去重，
// 因此像 ~/.cache 这样的路径可能在 allowOnly 中出现 3 次。
// 在嵌入提示之前进行去重——仅影响模型所看到的内容，不影响沙箱执行。启用沙箱时每次请求可节省约 150-200 token。
function dedup<T>(arr: T[] | undefined): T[] | undefined {
  if (!arr || arr.length === 0) return arr
  return [...new Set(arr)]
}

function getSimpleSandboxSection(): string {
  if (!SandboxManager.isSandboxingEnabled()) {
    return ''
  }

  const fsReadConfig = SandboxManager.getFsReadConfig()
  const fsWriteConfig = SandboxManager.getFsWriteConfig()
  const networkRestrictionConfig = SandboxManager.getNetworkRestrictionConfig()
  const allowUnixSockets = SandboxManager.getAllowUnixSockets()
  const ignoreViolations = SandboxManager.getIgnoreViolations()
  const allowUnsandboxedCommands =
    SandboxManager.areUnsandboxedCommandsAllowed()

  // 将每个 UID 的临时目录字面量（例如 /private/tmp/claude-1001/）替换为
  // "$TMPDIR"，以便提示在不同用户间保持一致——避免破坏跨用户的全局提示缓存。
  // 沙箱在运行时已经设置了 $TMPDIR。
  const claudeTempDir = getClaudeTempDir()
  const normalizeAllowOnly = (paths: string[]): string[] =>
    [...new Set(paths)].map(p => (p === claudeTempDir ? '$TMPDIR' : p))

  const filesystemConfig = {
    read: {
      denyOnly: dedup(fsReadConfig.denyOnly),
      ...(fsReadConfig.allowWithinDeny && {
        allowWithinDeny: dedup(fsReadConfig.allowWithinDeny),
      }),
    },
    write: {
      allowOnly: normalizeAllowOnly(fsWriteConfig.allowOnly),
      denyWithinAllow: dedup(fsWriteConfig.denyWithinAllow),
    },
  }

  const networkConfig = {
    ...(networkRestrictionConfig?.allowedHosts && {
      allowedHosts: dedup(networkRestrictionConfig.allowedHosts),
    }),
    ...(networkRestrictionConfig?.deniedHosts && {
      deniedHosts: dedup(networkRestrictionConfig.deniedHosts),
    }),
    ...(allowUnixSockets && { allowUnixSockets: dedup(allowUnixSockets) }),
  }

  const restrictionsLines = []
  if (Object.keys(filesystemConfig).length > 0) {
    restrictionsLines.push(`文件系统：${jsonStringify(filesystemConfig)}`)
  }
  if (Object.keys(networkConfig).length > 0) {
    restrictionsLines.push(`网络：${jsonStringify(networkConfig)}`)
  }
  if (ignoreViolations) {
    restrictionsLines.push(
      `已忽略的违规行为：${jsonStringify(ignoreViolations)}`,
    )
  }

  const sandboxOverrideItems: Array<string | string[]> =
    allowUnsandboxedCommands
      ? [
          '您应始终默认在沙箱内运行命令。除非以下情况，否则不要尝试设置 `dangerouslyDisableSandbox: true`：',
          [
            '用户*明确*要求您绕过沙箱',
            '某个特定命令刚刚失败，并且您看到了沙箱限制导致失败的证据。请注意，命令可能因许多与沙箱无关的原因而失败（缺失文件、错误的参数、网络问题等）。',
          ],
          '沙箱导致失败的证据包括：',
          [
            '文件/网络操作的“操作不允许”错误',
            '对允许目录外特定路径的访问被拒绝',
            '与非白名单主机的网络连接失败',
            'Unix 套接字连接错误',
          ],
          '当您看到沙箱导致失败的证据时：',
          [
            "立即使用 `dangerouslyDisableSandbox: true` 重试（无需询问，直接执行）",
            '简要说明可能是哪种沙箱限制导致了失败。务必提及用户可以使用 `/sandbox` 命令管理限制。',
            '这将提示用户授予权限',
          ],
          '请单独处理您使用 `dangerouslyDisableSandbox: true` 执行的每个命令。即使您最近曾使用此设置运行过命令，也应默认将未来的命令在沙箱内运行。',
          '不要建议将敏感路径（如 ~/.bashrc、~/.zshrc、~/.ssh/* 或凭证文件）添加到沙箱白名单中。',
        ]
      : [
          '所有命令必须在沙箱模式下运行——策略已禁用 `dangerouslyDisableSandbox` 参数。',
          '任何情况下命令都不能在沙箱外运行。',
          '如果命令因沙箱限制而失败，请与用户协作调整沙箱设置。',
        ]

  const items: Array<string | string[]> = [
    ...sandboxOverrideItems,
    '对于临时文件，请始终使用 `$TMPDIR` 环境变量。在沙箱模式下，TMPDIR 会自动设置为正确的沙箱可写目录。不要直接使用 `/tmp`——请改用 `$TMPDIR`。',
    '重要提示：在 Windows 上，`/tmp`、`/dev` 等并非真实的 Linux 路径。它们是由 Git Bash/MSYS2 提供的虚拟路径。对于临时文件，请始终使用实际的 Windows 路径，如 `%TEMP%`。',
  ]

  return [
    '',
    '## 命令沙箱',
    '默认情况下，您的命令将在沙箱中运行。此沙箱控制命令在没有显式覆盖的情况下可以访问或修改哪些目录和网络主机。',
    '',
    '沙箱具有以下限制：',
    restrictionsLines.join('\n'),
    '',
    ...prependBullets(items),
  ].join('\n')
}

export function getSimplePrompt(): string {
  // Ant 原生构建将 find/grep 别名为 Claude shell 中的嵌入式 bfs/ugrep，
  // 因此我们不引导远离它们（并且 Glob/Grep 工具已被移除）。
  const embedded = hasEmbeddedSearchTools()

  const toolPreferenceItems = [
    ...(embedded
      ? []
      : [
          `文件搜索：使用 ${GLOB_TOOL_NAME}（而非 find 或 ls）`,
          `内容搜索：使用 ${GREP_TOOL_NAME}（而非 grep 或 rg）`,
        ]),
    `读取文件：使用 ${FILE_READ_TOOL_NAME}（而非 cat/head/tail）`,
    `编辑文件：使用 ${FILE_EDIT_TOOL_NAME}（而非 sed/awk）`,
    `写入文件：使用 ${FILE_WRITE_TOOL_NAME}（而非 echo >/cat <<EOF）`,
    '通信：直接输出文本（而非 echo/printf）',
  ]

  const avoidCommands = embedded
    ? '`cat`、`head`、`tail`、`sed`、`awk` 或 `echo`'
    : '`find`、`grep`、`cat`、`head`、`tail`、`sed`、`awk` 或 `echo`'

  const multipleCommandsSubitems = [
    `如果命令相互独立且可以并行运行，请在单条消息中发起多个 ${BASH_TOOL_NAME} 工具调用。示例：如果您需要运行 "git status" 和 "git diff"，请发送一条包含两个并行 ${BASH_TOOL_NAME} 工具调用的消息。`,
    `如果命令相互依赖且必须按顺序运行，请使用单个 ${BASH_TOOL_NAME} 调用，并用 '&&' 将它们链接在一起。`,
    "仅当您需要按顺序运行命令但不关心前面的命令是否失败时，才使用 ';'。",
    '不要使用换行符来分隔命令（带引号的字符串内的换行符是允许的）。',
  ]

  const gitSubitems = [
    '优先创建新提交，而不是修改已有提交。',
    '在执行破坏性操作（例如 git reset --hard、git push --force、git checkout --）之前，请考虑是否有更安全的替代方案可以实现相同的目标。仅在确实是最佳方法时才使用破坏性操作。',
    '绝不要跳过钩子（--no-verify）或绕过签名（--no-gpg-sign、-c commit.gpgsign=false），除非用户明确要求。如果钩子失败，请调查并修复根本问题。',
  ]

  const sleepSubitems = [
    '不要在本可立即运行的命令之间 sleep——直接运行它们。',
    ...(feature('MONITOR_TOOL')
      ? [
          '使用 Monitor 工具从后台进程流式传输事件（每行 stdout 都是一条通知）。对于一次性“等待直到完成”的情况，请改用带有 run_in_background 的 Bash。',
        ]
      : []),
    '如果您的命令运行时间较长且希望完成时收到通知——请使用 `run_in_background`。无需 sleep。',
    '不要在 sleep 循环中重试失败的命令——诊断根本原因。',
    '如果您正在等待通过 `run_in_background` 启动的后台任务，它完成时您会收到通知——不要轮询。',
    ...(feature('MONITOR_TOOL')
      ? [
          '作为第一个命令的 `sleep N`（N ≥ 2）已被阻止。如果您需要延迟（限流、刻意的节奏控制），请将其保持在 2 秒以内。',
        ]
      : [
          '如果您必须轮询外部进程，请使用检查命令（例如 `gh run view`），而不是先 sleep。',
          '如果您必须 sleep，请将时长控制在较短时间内（1-5 秒），以避免阻塞用户。',
        ]),
  ]
  const backgroundNote = getBackgroundUsageNote()

	const instructionItems: Array<string | string[]> = [
	  '命令中路径含空格时请用双引号括起',
	  '尽量使用绝对路径，避免频繁 cd',
	  `默认超时 ${getDefaultTimeoutMs() / 60000} 分钟，最大可设 ${getMaxTimeoutMs() / 60000} 分钟`,
	  ...(backgroundNote ? [backgroundNote] : []),
	  '多条独立命令请在同一消息中并行调用，有依赖则用 && 串联',
	  '避免不必要的 sleep，用 run_in_background 代替',
	];
  return [
    '执行给定的 bash 命令并返回其输出。',
    '',
    "工作目录在命令之间保持不变，但 shell 状态不会保留。Shell 环境从用户的配置文件（bash 或 zsh）初始化。",
    '',
    '关键：此工具始终使用 bash/zsh shell——绝不要使用 PowerShell 语法（Get-ChildItem、Where-Object、Select-Object 等）或 Windows CMD 命令（dir、type、del）。仅使用 Unix/bash 命令（ls、grep、cat、find 等）。即使在 Windows 上，此工具也运行 bash——请编写 bash 命令。',
    '',
    '关键：尽管此工具使用 bash，但底层文件系统是原生操作系统文件系统。在 Windows 上，请使用 Windows 路径（例如 D:/doge-code/file.txt 或 "D:\\doge-code\\file.txt"），而不是像 /tmp、/dev、/etc 这样的 Linux 路径。bash 环境在 Git Bash/MSYS2 下运行，它会转换路径——但您应始终使用实际的 Windows 路径。对于临时文件，不要使用 /tmp——请使用当前工作目录或等效的 %TEMP%。',
    '',
    `重要提示：避免使用此工具运行 ${avoidCommands} 命令，除非明确指示或在您验证专用工具无法完成您的任务之后。相反，请使用相应的专用工具，这将为用户提供更好的体验：`,
    '',
    ...prependBullets(toolPreferenceItems),
    `虽然 ${BASH_TOOL_NAME} 工具可以做类似的事情，但最好使用内置工具，因为它们提供了更好的用户体验，并使审查工具调用和授予权限更加容易。`,
    '',
    '# 指令',
    ...prependBullets(instructionItems),
    getSimpleSandboxSection(),
    ...(getCommitAndPRInstructions() ? ['', getCommitAndPRInstructions()] : []),
  ].join('\n')
}