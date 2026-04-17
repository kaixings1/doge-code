import { execa } from 'execa'
import { logForDebugging } from '../debug.js'
import { memoizeWithLRU } from '../memoize.js'
import { getCachedPowerShellPath } from '../shell/powershellDetection.js'
import { jsonParse } from '../slowOperations.js'

// ---------------------------------------------------------------------------
// 公开类型：描述返回给调用方的解析结果
// 对应 System.Management.Automation.Language 中的 AST 类
// 原始内部类型（RawParsedOutput 等）定义见后文
// ---------------------------------------------------------------------------

/**
 * PowerShell AST 中管道元素的类型
 * 对应 CommandBaseAst 的派生类
 */
type PipelineElementType =
  | 'CommandAst'
  | 'CommandExpressionAst'
  | 'ParenExpressionAst'

/**
 * 单个命令元素（参数、表达式）的 AST 节点类型
 * 用于在 AST 遍历过程中分类每个元素，以便 TypeScript 推导安全标志，无需额外调用 PowerShell 中的 Find-AstNodes
 */
type CommandElementType =
  | 'ScriptBlock'
  | 'SubExpression'
  | 'ExpandableString'
  | 'MemberInvocation'
  | 'Variable'
  | 'StringConstant'
  | 'Parameter'
  | 'Other'

/**
 * 命令元素的子节点（仅一级深度）。填充自 CommandParameterAst → .Argument（如 `-InputObject:$env:SECRET` 这种冒号绑定参数）
 * 消费方通过检查 `child.type` 来分类绑定值（Variable、StringConstant、Other），无需解析文本
 */
export type CommandElementChild = {
  type: CommandElementType
  text: string
}

/**
 * PowerShell AST 语句类型
 * 对应 StatementAst 的派生类
 */
type StatementType =
  | 'PipelineAst'
  | 'PipelineChainAst'
  | 'AssignmentStatementAst'
  | 'IfStatementAst'
  | 'ForStatementAst'
  | 'ForEachStatementAst'
  | 'WhileStatementAst'
  | 'DoWhileStatementAst'
  | 'DoUntilStatementAst'
  | 'SwitchStatementAst'
  | 'TryStatementAst'
  | 'TrapStatementAst'
  | 'FunctionDefinitionAst'
  | 'DataStatementAst'
  | 'UnknownStatementAst'

/**
 * 管道段内的命令调用
 */
export type ParsedCommandElement = {
  /** 命令/cmdlet 名称（如 "Get-ChildItem"、"git"） */
  name: string
  /** 命令名称类型：cmdlet、应用程序（exe）或未知 */
  nameType: 'cmdlet' | 'application' | 'unknown'
  /** PowerShell 解析器返回的 AST 元素类型 */
  elementType: PipelineElementType
  /** 所有参数字符串（包括 "-Recurse" 这类标志） */
  args: string[]
  /** 该命令元素的完整文本 */
  text: string
  /** 该命令中每个元素的 AST 节点类型（参数、表达式等） */
  elementTypes?: CommandElementType[]
  /**
   * 每个参数的子节点，与 `args[]` 对齐（即 `children[i]` ↔ `args[i]` ↔ `elementTypes[i+1]`）。
   * 仅为带冒号绑定参数的 Parameter 元素填充。未定义表示该元素无子节点。
   * 消费方可据此判断 `children[i].some(c => c.type !== 'StringConstant')`，而无需解析参数文本中的 `:` 和 `$`。
   */
  children?: (CommandElementChild[] | undefined)[]
  /** 该命令元素上的重定向（来自 && / || 链中的嵌套命令） */
  redirections?: ParsedRedirection[]
}

/**
 * 命令中发现的重定向
 */
type ParsedRedirection = {
  /** 重定向操作符 */
  operator: '>' | '>>' | '2>' | '2>>' | '*>' | '*>>' | '2>&1'
  /** 目标（文件路径或流编号） */
  target: string
  /** 是否为合并重定向（如 2>&1） */
  isMerging: boolean
}

/**
 * PowerShell 解析出的语句
 * 可以是管道、赋值、控制流语句等
 */
type ParsedStatement = {
  /** PowerShell 解析器给出的 AST 语句类型 */
  statementType: StatementType
  /** 该语句中的各个命令（针对管道） */
  commands: ParsedCommandElement[]
  /** 该语句上的重定向 */
  redirections: ParsedRedirection[]
  /** 语句完整文本 */
  text: string
  /**
   * 针对控制流语句（if、for、foreach、while、try 等），从主体块中递归找到的命令。
   * 使用 FindAll() 提取任意深度的所有嵌套 CommandAst 节点。
   */
  nestedCommands?: ParsedCommandElement[]
  /**
   * 通过在整个语句上调用 FindAll() 获得的安全相关 AST 模式，与语句类型无关。
   * 用于捕获 elementTypes 可能遗漏的模式（例如赋值语句内部的成员调用、非管道语句中的子表达式）。
   * 在 PS1 脚本中通过 instanceof 检查 PowerShell AST 类型系统计算得出。
   */
  securityPatterns?: {
    hasMemberInvocations?: boolean
    hasSubExpressions?: boolean
    hasExpandableStrings?: boolean
    hasScriptBlocks?: boolean
  }
}

/**
 * 命令中发现的变量引用
 */
type ParsedVariable = {
  /** 变量路径（如 "HOME"、"env:PATH"、"global:x"） */
  path: string
  /** 是否使用展开操作符（@var 而非 $var） */
  isSplatted: boolean
}

/**
 * PowerShell 解析器的解析错误
 */
type ParseError = {
  message: string
  errorId: string
}

/**
 * PowerShell AST 解析器的完整结果
 */
export type ParsedPowerShellCommand = {
  /** 命令是否成功解析（无语法错误） */
  valid: boolean
  /** 解析错误列表 */
  errors: ParseError[]
  /** 顶层语句，以分号或换行分隔 */
  statements: ParsedStatement[]
  /** 发现的所有变量引用 */
  variables: ParsedVariable[]
  /** token 流中是否包含停止解析标记（--%） */
  hasStopParsing: boolean
  /** 原始命令文本 */
  originalCommand: string
  /**
   * 在 AST 中任意位置发现的所有 .NET 类型字面量（TypeExpressionAst + TypeConstraintAst）。
   * 值为 TypeName.FullName —— 即所写的字面文本，而非解析后的 .NET 类型（例如 [int] → "int"，而非 "System.Int32"）。
   * 供 powershellSecurity.ts 中的 CLM 允许列表检查使用。
   */
  typeLiterals?: string[]
  /**
   * 命令是否包含 `using module` 或 `using assembly` 语句。
   * 这些语句会加载外部代码（模块/程序集）并执行其顶层脚本体或模块初始化器。
   * using 语句是 ScriptBlockAst 上命名块的同级节点，而非子节点，因此 Process-BlockStatements 及任何下游命令遍历器均不可见。
   */
  hasUsingStatements?: boolean
  /**
   * 命令是否包含 `#Requires` 指令（ScriptRequirements）。
   * `#Requires -Modules <name>` 会触发从 PSModulePath 加载模块。
   */
  hasScriptRequirements?: boolean
}

// ---------------------------------------------------------------------------

// 默认 5 秒适合交互式使用（pwsh 热启动约 450ms）。Windows CI 在 Defender/AMSI 负载下连续启动可能超过 5 秒，
// 即使 CAN_SPAWN_PARSE_SCRIPT() 已预热 JIT（运行 23574701241 windows-shard-5：攻击向量 F1 遇到 2×5s 超时 → valid:false → 降级为 'ask' 而非 'deny'）。
// 可通过环境变量覆盖用于测试。在 parsePowerShellCommandImpl 内部读取，而非顶层（遵循 CLAUDE.md 中关于 globalSettings.env 顺序的约定）。
const DEFAULT_PARSE_TIMEOUT_MS = 5_000
function getParseTimeoutMs(): number {
  const env = process.env.CLAUDE_CODE_PWSH_PARSE_TIMEOUT_MS
  if (env) {
    const parsed = parseInt(env, 10)
    if (!isNaN(parsed) && parsed > 0) return parsed
  }
  return DEFAULT_PARSE_TIMEOUT_MS
}
// MAX_COMMAND_LENGTH 根据后文定义的 PARSE_SCRIPT_BODY.length 计算得出，防止因脚本增长而失效。

/**
 * 内联为字符串常量的 PowerShell 解析脚本。
 * 避免运行时从磁盘读取（打包构建中文件可能不存在）。
 * 该脚本使用原生 PowerShell AST 解析器分析命令并输出结构化 JSON。
 */
// 描述 PS 脚本 JSON 输出的原始类型（供测试导出）
export type RawCommandElement = {
  type: string // .GetType().Name，如 "StringConstantExpressionAst"
  text: string // .Extent.Text
  value?: string // .Value（若可用，会解析反引号转义）
  expressionType?: string // 对于 CommandExpressionAst：.Expression.GetType().Name
  children?: { type: string; text: string }[] // CommandParameterAst.Argument，仅一级
}

