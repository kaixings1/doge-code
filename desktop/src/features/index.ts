/**
 * Features 模块导出
 *
 * 更新日志 2.1.128 → 2.1.220 中新增的功能实现
 */

export { EndConversationManager, getEndConversationManager, resetEndConversationManager } from './endConversation.js'
export { EmojiAutocompleter, EmojiConfig, EMOJI_MAP, getEmojiAutocompleter } from './emojiAutocomplete.js'
export {
  NewFeatureSettings,
  DEFAULT_SETTINGS,
  validateSettings,
  getSettingsFromEnv,
  SubAgentManager,
  getSubAgentManager,
} from './featureFlags.js'
export { MCPAutoBackgroundManager, getMCPAutoBackgroundManager } from './mcpAutoBackground.js'
export { DirectoryAddedHook, DirectoryAddedEvent, DirectoryAddedHandler, getDirectoryAddedHook } from './directoryAddedHook.js'
export {
  ForwardSubagentTextManager,
  getForwardSubagentTextManager,
  ParentSettingsBehavior,
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
