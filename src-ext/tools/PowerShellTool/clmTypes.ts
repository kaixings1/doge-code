/**
 * PowerShell 约束语言模式允许的类型。
 *
 * 当 PowerShell 在 AppLocker/WDAC 系统锁定下运行时，Microsoft 的 CLM 将 .NET 类型的使用限制在此允许列表中。
 * 任何不在此集合中的类型都被视为对不受信任的代码执行不安全。
 *
 * 我们将其反转：不在此集合中的类型字面量 → 询问。一个规范化的检查取代了枚举单个危险类型
 * （命名管道、反射、进程生成、P/Invoke 封送等）。Microsoft 维护该列表。
 *
 * 来源：https://learn.microsoft.com/zh-cn/powershell/module/microsoft.powershell.core/about/about_language_modes
 *
 * 规范化：条目以小写形式存储，同时存储短名称和完整名称（如果两者都存在）
 * （PowerShell 在运行时将类型加速器如 [int] 解析为 System.Int32；我们根据 AST 输出的字面文本进行匹配）。
 */
export const CLM_ALLOWED_TYPES: ReadonlySet<string> = new Set(
  [
    // 类型加速器（AST TypeName.Name 中出现的短名称）
    // 安全性：'adsi' 和 'adsisearcher' 已移除。两者都是 Active Directory 服务接口类型，
    // 在类型转换时会执行网络绑定：
    //   [adsi]'LDAP://evil.com/...' → 连接到 LDAP 服务器
    //   [adsisearcher]'(objectClass=user)' → 绑定到 AD 并执行查询
    // Microsoft 的 CLM 允许这些类型，因为它是为可信域中的 Windows 管理员设计的；
    // 我们阻止它们，因为目标未经验证。
    'alias',
    'allowemptycollection',
    'allowemptystring',
    'allownull',
    'argumentcompleter',
    'argumentcompletions',
    'array',
    'bigint',
    'bool',
    'byte',
    'char',
    'cimclass',
    'cimconverter',
    'ciminstance',
    // 'cimsession' 已移除 — 请参阅下方关于 wmi/adsi 的注释
    'cimtype',
    'cmdletbinding',
    'cultureinfo',
    'datetime',
    'decimal',
    'double',
    'dsclocalconfigurationmanager',
    'dscproperty',
    'dscresource',
    'experimentaction',
    'experimental',
    'experimentalfeature',
    'float',
    'guid',
    'hashtable',
    'int',
    'int16',
    'int32',
    'int64',
    'ipaddress',
    'ipendpoint',
    'long',
    'mailaddress',
    'norunspaceaffinity',
    'nullstring',
    'objectsecurity',
    'ordered',
    'outputtype',
    'parameter',
    'physicaladdress',
    'pscredential',
    'pscustomobject',
    'psdefaultvalue',
    'pslistmodifier',
    'psobject',
    'psprimitivedictionary',
    'pstypenameattribute',
    'ref',
    'regex',
    'sbyte',
    'securestring',
    'semver',
    'short',
    'single',
    'string',
    'supportswildcards',
    'switch',
    'timespan',
    'uint',
    'uint16',
    'uint32',
    'uint64',
    'ulong',
    'uri',
    'ushort',
    'validatecount',
    'validatedrive',
    'validatelength',
    'validatenotnull',
    'validatenotnullorempty',
    'validatenotnullorwhitespace',
    'validatepattern',
    'validaterange',
    'validatescript',
    'validateset',
    'validatetrusteddata',
    'validateuserdrive',
    'version',
    'void',
    'wildcardpattern',
    // 安全性：'wmi'、'wmiclass'、'wmisearcher'、'cimsession' 已移除。
    // WMI 类型转换会执行 WMI 查询，可能以远程计算机为目标（网络请求）并访问危险类，如 Win32_Process。
    // cimsession 会创建 CIM 会话（与远程主机的网络连接）。
    //   [wmi]'\\evil-host\root\cimv2:Win32_Process.Handle="1"' → 远程 WMI
    //   [wmisearcher]'SELECT * FROM Win32_Process' → 运行 WQL 查询
    // 与上述移除 adsi/adsisearcher 的理由相同。
    'x500distinguishedname',
    'x509certificate',
    'xml',
    // 解析为 System.* 的加速器的完整名称（AST 可能输出其中任何一种）
    'system.array',
    'system.boolean',
    'system.byte',
    'system.char',
    'system.datetime',
    'system.decimal',
    'system.double',
    'system.guid',
    'system.int16',
    'system.int32',
    'system.int64',
    'system.numerics.biginteger',
    'system.sbyte',
    'system.single',
    'system.string',
    'system.timespan',
    'system.uint16',
    'system.uint32',
    'system.uint64',
    'system.uri',
    'system.version',
    'system.void',
    'system.collections.hashtable',
    'system.text.regularexpressions.regex',
    'system.globalization.cultureinfo',
    'system.net.ipaddress',
    'system.net.ipendpoint',
    'system.net.mail.mailaddress',
    'system.net.networkinformation.physicaladdress',
    'system.security.securestring',
    'system.security.cryptography.x509certificates.x509certificate',
    'system.security.cryptography.x509certificates.x500distinguishedname',
    'system.xml.xmldocument',
    // System.Management.Automation.* — PS 特定加速器的完全限定等价物
    'system.management.automation.pscredential',
    'system.management.automation.pscustomobject',
    'system.management.automation.pslistmodifier',
    'system.management.automation.psobject',
    'system.management.automation.psprimitivedictionary',
    'system.management.automation.psreference',
    'system.management.automation.semanticversion',
    'system.management.automation.switchparameter',
    'system.management.automation.wildcardpattern',
    'system.management.automation.language.nullstring',
    // Microsoft.Management.Infrastructure.* — CIM 加速器的完全限定等价物
    // 安全性：cimsession 的完全限定名已移除 — 与短名称相同的网络绑定风险
    // （创建到远程主机的 CIM 会话）。
    'microsoft.management.infrastructure.cimclass',
    'microsoft.management.infrastructure.cimconverter',
    'microsoft.management.infrastructure.ciminstance',
    'microsoft.management.infrastructure.cimtype',
    // 其余短名称加速器的完全限定等价物
    // 安全性：DirectoryEntry/DirectorySearcher/ManagementObject/
    // ManagementClass/ManagementObjectSearcher 的完全限定名已移除 — 与短名称 adsi/adsisearcher/wmi/wmiclass/wmisearcher
    // 相同的网络绑定风险（LDAP 绑定、远程 WMI）。请参阅上方短名称移除的注释。
    'system.collections.specialized.ordereddictionary',
    'system.security.accesscontrol.objectsecurity',
    // 允许类型的数组也是允许的（例如 [string[]]）
    // normalizeTypeName 在查找前会剥离 []，因此存储基础名称
    'object',
    'system.object',
    // ModuleSpecification — 完全限定名称
    'microsoft.powershell.commands.modulespecification',
  ].map(t => t.toLowerCase()),
)

/**
 * 规范化来自 AST TypeName.FullName 或 TypeName.Name 的类型名称。
 * 处理数组后缀（[]）和泛型括号。
 */
export function normalizeTypeName(name: string): string {
  // 剥离数组后缀："String[]" → "string"（允许类型的数组是允许的）
  // 剥离泛型参数："List[int]" → "list"（保守做法 — 即使类型参数安全，泛型包装器可能仍不安全，
  // 因此我们检查外部类型）
  return name
    .toLowerCase()
    .replace(/\[\]$/, '')
    .replace(/\[.*\]$/, '')
    .trim()
}

/**
 * 如果 typeName（来自 AST）在 Microsoft 的 CLM 允许列表中，则返回 true。
 * 不在此集合中的类型会触发询问 — 它们会访问 CLM 阻止的系统 API。
 */
export function isClmAllowedType(typeName: string): boolean {
  return CLM_ALLOWED_TYPES.has(normalizeTypeName(typeName))
}