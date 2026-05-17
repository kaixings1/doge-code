import { isInputModeCharacter } from '../components/PromptInput/inputModes.js'
import { useNotifications } from '../context/notifications.js'
import stripAnsi from 'strip-ansi'
import { markBackslashReturnUsed } from '../commands/terminalSetup/terminalSetup.js'
import { addToHistory } from '../history.js'
import type { Key } from '../ink.js'
import type {
  InlineGhostText,
  TextInputState,
} from '../types/textInputTypes.js'
import {
  Cursor,
  getLastKill,
  pushToKillRing,
  recordYank,
  resetKillAccumulation,
  resetYankState,
  updateYankLength,
  yankPop,
} from '../utils/Cursor.js'
import { env } from '../utils/env.js'
import { isFullscreenEnvEnabled } from '../utils/fullscreen.js'
import type { ImageDimensions } from '../utils/imageResizer.js'
import { isModifierPressed, prewarmModifiers } from '../utils/modifiers.js'
import { useDoublePress } from './useDoublePress.js'

type MaybeCursor = void | Cursor
type InputHandler = (input: string) => MaybeCursor
type InputMapper = (input: string) => MaybeCursor
const NOOP_HANDLER: InputHandler = () => {}
function mapInput(input_map: Array<[string, InputHandler]>): InputMapper {
  const map = new Map(input_map)
  return function (input: string): MaybeCursor {
    return (map.get(input) ?? NOOP_HANDLER)(input)
  }
}

export type UseTextInputProps = {
  value: string                              // 输入框当前值
  onChange: (value: string) => void          // 值变化时的回调
  onSubmit?: (value: string) => void         // 提交时的回调
  onExit?: () => void                        // 退出时的回调
  onExitMessage?: (show: boolean, key?: string) => void  // 退出消息显示回调
  onHistoryUp?: () => void                   // 历史记录上翻
  onHistoryDown?: () => void                 // 历史记录下翻
  onHistoryReset?: () => void                // 重置历史记录
  onClearInput?: () => void                  // 清空输入
  focus?: boolean                            // 是否聚焦
  mask?: string                              // 输入掩码
  multiline?: boolean                        // 是否多行输入
  cursorChar: string                         // 光标字符
  highlightPastedText?: boolean              // 是否高亮粘贴的文本
  invert: (text: string) => string           // 文本反色函数
  themeText: (text: string) => string        // 主题文本函数
  columns: number                            // 列数
  onImagePaste?: (                           // 图片粘贴回调
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) => void
  disableCursorMovementForUpDownKeys?: boolean  // 禁用上下键的光标移动
  disableEscapeDoublePress?: boolean            // 禁用双击 Esc
  maxVisibleLines?: number                      // 最大可见行数
  externalOffset: number                        // 外部偏移量
  onOffsetChange: (offset: number) => void      // 偏移量变化回调
  inputFilter?: (input: string, key: Key) => string  // 输入过滤器
  inlineGhostText?: InlineGhostText             // 行内幽灵文本
  dim?: (text: string) => string                // 文本变暗函数
}

