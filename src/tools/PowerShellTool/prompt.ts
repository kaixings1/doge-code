import { isEnvTruthy } from '../../utils/envUtils.js'
import { getMaxOutputLength } from '../../utils/shell/outputLimits.js'
import {
  getPowerShellEdition,
  type PowerShellEdition,
} from '../../utils/shell/powershellDetection.js'
import {
  getDefaultBashTimeoutMs,
  getMaxBashTimeoutMs,
} from '../../utils/timeouts.js'
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
  return `  - 可使用 \`run_in_background\` 参数让命令在后台运行。仅在无需立即获取结果且接受后续收到完成通知的场景下使用。命令完成后您会收到提醒，无需主动轮询结果。`
}

function getSleepGuidance(): string | null {
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS)) {
    return null
  }
  return `  - 避免不必要的 \`Start-Sleep\`：
    - 命令之间无需等待即可直接执行，直接运行即可。
    - 若命令执行耗时较长且希望完成后收到通知，请使用 \`run_in_background\`，无需主动 sleep。
    - 不要在 sleep 循环中重试失败命令——应诊断根本原因或更换方案。
    - 等待后台任务完成时，系统会自动通知，无需轮询。
    - 若必须轮询外部进程，请先执行检查命令，而非先 sleep。
    - 若确实需要 sleep，请将时长控制在 1-5 秒，避免阻塞用户。`
}

/**
 * 版本特定的语法指导。模型的训练数据涵盖了 PowerShell 的两个主要版本，
 * 但它无法感知当前目标版本，因此要么在 5.1 上错误使用 pwsh 7 语法导致解析错误，
 * 要么在 7 上保守地回避使用 && 等运算符。
 */
function getEditionSection(edition: PowerShellEdition | null): string {
  if (edition === 'desktop') {
    return `PowerShell 版本：Windows PowerShell 5.1 (powershell.exe)
   - 管道链运算符 \`&&\` 和 \`||\` **不可用**——会导致解析错误。若需在 A 成功后才执行 B：\`A; if ($?) { B }\`。无条件顺序执行：\`A; B\`。
   - 三元运算符 (\`?:\`)、空值合并 (\`??\`) 及空条件 (\`?.\`) **不可用**。请使用 \`if/else\` 及显式的 \`$null -eq\` 检查。
   - 避免对原生可执行文件使用 \`2>&1\`。在 5.1 中，重定向原生命令的 stderr 会将每行输出包装为 ErrorRecord (NativeCommandError)，即使 exe 返回码为 0 也会将 \`$?\` 置为 \`$false\`。stderr 已被自动捕获，无需手动重定向。
   - 默认文件编码为 UTF-16 LE (带 BOM)。若写入的文件需被其他工具读取，请为 \`Out-File\`/\`Set-Content\` 添加 \`-Encoding utf8\`。
   - \`ConvertFrom-Json\` 返回 PSCustomObject 而非哈希表。\`-AsHashtable\` 参数不可用。`
  }
  if (edition === 'core') {
    return `PowerShell 版本：PowerShell 7+ (pwsh)
   - 管道链运算符 \`&&\` 和 \`||\` **可用**，行为与 bash 类似。当 B 仅应在 A 成功时执行，推荐使用 \`cmd1 && cmd2\` 代替 \`cmd1; cmd2\`。
   - 三元 (\`$cond ? $a : $b\`)、空值合并 (\`??\`) 及空条件 (\`?.\`) 运算符可用。
   - 默认文件编码为 UTF-8 (无 BOM)。`
  }
  // 版本检测尚未完成（首次构建提示时）或 PS 未安装。
  // 提供保守的 5.1 兼容指导。
  return `PowerShell 版本：未知——默认兼容 Windows PowerShell 5.1
   - 请**不要**使用 \`&&\`、\`||\`、三元 \`?:\`、空值合并 \`??\` 及空条件 \`?.\`。这些是 PowerShell 7+ 语法，在 5.1 中会导致解析错误。
   - 条件链：\`A; if ($?) { B }\`。无条件顺序执行：\`A; B\`。`
}

