import { useKeybindings } from '../keybindings/useKeybinding.js'
import { type ExitState, useExitOnCtrlCD } from './useExitOnCtrlCD.js'

export type { ExitState }

/**
 * 便利 hook，将 useExitOnCtrlCD 与 useKeybindings 连接起来。
 *
 * 这是在组件中使用 useExitOnCtrlCD 的标准方式。
 * 分离存在是为了避免导入循环——useExitOnCtrlCD.ts
 * 不直接从 keybindings 模块导入。
 *
 * @param onExit - 可选的自定义退出处理器
 * @param onInterrupt - 处理中断（ctrl+c）的可选回调。
 *                     返回 true 表示已处理，false 则回退到双击退出。
 * @param isActive - 按键绑定是否激活（默认为 true）。
 */
export function useExitOnCtrlCDWithKeybindings(
  onExit?: () => void,
  onInterrupt?: () => boolean,
  isActive?: boolean,
): ExitState {
  return useExitOnCtrlCD(useKeybindings, onInterrupt, onExit, isActive)
}
