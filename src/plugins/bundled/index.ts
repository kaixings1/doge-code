/**
 * 内置插件初始化
 *
 * 初始化随 CLI 一起提供并出现在 /plugin UI 中供用户启用/禁用的内置插件。
 *
 * 并非所有捆绑功能都应是内置插件——将此用于用户应能显式启用/禁用的功能。
 * 对于设置复杂或自动启用逻辑的功能（如 claude-in-chrome），请改用 src/skills/bundled/。
 *
 * 添加新的内置插件：
 * 1. 从 '../builtinPlugins.js' 导入 registerBuiltinPlugin
 * 2. 在此处使用插件定义调用 registerBuiltinPlugin()
 */

/**
 * 初始化内置插件。在 CLI 启动时调用。
 */
export function initBuiltinPlugins(): void {
  // 尚未注册任何内置插件——这是用于迁移应可由用户切换的捆绑技能的脚手架。
}
