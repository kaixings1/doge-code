import { feature } from 'bun:bundle'
import { prependBullets } from '../../../constants/prompts.js'
import { getAttributionTexts } from '../../../utils/attribution.js'
import { hasEmbeddedSearchTools } from '../../../utils/embeddedTools.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'
import { shouldIncludeGitInstructions } from '../../../utils/gitSettings.js'
import { getClaudeTempDir } from '../../../utils/permissions/filesystem.js'
import { SandboxManager } from '../../../utils/sandbox/sandbox-adapter.js'
import { jsonStringify } from '../../../utils/slowOperations.js'
import {
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs,
} from '../../../utils/timeouts.js'
import {
  getUndercoverInstructions,
  isUndercover,
} from '../../../utils/undercover.js'
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
  return "你可以使）`run_in_background` 参数在后台运行命令。仅当你不需要立即获取结果，并且可以接受稍后命令完成时收到通知时才使用此参数。你不需要立即检查输出——完成后会通知你。使用此参数时，不需要在命令末尾添加 '&'。
}

function getCommitAndPRInstructions(): string {
  // 防御性深度保护：即便用户完全禁用）git 指令，隐藏身份的指令也必须保留。
  // 归因剥离和模）ID 隐藏是机械性的，无论如何都会生效，但显式的“不要暴露身份”指令是防止模型在提交消息中主动泄露内部代码名的最后一道防线。
  const undercoverSection =
    process.env.USER_TYPE === 'ant' && isUndercover()
      ? getUndercoverInstructions() + '\n'
      : ''

  if (!shouldIncludeGitInstructions()) return undercoverSection

  // 对于 ant 用户，使用指向技能（skills）的简短版。
  if (process.env.USER_TYPE === 'ant') {
    const skillsSection = !isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)
      ? `对于 git 提交和拉取请求，请使）\`/commit\` ）\`/commit-push-pr\` 技能：
- \`/commit\` - 使用暂存的更改创）git 提交
- \`/commit-push-pr\` - 提交、推送并创建拉取请求

这些技能处）git 安全协议、正确的提交消息格式）PR 创建。

在创建拉取请求之前，运行 \`/simplify\` 来审查你的更改，然后进行端到端测试（例如，对于交互式功能，通过 \`/tmux\`）。

`
      : ''
    return `${undercoverSection}# Git 操作

${skillsSection}重要提示：除非用户明确要求，否则绝对不要跳过钩子）-no-verify）-no-gpg-sign 等）。

对于其他 GitHub 相关任务（包括处理议题、检查、发布等），请通过 Bash 工具使用 gh 命令。如果提供了 GitHub URL，请使用 gh 命令获取所需信息。

# 其他常见操作
- 查看 GitHub PR 上的评论：gh api repos/foo/bar/pulls/123/comments`
  }

  // 对于外部用户，包含完整的内联指令
  const { commit: commitAttribution, pr: prAttribution } = getAttributionTexts()

  return `# 使用 git 提交更改

仅在用户要求时创建提交。如果不确定，请先询问。当用户要求你创建一个新）git 提交时，请仔细遵循以下步骤：

你可以在单个响应中调用多个工具。当请求多个独立的信息片段并且所有命令都可能成功时，为了获得最佳性能，可以并行运行多个工具调用。下面的编号步骤指示哪些命令应该并行批处理。

Git 安全协议。
- 绝对不要更新 git 配置
- 绝对不要运行破坏性的 git 命令（push --force、reset --hard、checkout .、restore .、clean -f、branch -D），除非用户明确要求执行这些操作。采取未经授权的破坏性操作是无益的，可能导致工作丢失，因此最好仅在得到直接指示时才运行这些命。
- 除非用户明确要求，否则绝对不要跳过钩子（--no-verify）-no-gpg-sign 等）
- 绝对不要强制推送到 main/master 分支，如果用户要求这样做，请发出警告
- 关键提示：除非用户明确要）git amend，否则始终创建新提交而不是修改。当预提交钩子失败时，提交并未发生——因）--amend 会修改上一个提交，这可能导致工作丢失或之前的更改丢失。相反，在钩子失败后，修复问题，重新暂存，并创建一个新提交
- 暂存文件时，优先按名称添加特定文件，而不是使）"git add -A" ）"git add ."，后者可能会意外包含敏感文件）env、凭据）或大二进制文。
- 除非用户明确要求，否则绝对不要提交更改。只在明确要求时提交非常重要，否则用户会觉得你过于主。

1. 并行运行以下 bash 命令，每个都使用 ${BASH_TOOL_NAME} 工具。
   - 运行 git status 命令查看所有未跟踪的文件。重要提示：切勿使用 -uall 标志，因为它可能导致大型仓库中的内存问题。
   - 运行 git diff 命令查看将要提交的已暂存和未暂存的更改。
   - 运行 git log 命令查看最近的提交消息，以便你可以遵循此仓库的提交消息风格。
2. 分析所有已暂存的更改（包括之前暂存的和新添加的），并草拟一条提交消息：
   - 总结更改的性质（例如，新功能、对现有功能的增强、错误修复、重构、测试、文档等）。确保消息准确反映更改及其目的（即“add”表示全新功能，“update”表示对现有功能的增强，“fix”表示错误修复等）。
   - 不要提交可能包含秘密的文件（.env、credentials.json 等）。如果用户特别要求提交这些文件，请发出警。
   - 草拟一条简洁（1-2 句话）的提交消息，侧重于“为什么”而不是“是什么。
   - 确保它准确反映更改及其目。
3. 并行运行以下命令。
   - 将相关的未跟踪文件添加到暂存区。
   - 创建提交，消）{commitAttribution ? `以以下内容结尾：\n   ${commitAttribution}` : '）}
   - 提交完成后运）git status 以验证成功。
   注意：git status 依赖于提交完成，因此在提交之后顺序运行它。
4. 如果由于预提交钩子导致提交失败：修复问题并创建一个新提交

重要提示。
- 除了 git bash 命令之外，绝对不要运行额外的命令来读取或探索代码
- 绝对不要使用 ${TodoWriteTool.name} ）${AGENT_TOOL_NAME} 工具
- 除非用户明确要求，否则不要推送到远程仓库
- 重要提示：切勿使用带）-i 标志）git 命令（如 git rebase -i ）git add -i），因为它们需要交互式输入，而交互式输入不受支持。
- 重要提示：不要在 git rebase 命令中使）--no-edit，因）--no-edit 标志）git rebase 不是有效选项。
- 如果没有要提交的更改（即没有未跟踪的文件也没有修改），不要创建空提交
- 为了确保良好的格式，始终通过 HEREDOC 传递提交消息，如下例所示：
<example>
git commit -m "$(cat <<'EOF'
   在此处写提交消息）{commitAttribution ? `\n\n   ${commitAttribution}` : ''}
   EOF
   )"
</example>

# 创建拉取请求
对于所）GitHub 相关任务，包括处理议题、拉取请求、检查、发布等，请通过 Bash 工具使用 gh 命令。如果提供了 GitHub URL，请使用 gh 命令获取所需信息。

重要提示：当用户要求你创建拉取请求时，请仔细遵循以下步骤。

1. 使用 ${BASH_TOOL_NAME} 工具并行运行以下 bash 命令，以了解当前分支自偏离主分支以来的状态：
   - 运行 git status 命令查看所有未跟踪的文件（切勿使用 -uall 标志。
   - 运行 git diff 命令查看将要提交的已暂存和未暂存的更。
   - 检查当前分支是否跟踪远程分支以及与远程分支是否保持同步，以便你知道是否需要推送到远程
   - 运行 git log 命令）\`git diff [base-branch]...HEAD\` 以了解当前分支的完整提交历史（从它偏离基础分支之时起）
2. 分析将包含在拉取请求中的所有更改，确保查看所有相关提交（不仅仅是最近的提交，而是将包含在拉取请求中的所有提交！！！），并草拟一个拉取请求标题和摘要。
   - 保持 PR 标题简短（不超）70 个字符）
   - 将详细信息放在描）正文中，而不是标题中
3. 并行运行以下命令。
   - 如果需要，创建新分。
   - 如果需要，使用 -u 标志推送到远程
   - 使用 gh pr create 创建 PR，格式如下。使）HEREDOC 传递正文以确保格式正确。
<example>
gh pr create --title "pr 标题" --body "$(cat <<'EOF'
## 摘要
<1-3 个要。

## 测试计划
[用于测试拉取请求的待办事项的项目符号 markdown 检查清）..]${prAttribution ? `\n\n${prAttribution}` : ''}
EOF
)"
</example>

重要提示。
- 不要使用 ${TodoWriteTool.name} ）${AGENT_TOOL_NAME} 工具
- 完成后返）PR URL，以便用户查。

# 其他常见操作
- 查看 GitHub PR 上的评论：gh api repos/foo/bar/pulls/123/comments`
}

