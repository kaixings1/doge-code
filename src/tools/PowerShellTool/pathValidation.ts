/**
 * PowerShell 命令参数的专属路径验证模块。
 *
 * 使用 AST 解析器从 PowerShell 命令中提取文件路径，
 * 并验证其是否位于允许的项目目录内。
 * 遵循与 BashTool/pathValidation.ts 相同的模式。
 */

import { homedir } from 'os'
import { isAbsolute, resolve } from 'path'
import type { ToolPermissionContext } from '../../Tool.js'
import type { PermissionRule } from '../../types/permissions.js'
import { getCwd } from '../../utils/cwd.js'
import {
  getFsImplementation,
  safeResolvePath,
} from '../../utils/fsOperations.js'
import { containsPathTraversal, getDirectoryForPath } from '../../utils/path.js'
import {
  allWorkingDirectories,
  checkEditableInternalPath,
  checkPathSafetyForAutoEdit,
  checkReadableInternalPath,
  matchingRuleForInput,
  pathInAllowedWorkingPath,
} from '../../utils/permissions/filesystem.js'
import type { PermissionResult } from '../../utils/permissions/PermissionResult.js'
import { createReadRuleSuggestion } from '../../utils/permissions/PermissionUpdate.js'
import type { PermissionUpdate } from '../../utils/permissions/PermissionUpdateSchema.js'
import {
  isDangerousRemovalPath,
  isPathInSandboxWriteAllowlist,
} from '../../utils/permissions/pathValidation.js'
import { getPlatform } from '../../utils/platform.js'
import type {
  ParsedCommandElement,
  ParsedPowerShellCommand,
} from '../../utils/powershell/parser.js'
import {
  isNullRedirectionTarget,
  isPowerShellParameter,
} from '../../utils/powershell/parser.js'
import { COMMON_SWITCHES, COMMON_VALUE_PARAMS } from './commonParameters.js'
import { resolveToCanonical } from './readOnlyValidation.js'

const MAX_DIRS_TO_LIST = 5
// PowerShell 通配符仅 * ? [ ] —— 花括号为字面量字符（无花括号展开功能）。
// 此前包含 {} 会导致诸如 `./{x}/passwd` 的路径被 glob 基目录截断而非进行完整符号链接解析。
const GLOB_PATTERN_REGEX = /[*?[\]]/

type FileOperationType = 'read' | 'write' | 'create'

type PathCheckResult = {
  allowed: boolean
  decisionReason?: import('../../utils/permissions/PermissionResult.js').PermissionDecisionReason
}

type ResolvedPathCheckResult = PathCheckResult & {
  resolvedPath: string
}

/**
 * 针对每个 cmdlet 的参数配置。
 *
 * 每个条目声明：
 *   - operationType：该 cmdlet 是对文件系统进行读操作还是写操作
 *   - pathParams：接受文件路径的参数（会对照允许目录进行验证）
 *   - knownSwitches：开关参数（不接受值）——下一个参数不会被消费
 *   - knownValueParams：接受值但并非路径的参数——下一个参数会被消费，
 *     但不会作为路径进行验证（例如 -Encoding UTF8、-Filter *.txt）
 *
 * 安全模型：任何不在这三类中的 -Param 都会导致 hasUnvalidatablePathArg 被置为真，进而触发 ask。
 * 这终结了此前 KNOWN_SWITCH_PARAMS 的打地鼠式修补——以往每个缺失的开关都会导致未知参数启发式逻辑吞掉下一个参数
 * （该参数极有可能是位置路径）。现在，第二梯队 cmdlet 仅在我们完全理解的调用下才会自动放行。
 *
 * 来源：
 *   - Windows PowerShell 5.1 上的 (Get-Command <cmdlet>).Parameters
 *   - 官方文档中的 PS 6+ 新增项（例如 -AsByteStream、-NoEmphasis）
 *
 * 注意：通用参数（-Verbose、-ErrorAction 等）未在此列出；
 * 它们会在查找时从 COMMON_SWITCHES / COMMON_VALUE_PARAMS 中合并进来。
 *
 * 参数名均以小写形式存储，并带有前导短横线以匹配运行时比较。
 */
type CmdletPathConfig = {
  operationType: FileOperationType
  /** 接受文件路径的参数名称（会对照允许目录进行验证） */
  pathParams: string[]
  /** 不接受值的开关参数（下一个参数不会被消费） */
  knownSwitches: string[]
  /** 接受值但非路径的参数（下一个参数会被消费，但不进行路径验证） */
  knownValueParams: string[]
  /**
   * 接受 PowerShell 会相对于另一参数（而非当前工作目录）解析的叶子文件名的参数名称。
   * 仅当值为简单叶子名（不含 `/`、`\`、`.`、`..`）时才可安全提取。
   * 非叶子值会被标记为无法验证，因为 validatePath 会相对于 cwd 解析，而非实际基路径——
   * 要将其与 -Path 进行拼接则需要跨参数追踪。
   */
  leafOnlyPathParams?: string[]
  /**
   * 需跳过的前置位置参数数量（不提取为路径）。
   * 用于位置 0 为非路径值的 cmdlet —— 例如 Invoke-WebRequest 的位置参数 -Uri 是 URL 而非本地文件系统路径。
   * 若无此项，`iwr http://example.com` 会将 `http://example.com` 提取为路径，
   * 而 validatePath 的 provider-path 正则表达式（^[a-z]{2,}:）会因 URL 协议而误触发，
   * 并给出令人困惑的“非文件系统提供程序”消息。
   */
  positionalSkip?: number
  /**
   * 若为 true，则该 cmdlet 仅在存在 pathParam 时才写入磁盘。
   * 无路径时（例如不带 -OutFile 的 `Invoke-WebRequest https://example.com`），
   * 其实际为读操作——输出进入管道而非文件系统。这会跳过“写入操作但无目标路径”的强制询问。
   * 像 Set-Content 这类始终执行写入的 cmdlet 不应设置此项。
   */
  optionalWrite?: boolean
}

