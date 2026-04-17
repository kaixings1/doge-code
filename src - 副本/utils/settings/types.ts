import { feature } from 'bun:bundle'
import { z } from 'zod/v4'
import { SandboxSettingsSchema } from '../../entrypoints/sandboxTypes.js'
import { isEnvTruthy } from '../envUtils.js'
import { lazySchema } from '../lazySchema.js'
import {
  EXTERNAL_PERMISSION_MODES,
  PERMISSION_MODES,
} from '../permissions/PermissionMode.js'
import { MarketplaceSourceSchema } from '../plugins/schemas.js'
import { CLAUDE_CODE_SETTINGS_SCHEMA_URL } from './constants.js'
import { PermissionRuleSchema } from './permissionValidation.js'

// 为了向后兼容，从中心位置重新导出钩子相关的 schema 和类型
export {
  type AgentHook,
  type BashCommandHook,
  type HookCommand,
  HookCommandSchema,
  type HookMatcher,
  HookMatcherSchema,
  HooksSchema,
  type HooksSettings,
  type HttpHook,
  type PromptHook,
} from '../../schemas/hooks.js'

// 也在本文件中使用
import { type HookCommand, HooksSchema } from '../../schemas/hooks.js'
import { count } from '../array.js'

/**
 * 环境变量的 Schema
 */
export const EnvironmentVariablesSchema = lazySchema(() =>
  z.record(z.string(), z.coerce.string()),
)

/**
 * 权限部分的 Schema
 */
export const PermissionsSchema = lazySchema(() =>
  z
    .object({
      allow: z
        .array(PermissionRuleSchema())
        .optional()
        .describe('允许的操作的权限规则列表'),
      deny: z
        .array(PermissionRuleSchema())
        .optional()
        .describe('拒绝的操作的权限规则列表'),
      ask: z
        .array(PermissionRuleSchema())
        .optional()
        .describe('应始终提示确认的权限规则列表'),
      defaultMode: z
        .enum(
          feature('TRANSCRIPT_CLASSIFIER')
            ? PERMISSION_MODES
            : EXTERNAL_PERMISSION_MODES,
        )
        .optional()
        .describe('Claude Code 需要访问时的默认权限模式'),
      disableBypassPermissionsMode: z
        .enum(['disable'])
        .optional()
        .describe('禁用绕过权限提示的能力'),
      ...(feature('TRANSCRIPT_CLASSIFIER')
        ? {
            disableAutoMode: z
              .enum(['disable'])
              .optional()
              .describe('禁用自动模式'),
          }
        : {}),
      additionalDirectories: z
        .array(z.string())
        .optional()
        .describe('要包含在权限范围内的附加目录'),
    })
    .passthrough(),
)

/**
 * 仓库设置中定义的额外市场 Schema
 * 与 KnownMarketplace 相同，但没有 lastUpdated（自动管理）
 */
export const ExtraKnownMarketplaceSchema = lazySchema(() =>
  z.object({
    source: MarketplaceSourceSchema().describe('从哪里获取市场'),
    installLocation: z
      .string()
      .optional()
      .describe('存储市场清单的本地缓存路径（如未提供则自动生成）'),
    autoUpdate: z
      .boolean()
      .optional()
      .describe('是否在启动时自动更新此市场及其已安装的插件'),
  }),
)

/**
 * 企业允许列表中的 MCP 服务器条目 Schema。
 * 支持通过 serverName、serverCommand 或 serverUrl 匹配（互斥）。
 */
export const AllowedMcpServerEntrySchema = lazySchema(() =>
  z
    .object({
      serverName: z
        .string()
        .regex(
          /^[a-zA-Z0-9_-]+$/,
          '服务器名称只能包含字母、数字、连字符和下划线',
        )
        .optional()
        .describe('用户允许配置的 MCP 服务器名称'),
      serverCommand: z
        .array(z.string())
        .min(1, '服务器命令必须至少包含一个元素（命令本身）')
        .optional()
        .describe('用于精确匹配允许的 stdio 服务器的命令数组 [command, ...args]'),
      serverUrl: z
        .string()
        .optional()
        .describe(
          '支持通配符的 URL 模式（例如 "https://*.example.com/*"），用于匹配允许的远程 MCP 服务器',
        ),
      // 未来可扩展：allowedTransports, requiredArgs, maxInstances 等
    })
    .refine(
      data => {
        const defined = count(
          [
            data.serverName !== undefined,
            data.serverCommand !== undefined,
            data.serverUrl !== undefined,
          ],
          Boolean,
        )
        return defined === 1
      },
      {
        message: '条目必须恰好包含 "serverName"、"serverCommand" 或 "serverUrl" 中的一个',
      },
    ),
)

/**
 * 企业拒绝列表中的 MCP 服务器条目 Schema。
 * 支持通过 serverName、serverCommand 或 serverUrl 匹配（互斥）。
 */
