import { realpathSync } from 'fs';
import { sumBy } from '../vendor/lodash.js';
import { cwd } from 'process';
// 浏览器 SDK 构建的间接引用（package.json 中的 "browser" 字段将
// crypto.ts 替换为 crypto.browser.ts）。纯叶子节点重新导出 node:crypto ——
// 零循环依赖风险。使用路径别名导入绕过引导隔离规则（该规则仅检查 ./ 和 / 前缀）；
// 显式禁用注释以说明意图。
// eslint-disable-next-line custom-rules/bootstrap-isolation
import { randomUUID } from '../utils/crypto.js';
import { resetSettingsCache } from '../utils/settings/settingsCache.js';
import { createSignal } from '../utils/signal.js';
// 再次提醒 - 修改前请三思
function getInitialState() {
    // 解析 cwd 中的符号链接，以匹配 shell.ts setCwd 的行为
    // 这确保与会话存储的路径清理方式一致
    let resolvedCwd = '';
    if (typeof process !== 'undefined' &&
        typeof process.cwd === 'function' &&
        typeof realpathSync === 'function') {
        const rawCwd = cwd();
        try {
            resolvedCwd = realpathSync(rawCwd).normalize('NFC');
        }
        catch {
            // 云存储挂载点上的 File Provider EPERM 错误（按路径组件 lstat）。
            resolvedCwd = rawCwd.normalize('NFC');
        }
    }
    const state = {
        originalCwd: resolvedCwd,
        projectRoot: resolvedCwd,
        totalCostUSD: 0,
        totalAPIDuration: 0,
        totalAPIDurationWithoutRetries: 0,
        totalToolDuration: 0,
        turnHookDurationMs: 0,
        turnToolDurationMs: 0,
        turnClassifierDurationMs: 0,
        turnToolCount: 0,
        turnHookCount: 0,
        turnClassifierCount: 0,
        startTime: Date.now(),
        lastInteractionTime: Date.now(),
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
        hasUnknownModelCost: false,
        cwd: resolvedCwd,
        modelUsage: {},
        mainLoopModelOverride: undefined,
        initialMainLoopModel: null,
        modelStrings: null,
        isInteractive: false,
        kairosActive: false,
        strictToolResultPairing: false,
        sdkAgentProgressSummariesEnabled: false,
        userMsgOptIn: false,
        clientType: 'cli',
        sessionSource: undefined,
        questionPreviewFormat: undefined,
        sessionIngressToken: undefined,
        oauthTokenFromFd: undefined,
        apiKeyFromFd: undefined,
        flagSettingsPath: undefined,
        flagSettingsInline: null,
        allowedSettingSources: [
            'userSettings',
            'projectSettings',
            'localSettings',
            'flagSettings',
            'policySettings',
        ],
        // 遥测状态
        meter: null,
        sessionCounter: null,
        locCounter: null,
        prCounter: null,
        commitCounter: null,
        costCounter: null,
        tokenCounter: null,
        codeEditToolDecisionCounter: null,
        activeTimeCounter: null,
        statsStore: null,
        sessionId: randomUUID(),
        parentSessionId: undefined,
        // 日志记录器状态
        loggerProvider: null,
        eventLogger: null,
        // 度量提供者状态
        meterProvider: null,
        tracerProvider: null,
        // Agent 颜色状态
        agentColorMap: new Map(),
        agentColorIndex: 0,
        // 用于错误报告的最后一次 API 请求
        lastAPIRequest: null,
        lastAPIRequestMessages: null,
        // 最后一次自动模式分类器请求（用于 /share 转录）
        lastClassifierRequests: null,
        cachedClaudeMdContent: null,
        // 最近错误的内存错误日志
        inMemoryErrorLog: [],
        // 来自 --plugin-dir 标志的仅会话插件
        inlinePlugins: [],
        // 显式的 --chrome / --no-chrome 标志值（undefined 表示未在 CLI 上设置）
        chromeFlagOverride: undefined,
        // 使用 cowork_plugins 目录而非 plugins
        useCoworkPlugins: false,
        // 仅会话的绕过权限模式标志（不持久化）
        sessionBypassPermissionsMode: false,
        // 定时任务在标志或对话框启用前禁用
        scheduledTasksEnabled: false,
        sessionCronTasks: [],
        sessionCreatedTeams: new Set(),
        // 仅会话的信任标志（不持久化到磁盘）
        sessionTrustAccepted: false,
        // 仅会话的标志，用于禁止将会话持久化到磁盘
        sessionPersistenceDisabled: false,
        // 记录用户在本会话中是否已退出计划模式
        hasExitedPlanMode: false,
        // 记录是否需要显示计划模式退出附件
        needsPlanModeExitAttachment: false,
        // 记录是否需要显示自动模式退出附件
        needsAutoModeExitAttachment: false,
        // 记录本次会话是否已显示过 LSP 插件推荐
        lspRecommendationShownThisSession: false,
        // SDK 初始化事件状态
        initJsonSchema: null,
        registeredHooks: null,
        // 计划短链接缓存
        planSlugCache: new Map(),
        // 记录传送会话信息，用于可靠性日志
        teleportedSessionInfo: null,
        // 记录调用的技能，以便在压缩时保留
        invokedSkills: new Map(),
        // 记录慢操作，用于开发栏显示
        slowOperations: [],
        // SDK 提供的 betas
        sdkBetas: undefined,
        // 主线程 agent 类型
        mainThreadAgentType: undefined,
        // 远程模式
        isRemoteMode: false,
        ...(process.env.USER_TYPE === 'ant'
            ? {
                replBridgeActive: false,
            }
            : {}),
        // 直连服务器 URL
        directConnectServerUrl: undefined,
        // 系统提示词部分缓存状态
        systemPromptSectionCache: new Map(),
        // 上次发送给模型的日期
        lastEmittedDate: null,
        // 来自 --add-dir 标志的额外目录（用于加载 CLAUDE.md）
        additionalDirectoriesForClaudeMd: [],
        // 来自 --channels 标志的频道服务器白名单
        allowedChannels: [],
        hasDevChannels: false,
        // 会话项目目录（null = 从 originalCwd 派生）
        sessionProjectDir: null,
        // 提示缓存 1 小时白名单（null = 尚未从 GrowthBook 获取）
        promptCache1hAllowlist: null,
        // 提示缓存 1 小时资格（null = 尚未评估）
        promptCache1hEligible: null,
        // Beta 头部锁存器（null = 尚未触发）
        afkModeHeaderLatched: null,
        fastModeHeaderLatched: null,
        cacheEditingHeaderLatched: null,
        thinkingClearLatched: null,
        // 当前提示 ID
        promptId: null,
        lastMainRequestId: undefined,
        lastApiCompletionTimestamp: null,
        pendingPostCompaction: false,
    };
    return state;
}
// 尤其注意这里
const STATE = getInitialState();
export function getSessionId() {
    return STATE.sessionId;
}
export function regenerateSessionId(options = {}) {
    if (options.setCurrentAsParent) {
        STATE.parentSessionId = STATE.sessionId;
    }
    // 删除传出会话的计划短链接条目，避免 Map 积累过期的键。
    // 需要跨会话传递短链接的调用者（REPL.tsx clearContext）会在调用 clearConversation 之前读取它。
    STATE.planSlugCache.delete(STATE.sessionId);
    // 重新生成的会话位于当前项目中：将 projectDir 重置为 null，
    // 以便 getTranscriptPath() 从 originalCwd 派生路径。
    STATE.sessionId = randomUUID();
    STATE.sessionProjectDir = null;
    return STATE.sessionId;
}
export function getParentSessionId() {
    return STATE.parentSessionId;
}
/**
 * 原子性地切换活动会话。`sessionId` 和 `sessionProjectDir`
 * 始终一起更改 —— 没有单独的 setter，因此它们不会不同步（CC-34）。
 *
 * @param projectDir — 包含 `<sessionId>.jsonl` 的目录。省略（或
 *   传递 `null`）表示会话在当前项目中 —— 路径将在读取时从 originalCwd 派生。
 *   当会话位于不同项目目录（git worktrees、跨项目恢复）时，传递 `dirname(transcriptPath)`。
 *   每次调用都会重置项目目录；不会从之前的会话继承。
 */