export async function getPrompt(): Promise<string> {
  const backgroundNote = getBackgroundUsageNote()
  const sleepGuidance = getSleepGuidance()
  const edition = await getPowerShellEdition()

  return `执行指定的 PowerShell 命令，可设置超时时间。工作目录在命令之间保持不变；Shell 状态（变量、函数等）不保留。

重要提示：本工具用于通过 PowerShell 执行终端操作（如 git、npm、docker 及 PowerShell cmdlet）。**请勿**用于文件操作（读取、写入、编辑、搜索、查找文件）——应使用相应的专用工具。

${getEditionSection(edition)}

执行命令前，请遵循以下步骤：

1. 目录确认：
   - 若命令将创建新目录或文件，请先使用 \`Get-ChildItem\`（或 \`ls\`）确认父目录存在且路径正确。

2. 命令执行：
   - 包含空格的路径必须使用双引号括起。
   - 请捕获命令的输出。

PowerShell 语法须知：
   - 变量以 $ 为前缀：$myVar = "value"
   - 转义符为反引号 (\`)，非反斜杠
   - cmdlet 命名规范为动词-名词：Get-ChildItem、Set-Location、New-Item、Remove-Item
   - 常用别名：ls (Get-ChildItem)、cd (Set-Location)、cat (Get-Content)、rm (Remove-Item)
   - 管道运算符 | 与 bash 类似，但传递的是对象而非文本
   - 使用 Select-Object、Where-Object、ForEach-Object 进行筛选和转换
   - 字符串插值："Hello $name" 或 "Hello $($obj.Property)"
   - 访问注册表需使用 PSDrive 前缀：\`HKLM:\\SOFTWARE\\...\`、\`HKCU:\\...\` —— **切勿**使用原始路径 \`HKEY_LOCAL_MACHINE\\...\`
   - 环境变量：读取用 \`$env:NAME\`，设置用 \`$env:NAME = "value"\`（**不要**使用 \`Set-Variable\` 或 bash 风格的 \`export\`）
   - 调用路径含空格的原生可执行文件，需使用调用运算符：\`& "C:\\Program Files\\App\\app.exe" arg1 arg2\`

交互式与阻塞命令（会导致挂起——本工具使用 -NonInteractive 运行）：
   - **严禁**使用 \`Read-Host\`、\`Get-Credential\`、\`Out-GridView\`、\`$Host.UI.PromptForChoice\` 或 \`pause\`
   - 具有破坏性的 cmdlet（如 \`Remove-Item\`、\`Stop-Process\`、\`Clear-Content\` 等）可能会弹出确认提示。若确实需要执行，请添加 \`-Confirm:$false\`。处理只读/隐藏项时可加 \`-Force\`。
   - **切勿**使用 \`git rebase -i\`、\`git add -i\` 或其他会打开交互式编辑器的命令。

向原生可执行文件传递多行字符串（如提交信息、文件内容）：
   - 使用单引号 here-string，防止 PowerShell 展开内部的 \`$\` 或反引号。结束标记 \`'@\` **必须**独占一行且位于第 0 列（行首无空白）——缩进会导致解析错误：
<示例>
git commit -m @'
提交信息在此。
第二行包含 $literal 美元符号。
'@
</示例>
   - 使用 \`@'...'@\`（单引号，字面量），而非 \`@"..."@\`（双引号，变量插值），除非确实需要展开变量。
   - 若参数包含 \`-\`、\`@\` 等会被 PowerShell 解析为运算符的字符，请使用停止解析标记：\`git log --% --format=%H\`

使用须知：
  - command 参数为必填项。
  - 可指定超时时间（毫秒），最大 ${getMaxTimeoutMs()}ms（约 ${getMaxTimeoutMs() / 60000} 分钟）。未指定时默认超时 ${getDefaultTimeoutMs()}ms（约 ${getDefaultTimeoutMs() / 60000} 分钟）。
  - 建议为该命令提供一个清晰、简洁的功能描述。
  - 若输出超过 ${getMaxOutputLength()} 个字符，返回内容将被截断。
${backgroundNote ? backgroundNote + '\n' : ''}\
  - 除非明确要求，否则应避免使用 PowerShell 执行已有专用工具的功能：
    - 文件搜索：用 ${GLOB_TOOL_NAME}（**不用** Get-ChildItem -Recurse）
    - 内容搜索：用 ${GREP_TOOL_NAME}（**不用** Select-String）
    - 读取文件：用 ${FILE_READ_TOOL_NAME}（**不用** Get-Content）
    - 编辑文件：用 ${FILE_EDIT_TOOL_NAME}
    - 写入文件：用 ${FILE_WRITE_TOOL_NAME}（**不用** Set-Content/Out-File）
    - 输出信息：直接输出文本（**不用** Write-Output/Write-Host）
  - 执行多条命令时：
    - 若命令相互独立且可并行执行，请在同一条消息中发起多个 ${POWERSHELL_TOOL_NAME} 工具调用。
    - 若命令存在依赖关系必须顺序执行，请在单次 ${POWERSHELL_TOOL_NAME} 调用中按版本对应的链式语法将其串联。
    - 仅当不关心前序命令是否失败时才使用 \`;\` 分隔。
    - **不要**用换行符分隔命令（字符串和 here-string 内部的换行不受此限）。
  - 请勿在命令前添加 \`cd\` 或 \`Set-Location\` —— 工作目录已自动设置为正确的项目根目录。
${sleepGuidance ? sleepGuidance + '\n' : ''}\
  - Git 命令注意事项：
    - 推荐创建新提交，而非修改已有提交。
    - 执行破坏性操作前（如 git reset --hard、git push --force、git checkout --），先考虑是否有更安全的替代方案。仅在确实必要时才使用破坏性操作。
    - **切勿**跳过钩子（--no-verify）或绕过签名（--no-gpg-sign、-c commit.gpgsign=false），除非用户明确要求。若钩子执行失败，应调查并修复根本原因。`
}