// SandboxManager 会合并来自多个来源（设置层、默认值、CLI 标志）的配置，但不去重，
// 因此）~/.cache 这样的路径在 allowOnly 中会出现 3 次。
// 在将配置内联到提示之前在此处去重 —）只影响模型看到的内容，不影响沙箱强制执行。
// 启用沙箱时，每次请求可节省约 150-200 ）token。
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

  // 将每个用）UID 的临时目录字面量（例）/private/tmp/claude-1001/）替换为 "$TMPDIR"。
  // 以便提示在不同用户之间保持一）—）避免破坏跨用户的全局提示缓存。
  // 沙箱已经在运行时设置）$TMPDIR。
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
    restrictionsLines.push(`文件系统）{jsonStringify(filesystemConfig)}`)
  }
  if (Object.keys(networkConfig).length > 0) {
    restrictionsLines.push(`网络）{jsonStringify(networkConfig)}`)
  }
  if (ignoreViolations) {
    restrictionsLines.push(
      `忽略的违规：${jsonStringify(ignoreViolations)}`,
    )
  }

  const sandboxOverrideItems: Array<string | string[]> =
    allowUnsandboxedCommands
      ? [
          '你应该始终默认在沙箱内运行命令。除非以下情况，否则不要尝试设置 `dangerouslyDisableSandbox: true`）,
          [
            '用户 *明确* 要求你绕过沙）,
            '某个特定命令刚刚失败，并且你看到证据表明沙箱限制导致了失败。请注意，命令可能因许多与沙箱无关的原因而失败（文件缺失、参数错误、网络问题等））,
          ],
          '沙箱导致的失败证据包括：',
          [
            '文件/网络操作的“Operation not permitted”错）,
            '拒绝访问允许目录之外的特定路）,
            '连接到非白名单主机的网络连接失败',
            'Unix 套接字连接错）,
          ],
          '当你看到沙箱导致失败的证据时）,
          [
            "立即使用 `dangerouslyDisableSandbox: true` 重试（不要询问，直接做）",
            '简要解释可能是哪个沙箱限制导致了失败。务必提及用户可以使）`/sandbox` 命令来管理限制）,
            '这将提示用户授予权限',
          ],
          '对你使用 `dangerouslyDisableSandbox: true` 执行的每个命令单独对待。即使你最近使用此设置运行了一个命令，你也应该默认在沙箱内运行后续命令）,
          '不要建议将敏感路径（）~/.bashrc、~/.zshrc、~/.ssh/* 或凭据文件）添加到沙箱允许列表中）,
        ]
      : [
          '所有命令都必须在沙箱模式下运行——策略禁止使）`dangerouslyDisableSandbox` 参数）,
          '任何情况下命令都不能在沙箱外运行）,
          '如果命令因沙箱限制而失败，请与用户一起调整沙箱设置，而不是尝试绕过）,
        ]

  const items: Array<string | string[]> = [
    ...sandboxOverrideItems,
    '对于临时文件，始终使）`$TMPDIR` 环境变量。在沙箱模式下，TMPDIR 会自动设置为正确的沙箱可写目录。不要直接使）`/tmp` —）改用 `$TMPDIR`）,
  ]

  return [
    '',
    '## 命令沙箱',
    '默认情况下，你的命令将在沙箱中运行。此沙箱控制命令在未经显式覆盖的情况下可以访问或修改哪些目录和网络主机）,
    '',
    '沙箱具有以下限制）,
    restrictionsLines.join('\n'),
    '',
    ...prependBullets(items),
  ].join('\n')
}