export const DeniedMcpServerEntrySchema = lazySchema(() =>
  z
    .object({
      serverName: z
        .string()
        .regex(
          /^[a-zA-Z0-9_-]+$/,
          '服务器名称只能包含字母、数字、连字符和下划线',
        )
        .optional()
        .describe('被明确阻止的 MCP 服务器名称'),
      serverCommand: z
        .array(z.string())
        .min(1, '服务器命令必须至少包含一个元素（命令本身）')
        .optional()
        .describe('用于精确匹配被阻止的 stdio 服务器的命令数组 [command, ...args]'),
      serverUrl: z
        .string()
        .optional()
        .describe(
          '支持通配符的 URL 模式（例如 "https://*.example.com/*"），用于匹配被阻止的远程 MCP 服务器',
        ),
      // 未来可扩展：reason, blockedSince 等
    })
    .refine(
      data => {
        const defined = count(
          [
            data.serverName !== undefined,
            data.serverCommand !== undefined,
            data.serverUrl !== undefined,
          ],
          Boolean,
        )
        return defined === 1
      },
      {
        message: '条目必须恰好包含 "serverName"、"serverCommand" 或 "serverUrl" 中的一个',
      },
    ),
)

/**
 * 设置文件的统一 Schema
 *
 * ⚠️ 向后兼容性注意 ⚠️
 *
 * 此 Schema 定义了用户设置文件（.claude/settings.json）的结构。
 * 我们支持向后兼容的更改！具体方式如下：
 *
 * ✅ 允许的更改：
 * - 添加新的可选字段（始终使用 .optional()）
 * - 添加新的枚举值（保留现有值）
 * - 向对象添加新属性
 * - 使验证更宽松
 * - 使用联合类型进行渐进式迁移（例如 z.union([oldType, newType])）
 *
 * ❌ 应避免的破坏性更改：
 * - 删除字段（应标记为已弃用）
 * - 删除枚举值
 * - 将可选字段变为必需
 * - 使类型更严格
 * - 重命名字段而不保留旧名称
 *
 * 为确保向后兼容：
 * 1. 运行：npm run test:file -- test/utils/settings/backward-compatibility.test.ts
 * 2. 如果测试失败，说明你引入了破坏性更改
 * 3. 添加新字段时，请同时在 BACKWARD_COMPATIBILITY_CONFIGS 中添加测试
 *
 * 设置系统会自动处理向后兼容：
 * - 更新设置时，无效字段会保留在文件中（参见 settings.ts 第 233-249 行）
 * - 通过 z.coerce 进行类型强制转换（例如环境变量将数字转换为字符串）
 * - .passthrough() 会保留 permissions 对象中的未知字段
 * - 无效设置不会被使用，但仍保留在文件中，等待用户修复
 */

/**
 * 可由 `strictPluginOnlyCustomization` 锁定的表面。导出此常量，
 * 以便下面的 schema 预处理和运行时辅助函数（pluginOnlyPolicy.ts）
 * 共享同一个真实来源。
 */
export const CUSTOMIZATION_SURFACES = [
  'skills',
  'agents',
  'hooks',
  'mcp',
] as const

