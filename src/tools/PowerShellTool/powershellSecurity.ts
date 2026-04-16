/**
 * PowerShell 命令验证的专属安全分析模块。
 *
 * 检测危险模式：代码注入、下载支架、权限提升、动态命令名、COM 对象等。
 *
 * 所有检查均基于 AST。若解析失败（valid=false），则各检查均不匹配，最终
 * powershellCommandIsSafe 返回 'ask'。
 */

import {
  DANGEROUS_SCRIPT_BLOCK_CMDLETS,
  FILEPATH_EXECUTION_CMDLETS,
  MODULE_LOADING_CMDLETS,
} from '../../utils/powershell/dangerousCmdlets.js'
import type {
  ParsedCommandElement,
  ParsedPowerShellCommand,
} from '../../utils/powershell/parser.js'
import {
  COMMON_ALIASES,
  commandHasArgAbbreviation,
  deriveSecurityFlags,
  getAllCommands,
  getVariablesByScope,
  hasCommandNamed,
} from '../../utils/powershell/parser.js'
import { isClmAllowedType } from './clmTypes.js'

type PowerShellSecurityResult = {
  behavior: 'passthrough' | 'ask' | 'allow'
  message?: string
}

const POWERSHELL_EXECUTABLES = new Set([
  'pwsh',
  'pwsh.exe',
  'powershell',
  'powershell.exe',
])

/**
 * 从命令中提取基本可执行文件名，处理完整路径，例如
 * /usr/bin/pwsh、C:\Windows\...\powershell.exe 或 .\pwsh。
 */
function isPowerShellExecutable(name: string): boolean {
  const lower = name.toLowerCase()
  if (POWERSHELL_EXECUTABLES.has(lower)) {
    return true
  }
  // 从路径中提取基本名称（支持 / 和 \ 分隔符）
  const lastSep = Math.max(lower.lastIndexOf('/'), lower.lastIndexOf('\\'))
  if (lastSep >= 0) {
    return POWERSHELL_EXECUTABLES.has(lower.slice(lastSep + 1))
  }
  return false
}

/**
 * PowerShell 接受作为 ASCII 连字符（U+002D）等效替代的参数前缀字符。
 * PowerShell 的词法分析器 (SpecialCharacters.IsDash) 以及 powershell.exe 的
 * CommandLineParameterParser 均接受全部四种破折号字符，外加 Windows PowerShell 5.1 的
 * `/` 参数分隔符。Extent.Text 保留原始字符；transformCommandAst 对 CommandParameterAst
 * 元素使用 ce.text，因此这些字符会原样传递给我们。
 */
const PS_ALT_PARAM_PREFIXES = new Set([
  '/', // Windows PowerShell 5.1 (powershell.exe，pwsh 7+ 不支持)
  '\u2013', // 短破折号
  '\u2014', // 长破折号
  '\u2015', // 水平线
])

/**
 * 对 commandHasArgAbbreviation 的封装，同时匹配替代参数前缀（`/`、短破折号、长破折号、水平线）。
 * PowerShell 的词法分析器 (SpecialCharacters.IsDash) 对 powershell.exe 的参数和 cmdlet 参数
 * 均接受这些前缀，因此本函数应用于所有 PowerShell 参数检查——而非仅限于 pwsh.exe 调用。
 * 此前 checkComObject/checkStartProcess/checkDangerousFilePathExecution/checkForEachMemberName
 * 直接使用 commandHasArgAbbreviation，导致 `Start-Process foo –Verb RunAs` 被绕过。
 */
function psExeHasParamAbbreviation(
  cmd: ParsedCommandElement,
  fullParam: string,
  minPrefix: string,
): boolean {
  if (commandHasArgAbbreviation(cmd, fullParam, minPrefix)) {
    return true
  }
  // 将替代前缀规范化为 `-` 并重新检查。构建一个带有规范化参数的合成 cmd；
  // commandHasArgAbbreviation 会处理冒号值的拆分。
  const normalized: ParsedCommandElement = {
    ...cmd,
    args: cmd.args.map(a =>
      a.length > 0 && PS_ALT_PARAM_PREFIXES.has(a[0]!) ? '-' + a.slice(1) : a,
    ),
  }
  return commandHasArgAbbreviation(normalized, fullParam, minPrefix)
}

/**
 * 检查 PowerShell 命令是否使用了 Invoke-Expression 或其别名 (iex)。
 * 这些等同于 eval，可执行任意代码。
 */
