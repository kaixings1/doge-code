import { getSessionId } from '../bootstrap/state.js'
import { checkStatsigFeatureGate_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import type { SessionId } from '../types/ids.js'
import { isEnvTruthy } from '../utils/envUtils.js'

// -- 配置 --

// 在 query() 入口时快照一次的不可变值。将这些值与每次迭代的 State 结构体和
// 可变的 ToolUseContext 分离，使未来的 step() 提取更易处理——纯 reducer 可以
// 接受 (state, event, config) 参数，其中 config 是纯数据。
//
// 故意排除 feature() 门控 —— 它们是摇树优化的边界，
// 必须在受保护的代码块内保持内联以支持死代码消除。
export type QueryConfig = {
  sessionId: SessionId

  // 运行时门控（环境变量/Statsig）。不是 feature() 门控 —— 参见上方。
  gates: {
    // Statsig — CACHED_MAY_BE_STALE 本身就允许过期，所以每次 query() 调用
    // 快照一次仍符合现有约定。
    streamingToolExecution: boolean
    emitToolUseSummaries: boolean
    isAnt: boolean
    fastModeEnabled: boolean
  }
}

export function buildQueryConfig(): QueryConfig {
  return {
    sessionId: getSessionId(),
    gates: {
      streamingToolExecution: checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
        'tengu_streaming_tool_execution2',
      ),
      emitToolUseSummaries: isEnvTruthy(
        process.env.CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES,
      ),
      isAnt: process.env.USER_TYPE === 'ant',
      // 从 fastMode.ts 内联以避免将其依赖的庞大模块图
      // （axios、settings、auth、model、oauth、config）拉入之前未加载它的测试分片，
      // 这会改变初始化顺序并破坏无关的测试。
      fastModeEnabled: !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FAST_MODE),
    },
  }
}