export function getSimplePrompt(): string {
  // Ant 原生构建会在 Claude ）shell 中将 find/grep 别名为嵌入式）bfs/ugrep。
  // 因此我们不会引导用户远离它们（并）Glob/Grep 工具会被移除）。
  const embedded = hasEmbeddedSearchTools()

  const toolPreferenceItems = [
    ...(embedded
      ? []
      : [
          `文件搜索：使）${GLOB_TOOL_NAME}（而非 find ）dir）`,
          `内容搜索：使）${GREP_TOOL_NAME}（而非 grep、rg ）findstr）`,
        ]),
    `读取文件：使）${FILE_READ_TOOL_NAME}（而非 cat、head、tail ）type）`,
    `编辑文件：使）${FILE_EDIT_TOOL_NAME}（而非 sed ）awk）`,
    `写入文件：使）${FILE_WRITE_TOOL_NAME}（而非 echo 重定向或 cat heredoc）`,
    '通信：直接输出文本（而非 echo ）printf）,
  ]

  const avoidCommands = embedded
    ? '`cat`、`head`、`tail`、`sed`、`awk` ）`echo`'
    : '`find`、`grep`、`cat`、`head`、`tail`、`sed`、`awk`、`echo` ）`dir`'

  const multipleCommandsSubitems = [
    `如果多个命令相互独立且可以并行执行，在单条消息中发起多个 ${BASH_TOOL_NAME} 工具调用。示例：如果需要执）"git status" ）"git diff"，在单条消息中并行发起两）${BASH_TOOL_NAME} 工具调用。`,
    `如果多个命令相互依赖且必须顺序执行，使用单个 ${BASH_TOOL_NAME} 调用并通过 '&&' 将它们链接在一起。`,
    '仅当你需要顺序执行命令但不关心前面命令是否失败时，才使用 ";"）,
    '不要使用换行符分隔命令（引号字符串内的换行符是可以的））,
  ]

  const gitSubitems = [
    '优先创建新提交，而非修改现有提交）,
    '在执行破坏性操作（）git reset --hard、git push --force、git checkout --）之前，考虑是否有更安全的替代方案能实现相同目标。仅在破坏性操作确实是最佳方案时才使用）,
    '除非用户明确要求，否则绝不跳过钩子（--no-verify）或绕过签名）-no-gpg-sign）c commit.gpgsign=false）。如果钩子失败，调查并修复根本问题）,
  ]

  const sleepSubitems = [
    '不要在本可立即执行的命令之间使用 sleep ）直接运行它们）,
    ...(feature('MONITOR_TOOL')
      ? [
          '使用 Monitor 工具从后台进程流式传输事件（每行标准输出都是一条通知）。对于一次）等待完成"的场景，使用）run_in_background ）Bash 代替）,
        ]
      : []),
    '如果你的命令耗时较长且希望在完成时收到通知 ）使用 `run_in_background`。无需 sleep）,
    '不要）sleep 循环中重试失败的命令 ）应诊断根本原因）,
    '如果等待使用 `run_in_background` 启动的后台任务，你会在任务完成时收到通知 ）无需轮询）,
    ...(feature('MONITOR_TOOL')
      ? [
          '`sleep N` 作为首条命令）N ）2 被阻止。如果需要延迟（限速或有意控制节奏），保持）2 秒以内）,
        ]
      : [
          '如果必须轮询外部进程，使用检查命令（）`gh run view`）而非）sleep）,
          '如果必须使用 sleep，保持时长较短（1-5 秒）以免阻塞用户）,
        ]),
  ]
  const backgroundNote = getBackgroundUsageNote()

  const instructionItems: Array<string | string[]> = [
    '如果你的命令会创建新目录或文件，请首先使用此工具运行 `ls` 以验证父目录存在且位置正确）,
    '在命令中始终用双引号引用包含空格的路径（例如，cd "path with spaces/file.txt"）,
    '尽量在整个会话中保持当前工作目录不变，方法是使用绝对路径并避免使）`cd`。如果用户明确要求，你可以使）`cd`）,
    `你可以指定可选的超时时间（以毫秒为单位，最）${getMaxTimeoutMs()}ms / ${getMaxTimeoutMs() / 60000} 分钟）。默认情况下，你的命令将）${getDefaultTimeoutMs()}ms）{getDefaultTimeoutMs() / 60000} 分钟）后超时。`,
    ...(backgroundNote !== null ? [backgroundNote] : []),
    '当发出多个命令时）,
    multipleCommandsSubitems,
    '对于 git 命令）,
    gitSubitems,
    '避免不必要的 `sleep` 命令）,
    sleepSubitems,
    ...(embedded
      ? [
          // bfs（为 `find` 提供支持）对 -regex 使用 Oniguruma，它会选择第一个匹配的替代项（最左优先）。
          // 这与 GNU find ）POSIX 最左最长不同。当较短的替代项是较长替代项的前缀时，这会静默地丢弃匹配项。
          "当使）`find -regex` 并带有选择项时，将最长的替代项放在前面。示例：使用 `'.*\\.\\(tsx\\|ts\\)'` 而不）`'.*\\.\\(ts\\|tsx\\)'` —）后一种形式会静默跳过 `.tsx` 文件）,
        ]
      : []),
  ]

  return [
    '执行给定）bash 命令并返回其输出）,
    '',
    '工作目录在命令之间保持持久化，但 shell 状态不会。shell 环境从用户配置文件（bash ）zsh）初始化）,
    '',
    `重要提示：除非明确指示，或者你已验证专用工具无法完成任务，否则避免使用此工具运）${avoidCommands} 命令。请改用相应的专用工具，因为这将为用户提供更好的体验：`,
    '',
    ...prependBullets(toolPreferenceItems),
    `虽然 ${BASH_TOOL_NAME} 工具可以做类似的事情，但最好使用内置工具，因为它们能提供更好的用户体验，并更容易审查工具调用和授予权限。`,
    '',
    '# 指令',
    ...prependBullets(instructionItems),
    getSimpleSandboxSection(),
    ...(getCommitAndPRInstructions() ? ['', getCommitAndPRInstructions()] : []),
  ].join('\n')
}