export function switchSession(sessionId, projectDir = null) {
    // 删除传出会话的计划短链接条目，以便 Map 在多次 /resume 时保持边界。
    // 只有当前会话的短链接会被读取（plans.ts getPlanSlug 默认使用 getSessionId()）。
    STATE.planSlugCache.delete(STATE.sessionId);
    STATE.sessionId = sessionId;
    STATE.sessionProjectDir = projectDir;
    sessionSwitched.emit(sessionId);
}
const sessionSwitched = createSignal();
/**
 * 注册一个回调，当 switchSession 更改活动 sessionId 时触发。
 * bootstrap 不能直接导入监听器（DAG 叶子），因此调用者自行注册。
 * concurrentSessions.ts 使用此功能使 PID 文件的 sessionId 与 --resume 保持同步。
 */
export const onSessionSwitch = sessionSwitched.subscribe;
/**
 * 当前会话转录文件所在的项目目录，如果会话是在当前项目中创建的（常见情况 — 从 originalCwd 派生），则为 `null`。
 * 参见 `switchSession()`。
 */
export function getSessionProjectDir() {
    return STATE.sessionProjectDir;
}
export function getOriginalCwd() {
    return STATE.originalCwd;
}
/**
 * 获取稳定的项目根目录。
 * 与 getOriginalCwd() 不同，此值不会在会话中途被 EnterWorktreeTool 更新
 * （因此进入临时 worktree 时，技能/历史记录保持稳定）。
 * 它会在启动时通过 --worktree 设置，因为该 worktree 就是会话的项目。
 * 用于项目标识（历史记录、技能、会话），而非文件操作。
 */
export function getProjectRoot() {
    return STATE.projectRoot;
}
export function setOriginalCwd(cwd) {
    STATE.originalCwd = cwd.normalize('NFC');
}
/**
 * 仅用于 --worktree 启动标志。会话中途的 EnterWorktreeTool 不得调用此函数
 * —— 技能/历史记录应锚定在会话开始时的位置。
 */
