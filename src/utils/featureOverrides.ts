/**
 * Runtime feature override system.
 *
 * Architecture:
 * - Compile-time: `feature('X')` from `bun:bundle` does DCE — false branches are
 *   physically removed from the compiled binary. These CANNOT be resurrected at runtime.
 *
 * - Runtime: Many features have ADDITIONAL `process.env['CLAUDE_CODE_FEATURE_X']`
 *   checks (in commands.ts conditionalCommands, main.tsx, cli.tsx, etc.).
 *   These CAN be controlled at runtime. This module provides:
 *     1. A registry of overridable features
 *     2. applyFeatureOverrides() — reads config and sets env vars BEFORE modules load
 *     3. getFeatureOverrides() — reads from project config
 */

// Features that can be toggled at runtime via env var.
// Only includes features whose runtime code is guarded by process.env checks
// (NOT solely by feature() DCE — those cannot be overridden).
export const OVERRIDABLE_FEATURES = [
  'KAIROS',
  'KAIROS_BRIEF',
  'KAIROS_CHANNELS',
  'KAIROS_PUSH_NOTIFICATION',
  'KAIROS_GITHUB_WEBHOOKS',
  'BRIDGE_MODE',
  'CCR_MIRROR',
  'CCR_AUTO_CONNECT',
  'CCR_REMOTE_SETUP',
  'PROACTIVE',
  'TRANSCRIPT_CLASSIFIER',
  'EXPERIMENTAL_SKILL_SEARCH',
  'MCP_SKILLS',
  'WORKFLOW_SCRIPTS',
  'UDS_INBOX',
  'DAEMON',
  'HISTORY_SNIP',
  'VOICE_MODE',
  'TORCH',
  'FORK_SUBAGENT',
  'BG_SESSIONS',
  'TEMPLATES',
  'AGENT_TRIGGERS',
  'AGENT_TRIGGERS_REMOTE',
  'COORDINATOR_MODE',
  'EXTRACT_MEMORIES',
  'CACHED_MICROCOMPACT',
  'FILE_PERSISTENCE',
  'DOWNLOAD_USER_SETTINGS',
  'LODESTONE',
  'DIRECT_CONNECT',
  'SSH_REMOTE',
  'UPLOAD_USER_SETTINGS',
  'CHICAGO_MCP',
  'WEB_BROWSER_TOOL',
  'HARD_FAIL',
  'OVERFLOW_TEST_TOOL',
  'CONTEXT_COLLAPSE',
  'TERMINAL_PANEL',
  'COMMIT_ATTRIBUTION',
  'STREAMLINED_OUTPUT',
  'TEAMMEM',
  'AGENT_MEMORY_SNAPSHOT',
  'ABLATION_BASELINE',
  'SELF_HOSTED_RUNNER',
  'BYOC_ENVIRONMENT_RUNNER',
  'WEBHOOKS',
  'PEERS',
] as const

/**
 * 简短描述：用于 /config 界面展示，帮助用户理解每个开关的作用。
 * 仅收录运行时可覆盖的 feature。未列出的项将回退显示原始 feature 名。
 */
