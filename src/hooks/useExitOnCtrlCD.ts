import { useCallback, useMemo, useState } from 'react'
import useApp from '../ink/hooks/use-app.js'
import type { KeybindingContextName } from '../keybindings/types.js'
import { useDoublePress } from './useDoublePress.js'

export type ExitState = {
  pending: boolean
  keyName: 'Ctrl-C' | 'Ctrl-D' | null
}

type KeybindingOptions = {
  context?: KeybindingContextName
  isActive?: boolean
}

type UseKeybindingsHook = (
  handlers: Record<string, () => void>,
  options?: KeybindingOptions,
) => void

/**
 * 处理用于退出应用的 ctrl+c 和 ctrl+d。
 *
 * 使用基于时间的双击机制：
 * - 第一次按下：显示"再按 X 键退出"消息
 * - 超时内第二次按下：退出应用
 *
 * 注意：我们使用基于时间的双击而非和弦系统，因为
 * 我们希望第一次 ctrl+c 也能触发中断（在其他地方处理）。
 * 和弦系统会阻止第一次按下触发任何操作。
 *
 * 这些按键是硬编码的，不能通过 keybindings.json 重新绑定。
 *
 * @param useKeybindingsHook - 用于注册处理器的 useKeybindings hook
 *                            （依赖注入以避免导入循环）
 * @param onInterrupt - 处理中断（ctrl+c）的可选回调。
 *                     返回 true 表示已处理，false 则回退到双击退出。
 * @param onExit - 可选的自定义退出处理器
 * @param isActive - 按键绑定是否激活（默认为 true）。当嵌入的 TextInput
 *                   获得焦点时设为 false——TextInput 自己的 ctrl+c/d
 *                   处理器会管理取消/退出，Dialog 的处理器会
 *                   双重触发（子 useInput 在父 useKeybindings 之前运行，
 *                   因此两者都会看到每次按键）。
 */
export function useExitOnCtrlCD(
  useKeybindingsHook: UseKeybindingsHook,
  onInterrupt?: () => boolean,
  onExit?: () => void,
  isActive = true,
): ExitState {
  const { exit } = useApp()
  const [exitState, setExitState] = useState<ExitState>({
    pending: false,
    keyName: null,
  })

  const exitFn = useMemo(() => onExit ?? exit, [onExit, exit])

  // 双击处理器，用于 ctrl+c
  const handleCtrlCDoublePress = useDoublePress(
    pending => setExitState({ pending, keyName: 'Ctrl-C' }),
    exitFn,
  )

  // 双击处理器，用于 ctrl+d
  const handleCtrlDDoublePress = useDoublePress(
    pending => setExitState({ pending, keyName: 'Ctrl-D' }),
    exitFn,
  )

  // 处理 app:interrupt（默认为 ctrl+c）
  // 先让功能处理中断，通过回调判断
  const handleInterrupt = useCallback(() => {
    if (onInterrupt?.()) return // 功能已处理
    handleCtrlCDoublePress()
  }, [handleCtrlCDoublePress, onInterrupt])

  // 处理 app:exit（默认为 ctrl+d）
  // 同样使用双击确认退出
  const handleExit = useCallback(() => {
    handleCtrlDDoublePress()
  }, [handleCtrlDDoublePress])

  const handlers = useMemo(
    () => ({
      'app:interrupt': handleInterrupt,
      'app:exit': handleExit,
    }),
    [handleInterrupt, handleExit],
  )

  useKeybindingsHook(handlers, { context: 'Global', isActive })

  return exitState
}