export function setProjectRoot(cwd) {
    STATE.projectRoot = cwd.normalize('NFC');
}
export function getCwdState() {
    return STATE.cwd;
}
export function setCwdState(cwd) {
    STATE.cwd = cwd.normalize('NFC');
}
export function getDirectConnectServerUrl() {
    return STATE.directConnectServerUrl;
}
export function setDirectConnectServerUrl(url) {
    STATE.directConnectServerUrl = url;
}
export function addToTotalDurationState(duration, durationWithoutRetries) {
    STATE.totalAPIDuration += duration;
    STATE.totalAPIDurationWithoutRetries += durationWithoutRetries;
}
export function resetTotalDurationStateAndCost_FOR_TESTS_ONLY() {
    STATE.totalAPIDuration = 0;
    STATE.totalAPIDurationWithoutRetries = 0;
    STATE.totalCostUSD = 0;
}
export function addToTotalCostState(cost, modelUsage, model) {
    STATE.modelUsage[model] = modelUsage;
    STATE.totalCostUSD += cost;
}
export function getTotalCostUSD() {
    return STATE.totalCostUSD;
}
export function getTotalAPIDuration() {
    return STATE.totalAPIDuration;
}
export function getTotalDuration() {
    return Date.now() - STATE.startTime;
}
export function getTotalAPIDurationWithoutRetries() {
    return STATE.totalAPIDurationWithoutRetries;
}
export function getTotalToolDuration() {
    return STATE.totalToolDuration;
}
export function addToToolDuration(duration) {
    STATE.totalToolDuration += duration;
    STATE.turnToolDurationMs += duration;
    STATE.turnToolCount++;
}
export function getTurnHookDurationMs() {
    return STATE.turnHookDurationMs;
}
export function addToTurnHookDuration(duration) {
    STATE.turnHookDurationMs += duration;
    STATE.turnHookCount++;
}
export function resetTurnHookDuration() {
    STATE.turnHookDurationMs = 0;
    STATE.turnHookCount = 0;
}
export function getTurnHookCount() {
    return STATE.turnHookCount;
}
export function getTurnToolDurationMs() {
    return STATE.turnToolDurationMs;
}
export function resetTurnToolDuration() {
    STATE.turnToolDurationMs = 0;
    STATE.turnToolCount = 0;
}
export function getTurnToolCount() {
    return STATE.turnToolCount;
}
export function getTurnClassifierDurationMs() {
    return STATE.turnClassifierDurationMs;
}
export function addToTurnClassifierDuration(duration) {
    STATE.turnClassifierDurationMs += duration;
    STATE.turnClassifierCount++;
}
export function resetTurnClassifierDuration() {
    STATE.turnClassifierDurationMs = 0;
    STATE.turnClassifierCount = 0;
}
export function getTurnClassifierCount() {
    return STATE.turnClassifierCount;
}
export function getStatsStore() {
    return STATE.statsStore;
}
export function setStatsStore(store) {
    STATE.statsStore = store;
}
/**
 * 标记发生了一次交互。
 *
 * 默认情况下，实际的 Date.now() 调用会延迟到下一个 Ink 渲染帧
 *（通过 flushInteractionTime()），以避免在每次按键时都调用 Date.now()。
 *
 * 当从 React useEffect 回调或其他 *在* Ink 渲染周期已刷新之后运行的代码中调用时，
 * 传递 `immediate = true`。否则时间戳会保持过时直到下一次渲染，
 * 而如果用户空闲（例如等待输入的权限对话框），下一次渲染可能永远不会发生。
 */
let interactionTimeDirty = false;
export function updateLastInteractionTime(immediate) {
    if (immediate) {
        flushInteractionTime_inner();
    }
    else {
        interactionTimeDirty = true;
    }
}
/**
 * 如果自上次刷新以来记录了交互，则立即更新时间戳。
 * 在每个渲染周期前由 Ink 调用，以便将多次按键合并为一次 Date.now() 调用。
 */
