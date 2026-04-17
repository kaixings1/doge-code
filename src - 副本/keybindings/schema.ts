/**
 * Zod schema for keybindings.json configuration.
 * Used for validation and JSON schema generation.
 */

import { z } from 'zod/v4'
import { lazySchema } from '../utils/lazySchema.js'

/**
 * Valid context names where keybindings can be applied.
 */
export const KEYBINDING_CONTEXTS = [
  'Global',
  'Chat',
  'Autocomplete',
  'Confirmation',
  'Help',
  'Transcript',
  'HistorySearch',
  'Task',
  'ThemePicker',
  'Settings',
  'Tabs',
  // New contexts for keybindings migration
  'Attachments',
  'Footer',
  'MessageSelector',
  'DiffDialog',
  'ModelPicker',
  'Select',
  'Plugin',
] as const

/**
 * Human-readable descriptions for each keybinding context.
 */
export const KEYBINDING_CONTEXT_DESCRIPTIONS: Record<
  (typeof KEYBINDING_CONTEXTS)[number],
  string
> = {
  Global: '全局生效，无论焦点在哪里',
  Chat: '当聊天输入框被聚焦时',
  Autocomplete: '当自动完成菜单显示时',
  Confirmation: '当显示确认/权限对话框时',
  Help: '当帮助覆盖层打开时',
  Transcript: '当查看成绩单时',
  HistorySearch: '当搜索命令历史时 (ctrl+r)',
  Task: '当任务/代理在前台运行时',
  ThemePicker: '当主题选择器打开时',
  Settings: '当设置菜单打开时',
  Tabs: '当标签导航激活时',
  Attachments: '当在选择对话框中导航图像附件时',
  Footer: '当页脚指示器被聚焦时',
  MessageSelector: '当消息选择器(回退)打开时',
  DiffDialog: '当差异对话框打开时',
  ModelPicker: '当模型选择器打开时',
  Select: '当选择/列表组件被聚焦时',
  Plugin: '当插件对话框打开时',
}

/**
 * All valid keybinding action identifiers.
 */
export const KEYBINDING_ACTIONS = [
  // App-level actions (Global context)
  'app:interrupt',
  'app:exit',
  'app:toggleTodos',
  'app:toggleTranscript',
  'app:toggleBrief',
  'app:toggleTeammatePreview',
  'app:toggleTerminal',
  'app:redraw',
  'app:globalSearch',
  'app:quickOpen',
  // History navigation
  'history:search',
  'history:previous',
  'history:next',
  // Chat input actions
  'chat:cancel',
  'chat:killAgents',
  'chat:cycleMode',
  'chat:modelPicker',
  'chat:fastMode',
  'chat:thinkingToggle',
  'chat:submit',
  'chat:newline',
  'chat:undo',
  'chat:externalEditor',
  'chat:stash',
  'chat:imagePaste',
  'chat:messageActions',
  // Autocomplete menu actions
  'autocomplete:accept',
  'autocomplete:dismiss',
  'autocomplete:previous',
  'autocomplete:next',
  // Confirmation dialog actions
  'confirm:yes',
  'confirm:no',
  'confirm:previous',
  'confirm:next',
  'confirm:nextField',
  'confirm:previousField',
  'confirm:cycleMode',
  'confirm:toggle',
  'confirm:toggleExplanation',
  // Tabs navigation actions
  'tabs:next',
  'tabs:previous',
  // Transcript viewer actions
  'transcript:toggleShowAll',
  'transcript:exit',
  // History search actions
  'historySearch:next',
  'historySearch:accept',
  'historySearch:cancel',
  'historySearch:execute',
  // Task/agent actions
  'task:background',
  // Theme picker actions
  'theme:toggleSyntaxHighlighting',
  // Help menu actions
  'help:dismiss',
  // Attachment navigation (select dialog image attachments)
  'attachments:next',
  'attachments:previous',
  'attachments:remove',
  'attachments:exit',
  // Footer indicator actions
  'footer:up',
  'footer:down',
  'footer:next',
  'footer:previous',
  'footer:openSelected',
  'footer:clearSelection',
  'footer:close',
  // Message selector (rewind) actions
  'messageSelector:up',
  'messageSelector:down',
  'messageSelector:top',
  'messageSelector:bottom',
  'messageSelector:select',
  // Diff dialog actions
  'diff:dismiss',
  'diff:previousSource',
  'diff:nextSource',
  'diff:back',
  'diff:viewDetails',
  'diff:previousFile',
  'diff:nextFile',
  // Model picker actions (ant-only)
  'modelPicker:decreaseEffort',
  'modelPicker:increaseEffort',
  // Select component actions (distinct from confirm: to avoid collisions)
  'select:next',
  'select:previous',
  'select:accept',
  'select:cancel',
  // Plugin dialog actions
  'plugin:toggle',
  'plugin:install',
  // Permission dialog actions
  'permission:toggleDebug',
  // Settings config panel actions
  'settings:search',
  'settings:retry',
  'settings:close',
  // Voice actions
  'voice:pushToTalk',
] as const

/**
 * Schema for a single keybinding block.
 */
export const KeybindingBlockSchema = lazySchema(() =>
  z
    .object({
      context: z
        .enum(KEYBINDING_CONTEXTS)
        .describe(
          'UI context where these bindings apply. Global bindings work everywhere.',
        ),
      bindings: z
        .record(
          z
            .string()
            .describe('Keystroke pattern (e.g., "ctrl+k", "shift+tab")'),
          z
            .union([
              z.enum(KEYBINDING_ACTIONS),
              z
                .string()
                .regex(/^command:[a-zA-Z0-9:\-_]+$/)
                .describe(
                  'Command binding (e.g., "command:help", "command:compact"). Executes the slash command as if typed.',
                ),
              z.null().describe('Set to null to unbind a default shortcut'),
            ])
            .describe(
              'Action to trigger, command to invoke, or null to unbind',
            ),
        )
        .describe('Map of keystroke patterns to actions'),
    })
    .describe('A block of keybindings for a specific context'),
)

/**
 * Schema for the entire keybindings.json file.
 * Uses object wrapper format with optional $schema and $docs metadata.
 */
export const KeybindingsSchema = lazySchema(() =>
  z
    .object({
      $schema: z
        .string()
        .optional()
        .describe('JSON Schema URL for editor validation'),
      $docs: z.string().optional().describe('Documentation URL'),
      bindings: z
        .array(KeybindingBlockSchema())
        .describe('Array of keybinding blocks by context'),
    })
    .describe(
      'Claude Code keybindings configuration. Customize keyboard shortcuts by context.',
    ),
)

/**
 * TypeScript types derived from the schema.
 */
export type KeybindingsSchemaType = z.infer<
  ReturnType<typeof KeybindingsSchema>
>
