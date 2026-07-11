import { shouldEnablePromptSuggestion } from '../services/PromptSuggestion/promptSuggestion.js';
import { getEmptyToolPermissionContext, } from '../Tool.js';
import { createEmptyAttributionState, } from '../utils/commitAttribution.js';
import { getInitialSettings } from '../utils/settings/settings.js';
import { shouldEnableThinkingByDefault } from '../utils/thinking.js';
export const IDLE_SPECULATION_STATE = { status: 'idle' };
export function getDefaultAppState() {
    // 确定使用 plan_mode_required 生成的队友的初始权限模式
    // 使用延迟 require 避免与 teammate.ts 的循环依赖
    const teammateUtils = require('../utils/teammate.js');
    const initialMode = teammateUtils.isTeammate() && teammateUtils.isPlanModeRequired()
        ? 'plan'
        : 'default';
    return {
        settings: getInitialSettings(),
        tasks: {},
        agentNameRegistry: new Map(),
        verbose: false,
        mainLoopModel: null, // 别名、全名（来自 --model 或环境变量），或 null（默认值）
        mainLoopModelForSession: null,
        rstkRefreshVersion: 0,
        statusLineText: undefined,
        expandedView: 'none',
        isBriefOnly: false,
        showTeammateMessagePreview: false,
        selectedIPAgentIndex: -1,
        coordinatorTaskIndex: -1,
        viewSelectionMode: 'none',
        footerSelection: null,
        kairosEnabled: false,
        remoteSessionUrl: undefined,
        remoteConnectionStatus: 'connecting',
        remoteBackgroundTaskCount: 0,
        replBridgeEnabled: false,
        replBridgeExplicit: false,
        replBridgeOutboundOnly: false,
        replBridgeConnected: false,
        replBridgeSessionActive: false,
        replBridgeReconnecting: false,
        replBridgeConnectUrl: undefined,
        replBridgeSessionUrl: undefined,
        replBridgeEnvironmentId: undefined,
        replBridgeSessionId: undefined,
        replBridgeError: undefined,
        replBridgeInitialName: undefined,
        showRemoteCallout: false,
        toolPermissionContext: {
            ...getEmptyToolPermissionContext(),
            mode: initialMode,
        },
        agent: undefined,
        agentDefinitions: { activeAgents: [], allAgents: [] },
        fileHistory: {
            snapshots: [],
            trackedFiles: new Set(),
            snapshotSequence: 0,
        },
        attribution: createEmptyAttributionState(),
        mcp: {
            clients: [],
            tools: [],
            commands: [],
            resources: {},
            pluginReconnectKey: 0,
        },
        plugins: {
            enabled: [],
            disabled: [],
            commands: [],
            errors: [],
            installationStatus: {
                marketplaces: [],
                plugins: [],
            },
            needsRefresh: false,
        },
        todos: {},
        remoteAgentTaskSuggestions: [],
        notifications: {
            current: null,
            queue: [],
        },
        elicitation: {
            queue: [],
        },
        thinkingEnabled: shouldEnableThinkingByDefault(),
        promptSuggestionEnabled: shouldEnablePromptSuggestion(),
        sessionHooks: new Map(),
        inbox: {
            messages: [],
        },
        workerSandboxPermissions: {
            queue: [],
            selectedIndex: 0,
        },
        pendingWorkerRequest: null,
        pendingSandboxRequest: null,
        promptSuggestion: {
            text: null,
            promptId: null,
            shownAt: 0,
            acceptedAt: 0,
            generationRequestId: null,
        },
        speculation: IDLE_SPECULATION_STATE,
        speculationSessionTimeSavedMs: 0,
        skillImprovement: {
            suggestion: null,
        },
        authVersion: 0,
        initialMessage: null,
        effortValue: undefined,
        activeOverlays: new Set(),
        fastMode: false,
    };
}
