import { getSessionId } from '../../bootstrap/state.js';
import { AGENT_COLORS, } from '../../tools/AgentTool/agentColorManager.js';
import { getTranscriptPath, saveAgentColor, } from '../../utils/sessionStorage.js';
import { isTeammate } from '../../utils/teammate.js';
const RESET_ALIASES = ['default', 'reset', 'none', 'gray', 'grey'];
export async function call(onDone, context, args) {
    // Teammates cannot set their own color
    if (isTeammate()) {
        onDone('无法设置颜色：此会话是 Swarm 队员。队员颜色由队长分配。', { display: 'system' });
        return null;
    }
    if (!args || args.trim() === '') {
        const colorList = AGENT_COLORS.join(', ');
        onDone(`请提供一个颜色。可用颜色: ${colorList}, default`, {
            display: 'system',
        });
        return null;
    }
    const colorArg = args.trim().toLowerCase();
    // Handle reset to default (gray)
    if (RESET_ALIASES.includes(colorArg)) {
        const sessionId = getSessionId();
        const fullPath = getTranscriptPath();
        // Use "default" sentinel (not empty string) so truthiness guards
        // in sessionStorage.ts persist the reset across session restarts
        await saveAgentColor(sessionId, 'default', fullPath);
        context.setAppState(prev => ({
            ...prev,
            standaloneAgentContext: {
                ...prev.standaloneAgentContext,
                name: prev.standaloneAgentContext?.name ?? '',
                color: undefined,
            },
        }));
        onDone('会话颜色已重置为默认值', { display: 'system' });
        return null;
    }
    if (!AGENT_COLORS.includes(colorArg)) {
        const colorList = AGENT_COLORS.join(', ');
        onDone(`无效的颜色 "${colorArg}"。可用颜色: ${colorList}, default`, { display: 'system' });
        return null;
    }
    const sessionId = getSessionId();
    const fullPath = getTranscriptPath();
    // Save to transcript for persistence across sessions
    await saveAgentColor(sessionId, colorArg, fullPath);
    // Update AppState for immediate effect
    context.setAppState(prev => ({
        ...prev,
        standaloneAgentContext: {
            ...prev.standaloneAgentContext,
            name: prev.standaloneAgentContext?.name ?? '',
            color: colorArg,
        },
    }));
    onDone(`会话颜色已设置为: ${colorArg}`, { display: 'system' });
    return null;
}
//# sourceMappingURL=color.js.map