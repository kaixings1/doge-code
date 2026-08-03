import { feature } from 'bun:bundle'
import { satisfies } from '../utils/semver.js'
import { isRunningWithBun } from '../utils/bundledMode.js'
import { getPlatform } from '../utils/platform.js'
import type { KeybindingBlock } from './types.js'

/**
 * 匹配当前 Claude Code 行为的默认按键绑定。
 * 这些先被加载，然后用户 keybindings.json 覆盖它们。
 */

// 平台特定的图片粘贴快捷键：
// - Windows: alt+v（Ctrl+v 是系统粘贴）
// - 其他平台：Ctrl+v
const IMAGE_PASTE_KEY = getPlatform() === 'windows' ? 'alt+v' : 'Ctrl+v'

// 仅修饰键的和弦（如 shift+tab）在 Windows 终端上可能因缺少 VT 模式而失败
// 参见：https://github.com/microsoft/terminal/issues/879#issuecomment-618801651
// Node 在 24.2.0 / 22.17.0 启用了 VT 模式：https://github.com/nodejs/node/pull/58358
// Bun 在 1.2.23 启用了 VT 模式：https://github.com/oven-sh/bun/pull/21161
const SUPPORTS_TERMINAL_VT_MODE =
  getPlatform() !== 'windows' ||
  (isRunningWithBun()
    ? satisfies(process.versions.bun, '>=1.2.23')
    : satisfies(process.versions.node, '>=22.17.0 <23.0.0 || >=24.2.0'))

// 平台特定的模式循环快捷键：
// - 无 VT 模式的 Windows：meta+m（shift+tab 不可靠）
// - 其他平台：shift+tab
const MODE_CYCLE_KEY = SUPPORTS_TERMINAL_VT_MODE ? 'shift+tab' : 'meta+m'