export type RawRedirection = {
  type: string // "FileRedirectionAst" 或 "MergingRedirectionAst"
  append?: boolean // .Append（仅 FileRedirectionAst）
  fromStream?: string // .FromStream.ToString()，如 "Output"、"Error"、"All"
  locationText?: string // .Location.Extent.Text（仅 FileRedirectionAst）
}

export type RawPipelineElement = {
  type: string // .GetType().Name，如 "CommandAst"、"CommandExpressionAst"
  text: string // .Extent.Text
  commandElements?: RawCommandElement[]
  redirections?: RawRedirection[]
  expressionType?: string // 对于 CommandExpressionAst：.Expression.GetType().Name
}

export type RawStatement = {
  type: string // .GetType().Name，如 "PipelineAst"、"IfStatementAst"、"TrapStatementAst"
  text: string // .Extent.Text
  elements?: RawPipelineElement[] // 对于 PipelineAst：管道元素
  nestedCommands?: RawPipelineElement[] // 通过 FindAll 找到的命令（所有语句类型）
  redirections?: RawRedirection[] // 通过 FindAll 找到的 FileRedirectionAst（非 PipelineAst 专用）
  securityPatterns?: {
    // 通过语句上的 FindAll 找到的安全相关 AST 节点类型
    hasMemberInvocations?: boolean
    hasSubExpressions?: boolean
    hasExpandableStrings?: boolean
    hasScriptBlocks?: boolean
  }
}

type RawParsedOutput = {
  valid: boolean
  errors: { message: string; errorId: string }[]
  statements: RawStatement[]
  variables: { path: string; isSplatted: boolean }[]
  hasStopParsing: boolean
  originalCommand: string
  typeLiterals?: string[]
  hasUsingStatements?: boolean
  hasScriptRequirements?: boolean
}

// 这是解析脚本的规范副本。不存在单独的 .ps1 文件。
/**
 * 核心解析逻辑。
 * 命令通过 Base64 编码的 $EncodedCommand 变量传递，以避免 here-string 注入攻击。
 *
 * 安全性——顶层 ParamBlock：ScriptBlockAst.ParamBlock 是命名块（Begin/Process/End/Clean/DynamicParam）的同级节点，而非嵌套其中，
 * 因此 Process-BlockStatements 永远无法访问它。param() 默认值表达式和特性参数（如 [ValidateScript({...})]）中的命令对所有下游检查均不可见。PoC：
 *   param($x = (Remove-Item /)); Get-Process   → 仅 Get-Process 出现
 *   param([ValidateScript({rm /;$true})]$x='t') → rm 不可见，但在绑定时执行
 * 函数级别的 param() 已被覆盖：对 FunctionDefinitionAst 语句的 FindAll 会递归其子节点。唯一的缺口是脚本级 ParamBlock。
 * ParamBlockAst 具有 .Parameters（而非 .Statements），因此我们直接在其上调用 FindAll，而非复用 Process-BlockStatements。
 * 仅在存在可报告内容时才生成语句，以避免对纯 param($x) 声明产生噪音。（为节省 argv 预算，脚本内部保持精简。）
 */
/**
 * PS1 解析脚本。注释在此处而非内联 —— 反引号内的每个字符都会消耗 WINDOWS_MAX_COMMAND_LENGTH（argv 预算）。
 *
 * 结构：
 * - Get-RawCommandElements：提取 CommandAst 元素数据（type、text、value、expressionType，以及冒号绑定参数的 .Argument 子节点）
 * - Get-RawRedirections：提取 FileRedirectionAst 的操作符与目标
 * - Get-SecurityPatterns：通过 FindAll 获取安全标志（通过 Sub/Array/ParenExpressionAst 检测 hasSubExpressions、hasScriptBlocks 等）
 * - 类型字面量：输出 TypeExpressionAst 名称供 CLM 允许列表检查
 * - --% 令牌：PS7 为 MinusMinus，PS5.1 为 Generic 类型
 * - CommandExpressionAst.Redirections：继承自 CommandBaseAst —— `1 > /tmp/x` 语句包含 FileRedirectionAst，元素迭代会遗漏
 * - 嵌套命令：对所有语句类型（if/for/foreach/while/switch/try/function/assignment/PipelineChainAst）调用 FindAll —— 跳过已在循环中的直接管道元素
 */