export function flushInteractionTime() {
    if (interactionTimeDirty) {
        flushInteractionTime_inner();
    }
}
function flushInteractionTime_inner() {
    STATE.lastInteractionTime = Date.now();
    interactionTimeDirty = false;
}
export function addToTotalLinesChanged(added, removed) {
    STATE.totalLinesAdded += added;
    STATE.totalLinesRemoved += removed;
}
export function getTotalLinesAdded() {
    return STATE.totalLinesAdded;
}
export function getTotalLinesRemoved() {
    return STATE.totalLinesRemoved;
}
export function getTotalInputTokens() {
    return sumBy(Object.values(STATE.modelUsage), 'inputTokens');
}
export function getTotalOutputTokens() {
    return sumBy(Object.values(STATE.modelUsage), 'outputTokens');
}
export function getTotalCacheReadInputTokens() {
    return sumBy(Object.values(STATE.modelUsage), 'cacheReadInputTokens');
}
export function getTotalCacheCreationInputTokens() {
    return sumBy(Object.values(STATE.modelUsage), 'cacheCreationInputTokens');
}
export function getTotalWebSearchRequests() {
    return sumBy(Object.values(STATE.modelUsage), 'webSearchRequests');
}
let outputTokensAtTurnStart = 0;
let currentTurnTokenBudget = null;
export function getTurnOutputTokens() {
    return getTotalOutputTokens() - outputTokensAtTurnStart;
}
export function getCurrentTurnTokenBudget() {
    return currentTurnTokenBudget;
}
let budgetContinuationCount = 0;
export function snapshotOutputTokensForTurn(budget) {
    outputTokensAtTurnStart = getTotalOutputTokens();
    currentTurnTokenBudget = budget;
    budgetContinuationCount = 0;
}
export function getBudgetContinuationCount() {
    return budgetContinuationCount;
}
export function incrementBudgetContinuationCount() {
    budgetContinuationCount++;
}
export function setHasUnknownModelCost() {
    STATE.hasUnknownModelCost = true;
}
export function hasUnknownModelCost() {
    return STATE.hasUnknownModelCost;
}
export function getLastMainRequestId() {
    return STATE.lastMainRequestId;
}
export function setLastMainRequestId(requestId) {
    STATE.lastMainRequestId = requestId;
}
export function getLastApiCompletionTimestamp() {
    return STATE.lastApiCompletionTimestamp;
}
export function setLastApiCompletionTimestamp(timestamp) {
    STATE.lastApiCompletionTimestamp = timestamp;
}
/** 标记刚刚发生了压缩。下一个 API 成功事件将包含 isPostCompaction=true，然后该标志自动重置。 */
export function markPostCompaction() {
    STATE.pendingPostCompaction = true;
}
/** 消费压缩后标志。压缩后返回一次 true，然后返回 false 直到下一次压缩。 */
export function consumePostCompaction() {
    const was = STATE.pendingPostCompaction;
    STATE.pendingPostCompaction = false;
    return was;
}
export function getLastInteractionTime() {
    return STATE.lastInteractionTime;
}
// 滚动耗尽挂起 — 后台间隔在开始工作前会检查此标志，
// 以避免与滚动帧争夺事件循环。由 ScrollBox scrollBy/scrollTo 设置，
// 在最后一个滚动事件后 SCROLL_DRAIN_IDLE_MS 毫秒清除。
// 模块作用域（不在 STATE 中）— 临时热路径标志，不需要测试重置，因为防抖计时器会自清除。
let scrollDraining = false;
let scrollDrainTimer;
const SCROLL_DRAIN_IDLE_MS = 150;
/** 标记刚刚发生了滚动事件。后台间隔通过 getIsScrollDraining() 进行门控，
 *  并在防抖清除之前跳过工作。 */
export function markScrollActivity() {
    scrollDraining = true;
    if (scrollDrainTimer)
        clearTimeout(scrollDrainTimer);
    scrollDrainTimer = setTimeout(() => {
        scrollDraining = false;
        scrollDrainTimer = undefined;
    }, SCROLL_DRAIN_IDLE_MS);
    scrollDrainTimer.unref?.();
}
/** 当滚动正在主动耗尽时（距离上次事件 150 毫秒内）返回 true。
 *  间隔应在此标志设置时提前返回 — 工作将在滚动稳定后的下一个 tick 继续进行。 */
export function getIsScrollDraining() {
    return scrollDraining;
}
/** 在昂贵的单次工作（网络、子进程）之前等待此函数，这些工作可能与滚动同时发生。
 *  如果不滚动则立即解析；否则按空闲间隔轮询直到标志清除。 */
export async function waitForScrollIdle() {
    while (scrollDraining) {
        // bootstrap-isolation 禁止从 src/utils/ 导入 sleep()
        await new Promise(r => setTimeout(r, SCROLL_DRAIN_IDLE_MS).unref?.());
    }
}
export function getModelUsage() {
    return STATE.modelUsage;
}
export function getUsageForModel(model) {
    return STATE.modelUsage[model];
}
/**
 * 获取通过 --model CLI 标志设置的模型覆盖，或用户更新其配置模型后的值。
 */
export function getMainLoopModelOverride() {
    return STATE.mainLoopModelOverride;
}
export function getInitialMainLoopModel() {
    return STATE.initialMainLoopModel;
}
export function setMainLoopModelOverride(model) {
    STATE.mainLoopModelOverride = model;
}
export function setInitialMainLoopModel(model) {
    STATE.initialMainLoopModel = model;
}
export function getSdkBetas() {
    return STATE.sdkBetas;
}
export function setSdkBetas(betas) {
    STATE.sdkBetas = betas;
}
export function resetCostState() {
    STATE.totalCostUSD = 0;
    STATE.totalAPIDuration = 0;
    STATE.totalAPIDurationWithoutRetries = 0;
    STATE.totalToolDuration = 0;
    STATE.startTime = Date.now();
    STATE.totalLinesAdded = 0;
    STATE.totalLinesRemoved = 0;
    STATE.hasUnknownModelCost = false;
    STATE.modelUsage = {};
    STATE.promptId = null;
}
/**
 * 设置用于会话恢复的成本状态值。
 * 由 cost-tracker.ts 中的 restoreCostStateForSession 调用。
 */