const CMDLET_PATH_CONFIG: Record<string, CmdletPathConfig> = {
  // ─── 写入/创建操作 ──────────────────────────────────────────────
  'set-content': {
    operationType: 'write',
    // -PSPath 和 -LP 是所有提供程序 cmdlet 上 -LiteralPath 的运行时别名。
    // 若无此项，冒号语法（-PSPath:/etc/x）会落入未知参数分支 → 路径被拦截 → paths=[] → 拒绝规则永不被咨询。
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: [
      '-passthru',
      '-force',
      '-whatif',
      '-confirm',
      '-usetransaction',
      '-nonewline',
      '-asbytestream', // PS 6+
    ],
    knownValueParams: [
      '-value',
      '-filter',
      '-include',
      '-exclude',
      '-credential',
      '-encoding',
      '-stream',
    ],
  },
  'add-content': {
    operationType: 'write',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: [
      '-passthru',
      '-force',
      '-whatif',
      '-confirm',
      '-usetransaction',
      '-nonewline',
      '-asbytestream', // PS 6+
    ],
    knownValueParams: [
      '-value',
      '-filter',
      '-include',
      '-exclude',
      '-credential',
      '-encoding',
      '-stream',
    ],
  },
  'remove-item': {
    operationType: 'write',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: [
      '-recurse',
      '-force',
      '-whatif',
      '-confirm',
      '-usetransaction',
    ],
    knownValueParams: [
      '-filter',
      '-include',
      '-exclude',
      '-credential',
      '-stream',
    ],
  },
  'clear-content': {
    operationType: 'write',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-force', '-whatif', '-confirm', '-usetransaction'],
    knownValueParams: [
      '-filter',
      '-include',
      '-exclude',
      '-credential',
      '-stream',
    ],
  },
  // Out-File/Tee-Object/Export-Csv/Export-Clixml 此前缺失，导致路径级拒绝规则（如 Edit(/etc/**)）
  // 可硬性拦截 `Set-Content /etc/x`，但对 `Out-File /etc/x` 仅会触发询问。
  // 这四个均为接受位置文件路径的写入类 cmdlet。
  'out-file': {
    operationType: 'write',
    // Out-File 使用 -FilePath（位置 0）。-Path 是 PowerShell 文档中声明的 -FilePath 别名——
    // 必须包含在 pathParams 中，否则 `Out-File -Path:./x`（冒号语法，单 token）
    // 会落入未知参数分支 → 值被拦截 → paths=[] → Edit 拒绝永不被咨询 → 询问（虽为故障安全但降低了拒绝等级）。
    pathParams: ['-filepath', '-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: [
      '-append',
      '-force',
      '-noclobber',
      '-nonewline',
      '-whatif',
      '-confirm',
    ],
    knownValueParams: ['-inputobject', '-encoding', '-width'],
  },
  'tee-object': {
    operationType: 'write',
    // Tee-Object 使用 -FilePath（位置 0，别名：-Path）。-Variable 不是路径。
    pathParams: ['-filepath', '-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-append'],
    knownValueParams: ['-inputobject', '-variable', '-encoding'],
  },
  'export-csv': {
    operationType: 'write',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: [
      '-append',
      '-force',
      '-noclobber',
      '-notypeinformation',
      '-includetypeinformation',
      '-useculture',
      '-noheader',
      '-whatif',
      '-confirm',
    ],
    knownValueParams: [
      '-inputobject',
      '-delimiter',
      '-encoding',
      '-quotefields',
      '-usequotes',
    ],
  },
  'export-clixml': {
    operationType: 'write',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-force', '-noclobber', '-whatif', '-confirm'],
    knownValueParams: ['-inputobject', '-depth', '-encoding'],
  },
  // New-Item/Copy-Item/Move-Item 此前缺失：`mkdir /etc/cron.d/evil` →
  // 通过 COMMON_ALIASES 解析，resolveToCanonical('mkdir') = 'new-item' → 不在配置中 →
  // 提前返回 {paths:[], 'read'} → Edit 拒绝永不被咨询。
  //
  // Copy-Item/Move-Item 具有双路径参数（-Path 源、-Destination 目标）。
  // operationType:'write' 并不完美——源在语义上是读操作——但这意味着两个路径均会接受 Edit-deny 验证，
  // 这比一个都不提取严格得多。按参数设置 operationType 会更理想，但那是更大的架构改动；
  // 目前用简单粗暴的 'write' 可立即填补漏洞。
  'new-item': {
    operationType: 'write',
    // -Path 为位置 0。-Name（位置 1）由 PowerShell 相对于 -Path 解析（根据 MS 文档：“您可以在 Name 中指定新项的路径”），
    // 包括 `..` 穿越。我们在 validatePath（约第 930 行）中相对于 CWD 进行解析，而非 -Path ——
    // 因此 `New-Item -Path /allowed -Name ../secret/evil` 会创建 /allowed/../secret/evil = /secret/evil，
    // 而我们解析的是 cwd/../secret/evil，落点在其他地方，可能遗漏拒绝规则。这是 deny→ask 的降级，非故障安全。
    //
    // -name 位于 leafOnlyPathParams 中：简单叶子文件名（如 `foo.txt`）会被提取（解析为 cwd/foo.txt —— 略有偏差，
    // 但 -Path 提取已覆盖目录，且叶子名无法穿越）；任何包含 `/`、`\`、`.`、`..` 的值都会标记 hasUnvalidatablePathArg →
    // 触发询问。将 -Name 与 -Path 拼接才是正确做法，但需要跨参数追踪——此处超出范围。
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    leafOnlyPathParams: ['-name'],
    knownSwitches: ['-force', '-whatif', '-confirm', '-usetransaction'],
    knownValueParams: ['-itemtype', '-value', '-credential', '-type'],
  },
  'copy-item': {
    operationType: 'write',
    // -Path（位置 0）为源，-Destination（位置 1）为目标。两者均提取，且均作为写入进行验证。
    pathParams: ['-path', '-literalpath', '-pspath', '-lp', '-destination'],
    knownSwitches: [
      '-container',
      '-force',
      '-passthru',
      '-recurse',
      '-whatif',
      '-confirm',
      '-usetransaction',
    ],
    knownValueParams: [
      '-filter',
      '-include',
      '-exclude',
      '-credential',
      '-fromsession',
      '-tosession',
    ],
  },
  'move-item': {
    operationType: 'write',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp', '-destination'],
    knownSwitches: [
      '-force',
      '-passthru',
      '-whatif',
      '-confirm',
      '-usetransaction',
    ],
    knownValueParams: ['-filter', '-include', '-exclude', '-credential'],
  },
  // rename-item/set-item：同类——ren/rni/si 位于 COMMON_ALIASES 中，此前均未在配置中。
  // `ren /etc/passwd passwd.bak` → 解析为 rename-item → 不在配置中 → {paths:[], 'read'} → Edit 拒绝被绕过。
  // 此处填补了 COMMON_ALIASES → CMDLET_PATH_CONFIG 覆盖范围的审计：每个写入类 cmdlet 的别名现在均解析到配置条目。
  'rename-item': {
    operationType: 'write',
    // -Path 位置 0，-NewName 位置 1。-NewName 仅接受叶子名（文档：“您不能指定新驱动器或其他路径”），
    // 且 Rename-Item 显式拒绝其中的 `..` —— 因此 knownValueParams 在此处是正确的，
    // 这与接受穿越的 New-Item -Name 不同。
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: [
      '-force',
      '-passthru',
      '-whatif',
      '-confirm',
      '-usetransaction',
    ],
    knownValueParams: [
      '-newname',
      '-credential',
      '-filter',
      '-include',
      '-exclude',
    ],
  },
  'set-item': {
    operationType: 'write',
    // FileSystem 提供程序对 Set-Item 的内容操作会抛出 NotSupportedException，
    // 因此实际写入面是注册表/env/function/alias 提供程序。提供程序限定路径（HKLM:\\、Env:\\）
    // 已在 powershellPermissions.ts 的第 3.5 步中被独立捕获，但将 set-item 在此处归类为写入是纵深防御——
    // powershellSecurity.ts:379 已将其列入 ENV_WRITE_CMDLETS；此配置使路径验证保持一致。
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: [
      '-force',
      '-passthru',
      '-whatif',
      '-confirm',
      '-usetransaction',
    ],
    knownValueParams: [
      '-value',
      '-credential',
      '-filter',
      '-include',
      '-exclude',
    ],
  },
  // ─── 读取操作 ──────────────────────────────────────────────────────
  'get-content': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: [
      '-force',
      '-usetransaction',
      '-wait',
      '-raw',
      '-asbytestream', // PS 6+
    ],
    knownValueParams: [
      '-readcount',
      '-totalcount',
      '-tail',
      '-first', // -TotalCount 的别名
      '-head', // -TotalCount 的别名
      '-last', // -Tail 的别名
      '-filter',
      '-include',
      '-exclude',
      '-credential',
      '-delimiter',
      '-encoding',
      '-stream',
    ],
  },
  'get-childitem': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: [
      '-recurse',
      '-force',
      '-name',
      '-usetransaction',
      '-followsymlink',
      '-directory',
      '-file',
      '-hidden',
      '-readonly',
      '-system',
    ],
    knownValueParams: [
      '-filter',
      '-include',
      '-exclude',
      '-depth',
      '-attributes',
      '-credential',
    ],
  },
  'get-item': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-force', '-usetransaction'],
    knownValueParams: [
      '-filter',
      '-include',
      '-exclude',
      '-credential',
      '-stream',
    ],
  },
  'get-itemproperty': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-usetransaction'],
    knownValueParams: [
      '-name',
      '-filter',
      '-include',
      '-exclude',
      '-credential',
    ],
  },
  'get-itempropertyvalue': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-usetransaction'],
    knownValueParams: [
      '-name',
      '-filter',
      '-include',
      '-exclude',
      '-credential',
    ],
  },
  'get-filehash': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: [],
    knownValueParams: ['-algorithm', '-inputstream'],
  },
  'get-acl': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-audit', '-allcentralaccesspolicies', '-usetransaction'],
    knownValueParams: ['-inputobject', '-filter', '-include', '-exclude'],
  },
  'format-hex': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-raw'],
    knownValueParams: [
      '-inputobject',
      '-encoding',
      '-count', // PS 6+
      '-offset', // PS 6+
    ],
  },
  'test-path': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-isvalid', '-usetransaction'],
    knownValueParams: [
      '-filter',
      '-include',
      '-exclude',
      '-pathtype',
      '-credential',
      '-olderthan',
      '-newerthan',
    ],
  },
  'resolve-path': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-relative', '-usetransaction', '-force'],
    knownValueParams: ['-credential', '-relativebasepath'],
  },
  'convert-path': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-usetransaction'],
    knownValueParams: [],
  },
  'select-string': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: [
      '-simplematch',
      '-casesensitive',
      '-quiet',
      '-list',
      '-notmatch',
      '-allmatches',
      '-noemphasis', // PS 7+
      '-raw', // PS 7+
    ],
    knownValueParams: [
      '-inputobject',
      '-pattern',
      '-include',
      '-exclude',
      '-encoding',
      '-context',
      '-culture', // PS 7+
    ],
  },
  'set-location': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-passthru', '-usetransaction'],
    knownValueParams: ['-stackname'],
  },
  'push-location': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-passthru', '-usetransaction'],
    knownValueParams: ['-stackname'],
  },
  'pop-location': {
    operationType: 'read',
    // Pop-Location 没有 -Path/-LiteralPath（从栈中弹出），但我们保留该条目以便它优雅地通过路径验证。
    pathParams: [],
    knownSwitches: ['-passthru', '-usetransaction'],
    knownValueParams: ['-stackname'],
  },
  'select-xml': {
    operationType: 'read',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: [],
    knownValueParams: ['-xml', '-content', '-xpath', '-namespace'],
  },
  'get-winevent': {
    operationType: 'read',
    // Get-WinEvent 仅有 -Path，无 -LiteralPath
    pathParams: ['-path'],
    knownSwitches: ['-force', '-oldest'],
    knownValueParams: [
      '-listlog',
      '-logname',
      '-listprovider',
      '-providername',
      '-maxevents',
      '-computername',
      '-credential',
      '-filterxpath',
      '-filterxml',
      '-filterhashtable',
    ],
  },
  // 带有输出参数的写入路径类 cmdlet。若无这些条目，-OutFile / -DestinationPath 将不受验证地写入任意路径。
  'invoke-webrequest': {
    operationType: 'write',
    // -OutFile 是写入目标；-InFile 是读取源（上传本地文件）。两者均需在 pathParams 中以便咨询拒绝规则。
    pathParams: ['-outfile', '-infile'],
    positionalSkip: 1, // 位置 0 是 -Uri（URL），非文件系统路径
    optionalWrite: true, // 仅在带有 -OutFile 时写入；裸 iwr 仅为管道输出
    knownSwitches: [
      '-allowinsecureredirect',
      '-allowunencryptedauthentication',
      '-disablekeepalive',
      '-nobodyprogress',
      '-passthru',
      '-preservefileauthorizationmetadata',
      '-resume',
      '-skipcertificatecheck',
      '-skipheadervalidation',
      '-skiphttperrorcheck',
      '-usebasicparsing',
      '-usedefaultcredentials',
    ],
    knownValueParams: [
      '-uri',
      '-method',
      '-body',
      '-contenttype',
      '-headers',
      '-maximumredirection',
      '-maximumretrycount',
      '-proxy',
      '-proxycredential',
      '-retryintervalsec',
      '-sessionvariable',
      '-timeoutsec',
      '-token',
      '-transferencoding',
      '-useragent',
      '-websession',
      '-credential',
      '-authentication',
      '-certificate',
      '-certificatethumbprint',
      '-form',
      '-httpversion',
    ],
  },
  'invoke-restmethod': {
    operationType: 'write',
    // -OutFile 是写入目标；-InFile 是读取源（上传本地文件）。两者均需在 pathParams 中以便咨询拒绝规则。
    pathParams: ['-outfile', '-infile'],
    positionalSkip: 1, // 位置 0 是 -Uri（URL），非文件系统路径
    optionalWrite: true, // 仅在带有 -OutFile 时写入；裸 irm 仅为管道输出
    knownSwitches: [
      '-allowinsecureredirect',
      '-allowunencryptedauthentication',
      '-disablekeepalive',
      '-followrellink',
      '-nobodyprogress',
      '-passthru',
      '-preservefileauthorizationmetadata',
      '-resume',
      '-skipcertificatecheck',
      '-skipheadervalidation',
      '-skiphttperrorcheck',
      '-usebasicparsing',
      '-usedefaultcredentials',
    ],
    knownValueParams: [
      '-uri',
      '-method',
      '-body',
      '-contenttype',
      '-headers',
      '-maximumfollowrellink',
      '-maximumredirection',
      '-maximumretrycount',
      '-proxy',
      '-proxycredential',
      '-responseheaderstvariable',
      '-retryintervalsec',
      '-sessionvariable',
      '-statuscodevariable',
      '-timeoutsec',
      '-token',
      '-transferencoding',
      '-useragent',
      '-websession',
      '-credential',
      '-authentication',
      '-certificate',
      '-certificatethumbprint',
      '-form',
      '-httpversion',
    ],
  },
  'expand-archive': {
    operationType: 'write',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp', '-destinationpath'],
    knownSwitches: ['-force', '-passthru', '-whatif', '-confirm'],
    knownValueParams: [],
  },
  'compress-archive': {
    operationType: 'write',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp', '-destinationpath'],
    knownSwitches: ['-force', '-update', '-passthru', '-whatif', '-confirm'],
    knownValueParams: ['-compressionlevel'],
  },
  // *-ItemProperty cmdlet：主要用途为注册表提供程序（在注册表项下设置/新建/删除值）。
  // 提供程序限定路径（HKLM:\\、HKCU:\\）已在 powershellPermissions.ts 的第 3.5 步中被独立捕获。
  // 此处条目为纵深防御，用于咨询 Edit-deny 规则，与 set-item 的理由镜像。
  'set-itemproperty': {
    operationType: 'write',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: [
      '-passthru',
      '-force',
      '-whatif',
      '-confirm',
      '-usetransaction',
    ],
    knownValueParams: [
      '-name',
      '-value',
      '-type',
      '-filter',
      '-include',
      '-exclude',
      '-credential',
      '-inputobject',
    ],
  },
  'new-itemproperty': {
    operationType: 'write',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-force', '-whatif', '-confirm', '-usetransaction'],
    knownValueParams: [
      '-name',
      '-value',
      '-propertytype',
      '-type',
      '-filter',
      '-include',
      '-exclude',
      '-credential',
    ],
  },
  'remove-itemproperty': {
    operationType: 'write',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-force', '-whatif', '-confirm', '-usetransaction'],
    knownValueParams: [
      '-name',
      '-filter',
      '-include',
      '-exclude',
      '-credential',
    ],
  },
  'clear-item': {
    operationType: 'write',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: ['-force', '-whatif', '-confirm', '-usetransaction'],
    knownValueParams: ['-filter', '-include', '-exclude', '-credential'],
  },
  'export-alias': {
    operationType: 'write',
    pathParams: ['-path', '-literalpath', '-pspath', '-lp'],
    knownSwitches: [
      '-append',
      '-force',
      '-noclobber',
      '-passthru',
      '-whatif',
      '-confirm',
    ],
    knownValueParams: ['-name', '-description', '-scope', '-as'],
  },
}