export function useTextInput({
  value: originalValue,
  onChange,
  onSubmit,
  onExit,
  onExitMessage,
  onHistoryUp,
  onHistoryDown,
  onHistoryReset,
  onClearInput,
  mask = '',
  multiline = false,
  cursorChar,
  invert,
  columns,
  onImagePaste: _onImagePaste,
  disableCursorMovementForUpDownKeys = false,
  disableEscapeDoublePress = false,
  maxVisibleLines,
  externalOffset,
  onOffsetChange,
  inputFilter,
  inlineGhostText,
  dim,
}: UseTextInputProps): TextInputState {
  // 为 Apple Terminal 预加载修饰键模块（有内部保护，可安全多次调用）
  if (env.terminal === 'Apple_Terminal') {
    prewarmModifiers()
  }

  const offset = externalOffset
  const setOffset = onOffsetChange
  const cursor = Cursor.fromText(originalValue, columns, offset)
  const { addNotification, removeNotification } = useNotifications()

  const handleCtrlC = useDoublePress(
    show => {
      onExitMessage?.(show, 'Ctrl-C')
    },
    () => onExit?.(),
    () => {
      if (originalValue) {
        onChange('')
        setOffset(0)
        onHistoryReset?.()
      }
    },
  )

  // 注意(keybindings)：此 Esc 处理程序有意不迁移到 keybindings 系统
  // 这是文本级别的双击 Esc 清空输入，不是操作级别的快捷键
  // 双击 Esc 清空输入并保存到历史记录 —— 这是文本编辑行为
  // 不是对话框关闭，需要双击安全机制
  const handleEscape = useDoublePress(
    (show: boolean) => {
      if (!originalValue || !show) {
        return
      }
      addNotification({
        key: 'escape-again-to-clear',
        text: '再次按 Esc 键清除',
        priority: 'immediate',
        timeoutMs: 1000,
      })
    },
    () => {
      // 立即移除"再次按 Esc 清除"通知
      removeNotification('escape-again-to-clear')
      onClearInput?.()
      if (originalValue) {
        // 跟踪双击 Esc 的使用以进行功能发现
        // 清空前保存到历史记录
        if (originalValue.trim() !== '') {
          addToHistory(originalValue)
        }
        onChange('')
        setOffset(0)
        onHistoryReset?.()
      }
    },
  )

  const handleEmptyCtrlD = useDoublePress(
    show => {
      if (originalValue !== '') {
        return
      }
      onExitMessage?.(show, 'Ctrl-D')
    },
    () => {
      if (originalValue !== '') {
        return
      }
      onExit?.()
    },
  )

  function handleCtrlD(): MaybeCursor {
    if (cursor.text === '') {
      // 输入为空时，处理双击
      handleEmptyCtrlD()
      return cursor
    }
    // 输入不为空时，像 iPython 一样向前删除
    return cursor.del()
  }

  function killToLineEnd(): Cursor {
    const { cursor: newCursor, killed } = cursor.deleteToLineEnd()
    pushToKillRing(killed, 'append')
    return newCursor
  }

  function killToLineStart(): Cursor {
    const { cursor: newCursor, killed } = cursor.deleteToLineStart()
    pushToKillRing(killed, 'prepend')
    return newCursor
  }

  function killWordBefore(): Cursor {
    const { cursor: newCursor, killed } = cursor.deleteWordBefore()
    pushToKillRing(killed, 'prepend')
    return newCursor
  }

  function yank(): Cursor {
    const text = getLastKill()
    if (text.length > 0) {
      const startOffset = cursor.offset
      const newCursor = cursor.insert(text)
      recordYank(startOffset, text.length)
      return newCursor
    }
    return cursor
  }

  function handleYankPop(): Cursor {
    const popResult = yankPop()
    if (!popResult) {
      return cursor
    }
    const { text, start, length } = popResult
    // 用新的文本替换之前粘贴的文本
    const before = cursor.text.slice(0, start)
    const after = cursor.text.slice(start + length)
    const newText = before + text + after
    const newOffset = start + text.length
    updateYankLength(text.length)
    return Cursor.fromText(newText, columns, newOffset)
  }

  const handleCtrl = mapInput([
    ['a', () => cursor.startOfLine()],
    ['b', () => cursor.left()],
    ['c', handleCtrlC],
    ['d', handleCtrlD],
    ['e', () => cursor.endOfLine()],
    ['f', () => cursor.right()],
    ['h', () => cursor.deleteTokenBefore() ?? cursor.backspace()],
    ['k', killToLineEnd],
    ['n', () => downOrHistoryDown()],
    ['p', () => upOrHistoryUp()],
    ['u', killToLineStart],
    ['w', killWordBefore],
    ['y', yank],
  ])

  const handleMeta = mapInput([
    ['b', () => cursor.prevWord()],
    ['f', () => cursor.nextWord()],
    ['d', () => cursor.deleteWordAfter()],
    ['y', handleYankPop],
  ])

  function handleEnter(key: Key) {
    if (
      multiline &&
      cursor.offset > 0 &&
      cursor.text[cursor.offset - 1] === '\\'
    ) {
      // 记录用户使用了反斜杠+回车
      markBackslashReturnUsed()
      return cursor.backspace().insert('\n')
    }
    // Meta+Enter 或 Shift+Enter 插入换行符
    if (key.meta || key.shift) {
      return cursor.insert('\n')
    }
    // Apple Terminal 不支持自定义 Shift+Enter 快捷键
    // 因此使用原生 macOS 修饰键检测来检查是否按住了 Shift
    if (env.terminal === 'Apple_Terminal' && isModifierPressed('shift')) {
      return cursor.insert('\n')
    }
    onSubmit?.(originalValue)
  }

  function upOrHistoryUp() {
    if (disableCursorMovementForUpDownKeys) {
      onHistoryUp?.()
      return cursor
    }
    // 尝试先按换行移动
    const cursorUp = cursor.up()
    if (!cursorUp.equals(cursor)) {
      return cursorUp
    }

    // 如果无法按换行移动且这是多行输入
    // 尝试按逻辑行移动（处理段落边界）
    if (multiline) {
      const cursorUpLogical = cursor.upLogicalLine()
      if (!cursorUpLogical.equals(cursor)) {
        return cursorUpLogical
      }
    }

    // 完全无法向上移动 - 触发历史记录导航
    onHistoryUp?.()
    return cursor
  }
  function downOrHistoryDown() {
    if (disableCursorMovementForUpDownKeys) {
      onHistoryDown?.()
      return cursor
    }
    // 尝试先按换行移动
    const cursorDown = cursor.down()
    if (!cursorDown.equals(cursor)) {
      return cursorDown
    }

    // 如果无法按换行移动且这是多行输入
    // 尝试按逻辑行移动（处理段落边界）
    if (multiline) {
      const cursorDownLogical = cursor.downLogicalLine()
      if (!cursorDownLogical.equals(cursor)) {
        return cursorDownLogical
      }
    }

    // 完全无法向下移动 - 触发历史记录导航
    onHistoryDown?.()
    return cursor
  }

  function mapKey(key: Key): InputMapper {
    switch (true) {
      case key.escape:
        return () => {
          // 当键绑定上下文（例如自动补全）拥有 Esc 时跳过
          // useKeybindings 无法通过 stopImmediatePropagation 屏蔽我们 ——
          // BaseTextInput 的 useInput 首先注册（子效果在父效果之前触发）
          // 因此此处理程序在键绑定的处理程序停止传播之前已经运行
          if (disableEscapeDoublePress) return cursor
          handleEscape()
          // 返回当前光标不变 —— handleEscape 内部管理状态
          return cursor
        }
      case key.leftArrow && (key.ctrl || key.meta || key.fn):
        return () => cursor.prevWord()
      case key.rightArrow && (key.ctrl || key.meta || key.fn):
        return () => cursor.nextWord()
      case key.backspace:
        return key.meta || key.ctrl
          ? killWordBefore
          : () => cursor.deleteTokenBefore() ?? cursor.backspace()
      case key.delete:
        return key.meta ? killToLineEnd : () => cursor.del()
      case key.ctrl:
        return handleCtrl
      case key.home:
        return () => cursor.startOfLine()
      case key.end:
        return () => cursor.endOfLine()
      case key.pageDown:
        // 全屏模式下，PgUp/PgDn 滚动消息视口而不是移动光标
        // 这里是空操作，ScrollKeybindingHandler 处理它
        if (isFullscreenEnvEnabled()) {
          return NOOP_HANDLER
        }
        return () => cursor.endOfLine()
      case key.pageUp:
        if (isFullscreenEnvEnabled()) {
          return NOOP_HANDLER
        }
        return () => cursor.startOfLine()
      case key.wheelUp:
      case key.wheelDown:
        // 鼠标滚轮事件仅在全屏鼠标跟踪开启时存在
        // ScrollKeybindingHandler 处理它们；这里是空操作以避免
        // 将原始 SGR 序列作为文本插入
        return NOOP_HANDLER
      case key.return:
        // Must come before key.meta so Option+Return inserts newline
        return () => handleEnter(key)
      case key.meta:
        return handleMeta
      case key.tab:
        return () => cursor
      case key.upArrow && !key.shift:
        return upOrHistoryUp
      case key.downArrow && !key.shift:
        return downOrHistoryDown
      case key.leftArrow:
        return () => cursor.left()
      case key.rightArrow:
        return () => cursor.right()
      default: {
        return function (input: string) {
          switch (true) {
            // Home key
            case input === '\x1b[H' || input === '\x1b[1~':
              return cursor.startOfLine()
            // End key
            case input === '\x1b[F' || input === '\x1b[4~':
              return cursor.endOfLine()
            default: {
              // 文本后的尾随 \r 是 SSH 合并的回车 ("o\r") —
              // 剥离它以免将回车作为内容插入。单独的 \r
              // 是泄露的 Alt+Enter（META_KEY_CODE_RE 不匹配
              // \x1b\r） —— 保留它以便下面的 \r→\n 转换。嵌入的 \r
              // 是没有括号粘贴功能的终端的多行粘贴 —— 转换为 \n
              // Backslash+\r 是过期的 VS Code Shift+Enter 绑定
              //（pre-#8991 /terminal-setup 将 args.text "\\\r\n" 写入 keybindings.json）
              // 保留 \r 以便它下面变成 \n（anthropics/claude-code#31316）
              // （anthropics/claude-code#31316）
              const text = stripAnsi(input)
                // eslint-disable-next-line custom-rules/no-lookbehind-regex -- .replace(re, str) on 1-2 char keystrokes: no-match returns same string (Object.is), regex never runs
                .replace(/(?<=[^\\\r\n])\r$/, '')
                .replace(/\r/g, '\n')
              if (cursor.isAtStart() && isInputModeCharacter(input)) {
                return cursor.insert(text).left()
              }
              return cursor.insert(text)
            }
          }
        }
      }
    }
  }

  // 检查是否是 kill 命令（Ctrl+K、Ctrl+U、Ctrl+W 或 Meta+Backspace/Delete）
  function isKillKey(key: Key, input: string): boolean {
    if (key.ctrl && (input === 'k' || input === 'u' || input === 'w')) {
      return true
    }
    if (key.meta && (key.backspace || key.delete)) {
      return true
    }
    return false
  }

  // 检查是否是 yank 命令（Ctrl+Y 或 Alt+Y）
  function isYankKey(key: Key, input: string): boolean {
    return (key.ctrl || key.meta) && input === 'y'
  }

  function onInput(input: string, key: Key): void {
    // 注意：图片粘贴快捷键（chat:imagePaste）在 PromptInput 中通过 useKeybindings 处理

    // 如果提供了过滤器则应用
    const filteredInput = inputFilter ? inputFilter(input, key) : input

    // 如果输入被过滤掉，则不做任何操作
    if (filteredInput === '' && input !== '') {
      return
    }

    // DOGE: Ctrl+Y — 如果 API 重试倒计时正在运行，触发立即重试
    // 优先级高于文本输入中的 yank（粘贴）功能
    if (isYankKey(key, filteredInput)) {
      try {
        const { getRetryNowSignal, triggerRetryNow } = require('../services/api/withRetry.js');
        const sig = getRetryNowSignal();
        if (sig && !sig.aborted) {
          // 有活跃的重试倒计时，触发立即重试并跳过 yank
          triggerRetryNow();
          resetYankState();
          return;
        }
      } catch (_) {
        // require 失败时静默降级到正常 yank 行为
      }
    }

    // 修复问题 #1853：过滤在 SSH/tmux 中干扰退格的 DEL 字符
    // 在 SSH/tmux 环境中，退格键会同时生成按键事件和原始 DEL 字符
    if (!key.backspace && !key.delete && input.includes('\x7f')) {
      const delCount = (input.match(/\x7f/g) || []).length

      // 将所有 DEL 字符作为退格操作同步应用
      // 尝试先删除标记，回退到字符退格
      let currentCursor = cursor
      for (let i = 0; i < delCount; i++) {
        currentCursor =
          currentCursor.deleteTokenBefore() ?? currentCursor.backspace()
      }

      // Update state once with the final result
      if (!cursor.equals(currentCursor)) {
        if (cursor.text !== currentCursor.text) {
          onChange(currentCursor.text)
        }
        setOffset(currentCursor.offset)
      }
      resetKillAccumulation()
      resetYankState()
      return
    }

    // 对非 kill 键重置 kill 累积
    if (!isKillKey(key, filteredInput)) {
      resetKillAccumulation()
    }

    // 对非 yank 键重置 yank 状态（破坏 yank-pop 链）
    if (!isYankKey(key, filteredInput)) {
      resetYankState()
    }

    const nextCursor = mapKey(key)(filteredInput)
    if (nextCursor) {
      if (!cursor.equals(nextCursor)) {
        if (cursor.text !== nextCursor.text) {
          onChange(nextCursor.text)
        }
        setOffset(nextCursor.offset)
      }
      // SSH 合并的回车：在慢速链路上，"o" + 回车可能作为一个块 "o\r" 到达
      // parseKeypress 只匹配 s === '\r'，所以它命中了上面的默认处理程序
      // （剥离了尾随的 \r）。恰好有一个尾随 \r 的文本是合并的回车
      // 单独的 \r 是 Alt+Enter（换行）；嵌入的 \r 是多行粘贴
      if (
        filteredInput.length > 1 &&
        filteredInput.endsWith('\r') &&
        !filteredInput.slice(0, -1).includes('\r') &&
        // Backslash+CR 是过期的 VS Code Shift+Enter 绑定
        // 不是合并的回车。参见上面的默认处理程序
        filteredInput[filteredInput.length - 2] !== '\\'
      ) {
        onSubmit?.(nextCursor.text)
      }
    }
  }

  // 准备用于渲染的幽灵文本 —— 验证 insertPosition 是否匹配当前
  // 光标偏移量，以防止过期的幽灵文本导致上一帧的抖动
  // （幽灵文本状态在渲染后通过 useEffect 更新）
  const ghostTextForRender =
    inlineGhostText && dim && inlineGhostText.insertPosition === offset
      ? { text: inlineGhostText.text, dim }
      : undefined

  const cursorPos = cursor.getPosition()

  return {
    onInput,
    renderedValue: cursor.render(
      cursorChar,
      mask,
      invert,
      ghostTextForRender,
      maxVisibleLines,
    ),
    offset,
    setOffset,
    cursorLine: cursorPos.line - cursor.getViewportStartLine(maxVisibleLines),
    cursorColumn: cursorPos.column,
    viewportCharOffset: cursor.getViewportCharOffset(maxVisibleLines),
    viewportCharEnd: cursor.getViewportCharEnd(maxVisibleLines),
  }
}
