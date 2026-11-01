/**
 * `--forward-subagent-text`（对齐官方 2.1.211 / 2.1.219）。
 *
 * 语义（官方帮助原文）：
 *   Forward subagent text and thinking blocks as assistant/user messages
 *   with parent_tool_use_id set (only works with --print and stream-json).
 *
 * 本地原本已有：
 *   - 环境变量 CLAUDE_CODE_FORWARD_SUBAGENT_TEXT → settings.forwardSubagentText
 *     （featureFlags.ts:167）
 *   - 子代理消息经 onProgress({type:'agent_progress'}) 向上转发
 *   - stream-json 的 parent_tool_use_id 字段
 * 但 **forwardSubagentText 只被赋值、无人读取**，`agent_progress` 也只流向
 * UI/移动桥，从不进入 stream-json 输出 —— 属于「配置存在但功能未生效」。
 *
 * 本模块只放纯判断，便于单测；副作用（实际改写消息）在调用点完成。
 */

/** 子代理消息里允许转发的内容块类型。 */
const FORWARDABLE_BLOCK_TYPES = new Set(['text', 'thinking'])

/**
 * 该内容块是否应当在开启转发时被放行。
 *
 * 不开转发时，调用方原本只转发 tool_use / tool_result（那两者始终转发，
 * 因为 UI 与 SDK 都依赖它们构建调用树）。此函数只回答「text/thinking 要不要
 * 额外放行」。
 */
export function shouldForwardSubagentBlock(
  blockType: string,
  forwardEnabled: boolean,
): boolean {
  if (!forwardEnabled) return false
  return FORWARDABLE_BLOCK_TYPES.has(blockType)
}

/**
 * 读取是否开启转发。同时认环境变量与配置字段，二者任一为真即开启。
 *
 * 之所以两者都认：CLI 参数会写入环境变量（见 main.tsx），而 settings.json
 * 的 forwardSubagentText 字段也应当独立生效（配置文件在 init 期已合并）。
 */
export function isSubagentTextForwardingEnabled(
  env: NodeJS.ProcessEnv = process.env,
  settings?: { forwardSubagentText?: boolean },
): boolean {
  if (settings?.forwardSubagentText === true) return true
  const raw = env.CLAUDE_CODE_FORWARD_SUBAGENT_TEXT
  if (raw == null) return false
  // 与 featureFlags.ts 保持一致：只认 '1'（其余值视为关闭），
  // 避免与 CLI 写入的 '1' 语义打架。
  return raw === '1'
}
