/**
 * 视口重新固定（repin）到对话底部的判定。
 *
 * 从 REPL 的 repinScroll 抽出，使判定可被单测真覆盖（内联版本只能靠
 * 复刻逻辑测试，生产代码改变时不会失败）。
 *
 * 背景：用户向上回滚一两行后，任何覆盖层开合都会把视口拽回底部，表现为
 * 「稍微回滚就自动跳到最顶上」。根因是 repinScroll 无守卫地调
 * scrollToBottom。修法是引入 3 秒豁免：刚滚过说明用户在读内容，不打扰；
 * 而用户**显式**要求回到最新（提交消息、点药丸）时必须立即生效，故留 force。
 */

/**
 * 「刚滚过就不打扰」的豁免窗口。
 *
 * 用户发起滚动后，在空输入框中键入时不要重新固定到底部的时间窗口。
 * 典型工作流：Claude 输出长内容 → 向上滚动阅读开头 → 开始输入 →
 * 修复前会跳到底部。
 * https://anthropic.slack.com/archives/C07VBSHV7EV/p1773545449871739
 */
export const RECENT_SCROLL_REPIN_WINDOW_MS = 3000

/**
 * 判断本次是否应当真的执行 repin。
 *
 * @param force 用户显式要求回到最新（提交消息等），跳过豁免
 * @param lastUserScrollTs 上次用户发起滚动的时间戳（0 表示从未滚动）
 * @param now 当前时间（可注入，便于测试）
 */
export function shouldRepinScroll(
  force: boolean | undefined,
  lastUserScrollTs: number,
  now: number,
): boolean {
  if (force) return true
  return now - lastUserScrollTs >= RECENT_SCROLL_REPIN_WINDOW_MS
}

/**
 * 覆盖层开合时是否应当 repin。
 *
 * 覆盖层仍占屏时（localJSX 命令 / 权限对话框走 centeredModal）用户看不到
 * 底部，视觉上的「跳到底部」纯属干扰，故直接跳过 —— 而不是延迟 repin：
 * REPL 没有 useAfterPaintEffect，且解锁后内容可能已换了一批。
 * 代价由「提交时 onSubmit 会 repin」兜住。
 */
export function shouldRepinOnOverlayChange(pan: {
  /** 对话框状态本次是否变化（未变化则无需处理） */
  dialogChanged: boolean
  /** 覆盖层此刻是否仍占着屏幕 */
  overlayOnScreen: boolean
  /** 上次用户发起滚动的时间戳（0 表示从未滚动） */
  lastUserScrollTs: number
  /** 当前时间（可注入，便于测试） */
  now: number
}): boolean {
  if (!pan.dialogChanged) return false
  if (pan.overlayOnScreen) return false
  return pan.now - pan.lastUserScrollTs >= RECENT_SCROLL_REPIN_WINDOW_MS
}
