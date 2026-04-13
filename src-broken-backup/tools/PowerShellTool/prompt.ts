import { isEnvTruthy } from '../../../utils/envUtils.js'
import { getMaxOutputLength } from '../../../utils/shell/outputLimits.js'
import {
  getPowerShellEdition,
  type PowerShellEdition,
} from '../../../utils/shell/powershellDetection.js'
import {
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs,
} from '../../../utils/timeouts.js'
import { FILE_EDIT_TOOL_NAME } from '../FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../GrepTool/prompt.js'
import { POWERSHELL_TOOL_NAME } from './toolName.js'

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
  return `  - 你可以使）\`run_in_background\` 参数在后台运行命令。仅当你不需要立即获得结果，并且可以稍后收到命令完成通知时才使用此参数。你无需立即检查输出——完成后会收到通知。`
}

function getSleepGuidance(): string | null {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
    return null
  }
  return `  - 避免不必要的 \`Start-Sleep\` 命令。
    - 不要在本可以立即运行的命令之间加）sleep —）直接运行它们即可。
    - 如果你的命令需要长时间运行，并且希望在其完成时收到通知 —）直接使用 \`run_in_background\` 运行命令即可。这种情况下无需 sleep。
    - 不要）sleep 循环中重试失败的命令 —）诊断根本原因或考虑替代方法。
    - 如果正在等待你通过 \`run_in_background\` 启动的后台任务，你会在它完成时收到通知 —）不要轮询。
    - 如果必须轮询外部进程，请使用检查命令，而不是先 sleep。
    - 如果必须 sleep，请保持短时间（1-5 秒）以避免阻塞用户。`
}

/**
 * 特定版本的语法指导。模型的训练数据涵盖了两种版本，
 * 但它无法知道自己正在针对哪个版本，因此它可能会在 5.1 上发）pwsh-7 语法（解析器错误 ）exit 1。
 * 或者在不必要的情况下避免在 7 上使）&&。
 */
function getEditionSection(edition: PowerShellEdition | null): string {
  if (edition === 'desktop') {
    return `PowerShell 版本：Windows PowerShell 5.1 (powershell.exe)
   - 管道链运算符 \`&&\` ）\`||\` 不可）—）它们会导致解析器错误。要仅在 A 成功时运）B：\`A; if ($?) { B }\`。无条件链式执行：\`A; B\`。
   - 三元运算符（\`?:\`）、空合并运算符（\`??\`）和空条件运算符（\`?.\`）不可用。请改用 \`if/else\` 和显式的 \`$null -eq\` 检查。
   - 避免在本机可执行文件上使）\`2>&1\`。在 5.1 中，将本机命令的 stderr 重定向到 PowerShell 内部会将每一行包装为 ErrorRecord（NativeCommandError），并且即使 exe 返回了退出码 0，也会将 \`$?\` 设置）\`$false\`。stderr 已经被为你捕）—）不要重定向它。
   - 默认文件编码）UTF-16 LE（带 BOM）。当写入其他工具会读取的文件时，请向 \`Out-File\`/\`Set-Content\` 传）\`-Encoding utf8\`。
   - \`ConvertFrom-Json\` 返回 PSCustomObject，而不是哈希表。\`-AsHashtable\` 不可用。`
  }
  if (edition === 'core') {
    return `PowerShell 版本：PowerShell 7+ (pwsh)
   - 管道链运算符 \`&&\` ）\`||\` 可用，并且行为类似于 bash。当 cmd2 仅在 cmd1 成功时才应运行时，优先使）\`cmd1 && cmd2\` 而非 \`cmd1; cmd2\`。
   - 三元运算符（\`$cond ? $a : $b\`）、空合并运算符（\`??\`）和空条件运算符（\`?.\`）可用。
   - 默认文件编码）UTF-8（无 BOM）。`
  }
  // 尚未解析出版本（首次提示构建，在任何工具调用之前）或。
  // PS 未安装。给出保守的 5.1 安全指导。
  return `PowerShell 版本：未）—）假定）Windows PowerShell 5.1 以保证兼容。
   - 不要使用 \`&&\`、\`||\`、三元运算符 \`?:\`、空合并运算）\`??\` 或空条件运算）\`?.\`。这些是 PowerShell 7+ 独有的，）5.1 上会导致解析器错误。
   - 条件链式执行命令：\`A; if ($?) { B }\`。无条件链式执行：\`A; B\`.`
}