// 供测试导出
export const PARSE_SCRIPT_BODY = `
if (-not $EncodedCommand) {
    Write-Output '{"valid":false,"errors":[{"message":"未提供命令","errorId":"NoInput"}],"statements":[],"variables":[],"hasStopParsing":false,"originalCommand":""}'
    exit 0
}

$Command = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($EncodedCommand))

$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput(
    $Command,
    [ref]$tokens,
    [ref]$parseErrors
)

$allVariables = [System.Collections.ArrayList]::new()

function Get-RawCommandElements {
    param([System.Management.Automation.Language.CommandAst]$CmdAst)
    $elems = [System.Collections.ArrayList]::new()
    foreach ($ce in $CmdAst.CommandElements) {
        $ceData = @{ type = $ce.GetType().Name; text = $ce.Extent.Text }
        if ($ce.PSObject.Properties['Value'] -and $null -ne $ce.Value -and $ce.Value -is [string]) {
            $ceData.value = $ce.Value
        }
        if ($ce -is [System.Management.Automation.Language.CommandExpressionAst]) {
            $ceData.expressionType = $ce.Expression.GetType().Name
        }
        $a=$ce.Argument;if($a){$ceData.children=@(@{type=$a.GetType().Name;text=$a.Extent.Text})}
        [void]$elems.Add($ceData)
    }
    return $elems
}

function Get-RawRedirections {
    param($Redirections)
    $result = [System.Collections.ArrayList]::new()
    foreach ($redir in $Redirections) {
        $redirData = @{ type = $redir.GetType().Name }
        if ($redir -is [System.Management.Automation.Language.FileRedirectionAst]) {
            $redirData.append = [bool]$redir.Append
            $redirData.fromStream = $redir.FromStream.ToString()
            $redirData.locationText = $redir.Location.Extent.Text
        }
        [void]$result.Add($redirData)
    }
    return $result
}

function Get-SecurityPatterns($A) {
    $p = @{}
    foreach ($n in $A.FindAll({ param($x)
        $x -is [System.Management.Automation.Language.MemberExpressionAst] -or
        $x -is [System.Management.Automation.Language.SubExpressionAst] -or
        $x -is [System.Management.Automation.Language.ArrayExpressionAst] -or
        $x -is [System.Management.Automation.Language.ExpandableStringExpressionAst] -or
        $x -is [System.Management.Automation.Language.ScriptBlockExpressionAst] -or
        $x -is [System.Management.Automation.Language.ParenExpressionAst]
    }, $true)) { switch ($n.GetType().Name) {
        'InvokeMemberExpressionAst' { $p.hasMemberInvocations = $true }
        'MemberExpressionAst' { $p.hasMemberInvocations = $true }
        'SubExpressionAst' { $p.hasSubExpressions = $true }
        'ArrayExpressionAst' { $p.hasSubExpressions = $true }
        'ParenExpressionAst' { $p.hasSubExpressions = $true }
        'ExpandableStringExpressionAst' { $p.hasExpandableStrings = $true }
        'ScriptBlockExpressionAst' { $p.hasScriptBlocks = $true }
    }}
    if ($p.Count -gt 0) { return $p }
    return $null
}

$varExprs = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.VariableExpressionAst] }, $true)
foreach ($v in $varExprs) {
    [void]$allVariables.Add(@{
        path = $v.VariablePath.ToString()
        isSplatted = [bool]$v.Splatted
    })
}

$typeLiterals = [System.Collections.ArrayList]::new()
foreach ($t in $ast.FindAll({ param($n)
    $n -is [System.Management.Automation.Language.TypeExpressionAst] -or
    $n -is [System.Management.Automation.Language.TypeConstraintAst]
}, $true)) { [void]$typeLiterals.Add($t.TypeName.FullName) }

$hasStopParsing = $false
$tk = [System.Management.Automation.Language.TokenKind]
foreach ($tok in $tokens) {
    if ($tok.Kind -eq $tk::MinusMinus) { $hasStopParsing = $true; break }
    if ($tok.Kind -eq $tk::Generic -and ($tok.Text -replace '[\u2013\u2014\u2015]','-') -eq '--%') {
        $hasStopParsing = $true; break
    }
}

$statements = [System.Collections.ArrayList]::new()

function Process-BlockStatements {
    param($Block)
    if (-not $Block) { return }

    foreach ($stmt in $Block.Statements) {
        $statement = @{
            type = $stmt.GetType().Name
            text = $stmt.Extent.Text
        }

        if ($stmt -is [System.Management.Automation.Language.PipelineAst]) {
            $elements = [System.Collections.ArrayList]::new()
            foreach ($element in $stmt.PipelineElements) {
                $elemData = @{
                    type = $element.GetType().Name
                    text = $element.Extent.Text
                }

                if ($element -is [System.Management.Automation.Language.CommandAst]) {
                    $elemData.commandElements = @(Get-RawCommandElements -CmdAst $element)
                    $elemData.redirections = @(Get-RawRedirections -Redirections $element.Redirections)
                } elseif ($element -is [System.Management.Automation.Language.CommandExpressionAst]) {
                    $elemData.expressionType = $element.Expression.GetType().Name
                    $elemData.redirections = @(Get-RawRedirections -Redirections $element.Redirections)
                }

                [void]$elements.Add($elemData)
            }
            $statement.elements = @($elements)

            $allNestedCmds = $stmt.FindAll(
                { param($node) $node -is [System.Management.Automation.Language.CommandAst] },
                $true
            )
            $nestedCmds = [System.Collections.ArrayList]::new()
            foreach ($cmd in $allNestedCmds) {
                if ($cmd.Parent -eq $stmt) { continue }
                $nested = @{
                    type = $cmd.GetType().Name
                    text = $cmd.Extent.Text
                    commandElements = @(Get-RawCommandElements -CmdAst $cmd)
                    redirections = @(Get-RawRedirections -Redirections $cmd.Redirections)
                }
                [void]$nestedCmds.Add($nested)
            }
            if ($nestedCmds.Count -gt 0) {
                $statement.nestedCommands = @($nestedCmds)
            }
            $r = $stmt.FindAll({param($n) $n -is [System.Management.Automation.Language.FileRedirectionAst]}, $true)
            if ($r.Count -gt 0) {
                $rr = @(Get-RawRedirections -Redirections $r)
                $statement.redirections = if ($statement.redirections) { @($statement.redirections) + $rr } else { $rr }
            }
        } else {
            $nestedCmdAsts = $stmt.FindAll(
                { param($node) $node -is [System.Management.Automation.Language.CommandAst] },
                $true
            )
            $nested = [System.Collections.ArrayList]::new()
            foreach ($cmd in $nestedCmdAsts) {
                [void]$nested.Add(@{
                    type = 'CommandAst'
                    text = $cmd.Extent.Text
                    commandElements = @(Get-RawCommandElements -CmdAst $cmd)
                    redirections = @(Get-RawRedirections -Redirections $cmd.Redirections)
                })
            }
            if ($nested.Count -gt 0) {
                $statement.nestedCommands = @($nested)
            }
            $r = $stmt.FindAll({param($n) $n -is [System.Management.Automation.Language.FileRedirectionAst]}, $true)
            if ($r.Count -gt 0) { $statement.redirections = @(Get-RawRedirections -Redirections $r) }
        }

        $sp = Get-SecurityPatterns $stmt
        if ($sp) { $statement.securityPatterns = $sp }

        [void]$statements.Add($statement)
    }

    if ($Block.Traps) {
        foreach ($trap in $Block.Traps) {
            $statement = @{
                type = 'TrapStatementAst'
                text = $trap.Extent.Text
            }
            $nestedCmdAsts = $trap.FindAll(
                { param($node) $node -is [System.Management.Automation.Language.CommandAst] },
                $true
            )
            $nestedCmds = [System.Collections.ArrayList]::new()
            foreach ($cmd in $nestedCmdAsts) {
                $nested = @{
                    type = $cmd.GetType().Name
                    text = $cmd.Extent.Text
                    commandElements = @(Get-RawCommandElements -CmdAst $cmd)
                    redirections = @(Get-RawRedirections -Redirections $cmd.Redirections)
                }
                [void]$nestedCmds.Add($nested)
            }
            if ($nestedCmds.Count -gt 0) {
                $statement.nestedCommands = @($nestedCmds)
            }
            $r = $trap.FindAll({param($n) $n -is [System.Management.Automation.Language.FileRedirectionAst]}, $true)
            if ($r.Count -gt 0) { $statement.redirections = @(Get-RawRedirections -Redirections $r) }
            $sp = Get-SecurityPatterns $trap
            if ($sp) { $statement.securityPatterns = $sp }
            [void]$statements.Add($statement)
        }
    }
}

Process-BlockStatements -Block $ast.BeginBlock
Process-BlockStatements -Block $ast.ProcessBlock
Process-BlockStatements -Block $ast.EndBlock
Process-BlockStatements -Block $ast.CleanBlock
Process-BlockStatements -Block $ast.DynamicParamBlock

if ($ast.ParamBlock) {
  $pb = $ast.ParamBlock
  $pn = [System.Collections.ArrayList]::new()
  foreach ($c in $pb.FindAll({param($n) $n -is [System.Management.Automation.Language.CommandAst]}, $true)) {
    [void]$pn.Add(@{type='CommandAst';text=$c.Extent.Text;commandElements=@(Get-RawCommandElements -CmdAst $c);redirections=@(Get-RawRedirections -Redirections $c.Redirections)})
  }
  $pr = $pb.FindAll({param($n) $n -is [System.Management.Automation.Language.FileRedirectionAst]}, $true)
  $ps = Get-SecurityPatterns $pb
  if ($pn.Count -gt 0 -or $pr.Count -gt 0 -or $ps) {
    $st = @{type='ParamBlockAst';text=$pb.Extent.Text}
    if ($pn.Count -gt 0) { $st.nestedCommands = @($pn) }
    if ($pr.Count -gt 0) { $st.redirections = @(Get-RawRedirections -Redirections $pr) }
    if ($ps) { $st.securityPatterns = $ps }
    [void]$statements.Add($st)
  }
}

$hasUsingStatements = $ast.UsingStatements -and $ast.UsingStatements.Count -gt 0
$hasScriptRequirements = $ast.ScriptRequirements -ne $null

$output = @{
    valid = ($parseErrors.Count -eq 0)
    errors = @($parseErrors | ForEach-Object {
        @{
            message = $_.Message
            errorId = $_.ErrorId
        }
    })
    statements = @($statements)
    variables = @($allVariables)
    hasStopParsing = $hasStopParsing
    originalCommand = $Command
    typeLiterals = @($typeLiterals)
    hasUsingStatements = [bool]$hasUsingStatements
    hasScriptRequirements = [bool]$hasScriptRequirements
}

$output | ConvertTo-Json -Depth 10 -Compress
`

// ---------------------------------------------------------------------------
// Windows CreateProcess 命令行长度限制为 32,767 字符。编码链如下：
//   命令（N 个 UTF-8 字节）→ Base64（约 4N/3 字符）→ $EncodedCommand = '...'\n
//   → 完整脚本（包装 + PARSE_SCRIPT_BODY）→ UTF-16LE（2 倍字节）
//   → Base64（4/3 倍字符）→ -EncodedCommand 参数
// 最终命令行 ≈ argv 开销 + （包装 + 4N/3 + body）× 8/3
//
// 在 32,767 上限下求解 N（UTF-8 字节数）：
//   脚本预算   = (32767 - argv 开销) × 3/8
//   命令 b64 预算  = 脚本预算 - PARSE_SCRIPT_BODY.length - 包装长度
//   N               = 命令 b64 预算 × 3/4 - 安全余量
//
// 安全性：N 是 UTF-8 字节预算，而非 UTF-16 码元预算。长度门限必须测量 Buffer.byteLength(command, 'utf8')，而非 command.length。
// BMP 字符 U+0800–U+FFFF（CJK 表意文字、多数非拉丁文字）占 1 个 UTF-16 码元但 3 个 UTF-8 字节。
// PARSE_SCRIPT_BODY 约 10.6K，N ≈ 1,092 字节。若用 .length 判断，1,092 码元的纯 CJK 命令（约 3,276 UTF-8 字节）→ 内部 base64 约 4,368 字符 → 最终 argv 约 40K 字符，超出 32,767 约 7.4K。
// CreateProcess 失败 → valid:false → 解析失败降级（拒绝规则静默降级为询问）。见 Issue #36。
//
// 由 PARSE_SCRIPT_BODY.length 计算得出，防止偏移。之前的硬编码值（4,500）基于约 6K 脚本体估算；实际脚本体约 11K 字符，真实上限约为 1,850。
// 1,850–4,500 范围内的命令通过此门限，但在 Windows 上 CreateProcess 失败，返回 valid=false 并跳过所有基于 AST 的安全检查。
//
// Unix 的 argv 限制通常为 2MB+（ARG_MAX），Linux 上单个参数限制约 128KB（MAX_ARG_STRLEN，macOS 无低于 ARG_MAX 的单参数限制）。
// 在 MAX=4,500 时 -EncodedCommand 参数约 45KB —— 远低于两者。在 Unix 上应用 Windows 派生的限制会导致回归：
// 约 1K–4.5K 范围的命令之前可成功解析并进入 powershellPermissions.ts 的子命令拒绝循环；在生成进程前拒绝会将用户配置的拒绝规则从 deny 降级为 ask，
// 尤其当拒绝的 cmdlet 位于脚本中间时。因此 Windows 限制是平台相关的。
//
// 若 Windows 限制过严，可切换为对大型输入使用 -File 和临时文件。
// ---------------------------------------------------------------------------
const WINDOWS_ARGV_CAP = 32_767
// pwsh 路径 + " -NoProfile -NonInteractive -NoLogo -EncodedCommand " + argv 引号。
// Windows 上长 pwsh 路径（C:\Program Files\PowerShell\7\pwsh.exe）+ 标志约 95 字符；200 留有余量应对特殊安装。
const FIXED_ARGV_OVERHEAD = 200
// 用户命令 base64 外层的 "$EncodedCommand = '" + "'\n" 包装
const ENCODED_CMD_WRAPPER = `$EncodedCommand = ''\n`.length
// 两层 base64 填充舍入余量（每层 ≤4 字符）及小幅估算漂移。多字节扩展不在此处吸收——门限测量实际 UTF-8 字节数（Buffer.byteLength），而非码元数。
const SAFETY_MARGIN = 100
const SCRIPT_CHARS_BUDGET = ((WINDOWS_ARGV_CAP - FIXED_ARGV_OVERHEAD) * 3) / 8
const CMD_B64_BUDGET =
  SCRIPT_CHARS_BUDGET - PARSE_SCRIPT_BODY.length - ENCODED_CMD_WRAPPER
