/**
 * PowerShell 权限模式验证模块。
 *
 * 根据当前权限模式检查命令是否应被自动允许。
 * 在 acceptEdits 模式下，修改文件系统的 PowerShell cmdlet 会被自动允许。
 * 遵循与 BashTool/modeValidation.ts 相同的模式。
 */

import type { ToolPermissionContext } from '../../Tool.js'
import type { PermissionResult } from '../../utils/permissions/PermissionResult.js'
import type { ParsedPowerShellCommand } from '../../utils/powershell/parser.js'
import {
  deriveSecurityFlags,
  getPipelineSegments,
  PS_TOKENIZER_DASH_CHARS,
} from '../../utils/powershell/parser.js'
import {
  argLeaksValue,
  isAllowlistedPipelineTail,
  isCwdChangingCmdlet,
  isSafeOutputCommand,
  resolveToCanonical,
} from './readOnlyValidation.js'

/**
 * 在 acceptEdits 模式下被自动允许的、修改文件系统的 cmdlet。
 * 以规范（小写）cmdlet 名称存储。
 *
 * 具有复杂参数绑定的第三梯队 cmdlet 已被移除——它们会落入“询问”流程。
 * 此处仅自动允许简单的写入类 cmdlet（首个位置参数为 -Path），
 * 并且它们会通过 pathValidation.ts 中的 CMDLET_PATH_CONFIG 接受路径验证。
 */
const ACCEPT_EDITS_ALLOWED_CMDLETS = new Set([
  'set-content',
  'add-content',
  'remove-item',
  'clear-content',
])

function isAcceptEditsAllowedCmdlet(name: string): boolean {
  // resolveToCanonical 通过 COMMON_ALIASES 处理别名，因此例如 'rm' → 'remove-item'，
  // 'ac' → 'add-content'。任何解析到允许的 cmdlet 的别名都会自动被允许。
  // 第三梯队 cmdlet（new-item、copy-item、move-item 等）及其别名
  //（mkdir、ni、cp、mv 等）会解析到不在此集合中的 cmdlet，并落入“询问”流程。
  const canonical = resolveToCanonical(name)
  return ACCEPT_EDITS_ALLOWED_CMDLETS.has(canonical)
}

/**
 * New-Item 的 -ItemType 值，用于创建文件系统链接（重解析点或硬链接）。
 * 这三者在运行时都会重定向路径解析——符号链接和交接点是目录/文件重解析点；
 * 硬链接则为文件的 inode 创建别名。其中任何一种都会导致后续的相对路径写入落在验证器视野之外。
 */
const LINK_ITEM_TYPES = new Set(['symboliclink', 'junction', 'hardlink'])

/**
 * 检查一个已转为小写并规范化了破折号的参数（已剥离冒号后的值）是否为
 * New-Item 的 -ItemType 或 -Type 参数的无歧义 PowerShell 缩写。
 * 最小前缀：`-it`（避免与其他 New-Item 参数混淆），`-ty`（避免 `-t` 与 `-Target` 冲突）。
 */
function isItemTypeParamAbbrev(p: string): boolean {
  return (
    (p.length >= 3 && '-itemtype'.startsWith(p)) ||
    (p.length >= 3 && '-type'.startsWith(p))
  )
}

/**
 * 检测创建文件系统链接的 New-Item 命令（-ItemType SymbolicLink / Junction / HardLink，
 * 或其别名 -Type）。链接会像 Set-Location/New-PSDrive 一样毒化后续的路径解析：
 * 通过该链接的相对路径会在运行时解析到链接目标，而非验证器所见的位置。
 * 发现编号 #18。
 *
 * 处理 PowerShell 参数缩写（`-it`、`-ite`……`-itemtype`；`-ty`、`-typ`、`-type`）、
 * Unicode 破折号前缀（短破折号/长破折号/水平线）以及冒号绑定值（`-it:Junction`）。
 */