export async function getPrompt(): Promise<string> {
  const backgroundNote = getBackgroundUsageNote()
  const sleepGuidance = getSleepGuidance()
  const edition = await getPowerShellEdition()

  return `执行给定）PowerShell 命令，可选择设置超时。工作目录在命令之间保持持久化；）shell 状态（变量、函数不会保持。

重要提示：此工具用于通过 PowerShell 执行终端操作：git、npm、docker ）PS cmdlet。不要将其用于文件操作（读取、写入、编辑、搜索、查找文件）- 请改用专用工具。

${getEditionSection(edition)}

执行命令前，请遵循以下步骤：

1. 目录验证。
   - 如果命令将创建新目录或文件，首先使用 \`Get-ChildItem\`（或 \`ls\`）验证父目录存在且是正确的位。

2. 命令执行。
   - 始终用双引号引用包含空格的文件路。
   - 捕获命令的输出。

PowerShell 语法说明。
   - 变量使用 $ 前缀）myVar = "value"
   - 转义字符是反引号 (\`)，而非反斜。
   - 使用 动词-名词 cmdlet 命名：Get-ChildItem、Set-Location、New-Item、Remove-Item
   - 常用别名：ls (Get-ChildItem)、cd (Set-Location)、cat (Get-Content)、rm (Remove-Item)
   - 管道运算）| 类似）bash，但传递的是对象而非文本
   - 使用 Select-Object、Where-Object、ForEach-Object 进行过滤和转。
   - 字符串插值："Hello $name" ）"Hello $($obj.Property)"
   - 注册表访问使）PSDrive 前缀：\`HKLM:\\SOFTWARE\\...\`、\`HKCU:\\...\` ）而非原始 \`HKEY_LOCAL_MACHINE\\...\`
   - 环境变量：使）\`$env:NAME\` 读取，使）\`$env:NAME = "value"\` 设置（而非 \`Set-Variable\` ）bash \`export\`。
   - 调用包含空格路径的原）exe 使用调用运算符：\`& "C:\\Program Files\\App\\app.exe" arg1 arg2\`


交互式和阻塞命令（将挂起 ）此工具使）-NonInteractive 运行）：
   - 绝不使用 \`Read-Host\`、\`Get-Credential\`、\`Out-GridView\`、\`$Host.UI.PromptForChoice\` ）\`pause\`
   - 破坏）cmdlet（\`Remove-Item\`、\`Stop-Process\`、\`Clear-Content\` 等）可能会提示确认。如果打算执行操作，添加 \`-Confirm:$false\`。对只读/隐藏项使）\`-Force\`。
   - 永远不要使用 \`git rebase -i\`、\`git add -i\` 或其他打开交互式编辑器的命。

传递多行字符串（提交消息、文件内容）给原生可执行文件。
   - 使用单引）here-string，这）PowerShell 不会扩展其中）\`$\` 或反引号。闭合的 \`'@\` 必须在其所在行的第 0 列（无前导空白））缩进它是解析错误。
<example>
git commit -m @'
Commit message here.
Second line with $literal dollar signs.
'@
</example>
   - 使用 \`@'...'@\`（单引号，字面量）而非 \`@"..."@\`（双引号，可插值），除非需要变量扩。
   - 对于包含 \`-\`、\`@\` 或其）PowerShell 解析为运算符的字符的参数，使用停止解析令牌：\`git log --% --format=%H\`

使用说明。
  - 命令参数是必需的。
  - 你可以选择指定毫秒为单位的超时时间（最）${getMaxTimeoutMs()}ms / ${getMaxTimeoutMs() / 60000} 分钟）。如果未指定，命令将）${getDefaultTimeoutMs()}ms）{getDefaultTimeoutMs() / 60000} 分钟）后超时。
  - 编写清晰、简洁的描述说明此命令的作用会非常有帮助。
  - 如果输出超过 ${getMaxOutputLength()} 个字符，输出将在返回给你之前被截断。
${backgroundNote ? backgroundNote + '\n' : ''}\
  - 避免使用 PowerShell 运行有专用工具的命令，除非明确指示：
    - 文件搜索：使）${GLOB_TOOL_NAME}（而非 Get-ChildItem -Recurse。
    - 内容搜索：使）${GREP_TOOL_NAME}（而非 Select-String。
    - 读取文件：使）${FILE_READ_TOOL_NAME}（而非 Get-Content。
    - 编辑文件：使）${FILE_EDIT_TOOL_NAME}
    - 写入文件：使）${FILE_WRITE_TOOL_NAME}（而非 Set-Content/Out-File。
    - 通信：直接输出文本（而非 Write-Output/Write-Host。
  - 发布多个命令时：
    - 如果命令是独立的且可以并行运行，在单个消息中进行多次 ${POWERSHELL_TOOL_NAME} 工具调用。
    - 如果命令相互依赖且必须顺序运行，在单）${POWERSHELL_TOOL_NAME} 调用中链接它们（见上方特定于版本的链式语法）。
    - 仅在需要顺序运行命令但不关心早期命令是否失败时才使）\`;\`。
    - 不要使用换行符分隔命令（引号字符串和 here-string 中的换行符是可以的）
  - 不要在命令前）\`cd\` ）\`Set-Location\` ）工作目录已自动设置为正确的项目目录。
${sleepGuidance ? sleepGuidance + '\n' : ''}\
  - 对于 git 命令。
    - 优先创建新提交，而非修改现有提交。
    - 在运行破坏性操作（）git reset --hard、git push --force、git checkout --）之前，考虑是否有更安全的替代方案可以达到相同目的。仅在破坏性操作确实是最佳方法时才使用它们。
    - 除非用户明确要求，否则永远不要跳过钩子（--no-verify）或绕过签名）-no-gpg-sign）c commit.gpgsign=false）。如果钩子失败，调查并修复根本问题。`
}