// 供漂移防护测试导出（易漂移的值是 Windows 相关的）。
// 单位：UTF-8 字节。应与 Buffer.byteLength 比较，而非 .length。
export const WINDOWS_MAX_COMMAND_LENGTH = Math.max(
  0,
  Math.floor((CMD_B64_BUDGET * 3) / 4) - SAFETY_MARGIN,
)
// 沿用旧值，已知在 Unix 上工作。参见上文关于为何此处不能应用 Windows 推导的注释。
// 单位：UTF-8 字节 —— 对于常见 ASCII 命令，字节数等于字符数，无回归；对于多字节命令稍紧，但仍远低于 Unix ARG_MAX（单参数约 128KB），argv 生成不会溢出。
const UNIX_MAX_COMMAND_LENGTH = 4_500
// 单位：UTF-8 字节（见上文安全性说明）。
export const MAX_COMMAND_LENGTH =
  process.platform === 'win32'
    ? WINDOWS_MAX_COMMAND_LENGTH
    : UNIX_MAX_COMMAND_LENGTH

const INVALID_RESULT_BASE: Omit<
  ParsedPowerShellCommand,
  'errors' | 'originalCommand'
> = {
  valid: false,
  statements: [],
  variables: [],
  hasStopParsing: false,
}

function makeInvalidResult(
  command: string,
  message: string,
  errorId: string,
): ParsedPowerShellCommand {
  return {
    ...INVALID_RESULT_BASE,
    errors: [{ message, errorId }],
    originalCommand: command,
  }
}

/**
 * 将字符串编码为 UTF-16LE 的 Base64，这是 PowerShell -EncodedCommand 参数要求的编码格式。
 */
function toUtf16LeBase64(text: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(text, 'utf16le').toString('base64')
  }
  // 非 Node 环境的回退
  const bytes: number[] = []
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    bytes.push(code & 0xff, (code >> 8) & 0xff)
  }
  return btoa(bytes.map(b => String.fromCharCode(b)).join(''))
}

/**
 * 构建用于解析命令的完整 PowerShell 脚本。
 * 用户命令以 Base64（UTF-8）编码并嵌入变量，防止注入攻击。
 */
function buildParseScript(command: string): string {
  const encoded =
    typeof Buffer !== 'undefined'
      ? Buffer.from(command, 'utf8').toString('base64')
      : btoa(
          new TextEncoder()
            .encode(command)
            .reduce((s, b) => s + String.fromCharCode(b), ''),
        )
  return `$EncodedCommand = '${encoded}'\n${PARSE_SCRIPT_BODY}`
}

/**
 * 确保值为数组。PowerShell 5.1 的 ConvertTo-Json 可能将单元素数组展开为普通对象。
 */
function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}

/** 将原始 .NET AST 类型名映射到 StatementType 联合类型 */
// 供测试导出
export function mapStatementType(rawType: string): StatementType {
  switch (rawType) {
    case 'PipelineAst':
      return 'PipelineAst'
    case 'PipelineChainAst':
      return 'PipelineChainAst'
    case 'AssignmentStatementAst':
      return 'AssignmentStatementAst'
    case 'IfStatementAst':
      return 'IfStatementAst'
    case 'ForStatementAst':
      return 'ForStatementAst'
    case 'ForEachStatementAst':
      return 'ForEachStatementAst'
    case 'WhileStatementAst':
      return 'WhileStatementAst'
    case 'DoWhileStatementAst':
      return 'DoWhileStatementAst'
    case 'DoUntilStatementAst':
      return 'DoUntilStatementAst'
    case 'SwitchStatementAst':
      return 'SwitchStatementAst'
    case 'TryStatementAst':
      return 'TryStatementAst'
    case 'TrapStatementAst':
      return 'TrapStatementAst'
    case 'FunctionDefinitionAst':
      return 'FunctionDefinitionAst'
    case 'DataStatementAst':
      return 'DataStatementAst'
    default:
      return 'UnknownStatementAst'
  }
}

/** 将原始 .NET AST 类型名映射到 CommandElementType 联合类型 */
// 供测试导出
export function mapElementType(
  rawType: string,
  expressionType?: string,
): CommandElementType {
  switch (rawType) {
    case 'ScriptBlockExpressionAst':
      return 'ScriptBlock'
    case 'SubExpressionAst':
    case 'ArrayExpressionAst':
      // 安全性：ArrayExpressionAst (@()) 是 SubExpressionAst 的同级节点，而非子类。两者均可评估带副作用的任意管道：
      // Get-ChildItem @(Remove-Item ./data) 会在 @() 内部执行 Remove-Item。
      // 将二者映射为 SubExpression，使得 hasSubExpressions 触发，且 isReadOnlyCommand 拒绝（它不检查 nestedCommands，只检查 pipeline.commands[]）。
      return 'SubExpression'
    case 'ExpandableStringExpressionAst':
      return 'ExpandableString'
    case 'InvokeMemberExpressionAst':
    case 'MemberExpressionAst':
      return 'MemberInvocation'
    case 'VariableExpressionAst':
      return 'Variable'
    case 'StringConstantExpressionAst':
    case 'ConstantExpressionAst':
      // ConstantExpressionAst 涵盖数字字面量（5, 3.14）。就权限而言，数字字面量与字符串字面量一样安全——是惰性值而非代码。
      // 若无此映射，`-Seconds:5` 会生成 children[0].type='Other'，消费方检查 `children.some(c => c.type !== 'StringConstant')` 时会对无害的数字参数产生误报询问。
      return 'StringConstant'
    case 'CommandParameterAst':
      return 'Parameter'
    case 'ParenExpressionAst':
      return 'SubExpression'
    case 'CommandExpressionAst':
      // 委托给被包装的表达式类型，以便捕获 SubExpressionAst、ExpandableStringExpressionAst、ScriptBlockExpressionAst 等，而无需维护手动列表。
      // 若内部类型无法识别，则降级为 'Other'。
      if (expressionType) {
        return mapElementType(expressionType)
      }
      return 'Other'
    default:
      return 'Other'
  }
}

