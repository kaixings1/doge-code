import { getSessionId } from '../bootstrap/state.js';
import { checkStatsigFeatureGate_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js';
import { isEnvTruthy } from '../utils/envUtils.js';
export function buildQueryConfig() {
    return {
        sessionId: getSessionId(),
        gates: {
            streamingToolExecution: checkStatsigFeatureGate_CACHED_MAY_BE_STALE('tengu_streaming_tool_execution2'),
            emitToolUseSummaries: isEnvTruthy(process.env.CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES),
            isAnt: process.env.USER_TYPE === 'ant',
            // 从 fastMode.ts 内联以避免将其依赖的庞大模块图
            // （axios、settings、auth、model、oauth、config）拉入之前未加载它的测试分片，
            // 这会改变初始化顺序并破坏无关的测试。
            fastModeEnabled: !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_FAST_MODE),
        },
    };
}
//# sourceMappingURL=config.js.map