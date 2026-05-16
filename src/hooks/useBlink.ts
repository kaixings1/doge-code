import { type DOMElement, useAnimationFrame, useTerminalFocus } from '../ink.js'

const BLINK_INTERVAL_MS = 600

/**
 * 用于同步闪烁动画的 Hook，在离屏时暂停。
 *
 * 返回一个附加到动画元素的 ref 和当前闪烁状态。
 * 所有实例同步闪烁，因为它们从同一个动画时钟派生状态。
 * 时钟仅在有订阅者可见时运行。终端失去焦点时暂停。
 *
 * @param enabled - 是否启用闪烁
 * @returns [ref, isVisible] - 附加到元素的 ref，闪烁周期内可见时为 true
 *
 * @example
 * function BlinkingDot({ shouldAnimate }) {
 *   const [ref, isVisible] = useBlink(shouldAnimate)
 *   return <Box ref={ref}>{isVisible ? '●' : ' '}</Box>
 * }
 */
export function useBlink(
  enabled: boolean,
  intervalMs: number = BLINK_INTERVAL_MS,
): [ref: (element: DOMElement | null) => void, isVisible: boolean] {
  const focused = useTerminalFocus()
  const [ref, time] = useAnimationFrame(enabled && focused ? intervalMs : null)

  if (!enabled || !focused) return [ref, true]

  // 从时间派生闪烁状态——所有实例看到相同的时间，因此同步
  const isVisible = Math.floor(time / intervalMs) % 2 === 0
  return [ref, isVisible]
}