/** 将命令名称分类为 cmdlet、应用程序或未知 */
// 供测试导出
export function classifyCommandName(
  name: string,
): 'cmdlet' | 'application' | 'unknown' {
  if (/^[A-Za-z]+-[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
    return 'cmdlet'
  }
  if (/[.\\/]/.test(name)) {
    return 'application'
  }
  return 'unknown'
}

/** 从命令名中剥离模块前缀（如 "Microsoft.PowerShell.Utility\\Invoke-Expression" -> "Invoke-Expression"） */
// 供测试导出
export function stripModulePrefix(name: string): string {
  const idx = name.lastIndexOf('\\')
  if (idx < 0) return name
  // 不剥离文件路径：驱动器号（C:\...）、UNC 路径（\\server\...）或相对路径（.\, ..\）
  if (
    /^[A-Za-z]:/.test(name) ||
    name.startsWith('\\\\') ||
    name.startsWith('.\\') ||
    name.startsWith('..\\')
  )
    return name
  return name.substring(idx + 1)
}

/** 将原始 CommandAst 管道元素转换为 ParsedCommandElement */
// 供测试导出
export function transformCommandAst(
  raw: RawPipelineElement,
): ParsedCommandElement {
  const cmdElements = ensureArray(raw.commandElements)
  let name = ''
  const args: string[] = []
  const elementTypes: CommandElementType[] = []
  const children: (CommandElementChild[] | undefined)[] = []
  let hasChildren = false

  // 安全性：nameType 必须基于原始名称（剥离模块前缀之前）计算。classifyCommandName('scripts\\Get-Process') 返回 'application'（包含 \）—— 正确，因为 PowerShell 将其解析为文件路径。
  // 剥离后变为 'Get-Process'，被分类为 'cmdlet' —— 错误，且允许列表检查会信任它。自动允许路径会通过 nameType !== 'application' 检查来捕获。
  // name（剥离后）仍用于拒绝规则匹配的对称性，这是安全的：拒绝规则会过度匹配（Module\\Remove-Item 仍会命中 Remove-Item 拒绝项），允许规则则单独受 nameType 限制。
  let nameType: 'cmdlet' | 'application' | 'unknown' = 'unknown'
  if (cmdElements.length > 0) {
    const first = cmdElements[0]!
    // 安全性：仅当元素类型为字符串字面量且其 .value 为字符串时才信任 .value。数字 ConstantExpressionAst（如 `& 1`）会输出整数 .value，导致 stripModulePrefix() 崩溃 → 解析器回退至透传。对于非字符串字面量或非字符串 .value，使用 .text。
    const isFirstStringLiteral =
      first.type === 'StringConstantExpressionAst' ||
      first.type === 'ExpandableStringExpressionAst'
    const rawNameUnstripped =
      isFirstStringLiteral && typeof first.value === 'string'
        ? first.value
        : first.text
    // 安全性：剥离命令名周围的引号。当 .value 不可用时（原始节点上无 StaticType），.text 保留引号 —— `& 'Invoke-Expression' 'x'` 产生 "'Invoke-Expression'"。在源头剥离意味着每个下游 reader（deny-rule 匹配、GIT_SAFETY_WRITE_CMDLETS 查找、resolveToCanonical 等）看到的都是裸 cmdlet 名。若 .value 已剥离则无操作。
    const rawName = rawNameUnstripped.replace(/^['"]|['"]$/g, '')
    // 安全性：PowerShell 内置 cmdlet 名均为 ASCII。cmdlet 位置的非 ASCII 字符本质上可疑 —— .NET OrdinalIgnoreCase 根据 UnicodeData.txt SimpleUppercaseMapping 将 U+017F (ſ) 折叠为 S、U+0131 (ı) 折叠为 I，
    // 因此 PowerShell 运行时将 `ſtart-proceſſ` 解析为 Start-Process。JS .toLowerCase() 不会折叠这些字符（ſ 本为小写），因此下游每个名称比较（NEVER_SUGGEST、deny-rule strEquals、resolveToCanonical、security validators）均会遗漏。强制设为 'application' 以通过 nameType !== 'application' 检查阻断自动允许。Issue #31。
    // 已在 Windows 上验证（pwsh 7.x，2026-03）：ſtart-proceſſ 无法解析。保留作为纵深防御，应对未来 .NET/PS 行为变化或模块提供的命令解析钩子。
    if (/[\u0080-\uFFFF]/.test(rawName)) {
      nameType = 'application'
    } else {
      nameType = classifyCommandName(rawName)
    }
    name = stripModulePrefix(rawName)
    elementTypes.push(mapElementType(first.type, first.expressionType))

    for (let i = 1; i < cmdElements.length; i++) {
      const ce = cmdElements[i]!
      // 对字符串常量使用解析后的 .value（剥离引号，解析反引号转义如 `n -> 换行），但对参数保留原始 .text（.value 会丢失连字符前缀，如 '-Path' -> 'Path'）、变量及其他非字符串类型。
      const isStringLiteral =
        ce.type === 'StringConstantExpressionAst' ||
        ce.type === 'ExpandableStringExpressionAst'
      args.push(isStringLiteral && ce.value != null ? ce.value : ce.text)
      elementTypes.push(mapElementType(ce.type, ce.expressionType))
      // 通过 mapElementType 映射原始子节点（CommandParameterAst.Argument），使消费方看到 'Variable'、'StringConstant' 等。
      const rawChildren = ensureArray(ce.children)
      if (rawChildren.length > 0) {
        hasChildren = true
        children.push(
          rawChildren.map(c => ({
            type: mapElementType(c.type),
            text: c.text,
          })),
        )
      } else {
        children.push(undefined)
      }
    }
  }

  const result: ParsedCommandElement = {
    name,
    nameType,
    elementType: 'CommandAst',
    args,
    text: raw.text,
    elementTypes,
    ...(hasChildren ? { children } : {}),
  }

  // 保留嵌套命令（如 && / || 链中）的重定向
  const rawRedirs = ensureArray(raw.redirections)
  if (rawRedirs.length > 0) {
    result.redirections = rawRedirs.map(transformRedirection)
  }

  return result
}

/** 将非 CommandAst 管道元素转换为 ParsedCommandElement */
// 供测试导出
export function transformExpressionElement(
  raw: RawPipelineElement,
): ParsedCommandElement {
  const elementType: PipelineElementType =
    raw.type === 'ParenExpressionAst'
      ? 'ParenExpressionAst'
      : 'CommandExpressionAst'
  const elementTypes: CommandElementType[] = [
    mapElementType(raw.type, raw.expressionType),
  ]

  return {
    name: raw.text,
    nameType: 'unknown',
    elementType,
    args: [],
    text: raw.text,
    elementTypes,
  }
}

/** 将原始重定向映射到 ParsedRedirection */
// 供测试导出
export function transformRedirection(raw: RawRedirection): ParsedRedirection {
  if (raw.type === 'MergingRedirectionAst') {
    return { operator: '2>&1', target: '', isMerging: true }
  }

  const append = raw.append ?? false
  const fromStream = raw.fromStream ?? 'Output'

  let operator: ParsedRedirection['operator']
  if (append) {
    switch (fromStream) {
      case 'Error':
        operator = '2>>'
        break
      case 'All':
        operator = '*>>'
        break
      default:
        operator = '>>'
        break
    }
  } else {
    switch (fromStream) {
      case 'Error':
        operator = '2>'
        break
      case 'All':
        operator = '*>'
        break
      default:
        operator = '>'
        break
    }
  }

  return { operator, target: raw.locationText ?? '', isMerging: false }
}

/** 将原始语句转换为 ParsedStatement */
// 供测试导出
export function transformStatement(raw: RawStatement): ParsedStatement {
  const statementType = mapStatementType(raw.type)
  const commands: ParsedCommandElement[] = []
  const redirections: ParsedRedirection[] = []

  if (raw.elements) {
    // PipelineAst：遍历管道元素
    for (const elem of ensureArray(raw.elements)) {
      if (elem.type === 'CommandAst') {
        commands.push(transformCommandAst(elem))
        for (const redir of ensureArray(elem.redirections)) {
          redirections.push(transformRedirection(redir))
        }
      } else {
        commands.push(transformExpressionElement(elem))
        // 安全性：CommandExpressionAst 也携带 .Redirections（继承自 CommandBaseAst）。`1 > /tmp/evil.txt` 是带 FileRedirectionAst 的 CommandExpressionAst。
        // 必须在此提取，否则 getFileRedirections() 会遗漏，且复合命令如 `Get-ChildItem; 1 > /tmp/x` 会在第 5 步自动允许（仅检查 Get-ChildItem）。
        for (const redir of ensureArray(elem.redirections)) {
          redirections.push(transformRedirection(redir))
        }
      }
    }
    // 安全性：PS1 的 PipelineAst 分支对 FileRedirectionAst 进行了深度 FindAll，以捕获隐藏在以下位置的重定向：
    //  - 冒号绑定的 ParenExpressionAst 参数：-Name:('payload' > file)
    //  - 哈希表值语句：@{k='payload' > ~/.bashrc}
    // 这两者在元素级别均不可见 —— 重定向的父节点是 CommandParameterAst / CommandExpressionAst 的子节点，而非独立的管道元素。合并到语句级重定向中。
    //
    // 该 FindAll 也会重新发现已在上述元素循环中捕获的直接元素重定向。通过 (operator, target) 去重，使测试和消费方看到真实计数。
    const seen = new Set(redirections.map(r => `${r.operator}\0${r.target}`))
    for (const redir of ensureArray(raw.redirections)) {
      const r = transformRedirection(redir)
      const key = `${r.operator}\0${r.target}`
      if (!seen.has(key)) {
        seen.add(key)
        redirections.push(r)
      }
    }
  } else {
    // 非管道语句：添加包含完整文本的合成命令条目
    commands.push({
      name: raw.text,
      nameType: 'unknown',
      elementType: 'CommandExpressionAst',
      args: [],
      text: raw.text,
    })
    // 安全性：PS1 的 else 分支对 FileRedirectionAst 进行了直接递归 FindAll，以捕获控制流（if/for/foreach/while/switch/try/trap/&& 和 ||）中的表达式重定向。
    // 上述 CommandAst FindAll 无法看到这些：在 if ($x) { 1 > /tmp/evil } 中，带附加重定向的字面量 1 是一个 CommandExpressionAst —— 类型层次中与 CommandAst 同级的节点，而非子类。
    // 因此 nestedCommands 永远不会包含它，若无此提升，重定向对 getFileRedirections 不可见 → 第 4.6 步遗漏 → 复合命令如 `Get-Process && 1 > /tmp/evil` 在第 5 步自动允许（仅检查 Get-Process，其在允许列表中）。
    //
    // 直接查找 FileRedirectionAst（而非查找 CommandExpressionAst 并提取 .Redirections）更简单且更健壮：可捕获任何节点类型上的重定向，包括未知类型。
    //
    // 会重复计算已在嵌套 CommandAst 命令上的重定向（这些在第 395 行附近被提取到 nestedCommands[i].redirections，并在此再次发现）。无害：第 4.6 步仅检查 fileRedirections.length > 0，不关心精确计数。无代码依赖重定向计数进行算术运算。
    //
    // PS1 体积说明：完整理由存于此处（TS），而非 PS1 脚本中，因为 PS1 注释会增大 -EncodedCommand 有效载荷并逼近 Windows CreateProcess 32K 限制。PS1 注释需保持简洁；在此处注明。
    for (const redir of ensureArray(raw.redirections)) {
      redirections.push(transformRedirection(redir))
    }
  }

  let nestedCommands: ParsedCommandElement[] | undefined
  const rawNested = ensureArray(raw.nestedCommands)
  if (rawNested.length > 0) {
    nestedCommands = rawNested.map(transformCommandAst)
  }

  const result: ParsedStatement = {
    statementType,
    commands,
    redirections,
    text: raw.text,
    nestedCommands,
  }

  if (raw.securityPatterns) {
    result.securityPatterns = raw.securityPatterns
  }

  return result
}

/** 将完整的原始 PS 输出转换为 ParsedPowerShellCommand */
function transformRawOutput(raw: RawParsedOutput): ParsedPowerShellCommand {
  const result: ParsedPowerShellCommand = {
    valid: raw.valid,
    errors: ensureArray(raw.errors),
    statements: ensureArray(raw.statements).map(transformStatement),
    variables: ensureArray(raw.variables),
    hasStopParsing: raw.hasStopParsing,
    originalCommand: raw.originalCommand,
  }
  const tl = ensureArray(raw.typeLiterals)
  if (tl.length > 0) {
    result.typeLiterals = tl
  }
  if (raw.hasUsingStatements) {
    result.hasUsingStatements = true
  }
  if (raw.hasScriptRequirements) {
    result.hasScriptRequirements = true
  }
  return result
}

/**
 * 使用原生 AST 解析器解析 PowerShell 命令。
 * 启动 pwsh 解析命令并返回结构化结果。
 * 结果按命令字符串缓存。
 *
 * @param command - 要解析的 PowerShell 命令
 * @returns 解析后的命令结构，失败时返回 valid=false 的结果
 */
async function parsePowerShellCommandImpl(
  command: string,
): Promise<ParsedPowerShellCommand> {
  // 安全性：MAX_COMMAND_LENGTH 是 UTF-8 字节预算（见常量定义处的推导）。command.length 统计 UTF-16 码元；一个 CJK 字符占 1 码元但 3 UTF-8 字节，
  // 因此 .length 最多低估 3 倍，导致 Windows 上 argv 溢出 → CreateProcess 失败 → valid:false → 拒绝规则降级为询问。Issue #36。
  const commandBytes = Buffer.byteLength(command, 'utf8')
  if (commandBytes > MAX_COMMAND_LENGTH) {
    logForDebugging(
      `PowerShell 解析器: 命令过长 (${commandBytes} 字节，最大 ${MAX_COMMAND_LENGTH})`,
    )
    return makeInvalidResult(
      command,
      `命令过长，无法解析 (${commandBytes} 字节)。最大支持长度为 ${MAX_COMMAND_LENGTH} 字节。`,
      'CommandTooLong',
    )
  }

  const pwshPath = await getCachedPowerShellPath()
  if (!pwshPath) {
    return makeInvalidResult(
      command,
      'PowerShell 不可用',
      'NoPowerShell',
    )
  }

  const script = buildParseScript(command)

  // 通过 -EncodedCommand 将脚本传递给 PowerShell。
  // -EncodedCommand 接受 Base64 编码的 UTF-16LE 字符串并执行，可避免：
  // (1) stdin 交互模式问题（-File - 会生成 PS 提示符和 ANSI 转义序列干扰 stdout），
  // (2) 命令行转义问题，(3) 临时文件。脚本虽大但完全在操作系统参数限制内（Windows: 32K 字符，Unix: 通常 2MB+）。
  const encodedScript = toUtf16LeBase64(script)
  const args = [
    '-NoProfile',
    '-NonInteractive',
    '-NoLogo',
    '-EncodedCommand',
    encodedScript,
  ]

  // 启动 pwsh，超时时重试一次。在高负载 CI 运行器（尤其是 Windows）上，即使 CAN_SPAWN_PARSE_SCRIPT() 已预热 JIT，pwsh 启动 + .NET JIT + ParseInput 偶尔也会超过 5 秒。
  // execa 会终止进程但 exitCode 为 undefined，旧代码会报告误导性的 "pwsh exited with code 1:" 且 stderr 为空。单次重试可吸收瞬时负载峰值；两次超时则报告为 PwshTimeout。
  const parseTimeoutMs = getParseTimeoutMs()
  let stdout = ''
  let stderr = ''
  let code: number | null = null
  let timedOut = false
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await execa(pwshPath, args, {
        timeout: parseTimeoutMs,
        reject: false,
      })
      stdout = result.stdout
      stderr = result.stderr
      timedOut = result.timedOut
      code = result.failed ? (result.exitCode ?? 1) : 0
    } catch (e: unknown) {
      logForDebugging(
        `PowerShell 解析器: 无法启动 pwsh: ${e instanceof Error ? e.message : e}`,
      )
      return makeInvalidResult(
        command,
        `无法启动 PowerShell: ${e instanceof Error ? e.message : e}`,
        'PwshSpawnError',
      )
    }
    if (!timedOut) break
    logForDebugging(
      `PowerShell 解析器: pwsh 在 ${parseTimeoutMs}ms 后超时 (尝试 ${attempt + 1})`,
    )
  }

  if (timedOut) {
    return makeInvalidResult(
      command,
      `pwsh 在 ${parseTimeoutMs}ms 后超时 (2 次尝试)`,
      'PwshTimeout',
    )
  }

  if (code !== 0) {
    logForDebugging(
      `PowerShell 解析器: pwsh 退出，退出码 ${code}，stderr: ${stderr}`,
    )
    return makeInvalidResult(
      command,
      `pwsh 退出，退出码为 ${code}: ${stderr}`,
      'PwshError',
    )
  }

  const trimmed = stdout.trim()
  if (!trimmed) {
    logForDebugging('PowerShell 解析器: pwsh 的输出为空')
    return makeInvalidResult(
      command,
      'PowerShell 解析器无输出',
      'EmptyOutput',
    )
  }

  try {
    const raw = jsonParse(trimmed) as RawParsedOutput
    return transformRawOutput(raw)
  } catch {
    logForDebugging(
      `PowerShell 解析器: 无效的 JSON 输出: ${trimmed.slice(0, 200)}`,
    )
    return makeInvalidResult(
      command,
      'PowerShell 解析器返回了无效的 JSON',
      'InvalidJson',
    )
  }
}

// 来自 makeInvalidResult 的错误 ID，表示瞬态进程失败。应从缓存中逐出以便后续调用重试。
// 确定性失败（CommandTooLong、成功解析中的语法错误）应保留缓存，因为重试结果相同。
const TRANSIENT_ERROR_IDS = new Set([
  'PwshSpawnError',
  'PwshError',
  'PwshTimeout',
  'EmptyOutput',
  'InvalidJson',
])

const parsePowerShellCommandCached = memoizeWithLRU(
  (command: string) => {
    const promise = parsePowerShellCommandImpl(command)
    // 解析完成后逐出瞬态失败，以便重试。当前调用者仍会收到本次调用的缓存 promise，确保并发调用方共享相同结果。
    void promise.then(result => {
      if (
        !result.valid &&
        TRANSIENT_ERROR_IDS.has(result.errors[0]?.errorId ?? '')
      ) {
        parsePowerShellCommandCached.cache.delete(command)
      }
    })
    return promise
  },
  (command: string) => command,
  256,
)
export { parsePowerShellCommandCached as parsePowerShellCommand }

// ---------------------------------------------------------------------------
// 分析辅助函数 —— 从解析后的 AST 结构推导得出
// ---------------------------------------------------------------------------

/**
 * 从解析后的 AST 推导的安全相关标志
 */
type SecurityFlags = {
  /** 包含 $(...) 子表达式 */
  hasSubExpressions: boolean
  /** 包含 { ... } 脚本块表达式 */
  hasScriptBlocks: boolean
  /** 包含 @variable 展开 */
  hasSplatting: boolean
  /** 包含带嵌入表达式的可扩展字符串（"...$()..."） */
  hasExpandableStrings: boolean
  /** 包含 .NET 方法调用（[Type]::Method 或 $obj.Method()） */
  hasMemberInvocations: boolean
  /** 包含变量赋值（$x = ...） */
  hasAssignments: boolean
  /** 使用停止解析标记（--%） */
  hasStopParsing: boolean
}

/**
 * 常见 PowerShell 别名到规范 cmdlet 名称的映射。
 * 使用 Object.create(null) 防止原型链污染 —— 攻击者控制的命令名如 'constructor' 或 '__proto__' 必须返回 undefined，而非继承的 Object.prototype 属性。
 */
export const COMMON_ALIASES: Record<string, string> = Object.assign(
  Object.create(null) as Record<string, string>,
  {
    // 目录列表
    ls: 'Get-ChildItem',
    dir: 'Get-ChildItem',
    gci: 'Get-ChildItem',
    // 内容
    cat: 'Get-Content',
    type: 'Get-Content',
    gc: 'Get-Content',
    // 导航
    cd: 'Set-Location',
    sl: 'Set-Location',
    chdir: 'Set-Location',
    pushd: 'Push-Location',
    popd: 'Pop-Location',
    pwd: 'Get-Location',
    gl: 'Get-Location',
    // 项目
    gi: 'Get-Item',
    gp: 'Get-ItemProperty',
    ni: 'New-Item',
    mkdir: 'New-Item',
    // `md` 是 PowerShell 内建别名，指向 `mkdir`。resolveToCanonical 是单跳转（无 md→mkdir→New-Item 链），因此需要单独条目，否则 `md /etc/x` 会被漏过而 `mkdir /etc/x` 被捕获。
    md: 'New-Item',
    ri: 'Remove-Item',
    del: 'Remove-Item',
    rd: 'Remove-Item',
    rmdir: 'Remove-Item',
    rm: 'Remove-Item',
    erase: 'Remove-Item',
    mi: 'Move-Item',
    mv: 'Move-Item',
    move: 'Move-Item',
    ci: 'Copy-Item',
    cp: 'Copy-Item',
    copy: 'Copy-Item',
    cpi: 'Copy-Item',
    si: 'Set-Item',
    rni: 'Rename-Item',
    ren: 'Rename-Item',
    // 进程
    ps: 'Get-Process',
    gps: 'Get-Process',
    kill: 'Stop-Process',
    spps: 'Stop-Process',
    start: 'Start-Process',
    saps: 'Start-Process',
    sajb: 'Start-Job',
    ipmo: 'Import-Module',
    // 输出
    echo: 'Write-Output',
    write: 'Write-Output',
    sleep: 'Start-Sleep',
    // 帮助
    help: 'Get-Help',
    man: 'Get-Help',
    gcm: 'Get-Command',
    // 服务
    gsv: 'Get-Service',
    // 变量
    gv: 'Get-Variable',
    sv: 'Set-Variable',
    // 历史
    h: 'Get-History',
    history: 'Get-History',
    // 调用
    iex: 'Invoke-Expression',
    iwr: 'Invoke-WebRequest',
    irm: 'Invoke-RestMethod',
    icm: 'Invoke-Command',
    ii: 'Invoke-Item',
    // PSSession —— 远程代码执行面
    nsn: 'New-PSSession',
    etsn: 'Enter-PSSession',
    exsn: 'Exit-PSSession',
    gsn: 'Get-PSSession',
    rsn: 'Remove-PSSession',
    // 杂项
    cls: 'Clear-Host',
    clear: 'Clear-Host',
    select: 'Select-Object',
    where: 'Where-Object',
    foreach: 'ForEach-Object',
    '%': 'ForEach-Object',
    '?': 'Where-Object',
    measure: 'Measure-Object',
    ft: 'Format-Table',
    fl: 'Format-List',
    fw: 'Format-Wide',
    oh: 'Out-Host',
    ogv: 'Out-GridView',
    // 安全性：以下别名刻意省略，因为 PS Core 6+ 已移除它们（与原生可执行文件冲突）。我们的允许列表逻辑在检查安全性之前解析别名——若将 'sort' 映射为 'Sort-Object'，
    // 但 PowerShell 7/Windows 实际运行 sort.exe，则会错误地自动允许错误的程序。
    //   'sc'   → sc.exe (服务控制器) —— 例如 `sc config Svc binpath= ...`
    //   'sort' → sort.exe —— 例如 `sort /O C:\evil.txt` (任意文件写入)
    //   'curl' → curl.exe (Windows 10 1803+ 内置)
    //   'wget' → wget.exe (若已安装)
    // 优先保持模糊别名不映射 —— 用户可书写完整名称。
    // 若添加解析至 SAFE_OUTPUT_CMDLETS 或 ACCEPT_EDITS_ALLOWED_CMDLETS 的别名，需验证在 PS Core 上无原生 .exe 冲突。
    ac: 'Add-Content',
    clc: 'Clear-Content',
    // 写入/导出：tee-object/export-csv 在 CMDLET_PATH_CONFIG 中，因此路径级 Edit 拒绝会在完整 cmdlet 名称上触发，
    // 但 PowerShell 内建别名因 resolveToCanonical 无法解析而回退至 ask-then-approve。tee-object 和 export-csv 均不在 SAFE_OUTPUT_CMDLETS 或 ACCEPT_EDITS_ALLOWED_CMDLETS 中，
    // 因此上述关于原生 exe 冲突的警告不适用 —— 在 Linux PS Core 上 `tee` 运行 /usr/bin/tee，该二进制也会写入其位置文件参数，我们可正确提取并检查。
    tee: 'Tee-Object',
    epcsv: 'Export-Csv',
    sp: 'Set-ItemProperty',
    rp: 'Remove-ItemProperty',
    cli: 'Clear-Item',
    epal: 'Export-Alias',
    // 文本搜索
    sls: 'Select-String',
  },
)

const DIRECTORY_CHANGE_CMDLETS = new Set([
  'set-location',
  'push-location',
  'pop-location',
])

const DIRECTORY_CHANGE_ALIASES = new Set(['cd', 'sl', 'chdir', 'pushd', 'popd'])

/**
 * 获取所有语句、管道段及嵌套命令中的所有命令名称。
 * 返回小写名称以便不区分大小写比较。
 */
// 供测试导出
export function getAllCommandNames(parsed: ParsedPowerShellCommand): string[] {
  const names: string[] = []
  for (const statement of parsed.statements) {
    for (const cmd of statement.commands) {
      names.push(cmd.name.toLowerCase())
    }
    if (statement.nestedCommands) {
      for (const cmd of statement.nestedCommands) {
        names.push(cmd.name.toLowerCase())
      }
    }
  }
  return names
}

/**
 * 将所有管道段展平为命令列表。
 * 适用于独立检查每个命令。
 */
export function getAllCommands(
  parsed: ParsedPowerShellCommand,
): ParsedCommandElement[] {
  const commands: ParsedCommandElement[] = []
  for (const statement of parsed.statements) {
    for (const cmd of statement.commands) {
      commands.push(cmd)
    }
    if (statement.nestedCommands) {
      for (const cmd of statement.nestedCommands) {
        commands.push(cmd)
      }
    }
  }
  return commands
}

/**
 * 获取所有语句上的所有重定向。
 */
// 供测试导出
export function getAllRedirections(
  parsed: ParsedPowerShellCommand,
): ParsedRedirection[] {
  const redirections: ParsedRedirection[] = []
  for (const statement of parsed.statements) {
    for (const redir of statement.redirections) {
      redirections.push(redir)
    }
    // 包含嵌套命令（如 && / || 链）中的重定向
    if (statement.nestedCommands) {
      for (const cmd of statement.nestedCommands) {
        if (cmd.redirections) {
          for (const redir of cmd.redirections) {
            redirections.push(redir)
          }
        }
      }
    }
  }
  return redirections
}

/**
 * 获取所有变量，可选按作用域过滤（如 'env'）。
 * PowerShell 中的变量路径可带作用域，如 "env:PATH"、"global:x"。
 */
export function getVariablesByScope(
  parsed: ParsedPowerShellCommand,
  scope: string,
): ParsedVariable[] {
  const prefix = scope.toLowerCase() + ':'
  return parsed.variables.filter(v => v.path.toLowerCase().startsWith(prefix))
}

/**
 * 检查解析结果中是否存在名称匹配的命令（不区分大小写）。
 * 同时处理常见别名。
 */
export function hasCommandNamed(
  parsed: ParsedPowerShellCommand,
  name: string,
): boolean {
  const lowerName = name.toLowerCase()
  const canonicalFromAlias = COMMON_ALIASES[lowerName]?.toLowerCase()

  for (const cmdName of getAllCommandNames(parsed)) {
    if (cmdName === lowerName) {
      return true
    }
    // 检查该命令是否为解析到请求名称的别名
    const canonical = COMMON_ALIASES[cmdName]?.toLowerCase()
    if (canonical === lowerName) {
      return true
    }
    // 检查请求名称是否为别名，且该命令为其规范形式
    if (canonicalFromAlias && cmdName === canonicalFromAlias) {
      return true
    }
    // 检查二者是否解析到同一规范 cmdlet（别名到别名匹配）
    if (canonical && canonicalFromAlias && canonical === canonicalFromAlias) {
      return true
    }
  }
  return false
}

/**
 * 检查命令是否包含任何改变目录的命令。
 * （Set-Location、cd、sl、chdir、Push-Location、pushd、Pop-Location、popd）
 */
// 供测试导出
export function hasDirectoryChange(parsed: ParsedPowerShellCommand): boolean {
  for (const cmdName of getAllCommandNames(parsed)) {
    if (
      DIRECTORY_CHANGE_CMDLETS.has(cmdName) ||
      DIRECTORY_CHANGE_ALIASES.has(cmdName)
    ) {
      return true
    }
  }
  return false
}

/**
 * 检查命令是否为单个简单命令（无管道、分号或运算符）。
 */
// 供测试导出
export function isSingleCommand(parsed: ParsedPowerShellCommand): boolean {
  const stmt = parsed.statements[0]
  return (
    parsed.statements.length === 1 &&
    stmt !== undefined &&
    stmt.commands.length === 1 &&
    (!stmt.nestedCommands || stmt.nestedCommands.length === 0)
  )
}

/**
 * 检查特定命令是否包含给定参数/标志（不区分大小写）。
 * 适用于检查 "-EncodedCommand"、"-Recurse" 等。
 */
export function commandHasArg(
  command: ParsedCommandElement,
  arg: string,
): boolean {
  const lowerArg = arg.toLowerCase()
  return command.args.some(a => a.toLowerCase() === lowerArg)
}

/**
 * PowerShell 词法分析器接受的短横线字符。SpecialCharacters.IsDash（CharTraits.cs）恰好接受这四个：
 * ASCII 连字符-减号、短破折号、长破折号、水平线。这是词法分析器层面的 —— 适用于所有 cmdlet 参数，
 * 与 powershell.exe 的参数解析不同（后者仅在 PowerShell 5.1 中接受 `/`，见 powershellSecurity.ts 中的 PS_ALT_PARAM_PREFIXES）。
 *
 * Extent.Text 保留原始字符；transformCommandAst 对 CommandParameterAst 元素使用 ce.text，因此这些字符原样传递给调用方。
 */
export const PS_TOKENIZER_DASH_CHARS = new Set([
  '-', // U+002D 连字符-减号 (ASCII)
  '\u2013', // 短破折号
  '\u2014', // 长破折号
  '\u2015', // 水平线
])

/**
 * 判断参数是否为 PowerShell 参数（标志），优先使用 AST 元素类型作为真实依据。
 *
 * 解析器将 CommandParameterAst 映射为 'Parameter'，无论用户输入何种短横线字符 —— PowerShell 词法分析器会处理。
 * 因此当 elementType 可用时，其具有权威性：
 *   - 'Parameter' → true（涵盖 `-Path`、`–Path`、`—Path`、`―Path`）
 *   - 其他 → false（带引号的 "-Path" 是 StringConstant，非参数）
 *
 * 当 elementType 不可用时（向后兼容/无 AST 细节），回退到对 PS_TOKENIZER_DASH_CHARS 的字符检查。
 */
export function isPowerShellParameter(
  arg: string,
  elementType?: CommandElementType,
): boolean {
  if (elementType !== undefined) {
    return elementType === 'Parameter'
  }
  return arg.length > 0 && PS_TOKENIZER_DASH_CHARS.has(arg[0]!)
}

/**
 * 检查命令上的某个参数是否为 PowerShell 参数的明确缩写。
 * PowerShell 允许参数缩写，只要前缀不产生歧义。
 * minPrefix 是该参数最短的明确前缀。
 * 例如，完整参数 '-encodedcommand' 的 minPrefix '-en' 匹配 '-en'、'-enc'、'-enco' 等。
 */
export function commandHasArgAbbreviation(
  command: ParsedCommandElement,
  fullParam: string,
  minPrefix: string,
): boolean {
  const lowerFull = fullParam.toLowerCase()
  const lowerMin = minPrefix.toLowerCase()
  return command.args.some(a => {
    // 剥离冒号绑定的值（如 -en:base64value -> -en）
    const colonIndex = a.indexOf(':', 1)
    const paramPart = colonIndex > 0 ? a.slice(0, colonIndex) : a
    // 剥离反引号转义 —— PowerShell 将 `-Member`Name` 解析为 `-MemberName`，但 Extent.Text 保留反引号，导致基于原始文本的前缀比较遗漏。
    const lower = paramPart.replace(/`/g, '').toLowerCase()
    return (
      lower.startsWith(lowerMin) &&
      lowerFull.startsWith(lower) &&
      lower.length <= lowerFull.length
    )
  })
}

/**
 * 将解析后的命令按管道段拆分，用于逐段权限检查。
 * 分别返回每个管道的命令。
 */
export function getPipelineSegments(
  parsed: ParsedPowerShellCommand,
): ParsedStatement[] {
  return parsed.statements
}

/**
 * 判断重定向目标是否为 PowerShell 的 `$null` 自动变量。
 * `> $null` 丢弃输出（类似 /dev/null）—— 非文件系统写入。
 * `$null` 不可重新赋值，因此可安全视为空操作接收器。
 * `${null}` 是通过花括号语法引用的同一自动变量。花括号内的空格（`${ null }`）会指向其他变量，故不采用正则。
 */
export function isNullRedirectionTarget(target: string): boolean {
  const t = target.trim().toLowerCase()
  return t === '$null' || t === '${null}'
}

/**
 * 获取输出重定向（文件重定向，非合并重定向）。
 * 仅返回写入文件的重定向。
 */
// 供测试导出
export function getFileRedirections(
  parsed: ParsedPowerShellCommand,
): ParsedRedirection[] {
  return getAllRedirections(parsed).filter(
    r => !r.isMerging && !isNullRedirectionTarget(r.target),
  )
}

/**
 * 从解析后的命令结构推导安全相关标志。
 * 替代了之前通过单独 Find-AstNodes 调用在 PowerShell 中计算标志的方式。
 * 现在 PS1 脚本为每个元素标记其 AST 节点类型，本函数遍历这些类型。
 */
// 供测试导出
export function deriveSecurityFlags(
  parsed: ParsedPowerShellCommand,
): SecurityFlags {
  const flags: SecurityFlags = {
    hasSubExpressions: false,
    hasScriptBlocks: false,
    hasSplatting: false,
    hasExpandableStrings: false,
    hasMemberInvocations: false,
    hasAssignments: false,
    hasStopParsing: parsed.hasStopParsing,
  }

  function checkElements(cmd: ParsedCommandElement): void {
    if (!cmd.elementTypes) {
      return
    }
    for (const et of cmd.elementTypes) {
      switch (et) {
        case 'ScriptBlock':
          flags.hasScriptBlocks = true
          break
        case 'SubExpression':
          flags.hasSubExpressions = true
          break
        case 'ExpandableString':
          flags.hasExpandableStrings = true
          break
        case 'MemberInvocation':
          flags.hasMemberInvocations = true
          break
      }
    }
  }

  for (const stmt of parsed.statements) {
    if (stmt.statementType === 'AssignmentStatementAst') {
      flags.hasAssignments = true
    }
    for (const cmd of stmt.commands) {
      checkElements(cmd)
    }
    if (stmt.nestedCommands) {
      for (const cmd of stmt.nestedCommands) {
        checkElements(cmd)
      }
    }
    // securityPatterns 提供双重检查，捕获 elementTypes 可能遗漏的模式
    // （例如赋值语句中的成员调用、非管道语句中的子表达式）。
    if (stmt.securityPatterns) {
      if (stmt.securityPatterns.hasMemberInvocations) {
        flags.hasMemberInvocations = true
      }
      if (stmt.securityPatterns.hasSubExpressions) {
        flags.hasSubExpressions = true
      }
      if (stmt.securityPatterns.hasExpandableStrings) {
        flags.hasExpandableStrings = true
      }
      if (stmt.securityPatterns.hasScriptBlocks) {
        flags.hasScriptBlocks = true
      }
    }
  }

  for (const v of parsed.variables) {
    if (v.isSplatted) {
      flags.hasSplatting = true
      break
    }
  }

  return flags
}

// 供测试导出的原始类型（函数导出见上文）