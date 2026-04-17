/**
 * 内置插件注册表
 *
 * 管理随 CLI 一起发布的内置插件，用户可通过 /plugin 界面启用或禁用。
 *
 * 内置插件与捆绑技能（src/skills/bundled/）的区别：
 * - 它们在 /plugin 界面中显示为“内置”分类
 * - 用户可启用或禁用（设置会持久化到用户配置）
 * - 它们可以提供多种组件（技能、钩子、MCP 服务器）
 *
 * 插件 ID 格式为 `{name}@builtin`，以区别于市场插件（`{name}@{marketplace}`）。
 */

import type { Command } from '../commands.js'
import type { BundledSkillDefinition } from '../skills/bundledSkills.js'
import type { BuiltinPluginDefinition, LoadedPlugin } from '../types/plugin.js'
import { getSettings_DEPRECATED } from '../utils/settings/settings.js'

const BUILTIN_PLUGINS: Map<string, BuiltinPluginDefinition> = new Map()

export const BUILTIN_MARKETPLACE_NAME = 'builtin'

/**
 * 注册内置插件。请在启动时从 initBuiltinPlugins() 调用。
 */
export function registerBuiltinPlugin(
  definition: BuiltinPluginDefinition,
): void {
  BUILTIN_PLUGINS.set(definition.name, definition)
}

/**
 * 检查插件 ID 是否表示内置插件（以 @builtin 结尾）。
 */
export function isBuiltinPluginId(pluginId: string): boolean {
  return pluginId.endsWith(`@${BUILTIN_MARKETPLACE_NAME}`)
}

/**
 * 根据名称获取特定的内置插件定义。
 * 用于在无需市场查询的情况下在 /plugin 界面展示技能/钩子/MCP 列表。
 */
export function getBuiltinPluginDefinition(
  name: string,
): BuiltinPluginDefinition | undefined {
  return BUILTIN_PLUGINS.get(name)
}

/**
 * 获取所有已注册的内置插件，返回已启用和已禁用的 LoadedPlugin 对象列表，
 * 依据用户设置（以 defaultEnabled 作为后备）。若插件的 isAvailable() 返回 false，则完全忽略。
 */
export function getBuiltinPlugins(): {
  enabled: LoadedPlugin[]
  disabled: LoadedPlugin[]
} {
  const settings = getSettings_DEPRECATED()
  const enabled: LoadedPlugin[] = []
  const disabled: LoadedPlugin[] = []

  for (const [name, definition] of BUILTIN_PLUGINS) {
    if (definition.isAvailable && !definition.isAvailable()) {
      continue
    }

    const pluginId = `${name}@${BUILTIN_MARKETPLACE_NAME}`
    const userSetting = settings?.enabledPlugins?.[pluginId]
    // 启用状态：用户偏好 > 插件默认 > true
    const isEnabled =
      userSetting !== undefined
        ? userSetting === true
        : (definition.defaultEnabled ?? true)

    const plugin: LoadedPlugin = {
      name,
      manifest: {
        name,
        description: definition.description,
        version: definition.version,
      },
      path: BUILTIN_MARKETPLACE_NAME, // 哨兵值——无实际文件系统路径
      source: pluginId,
      repository: pluginId,
      enabled: isEnabled,
      isBuiltin: true,
      hooksConfig: definition.hooks,
      mcpServers: definition.mcpServers,
    }

    if (isEnabled) {
      enabled.push(plugin)
    } else {
      disabled.push(plugin)
    }
  }

  return { enabled, disabled }
}

/**
 * 从已启用的内置插件中获取技能，并以 Command 对象列表返回。
 * 已禁用的插件中的技能不会被返回。
 */
export function getBuiltinPluginSkillCommands(): Command[] {
  const { enabled } = getBuiltinPlugins()
  const commands: Command[] = []

  for (const plugin of enabled) {
    const definition = BUILTIN_PLUGINS.get(plugin.name)
    if (!definition?.skills) continue
    for (const skill of definition.skills) {
      commands.push(skillDefinitionToCommand(skill))
    }
  }

  return commands
}

/**
 * 清空内置插件注册表（供测试使用）。
 */
export function clearBuiltinPlugins(): void {
  BUILTIN_PLUGINS.clear()
}

// --

function skillDefinitionToCommand(definition: BundledSkillDefinition): Command {
  return {
    type: 'prompt',
    name: definition.name,
    description: definition.description,
    hasUserSpecifiedDescription: true,
    allowedTools: definition.allowedTools ?? [],
    argumentHint: definition.argumentHint,
    whenToUse: definition.whenToUse,
    model: definition.model,
    disableModelInvocation: definition.disableModelInvocation ?? false,
    userInvocable: definition.userInvocable ?? true,
    contentLength: 0,
    // 'bundled' 而非 'builtin' —— Command.source 中的 'builtin' 表示硬编码的斜杠命令（/help、/clear）。
    // 使用 'bundled' 可确保这些技能出现在 Skill 工具的列表、分析名称日志及提示截断豁免中。
    // 用户是否可切换的状态记录在 LoadedPlugin.isBuiltin 中。
    source: 'bundled',
    loadedFrom: 'bundled',
    hooks: definition.hooks,
    context: definition.context,
    agent: definition.agent,
    isEnabled: definition.isEnabled ?? (() => true),
    isHidden: !(definition.userInvocable ?? true),
    progressMessage: '运行中',
    getPromptForCommand: definition.getPromptForCommand,
  }
}