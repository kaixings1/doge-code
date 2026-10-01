// 条件导入的惰性获取器。
//
// 原因：顶层 `const X = feature('F') ? require('...') : null` 会在模块求值期
// 执行 require，撞上本仓库固有的循环依赖（madge 实测 2841 个环）时，会绕回
// 尚未求值完成的模块，触发 V8 暂时性死区（TDZ）：
//   "Cannot access 'proactiveModule' before initialization"
//   "Cannot access 'SUGGEST_BG_PR_NOOP' before initialization"
// ESM 的 import 会被提升，因此更早的 top-level require 同样会在其他 const 之前运行。
//
// 修法：把 require 推迟到首次调用（模块全部求值完成后）。
// 先例：src/commands.ts 的 getRemoteSafeCommands / getBridgeSafeCommands。
import { feature } from 'bun:bundle'

let cachedProactive: typeof import('../proactive/index.js') | null | undefined

export function getProactiveModule(): typeof import('../proactive/index.js') | null {
  if (cachedProactive === undefined) {
    cachedProactive =
      feature('PROACTIVE') || feature('KAIROS')
        ? require('../proactive/index.js')
        : null
  }
  return cachedProactive
}

let cachedUseProactive: typeof import('../proactive/useProactive.js').useProactive | null | undefined

export function getUseProactive(): typeof import('../proactive/useProactive.js').useProactive | null {
  if (cachedUseProactive === undefined) {
    cachedUseProactive =
      feature('PROACTIVE') || feature('KAIROS')
        ? require('../proactive/useProactive.js').useProactive
        : null
  }
  return cachedUseProactive
}

let cachedUseScheduledTasks: typeof import('../hooks/useScheduledTasks.js').useScheduledTasks | null | undefined

export function getUseScheduledTasks(): typeof import('../hooks/useScheduledTasks.js').useScheduledTasks | null {
  if (cachedUseScheduledTasks === undefined) {
    cachedUseScheduledTasks =
      feature('AGENT_TRIGGERS')
        ? require('../hooks/useScheduledTasks.js').useScheduledTasks
        : null
  }
  return cachedUseScheduledTasks
}
