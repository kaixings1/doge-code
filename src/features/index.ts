/**
 * Features 模块导出
 *
 * 更新日志 2.1.128 → 2.1.220 中新增的功能实现
 */

export { EndConversationManager, getEndConversationManager, resetEndConversationManager } from './endConversation.js'
export type { EndConversationConfig } from './endConversation.js'
export { EmojiAutocompleter, EMOJI_MAP, getEmojiAutocompleter } from './emojiAutocomplete.js'
export type { EmojiConfig } from './emojiAutocomplete.js'
export {
  DEFAULT_SETTINGS,
  validateSettings,
  getSettingsFromEnv,
  SubAgentManager,
  getSubAgentManager,
} from './featureFlags.js'
export type { NewFeatureSettings } from './featureFlags.js'
export { MCPAutoBackgroundManager, getMCPAutoBackgroundManager } from './mcpAutoBackground.js'
export type { MCPAutoBackgroundConfig } from './mcpAutoBackground.js'
export { DirectoryAddedHook, getDirectoryAddedHook } from './directoryAddedHook.js'
export type { DirectoryAddedEvent, DirectoryAddedHandler } from './directoryAddedHook.js'
export {
  ForwardSubagentTextManager,
  getForwardSubagentTextManager,
  resolveParentSettings,
  PluginUrlManager,
  getPluginUrlManager,
  CodeReviewBackgroundManager,
  getCodeReviewBackgroundManager,
  ForkManager,
  getForkManager,
  AutoModeManager,
  getAutoModeManager,
  MCPErrorReporter,
  getMCPErrorReporter,
} from './additionalFeatures.js'
export type { ParentSettingsBehavior, ForwardSubagentTextConfig, PluginUrlConfig, CodeReviewBackgroundConfig, ForkConfig, AutoModeConfig, MCPErrorReport } from './additionalFeatures.js'