export const FEATURE_DESCRIPTIONS: Record<string, string> = {
  KAIROS: 'Kairos 总开关（会话续接 / 通道 / 通知等基础能力）',
  KAIROS_BRIEF: 'Brief 工具：上传文件/截图作为上下文附件',
  KAIROS_CHANNELS: '通道：多来源消息流（推送、webhook）聚合展示',
  KAIROS_PUSH_NOTIFICATION: '本地桌面推送通知（任务完成/空闲提醒）',
  KAIROS_GITHUB_WEBHOOKS: 'GitHub Webhook 接入（PR/issue 事件流入会话）',
  BRIDGE_MODE: 'Bridge 模式：跨进程/远程 REPL 桥接',
  CCR_MIRROR: 'CCR 镜像：把远程会话镜像到本地（仅出站方向）',
  CCR_AUTO_CONNECT: 'CCR 自动连接：启动时自动连接远程 CCR',
  CCR_REMOTE_SETUP: 'CCR 远程初始化向导',
  PROACTIVE: '主动提示：在合适时机主动给出建议/下一步',
  TRANSCRIPT_CLASSIFIER: '转写分类器：启用 Auto 模式与权限自动判定',
  EXPERIMENTAL_SKILL_SEARCH: '实验性：技能搜索（按需检索未加载技能）',
  MCP_SKILLS: '从 MCP 服务器获取并暴露技能',
  WORKFLOW_SCRIPTS: '工作流脚本：后台运行本地 workflow 任务',
  UDS_INBOX: 'UDS 收件箱：本地 Unix 域套接字接收外部消息',
  DAEMON: '常驻守护进程模式',
  HISTORY_SNIP: '历史裁剪：压缩旧消息以节省上下文',
  VOICE_MODE: '语音模式：语音输入/输出',
  TORCH: 'Torch：实验性高性能路径',
  FORK_SUBAGENT: '派生子代理执行独立子任务',
  BG_SESSIONS: '后台会话：在后台运行查询',
  TEMPLATES: '模板：预设提示词/工作流模板',
  AGENT_TRIGGERS: '代理触发器：按条件自动触发代理',
  AGENT_TRIGGERS_REMOTE: '远程代理触发器',
  COORDINATOR_MODE: '协调者模式：多代理中央调度',
  EXTRACT_MEMORIES: '自动从对话中提取记忆',
  CACHED_MICROCOMPACT: '缓存式微压缩',
  FILE_PERSISTENCE: '文件持久化：跨会话保存状态',
  DOWNLOAD_USER_SETTINGS: '下载用户设置',
  LODESTONE: 'Lodestone：实验性导航/索引',
  DIRECT_CONNECT: '直连：绕过中继直接连接',
  SSH_REMOTE: 'SSH 远程：通过 SSH 连接远程实例',
  UPLOAD_USER_SETTINGS: '上传用户设置',
  CHICAGO_MCP: 'Chicago MCP：实验性 MCP 集成',
  WEB_BROWSER_TOOL: '浏览器工具：Playwright 网页自动化',
  HARD_FAIL: '硬失败：遇错立即终止而非降级',
  OVERFLOW_TEST_TOOL: '溢出测试工具（仅测试用）',
  CONTEXT_COLLAPSE: '上下文折叠：压缩历史节省 token',
  TERMINAL_PANEL: '终端面板：内嵌终端输出展示',
  COMMIT_ATTRIBUTION: '提交署名：在 git commit 中追加 Co-Authored-By',
  STREAMLINED_OUTPUT: '精简输出：减少装饰性文本',
  TEAMMEM: '团队成员：多角色协作',
  AGENT_MEMORY_SNAPSHOT: '代理记忆快照',
  ABLATION_BASELINE: '消融基线：关闭部分功能用于对照测试',
  SELF_HOSTED_RUNNER: '自托管 Runner',
  BYOC_ENVIRONMENT_RUNNER: 'BYOC 环境 Runner',
  WEBHOOKS: 'Webhook 通用接入',
  PEERS: 'P2P 节点发现与连接',
}

export type OverridableFeatureName = (typeof OVERRIDABLE_FEATURES)[number]

const envKey = (name: string) => `CLAUDE_CODE_FEATURE_${name.toUpperCase()}`

/**
 * Apply feature overrides from a record. Sets process.env for each feature.
 * MUST be called before any module that checks CLAUDE_CODE_FEATURE_* env vars
 * is imported.
 */
export function applyFeatureOverrides(overrides: Record<string, boolean> | undefined): void {
  if (!overrides) return
  for (const [name, enabled] of Object.entries(overrides)) {
    if (OVERRIDABLE_FEATURES.includes(name as OverridableFeatureName)) {
      process.env[envKey(name)] = enabled ? '1' : '0'
    }
  }
}

/**
 * Read feature overrides from project config.
 * Reads raw JSON to avoid configReadingAllowed guard.
 */
export function getFeatureOverrides(): Record<string, boolean> {
  try {
    const { getCurrentProjectConfig } = require('./config.js') as {
      getCurrentProjectConfig: () => { featureOverrides?: Record<string, boolean> }
    }
    return getCurrentProjectConfig().featureOverrides ?? {}
  } catch {
    return {}
  }
}

/**
 * Clear all feature override env vars (for testing).
 */
export function clearFeatureOverrides(): void {
  for (const name of OVERRIDABLE_FEATURES) {
    delete process.env[envKey(name)]
  }
}