export function setCostStateForRestore({ totalCostUSD, totalAPIDuration, totalAPIDurationWithoutRetries, totalToolDuration, totalLinesAdded, totalLinesRemoved, lastDuration, modelUsage, }) {
    STATE.totalCostUSD = totalCostUSD;
    STATE.totalAPIDuration = totalAPIDuration;
    STATE.totalAPIDurationWithoutRetries = totalAPIDurationWithoutRetries;
    STATE.totalToolDuration = totalToolDuration;
    STATE.totalLinesAdded = totalLinesAdded;
    STATE.totalLinesRemoved = totalLinesRemoved;
    // 恢复按模型的用量细分
    if (modelUsage) {
        STATE.modelUsage = modelUsage;
    }
    // 调整 startTime 以使墙钟持续时间累积
    if (lastDuration) {
        STATE.startTime = Date.now() - lastDuration;
    }
}
// 仅用于测试
export function resetStateForTests() {
    if (process.env.NODE_ENV !== 'test') {
        throw new Error('resetStateForTests 只能在测试中调用');
    }
    Object.entries(getInitialState()).forEach(([key, value]) => {
        STATE[key] = value;
    });
    outputTokensAtTurnStart = 0;
    currentTurnTokenBudget = null;
    budgetContinuationCount = 0;
    sessionSwitched.clear();
}
// 你不应该直接使用这个。请参考 src/utils/model/modelStrings.ts::getModelStrings()
export function getModelStrings() {
    return STATE.modelStrings;
}
// 你不应该直接使用这个。请参考 src/utils/model/modelStrings.ts
export function setModelStrings(modelStrings) {
    STATE.modelStrings = modelStrings;
}
// 用于重新初始化模型字符串的测试工具函数。
// 与 setModelStrings 分开，因为我们只在测试中接受 'null'。
export function resetModelStringsForTestingOnly() {
    STATE.modelStrings = null;
}
export function setMeter(meter, createCounter) {
    STATE.meter = meter;
    // 使用提供的工厂初始化所有计数器
    STATE.sessionCounter = createCounter('claude_code.session.count', {
        description: 'CLI 会话启动次数',
    });
    STATE.locCounter = createCounter('claude_code.lines_of_code.count', {
        description: "修改的代码行数，'type' 属性表示新增或删除",
    });
    STATE.prCounter = createCounter('claude_code.pull_request.count', {
        description: '创建的拉取请求数',
    });
    STATE.commitCounter = createCounter('claude_code.commit.count', {
        description: '创建的 Git 提交数',
    });
    STATE.costCounter = createCounter('claude_code.cost.usage', {
        description: 'Claude Code 会话成本',
        unit: 'USD',
    });
    STATE.tokenCounter = createCounter('claude_code.token.usage', {
        description: '使用的 Token 数',
        unit: 'tokens',
    });
    STATE.codeEditToolDecisionCounter = createCounter('claude_code.code_edit_tool.decision', {
        description: '代码编辑工具权限决策计数（接受/拒绝），适用于 Edit, Write, and NotebookEdit 工具',
    });
    STATE.activeTimeCounter = createCounter('claude_code.active_time.total', {
        description: '总活跃时间（秒）',
        unit: 's',
    });
}
export function getMeter() {
    return STATE.meter;
}
export function getSessionCounter() {
    return STATE.sessionCounter;
}
export function getLocCounter() {
    return STATE.locCounter;
}
export function getPrCounter() {
    return STATE.prCounter;
}
export function getCommitCounter() {
    return STATE.commitCounter;
}
export function getCostCounter() {
    return STATE.costCounter;
}
export function getTokenCounter() {
    return STATE.tokenCounter;
}
export function getCodeEditToolDecisionCounter() {
    return STATE.codeEditToolDecisionCounter;
}
export function getActiveTimeCounter() {
    return STATE.activeTimeCounter;
}
export function getLoggerProvider() {
    return STATE.loggerProvider;
}
export function setLoggerProvider(provider) {
    STATE.loggerProvider = provider;
}
export function getEventLogger() {
    return STATE.eventLogger;
}
export function setEventLogger(logger) {
    STATE.eventLogger = logger;
}
export function getMeterProvider() {
    return STATE.meterProvider;
}
export function setMeterProvider(provider) {
    STATE.meterProvider = provider;
}
export function getTracerProvider() {
    return STATE.tracerProvider;
}
export function setTracerProvider(provider) {
    STATE.tracerProvider = provider;
}
export function getIsNonInteractiveSession() {
    return !STATE.isInteractive;
}
export function getIsInteractive() {
    return STATE.isInteractive;
}
export function setIsInteractive(value) {
    STATE.isInteractive = value;
}
export function getClientType() {
    return STATE.clientType;
}
export function setClientType(type) {
    STATE.clientType = type;
}
export function getSdkAgentProgressSummariesEnabled() {
    return STATE.sdkAgentProgressSummariesEnabled;
}
export function setSdkAgentProgressSummariesEnabled(value) {
    STATE.sdkAgentProgressSummariesEnabled = value;
}
export function getKairosActive() {
    return STATE.kairosActive;
}
export function setKairosActive(value) {
    STATE.kairosActive = value;
}
export function getStrictToolResultPairing() {
    return STATE.strictToolResultPairing;
}
export function setStrictToolResultPairing(value) {
    STATE.strictToolResultPairing = value;
}
// 字段名 'userMsgOptIn' 避免被排除的字符串子串（'BriefTool'、'SendUserMessage' —— 不区分大小写）。
// 所有调用者都在 feature() 守卫内，因此这些访问器不需要自己的守卫（与 getKairosActive 一致）。
export function getUserMsgOptIn() {
    return STATE.userMsgOptIn;
}
export function setUserMsgOptIn(value) {
    STATE.userMsgOptIn = value;
}
export function getSessionSource() {
    return STATE.sessionSource;
}
export function setSessionSource(source) {
    STATE.sessionSource = source;
}
export function getQuestionPreviewFormat() {
    return STATE.questionPreviewFormat;
}
export function setQuestionPreviewFormat(format) {
    STATE.questionPreviewFormat = format;
}
export function getAgentColorMap() {
    return STATE.agentColorMap;
}
export function getFlagSettingsPath() {
    return STATE.flagSettingsPath;
}
export function setFlagSettingsPath(path) {
    STATE.flagSettingsPath = path;
}
export function getFlagSettingsInline() {
    return STATE.flagSettingsInline;
}
export function setFlagSettingsInline(settings) {
    STATE.flagSettingsInline = settings;
}
export function getSessionIngressToken() {
    return STATE.sessionIngressToken;
}
export function setSessionIngressToken(token) {
    STATE.sessionIngressToken = token;
}
export function getOauthTokenFromFd() {
    return STATE.oauthTokenFromFd;
}
export function setOauthTokenFromFd(token) {
    STATE.oauthTokenFromFd = token;
}
export function getApiKeyFromFd() {
    return STATE.apiKeyFromFd;
}
export function setApiKeyFromFd(key) {
    STATE.apiKeyFromFd = key;
}
export function setLastAPIRequest(params) {
    STATE.lastAPIRequest = params;
}
export function getLastAPIRequest() {
    return STATE.lastAPIRequest;
}
export function setLastAPIRequestMessages(messages) {
    STATE.lastAPIRequestMessages = messages;
}
export function getLastAPIRequestMessages() {
    return STATE.lastAPIRequestMessages;
}
export function setLastClassifierRequests(requests) {
    STATE.lastClassifierRequests = requests;
}
export function getLastClassifierRequests() {
    return STATE.lastClassifierRequests;
}
export function setCachedClaudeMdContent(content) {
    STATE.cachedClaudeMdContent = content;
}
export function getCachedClaudeMdContent() {
    return STATE.cachedClaudeMdContent;
}
export function addToInMemoryErrorLog(errorInfo) {
    const MAX_IN_MEMORY_ERRORS = 100;
    if (STATE.inMemoryErrorLog.length >= MAX_IN_MEMORY_ERRORS) {
        STATE.inMemoryErrorLog.shift(); // 移除最旧的错误
    }
    STATE.inMemoryErrorLog.push(errorInfo);
}
export function getAllowedSettingSources() {
    return STATE.allowedSettingSources;
}
export function setAllowedSettingSources(sources) {
    STATE.allowedSettingSources = sources;
}
export function preferThirdPartyAuthentication() {
    // IDE 扩展在身份验证方面应表现为第一方。
    return getIsNonInteractiveSession() && STATE.clientType !== 'claude-vscode';
}
export function setInlinePlugins(plugins) {
    STATE.inlinePlugins = plugins;
}
export function getInlinePlugins() {
    return STATE.inlinePlugins;
}
export function setChromeFlagOverride(value) {
    STATE.chromeFlagOverride = value;
}
export function getChromeFlagOverride() {
    return STATE.chromeFlagOverride;
}
export function setUseCoworkPlugins(value) {
    STATE.useCoworkPlugins = value;
    resetSettingsCache();
}
export function getUseCoworkPlugins() {
    return STATE.useCoworkPlugins;
}
export function setSessionBypassPermissionsMode(enabled) {
    STATE.sessionBypassPermissionsMode = enabled;
}
export function getSessionBypassPermissionsMode() {
    return STATE.sessionBypassPermissionsMode;
}
export function setScheduledTasksEnabled(enabled) {
    STATE.scheduledTasksEnabled = enabled;
}
export function getScheduledTasksEnabled() {
    return STATE.scheduledTasksEnabled;
}
export function getSessionCronTasks() {
    return STATE.sessionCronTasks;
}
export function addSessionCronTask(task) {
    STATE.sessionCronTasks.push(task);
}
/**
 * 返回实际删除的任务数量。调用者使用此值来跳过下游工作
 * （例如 removeCronTasks 中的磁盘读取），当所有 id 都已在此处处理时。
 */
