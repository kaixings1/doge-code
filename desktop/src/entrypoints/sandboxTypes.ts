/**
 * 适用于 Claude Code Agent SDK 的沙箱类型。
 *
 * 此文件是沙箱配置类型的唯一真实来源。
 * SDK 和设置验证都从此文件导入。
 */

import { z } from 'zod/v4'
import { lazySchema } from '../utils/lazySchema.js'

/**
 * 沙箱的网络配置模式。
 */
export const SandboxNetworkConfigSchema = lazySchema(() =>
  z
    .object({
      allowedDomains: z.array(z.string()).optional(),
      allowManagedDomainsOnly: z
        .boolean()
        .optional()
        .describe(
          '当为 true（且在托管设置中设置）时，仅允许来自托管设置的 allowedDomains 和 WebFetch(domain:...) 规则。' +
            '用户、项目、本地和标志设置的域将被忽略。拒绝的域仍从所有来源中生效。',
        ),
      allowUnixSockets: z
        .array(z.string())
        .optional()
        .describe(
          '仅 macOS：允许的 Unix socket 路径。在 Linux 上忽略（seccomp 无法按路径过滤）。',
        ),
      allowAllUnixSockets: z
        .boolean()
        .optional()
        .describe(
          '如果为 true，允许所有 Unix socket（在两个平台上均禁用阻止）。',
        ),
      allowLocalBinding: z.boolean().optional(),
      httpProxyPort: z.number().optional(),
      socksProxyPort: z.number().optional(),
    })
    .optional(),
)

/**
 * 沙箱的文件系统配置模式。
 */
export const SandboxFilesystemConfigSchema = lazySchema(() =>
  z
    .object({
      allowWrite: z
        .array(z.string())
        .optional()
        .describe(
          '沙箱内允许写入的额外路径。' +
            '与 Edit(...) 允许权限规则的路径合并。',
        ),
      denyWrite: z
        .array(z.string())
        .optional()
        .describe(
          '沙箱内禁止写入的额外路径。' +
            '与 Edit(...) 拒绝权限规则的路径合并。',
        ),
      denyRead: z
        .array(z.string())
        .optional()
        .describe(
          '沙箱内禁止读取的额外路径。' +
            '与 Read(...) 拒绝权限规则的路径合并。',
        ),
      allowRead: z
        .array(z.string())
        .optional()
        .describe(
          '在 denyRead 区域内重新允许读取的路径。' +
            '对于匹配的路径，优先于 denyRead。',
        ),
      allowManagedReadPathsOnly: z
        .boolean()
        .optional()
        .describe(
          '当为 true（在托管设置中设置）时，仅使用来自 policySettings 的 allowRead 路径。',
        ),
    })
    .optional(),
)

/**
 * 沙箱设置模式。
 */
export const SandboxSettingsSchema = lazySchema(() =>
  z
    .object({
      enabled: z.boolean().optional(),
      failIfUnavailable: z
        .boolean()
        .optional()
        .describe(
          '如果 sandbox.enabled 为 true 但沙箱无法启动（缺少依赖、不支持的平台或平台不在 enabledPlatforms 中），则在启动时以错误退出。' +
            '当为 false（默认值）时，会显示警告并以非沙箱方式运行命令。' +
            '适用于需要沙箱作为硬性门槛的托管设置部署。',
        ),
      // 注意：enabledPlatforms 是一个未记录的设置，通过 .passthrough() 读取
      // 它将沙箱限制在特定平台上（例如 ["macos"]）。
      //
      // 添加此设置是为了解除 NVIDIA 企业版部署的阻塞：他们希望启用
      // autoAllowBashIfSandboxed，但最初仅在 macOS 上启用，因为 Linux/WSL
      // 的沙箱支持较新且经过的测试较少。这允许他们
      // 设置 enabledPlatforms: ["macos"] 在其他平台上禁用沙箱（并自动允许），
      // 直到他们准备好扩大支持范围。
      autoAllowBashIfSandboxed: z.boolean().optional(),
      allowUnsandboxedCommands: z
        .boolean()
        .optional()
        .describe(
          '允许通过 dangerouslyDisableSandbox 参数在沙箱外运行命令。' +
            '当为 false 时，dangerouslyDisableSandbox 参数将被完全忽略，所有命令必须在沙箱内运行。' +
            '默认值：true。',
        ),
      network: SandboxNetworkConfigSchema(),
      filesystem: SandboxFilesystemConfigSchema(),
      ignoreViolations: z.record(z.string(), z.array(z.string())).optional(),
      enableWeakerNestedSandbox: z.boolean().optional(),
      enableWeakerNetworkIsolation: z
        .boolean()
        .optional()
        .describe(
          '仅 macOS：允许在沙箱内访问 com.apple.trustd.agent。' +
            '使用 httpProxyPort 配合 MITM 代理和自定义 CA 时，Go -based CLI 工具（gh、gcloud、terraform 等）验证 TLS 证书所需。' +
            '**降低安全性** — 通过 trustd 服务开启潜在的数据外泄途径。默认值：false',
        ),
      excludedCommands: z.array(z.string()).optional(),
      ripgrep: z
        .object({
          command: z.string(),
          args: z.array(z.string()).optional(),
        })
        .optional()
        .describe('捆绑的 ripgrep 支持的自定义 ripgrep 配置'),
    })
    .passthrough(),
)

// 从模式推断的类型
export type SandboxSettings = z.infer<ReturnType<typeof SandboxSettingsSchema>>
export type SandboxNetworkConfig = NonNullable<
  z.infer<ReturnType<typeof SandboxNetworkConfigSchema>>
>
export type SandboxFilesystemConfig = NonNullable<
  z.infer<ReturnType<typeof SandboxFilesystemConfigSchema>>
>
export type SandboxIgnoreViolations = NonNullable<
  SandboxSettings['ignoreViolations']
>
