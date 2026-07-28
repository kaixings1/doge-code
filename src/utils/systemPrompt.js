import { feature } from 'bun:bundle';
import { logEvent, } from '../services/analytics/index.js';
import { isBuiltInAgent } from '../tools/AgentTool/loadAgentsDir.js';
import { isEnvTruthy } from './envUtils.js';
import { asSystemPrompt } from './systemPromptType.js';
export { asSystemPrompt } from './systemPromptType.js';
// Dead code elimination: conditional import for proactive mode.
// Same pattern as prompts.ts — lazy require to avoid pulling the module
// into non-proactive builds.
const proactiveModule = feature('PROACTIVE') || feature('KAIROS')
    ? require('../proactive/index.js')
    : null;
function isProactiveActive_SAFE_TO_CALL_ANYWHERE() {
    return proactiveModule?.isProactiveActive() ?? false;
}
/**
 * Builds the effective system prompt array based on priority:
 * 0. Override system prompt (if set, e.g., via loop mode - REPLACES all other prompts)
 * 1. Coordinator system prompt (if coordinator mode is active)
 * 2. Agent system prompt (if mainThreadAgentDefinition is set)
 *    - In proactive mode: agent prompt is APPENDED to default (agent adds domain
 *      instructions on top of the autonomous agent prompt, like teammates do)
 *    - Otherwise: agent prompt REPLACES default
 * 3. Custom system prompt (if specified via --system-prompt)
 * 4. Default system prompt (the standard Claude Code prompt)
 *
 * Plus appendSystemPrompt is always added at the end if specified (except when override is set).
 */
export function buildEffectiveSystemPrompt({ mainThreadAgentDefinition, toolUseContext, customSystemPrompt, defaultSystemPrompt, appendSystemPrompt, overrideSystemPrompt, }) {
    if (overrideSystemPrompt) {
        return asSystemPrompt([overrideSystemPrompt]);
    }
    // Coordinator mode: use coordinator prompt instead of default
    // Use inline env check instead of coordinatorModule to avoid circular
    // dependency issues during test module loading.
    if (feature('COORDINATOR_MODE') &&
        isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE) &&
        !mainThreadAgentDefinition) {
        // Lazy require to avoid circular dependency at module load time
        const { getCoordinatorSystemPrompt } = require('../coordinator/coordinatorMode.js');
        return asSystemPrompt([
            getCoordinatorSystemPrompt(),
            ...(appendSystemPrompt ? [appendSystemPrompt] : []),
        ]);
    }
    const agentSystemPrompt = mainThreadAgentDefinition
        ? isBuiltInAgent(mainThreadAgentDefinition)
            ? mainThreadAgentDefinition.getSystemPrompt({
                toolUseContext: { options: toolUseContext.options },
            })
            : mainThreadAgentDefinition.getSystemPrompt()
        : undefined;
    // Log agent memory loaded event for main loop agents
    if (mainThreadAgentDefinition?.memory) {
        logEvent('tengu_agent_memory_loaded', {
            ...(process.env.USER_TYPE === 'ant' && {
                agent_type: mainThreadAgentDefinition.agentType,
            }),
            scope: mainThreadAgentDefinition.memory,
            source: 'main-thread',
        });
    }
    // In proactive mode, agent instructions are appended to the default prompt
    // rather than replacing it. The proactive default prompt is already lean
    // (autonomous agent identity + memory + env + proactive section), and agents
    // add domain-specific behavior on top — same pattern as teammates.
    if (agentSystemPrompt &&
        (feature('PROACTIVE') || feature('KAIROS')) &&
        isProactiveActive_SAFE_TO_CALL_ANYWHERE()) {
        return asSystemPrompt([
            ...defaultSystemPrompt,
            `\n# Custom Agent Instructions\n${agentSystemPrompt}`,
            ...(appendSystemPrompt ? [appendSystemPrompt] : []),
        ]);
    }
    return asSystemPrompt([
        ...(agentSystemPrompt
            ? [agentSystemPrompt]
            : customSystemPrompt
                ? [customSystemPrompt]
                : defaultSystemPrompt),
        ...(appendSystemPrompt ? [appendSystemPrompt] : []),
    ]);
}
//# sourceMappingURL=systemPrompt.js.map