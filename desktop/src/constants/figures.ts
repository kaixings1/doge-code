// 注意：请勿在此处导入 env.ts——它会创建循环依赖：
// env.ts -> envUtils.ts -> model/model.ts -> figures.ts -> env.ts
// 请直接使用 process.platform。

// 前者在垂直对齐方面更好，但通常 Windows/Linux 不支持
const platform: 'win32' | 'darwin' | 'linux' = (['win32', 'darwin'].includes(process.platform)
  ? process.platform
  : 'linux') as 'win32' | 'darwin' | 'linux'
export const BLACK_CIRCLE = platform === 'darwin' ? '⏺' : '●'
export const BULLET_OPERATOR = '∙'
export const TEARDROP_ASTERISK = '✻'
export const UP_ARROW = '\u2191' // ↑ - 用于 opus 1m 合并通知
export const DOWN_ARROW = '\u2193' // ↓ - 用于滚动提示
export const LIGHTNING_BOLT = '↯' // \u21af - 用于快速模式指示器
export const EFFORT_LOW = '○' // \u25cb - 努力级别：低
export const EFFORT_MEDIUM = '◐' // \u25d0 - 努力级别：中
export const EFFORT_HIGH = '●' // \u25cf - 努力级别：高
export const EFFORT_MAX = '◉' // \u25c9 - 努力级别：最高（仅 Opus 4.6）

// 媒体/触发状态指示器
export const PLAY_ICON = '\u25b6' // ▶
export const PAUSE_ICON = '\u23f8' // ⏸

// MCP 订阅指示器
export const REFRESH_ARROW = '\u21bb' // ↻ - 用于资源更新指示器
export const CHANNEL_ARROW = '\u2190' // ← - 入站通道消息指示器
export const INJECTED_ARROW = '\u2192' // → - 跨会话注入消息指示器
export const FORK_GLYPH = '\u2442' // ⑂ - 分叉指令指示器

// 审查状态指示器（超级审查菱形状态）
export const DIAMOND_OPEN = '\u25c7' // ◇ - 运行中
export const DIAMOND_FILLED = '\u25c6' // ◆ - 已完成/失败
export const REFERENCE_MARK = '\u203b' // ※ - 路标，离开摘要回顾标记

// 问题标记指示器
export const FLAG_ICON = '\u2691' // ⚑ - 用于问题标记横幅

// 块引用指示器
export const BLOCKQUOTE_BAR = '\u258e' // ▎ - 左四分之一块，用作块引用行前缀
export const HEAVY_HORIZONTAL = '\u2501' // ━ - 粗框制表横线

// 桥接状态指示器
export const BRIDGE_SPINNER_FRAMES = [
  '\u00b7|\u00b7',
  '\u00b7/\u00b7',
  '\u00b7\u2014\u00b7',
  '\u00b7\\\u00b7',
]
export const BRIDGE_READY_INDICATOR = '\u00b7\u2714\ufe0e\u00b7'
export const BRIDGE_FAILED_INDICATOR = '\u00d7'
