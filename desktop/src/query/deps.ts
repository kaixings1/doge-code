import { randomUUID } from 'crypto'
import { queryModelWithStreaming } from '../services/api/claude.js'
import { autoCompactIfNeeded } from '../services/compact/autoCompact.js'
import { microcompactMessages } from '../services/compact/microCompact.js'

// -- 依赖 --

// query() 的 I/O 依赖项。将 `deps` 覆盖传递给 QueryParams 可以让测试
// 直接注入模拟对象，而不需要每个模块都使用 spyOn —— 目前最常见的模拟
// （callModel、autocompact）各自在 6-8 个测试文件中使用模块导入加 spy 的样板代码。
//
// 使用 `typeof fn` 可以自动保持签名与真实实现同步。
// 该文件同时为类型检查和生成函数导入真实函数 —— 通过类型导入此文件的测试
// 已经导入了 query.ts（它导入了所有内容），因此不会增加新的模块图开销。
//
// 作用域有意保持狭窄（4 个依赖），以验证此模式是否可行。后续 PR
// 可以添加 runTools、handleStopHooks、logEvent、queue 操作等。
export type QueryDeps = {
  // -- model
  callModel: typeof queryModelWithStreaming

  // -- compaction
  microcompact: typeof microcompactMessages
  autocompact: typeof autoCompactIfNeeded

  // -- platform
  uuid: () => string
}

export function productionDeps(): QueryDeps {
  return {
    callModel: queryModelWithStreaming,
    microcompact: microcompactMessages,
    autocompact: autoCompactIfNeeded,
    uuid: randomUUID,
  }
}