export function isSymlinkCreatingCommand(cmd: {
  name: string
  args: string[]
}): boolean {
  const canonical = resolveToCanonical(cmd.name)
  if (canonical !== 'new-item') return false
  for (let i = 0; i < cmd.args.length; i++) {
    const raw = cmd.args[i] ?? ''
    if (raw.length === 0) continue
    // 将 Unicode 破折号前缀（–、—、―）和正斜杠（PS 5.1 的参数前缀）规范化为 ASCII `-`，
    // 以便前缀比较能够正常工作。PS 词法分析器将全部四种破折号字符及 `/` 视为参数标记。（bug #26）
    const normalized =
      PS_TOKENIZER_DASH_CHARS.has(raw[0]!) || raw[0] === '/'
        ? '-' + raw.slice(1)
        : raw
    const lower = normalized.toLowerCase()
    // 拆分冒号绑定值：-it:SymbolicLink → param='-it'，val='symboliclink'
    const colonIdx = lower.indexOf(':', 1)
    const paramRaw = colonIdx > 0 ? lower.slice(0, colonIdx) : lower
    // 剥离反引号转义：-Item`Type → -ItemType（bug #22）
    const param = paramRaw.replace(/`/g, '')
    if (!isItemTypeParamAbbrev(param)) continue
    const rawVal =
      colonIdx > 0
        ? lower.slice(colonIdx + 1)
        : (cmd.args[i + 1]?.toLowerCase() ?? '')
    // 剥离冒号绑定值中的反引号转义：-it:Sym`bolicLink → symboliclink
    // 与第 103 行的参数名剥离镜像。空格分隔的参数使用 .value（已由 .NET 解析器解析反引号），
    // 但冒号绑定的值使用 .text（原始源码）。剥离外围引号：-it:'SymbolicLink' 或 -it:"Junction"（bug #6）
    const val = rawVal.replace(/`/g, '').replace(/^['"]|['"]$/g, '')
    if (LINK_ITEM_TYPES.has(val)) return true
  }
  return false
}

/**
 * 根据当前权限模式检查命令是否应区别处理。
 *
 * 在 acceptEdits 模式下，自动允许修改文件系统的 PowerShell cmdlet。
 * 在检查白名单之前，使用 AST 解析别名。
 *
 * @param input - PowerShell 命令输入
 * @param parsed - 命令的解析后 AST
 * @param toolPermissionContext - 包含模式和权限的上下文
 * @returns
 * - 若当前模式允许自动批准，则返回 'allow'
 * - 若无可应用的模式特定处理，则返回 'passthrough'
 */
export function checkPermissionMode(
  input: { command: string },
  parsed: ParsedPowerShellCommand,
  toolPermissionContext: ToolPermissionContext,
): PermissionResult {
  // 跳过 bypass 和 dontAsk 模式（在其他地方处理）
  if (
    toolPermissionContext.mode === 'bypassPermissions' ||
    toolPermissionContext.mode === 'dontAsk'
  ) {
    return {
      behavior: 'passthrough',
      message: 'Mode is handled in main permission flow',
    }
  }

  if (toolPermissionContext.mode !== 'acceptEdits') {
    return {
      behavior: 'passthrough',
      message: 'No mode-specific validation required',
    }
  }

  // acceptEdits 模式：检查所有命令是否均为修改文件系统的 cmdlet
  if (!parsed.valid) {
    return {
      behavior: 'passthrough',
      message: '无法验证未解析命令的模式',
    }
  }

  // 安全性：检查是否存在可能用于通过 acceptEdits 模式夹带任意代码的子表达式、脚本块或成员调用。
  const securityFlags = deriveSecurityFlags(parsed)
  if (
    securityFlags.hasSubExpressions ||
    securityFlags.hasScriptBlocks ||
    securityFlags.hasMemberInvocations ||
    securityFlags.hasSplatting ||
    securityFlags.hasAssignments ||
    securityFlags.hasStopParsing ||
    securityFlags.hasExpandableStrings
  ) {
    return {
      behavior: 'passthrough',
      message:
        '命令包含需要批准的子表达式、脚本块或成员调用',
    }
  }

  const segments = getPipelineSegments(parsed)

  // 安全性：有效解析但空段落 = 无命令可供检查，不自动允许
  if (segments.length === 0) {
    return {
      behavior: 'passthrough',
      message: '未找到任何命令可用于 acceptEdits 模式的验证',
    }
  }

  // 安全性：复合命令的 cwd 不同步防护 —— 与 BashTool 对等。
  // 当复合命令中的任一语句包含 Set-Location/Push-Location/Pop-Location
  //（或其别名 cd、sl、chdir、pushd、popd）时，cwd 会在语句之间发生变化。
  // 路径验证会将相对路径相对于过时的进程 cwd 进行解析，因此后续语句中的写入 cmdlet
  // 所针对的目录与验证器检查的目录不同。
  // 示例：`Set-Location ./.claude; Set-Content ./settings.json '...'` —— 验证器
  // 将 ./settings.json 视为 /project/settings.json，但 PowerShell 实际写入的是
  // /project/.claude/settings.json。拒绝自动允许任何包含更改 cwd 命令的复合命令中的写入操作。
  // 这与 BashTool 的 compoundCommandHasCd 防护相匹配（BashTool/pathValidation.ts:630-655）。
  const totalCommands = segments.reduce(
    (sum, seg) => sum + seg.commands.length,
    0,
  )
  if (totalCommands > 1) {
    let hasCdCommand = false
    let hasSymlinkCreate = false
    let hasWriteCommand = false
    for (const seg of segments) {
      for (const cmd of seg.commands) {
        if (cmd.elementType !== 'CommandAst') continue
        if (isCwdChangingCmdlet(cmd.name)) hasCdCommand = true
        if (isSymlinkCreatingCommand(cmd)) hasSymlinkCreate = true
        if (isAcceptEditsAllowedCmdlet(cmd.name)) hasWriteCommand = true
      }
    }
    if (hasCdCommand && hasWriteCommand) {
      return {
        behavior: 'passthrough',
        message:
          '复合命令包含一个更改目录的命令（Set-Location/Push-Location/Pop-Location）和一个写入操作——由于路径验证使用过时的 cwd，无法自动允许',
      }
    }
    // 安全性：链接创建的复合命令防护（发现 #18）。镜像上方的 cd 防护。
    // `New-Item -ItemType SymbolicLink -Path ./link -Value /etc; Get-Content ./link/passwd`
    // —— 路径验证将 ./link/passwd 相对于 cwd 解析（验证时该链接不存在），
    // 但运行时却会跟随刚创建的链接指向 /etc/passwd。与 cwd 不同步具有相同的 TOCTOU 形态。
    // 适用于 SymbolicLink、Junction 和 HardLink —— 这三者在运行时均会重定向路径解析。
    // 无需 `hasWriteCommand` 要求：通过符号链接读取同样危险（例如通过 Get-Content ./link/etc/shadow 外泄数据），
    // 且在刚创建的链接之后使用路径的任何其他命令均无法验证。
    if (hasSymlinkCreate) {
      return {
        behavior: 'passthrough',
        message:
          '复合命令创建了一个文件系统链接（New-Item -ItemType SymbolicLink/Junction/HardLink）——由于路径验证无法追踪刚创建的链接，无法自动允许',
      }
    }
  }

  for (const segment of segments) {
    for (const cmd of segment.commands) {
      if (cmd.elementType !== 'CommandAst') {
        // 安全性：此防护在三种情况下起到关键支撑作用。切勿缩小其范围。
        //
        // 1. 表达式管道源（设计预期）：'/etc/passwd' | Remove-Item
        //    —— 字符串字面量是 CommandExpressionAst，管道传递的值会绑定到 -Path。
        //    我们无法静态知晓它代表什么路径。
        //
        // 2. 控制流语句（意外但被依赖）：
        //    foreach ($x in ...) { Remove-Item $x }。非 PipelineAst 语句
        //    会在 segment.commands 中生成一个合成的 CommandExpressionAst 条目
        //    （parser.ts 的 transformStatement）。若无此防护，位于 nestedCommands 中的
        //    Remove-Item $x 将在下方被检查并自动允许——但 $x 是一个我们无法验证的循环绑定变量。
        //
        // 3. 非 PipelineAst 重定向覆盖（意外）：cmd && cmd2 > /tmp
        //    同样会在此处产生一个合成元素。isReadOnlyCommand 也依赖于同一意外
        //    （其白名单会拒绝该合成元素的完整文本名称），因此两条路径会一同故障安全。
        return {
          behavior: 'passthrough',
          message: `管道包含无法静态验证的表达式源（${cmd.elementType}）`,
        }
      }
      // 安全性：nameType 是在 stripModulePrefix 之前根据原始名称计算得出的。
      // 'application' = 原始名称包含路径字符（. \\ /）。scripts\\Remove-Item 剥离后为
      // Remove-Item，本可匹配下方的 ACCEPT_EDITS_ALLOWED_CMDLETS，但 PowerShell 实际运行的是
      // scripts\\Remove-Item.ps1。与 isAllowlistedCommand 采用相同的关口。
      if (cmd.nameType === 'application') {
        return {
          behavior: 'passthrough',
          message: `命令 '${cmd.name}' 从一个类似路径的名称解析而来，需要批准`,
        }
      }
      // 安全性：elementTypes 白名单 —— 与 isAllowlistedCommand 相同。
      // 上方的 deriveSecurityFlags 检查了 hasSubExpressions 等，但并不会标记裸的 Variable/Other elementType。
      // `Remove-Item $env:PATH`：
      //   elementTypes = ['StringConstant', 'Variable']
      //   deriveSecurityFlags：无子表达式 → 通过
      //   checkPathConstraints：将字面文本 '$env:PATH' 解析为相对路径
      //     → cwd/$env:PATH → 位于 cwd 内部 → 允许
      //   运行时：PowerShell 展开 $env:PATH → 删除实际环境变量值所指向的路径
      // isAllowlistedCommand 会拒绝非 StringConstant/Parameter 的类型；此处是 acceptEdits 的对等关口。
      //
      // 同时检查冒号绑定的表达式元字符（与 isAllowlistedCommand 的冒号绑定检查相同）。
      // `Remove-Item -Path:(1 > /tmp/x)`：
      //   elementTypes = ['StringConstant', 'Parameter'] —— 通过上方的白名单
      //   deriveSecurityFlags：.Argument 中的 ParenExpressionAst 未被
      //     Get-SecurityPatterns 检测到（ParenExpressionAst 不在 FindAll 过滤器中）
      //   checkPathConstraints：字面文本 '-Path:(1 > /tmp/x)' 不是路径
      //   运行时：括号被求值，重定向写入 /tmp/x → 任意写入
      if (cmd.elementTypes) {
        for (let i = 1; i < cmd.elementTypes.length; i++) {
          const t = cmd.elementTypes[i]
          if (t !== 'StringConstant' && t !== 'Parameter') {
            return {
              behavior: 'passthrough',
              message: `命令参数具有无法验证的类型（${t}）——变量路径无法静态解析`,
            }
          }
          if (t === 'Parameter') {
            // elementTypes[i] ↔ args[i-1]（elementTypes[0] 是命令名称）。
            const arg = cmd.args[i - 1] ?? ''
            const colonIdx = arg.indexOf(':')
            if (colonIdx > 0 && /[$(@{[]/.test(arg.slice(colonIdx + 1))) {
              return {
                behavior: 'passthrough',
                message: '冒号绑定的参数包含无法静态验证的表达式',
              }
            }
          }
        }
      }
      // 安全输出 cmdlet（Out-Null 等）以及白名单中的管道尾部转换器（Format-*、Measure-Object、
      // Select-Object 等）不会影响前置命令的语义。跳过它们，以便像 `Remove-Item ./foo | Out-Null`
      // 或 `Set-Content ./foo hi | Format-Table` 这样的命令能够与裸的写入 cmdlet 一样自动允许。
      // isAllowlistedPipelineTail 是为从 SAFE_OUTPUT_CMDLETS 移至 CMDLET_ALLOWLIST 的 cmdlet
      // 提供的狭窄回退路径（argLeaksValue 会验证其参数）。
      if (
        isSafeOutputCommand(cmd.name) ||
        isAllowlistedPipelineTail(cmd, input.command)
      ) {
        continue
      }
      if (!isAcceptEditsAllowedCmdlet(cmd.name)) {
        return {
          behavior: 'passthrough',
          message: `在 acceptEdits 模式下没有针对 '${cmd.name}' 的模式特定处理`,
        }
      }
      // 安全性：拒绝包含无法归类参数类型的命令。'Other' 涵盖了 HashtableAst、
      // ConvertExpressionAst、BinaryExpressionAst —— 所有这些都可能包含嵌套的重定向或解析器无法完全分解的代码。
      // isAllowlistedCommand（readOnlyValidation.ts）已通过 argLeaksValue 强制执行此白名单；
      // 此处填补了 acceptEdits 模式中的同一漏洞。若无此项，作为 -Value 参数的
      // @{k='payload' > ~/.bashrc} 将会通过，因为 HashtableAst 映射为 'Other'。
      // argLeaksValue 也能捕获冒号绑定的变量（-Flag:$env:SECRET）。
      if (argLeaksValue(cmd.name, cmd)) {
        return {
          behavior: 'passthrough',
          message: `在 acceptEdits 模式下，'${cmd.name}' 中的参数无法静态验证`,
        }
      }
    }

    // 同时检查来自控制流语句的嵌套命令
    if (segment.nestedCommands) {
      for (const cmd of segment.nestedCommands) {
        if (cmd.elementType !== 'CommandAst') {
          // 安全性：与上方相同 —— 嵌套命令（控制流主体）中的非 CommandAst 元素无法作为路径源静态验证。
          return {
            behavior: 'passthrough',
            message: `嵌套的表达式元素（${cmd.elementType}）无法静态验证`,
          }
        }
        if (cmd.nameType === 'application') {
          return {
            behavior: 'passthrough',
            message: `嵌套命令 '${cmd.name}' 从一个类似路径的名称解析而来，需要批准`,
          }
        }
        if (
          isSafeOutputCommand(cmd.name) ||
          isAllowlistedPipelineTail(cmd, input.command)
        ) {
          continue
        }
        if (!isAcceptEditsAllowedCmdlet(cmd.name)) {
          return {
            behavior: 'passthrough',
            message: `在 acceptEdits 模式下没有针对嵌套命令 '${cmd.name}' 的模式特定处理`,
          }
        }
        // 安全性：与上方主命令循环相同的 argLeaksValue 检查。
        if (argLeaksValue(cmd.name, cmd)) {
          return {
            behavior: 'passthrough',
            message: `在 acceptEdits 模式下，嵌套命令 '${cmd.name}' 中的参数无法静态验证`,
          }
        }
      }
    }
  }

  // 所有命令均为修改文件系统的 cmdlet —— 自动允许
  return {
    behavior: 'allow',
    updatedInput: input,
    decisionReason: {
      type: 'mode',
      mode: 'acceptEdits',
    },
  }
}