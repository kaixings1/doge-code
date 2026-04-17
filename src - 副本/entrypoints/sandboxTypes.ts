/**
 * Sandbox types for the Claude Code Agent SDK
 *
 * This file is the single source of truth for sandbox configuration types.
 * Both the SDK and the settings validation import from here.
 */

import { z } from 'zod/v4'
import { lazySchema } from '../utils/lazySchema.js'

/**
 * Network configuration schema for sandbox.
 */
export const SandboxNetworkConfigSchema = lazySchema(() =>
  z
    .object({
      allowedDomains: z.array(z.string()).optional(),
      allowManagedDomainsOnly: z
        .boolean()
        .optional()
        .describe(
          'When true (and set in managed settings), only allowedDomains and WebFetch(domain:...) allow rules from managed settings are respected. ' +
            'User, project, local, and flag settings domains are ignored. Denied domains are still respected from all sources.',
        ),
      allowUnixSockets: z
        .array(z.string())
        .optional()
        .describe(
          'macOS only: Unix socket paths to allow. Ignored on Linux (seccomp cannot filter by path).',
        ),
      allowAllUnixSockets: z
        .boolean()
        .optional()
        .describe(
          'If true, allow all Unix sockets (disables blocking on both platforms).',
        ),
      allowLocalBinding: z.boolean().optional(),
      httpProxyPort: z.number().optional(),
      socksProxyPort: z.number().optional(),
    })
    .optional(),
)

/**
 * Filesystem configuration schema for sandbox.
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
          'When true (set in managed settings), only allowRead paths from policySettings are used.',
        ),
    })
    .optional(),
)

/**
 * Sandbox settings schema.
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
      // Note: enabledPlatforms is an undocumented setting read via .passthrough()
      // It restricts sandboxing to specific platforms (e.g., ["macos"]).
      //
      // Added to unblock NVIDIA enterprise rollout: they want to enable
      // autoAllowBashIfSandboxed but only on macOS initially, since Linux/WSL
      // sandbox support is newer and less battle-tested. This allows them to
      // set enabledPlatforms: ["macos"] to disable sandbox (and auto-allow)
      // on other platforms until they're ready to expand.
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
        .describe('Custom ripgrep configuration for bundled ripgrep support'),
    })
    .passthrough(),
)

// Inferred types from schemas
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