/**
 * 检查小写参数名称（带前导短横线）是否与给定参数列表中的任何条目匹配，
 * 考虑 PowerShell 的前缀匹配行为（例如 -Lit 匹配 -LiteralPath）。
 */
function matchesParam(paramLower: string, paramList: string[]): boolean {
  for (const p of paramList) {
    if (
      p === paramLower ||
      (paramLower.length > 1 && p.startsWith(paramLower))
    ) {
      return true
    }
  }
  return false
}

/**
 * 若冒号语法值中包含会掩盖实际运行时路径的表达式构造（数组、子表达式、变量、反引号转义），则返回 true。
 * 外层的 CommandParameterAst 'Parameter' 元素类型会将这些构造隐藏于我们的 AST 遍历之外，因此我们必须通过文本方式检测它们。
 *
 * 用于 extractPathsFromCommand 中的三个分支：pathParams、leafOnlyPathParams 以及未知参数的纵深防御分支。
 */
function hasComplexColonValue(rawValue: string): boolean {
  return (
    rawValue.includes(',') ||
    rawValue.startsWith('(') ||
    rawValue.startsWith('[') ||
    rawValue.includes('`') ||
    rawValue.includes('@(') ||
    rawValue.startsWith('@{') ||
    rawValue.includes('$')
  )
}

function formatDirectoryList(directories: string[]): string {
  const dirCount = directories.length
  if (dirCount <= MAX_DIRS_TO_LIST) {
    return directories.map(dir => `'${dir}'`).join(', ')
  }
  const firstDirs = directories
    .slice(0, MAX_DIRS_TO_LIST)
    .map(dir => `'${dir}'`)
    .join(', ')
  return `${firstDirs}，以及其余 ${dirCount - MAX_DIRS_TO_LIST} 个`
}

/**
 * 将路径开头的波浪号（~）展开为用户主目录。
 */
function expandTilde(filePath: string): string {
  if (
    filePath === '~' ||
    filePath.startsWith('~/') ||
    filePath.startsWith('~\\')
  ) {
    return homedir() + filePath.slice(1)
  }
  return filePath
}

/**
 * 检查用户提供的原始路径（在 realpath 之前）是否为危险的删除目标。
 * safeResolvePath/realpathSync 会以破坏 isDangerousRemovalPath 的方式规范化路径：
 * 在 Windows 上 '/' → 'C:\'（导致 === '/' 检查失败）；
 * 在 macOS 上 homedir() 可能位于 /var 下，realpathSync 会将其改写为 /private/var（导致 === homedir() 检查失败）。
 * 检查已展开波浪号、反斜杠规范化的形式能够捕获用户键入的危险形状（/、~、/etc、/usr）。
 */