export const SettingsSchema = lazySchema(() =>
  z
    .object({
      $schema: z
        .literal(CLAUDE_CODE_SETTINGS_SCHEMA_URL)
        .optional()
        .describe('Claude Code 设置的 JSON Schema 引用'),
      apiKeyHelper: z
        .string()
        .optional()
        .describe('输出认证值的脚本路径'),
      awsCredentialExport: z
        .string()
        .optional()
        .describe('导出 AWS 凭证的脚本路径'),
      awsAuthRefresh: z
        .string()
        .optional()
        .describe('刷新 AWS 认证的脚本路径'),
      gcpAuthRefresh: z
        .string()
        .optional()
        .describe(
          '刷新 GCP 认证的命令（例如 gcloud auth application-default login）',
        ),
      // 受功能开关控制，以便 SDK 生成器（在未设置 CLAUDE_CODE_ENABLE_XAA 时运行）
      // 不在 GlobalClaudeSettings 中暴露此字段。通过 getXaaIdpSettings() 读取。
      // 外层的 .passthrough() 会在环境变量关闭时保持现有的 settings.json 键存活
      // —— 此时只是不对其进行 schema 验证。
      ...(isEnvTruthy(process.env.CLAUDE_CODE_ENABLE_XAA)
        ? {
            xaaIdp: z
              .object({
                issuer: z
                  .string()
                  .url()
                  .describe('用于 OIDC 发现的 IdP 颁发者 URL'),
                clientId: z
                  .string()
                  .describe('在 IdP 注册的 Claude Code 的 client_id'),
                callbackPort: z
                  .number()
                  .int()
                  .positive()
                  .optional()
                  .describe(
                    '用于 IdP OIDC 登录的固定环回回调端口。' +
                      '仅当 IdP 不遵循 RFC 8252 端口任意匹配时才需要。',
                  ),
              })
              .optional()
              .describe(
                'XAA（SEP-990）IdP 连接。配置一次后，所有支持 XAA 的 MCP 服务器都会复用此配置。',
              ),
          }
        : {}),
      fileSuggestion: z
        .object({
          type: z.literal('command'),
          command: z.string(),
        })
        .optional()
        .describe('针对 @ 提及的自定义文件建议配置'),
      respectGitignore: z
        .boolean()
        .optional()
        .describe(
          '文件选择器是否应遵循 .gitignore 文件（默认：true）。' +
            '注意：.ignore 文件始终被遵循。',
        ),
      cleanupPeriodDays: z
        .number()
        .nonnegative()
        .int()
        .optional()
        .describe(
          '保留聊天记录的天数（默认：30）。设置为 0 将完全禁用会话持久化：不写入任何记录，并在启动时删除现有记录。',
        ),
      env: EnvironmentVariablesSchema()
        .optional()
        .describe('为 Claude Code 会话设置的环境变量'),
      // 提交和 PR 的署名信息
      attribution: z
        .object({
          commit: z
            .string()
            .optional()
            .describe(
              '用于 git 提交的署名文本，包括任何 trailer。' +
                '空字符串隐藏署名。',
            ),
          pr: z
            .string()
            .optional()
            .describe(
              '用于拉取请求描述的署名文本。' +
                '空字符串隐藏署名。',
            ),
        })
        .optional()
        .describe(
          '自定义提交和 PR 的署名文本。' +
            '每个字段如果未设置，默认使用标准的 Claude Code 署名。',
        ),
      includeCoAuthoredBy: z
        .boolean()
        .optional()
        .describe(
          '已弃用：请改用 attribution。' +
            '是否在提交和 PR 中包含 Claude 的共同作者署名（默认为 true）',
        ),
      includeGitInstructions: z
        .boolean()
        .optional()
        .describe(
          '是否在 Claude 的系统提示中包含内置的提交和 PR 工作流指令（默认：true）',
        ),
      permissions: PermissionsSchema()
        .optional()
        .describe('工具使用权限配置'),
      model: z
        .string()
        .optional()
        .describe('覆盖 Claude Code 使用的默认模型'),
      // 企业模型允许列表
      availableModels: z
        .array(z.string())
        .optional()
        .describe(
          '用户可以选择的模型允许列表。' +
            '接受系列别名（"opus" 允许任何 opus 版本），' +
            '版本前缀（"opus-4-5" 仅允许该版本），' +
            '以及完整的模型 ID。' +
            '如果未定义，所有模型均可用。如果是空数组，则仅默认模型可用。' +
            '通常由企业管理员在托管设置中设置。',
        ),
      modelOverrides: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          '从 Anthropic 模型 ID（例如 "claude-opus-4-6"）到提供商特定模型 ID（例如 Bedrock 推理配置文件 ARN）的覆盖映射。' +
            '通常由企业管理员在托管设置中设置。',
        ),
      // 是否自动批准项目中的所有 MCP 服务器
      enableAllProjectMcpServers: z
        .boolean()
        .optional()
        .describe('是否自动批准项目中的所有 MCP 服务器'),
      // 来自 .mcp.json 的已批准 MCP 服务器列表
      enabledMcpjsonServers: z
        .array(z.string())
        .optional()
        .describe('来自 .mcp.json 的已批准 MCP 服务器列表'),
      // 来自 .mcp.json 的被拒绝 MCP 服务器列表
      disabledMcpjsonServers: z
        .array(z.string())
        .optional()
        .describe('来自 .mcp.json 的被拒绝 MCP 服务器列表'),
      // 企业 MCP 服务器允许列表
      allowedMcpServers: z
        .array(AllowedMcpServerEntrySchema())
        .optional()
        .describe(
          '企业 MCP 服务器允许列表，定义可使用的服务器。' +
            '适用于所有范围，包括来自 managed-mcp.json 的企业服务器。' +
            '如果未定义，所有服务器均允许。如果是空数组，则不允许任何服务器。' +
            '拒绝列表优先——如果服务器同时存在于两个列表中，则被拒绝。',
        ),
      // 企业 MCP 服务器拒绝列表
      deniedMcpServers: z
        .array(DeniedMcpServerEntrySchema())
        .optional()
        .describe(
          '企业 MCP 服务器拒绝列表，定义明确阻止的服务器。' +
            '如果服务器在拒绝列表中，它将在所有范围（包括企业）内被阻止。' +
            '拒绝列表优先于允许列表——如果服务器同时存在于两个列表中，则被拒绝。',
        ),
      hooks: HooksSchema()
        .optional()
        .describe('在工具执行前后运行的自定义命令'),
      worktree: z
        .object({
          symlinkDirectories: z
            .array(z.string())
            .optional()
            .describe(
              '从主仓库符号链接到工作树以节省磁盘空间的目录。' +
                '必须显式配置——默认情况下不会符号链接任何目录。' +
                '常见示例："node_modules"、".cache"、".bin"',
            ),
          sparsePaths: z
            .array(z.string())
            .optional()
            .describe(
              '创建工作树时通过 git sparse-checkout（cone 模式）包含的目录。' +
                '在大型 monorepo 中速度显著提高——仅将列出的路径写入磁盘。',
            ),
        })
        .optional()
        .describe('用于 --worktree 标志的 Git 工作树配置。'),
      // 是否禁用所有钩子和状态行
      disableAllHooks: z
        .boolean()
        .optional()
        .describe('禁用所有钩子和状态行的执行'),
      // 输入框 `!` 命令的后端 shell（参见 docs/design/ps-shell-selection.md §4.2）
      defaultShell: z
        .enum(['bash', 'powershell'])
        .optional()
        .describe(
          '输入框 ! 命令的默认 shell。' +
            "在所有平台上默认为 'bash'（无 Windows 自动切换）。",
        ),
      // 仅运行托管设置中定义的钩子（managed-settings.json）
      allowManagedHooksOnly: z
        .boolean()
        .optional()
        .describe(
          '当为 true（且在托管设置中设置）时，仅运行托管设置中的钩子。' +
            '用户、项目和本地钩子将被忽略。',
        ),
      // HTTP 钩子可访问的 URL 模式允许列表（遵循 allowedMcpServers 的先例）
      allowedHttpHookUrls: z
        .array(z.string())
        .optional()
        .describe(
          'HTTP 钩子可访问的 URL 模式允许列表。' +
            '支持 * 通配符（例如 "https://hooks.example.com/*"）。' +
            '设置后，URL 不匹配的 HTTP 钩子将被阻止。' +
            '如果未定义，所有 URL 均允许。如果是空数组，则不允许任何 HTTP 钩子。' +
            '数组会在不同设置源之间合并（语义与 allowedMcpServers 相同）。',
        ),
      // HTTP 钩子可插入到头部的环境变量名称允许列表
      httpHookAllowedEnvVars: z
        .array(z.string())
        .optional()
        .describe(
          'HTTP 钩子可插入到头部的环境变量名称允许列表。' +
            '设置后，每个钩子的有效 allowedEnvVars 将是此列表与钩子自身声明的交集。' +
            '如果未定义，则不施加限制。' +
            '数组会在不同设置源之间合并（语义与 allowedMcpServers 相同）。',
        ),
      // 仅使用托管设置中定义的权限规则（managed-settings.json）
      allowManagedPermissionRulesOnly: z
        .boolean()
        .optional()
        .describe(
          '当为 true（且在托管设置中设置）时，仅使用托管设置中的权限规则（allow/deny/ask）。' +
            '用户、项目、本地和 CLI 参数的权限规则将被忽略。',
        ),
      // 仅从托管设置读取 MCP 允许列表策略
      allowManagedMcpServersOnly: z
        .boolean()
        .optional()
        .describe(
          '当为 true（且在托管设置中设置）时，仅从托管设置中读取 allowedMcpServers。' +
            'deniedMcpServers 仍然从所有源合并，以便用户自行拒绝服务器。' +
            '用户仍可添加自己的 MCP 服务器，但只有管理员定义的允许列表生效。',
        ),
      // 强制仅通过插件进行定制（LinkedIn 通过 GTM 提出）
      strictPluginOnlyCustomization: z
        .preprocess(
          // 向前兼容：丢弃未知的表面名称，这样未来的枚举值（例如 'commands'）
          // 不会导致 safeParse 失败并将整个托管设置文件置空（settings.ts:101）。
          // ["skills", "commands"] 在旧客户端上 → ["skills"] → 锁定已知的部分，
          // 忽略未知的部分。降级为更少锁定，而绝不会变为全部解锁。
          v =>
            Array.isArray(v)
              ? v.filter(x =>
                  (CUSTOMIZATION_SURFACES as readonly string[]).includes(x),
                )
              : v,
          z.union([z.boolean(), z.array(z.enum(CUSTOMIZATION_SURFACES))]),
        )
        .optional()
        // 注意：移除了 .catch(undefined)，因为它会导致 JSON Schema 生成失败
        // 非数组的无效值会在验证时被拒绝，但不会影响整个设置文件
        .describe(
          '在托管设置中设置时，会阻止所列表面的非插件定制源。' +
            '数组形式锁定特定表面（例如 ["skills", "hooks"]）；`true` 锁定全部四个；`false` 显式表示无操作。' +
            '被阻止的源：~/.claude/{surface}/、.claude/{surface}/（项目）、settings.json 中的 hooks、.mcp.json。' +
            '不被阻止的源：托管（policySettings）源、插件提供的定制。' +
            '与 strictKnownMarketplaces 组合可实现端到端的管理员控制——插件由市场允许列表控制，' +
            '其他所有内容由此处阻止。',
        ),
      // 自定义状态行显示
      statusLine: z
        .object({
          type: z.literal('command'),
          command: z.string(),
          padding: z.number().optional(),
        })
        .optional()
        .describe('自定义状态行显示配置'),
      // 使用市场优先格式启用的插件
      enabledPlugins: z
        .record(
          z.string(),
          z.union([z.array(z.string()), z.boolean(), z.null()]),
        )
        .optional()
        .describe(
          '使用 plugin-id@marketplace-id 格式启用的插件。示例：{ "formatter@anthropic-tools": true }。也支持带版本约束的扩展格式。',
        ),
      // 此仓库的额外市场（通常用于项目设置）
      extraKnownMarketplaces: z
        .record(z.string(), ExtraKnownMarketplaceSchema())
        .check(ctx => {
          // 对于设置源，key 必须等于 source.name。diffMarketplaces
          // 通过字典键查找具体化状态；addMarketplaceSource 以市场名称存储
          //（对于设置源，marketplace.name = source.name）。不匹配意味着
          // 协调器永远不会收敛——每个会话：键查找失败 → 'missing' → 源幂等性返回
          // alreadyMaterialized，但仍然会增加 installed++ → 无意义的缓存清除。
          // 对于 github/git/url，名称来自获取的 marketplace.json（不匹配是预期且无害的）；
          // 对于设置，key 和 name 都是用户在同一个 JSON 对象中编写的。
          for (const [key, entry] of Object.entries(ctx.value)) {
            if (
              entry.source.source === 'settings' &&
              entry.source.name !== key
            ) {
              ctx.issues.push({
                code: 'custom',
                input: entry.source.name,
                path: [key, 'source', 'name'],
                message:
                  `来源于设置的市场名称必须与其 extraKnownMarketplaces 键匹配 ` +
                  `（键为 "${key}"，但 source.name 为 "${entry.source.name}"）`,
              })
            }
          }
        })
        .optional()
        .describe(
          '为此仓库提供的额外市场。通常用于仓库的 .claude/settings.json，以确保团队成员拥有所需的插件源。',
        ),
      // 企业严格允许的市场源列表（仅限策略设置）
      // 设置后，只能添加这些确切的源。检查发生在下载之前。
      strictKnownMarketplaces: z
        .array(MarketplaceSourceSchema())
        .optional()
        .describe(
          '企业严格允许的市场源列表。在托管设置中设置时，' +
            '只能添加这些确切的源作为市场。检查发生在下载之前，' +
            '因此被阻止的源永远不会触及文件系统。' +
            '注意：这只是一个策略门控——它不会注册市场。' +
            '要为用户预注册允许的市场，请同时设置 extraKnownMarketplaces。',
        ),
      // 企业市场源阻止列表（仅限策略设置）
      // 设置后，这些确切的源被阻止。检查发生在下载之前。
      blockedMarketplaces: z
        .array(MarketplaceSourceSchema())
        .optional()
        .describe(
          '企业市场源阻止列表。在托管设置中设置时，' +
            '这些确切的源将被阻止添加为市场。检查发生在下载之前，' +
            '因此被阻止的源永远不会触及文件系统。',
        ),
      // 强制使用特定的登录方式：'claudeai' 用于 Claude Pro/Max，'console' 用于控制台计费
      forceLoginMethod: z
        .enum(['claudeai', 'console'])
        .optional()
        .describe(
          '强制使用特定的登录方式："claudeai" 用于 Claude Pro/Max，"console" 用于控制台计费',
        ),
      // 用于 OAuth 登录的组织 UUID（将作为 URL 参数添加到授权 URL）
      forceLoginOrgUUID: z
        .string()
        .optional()
        .describe('用于 OAuth 登录的组织 UUID'),
      otelHeadersHelper: z
        .string()
        .optional()
        .describe('输出 OpenTelemetry 标头的脚本路径'),
      outputStyle: z
        .string()
        .optional()
        .describe('控制助手响应的输出样式'),
      language: z
        .string()
        .optional()
        .describe(
          'Claude 响应和语音听写的首选语言（例如 "japanese"、"spanish"）',
        ),
      skipWebFetchPreflight: z
        .boolean()
        .optional()
        .describe(
          '对于具有严格安全策略的企业环境，跳过 WebFetch 阻止列表检查',
        ),
      sandbox: SandboxSettingsSchema().optional(),
      feedbackSurveyRate: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe(
          '在符合条件时显示会话质量调查的概率（0–1）。0.05 是一个合理的起点。',
        ),
      spinnerTipsEnabled: z
        .boolean()
        .optional()
        .describe('是否在加载动画中显示提示'),
      spinnerVerbs: z
        .object({
          mode: z.enum(['append', 'replace']),
          verbs: z.array(z.string()),
        })
        .optional()
        .describe(
          '自定义加载动画动词。mode："append" 将动词添加到默认值，"replace" 仅使用你的动词。',
        ),
      spinnerTipsOverride: z
        .object({
          excludeDefault: z.boolean().optional(),
          tips: z.array(z.string()),
        })
        .optional()
        .describe(
          '覆盖加载动画提示。tips：提示字符串数组。excludeDefault：如果为 true，则仅显示自定义提示（默认：false）。',
        ),
      syntaxHighlightingDisabled: z
        .boolean()
        .optional()
        .describe('是否在差异视图中禁用语法高亮'),
      terminalTitleFromRename: z
        .boolean()
        .optional()
        .describe(
          '/rename 是否更新终端标签页标题（默认为 true）。设置为 false 以保持自动生成的主题标题。',
        ),
      alwaysThinkingEnabled: z
        .boolean()
        .optional()
        .describe(
          '当为 false 时，禁用思考。当不存在或为 true 时，' +
            '对于支持的模型自动启用思考。',
        ),
      effortLevel: z
        .enum(
          process.env.USER_TYPE === 'ant'
            ? ['low', 'medium', 'high', 'max']
            : ['low', 'medium', 'high'],
        )
        .optional()
        // 注意：移除了 .catch(undefined)，因为它会导致 JSON Schema 生成失败
        .describe('受支持模型的持久化努力级别。'),
      advisorModel: z
        .string()
        .optional()
        .describe('服务端顾问工具使用的顾问模型。'),
      fastMode: z
        .boolean()
        .optional()
        .describe(
          '当为 true 时，启用快速模式。当不存在或为 false 时，快速模式关闭。',
        ),
      fastModePerSessionOptIn: z
        .boolean()
        .optional()
        .describe(
          '当为 true 时，快速模式不会跨会话持久化。每个会话开始时快速模式关闭。',
        ),
      promptSuggestionEnabled: z
        .boolean()
        .optional()
        .describe(
          '当为 false 时，禁用提示建议。当不存在或为 true 时，' +
            '启用提示建议。',
        ),
      showClearContextOnPlanAccept: z
        .boolean()
        .optional()
        .describe(
          '当为 true 时，计划批准对话框提供“清除上下文”选项。默认为 false。',
        ),
      agent: z
        .string()
        .optional()
        .describe(
          '用于主线程的代理名称（内置或自定义）。' +
            '应用该代理的系统提示、工具限制和模型。',
        ),
      companyAnnouncements: z
        .array(z.string())
        .optional()
        .describe(
          '启动时显示的公司公告（如果提供多个，将随机选择一个）',
        ),
      pluginConfigs: z
        .record(
          z.string(),
          z.object({
            mcpServers: z
              .record(
                z.string(),
                z.record(
                  z.string(),
                  z.union([
                    z.string(),
                    z.number(),
                    z.boolean(),
                    z.array(z.string()),
                  ]),
                ),
              )
              .optional()
              .describe(
                '以服务器名称为键的 MCP 服务器用户配置值',
              ),
            options: z
              .record(
                z.string(),
                z.union([
                  z.string(),
                  z.number(),
                  z.boolean(),
                  z.array(z.string()),
                ]),
              )
              .optional()
              .describe(
                '来自插件清单 userConfig 的非敏感选项值，以选项名称为键。敏感值将存储在安全存储中。',
              ),
          }),
        )
        .optional()
        .describe(
          '每个插件的配置，包括 MCP 服务器用户配置，以插件 ID（plugin@marketplace 格式）为键',
        ),
      remote: z
        .object({
          defaultEnvironmentId: z
            .string()
            .optional()
            .describe('用于远程会话的默认环境 ID'),
        })
        .optional()
        .describe('远程会话配置'),
      autoUpdatesChannel: z
        .enum(['latest', 'stable'])
        .optional()
        .describe('自动更新的发布通道（latest 或 stable）'),
      ...(feature('LODESTONE')
        ? {
            disableDeepLinkRegistration: z
              .enum(['disable'])
              .optional()
              .describe(
                '阻止向操作系统注册 claude-cli:// 协议处理器',
              ),
          }
        : {}),
      minimumVersion: z
        .string()
        .optional()
        .describe(
          '要保持的最低版本——防止切换到稳定通道时降级',
        ),
      plansDirectory: z
        .string()
        .optional()
        .describe(
          '计划文件的自定义目录，相对于项目根目录。' +
            '如果未设置，默认为 ~/.claude/plans/',
        ),
      ...(process.env.USER_TYPE === 'ant'
        ? {
            classifierPermissionsEnabled: z
              .boolean()
              .optional()
              .describe(
                '为 Bash(prompt:...) 权限规则启用基于 AI 的分类',
              ),
          }
        : {}),
      ...(feature('PROACTIVE') || feature('KAIROS')
        ? {
            minSleepDurationMs: z
              .number()
              .nonnegative()
              .int()
              .optional()
              .describe(
                'Sleep 工具必须睡眠的最短持续时间（毫秒）。' +
                  '用于限制主动 tick 频率。',
              ),
            maxSleepDurationMs: z
              .number()
              .int()
              .min(-1)
              .optional()
              .describe(
                'Sleep 工具可以睡眠的最长持续时间（毫秒）。' +
                  '设置为 -1 表示无限睡眠（等待用户输入）。' +
                  '用于限制远程/托管环境中的空闲时间。',
              ),
          }
        : {}),
      ...(feature('VOICE_MODE')
        ? {
            voiceEnabled: z
              .boolean()
              .optional()
              .describe('启用语音模式（按住说话听写）'),
          }
        : {}),
      ...(feature('KAIROS')
        ? {
            assistant: z
              .boolean()
              .optional()
              .describe(
                '以助手模式启动 Claude（自定义系统提示、简洁视图、定时签到技能）',
              ),
            assistantName: z
              .string()
              .optional()
              .describe(
                '助手的显示名称，显示在 claude.ai 会话列表中',
              ),
          }
        : {}),
      // 团队/企业选择加入频道通知。默认关闭。
      // 声明了 claude/channel 能力的 MCP 服务器可以向会话推送入站消息；
      // 对于托管组织，仅在明确启用时有效。哪些服务器可以连接仍由
      // allowedMcpServers/deniedMcpServers 控制。不进行 feature 展开：
      // KAIROS_CHANNELS 是 external:true，展开会破坏 allowedChannelPlugins 的类型推断
      //（.passthrough() 的通配符会给出 {} 而不是数组类型）。
      channelsEnabled: z
        .boolean()
        .optional()
        .describe(
          '团队/企业选择加入频道通知（具有 claude/channel 能力的 MCP 服务器推送入站消息）。默认关闭。' +
            '设置为 true 以允许；用户随后通过 --channels 选择服务器。',
        ),
      // 组织级别的频道插件允许列表。设置后将替换 Anthropic 的分类账
      // ——管理员拥有信任决策权。未定义则回退到分类账。仅限插件的条目形状（与分类账相同）；
      // 服务器类条目仍需要开发者标志。
      allowedChannelPlugins: z
        .array(
          z.object({
            marketplace: z.string(),
            plugin: z.string(),
          }),
        )
        .optional()
        .describe(
          '团队/企业频道插件允许列表。设置后，' +
            '替换默认的 Anthropic 允许列表——管理员决定哪些' +
            '插件可以推送入站消息。未定义则回退到默认值。' +
            '需要 channelsEnabled: true。',
        ),
      ...(feature('KAIROS') || feature('KAIROS_BRIEF')
        ? {
            defaultView: z
              .enum(['chat', 'transcript'])
              .optional()
              .describe(
                '默认对话视图：chat（仅 SendUserMessage 检查点）或 transcript（完整）',
              ),
          }
        : {}),
      prefersReducedMotion: z
        .boolean()
        .optional()
        .describe(
          '减少或禁用动画以提升无障碍性（加载动画闪烁、闪光效果等）',
        ),
      autoMemoryEnabled: z
        .boolean()
        .optional()
        .describe(
          '为此项目启用自动记忆。当为 false 时，Claude 不会从自动记忆目录读取或写入。',
        ),
      autoMemoryDirectory: z
        .string()
        .optional()
        .describe(
          '自动记忆存储的自定义目录路径。支持 ~/ 前缀表示用户主目录。如果在 projectSettings（签入的 .claude/settings.json）中设置，出于安全考虑将被忽略。未设置时默认为 ~/.claude/projects/<sanitized-cwd>/memory/。',
        ),
      autoDreamEnabled: z
        .boolean()
        .optional()
        .describe(
          '启用后台记忆整合（auto-dream）。设置后将覆盖服务端默认值。',
        ),
      showThinkingSummaries: z
        .boolean()
        .optional()
        .describe(
          '在对话视图（Ctrl+o）中显示思考摘要。默认：false。',
        ),
      skipDangerousModePermissionPrompt: z
        .boolean()
        .optional()
        .describe(
          '用户是否已接受绕过权限模式对话框',
        ),
      ...(feature('TRANSCRIPT_CLASSIFIER')
        ? {
            skipAutoPermissionPrompt: z
              .boolean()
              .optional()
              .describe(
                '用户是否已接受自动模式选择加入对话框',
              ),
            useAutoModeDuringPlan: z
              .boolean()
              .optional()
              .describe(
                '计划模式在自动模式可用时是否使用自动模式语义（默认：true）',
              ),
            autoMode: z
              .object({
                allow: z
                  .array(z.string())
                  .optional()
                  .describe('自动模式分类器 allow 部分的规则'),
                soft_deny: z
                  .array(z.string())
                  .optional()
                  .describe('自动模式分类器 deny 部分的规则'),
                ...(process.env.USER_TYPE === 'ant'
                  ? {
                      // ant 用户的向后兼容别名；外部用户使用 soft_deny
                      deny: z.array(z.string()).optional(),
                    }
                  : {}),
                environment: z
                  .array(z.string())
                  .optional()
                  .describe(
                    '自动模式分类器 environment 部分的条目',
                  ),
              })
              .optional()
              .describe('自动模式分类器提示自定义'),
          }
        : {}),
      disableAutoMode: z
        .enum(['disable'])
        .optional()
        .describe('禁用自动模式'),
      sshConfigs: z
        .array(
          z.object({
            id: z
              .string()
              .describe(
                '此 SSH 配置的唯一标识符。用于跨设置源匹配配置。',
              ),
            name: z.string().describe('SSH 连接的显示名称'),
            sshHost: z
              .string()
              .describe(
                'SSH 主机，格式为 "user@hostname" 或 "hostname"，或 ~/.ssh/config 中的主机别名',
              ),
            sshPort: z
              .number()
              .int()
              .optional()
              .describe('SSH 端口（默认：22）'),
            sshIdentityFile: z
              .string()
              .optional()
              .describe('SSH 身份文件路径（私钥）'),
            startDirectory: z
              .string()
              .optional()
              .describe(
                '远程主机上的默认工作目录。' +
                  '支持波浪号扩展（例如 ~/projects）。' +
                  '如果未指定，默认为远程用户的主目录。' +
                  '可通过 `claude ssh <config> [dir]` 中的 [dir] 位置参数覆盖。',
              ),
          }),
        )
        .optional()
        .describe(
          '用于远程环境的 SSH 连接配置。' +
            '通常由企业管理员在托管设置中设置，' +
            '以便为团队成员预配置 SSH 连接。',
        ),
      claudeMdExcludes: z
        .array(z.string())
        .optional()
        .describe(
          '要排除加载的 CLAUDE.md 文件的 glob 模式或绝对路径。' +
            '使用 picomatch 将模式与绝对文件路径匹配。' +
            '仅适用于用户、项目和本地记忆类型（托管/策略文件无法排除）。' +
            '示例："/home/user/monorepo/CLAUDE.md"、"**/code/CLAUDE.md"、"**/some-dir/.claude/rules/**"',
        ),
      pluginTrustMessage: z
        .string()
        .optional()
        .describe(
          '在安装前显示的插件信任警告中附加的自定义消息。' +
            '仅从策略设置（managed-settings.json / MDM）中读取。' +
            '对企业管理员有用，可以添加组织特定的上下文' +
            '（例如“我们内部市场的所有插件都经过审查和批准。”）。',
        ),
    })
    .passthrough(),
)