export function removeSessionCronTasks(ids) {
    if (ids.length === 0)
        return 0;
    const idSet = new Set(ids);
    const remaining = STATE.sessionCronTasks.filter(t => !idSet.has(t.id));
    const removed = STATE.sessionCronTasks.length - remaining.length;
    if (removed === 0)
        return 0;
    STATE.sessionCronTasks = remaining;
    return removed;
}
export function setSessionTrustAccepted(accepted) {
    STATE.sessionTrustAccepted = accepted;
}
export function getSessionTrustAccepted() {
    return STATE.sessionTrustAccepted;
}
export function setSessionPersistenceDisabled(disabled) {
    STATE.sessionPersistenceDisabled = disabled;
}
export function isSessionPersistenceDisabled() {
    return STATE.sessionPersistenceDisabled;
}
export function hasExitedPlanModeInSession() {
    return STATE.hasExitedPlanMode;
}
export function setHasExitedPlanMode(value) {
    STATE.hasExitedPlanMode = value;
}
export function needsPlanModeExitAttachment() {
    return STATE.needsPlanModeExitAttachment;
}
export function setNeedsPlanModeExitAttachment(value) {
    STATE.needsPlanModeExitAttachment = value;
}
export function handlePlanModeTransition(fromMode, toMode) {
    // 如果切换至计划模式，清除任何待处理的退出附件
    // 这可以防止用户在快速切换时同时发送 plan_mode 和 plan_mode_exit
    if (toMode === 'plan' && fromMode !== 'plan') {
        STATE.needsPlanModeExitAttachment = false;
    }
    // 如果切换出计划模式，触发 plan_mode_exit 附件
    if (fromMode === 'plan' && toMode !== 'plan') {
        STATE.needsPlanModeExitAttachment = true;
    }
}
export function needsAutoModeExitAttachment() {
    return STATE.needsAutoModeExitAttachment;
}
export function setNeedsAutoModeExitAttachment(value) {
    STATE.needsAutoModeExitAttachment = value;
}
export function handleAutoModeTransition(fromMode, toMode) {
    // 自动↔计划模式的转换由 prepareContextForPlanMode（如果用户选择，自动模式可能在计划模式下保持激活）
    // 和 ExitPlanMode（恢复模式）处理。跳过这两个方向，使此函数仅处理直接的自动模式转换。
    if ((fromMode === 'auto' && toMode === 'plan') ||
        (fromMode === 'plan' && toMode === 'auto')) {
        return;
    }
    const fromIsAuto = fromMode === 'auto';
    const toIsAuto = toMode === 'auto';
    // 如果切换至自动模式，清除任何待处理的退出附件
    // 这可以防止用户在快速切换时同时发送 auto_mode 和 auto_mode_exit
    if (toIsAuto && !fromIsAuto) {
        STATE.needsAutoModeExitAttachment = false;
    }
    // 如果切换出自动模式，触发 auto_mode_exit 附件
    if (fromIsAuto && !toIsAuto) {
        STATE.needsAutoModeExitAttachment = true;
    }
}
// LSP 插件推荐的会话跟踪
export function hasShownLspRecommendationThisSession() {
    return STATE.lspRecommendationShownThisSession;
}
export function setLspRecommendationShownThisSession(value) {
    STATE.lspRecommendationShownThisSession = value;
}
// SDK 初始化事件状态
export function setInitJsonSchema(schema) {
    STATE.initJsonSchema = schema;
}
export function getInitJsonSchema() {
    return STATE.initJsonSchema;
}
export function registerHookCallbacks(hooks) {
    if (!STATE.registeredHooks) {
        STATE.registeredHooks = {};
    }
    // `registerHookCallbacks` 可能被多次调用，因此需要合并（而非覆盖）
    for (const [event, matchers] of Object.entries(hooks)) {
        const eventKey = event;
        if (!STATE.registeredHooks[eventKey]) {
            STATE.registeredHooks[eventKey] = [];
        }
        STATE.registeredHooks[eventKey].push(...matchers);
    }
}
export function getRegisteredHooks() {
    return STATE.registeredHooks;
}
export function clearRegisteredHooks() {
    STATE.registeredHooks = null;
}
export function clearRegisteredPluginHooks() {
    if (!STATE.registeredHooks) {
        return;
    }
    const filtered = {};
    for (const [event, matchers] of Object.entries(STATE.registeredHooks)) {
        // 仅保留回调钩子（那些没有 pluginRoot 的）
        const callbackHooks = matchers.filter(m => !('pluginRoot' in m));
        if (callbackHooks.length > 0) {
            filtered[event] = callbackHooks;
        }
    }
    STATE.registeredHooks = Object.keys(filtered).length > 0 ? filtered : null;
}
export function resetSdkInitState() {
    STATE.initJsonSchema = null;
    STATE.registeredHooks = null;
}
export function getPlanSlugCache() {
    return STATE.planSlugCache;
}
export function getSessionCreatedTeams() {
    return STATE.sessionCreatedTeams;
}
// 用于可靠性日志的传送会话跟踪
export function setTeleportedSessionInfo(info) {
    STATE.teleportedSessionInfo = {
        isTeleported: true,
        hasLoggedFirstMessage: false,
        sessionId: info.sessionId,
    };
}
export function getTeleportedSessionInfo() {
    return STATE.teleportedSessionInfo;
}
export function markFirstTeleportMessageLogged() {
    if (STATE.teleportedSessionInfo) {
        STATE.teleportedSessionInfo.hasLoggedFirstMessage = true;
    }
}
export function addInvokedSkill(skillName, skillPath, content, agentId = null) {
    const key = `${agentId ?? ''}:${skillName}`;
    STATE.invokedSkills.set(key, {
        skillName,
        skillPath,
        content,
        invokedAt: Date.now(),
        agentId,
    });
}
export function getInvokedSkills() {
    return STATE.invokedSkills;
}
export function getInvokedSkillsForAgent(agentId) {
    const normalizedId = agentId ?? null;
    const filtered = new Map();
    for (const [key, skill] of STATE.invokedSkills) {
        if (skill.agentId === normalizedId) {
            filtered.set(key, skill);
        }
    }
    return filtered;
}
export function clearInvokedSkills(preservedAgentIds) {
    if (!preservedAgentIds || preservedAgentIds.size === 0) {
        STATE.invokedSkills.clear();
        return;
    }
    for (const [key, skill] of STATE.invokedSkills) {
        if (skill.agentId === null || !preservedAgentIds.has(skill.agentId)) {
            STATE.invokedSkills.delete(key);
        }
    }
}
export function clearInvokedSkillsForAgent(agentId) {
    for (const [key, skill] of STATE.invokedSkills) {
        if (skill.agentId === agentId) {
            STATE.invokedSkills.delete(key);
        }
    }
}
// 用于开发栏的慢操作跟踪
const MAX_SLOW_OPERATIONS = 10;
const SLOW_OPERATION_TTL_MS = 10000;
export function addSlowOperation(operation, durationMs) {
    if (process.env.USER_TYPE !== 'ant')
        return;
    // 跳过编辑器会话的跟踪（用户在 $EDITOR 中编辑提示文件）
    // 这些操作因用户正在起草文本而故意缓慢
    if (operation.includes('exec') && operation.includes('claude-prompt-')) {
        return;
    }
    const now = Date.now();
    // 移除过时的操作
    STATE.slowOperations = STATE.slowOperations.filter(op => now - op.timestamp < SLOW_OPERATION_TTL_MS);
    // 添加新操作
    STATE.slowOperations.push({ operation, durationMs, timestamp: now });
    // 仅保留最近的操作
    if (STATE.slowOperations.length > MAX_SLOW_OPERATIONS) {
        STATE.slowOperations = STATE.slowOperations.slice(-MAX_SLOW_OPERATIONS);
    }
}
const EMPTY_SLOW_OPERATIONS = [];
export function getSlowOperations() {
    // 最常见的情况：没有跟踪任何操作。返回一个稳定的引用，
    // 以便调用者的 setState() 可以通过 Object.is 进行判断，避免以 2fps 的速度重新渲染。
    if (STATE.slowOperations.length === 0) {
        return EMPTY_SLOW_OPERATIONS;
    }
    const now = Date.now();
    // 仅当有内容实际过期时才分配新数组；否则在操作仍为新鲜时保持引用稳定。
    if (STATE.slowOperations.some(op => now - op.timestamp >= SLOW_OPERATION_TTL_MS)) {
        STATE.slowOperations = STATE.slowOperations.filter(op => now - op.timestamp < SLOW_OPERATION_TTL_MS);
        if (STATE.slowOperations.length === 0) {
            return EMPTY_SLOW_OPERATIONS;
        }
    }
    // 直接返回是安全的：addSlowOperation() 会在推送前重新赋值 STATE.slowOperations，
    // 因此 React 状态中持有的数组永远不会被突变。
    return STATE.slowOperations;
}
export function getMainThreadAgentType() {
    return STATE.mainThreadAgentType;
}
export function setMainThreadAgentType(agentType) {
    STATE.mainThreadAgentType = agentType;
}
export function getIsRemoteMode() {
    return STATE.isRemoteMode;
}
export function setIsRemoteMode(value) {
    STATE.isRemoteMode = value;
}
// 系统提示词部分访问器
export function getSystemPromptSectionCache() {
    return STATE.systemPromptSectionCache;
}
export function setSystemPromptSectionCacheEntry(name, value) {
    STATE.systemPromptSectionCache.set(name, value);
}
export function clearSystemPromptSectionState() {
    STATE.systemPromptSectionCache.clear();
}
// 上次发送的日期访问器（用于检测午夜日期变更）
export function getLastEmittedDate() {
    return STATE.lastEmittedDate;
}
export function setLastEmittedDate(date) {
    STATE.lastEmittedDate = date;
}
export function getAdditionalDirectoriesForClaudeMd() {
    return STATE.additionalDirectoriesForClaudeMd;
}
export function setAdditionalDirectoriesForClaudeMd(directories) {
    STATE.additionalDirectoriesForClaudeMd = directories;
}
export function getAllowedChannels() {
    return STATE.allowedChannels;
}
export function setAllowedChannels(entries) {
    STATE.allowedChannels = entries;
}
export function getHasDevChannels() {
    return STATE.hasDevChannels;
}
export function setHasDevChannels(value) {
    STATE.hasDevChannels = value;
}
export function getPromptCache1hAllowlist() {
    return STATE.promptCache1hAllowlist;
}
export function setPromptCache1hAllowlist(allowlist) {
    STATE.promptCache1hAllowlist = allowlist;
}
export function getPromptCache1hEligible() {
    return STATE.promptCache1hEligible;
}
export function setPromptCache1hEligible(eligible) {
    STATE.promptCache1hEligible = eligible;
}
export function getAfkModeHeaderLatched() {
    return STATE.afkModeHeaderLatched;
}
export function setAfkModeHeaderLatched(v) {
    STATE.afkModeHeaderLatched = v;
}
export function getFastModeHeaderLatched() {
    return STATE.fastModeHeaderLatched;
}
export function setFastModeHeaderLatched(v) {
    STATE.fastModeHeaderLatched = v;
}
export function getCacheEditingHeaderLatched() {
    return STATE.cacheEditingHeaderLatched;
}
export function setCacheEditingHeaderLatched(v) {
    STATE.cacheEditingHeaderLatched = v;
}
export function getThinkingClearLatched() {
    return STATE.thinkingClearLatched;
}
export function setThinkingClearLatched(v) {
    STATE.thinkingClearLatched = v;
}
/**
 * 将 beta 头部锁存器重置为 null。在 /clear 和 /compact 时调用，
 * 以便全新的对话获得全新的头部评估。
 */
export function clearBetaHeaderLatches() {
    STATE.afkModeHeaderLatched = null;
    STATE.fastModeHeaderLatched = null;
    STATE.cacheEditingHeaderLatched = null;
    STATE.thinkingClearLatched = null;
}
export function getPromptId() {
    return STATE.promptId;
}
export function setPromptId(id) {
    STATE.promptId = id;
}
export function isReplBridgeActive() { return false; }
//# sourceMappingURL=state.js.map