export function isDangerousRemovalRawPath(filePath: string): boolean {
  const expanded = expandTilde(filePath.replace(/^['"]|['"]$/g, '')).replace(
    /\\/g,
    '/',
  )
  return isDangerousRemovalPath(expanded)
}

export function dangerousRemovalDeny(path: string): PermissionResult {
  return {
    behavior: 'deny',
    message: `对系统路径 '${path}' 执行 Remove-Item 已被阻止。此路径受保护，禁止删除。`,
    decisionReason: {
      type: 'other',
      reason: '删除操作针对受保护的系统路径',
    },
  }
}

/**
 * 检查已解析的路径对于给定操作类型是否允许。
 * 镜像 BashTool/pathValidation.ts 中的 isPathAllowed 逻辑。
 */
function isPathAllowed(
  resolvedPath: string,
  context: ToolPermissionContext,
  operationType: FileOperationType,
  precomputedPathsToCheck?: readonly string[],
): PathCheckResult {
  const permissionType = operationType === 'read' ? 'read' : 'edit'

  // 1. 首先检查拒绝规则
  const denyRule = matchingRuleForInput(
    resolvedPath,
    context,
    permissionType,
    'deny',
  )
  if (denyRule !== null) {
    return {
      allowed: false,
      decisionReason: { type: 'rule', rule: denyRule },
    }
  }

  // 2. 对于写入/创建操作，检查内部可编辑路径（计划文件、scratchpad、agent 内存、job 目录）
  // 这必须在 checkPathSafetyForAutoEdit 之前进行，因为 .claude 是一个危险目录，
  // 而内部可编辑路径位于 ~/.claude/ 下——与 checkWritePermissionForTool（filesystem.ts 第 1.5 步）的顺序一致。
  if (operationType !== 'read') {
    const internalEditResult = checkEditableInternalPath(resolvedPath, {})
    if (internalEditResult.behavior === 'allow') {
      return {
        allowed: true,
        decisionReason: internalEditResult.decisionReason,
      }
    }
  }

  // 2.5. 对于写入/创建操作，进行安全性校验
  if (operationType !== 'read') {
    const safetyCheck = checkPathSafetyForAutoEdit(
      resolvedPath,
      precomputedPathsToCheck,
    )
    if (!safetyCheck.safe) {
      return {
        allowed: false,
        decisionReason: {
          type: 'safetyCheck',
          reason: safetyCheck.message,
          classifierApprovable: safetyCheck.classifierApprovable,
        },
      }
    }
  }

  // 3. 检查路径是否位于允许的工作目录内
  const isInWorkingDir = pathInAllowedWorkingPath(
    resolvedPath,
    context,
    precomputedPathsToCheck,
  )
  if (isInWorkingDir) {
    if (operationType === 'read' || context.mode === 'acceptEdits') {
      return { allowed: true }
    }
  }

  // 3.5. 对于读操作，检查内部可读路径
  if (operationType === 'read') {
    const internalReadResult = checkReadableInternalPath(resolvedPath, {})
    if (internalReadResult.behavior === 'allow') {
      return {
        allowed: true,
        decisionReason: internalReadResult.decisionReason,
      }
    }
  }

  // 3.7. 对于针对工作目录外部的写入/创建操作，检查沙箱写入白名单。
  // 当启用沙箱时，用户已显式配置可写目录（例如 /tmp/claude/）——
  // 将这些目录视为额外的允许写入目录，以避免重定向/Out-File/New-Item 产生不必要的提示。
  // 位于工作目录内部的路径被排除：沙箱白名单始终包含 '.'（当前工作目录），这会在第 3 步绕过 acceptEdits 关口。
  if (
    operationType !== 'read' &&
    !isInWorkingDir &&
    isPathInSandboxWriteAllowlist(resolvedPath)
  ) {
    return {
      allowed: true,
      decisionReason: {
        type: 'other',
        reason: '路径位于沙箱写入白名单内',
      },
    }
  }

  // 4. 检查允许规则
  const allowRule = matchingRuleForInput(
    resolvedPath,
    context,
    permissionType,
    'allow',
  )
  if (allowRule !== null) {
    return {
      allowed: true,
      decisionReason: { type: 'rule', rule: allowRule },
    }
  }

  // 5. 路径未被允许
  return { allowed: false }
}

/**
 * 对于被 :: 或反引号语法掩盖的路径，尽力进行拒绝规则检查。
 * 仅检查拒绝规则——绝不自动允许。若剥离后的猜测路径未匹配拒绝规则，则如往常一样回退至询问。
 */
function checkDenyRuleForGuessedPath(
  strippedPath: string,
  cwd: string,
  toolPermissionContext: ToolPermissionContext,
  operationType: FileOperationType,
): { resolvedPath: string; rule: PermissionRule } | null {
  // 红队 P7：空字节会使 expandPath 抛出异常。此为既有问题，但既然我们引入了新的调用路径，在此处进行防御。
  if (!strippedPath || strippedPath.includes('\0')) return null
  // 红队 P3：`~/.ssh/x 剥离后为 ~/.ssh/x，但 expandTilde 仅在开头触发——反引号位于其前面。此处重新执行。
  const tildeExpanded = expandTilde(strippedPath)
  const abs = isAbsolute(tildeExpanded)
    ? tildeExpanded
    : resolve(cwd, tildeExpanded)
  const { resolvedPath } = safeResolvePath(getFsImplementation(), abs)
  const permissionType = operationType === 'read' ? 'read' : 'edit'
  const denyRule = matchingRuleForInput(
    resolvedPath,
    toolPermissionContext,
    permissionType,
    'deny',
  )
  return denyRule ? { resolvedPath, rule: denyRule } : null
}

/**
 * 验证文件系统路径，处理波浪号展开。
 */
function validatePath(
  filePath: string,
  cwd: string,
  toolPermissionContext: ToolPermissionContext,
  operationType: FileOperationType,
): ResolvedPathCheckResult {
  // 移除可能存在的包裹引号
  const cleanPath = expandTilde(filePath.replace(/^['"]|['"]$/g, ''))

  // 安全性：PowerShell Core 在所有平台上均将反斜杠规范化为正斜杠，但在 Linux/Mac 上 path.resolve 会将其视为字面量字符。
  // 在解析前进行规范化，以便正确检测诸如 dir\..\..\etc\shadow 的穿越模式。
  const normalizedPath = cleanPath.replace(/\\/g, '/')

  // 安全性：反引号（`）是 PowerShell 的转义字符。它在许多位置是无操作（例如 `/ === /），
  // 但会挫败 Node.js 的路径检查，如 isAbsolute()。重定向目标使用原始的 .Extent.Text，其中保留了反引号转义。
  // 将任何包含反引号的路径视为不可验证。
  if (normalizedPath.includes('`')) {
    // 红队 P3：反引号对于 StringConstant 参数已被解析器使用 .value 解析；
    // 此守卫主要针对使用原始 .Extent.Text 的重定向目标。剥离对于大多数特殊转义（`n → n）是无效操作，
    // 但可以接受——错误的猜测 → 不匹配拒绝规则 → 回退至询问。
    const backtickStripped = normalizedPath.replace(/`/g, '')
    const denyHit = checkDenyRuleForGuessedPath(
      backtickStripped,
      cwd,
      toolPermissionContext,
      operationType,
    )
    if (denyHit) {
      return {
        allowed: false,
        resolvedPath: denyHit.resolvedPath,
        decisionReason: { type: 'rule', rule: denyHit.rule },
      }
    }
    return {
      allowed: false,
      resolvedPath: normalizedPath,
      decisionReason: {
        type: 'other',
        reason: '路径中的反引号转义字符无法静态验证，需要手动批准',
      },
    }
  }

  // 安全性：阻止模块限定的提供程序路径。PowerShell 允许 `Microsoft.PowerShell.Core\FileSystem::/etc/passwd`，
  // 它通过 FileSystem 提供程序解析为 `/etc/passwd`。`::` 是提供程序路径分隔符，不匹配简单的 `^[a-z]{2,}:` 正则。
  if (normalizedPath.includes('::')) {
    // 剥离第一个 :: 之前（含）的所有内容——同时处理 FileSystem::/path 和 Microsoft.PowerShell.Core\FileSystem::/path。
    // 双 ::（Foo::Bar::/x）仅剥离第一个 → 'Bar::/x' → resolve 使其成为 {cwd}/Bar::/x → 不会匹配真实拒绝规则 → 回退至询问。安全。
    const afterProvider = normalizedPath.slice(normalizedPath.indexOf('::') + 2)
    const denyHit = checkDenyRuleForGuessedPath(
      afterProvider,
      cwd,
      toolPermissionContext,
      operationType,
    )
    if (denyHit) {
      return {
        allowed: false,
        resolvedPath: denyHit.resolvedPath,
        decisionReason: { type: 'rule', rule: denyHit.rule },
      }
    }
    return {
      allowed: false,
      resolvedPath: normalizedPath,
      decisionReason: {
        type: 'other',
        reason: '模块限定的提供程序路径（::）无法静态验证，需要手动批准',
      },
    }
  }

  // 安全性：阻止 UNC 路径——它们可触发网络请求并泄漏 NTLM/Kerberos 凭据
  if (
    normalizedPath.startsWith('//') ||
    /DavWWWRoot/i.test(normalizedPath) ||
    /@SSL@/i.test(normalizedPath)
  ) {
    return {
      allowed: false,
      resolvedPath: normalizedPath,
      decisionReason: {
        type: 'other',
        reason: 'UNC 路径因可能触发网络请求及凭据泄漏而被阻止',
      },
    }
  }

  // 安全性：拒绝包含 shell 展开语法的路径
  if (normalizedPath.includes('$') || normalizedPath.includes('%')) {
    return {
      allowed: false,
      resolvedPath: normalizedPath,
      decisionReason: {
        type: 'other',
        reason: '路径中的变量展开语法需要手动批准',
      },
    }
  }

  // 安全性：阻止非文件系统提供程序路径（env:、HKLM:、alias:、function: 等）
  // 这些路径访问非文件系统资源，必须要求手动批准。
  // 这能捕获冒号语法，例如 -Path:env:HOME，其中提取的值为 'env:HOME'。
  //
  // 平台差异（发现 #21/#28）：
  // - Windows：要求 ':' 前至少有两个字母，以便原生驱动器盘符（C:、D:）能够通过，
  //   并由 path.win32.isAbsolute/resolve 正确处理。
  // - POSIX：任何 <letters>: 前缀均为 PowerShell PSDrive——单字母驱动器路径在 Linux/macOS 上无原生含义。
  //   `New-PSDrive -Name Z -Root /etc` 然后 `Get-Content Z:/secrets` 原本会通过
  //   path.posix.resolve(cwd, 'Z:/secrets') → '{cwd}/Z:/secrets' → 位于 cwd 内部 → 允许，
  //   从而绕过 Read(/etc/**) 拒绝规则。我们无法静态得知 PSDrive 映射到的文件系统根目录，
  //   因此在 POSIX 上将所有驱动器前缀路径视为不可验证。
  // PSDrive 名称包含数字（bug #23）：`New-PSDrive -Name 1 ...` 创建驱动器 `1:` —— 有效的 PSDrive 路径前缀。
  // Windows 正则要求 2 个以上字符以排除单字母原生驱动器盘符（C:、D:）。
  // 使用单个字符类 [a-z0-9] 捕获混合字母数字的 PSDrive 名称，如 `a1:`、`1a:` —— 之前的交替 `[a-z]{2,}|[0-9]+`
  // 会遗漏这类情况，因为 `a1` 既非纯字母也非纯数字。
  const providerPathRegex =
    getPlatform() === 'windows' ? /^[a-z0-9]{2,}:/i : /^[a-z0-9]+:/i
  if (providerPathRegex.test(normalizedPath)) {
    return {
      allowed: false,
      resolvedPath: normalizedPath,
      decisionReason: {
        type: 'other',
        reason: `路径 '${normalizedPath}' 使用了非文件系统提供程序，需要手动批准`,
      },
    }
  }

  // 安全性：阻止写入/创建操作中的 glob 模式
  if (GLOB_PATTERN_REGEX.test(normalizedPath)) {
    if (operationType === 'write' || operationType === 'create') {
      return {
        allowed: false,
        resolvedPath: normalizedPath,
        decisionReason: {
          type: 'other',
          reason: '写入操作中不允许使用 glob 模式。请指定明确的文件路径。',
        },
      }
    }

    // 对于包含路径穿越的读操作（例如 /project/*/../../../etc/shadow），
    // 解析完整路径（包括 glob 字符）并验证该解析后路径。
    // 这可以捕获那些通过 glob 后的 `..` 逃逸工作目录的模式。
    if (containsPathTraversal(normalizedPath)) {
      const absolutePath = isAbsolute(normalizedPath)
        ? normalizedPath
        : resolve(cwd, normalizedPath)
      const { resolvedPath, isCanonical } = safeResolvePath(
        getFsImplementation(),
        absolutePath,
      )
      const result = isPathAllowed(
        resolvedPath,
        toolPermissionContext,
        operationType,
        isCanonical ? [resolvedPath] : undefined,
      )
      return {
        allowed: result.allowed,
        resolvedPath,
        decisionReason: result.decisionReason,
      }
    }

    // 安全性（发现 #15）：读操作的 glob 模式无法静态验证。getGlobBaseDirectory 返回首个 glob 字符前的目录；
    // 仅该基目录会被 realpath 处理。glob 匹配的任何内容（包括符号链接）均未被检查。例如：
    //   /project/*/passwd，其中符号链接 /project/link → /etc
    // 基目录为 /project（被允许），但运行时展开 * 为 'link' 并读取 /etc/passwd。
    // 若不实际展开 glob（需要文件系统访问，且仍面临攻击者在验证后创建符号链接的竞争条件），
    // 我们无法验证 glob 展开内部的符号链接。
    //
    // 仍需对基目录检查拒绝规则，以便显式的 Read(/project/**) 拒绝规则能够触发。若无拒绝规则匹配，则强制询问。
    const basePath = getGlobBaseDirectory(normalizedPath)
    const absoluteBasePath = isAbsolute(basePath)
      ? basePath
      : resolve(cwd, basePath)
    const { resolvedPath } = safeResolvePath(
      getFsImplementation(),
      absoluteBasePath,
    )
    const permissionType = operationType === 'read' ? 'read' : 'edit'
    const denyRule = matchingRuleForInput(
      resolvedPath,
      toolPermissionContext,
      permissionType,
      'deny',
    )
    if (denyRule !== null) {
      return {
        allowed: false,
        resolvedPath,
        decisionReason: { type: 'rule', rule: denyRule },
      }
    }
    return {
      allowed: false,
      resolvedPath,
      decisionReason: {
        type: 'other',
        reason: '路径中的 glob 模式无法静态验证——glob 展开内部的符号链接未被检查。需要手动批准。',
      },
    }
  }

  // 解析路径
  const absolutePath = isAbsolute(normalizedPath)
    ? normalizedPath
    : resolve(cwd, normalizedPath)
  const { resolvedPath, isCanonical } = safeResolvePath(
    getFsImplementation(),
    absolutePath,
  )

  const result = isPathAllowed(
    resolvedPath,
    toolPermissionContext,
    operationType,
    isCanonical ? [resolvedPath] : undefined,
  )
  return {
    allowed: result.allowed,
    resolvedPath,
    decisionReason: result.decisionReason,
  }
}

function getGlobBaseDirectory(filePath: string): string {
  const globMatch = filePath.match(GLOB_PATTERN_REGEX)
  if (!globMatch || globMatch.index === undefined) {
    return filePath
  }
  const beforeGlob = filePath.substring(0, globMatch.index)
  const lastSepIndex = Math.max(
    beforeGlob.lastIndexOf('/'),
    beforeGlob.lastIndexOf('\\'),
  )
  if (lastSepIndex === -1) return '.'
  return beforeGlob.substring(0, lastSepIndex + 1) || '/'
}

/**
 * 可以安全提取为字面量路径字符串的元素类型。
 *
 * 仅具有静态已知字符串值的元素类型才适合进行路径提取。
 * Variable 和 ExpandableString 具有运行时确定的值——尽管它们在后续环节中有防御措施
 * （validatePath 中的 `includes('$')` 检查，以及 hasExpandableStrings 安全标志），
 * 但在此处排除它们是直接防御：在最早期关口即故障安全，而非依赖下游检查来捕获。
 *
 * 任何其他类型（例如用于 ArrayLiteralExpressionAst 的 'Other'、'SubExpression'、
 * 'ScriptBlock'、'Variable'、'ExpandableString'）均无法静态验证，必须强制询问。
 */
const SAFE_PATH_ELEMENT_TYPES = new Set<string>(['StringConstant', 'Parameter'])

/**
 * 从已解析的 PowerShell 命令元素中提取文件路径。
 * 使用 AST 参数查找位置和命名路径参数。
 *
 * 若任何路径参数具有无法静态验证的复杂 elementType（例如数组字面量、子表达式），
 * 则设置 hasUnvalidatablePathArg，以便调用方强制触发询问。
 */
function extractPathsFromCommand(cmd: ParsedCommandElement): {
  paths: string[]
  operationType: FileOperationType
  hasUnvalidatablePathArg: boolean
  optionalWrite: boolean
} {
  const canonical = resolveToCanonical(cmd.name)
  const config = CMDLET_PATH_CONFIG[canonical]

  if (!config) {
    return {
      paths: [],
      operationType: 'read',
      hasUnvalidatablePathArg: false,
      optionalWrite: false,
    }
  }

  // 构建每个 cmdlet 的已知参数集合，合并通用参数。
  const switchParams = [...config.knownSwitches, ...COMMON_SWITCHES]
  const valueParams = [...config.knownValueParams, ...COMMON_VALUE_PARAMS]

  const paths: string[] = []
  const args = cmd.args
  // elementTypes[0] 为命令名称；elementTypes[i+1] 对应 args[i]
  const elementTypes = cmd.elementTypes
  let hasUnvalidatablePathArg = false
  let positionalsSeen = 0
  const positionalSkip = config.positionalSkip ?? 0

  function checkArgElementType(argIdx: number): void {
    if (!elementTypes) return
    const et = elementTypes[argIdx + 1]
    if (et && !SAFE_PATH_ELEMENT_TYPES.has(et)) {
      hasUnvalidatablePathArg = true
    }
  }

  // 提取命名参数值（例如 -Path "C:\foo"）
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg) continue

    // 检查此参数是否为参数名称。
    // 安全性：以 elementTypes 为基准事实。PowerShell 的词法分析器接受短破折号/长破折号/水平线（U+2013/2014/2015）
    // 作为参数前缀；原始的 startsWith('-') 检查会遗漏 `–Path`（短破折号）。解析器将 CommandParameterAst 映射为 'Parameter'，
    // 无论破折号字符为何。isPowerShellParameter 也能正确拒绝带引号的 "-Include"（StringConstant，非参数）。
    const argElementType = elementTypes ? elementTypes[i + 1] : undefined
    if (isPowerShellParameter(arg, argElementType)) {
      // 处理冒号语法：-Path:C:\secret
      // 将 Unicode 破折号规范化为 ASCII `-`（pathParams 以 `-` 存储）。
      const normalized = '-' + arg.slice(1)
      const colonIdx = normalized.indexOf(':', 1) // 跳过首字符（即破折号）
      const paramName =
        colonIdx > 0 ? normalized.substring(0, colonIdx) : normalized
      const paramLower = paramName.toLowerCase()

      if (matchesParam(paramLower, config.pathParams)) {
        // 已知路径参数——将其值提取为路径。
        let value: string | undefined
        if (colonIdx > 0) {
          // 冒号语法：-Path:value —— 整体为一个元素。
          // 安全性：逗号分隔值（例如 -Path:safe.txt,/etc/passwd）会在 CommandParameterAst 内部产生 ArrayLiteralExpressionAst。
          // PowerShell 会写入所有路径，但我们仅能看到单个字符串。
          const rawValue = arg.substring(colonIdx + 1)
          if (hasComplexColonValue(rawValue)) {
            hasUnvalidatablePathArg = true
          } else {
            value = rawValue
          }
        } else {
          // 标准语法：-Path value
          const nextVal = args[i + 1]
          const nextType = elementTypes ? elementTypes[i + 2] : undefined
          if (nextVal && !isPowerShellParameter(nextVal, nextType)) {
            value = nextVal
            checkArgElementType(i + 1)
            i++ // 跳过该值
          }
        }
        if (value) {
          paths.push(value)
        }
      } else if (
        config.leafOnlyPathParams &&
        matchesParam(paramLower, config.leafOnlyPathParams)
      ) {
        // 仅叶子节点的路径参数（例如 New-Item -Name）。PowerShell 会相对于另一参数（-Path）而非 cwd 解析它。
        // validatePath 会相对于 cwd 解析（约第 930 行），因此非叶子值（分隔符、穿越）会解析到错误的位置，
        // 可能遗漏拒绝规则（deny→ask 降级）。提取简单叶子文件名；标记任何类似路径的值。
        let value: string | undefined
        if (colonIdx > 0) {
          const rawValue = arg.substring(colonIdx + 1)
          if (hasComplexColonValue(rawValue)) {
            hasUnvalidatablePathArg = true
          } else {
            value = rawValue
          }
        } else {
          const nextVal = args[i + 1]
          const nextType = elementTypes ? elementTypes[i + 2] : undefined
          if (nextVal && !isPowerShellParameter(nextVal, nextType)) {
            value = nextVal
            checkArgElementType(i + 1)
            i++
          }
        }
        if (value !== undefined) {
          if (
            value.includes('/') ||
            value.includes('\\') ||
            value === '.' ||
            value === '..'
          ) {
            // 非叶子：分隔符或穿越。若不与 -Path 拼接则无法正确解析。强制询问。
            hasUnvalidatablePathArg = true
          } else {
            // 简单叶子：提取。解析为 cwd/leaf（略有偏差——本应为 <-Path>/leaf），
            // 但 -Path 提取已覆盖目录，且叶子文件名无法穿越到任何地方。
            paths.push(value)
          }
        }
      } else if (matchesParam(paramLower, switchParams)) {
        // 已知开关参数——不接受值，不消费下一个参数。
        // （开关上的冒号语法，例如 -Confirm:$false，自包含在单个 token 中，在此处正确落体，不消费后续内容。）
      } else if (matchesParam(paramLower, valueParams)) {
        // 已知的接受值但非路径的参数（例如 -Encoding UTF8、-Filter *.txt）。
        // 消费其值；不将其作为路径验证，但需检查 elementType。
        // 安全性：任何参数位置中的 Variable elementType（例如 $env:DOGE_API_KEY）意味着运行时值无法静态知晓。
        // 若无此检查，`-Value $env:SECRET` 会在 acceptEdits 模式下被静默自动放行，因为 Variable elementType 从未被检查。
        if (colonIdx > 0) {
          // 冒号语法：-Value:$env:FOO —— 值内嵌在 token 中。
          // 外层的 CommandParameterAst 'Parameter' 类型掩盖了内部表达式类型。
          // 检查指示非静态值的表达式标记（镜像 pathParams 的冒号语法守卫）。
          const rawValue = arg.substring(colonIdx + 1)
          if (hasComplexColonValue(rawValue)) {
            hasUnvalidatablePathArg = true
          }
        } else {
          const nextArg = args[i + 1]
          const nextArgType = elementTypes ? elementTypes[i + 2] : undefined
          if (nextArg && !isPowerShellParameter(nextArg, nextArgType)) {
            checkArgElementType(i + 1)
            i++ // 跳过该参数的值
          }
        }
      } else {
        // 未知参数——我们不理解此调用。
        // 安全性：这是对 KNOWN_SWITCH_PARAMS 打地鼠式修补的结构性修复。不再猜测该参数是否为开关
        // （可能吞掉位置路径）或接受值（同样风险），而是将整个命令标记为不可验证。调用方将强制询问。
        hasUnvalidatablePathArg = true
        // 安全性：即使我们不识别此参数，若其使用冒号语法（-UnknownParam:/etc/hosts），绑定的值可能是文件系统路径。
        // 将其提取到 paths[] 中，以便仍能运行拒绝规则匹配。若无此操作，值会被困在单个 token 内，paths=[] 意味着拒绝规则永不被咨询——
        // 将拒绝降级为询问。这是纵深防御：主要修复是在上方将已知别名添加到 pathParams 中。
        if (colonIdx > 0) {
          const rawValue = arg.substring(colonIdx + 1)
          if (!hasComplexColonValue(rawValue)) {
            paths.push(rawValue)
          }
        }
        // 继续循环，以便仍能提取任何可识别的路径（对询问消息有用），但该标志确保整体为 'ask'。
      }
      continue
    }

    // 位置参数：提取为路径（例如 Get-Content file.txt）
    // 第一个位置参数通常是源路径。
    // 跳过作为非路径值的前置位置参数（例如 iwr 的 -Uri）。
    if (positionalsSeen < positionalSkip) {
      positionalsSeen++
      continue
    }
    positionalsSeen++
    checkArgElementType(i)
    paths.push(arg)
  }

  return {
    paths,
    operationType: config.operationType,
    hasUnvalidatablePathArg,
    optionalWrite: config.optionalWrite ?? false,
  }
}

/**
 * 检查 PowerShell 命令的路径约束。
 * 从解析后的 AST 中提取文件路径，并验证其位于允许目录内。
 *
 * @param compoundCommandHasCd - 完整复合命令是否包含改变当前工作目录的 cmdlet
 *   （Set-Location/Push-Location/Pop-Location/New-PSDrive，排除无操作 Set-Location 到当前 CWD 的情况）。
 *   若为 true，则任何语句中的相对路径均不可信——PowerShell 按顺序执行语句，
 *   语句 N 中的 cd 会改变语句 N+1 的 cwd，但此验证器会将所有路径相对于过时的 Node 进程 cwd 进行解析。
 *   与 BashTool 对等（BashTool/pathValidation.ts:630-655）。
 *
 * @returns
 * - 'ask'：若有任何路径命令试图访问允许目录之外的位置
 * - 'deny'：若拒绝规则明确阻止该路径
 * - 'passthrough'：若未发现路径命令或所有路径均有效
 */
export function checkPathConstraints(
  input: { command: string },
  parsed: ParsedPowerShellCommand,
  toolPermissionContext: ToolPermissionContext,
  compoundCommandHasCd = false,
): PermissionResult {
  if (!parsed.valid) {
    return {
      behavior: 'passthrough',
      message: '无法验证未解析命令的路径',
    }
  }

  // 安全性：两遍扫描方法——检查所有语句/路径，确保拒绝规则始终优先于询问。
  // 若无此机制，对语句 1 的询问可能在检查语句 2 的拒绝规则之前返回，使用户可批准包含被拒绝路径的命令。
  let firstAsk: PermissionResult | undefined

  for (const statement of parsed.statements) {
    const result = checkPathConstraintsForStatement(
      statement,
      toolPermissionContext,
      compoundCommandHasCd,
    )
    if (result.behavior === 'deny') {
      return result
    }
    if (result.behavior === 'ask' && !firstAsk) {
      firstAsk = result
    }
  }

  return (
    firstAsk ?? {
      behavior: 'passthrough',
      message: '所有路径约束验证成功',
    }
  )
}

function checkPathConstraintsForStatement(
  statement: ParsedPowerShellCommand['statements'][number],
  toolPermissionContext: ToolPermissionContext,
  compoundCommandHasCd = false,
): PermissionResult {
  const cwd = getCwd()
  let firstAsk: PermissionResult | undefined

  // 安全性：与 BashTool 对等——阻止包含改变 cwd 的 cmdlet 的复合命令中的路径操作（BashTool/pathValidation.ts:630-655）。
  //
  // 当复合命令包含 Set-Location/Push-Location/Pop-Location/New-PSDrive 时，后续语句中的相对路径在运行时相对于已改变的 cwd 解析，
  // 但此验证器会将其相对于过时的 getCwd() 快照进行解析。攻击示例（发现 #3）：
  //   Set-Location ./.claude; Set-Content ./settings.json '...'
  // 验证器将 ./settings.json 解析为 /project/settings.json（非配置文件）。运行时写入 /project/.claude/settings.json（Claude 的权限配置文件）。
  //
  // 备选方案（已拒绝）：通过语句链模拟 cwd——在 `Set-Location ./.claude` 之后，以 cwd='./.claude' 验证后续语句。
  // 这将更为宽松，但需要谨慎处理：
  //   - Push-Location/Pop-Location 的栈语义
  //   - 无参数的 Set-Location（在某些平台上转到主目录）
  //   - New-PSDrive 的根映射（任意文件系统根目录）
  //   - 可能执行或不执行 cd 的条件/循环语句
  //   - 无法静态确定 cd 目标的错误情况
  // 目前我们采取保守方式，要求手动批准。
  //
  // 与 BashTool 仅在 `operationType !== 'read'` 时设置关口不同，我们也阻止读操作（发现 #27）：
  // `Set-Location ~; Get-Content ./.ssh/id_rsa` 绕过了 Read(~/.ssh/**) 拒绝规则，因为验证器将拒绝匹配为 /project/.ssh/id_rsa。
  // 错误解析的路径读取数据泄漏与写入破坏同等严重。我们仍通过 firstAsk（而非提前返回）运行下方的拒绝规则匹配，
  // 以便对过时解析路径的显式拒绝规则得以尊重——拒绝优先于询问。
  if (compoundCommandHasCd) {
    firstAsk = {
      behavior: 'ask',
      message:
        '复合命令改变了工作目录（Set-Location/Push-Location/Pop-Location/New-PSDrive）——相对路径无法相对于原始 cwd 进行验证，需要手动批准',
      decisionReason: {
        type: 'other',
        reason: '复合命令包含 cd 及路径操作——需要手动批准以防止路径解析绕过',
      },
    }
  }

  // 安全性：追踪该语句是否包含非 CommandAst 管道元素（字符串字面量、变量、数组表达式）。
  // PowerShell 将这些值通过管道传递给下游 cmdlet，通常绑定到 -Path。例如：
  // `'/etc/passwd' | Remove-Item` —— 字符串通过管道传递给 Remove-Item 的 -Path，
  // 但 Remove-Item 无显式参数，extractPathsFromCommand 返回零路径，命令将透传。
  // 若任何下游 cmdlet 与表达式源同时出现，我们强制询问——无论操作类型如何，管道传递的路径均无法验证
  //（读操作泄漏数据；写操作破坏数据）。
  let hasExpressionPipelineSource = false
  // 追踪非 CommandAst 元素的文本，以便进行拒绝规则猜测（发现 #23）。
  // `'.git/hooks/pre-commit' | Remove-Item` —— 路径通过管道传入，extractPathsFromCommand 返回 paths=[]，
  // 因此下方的拒绝循环永远不会迭代。我们将管道源文本馈送至 checkDenyRuleForGuessedPath，
  // 以便显式的 Edit(.git/**) 拒绝规则仍能触发。
  let pipelineSourceText: string | undefined

  for (const cmd of statement.commands) {
    if (cmd.elementType !== 'CommandAst') {
      hasExpressionPipelineSource = true
      pipelineSourceText = cmd.text
      continue
    }

    const { paths, operationType, hasUnvalidatablePathArg, optionalWrite } =
      extractPathsFromCommand(cmd)

    // 安全性：cmdlet 通过管道接收来自表达式源的路径。
    // `'/etc/shadow' | Get-Content` —— Get-Content 提取零路径（无显式参数）。路径来自管道，无法静态验证。
    // 此前仅豁免读操作（`operationType !== 'read'`），但这是一个绕过（审查评论 2885739292）：
    // 来自不可验证路径的读操作仍是安全风险。无论操作类型如何，均触发询问。
    if (hasExpressionPipelineSource) {
      const canonical = resolveToCanonical(cmd.name)
      // 安全性（发现 #23）：在回退至询问之前，检查管道源文本是否匹配拒绝规则。
      // 当配置了 Edit(.git/**) 时，`'.git/hooks/pre-commit' | Remove-Item` 应返回 DENY（而非 ask）。
      // 剥离外围引号（字符串字面量在 .text 中带引号），并通过与 ::/反引号路径相同的拒绝猜测辅助函数处理。
      if (pipelineSourceText !== undefined) {
        const stripped = pipelineSourceText.replace(/^['"]|['"]$/g, '')
        const denyHit = checkDenyRuleForGuessedPath(
          stripped,
          cwd,
          toolPermissionContext,
          operationType,
        )
        if (denyHit) {
          return {
            behavior: 'deny',
            message: `${canonical} 针对 '${denyHit.resolvedPath}' 的操作被拒绝规则阻止`,
            decisionReason: { type: 'rule', rule: denyHit.rule },
          }
        }
      }
      firstAsk ??= {
        behavior: 'ask',
        message: `${canonical} 从无法静态验证的管道表达式源接收路径，需要手动批准`,
      }
      // 不要 continue —— 继续执行路径循环，以便仍能检查已提取路径上的拒绝规则。
    }

    // 安全性：数组字面量、子表达式及其他复杂参数类型无法静态验证。
    // 诸如 `-Path ./safe.txt, /etc/passwd` 的数组字面量会产生单个 'Other' 元素，
    // 其组合文本可能解析到 CWD 内部，而 PowerShell 实际上会写入数组中的所有路径。
    if (hasUnvalidatablePathArg) {
      const canonical = resolveToCanonical(cmd.name)
      firstAsk ??= {
        behavior: 'ask',
        message: `${canonical} 使用了无法静态验证的参数或复杂路径表达式（数组字面量、子表达式、未知参数等），需要手动批准`,
      }
      // 不要 continue —— 继续执行路径循环，以便仍能检查已提取路径上的拒绝规则。
    }

    // 安全性：位于 CMDLET_PATH_CONFIG 中但提取了零路径的写入 cmdlet。
    // 可能是 (a) cmdlet 根本无参数（单独的 `Remove-Item` —— PowerShell 会报错，但我们不应乐观假设），
    // 或 (b) 我们未能识别参数中的路径（在未知参数故障安全机制下不应发生，但此为纵深防御）。
    // 保守处理：无验证目标的写入操作 → 询问。读操作及 pop-location（pathParams: []）被豁免。
    // optionalWrite cmdlet（无 -OutFile 的 Invoke-WebRequest/Invoke-RestMethod）同样被豁免——
    // 它们仅在存在 pathParam 时才写入磁盘；无此参数时，输出进入管道。
    // 上文的 hasUnvalidatablePathArg 检查已覆盖未知参数情况。
    if (
      operationType !== 'read' &&
      !optionalWrite &&
      paths.length === 0 &&
      CMDLET_PATH_CONFIG[resolveToCanonical(cmd.name)]
    ) {
      const canonical = resolveToCanonical(cmd.name)
      firstAsk ??= {
        behavior: 'ask',
        message: `${canonical} 是一个写入操作，但无法确定目标路径；需要手动批准`,
      }
      continue
    }

    // 安全性：与 Bash 对等的，对系统关键路径上的删除 cmdlet 执行硬性拒绝。
    // BashTool 中有 isDangerousRemovalPath，无论用户配置如何，均会硬性拒绝 `rm /`、`rm ~`、`rm /etc` 等。
    // 移植：对危险路径的 remove-item（及其别名 rm/del/ri/rd/rmdir/erase → resolveToCanonical）
    // 执行拒绝（非询问）。用户无法批准删除 system32。
    const isRemoval = resolveToCanonical(cmd.name) === 'remove-item'

    for (const filePath of paths) {
      // 对危险系统路径（/、~、/etc 等）的删除进行硬性拒绝。
      // 首先检查原始路径（pre-realpath）：safeResolvePath 会将 '/' 规范化为 'C:\'（Windows）
      // 或 '/var/...' → '/private/var/...'（macOS），这会破坏 isDangerousRemovalPath 的字符串比较。
      if (isRemoval && isDangerousRemovalRawPath(filePath)) {
        return dangerousRemovalDeny(filePath)
      }

      const { allowed, resolvedPath, decisionReason } = validatePath(
        filePath,
        cwd,
        toolPermissionContext,
        operationType,
      )

      // 同时检查解析后的路径——捕获解析到受保护位置的符号链接。
      if (isRemoval && isDangerousRemovalPath(resolvedPath)) {
        return dangerousRemovalDeny(resolvedPath)
      }

      if (!allowed) {
        const canonical = resolveToCanonical(cmd.name)
        const workingDirs = Array.from(
          allWorkingDirectories(toolPermissionContext),
        )
        const dirListStr = formatDirectoryList(workingDirs)

        const message =
          decisionReason?.type === 'other' ||
          decisionReason?.type === 'safetyCheck'
            ? decisionReason.reason
            : `${canonical} 针对 '${resolvedPath}' 的操作被阻止。出于安全考虑，Claude Code 仅可访问此会话允许的工作目录中的文件：${dirListStr}。`

        if (decisionReason?.type === 'rule') {
          return {
            behavior: 'deny',
            message,
            decisionReason,
          }
        }

        const suggestions: PermissionUpdate[] = []
        if (resolvedPath) {
          if (operationType === 'read') {
            const suggestion = createReadRuleSuggestion(
              getDirectoryForPath(resolvedPath),
              'session',
            )
            if (suggestion) {
              suggestions.push(suggestion)
            }
          } else {
            suggestions.push({
              type: 'addDirectories',
              directories: [getDirectoryForPath(resolvedPath)],
              destination: 'session',
            })
          }
        }

        if (operationType === 'write' || operationType === 'create') {
          suggestions.push({
            type: 'setMode',
            mode: 'acceptEdits',
            destination: 'session',
          })
        }

        firstAsk ??= {
          behavior: 'ask',
          message,
          blockedPath: resolvedPath,
          decisionReason,
          suggestions,
        }
      }
    }
  }

  // 同时检查来自控制流的嵌套命令
  if (statement.nestedCommands) {
    for (const cmd of statement.nestedCommands) {
      const { paths, operationType, hasUnvalidatablePathArg, optionalWrite } =
        extractPathsFromCommand(cmd)

      if (hasUnvalidatablePathArg) {
        const canonical = resolveToCanonical(cmd.name)
        firstAsk ??= {
          behavior: 'ask',
          message: `${canonical} 使用了无法静态验证的参数或复杂路径表达式（数组字面量、子表达式、未知参数等），需要手动批准`,
        }
        // 不要 continue —— 继续执行路径循环以进行拒绝检查。
      }

      // 安全性：提取零路径的写入 cmdlet（镜像主循环）。optionalWrite cmdlet 被豁免——参见主循环注释。
      if (
        operationType !== 'read' &&
        !optionalWrite &&
        paths.length === 0 &&
        CMDLET_PATH_CONFIG[resolveToCanonical(cmd.name)]
      ) {
        const canonical = resolveToCanonical(cmd.name)
        firstAsk ??= {
          behavior: 'ask',
          message: `${canonical} 是一个写入操作，但无法确定目标路径；需要手动批准`,
        }
        continue
      }

      // 安全性：与 Bash 对等的，对系统关键路径上的删除进行硬性拒绝——镜像上方主循环检查。
      // 若无此检查，`if ($true) { Remove-Item / }` 会通过 nestedCommands 路径并将拒绝降级为询问，
      // 使用户可批准删除根目录。
      const isRemoval = resolveToCanonical(cmd.name) === 'remove-item'

      for (const filePath of paths) {
        // 首先检查原始路径（pre-realpath）；参见主循环注释。
        if (isRemoval && isDangerousRemovalRawPath(filePath)) {
          return dangerousRemovalDeny(filePath)
        }

        const { allowed, resolvedPath, decisionReason } = validatePath(
          filePath,
          cwd,
          toolPermissionContext,
          operationType,
        )

        if (isRemoval && isDangerousRemovalPath(resolvedPath)) {
          return dangerousRemovalDeny(resolvedPath)
        }

        if (!allowed) {
          const canonical = resolveToCanonical(cmd.name)
          const workingDirs = Array.from(
            allWorkingDirectories(toolPermissionContext),
          )
          const dirListStr = formatDirectoryList(workingDirs)

          const message =
            decisionReason?.type === 'other' ||
            decisionReason?.type === 'safetyCheck'
              ? decisionReason.reason
              : `${canonical} 针对 '${resolvedPath}' 的操作被阻止。出于安全考虑，Claude Code 仅可访问此会话允许的工作目录中的文件：${dirListStr}。`

          if (decisionReason?.type === 'rule') {
            return {
              behavior: 'deny',
              message,
              decisionReason,
            }
          }

          const suggestions: PermissionUpdate[] = []
          if (resolvedPath) {
            if (operationType === 'read') {
              const suggestion = createReadRuleSuggestion(
                getDirectoryForPath(resolvedPath),
                'session',
              )
              if (suggestion) {
                suggestions.push(suggestion)
              }
            } else {
              suggestions.push({
                type: 'addDirectories',
                directories: [getDirectoryForPath(resolvedPath)],
                destination: 'session',
              })
            }
          }

          if (operationType === 'write' || operationType === 'create') {
            suggestions.push({
              type: 'setMode',
              mode: 'acceptEdits',
              destination: 'session',
            })
          }

          firstAsk ??= {
            behavior: 'ask',
            message,
            blockedPath: resolvedPath,
            decisionReason,
            suggestions,
          }
        }
      }

      // 红队 P11/P14：powershellPermissions.ts:970 的第 5 步已通过相同的合成 CommandExpressionAst 机制捕获此情况——
      // 此处是双重保险，使嵌套循环不依赖该偶然捕获。置于路径循环之后，以便特定的询问（blockedPath、suggestions）通过 ??= 优先胜出。
      if (hasExpressionPipelineSource) {
        firstAsk ??= {
          behavior: 'ask',
          message: `${resolveToCanonical(cmd.name)} 出现在控制流或链式语句中，其中的管道表达式源无法静态验证，需要手动批准`,
        }
      }
    }
  }

  // 检查嵌套命令上的重定向（例如来自 && / || 链）
  if (statement.nestedCommands) {
    for (const cmd of statement.nestedCommands) {
      if (cmd.redirections) {
        for (const redir of cmd.redirections) {
          if (redir.isMerging) continue
          if (!redir.target) continue
          if (isNullRedirectionTarget(redir.target)) continue

          const { allowed, resolvedPath, decisionReason } = validatePath(
            redir.target,
            cwd,
            toolPermissionContext,
            'create',
          )

          if (!allowed) {
            const workingDirs = Array.from(
              allWorkingDirectories(toolPermissionContext),
            )
            const dirListStr = formatDirectoryList(workingDirs)

            const message =
              decisionReason?.type === 'other' ||
              decisionReason?.type === 'safetyCheck'
                ? decisionReason.reason
                : `输出重定向到 '${resolvedPath}' 被阻止。出于安全考虑，Claude Code 仅可写入此会话允许的工作目录中的文件：${dirListStr}。`

            if (decisionReason?.type === 'rule') {
              return {
                behavior: 'deny',
                message,
                decisionReason,
              }
            }

            firstAsk ??= {
              behavior: 'ask',
              message,
              blockedPath: resolvedPath,
              decisionReason,
              suggestions: [
                {
                  type: 'addDirectories',
                  directories: [getDirectoryForPath(resolvedPath)],
                  destination: 'session',
                },
              ],
            }
          }
        }
      }
    }
  }

  // 检查文件重定向
  if (statement.redirections) {
    for (const redir of statement.redirections) {
      if (redir.isMerging) continue
      if (!redir.target) continue
      if (isNullRedirectionTarget(redir.target)) continue

      const { allowed, resolvedPath, decisionReason } = validatePath(
        redir.target,
        cwd,
        toolPermissionContext,
        'create',
      )

      if (!allowed) {
        const workingDirs = Array.from(
          allWorkingDirectories(toolPermissionContext),
        )
        const dirListStr = formatDirectoryList(workingDirs)

        const message =
          decisionReason?.type === 'other' ||
          decisionReason?.type === 'safetyCheck'
            ? decisionReason.reason
            : `输出重定向到 '${resolvedPath}' 被阻止。出于安全考虑，Claude Code 仅可写入此会话允许的工作目录中的文件：${dirListStr}。`

        if (decisionReason?.type === 'rule') {
          return {
            behavior: 'deny',
            message,
            decisionReason,
          }
        }

        firstAsk ??= {
          behavior: 'ask',
          message,
          blockedPath: resolvedPath,
          decisionReason,
          suggestions: [
            {
              type: 'addDirectories',
              directories: [getDirectoryForPath(resolvedPath)],
              destination: 'session',
            },
          ],
        }
      }
    }
  }

  return (
    firstAsk ?? {
      behavior: 'passthrough',
      message: '所有路径约束验证成功',
    }
  )
}