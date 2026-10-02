/**
 * REPL 用的 no-op 兜底常量。
 *
 * 必须放在独立模块：原先这些 const 定义在 REPL.tsx 顶层（原第 202 行），
 * 但 ESM import 会被提升到模块最前面执行——当某个被 import 的模块循环依赖
 * 回 REPL.tsx 时，求值尚未走到该行，访问这些 const 就触发 V8 暂时性死区
 * （TDZ）：
 *   "Cannot access 'SUGGEST_BG_PR_NOOP' before initialization"
 * 本仓库存在大量循环依赖，这类错误只在特定求值顺序下暴露。
 *
 * 抽成无依赖模块后，import 它不会引入新的环，常量在任何时候都可用。
 */

/** 订阅的 no-op 实现：接受回调，返回空的取消函数 */
export const PROACTIVE_NO_OP_SUBSCRIBE = (_cb: () => void) => () => {}

/** 布尔 false 的 no-op 实现 */
export const PROACTIVE_FALSE = () => false

/** 后台 PR 建议拦截的 no-op 实现：始终返回 false（不拦截） */
export const SUGGEST_BG_PR_NOOP = (_p: string, _n: string): boolean => false