export const DEFAULT_BINDINGS: KeybindingBlock[] = [
  {
    context: 'Global',
    bindings: {
      // Ctrl+c 和 Ctrl+d 使用特殊的基于时间的双击处理。
      // 它们在此处定义以便解析器能找到，但用户
      // 不能重新绑定它们——reservedShortcuts.ts 中的验证
      // 会在用户尝试覆盖这些键时显示错误。
      'Ctrl+c': 'app:interrupt',
      'Ctrl+d': 'app:exit',
      'Ctrl+l': 'app:redraw',
      'Ctrl+t': 'app:toggleTodos',
      'Ctrl+o': 'app:toggleTranscript',
      ...(feature('KAIROS') || feature('KAIROS_BRIEF')
        ? { 'Ctrl+shift+b': 'app:toggleBrief' as const }
        : {}),
      'Ctrl+shift+o': 'app:toggleTeammatePreview',
      // Ctrl+Y: 在 API 重试倒计时期间立即重试，等价于 yank（粘贴）的替代键
      'Ctrl+y': 'app:retryNow',
      'Ctrl+r': 'history:search',
      // 文件导航。cmd+ 绑定仅在 kitty 协议终端上触发；
      // Ctrl+shift 是可移植的备选方案。
      ...(feature('QUICK_SEARCH')
        ? {
            'Ctrl+shift+f': 'app:globalSearch' as const,
            'cmd+shift+f': 'app:globalSearch' as const,
            'Ctrl+shift+p': 'app:quickOpen' as const,
            'cmd+shift+p': 'app:quickOpen' as const,
          }
        : {}),
      ...(feature('TERMINAL_PANEL') ? { 'meta+j': 'app:toggleTerminal' } : {}),
    },
  },
  {
    context: 'Chat',
    bindings: {
      escape: 'chat:cancel',
      // Ctrl+x 和弦前缀避免遮蔽 readline 编辑键（Ctrl+a/b/e/f/...）。
      'Ctrl+x Ctrl+k': 'chat:killAgents',
      [MODE_CYCLE_KEY]: 'chat:cycleMode',
      'meta+p': 'chat:modelPicker',
      'meta+o': 'chat:fastMode',
      'meta+t': 'chat:thinkingToggle',
      enter: 'chat:submit',
      up: 'history:previous',
      down: 'history:next',
      // 编辑快捷键（在此定义，迁移进行中）
      // 撤销有两个绑定以支持不同的终端行为：
      // - Ctrl+_ 用于传统终端（发送 \x1f 控制字符）
      // - Ctrl+shift+- 用于 Kitty 协议（发送带修饰符的物理键）
      'Ctrl+_': 'chat:undo',
      'Ctrl+shift+-': 'chat:undo',
      // Ctrl+x Ctrl+e 是 readline 原生的编辑并执行命令绑定。
      'Ctrl+x Ctrl+e': 'chat:externalEditor',
      'Ctrl+g': 'chat:externalEditor',
      'Ctrl+s': 'chat:stash',
      // 图片粘贴快捷键（上面定义的平台特定键）
      [IMAGE_PASTE_KEY]: 'chat:imagePaste',
      ...(feature('MESSAGE_ACTIONS')
        ? { 'shift+up': 'chat:messageActions' as const }
        : {}),
      // 语音激活（按住说话）。注册以便 getShortcutDisplay
      // 能找到它而不触发后备分析日志。要重新绑定，
      // 添加 voice:pushToTalk 条目（最后一个生效）；要禁用，使用 /voice
      // — 空解绑空格键会触发 useKeybinding.ts 中预先存在的陷阱
      // 导致 'unbound' 吞噬事件（空格键无法用于输入）。
      ...(feature('VOICE_MODE') ? { space: 'voice:pushToTalk' } : {}),
    },
  },
  {
    context: 'Autocomplete',
    bindings: {
      tab: 'autocomplete:accept',
      escape: 'autocomplete:dismiss',
      up: 'autocomplete:previous',
      down: 'autocomplete:next',
    },
  },
  {
    context: 'Settings',
    bindings: {
      // 设置菜单仅使用 escape（而非 'n'）关闭
      escape: 'confirm:no',
      // 配置面板列表导航（复用 Select 操作）
      up: 'select:previous',
      down: 'select:next',
      k: 'select:previous',
      j: 'select:next',
      'Ctrl+p': 'select:previous',
      'Ctrl+n': 'select:next',
      // 切换/激活所选设置（仅空格 — enter 保存并关闭）
      space: 'select:accept',
      // 保存并关闭配置面板
      enter: 'settings:close',
      // 进入搜索模式
      '/': 'settings:search',
      // 重试加载使用数据（仅在出错时激活）
      r: 'settings:retry',
    },
  },
  {
    context: 'Confirmation',
    bindings: {
      y: 'confirm:yes',
      n: 'confirm:no',
      enter: 'confirm:yes',
      escape: 'confirm:no',
      // 有列表的对话框导航
      up: 'confirm:previous',
      down: 'confirm:next',
      tab: 'confirm:nextField',
      space: 'confirm:toggle',
      // 循环模式（用于文件权限对话框和团队对话框）
      'shift+tab': 'confirm:cycleMode',
      // 切换权限对话框中的权限说明
      'Ctrl+e': 'confirm:toggleExplanation',
      // 切换权限调试信息
      'Ctrl+d': 'permission:toggleDebug',
    },
  },
  {
    context: 'Tabs',
    bindings: {
      // 标签页循环导航
      tab: 'tabs:next',
      'shift+tab': 'tabs:previous',
      right: 'tabs:next',
      left: 'tabs:previous',
    },
  },
  {
    context: 'Transcript',
    bindings: {
      'Ctrl+e': 'transcript:toggleShowAll',
      'Ctrl+c': 'transcript:exit',
      escape: 'transcript:exit',
      // q — 分页器惯例（less、tmux 复制模式）。Transcript 是一个模态
      // 阅读视图，没有提示输入，因此 q 作为字面字符没有所有者。
      q: 'transcript:exit',
    },
  },
  {
    context: 'HistorySearch',
    bindings: {
      'Ctrl+r': 'historySearch:next',
      escape: 'historySearch:accept',
      tab: 'historySearch:accept',
      'Ctrl+c': 'historySearch:cancel',
      enter: 'historySearch:execute',
    },
  },
  {
    context: 'Task',
    bindings: {
      // 将前台任务后台运行（bash 命令、代理）
      // 在 tmux 中，用户必须按两次 Ctrl+b（tmux 前缀转义）
      'Ctrl+b': 'task:background',
    },
  },
  {
    context: 'ThemePicker',
    bindings: {
      'Ctrl+t': 'theme:toggleSyntaxHighlighting',
    },
  },
  {
    context: 'Scroll',
    bindings: {
      pageup: 'scroll:pageUp',
      pagedown: 'scroll:pageDown',
      wheelup: 'scroll:lineUp',
      wheeldown: 'scroll:lineDown',
      'Ctrl+home': 'scroll:top',
      'Ctrl+end': 'scroll:bottom',
      // 选择复制。Ctrl+shift+c 是标准终端复制。
      // cmd+c 仅在使用 kitty 键盘协议的终端上触发
      // （kitty/WezTerm/ghostty/iTerm2），其中 super
      // 修饰符实际到达 pty — 其他位置无效。
      // Esc 清除和上下文相关的 Ctrl+c 通过原始
      // useInput 处理，因此它们可以有条件地传播。
      'Ctrl+shift+c': 'selection:copy',
      'cmd+c': 'selection:copy',
    },
  },
  {
    context: 'Help',
    bindings: {
      escape: 'help:dismiss',
    },
  },
  // 附件导航（选择对话框中的图片附件）
  {
    context: 'Attachments',
    bindings: {
      right: 'attachments:next',
      left: 'attachments:previous',
      backspace: 'attachments:remove',
      delete: 'attachments:remove',
      down: 'attachments:exit',
      escape: 'attachments:exit',
    },
  },
  // 底部指示器导航（任务、团队、差异、循环）
  {
    context: 'Footer',
    bindings: {
      up: 'footer:up',
      'Ctrl+p': 'footer:up',
      down: 'footer:down',
      'Ctrl+n': 'footer:down',
      right: 'footer:next',
      left: 'footer:previous',
      enter: 'footer:openSelected',
      escape: 'footer:clearSelection',
    },
  },
  // 消息选择器（回退对话框）导航
  {
    context: 'MessageSelector',
    bindings: {
      up: 'messageSelector:up',
      down: 'messageSelector:down',
      k: 'messageSelector:up',
      j: 'messageSelector:down',
      'Ctrl+p': 'messageSelector:up',
      'Ctrl+n': 'messageSelector:down',
      'Ctrl+up': 'messageSelector:top',
      'shift+up': 'messageSelector:top',
      'meta+up': 'messageSelector:top',
      'shift+k': 'messageSelector:top',
      'ctrl+down': 'messageSelector:bottom',
      'shift+down': 'messageSelector:bottom',
      'meta+down': 'messageSelector:bottom',
      'shift+j': 'messageSelector:bottom',
      enter: 'messageSelector:select',
    },
  },
  // 光标激活时 PromptInput 卸载 — 无按键冲突。
  ...(feature('MESSAGE_ACTIONS')
    ? [
        {
          context: 'MessageActions' as const,
          bindings: {
            up: 'messageActions:prev' as const,
            down: 'messageActions:next' as const,
            k: 'messageActions:prev' as const,
            j: 'messageActions:next' as const,
            // meta = macOS 上的 cmd；kitty 键盘协议上的 super — 两者都绑定。
            'meta+up': 'messageActions:top' as const,
            'meta+down': 'messageActions:bottom' as const,
            'super+up': 'messageActions:top' as const,
            'super+down': 'messageActions:bottom' as const,
            // 鼠标选择在存在时通过 shift+箭头扩展（ScrollKeybindingHandler:573）—
            // 正确的分层 UX：esc 清除选择，然后 shift+↑ 跳转。
            'shift+up': 'messageActions:prevUser' as const,
            'shift+down': 'messageActions:nextUser' as const,
            escape: 'messageActions:escape' as const,
            'Ctrl+c': 'messageActions:ctrlc' as const,
            // 镜像 MESSAGE_ACTIONS。未导入 — 会将 React/ink 拉入此配置模块。
            enter: 'messageActions:enter' as const,
            c: 'messageActions:c' as const,
            p: 'messageActions:p' as const,
          },
        },
      ]
    : []),
  // 差异对话框导航
  {
    context: 'DiffDialog',
    bindings: {
      escape: 'diff:dismiss',
      left: 'diff:previousSource',
      right: 'diff:nextSource',
      up: 'diff:previousFile',
      down: 'diff:nextFile',
      enter: 'diff:viewDetails',
      // 注意：diff:back 在详情模式下由左箭头处理
    },
  },
  // 模型选择器努力度循环（仅 ant 员工）
  {
    context: 'ModelPicker',
    bindings: {
      left: 'modelPicker:decreaseEffort',
      right: 'modelPicker:increaseEffort',
    },
  },
  // 选择组件导航（用于 /model、/resume、权限提示等）
  {
    context: 'Select',
    bindings: {
      up: 'select:previous',
      down: 'select:next',
      j: 'select:next',
      k: 'select:previous',
      'Ctrl+n': 'select:next',
      'Ctrl+p': 'select:previous',
      enter: 'select:accept',
      escape: 'select:cancel',
    },
  },
  // 插件对话框操作（管理、浏览、发现插件）
  // 导航（select:*）使用上面的 Select 上下文
  {
    context: 'Plugin',
    bindings: {
      space: 'plugin:toggle',
      i: 'plugin:install',
    },
  },
]
