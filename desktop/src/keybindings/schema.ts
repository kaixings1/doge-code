/**
 * keybindings.json 配置的 Zod 模式。
 * 用于验证和 JSON 模式生成。
 */

import { z } from 'zod/v4'
import { lazySchema } from '../utils/lazySchema.js'

/**
 * 按键绑定可以应用的有效上下文名称。
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
  // 按键绑定迁移的新上下文
  'Attachments',
  'Footer',
  'MessageSelector',
  'DiffDialog',
  'ModelPicker',
  'Select',
  'Plugin',
] as const

/**
 * 每个按键绑定上下文的人类可读描述。
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
 * 所有有效的按键绑定操作标识符。
 */
export const KEYBINDING_ACTIONS = [
  // 应用级操作（全局上下文）
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
  // DOGE: API 重试立即重试
  'app:retryNow',
  // 历史导航
  'history:search',
  'history:previous',
  'history:next',
  // 聊天输入操作
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
  // 自动完成菜单操作
  'autocomplete:accept',
  'autocomplete:dismiss',
  'autocomplete:previous',
  'autocomplete:next',
  // 确认对话框操作
  'confirm:yes',
  'confirm:no',
  'confirm:previous',
  'confirm:next',
  'confirm:nextField',
  'confirm:previousField',
  'confirm:cycleMode',
  'confirm:toggle',
  'confirm:toggleExplanation',
  // 标签页导航操作
  'tabs:next',
  'tabs:previous',
  // 对话记录查看器操作
  'transcript:toggleShowAll',
  'transcript:exit',
  // 历史搜索操作
  'historySearch:next',
  'historySearch:accept',
  'historySearch:cancel',
  'historySearch:execute',
  // 任务/代理操作
  'task:background',
  // 主题选择器操作
  'theme:toggleSyntaxHighlighting',
  // 帮助菜单操作
  'help:dismiss',
  // 附件导航（选择对话框中的图像附件）
  'attachments:next',
  'attachments:previous',
  'attachments:remove',
  'attachments:exit',
  // 页脚指示器操作
  'footer:up',
  'footer:down',
  'footer:next',
  'footer:previous',
  'footer:openSelected',
  'footer:clearSelection',
  'footer:close',
  // 消息选择器（回退）操作
  'messageSelector:up',
  'messageSelector:down',
  'messageSelector:top',
  'messageSelector:bottom',
  'messageSelector:select',
  // 差异对话框操作
  'diff:dismiss',
  'diff:previousSource',
  'diff:nextSource',
  'diff:back',
  'diff:viewDetails',
  'diff:previousFile',
  'diff:nextFile',
  // 模型选择器操作（仅 ant 员工）
  'modelPicker:decreaseEffort',
  'modelPicker:increaseEffort',
  // 选择组件操作（与 confirm: 区分以避免冲突）
  'select:next',
  'select:previous',
  'select:accept',
  'select:cancel',
  // 插件对话框操作
  'plugin:toggle',
  'plugin:install',
  // 权限对话框操作
  'permission:toggleDebug',
  // 设置配置面板操作
  'settings:search',
  'settings:retry',
  'settings:close',
  // 语音操作
  'voice:pushToTalk',
] as const

/**
 * 单个按键绑定块的模式。
 */
export const KeybindingBlockSchema = lazySchema(() =>
  z
    .object({
      context: z
        .enum(KEYBINDING_CONTEXTS)
        .describe(
          '这些绑定适用的 UI 上下文。全局绑定在任何地方都生效。',
        ),
      bindings: z
        .record(
          z
            .string()
            .describe('按键模式（例如 "ctrl+k"、"shift+tab"）'),
          z
            .union([
              z.enum(KEYBINDING_ACTIONS),
              z
                .string()
                .regex(/^command:[a-zA-Z0-9:\-_]+$/)
                .describe(
                  '命令绑定（例如 "command:help"、"command:compact"）。执行斜杠命令就像在输入框中输入一样。',
                ),
              z.null().describe('设置为 null 可解绑默认快捷键'),
            ])
            .describe(
              '要触发的操作、要调用的命令，或设置为 null 以解绑',
            ),
        )
        .describe('按键模式到操作的映射'),
    })
    .describe('特定上下文下的按键绑定块'),
)

/**
 * 整个 keybindings.json 文件的模式。
 * 使用对象包装格式，包含可选的 $schema 和 $docs 元数据。
 */
export const KeybindingsSchema = lazySchema(() =>
  z
    .object({
      $schema: z
        .string()
        .optional()
        .describe('用于编辑器验证的 JSON Schema URL'),
      $docs: z.string().optional().describe('文档 URL'),
      bindings: z
        .array(KeybindingBlockSchema())
        .describe('按上下文排列的按键绑定块数组'),
    })
    .describe(
      'Claude Code 按键绑定配置。按上下文自定义键盘快捷键。',
    ),
)

/**
 * 从模式派生的 TypeScript 类型。
 */
export type KeybindingsSchemaType = z.infer<
  ReturnType<typeof KeybindingsSchema>
>