function checkInvokeExpression(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (hasCommandNamed(parsed, 'Invoke-Expression')) {
    return {
      behavior: 'ask',
      message: '命令使用了 Invoke-Expression，可执行任意代码',
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 检测动态命令调用，即命令名称本身是无法静态解析的表达式。
 *
 * 概念验证：
 *   & ${function:Invoke-Expression} 'payload'  — VariableExpressionAst
 *   & ('iex','x')[0] 'payload'                 — IndexExpressionAst → 'Other'
 *   & ('i'+'ex') 'payload'                     — BinaryExpressionAst → 'Other'
 *
 * 以上所有情况下，cmd.name 为字面量文本（如 "('iex','x')[0]"），
 * 不会匹配 hasCommandNamed('Invoke-Expression')。运行时 PowerShell 会求值表达式并调用其结果作为命令名。
 *
 * 合法的命令名始终为 StringConstantExpressionAst（映射为 'StringConstant'）：
 * `Get-Process`、`git`、`ls`。名称位置的任何其他元素类型均为动态。
 * 与其黑名单式拒绝动态类型（脆弱——mapElementType 的默认分支将未知 AST 类型映射为 'Other'，
 * `=== 'Variable'` 检查会遗漏此类），不如采用白名单方式仅允许 'StringConstant'。
 *
 * elementTypes[0] 为命令名称元素（transformCommandAst 优先推送它，在参数元素之前）。
 * 当 elementTypes 缺失时（无法获取解析细节——若完全解析失败，valid=false 已在链路更早处返回 'ask'），
 * `!== undefined` 守卫保留故障开放行为。
 */
function checkDynamicCommandName(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    if (cmd.elementType !== 'CommandAst') {
      continue
    }
    const nameElementType = cmd.elementTypes?.[0]
    if (nameElementType !== undefined && nameElementType !== 'StringConstant') {
      return {
        behavior: 'ask',
        message: '命令名称是一个动态表达式，无法静态验证',
      }
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 检查编码命令参数，该参数会隐藏命令意图。
 * 常见于恶意软件绕过安全工具。
 */
function checkEncodedCommand(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    if (isPowerShellExecutable(cmd.name)) {
      if (psExeHasParamAbbreviation(cmd, '-encodedcommand', '-e')) {
        return {
          behavior: 'ask',
          message: '命令使用编码参数，意图不明确',
        }
      }
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 检查 PowerShell 的重复调用（嵌套的 pwsh/powershell 进程）。
 *
 * 命令位置的任何 PowerShell 可执行文件均会被标记——不仅仅限于 -Command/-File。
 * 裸 `pwsh` 接收标准输入（`Get-Content x | pwsh`）或位置脚本路径时，
 * 会在未出现任何显式标志的情况下执行任意代码。与 checkStartProcess 的向量 2 同理：
 * 我们无法静态分析子进程将运行的内容。
 */
function checkPwshCommandOrFile(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    if (isPowerShellExecutable(cmd.name)) {
      return {
        behavior: 'ask',
        message: '命令生成了嵌套的 PowerShell 进程，无法验证其行为',
      }
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 检查下载支架模式——常见的恶意软件技术，用于下载并执行远程代码。
 *
 * 按语句检测：捕获管道支架 (`IWR ... | IEX`)。
 * 跨语句检测：捕获分离支架 (`$r = IWR ...; IEX $r.Content`)。
 * 跨语句情况已被 checkInvokeExpression 拦截（它会扫描所有语句），
 * 但本检查可改善警告消息。
 */
const DOWNLOADER_NAMES = new Set([
  'invoke-webrequest',
  'iwr',
  'invoke-restmethod',
  'irm',
  'new-object',
  'start-bitstransfer', // MITRE T1197
])

function isDownloader(name: string): boolean {
  return DOWNLOADER_NAMES.has(name.toLowerCase())
}

function isIex(name: string): boolean {
  const lower = name.toLowerCase()
  return lower === 'invoke-expression' || lower === 'iex'
}

function checkDownloadCradles(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  // 按语句：管道支架 (IWR ... | IEX)
  for (const statement of parsed.statements) {
    const cmds = statement.commands
    if (cmds.length < 2) {
      continue
    }
    const hasDownloader = cmds.some(cmd => isDownloader(cmd.name))
    const hasIex = cmds.some(cmd => isIex(cmd.name))
    if (hasDownloader && hasIex) {
      return {
        behavior: 'ask',
        message: '命令下载并执行远程代码',
      }
    }
  }

  // 跨语句：分离支架 ($r = IWR ...; IEX $r.Content)。
  // 不会产生新误报：若存在 IEX，checkInvokeExpression 已要求询问。
  const all = getAllCommands(parsed)
  if (all.some(c => isDownloader(c.name)) && all.some(c => isIex(c.name))) {
    return {
      behavior: 'ask',
      message: '命令下载并执行远程代码',
    }
  }

  return { behavior: 'passthrough' }
}

/**
 * 检查独立的下载实用工具——常用于获取有效载荷的 LOLBAS 工具。
 * 与 checkDownloadCradles（要求下载 + IEX 在同一管道中）不同，此检查直接标记下载操作本身。
 *
 * Start-BitsTransfer：始终是文件传输 (MITRE T1197)。
 * certutil -urlcache：经典的 LOLBAS 下载工具。仅在存在 -urlcache 时标记；
 * 裸 `certutil` 具有许多合法的证书管理用途。
 * bitsadmin /transfer：传统的 BITS 下载（早于 PowerShell）。
 */
function checkDownloadUtilities(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const lower = cmd.name.toLowerCase()
    // Start-BitsTransfer 专为文件传输设计——无安全变体。
    if (lower === 'start-bitstransfer') {
      return {
        behavior: 'ask',
        message: '命令通过 BITS 传输下载文件',
      }
    }
    // certutil / certutil.exe —— 仅当存在 -urlcache 时检查。certutil 具有多种非下载用途
    //（证书存储查询、编码等）。certutil.exe 接受 -urlcache 和 /urlcache，符合 Windows 实用工具惯例——
    // 对两种形式均进行检查（下方的 bitsadmin 同理）。
    if (lower === 'certutil' || lower === 'certutil.exe') {
      const hasUrlcache = cmd.args.some(a => {
        const la = a.toLowerCase()
        return la === '-urlcache' || la === '/urlcache'
      })
      if (hasUrlcache) {
        return {
          behavior: 'ask',
          message: '命令使用 certutil 从 URL 下载',
        }
      }
    }
    // bitsadmin /transfer —— 传统的 BITS 命令行工具，与 Start-BitsTransfer 威胁相同。
    if (lower === 'bitsadmin' || lower === 'bitsadmin.exe') {
      if (cmd.args.some(a => a.toLowerCase() === '/transfer')) {
        return {
          behavior: 'ask',
          message: '命令通过 BITS 传输下载文件',
        }
      }
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 检查 Add-Type 的使用，该 cmdlet 在运行时编译并加载 .NET 代码。
 * 可用于执行任意编译后的代码。
 */
function checkAddType(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (hasCommandNamed(parsed, 'Add-Type')) {
    return {
      behavior: 'ask',
      message: '命令编译并加载 .NET 代码',
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 检查 New-Object -ComObject。诸如 WScript.Shell、Shell.Application、MMC20.Application、
 * Schedule.Service、Msxml2.XMLHTTP 等 COM 对象具有自带的执行/下载能力——无需 IEX。
 *
 * 无法枚举所有危险的 ProgID，因此标记任何 -ComObject。对象创建本身是惰性的，
 * 但提示应警告用户 COM 实例化是一种执行原语。结果上的方法调用（.Run()、.Exec()）
 * 会单独被 checkMemberInvocations 捕获。
 */
function checkComObject(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    if (cmd.name.toLowerCase() !== 'new-object') {
      continue
    }
    // -ComObject 最小缩写为 -com（New-Object 参数：-TypeName、-ComObject、
    // -ArgumentList、-Property、-Strict；由于存在公共参数如 -Confirm，-co 在 PS5.1 中可能产生歧义，
    // 故使用 -com）。
    if (psExeHasParamAbbreviation(cmd, '-comobject', '-com')) {
      return {
        behavior: 'ask',
        message: '命令实例化了一个 COM 对象，该对象可能具有执行能力',
      }
    }
    // 安全说明：checkTypeLiterals 仅能识别来自 parsed.typeLiterals 的 [bracket] 语法。
    // `New-Object System.Net.WebClient` 将类型作为字符串参数（StringConstantExpressionAst）传递，
    // 而非 TypeExpressionAst，因此 CLM 永远不会触发。提取 -TypeName（命名、冒号绑定或位置 0）
    // 并通过 isClmAllowedType 运行。此修复堵住了攻击向量 D4。
    let typeName: string | undefined
    for (let i = 0; i < cmd.args.length; i++) {
      const a = cmd.args[i]!
      const lower = a.toLowerCase()
      // -TypeName 缩写：-t 无歧义（New-Object 无其他以 -t 开头的参数）。
      // 首先处理冒号绑定形式：-TypeName:Foo.Bar
      if (lower.startsWith('-t') && lower.includes(':')) {
        const colonIdx = a.indexOf(':')
        const paramPart = lower.slice(0, colonIdx)
        if ('-typename'.startsWith(paramPart)) {
          typeName = a.slice(colonIdx + 1)
          break
        }
      }
      // 空格分隔形式：-TypeName Foo.Bar
      if (
        lower.startsWith('-t') &&
        '-typename'.startsWith(lower) &&
        cmd.args[i + 1] !== undefined
      ) {
        typeName = cmd.args[i + 1]
        break
      }
    }
    // 位置 0 绑定到 -TypeName（NetParameterSet 默认值）。命名参数（-Strict、-ArgumentList、
    // -Property、-ComObject）可能出现在位置 TypeName 之前，因此扫描并跳过它们以找到第一个未被消费的参数。
    if (typeName === undefined) {
      // New-Object 命名参数中需消费后续值参数
      const VALUE_PARAMS = new Set(['-argumentlist', '-comobject', '-property'])
      // 开关参数（无值参数）
      const SWITCH_PARAMS = new Set(['-strict'])
      for (let i = 0; i < cmd.args.length; i++) {
        const a = cmd.args[i]!
        if (a.startsWith('-')) {
          const lower = a.toLowerCase()
          // 跳过 -TypeName 变体（已在上方命名参数循环中处理）
          if (lower.startsWith('-t') && '-typename'.startsWith(lower)) {
            i++ // 跳过值
            continue
          }
          // 冒号绑定形式：-Param:Value（单个 token，无需跳过）
          if (lower.includes(':')) continue
          if (SWITCH_PARAMS.has(lower)) continue
          if (VALUE_PARAMS.has(lower)) {
            i++ // 跳过值
            continue
          }
          // 未知参数 —— 保守跳过
          continue
        }
        // 第一个非短横线参数即为位置 TypeName
        typeName = a
        break
      }
    }
    if (typeName !== undefined && !isClmAllowedType(typeName)) {
      return {
        behavior: 'ask',
        message: `New-Object 实例化了 .NET 类型 '${typeName}'，该类型不在受限语言模式白名单内`,
      }
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 检查以 -FilePath（或 -LiteralPath）参数调用的 DANGEROUS_SCRIPT_BLOCK_CMDLETS。
 * 这些 cmdlet 会运行脚本文件——在 AST 树中不包含 ScriptBlockAst 的任意代码执行。
 *
 * checkScriptBlockInjection 仅在 hasScriptBlocks 为真时触发。而使用 -FilePath 时不存在
 * ScriptBlockAst，因此永远不会查询 DANGEROUS_SCRIPT_BLOCK_CMDLETS。本检查为 -FilePath 向量填补了这一空白。
 *
 * DANGEROUS_SCRIPT_BLOCK_CMDLETS 中接受 -FilePath 的 cmdlet：
 *   Invoke-Command   -FilePath             （通过 COMMON_ALIASES 支持 icm 别名）
 *   Start-Job        -FilePath, -LiteralPath
 *   Start-ThreadJob  -FilePath
 *   Register-ScheduledJob -FilePath
 * 其中 *-PSSession 和 Register-*Event 条目不接受 -FilePath。
 *
 * 对于上述四个 cmdlet，-f 作为 -FilePath 的缩写无歧义（无其他以 -f 开头的参数）。
 * -l 作为 -LiteralPath 的缩写在 Start-Job 上无歧义；对其他 cmdlet 而言则无害且不冲突（无其他以 -l 开头的参数）。
 */
function checkDangerousFilePathExecution(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const lower = cmd.name.toLowerCase()
    const resolved = COMMON_ALIASES[lower]?.toLowerCase() ?? lower
    if (!FILEPATH_EXECUTION_CMDLETS.has(resolved)) {
      continue
    }
    if (
      psExeHasParamAbbreviation(cmd, '-filepath', '-f') ||
      psExeHasParamAbbreviation(cmd, '-literalpath', '-l')
    ) {
      return {
        behavior: 'ask',
        message: `${cmd.name} -FilePath 执行了一个任意脚本文件`,
      }
    }
    // 位置绑定：`Start-Job script.ps1` 将位置 0 通过 FilePathParameterSet 解析绑定到 -FilePath
    //（ScriptBlock 参数将选择 ScriptBlockParameterSet）。与 checkForEachMemberName 的模式相同：
    // 任何非短横线 StringConstant 均可能是 -FilePath。过度标记（例如将 `Start-Job -Name foo` 中的
    // `foo` 也标记为潜在 -FilePath）属于故障安全。
    for (let i = 0; i < cmd.args.length; i++) {
      const argType = cmd.elementTypes?.[i + 1]
      const arg = cmd.args[i]
      if (argType === 'StringConstant' && arg && !arg.startsWith('-')) {
        return {
          behavior: 'ask',
          message: `${cmd.name} 使用了位置字符串参数，该参数将绑定到 -FilePath 并执行脚本文件`,
        }
      }
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 检查 ForEach-Object -MemberName。通过字符串名称在每个管道对象上调用方法——
 * 语义上等同于 `| % { $_.Method() }`，但 AST 树中没有任何 ScriptBlockAst 或
 * InvokeMemberExpressionAst。
 *
 * 概念验证：`Get-Process | ForEach-Object -MemberName Kill` → 终止所有进程。
 * checkScriptBlockInjection 会遗漏（无脚本块）；checkMemberInvocations 会遗漏
 * （无 .Method() 语法）。别名 `%` 和 `foreach` 通过 COMMON_ALIASES 解析。
 */
function checkForEachMemberName(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const lower = cmd.name.toLowerCase()
    const resolved = COMMON_ALIASES[lower]?.toLowerCase() ?? lower
    if (resolved !== 'foreach-object') {
      continue
    }
    // ForEach-Object 以 -m 开头的参数仅 -MemberName。-m 无歧义。
    if (psExeHasParamAbbreviation(cmd, '-membername', '-m')) {
      return {
        behavior: 'ask',
        message: 'ForEach-Object -MemberName 通过字符串名称调用方法，无法进行验证',
      }
    }
    // PS7+：`ForEach-Object Kill` 将位置字符串参数通过 MemberSet 参数集解析绑定到 -MemberName
    //（ScriptBlock 参数将选择 ScriptBlockSet）。扫描所有参数——`-Verbose Kill` 或
    // `-ErrorAction Stop Kill` 仍会将 Kill 作为位置参数绑定。任何非短横线 StringConstant 均可能是
    // -MemberName；过度标记属于故障安全。
    for (let i = 0; i < cmd.args.length; i++) {
      const argType = cmd.elementTypes?.[i + 1]
      const arg = cmd.args[i]
      if (argType === 'StringConstant' && arg && !arg.startsWith('-')) {
        return {
          behavior: 'ask',
          message: 'ForEach-Object 使用了位置字符串参数，该参数将绑定到 -MemberName 并通过名称调用方法',
        }
      }
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 检查危险的 Start-Process 模式。
 *
 * 两个向量：
 * 1. `-Verb RunAs` —— 权限提升（UAC 提示）。
 * 2. 启动 PowerShell 可执行文件 —— 嵌套调用。
 * `Start-Process pwsh -ArgumentList "-e <b64>"` 会绕过 checkEncodedCommand/checkPwshCommandOrFile，
 * 因为 cmd.name 是 `Start-Process` 而非 `pwsh`。`-e` 位于 -ArgumentList 字符串值内部，
 * 永远不会被解析为外部命令的参数。与其解析 -ArgumentList 的内容（脆弱——它可能是不透明的字符串或数组），
 * 不如标记任何目标为 PowerShell 可执行文件的 Start-Process：嵌套调用本质上是无法验证的。
 */
function checkStartProcess(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const lower = cmd.name.toLowerCase()
    if (lower !== 'start-process' && lower !== 'saps' && lower !== 'start') {
      continue
    }
    // 向量 1：-Verb RunAs（空格或冒号语法）。
    // 空格语法：psExeHasParamAbbreviation 找到 -Verb/-v，然后扫描参数中是否有裸的 'runas' token。
    if (
      psExeHasParamAbbreviation(cmd, '-Verb', '-v') &&
      cmd.args.some(a => a.toLowerCase() === 'runas')
    ) {
      return {
        behavior: 'ask',
        message: '命令请求了提升的权限',
      }
    }
    // 冒号语法 —— 两层检查：
    // (a) 结构检查：PR #23554 为冒号绑定的参数值添加了 children[]。
    //     children[i] = [{type, text}] 对应绑定的值。检查任何以 -v* 为前缀的参数是否有一个子节点，
    //     其文本规范化后（去除引号/反引号/空白）等于 'runas'。能防御正则表达式无法预见的任意引号形式。
    // (b) 正则回退：适用于无 children[] 的解析输出或作为纵深防御。
    //     由于引号/反引号会破坏匹配，此前仅匹配行尾的 /...:runas$/ 模式会遗漏 -Verb:'RunAs'、
    //     -Verb:"RunAs"、-Verb:`runas 等形式。
    if (cmd.children) {
      for (let i = 0; i < cmd.args.length; i++) {
        // 匹配参数名前先去除反引号（bug #14）：-V`erb:RunAs
        const argClean = cmd.args[i]!.replace(/`/g, '')
        if (!/^[-\u2013\u2014\u2015/]v[a-z]*:/i.test(argClean)) continue
        const kids = cmd.children[i]
        if (!kids) continue
        for (const child of kids) {
          if (child.text.replace(/['"`\s]/g, '').toLowerCase() === 'runas') {
            return {
              behavior: 'ask',
              message: '命令请求了提升的权限',
            }
          }
        }
      }
    }
    if (
      cmd.args.some(a => {
        // 匹配前先去除反引号（bug #14 / 审查 nit #2）
        const clean = a.replace(/`/g, '')
        return /^[-\u2013\u2014\u2015/]v[a-z]*:['"` ]*runas['"` ]*$/i.test(
          clean,
        )
      })
    ) {
      return {
        behavior: 'ask',
        message: '命令请求了提升的权限',
      }
    }
    // 向量 2：以 PowerShell 可执行文件为目标的 Start-Process。
    // 目标要么是第一个位置参数，要么是 -FilePath 后的值。扫描所有参数——出现的任何
    // PowerShell 可执行文件 token 均被视为启动目标。已知误报：以 pwsh/powershell 为基本名称的
    // 路径值参数（-WorkingDirectory、-RedirectStandard*）——isPowerShellExecutable 会从路径中提取基本名称，
    // 因此 `-WorkingDirectory C:\projects\pwsh` 也会触发。可接受的权衡：Start-Process 本身不在
    // CMDLET_ALLOWLIST 中（无论如何都会提示），结果仅是 ask 而非 reject，且正确解析 Start-Process
    // 的参数绑定较为脆弱。去除解析器可能保留的引号。
    for (const arg of cmd.args) {
      const stripped = arg.replace(/^['"]|['"]$/g, '')
      if (isPowerShellExecutable(stripped)) {
        return {
          behavior: 'ask',
          message: 'Start-Process 启动了一个嵌套的 PowerShell 进程，无法验证其行为',
        }
      }
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 脚本块被视为安全的 cmdlet（过滤/输出类 cmdlet）。
 * 传递给这些 cmdlet 的脚本块仅是谓词或投影，而非任意执行。
 */
const SAFE_SCRIPT_BLOCK_CMDLETS = new Set([
  'where-object',
  'sort-object',
  'select-object',
  'group-object',
  'format-table',
  'format-list',
  'format-wide',
  'format-custom',
  // 不包括 foreach-object —— 其脚本块是任意脚本，而非谓词。
  // getAllCommands 会递归，因此块内的命令仍会被检查，但非命令 AST 节点
  //（如 AssignmentStatementAst）对其不可见。参见 powershellPermissions.ts 的第 5 步 hasScriptBlocks 守卫。
])

/**
 * 检查脚本块注入模式，即脚本块出现在可能执行任意代码的可疑上下文中。
 *
 * 与安全的过滤/输出 cmdlet（Where-Object、Sort-Object、Select-Object、Group-Object）
 * 一起使用的脚本块是允许的。与危险 cmdlet（Invoke-Command、Invoke-Expression、
 * Start-Job 等）一起使用的脚本块将被标记。
 */
function checkScriptBlockInjection(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  const security = deriveSecurityFlags(parsed)
  if (!security.hasScriptBlocks) {
    return { behavior: 'passthrough' }
  }

  // 检查解析结果中的所有命令。若有命令位于危险集合中，则标记。
  // 若所有带脚本块的命令均位于安全集合（或白名单）中，则允许。
  for (const cmd of getAllCommands(parsed)) {
    const lower = cmd.name.toLowerCase()
    if (DANGEROUS_SCRIPT_BLOCK_CMDLETS.has(lower)) {
      return {
        behavior: 'ask',
        message: '命令包含脚本块，且使用了可能执行任意代码的危险 cmdlet',
      }
    }
  }

  // 检查是否所有命令要么是安全的脚本块消费者，要么不使用脚本块
  const allCommandsSafe = getAllCommands(parsed).every(cmd => {
    const lower = cmd.name.toLowerCase()
    // 安全的过滤/输出 cmdlet
    if (SAFE_SCRIPT_BLOCK_CMDLETS.has(lower)) {
      return true
    }
    // 解析别名
    const alias = COMMON_ALIASES[lower]
    if (alias && SAFE_SCRIPT_BLOCK_CMDLETS.has(alias.toLowerCase())) {
      return true
    }
    // 存在未知命令且包含脚本块——标记为潜在危险
    return false
  })

  if (allCommandsSafe) {
    return { behavior: 'passthrough' }
  }

  return {
    behavior: 'ask',
    message: '命令包含可能执行任意代码的脚本块',
  }
}

/**
 * 纯 AST 检查：检测子表达式 $()，该语法可隐藏命令执行。
 */
function checkSubExpressions(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (deriveSecurityFlags(parsed).hasSubExpressions) {
    return {
      behavior: 'ask',
      message: '命令包含子表达式 $()',
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 纯 AST 检查：检测包含内嵌表达式的可展开字符串（双引号），
 * 例如 "$env:PATH" 或 "$(dangerous-command)"。这些可在字符串字面量内部隐藏命令执行或变量插值。
 */
function checkExpandableStrings(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (deriveSecurityFlags(parsed).hasExpandableStrings) {
    return {
      behavior: 'ask',
      message: '命令包含带有内嵌表达式的可展开字符串',
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 纯 AST 检查：检测 splatting (@variable)，该语法可隐藏参数。
 */
function checkSplatting(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (deriveSecurityFlags(parsed).hasSplatting) {
    return {
      behavior: 'ask',
      message: '命令使用了 splatting (@variable)',
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 纯 AST 检查：检测停止解析标记 (--%)，该标记会阻止后续解析。
 */
function checkStopParsing(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (deriveSecurityFlags(parsed).hasStopParsing) {
    return {
      behavior: 'ask',
      message: '命令使用了停止解析标记 (--%)',
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 纯 AST 检查：检测 .NET 方法调用，该方法调用可访问系统 API。
 */
function checkMemberInvocations(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (deriveSecurityFlags(parsed).hasMemberInvocations) {
    return {
      behavior: 'ask',
      message: '命令调用了 .NET 方法',
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 纯 AST 检查：检测位于 Microsoft 受限语言模式白名单之外的类型字面量。
 * CLM 阻止所有 .NET 类型访问，仅允许微软认为对不受信代码安全的约 90 个基元/属性。
 * 我们信任该列表作为“安全”边界——任何超出此范围的类型（Reflection.Assembly、IO.Pipes、
 * Diagnostics.Process、InteropServices.Marshal 等）均可访问可能破坏权限模型的系统 API。
 *
 * 此检查在 checkMemberInvocations 之后运行：后者广泛标记任何 ::Method / .Method() 调用；
 * 本检查提供更具体的“使用了哪些类型”信号。两者均会在 [Reflection.Assembly]::Load 上触发；
 * CLM 给出更精确的消息。纯类型转换如 [int]$x 没有成员调用，仅会触发本检查。
 */
function checkTypeLiterals(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const t of parsed.typeLiterals ?? []) {
    if (!isClmAllowedType(t)) {
      return {
        behavior: 'ask',
        message: `命令使用了 .NET 类型 [${t}]，该类型不在受限语言模式白名单内`,
      }
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * Invoke-Item（别名 ii）使用默认处理程序打开文件（Windows 上的 ShellExecute，
 * Unix 上的 open/xdg-open）。对于 .exe/.ps1/.bat/.cmd 文件，这等同于远程代码执行。
 * Bug 008：ii 不在任何阻止列表中；透传提示未解释执行风险。始终询问——不存在安全变体
 * （即使打开 .txt 也可能调用接受参数的用户配置处理程序）。
 */
function checkInvokeItem(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const lower = cmd.name.toLowerCase()
    if (lower === 'invoke-item' || lower === 'ii') {
      return {
        behavior: 'ask',
        message: 'Invoke-Item 使用默认处理程序 (ShellExecute) 打开文件。对于可执行文件，这将运行任意代码。',
      }
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 计划任务持久化原语。Register-ScheduledJob 已被阻止 (DANGEROUS_SCRIPT_BLOCK_CMDLETS)；
 * 较新的 Register-ScheduledTask cmdlet 和传统 schtasks.exe /create 未被阻止。
 * 此类命令可创建跨会话持久化，且无解释性提示。
 */
const SCHEDULED_TASK_CMDLETS = new Set([
  'register-scheduledtask',
  'new-scheduledtask',
  'new-scheduledtaskaction',
  'set-scheduledtask',
])

function checkScheduledTask(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const lower = cmd.name.toLowerCase()
    if (SCHEDULED_TASK_CMDLETS.has(lower)) {
      return {
        behavior: 'ask',
        message: `${cmd.name} 创建或修改了计划任务（持久化原语）`,
      }
    }
    if (lower === 'schtasks' || lower === 'schtasks.exe') {
      if (
        cmd.args.some(a => {
          const la = a.toLowerCase()
          return (
            la === '/create' ||
            la === '/change' ||
            la === '-create' ||
            la === '-change'
          )
        })
      ) {
        return {
          behavior: 'ask',
          message: 'schtasks 使用了 create/change，将修改计划任务（持久化原语）',
        }
      }
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 纯 AST 检查：检测通过 Set-Item/New-Item 对 env: 作用域的环境变量操作。
 */
const ENV_WRITE_CMDLETS = new Set([
  'set-item',
  'si',
  'new-item',
  'ni',
  'remove-item',
  'ri',
  'del',
  'rm',
  'rd',
  'rmdir',
  'erase',
  'clear-item',
  'cli',
  'set-content',
  // 'sc' 被省略 —— 在 PS Core 7+ 上与 sc.exe 冲突，参见 COMMON_ALIASES 注释
  'add-content',
  'ac',
])

function checkEnvVarManipulation(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  const envVars = getVariablesByScope(parsed, 'env')
  if (envVars.length === 0) {
    return { behavior: 'passthrough' }
  }
  // 检查是否有命令属于写入 cmdlet
  for (const cmd of getAllCommands(parsed)) {
    if (ENV_WRITE_CMDLETS.has(cmd.name.toLowerCase())) {
      return {
        behavior: 'ask',
        message: '命令修改了环境变量',
      }
    }
  }
  // 同时标记涉及环境变量的赋值操作
  if (deriveSecurityFlags(parsed).hasAssignments && envVars.length > 0) {
    return {
      behavior: 'ask',
      message: '命令修改了环境变量',
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * 模块加载 cmdlet 会执行 .psm1 的顶层脚本主体 (Import-Module)，或从任意仓库下载
 * (Install-Module、Save-Module)。通配符允许规则如 `Import-Module:*` 将允许攻击者提供的
 * .psm1 以用户权限执行——风险等同于 Invoke-Expression。
 *
 * NEVER_SUGGEST (dangerousCmdlets.ts) 派生自此列表，因此界面绝不会将这些 cmdlet 作为通配符建议提供，
 * 但用户仍可手动编写允许规则。本检查确保权限引擎独立管控这些 cmdlet。
 */
function checkModuleLoading(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const lower = cmd.name.toLowerCase()
    if (MODULE_LOADING_CMDLETS.has(lower)) {
      return {
        behavior: 'ask',
        message: '命令加载、安装或下载了 PowerShell 模块或脚本，可能执行任意代码',
      }
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * Set-Alias/New-Alias 可劫持未来的命令解析：在 `Set-Alias Get-Content Invoke-Expression` 之后，
 * 任何后续的 `Get-Content $x` 都将执行任意代码。Set-Variable/New-Variable 可污染
 * `$PSDefaultParameterValues`（例如 `Set-Variable PSDefaultParameterValues @{'*:Path'='/etc/passwd'}`），
 * 从而改变每个后续 cmdlet 的行为。这两种效果均无法静态验证——我们需要追踪会话中所有未来的命令解析。
 * 始终询问。
 */
const RUNTIME_STATE_CMDLETS = new Set([
  'set-alias',
  'sal',
  'new-alias',
  'nal',
  'set-variable',
  'sv',
  'new-variable',
  'nv',
])

function checkRuntimeStateManipulation(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    // 去除模块限定符：`Microsoft.PowerShell.Utility\Set-Alias` → `set-alias`
    const raw = cmd.name.toLowerCase()
    const lower = raw.includes('\\')
      ? raw.slice(raw.lastIndexOf('\\') + 1)
      : raw
    if (RUNTIME_STATE_CMDLETS.has(lower)) {
      return {
        behavior: 'ask',
        message: '命令创建或修改了别名/变量，可能影响未来的命令解析',
      }
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * Invoke-WmiMethod / Invoke-CimMethod 是通过 WMI 实现 Start-Process 的等价物。
 * `Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList "cmd /c ..."`
 * 会生成任意进程，完全绕过 checkStartProcess。不存在狭义的安全用法——-Class 和 -MethodName
 * 接受任意字符串，因此仅针对 Win32_Process 进行管控会遗漏 -Class $x 或其他可生成进程的 WMI 类。
 * 任何调用均返回 ask。（安全发现 #34）
 */
const WMI_SPAWN_CMDLETS = new Set([
  'invoke-wmimethod',
  'iwmi',
  'invoke-cimmethod',
])

function checkWmiProcessSpawn(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const lower = cmd.name.toLowerCase()
    if (WMI_SPAWN_CMDLETS.has(lower)) {
      return {
        behavior: 'ask',
        message: `${cmd.name} 可通过 WMI/CIM (Win32_Process Create) 生成任意进程`,
      }
    }
  }
  return { behavior: 'passthrough' }
}

/**
 * PowerShell 安全验证的主入口点。
 * 根据已知的危险模式检查 PowerShell 命令。
 *
 * 所有检查均基于 AST。若 AST 解析失败 (parsed.valid === false)，
 * 则各独立检查均不会匹配，我们将返回 'ask' 作为安全默认值。
 *
 * @param _command - 待验证的 PowerShell 命令（未使用，保留以兼容 API）
 * @param parsed - PowerShell 原生解析器生成的解析后 AST（必需）
 * @returns 指示命令是否安全的安全结果
 */
export function powershellCommandIsSafe(
  _command: string,
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  // 若 AST 解析失败，无法确定安全性——询问用户
  if (!parsed.valid) {
    return {
      behavior: 'ask',
      message: '无法解析命令以进行安全分析',
    }
  }

  const validators = [
    checkInvokeExpression,
    checkDynamicCommandName,
    checkEncodedCommand,
    checkPwshCommandOrFile,
    checkDownloadCradles,
    checkDownloadUtilities,
    checkAddType,
    checkComObject,
    checkDangerousFilePathExecution,
    checkInvokeItem,
    checkScheduledTask,
    checkForEachMemberName,
    checkStartProcess,
    checkScriptBlockInjection,
    checkSubExpressions,
    checkExpandableStrings,
    checkSplatting,
    checkStopParsing,
    checkMemberInvocations,
    checkTypeLiterals,
    checkEnvVarManipulation,
    checkModuleLoading,
    checkRuntimeStateManipulation,
    checkWmiProcessSpawn,
  ]

  for (const validator of validators) {
    const result = validator(parsed)
    if (result.behavior === 'ask') {
      return result
    }
  }

  // 所有检查均通过
  return { behavior: 'passthrough' }
}