/**
 * 插件的钩子内部类型 - 包含执行的插件上下文。
 * 不是 Zod schema，因为它不面向用户（插件提供原生钩子）。
 */
export type PluginHookMatcher = {
  matcher?: string
  hooks: HookCommand[]
  pluginRoot: string
  pluginName: string
  pluginId: string // 格式："pluginName@marketplaceName"
}

/**
 * 技能的钩子内部类型 - 包含执行的技能上下文。
 * 不是 Zod schema，因为它不面向用户（技能提供原生钩子）。
 */
export type SkillHookMatcher = {
  matcher?: string
  hooks: HookCommand[]
  skillRoot: string
  skillName: string
}

export type AllowedMcpServerEntry = z.infer<
  ReturnType<typeof AllowedMcpServerEntrySchema>
>
export type DeniedMcpServerEntry = z.infer<
  ReturnType<typeof DeniedMcpServerEntrySchema>
>
export type SettingsJson = z.infer<ReturnType<typeof SettingsSchema>>

/**
 * 类型守卫：MCP 服务器条目包含 serverName
 */
export function isMcpServerNameEntry(
  entry: AllowedMcpServerEntry | DeniedMcpServerEntry,
): entry is { serverName: string } {
  return 'serverName' in entry && entry.serverName !== undefined
}

/**
 * 类型守卫：MCP 服务器条目包含 serverCommand
 */
export function isMcpServerCommandEntry(
  entry: AllowedMcpServerEntry | DeniedMcpServerEntry,
): entry is { serverCommand: string[] } {
  return 'serverCommand' in entry && entry.serverCommand !== undefined
}

/**
 * 类型守卫：MCP 服务器条目包含 serverUrl
 */
export function isMcpServerUrlEntry(
  entry: AllowedMcpServerEntry | DeniedMcpServerEntry,
): entry is { serverUrl: string } {
  return 'serverUrl' in entry && entry.serverUrl !== undefined
}

/**
 * MCPB MCP 服务器的用户配置值
 */
export type UserConfigValues = Record<
  string,
  string | number | boolean | string[]
>

/**
 * 存储在 settings.json 中的插件配置
 */
export type PluginConfig = {
  mcpServers?: {
    [serverName: string]: UserConfigValues
  }
}