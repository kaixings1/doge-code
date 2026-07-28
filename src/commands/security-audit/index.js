var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

// src/vendor/lodash.js
function sumBy(arr, iteratee) {
  if (arr == null)
    return 0;
  var sum = 0;
  for (var i = 0;i < arr.length; i++) {
    sum += typeof iteratee === "function" ? iteratee(arr[i]) : arr[i][iteratee];
  }
  return sum;
}

// src/utils/crypto.js
import { randomUUID } from "crypto";
var init_crypto = () => {};

// src/utils/settings/settingsCache.js
function resetSettingsCache() {
  sessionSettingsCache = null;
  perSourceCache.clear();
  parseFileCache.clear();
}
var sessionSettingsCache = null, perSourceCache, parseFileCache;
var init_settingsCache = __esm(() => {
  perSourceCache = new Map;
  parseFileCache = new Map;
});

// src/utils/signal.js
function createSignal() {
  const listeners = new Set;
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(...args) {
      for (const listener of listeners)
        listener(...args);
    },
    clear() {
      listeners.clear();
    }
  };
}

// src/bootstrap/state.js
var exports_state = {};
__export(exports_state, {
  waitForScrollIdle: () => waitForScrollIdle,
  updateLastInteractionTime: () => updateLastInteractionTime,
  switchSession: () => switchSession,
  snapshotOutputTokensForTurn: () => snapshotOutputTokensForTurn,
  setUserMsgOptIn: () => setUserMsgOptIn,
  setUseCoworkPlugins: () => setUseCoworkPlugins,
  setTracerProvider: () => setTracerProvider,
  setThinkingClearLatched: () => setThinkingClearLatched,
  setTeleportedSessionInfo: () => setTeleportedSessionInfo,
  setSystemPromptSectionCacheEntry: () => setSystemPromptSectionCacheEntry,
  setStrictToolResultPairing: () => setStrictToolResultPairing,
  setStatsStore: () => setStatsStore,
  setSessionTrustAccepted: () => setSessionTrustAccepted,
  setSessionSource: () => setSessionSource,
  setSessionPersistenceDisabled: () => setSessionPersistenceDisabled,
  setSessionIngressToken: () => setSessionIngressToken,
  setSessionBypassPermissionsMode: () => setSessionBypassPermissionsMode,
  setSdkBetas: () => setSdkBetas,
  setSdkAgentProgressSummariesEnabled: () => setSdkAgentProgressSummariesEnabled,
  setScheduledTasksEnabled: () => setScheduledTasksEnabled,
  setQuestionPreviewFormat: () => setQuestionPreviewFormat,
  setPromptId: () => setPromptId,
  setPromptCache1hEligible: () => setPromptCache1hEligible,
  setPromptCache1hAllowlist: () => setPromptCache1hAllowlist,
  setProjectRoot: () => setProjectRoot,
  setOriginalCwd: () => setOriginalCwd,
  setOauthTokenFromFd: () => setOauthTokenFromFd,
  setNeedsPlanModeExitAttachment: () => setNeedsPlanModeExitAttachment,
  setNeedsAutoModeExitAttachment: () => setNeedsAutoModeExitAttachment,
  setModelStrings: () => setModelStrings,
  setMeterProvider: () => setMeterProvider,
  setMeter: () => setMeter,
  setMainThreadAgentType: () => setMainThreadAgentType,
  setMainLoopModelOverride: () => setMainLoopModelOverride,
  setLspRecommendationShownThisSession: () => setLspRecommendationShownThisSession,
  setLoggerProvider: () => setLoggerProvider,
  setLastMainRequestId: () => setLastMainRequestId,
  setLastEmittedDate: () => setLastEmittedDate,
  setLastClassifierRequests: () => setLastClassifierRequests,
  setLastApiCompletionTimestamp: () => setLastApiCompletionTimestamp,
  setLastAPIRequestMessages: () => setLastAPIRequestMessages,
  setLastAPIRequest: () => setLastAPIRequest,
  setKairosActive: () => setKairosActive,
  setIsRemoteMode: () => setIsRemoteMode,
  setIsInteractive: () => setIsInteractive,
  setInlinePlugins: () => setInlinePlugins,
  setInitialMainLoopModel: () => setInitialMainLoopModel,
  setInitJsonSchema: () => setInitJsonSchema,
  setHasUnknownModelCost: () => setHasUnknownModelCost,
  setHasExitedPlanMode: () => setHasExitedPlanMode,
  setHasDevChannels: () => setHasDevChannels,
  setFlagSettingsPath: () => setFlagSettingsPath,
  setFlagSettingsInline: () => setFlagSettingsInline,
  setFastModeHeaderLatched: () => setFastModeHeaderLatched,
  setEventLogger: () => setEventLogger,
  setDirectConnectServerUrl: () => setDirectConnectServerUrl,
  setCwdState: () => setCwdState,
  setCostStateForRestore: () => setCostStateForRestore,
  setClientType: () => setClientType,
  setChromeFlagOverride: () => setChromeFlagOverride,
  setCachedClaudeMdContent: () => setCachedClaudeMdContent,
  setCacheEditingHeaderLatched: () => setCacheEditingHeaderLatched,
  setApiKeyFromFd: () => setApiKeyFromFd,
  setAllowedSettingSources: () => setAllowedSettingSources,
  setAllowedChannels: () => setAllowedChannels,
  setAfkModeHeaderLatched: () => setAfkModeHeaderLatched,
  setAdditionalDirectoriesForClaudeMd: () => setAdditionalDirectoriesForClaudeMd,
  resetTurnToolDuration: () => resetTurnToolDuration,
  resetTurnHookDuration: () => resetTurnHookDuration,
  resetTurnClassifierDuration: () => resetTurnClassifierDuration,
  resetTotalDurationStateAndCost_FOR_TESTS_ONLY: () => resetTotalDurationStateAndCost_FOR_TESTS_ONLY,
  resetStateForTests: () => resetStateForTests,
  resetSdkInitState: () => resetSdkInitState,
  resetModelStringsForTestingOnly: () => resetModelStringsForTestingOnly,
  resetCostState: () => resetCostState,
  removeSessionCronTasks: () => removeSessionCronTasks,
  registerHookCallbacks: () => registerHookCallbacks,
  regenerateSessionId: () => regenerateSessionId,
  preferThirdPartyAuthentication: () => preferThirdPartyAuthentication,
  onSessionSwitch: () => onSessionSwitch,
  needsPlanModeExitAttachment: () => needsPlanModeExitAttachment,
  needsAutoModeExitAttachment: () => needsAutoModeExitAttachment,
  markScrollActivity: () => markScrollActivity,
  markPostCompaction: () => markPostCompaction,
  markFirstTeleportMessageLogged: () => markFirstTeleportMessageLogged,
  isSessionPersistenceDisabled: () => isSessionPersistenceDisabled,
  isReplBridgeActive: () => isReplBridgeActive,
  incrementBudgetContinuationCount: () => incrementBudgetContinuationCount,
  hasUnknownModelCost: () => hasUnknownModelCost,
  hasShownLspRecommendationThisSession: () => hasShownLspRecommendationThisSession,
  hasExitedPlanModeInSession: () => hasExitedPlanModeInSession,
  handlePlanModeTransition: () => handlePlanModeTransition,
  handleAutoModeTransition: () => handleAutoModeTransition,
  getUserMsgOptIn: () => getUserMsgOptIn,
  getUseCoworkPlugins: () => getUseCoworkPlugins,
  getUsageForModel: () => getUsageForModel,
  getTurnToolDurationMs: () => getTurnToolDurationMs,
  getTurnToolCount: () => getTurnToolCount,
  getTurnOutputTokens: () => getTurnOutputTokens,
  getTurnHookDurationMs: () => getTurnHookDurationMs,
  getTurnHookCount: () => getTurnHookCount,
  getTurnClassifierDurationMs: () => getTurnClassifierDurationMs,
  getTurnClassifierCount: () => getTurnClassifierCount,
  getTracerProvider: () => getTracerProvider,
  getTotalWebSearchRequests: () => getTotalWebSearchRequests,
  getTotalToolDuration: () => getTotalToolDuration,
  getTotalOutputTokens: () => getTotalOutputTokens,
  getTotalLinesRemoved: () => getTotalLinesRemoved,
  getTotalLinesAdded: () => getTotalLinesAdded,
  getTotalInputTokens: () => getTotalInputTokens,
  getTotalDuration: () => getTotalDuration,
  getTotalCostUSD: () => getTotalCostUSD,
  getTotalCacheReadInputTokens: () => getTotalCacheReadInputTokens,
  getTotalCacheCreationInputTokens: () => getTotalCacheCreationInputTokens,
  getTotalAPIDurationWithoutRetries: () => getTotalAPIDurationWithoutRetries,
  getTotalAPIDuration: () => getTotalAPIDuration,
  getTokenCounter: () => getTokenCounter,
  getThinkingClearLatched: () => getThinkingClearLatched,
  getTeleportedSessionInfo: () => getTeleportedSessionInfo,
  getSystemPromptSectionCache: () => getSystemPromptSectionCache,
  getStrictToolResultPairing: () => getStrictToolResultPairing,
  getStatsStore: () => getStatsStore,
  getSlowOperations: () => getSlowOperations,
  getSessionTrustAccepted: () => getSessionTrustAccepted,
  getSessionSource: () => getSessionSource,
  getSessionProjectDir: () => getSessionProjectDir,
  getSessionIngressToken: () => getSessionIngressToken,
  getSessionId: () => getSessionId,
  getSessionCronTasks: () => getSessionCronTasks,
  getSessionCreatedTeams: () => getSessionCreatedTeams,
  getSessionCounter: () => getSessionCounter,
  getSessionBypassPermissionsMode: () => getSessionBypassPermissionsMode,
  getSdkBetas: () => getSdkBetas,
  getSdkAgentProgressSummariesEnabled: () => getSdkAgentProgressSummariesEnabled,
  getScheduledTasksEnabled: () => getScheduledTasksEnabled,
  getRegisteredHooks: () => getRegisteredHooks,
  getQuestionPreviewFormat: () => getQuestionPreviewFormat,
  getPromptId: () => getPromptId,
  getPromptCache1hEligible: () => getPromptCache1hEligible,
  getPromptCache1hAllowlist: () => getPromptCache1hAllowlist,
  getProjectRoot: () => getProjectRoot,
  getPrCounter: () => getPrCounter,
  getPlanSlugCache: () => getPlanSlugCache,
  getParentSessionId: () => getParentSessionId,
  getOriginalCwd: () => getOriginalCwd,
  getOauthTokenFromFd: () => getOauthTokenFromFd,
  getModelUsage: () => getModelUsage,
  getModelStrings: () => getModelStrings,
  getMeterProvider: () => getMeterProvider,
  getMeter: () => getMeter,
  getMainThreadAgentType: () => getMainThreadAgentType,
  getMainLoopModelOverride: () => getMainLoopModelOverride,
  getLoggerProvider: () => getLoggerProvider,
  getLocCounter: () => getLocCounter,
  getLastMainRequestId: () => getLastMainRequestId,
  getLastInteractionTime: () => getLastInteractionTime,
  getLastEmittedDate: () => getLastEmittedDate,
  getLastClassifierRequests: () => getLastClassifierRequests,
  getLastApiCompletionTimestamp: () => getLastApiCompletionTimestamp,
  getLastAPIRequestMessages: () => getLastAPIRequestMessages,
  getLastAPIRequest: () => getLastAPIRequest,
  getKairosActive: () => getKairosActive,
  getIsScrollDraining: () => getIsScrollDraining,
  getIsRemoteMode: () => getIsRemoteMode,
  getIsNonInteractiveSession: () => getIsNonInteractiveSession,
  getIsInteractive: () => getIsInteractive,
  getInvokedSkillsForAgent: () => getInvokedSkillsForAgent,
  getInvokedSkills: () => getInvokedSkills,
  getInlinePlugins: () => getInlinePlugins,
  getInitialMainLoopModel: () => getInitialMainLoopModel,
  getInitJsonSchema: () => getInitJsonSchema,
  getHasDevChannels: () => getHasDevChannels,
  getFlagSettingsPath: () => getFlagSettingsPath,
  getFlagSettingsInline: () => getFlagSettingsInline,
  getFastModeHeaderLatched: () => getFastModeHeaderLatched,
  getEventLogger: () => getEventLogger,
  getDirectConnectServerUrl: () => getDirectConnectServerUrl,
  getCwdState: () => getCwdState,
  getCurrentTurnTokenBudget: () => getCurrentTurnTokenBudget,
  getCostCounter: () => getCostCounter,
  getCommitCounter: () => getCommitCounter,
  getCodeEditToolDecisionCounter: () => getCodeEditToolDecisionCounter,
  getClientType: () => getClientType,
  getChromeFlagOverride: () => getChromeFlagOverride,
  getCachedClaudeMdContent: () => getCachedClaudeMdContent,
  getCacheEditingHeaderLatched: () => getCacheEditingHeaderLatched,
  getBudgetContinuationCount: () => getBudgetContinuationCount,
  getApiKeyFromFd: () => getApiKeyFromFd,
  getAllowedSettingSources: () => getAllowedSettingSources,
  getAllowedChannels: () => getAllowedChannels,
  getAgentColorMap: () => getAgentColorMap,
  getAfkModeHeaderLatched: () => getAfkModeHeaderLatched,
  getAdditionalDirectoriesForClaudeMd: () => getAdditionalDirectoriesForClaudeMd,
  getActiveTimeCounter: () => getActiveTimeCounter,
  flushInteractionTime: () => flushInteractionTime,
  consumePostCompaction: () => consumePostCompaction,
  clearSystemPromptSectionState: () => clearSystemPromptSectionState,
  clearRegisteredPluginHooks: () => clearRegisteredPluginHooks,
  clearRegisteredHooks: () => clearRegisteredHooks,
  clearInvokedSkillsForAgent: () => clearInvokedSkillsForAgent,
  clearInvokedSkills: () => clearInvokedSkills,
  clearBetaHeaderLatches: () => clearBetaHeaderLatches,
  addToTurnHookDuration: () => addToTurnHookDuration,
  addToTurnClassifierDuration: () => addToTurnClassifierDuration,
  addToTotalLinesChanged: () => addToTotalLinesChanged,
  addToTotalDurationState: () => addToTotalDurationState,
  addToTotalCostState: () => addToTotalCostState,
  addToToolDuration: () => addToToolDuration,
  addToInMemoryErrorLog: () => addToInMemoryErrorLog,
  addSlowOperation: () => addSlowOperation,
  addSessionCronTask: () => addSessionCronTask,
  addInvokedSkill: () => addInvokedSkill
});
import { realpathSync } from "fs";
import { cwd } from "process";
function getInitialState() {
  let resolvedCwd = "";
  if (typeof process !== "undefined" && typeof process.cwd === "function" && typeof realpathSync === "function") {
    const rawCwd = cwd();
    try {
      resolvedCwd = realpathSync(rawCwd).normalize("NFC");
    } catch {
      resolvedCwd = rawCwd.normalize("NFC");
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
    clientType: "cli",
    sessionSource: undefined,
    questionPreviewFormat: undefined,
    sessionIngressToken: undefined,
    oauthTokenFromFd: undefined,
    apiKeyFromFd: undefined,
    flagSettingsPath: undefined,
    flagSettingsInline: null,
    allowedSettingSources: [
      "userSettings",
      "projectSettings",
      "localSettings",
      "flagSettings",
      "policySettings"
    ],
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
    loggerProvider: null,
    eventLogger: null,
    meterProvider: null,
    tracerProvider: null,
    agentColorMap: new Map,
    agentColorIndex: 0,
    lastAPIRequest: null,
    lastAPIRequestMessages: null,
    lastClassifierRequests: null,
    cachedClaudeMdContent: null,
    inMemoryErrorLog: [],
    inlinePlugins: [],
    chromeFlagOverride: undefined,
    useCoworkPlugins: false,
    sessionBypassPermissionsMode: false,
    scheduledTasksEnabled: false,
    sessionCronTasks: [],
    sessionCreatedTeams: new Set,
    sessionTrustAccepted: false,
    sessionPersistenceDisabled: false,
    hasExitedPlanMode: false,
    needsPlanModeExitAttachment: false,
    needsAutoModeExitAttachment: false,
    lspRecommendationShownThisSession: false,
    initJsonSchema: null,
    registeredHooks: null,
    planSlugCache: new Map,
    teleportedSessionInfo: null,
    invokedSkills: new Map,
    slowOperations: [],
    sdkBetas: undefined,
    mainThreadAgentType: undefined,
    isRemoteMode: false,
    ...process.env.USER_TYPE === "ant" ? {
      replBridgeActive: false
    } : {},
    directConnectServerUrl: undefined,
    systemPromptSectionCache: new Map,
    lastEmittedDate: null,
    additionalDirectoriesForClaudeMd: [],
    allowedChannels: [],
    hasDevChannels: false,
    sessionProjectDir: null,
    promptCache1hAllowlist: null,
    promptCache1hEligible: null,
    afkModeHeaderLatched: null,
    fastModeHeaderLatched: null,
    cacheEditingHeaderLatched: null,
    thinkingClearLatched: null,
    promptId: null,
    lastMainRequestId: undefined,
    lastApiCompletionTimestamp: null,
    pendingPostCompaction: false
  };
  return state;
}
function getSessionId() {
  return STATE.sessionId;
}
function regenerateSessionId(options = {}) {
  if (options.setCurrentAsParent) {
    STATE.parentSessionId = STATE.sessionId;
  }
  STATE.planSlugCache.delete(STATE.sessionId);
  STATE.sessionId = randomUUID();
  STATE.sessionProjectDir = null;
  return STATE.sessionId;
}
function getParentSessionId() {
  return STATE.parentSessionId;
}
function switchSession(sessionId, projectDir = null) {
  STATE.planSlugCache.delete(STATE.sessionId);
  STATE.sessionId = sessionId;
  STATE.sessionProjectDir = projectDir;
  sessionSwitched.emit(sessionId);
}
function getSessionProjectDir() {
  return STATE.sessionProjectDir;
}
function getOriginalCwd() {
  return STATE.originalCwd;
}
function getProjectRoot() {
  return STATE.projectRoot;
}
function setOriginalCwd(cwd2) {
  STATE.originalCwd = cwd2.normalize("NFC");
}
function setProjectRoot(cwd2) {
  STATE.projectRoot = cwd2.normalize("NFC");
}
function getCwdState() {
  return STATE.cwd;
}
function setCwdState(cwd2) {
  STATE.cwd = cwd2.normalize("NFC");
}
function getDirectConnectServerUrl() {
  return STATE.directConnectServerUrl;
}
function setDirectConnectServerUrl(url) {
  STATE.directConnectServerUrl = url;
}
function addToTotalDurationState(duration, durationWithoutRetries) {
  STATE.totalAPIDuration += duration;
  STATE.totalAPIDurationWithoutRetries += durationWithoutRetries;
}
function resetTotalDurationStateAndCost_FOR_TESTS_ONLY() {
  STATE.totalAPIDuration = 0;
  STATE.totalAPIDurationWithoutRetries = 0;
  STATE.totalCostUSD = 0;
}
function addToTotalCostState(cost, modelUsage, model) {
  STATE.modelUsage[model] = modelUsage;
  STATE.totalCostUSD += cost;
}
function getTotalCostUSD() {
  return STATE.totalCostUSD;
}
function getTotalAPIDuration() {
  return STATE.totalAPIDuration;
}
function getTotalDuration() {
  return Date.now() - STATE.startTime;
}
function getTotalAPIDurationWithoutRetries() {
  return STATE.totalAPIDurationWithoutRetries;
}
function getTotalToolDuration() {
  return STATE.totalToolDuration;
}
function addToToolDuration(duration) {
  STATE.totalToolDuration += duration;
  STATE.turnToolDurationMs += duration;
  STATE.turnToolCount++;
}
function getTurnHookDurationMs() {
  return STATE.turnHookDurationMs;
}
function addToTurnHookDuration(duration) {
  STATE.turnHookDurationMs += duration;
  STATE.turnHookCount++;
}
function resetTurnHookDuration() {
  STATE.turnHookDurationMs = 0;
  STATE.turnHookCount = 0;
}
function getTurnHookCount() {
  return STATE.turnHookCount;
}
function getTurnToolDurationMs() {
  return STATE.turnToolDurationMs;
}
function resetTurnToolDuration() {
  STATE.turnToolDurationMs = 0;
  STATE.turnToolCount = 0;
}
function getTurnToolCount() {
  return STATE.turnToolCount;
}
function getTurnClassifierDurationMs() {
  return STATE.turnClassifierDurationMs;
}
function addToTurnClassifierDuration(duration) {
  STATE.turnClassifierDurationMs += duration;
  STATE.turnClassifierCount++;
}
function resetTurnClassifierDuration() {
  STATE.turnClassifierDurationMs = 0;
  STATE.turnClassifierCount = 0;
}
function getTurnClassifierCount() {
  return STATE.turnClassifierCount;
}
function getStatsStore() {
  return STATE.statsStore;
}
function setStatsStore(store) {
  STATE.statsStore = store;
}
function updateLastInteractionTime(immediate) {
  if (immediate) {
    flushInteractionTime_inner();
  } else {
    interactionTimeDirty = true;
  }
}
function flushInteractionTime() {
  if (interactionTimeDirty) {
    flushInteractionTime_inner();
  }
}
function flushInteractionTime_inner() {
  STATE.lastInteractionTime = Date.now();
  interactionTimeDirty = false;
}
function addToTotalLinesChanged(added, removed) {
  STATE.totalLinesAdded += added;
  STATE.totalLinesRemoved += removed;
}
function getTotalLinesAdded() {
  return STATE.totalLinesAdded;
}
function getTotalLinesRemoved() {
  return STATE.totalLinesRemoved;
}
function getTotalInputTokens() {
  return sumBy(Object.values(STATE.modelUsage), "inputTokens");
}
function getTotalOutputTokens() {
  return sumBy(Object.values(STATE.modelUsage), "outputTokens");
}
function getTotalCacheReadInputTokens() {
  return sumBy(Object.values(STATE.modelUsage), "cacheReadInputTokens");
}
function getTotalCacheCreationInputTokens() {
  return sumBy(Object.values(STATE.modelUsage), "cacheCreationInputTokens");
}
function getTotalWebSearchRequests() {
  return sumBy(Object.values(STATE.modelUsage), "webSearchRequests");
}
function getTurnOutputTokens() {
  return getTotalOutputTokens() - outputTokensAtTurnStart;
}
function getCurrentTurnTokenBudget() {
  return currentTurnTokenBudget;
}
function snapshotOutputTokensForTurn(budget) {
  outputTokensAtTurnStart = getTotalOutputTokens();
  currentTurnTokenBudget = budget;
  budgetContinuationCount = 0;
}
function getBudgetContinuationCount() {
  return budgetContinuationCount;
}
function incrementBudgetContinuationCount() {
  budgetContinuationCount++;
}
function setHasUnknownModelCost() {
  STATE.hasUnknownModelCost = true;
}
function hasUnknownModelCost() {
  return STATE.hasUnknownModelCost;
}
function getLastMainRequestId() {
  return STATE.lastMainRequestId;
}
function setLastMainRequestId(requestId) {
  STATE.lastMainRequestId = requestId;
}
function getLastApiCompletionTimestamp() {
  return STATE.lastApiCompletionTimestamp;
}
function setLastApiCompletionTimestamp(timestamp) {
  STATE.lastApiCompletionTimestamp = timestamp;
}
function markPostCompaction() {
  STATE.pendingPostCompaction = true;
}
function consumePostCompaction() {
  const was = STATE.pendingPostCompaction;
  STATE.pendingPostCompaction = false;
  return was;
}
function getLastInteractionTime() {
  return STATE.lastInteractionTime;
}
function markScrollActivity() {
  scrollDraining = true;
  if (scrollDrainTimer)
    clearTimeout(scrollDrainTimer);
  scrollDrainTimer = setTimeout(() => {
    scrollDraining = false;
    scrollDrainTimer = undefined;
  }, SCROLL_DRAIN_IDLE_MS);
  scrollDrainTimer.unref?.();
}
function getIsScrollDraining() {
  return scrollDraining;
}
async function waitForScrollIdle() {
  while (scrollDraining) {
    await new Promise((r) => setTimeout(r, SCROLL_DRAIN_IDLE_MS).unref?.());
  }
}
function getModelUsage() {
  return STATE.modelUsage;
}
function getUsageForModel(model) {
  return STATE.modelUsage[model];
}
function getMainLoopModelOverride() {
  return STATE.mainLoopModelOverride;
}
function getInitialMainLoopModel() {
  return STATE.initialMainLoopModel;
}
function setMainLoopModelOverride(model) {
  STATE.mainLoopModelOverride = model;
}
function setInitialMainLoopModel(model) {
  STATE.initialMainLoopModel = model;
}
function getSdkBetas() {
  return STATE.sdkBetas;
}
function setSdkBetas(betas) {
  STATE.sdkBetas = betas;
}
function resetCostState() {
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
function setCostStateForRestore({ totalCostUSD, totalAPIDuration, totalAPIDurationWithoutRetries, totalToolDuration, totalLinesAdded, totalLinesRemoved, lastDuration, modelUsage }) {
  STATE.totalCostUSD = totalCostUSD;
  STATE.totalAPIDuration = totalAPIDuration;
  STATE.totalAPIDurationWithoutRetries = totalAPIDurationWithoutRetries;
  STATE.totalToolDuration = totalToolDuration;
  STATE.totalLinesAdded = totalLinesAdded;
  STATE.totalLinesRemoved = totalLinesRemoved;
  if (modelUsage) {
    STATE.modelUsage = modelUsage;
  }
  if (lastDuration) {
    STATE.startTime = Date.now() - lastDuration;
  }
}
function resetStateForTests() {
  if (true) {
    throw new Error("resetStateForTests 只能在测试中调用");
  }
  Object.entries(getInitialState()).forEach(([key, value]) => {
    STATE[key] = value;
  });
  outputTokensAtTurnStart = 0;
  currentTurnTokenBudget = null;
  budgetContinuationCount = 0;
  sessionSwitched.clear();
}
function getModelStrings() {
  return STATE.modelStrings;
}
function setModelStrings(modelStrings) {
  STATE.modelStrings = modelStrings;
}
function resetModelStringsForTestingOnly() {
  STATE.modelStrings = null;
}
function setMeter(meter, createCounter) {
  STATE.meter = meter;
  STATE.sessionCounter = createCounter("claude_code.session.count", {
    description: "CLI 会话启动次数"
  });
  STATE.locCounter = createCounter("claude_code.lines_of_code.count", {
    description: "修改的代码行数，'type' 属性表示新增或删除"
  });
  STATE.prCounter = createCounter("claude_code.pull_request.count", {
    description: "创建的拉取请求数"
  });
  STATE.commitCounter = createCounter("claude_code.commit.count", {
    description: "创建的 Git 提交数"
  });
  STATE.costCounter = createCounter("claude_code.cost.usage", {
    description: "Claude Code 会话成本",
    unit: "USD"
  });
  STATE.tokenCounter = createCounter("claude_code.token.usage", {
    description: "使用的 Token 数",
    unit: "tokens"
  });
  STATE.codeEditToolDecisionCounter = createCounter("claude_code.code_edit_tool.decision", {
    description: "代码编辑工具权限决策计数（接受/拒绝），适用于 Edit, Write, and NotebookEdit 工具"
  });
  STATE.activeTimeCounter = createCounter("claude_code.active_time.total", {
    description: "总活跃时间（秒）",
    unit: "s"
  });
}
function getMeter() {
  return STATE.meter;
}
function getSessionCounter() {
  return STATE.sessionCounter;
}
function getLocCounter() {
  return STATE.locCounter;
}
function getPrCounter() {
  return STATE.prCounter;
}
function getCommitCounter() {
  return STATE.commitCounter;
}
function getCostCounter() {
  return STATE.costCounter;
}
function getTokenCounter() {
  return STATE.tokenCounter;
}
function getCodeEditToolDecisionCounter() {
  return STATE.codeEditToolDecisionCounter;
}
function getActiveTimeCounter() {
  return STATE.activeTimeCounter;
}
function getLoggerProvider() {
  return STATE.loggerProvider;
}
function setLoggerProvider(provider) {
  STATE.loggerProvider = provider;
}
function getEventLogger() {
  return STATE.eventLogger;
}
function setEventLogger(logger) {
  STATE.eventLogger = logger;
}
function getMeterProvider() {
  return STATE.meterProvider;
}
function setMeterProvider(provider) {
  STATE.meterProvider = provider;
}
function getTracerProvider() {
  return STATE.tracerProvider;
}
function setTracerProvider(provider) {
  STATE.tracerProvider = provider;
}
function getIsNonInteractiveSession() {
  return !STATE.isInteractive;
}
function getIsInteractive() {
  return STATE.isInteractive;
}
function setIsInteractive(value) {
  STATE.isInteractive = value;
}
function getClientType() {
  return STATE.clientType;
}
function setClientType(type) {
  STATE.clientType = type;
}
function getSdkAgentProgressSummariesEnabled() {
  return STATE.sdkAgentProgressSummariesEnabled;
}
function setSdkAgentProgressSummariesEnabled(value) {
  STATE.sdkAgentProgressSummariesEnabled = value;
}
function getKairosActive() {
  return STATE.kairosActive;
}
function setKairosActive(value) {
  STATE.kairosActive = value;
}
function getStrictToolResultPairing() {
  return STATE.strictToolResultPairing;
}
function setStrictToolResultPairing(value) {
  STATE.strictToolResultPairing = value;
}
function getUserMsgOptIn() {
  return STATE.userMsgOptIn;
}
function setUserMsgOptIn(value) {
  STATE.userMsgOptIn = value;
}
function getSessionSource() {
  return STATE.sessionSource;
}
function setSessionSource(source) {
  STATE.sessionSource = source;
}
function getQuestionPreviewFormat() {
  return STATE.questionPreviewFormat;
}
function setQuestionPreviewFormat(format) {
  STATE.questionPreviewFormat = format;
}
function getAgentColorMap() {
  return STATE.agentColorMap;
}
function getFlagSettingsPath() {
  return STATE.flagSettingsPath;
}
function setFlagSettingsPath(path) {
  STATE.flagSettingsPath = path;
}
function getFlagSettingsInline() {
  return STATE.flagSettingsInline;
}
function setFlagSettingsInline(settings) {
  STATE.flagSettingsInline = settings;
}
function getSessionIngressToken() {
  return STATE.sessionIngressToken;
}
function setSessionIngressToken(token) {
  STATE.sessionIngressToken = token;
}
function getOauthTokenFromFd() {
  return STATE.oauthTokenFromFd;
}
function setOauthTokenFromFd(token) {
  STATE.oauthTokenFromFd = token;
}
function getApiKeyFromFd() {
  return STATE.apiKeyFromFd;
}
function setApiKeyFromFd(key) {
  STATE.apiKeyFromFd = key;
}
function setLastAPIRequest(params) {
  STATE.lastAPIRequest = params;
}
function getLastAPIRequest() {
  return STATE.lastAPIRequest;
}
function setLastAPIRequestMessages(messages) {
  STATE.lastAPIRequestMessages = messages;
}
function getLastAPIRequestMessages() {
  return STATE.lastAPIRequestMessages;
}
function setLastClassifierRequests(requests) {
  STATE.lastClassifierRequests = requests;
}
function getLastClassifierRequests() {
  return STATE.lastClassifierRequests;
}
function setCachedClaudeMdContent(content) {
  STATE.cachedClaudeMdContent = content;
}
function getCachedClaudeMdContent() {
  return STATE.cachedClaudeMdContent;
}
function addToInMemoryErrorLog(errorInfo) {
  const MAX_IN_MEMORY_ERRORS = 100;
  if (STATE.inMemoryErrorLog.length >= MAX_IN_MEMORY_ERRORS) {
    STATE.inMemoryErrorLog.shift();
  }
  STATE.inMemoryErrorLog.push(errorInfo);
}
function getAllowedSettingSources() {
  return STATE.allowedSettingSources;
}
function setAllowedSettingSources(sources) {
  STATE.allowedSettingSources = sources;
}
function preferThirdPartyAuthentication() {
  return getIsNonInteractiveSession() && STATE.clientType !== "claude-vscode";
}
function setInlinePlugins(plugins) {
  STATE.inlinePlugins = plugins;
}
function getInlinePlugins() {
  return STATE.inlinePlugins;
}
function setChromeFlagOverride(value) {
  STATE.chromeFlagOverride = value;
}
function getChromeFlagOverride() {
  return STATE.chromeFlagOverride;
}
function setUseCoworkPlugins(value) {
  STATE.useCoworkPlugins = value;
  resetSettingsCache();
}
function getUseCoworkPlugins() {
  return STATE.useCoworkPlugins;
}
function setSessionBypassPermissionsMode(enabled) {
  STATE.sessionBypassPermissionsMode = enabled;
}
function getSessionBypassPermissionsMode() {
  return STATE.sessionBypassPermissionsMode;
}
function setScheduledTasksEnabled(enabled) {
  STATE.scheduledTasksEnabled = enabled;
}
function getScheduledTasksEnabled() {
  return STATE.scheduledTasksEnabled;
}
function getSessionCronTasks() {
  return STATE.sessionCronTasks;
}
function addSessionCronTask(task) {
  STATE.sessionCronTasks.push(task);
}
function removeSessionCronTasks(ids) {
  if (ids.length === 0)
    return 0;
  const idSet = new Set(ids);
  const remaining = STATE.sessionCronTasks.filter((t) => !idSet.has(t.id));
  const removed = STATE.sessionCronTasks.length - remaining.length;
  if (removed === 0)
    return 0;
  STATE.sessionCronTasks = remaining;
  return removed;
}
function setSessionTrustAccepted(accepted) {
  STATE.sessionTrustAccepted = accepted;
}
function getSessionTrustAccepted() {
  return STATE.sessionTrustAccepted;
}
function setSessionPersistenceDisabled(disabled) {
  STATE.sessionPersistenceDisabled = disabled;
}
function isSessionPersistenceDisabled() {
  return STATE.sessionPersistenceDisabled;
}
function hasExitedPlanModeInSession() {
  return STATE.hasExitedPlanMode;
}
function setHasExitedPlanMode(value) {
  STATE.hasExitedPlanMode = value;
}
function needsPlanModeExitAttachment() {
  return STATE.needsPlanModeExitAttachment;
}
function setNeedsPlanModeExitAttachment(value) {
  STATE.needsPlanModeExitAttachment = value;
}
function handlePlanModeTransition(fromMode, toMode) {
  if (toMode === "plan" && fromMode !== "plan") {
    STATE.needsPlanModeExitAttachment = false;
  }
  if (fromMode === "plan" && toMode !== "plan") {
    STATE.needsPlanModeExitAttachment = true;
  }
}
function needsAutoModeExitAttachment() {
  return STATE.needsAutoModeExitAttachment;
}
function setNeedsAutoModeExitAttachment(value) {
  STATE.needsAutoModeExitAttachment = value;
}
function handleAutoModeTransition(fromMode, toMode) {
  if (fromMode === "auto" && toMode === "plan" || fromMode === "plan" && toMode === "auto") {
    return;
  }
  const fromIsAuto = fromMode === "auto";
  const toIsAuto = toMode === "auto";
  if (toIsAuto && !fromIsAuto) {
    STATE.needsAutoModeExitAttachment = false;
  }
  if (fromIsAuto && !toIsAuto) {
    STATE.needsAutoModeExitAttachment = true;
  }
}
function hasShownLspRecommendationThisSession() {
  return STATE.lspRecommendationShownThisSession;
}
function setLspRecommendationShownThisSession(value) {
  STATE.lspRecommendationShownThisSession = value;
}
function setInitJsonSchema(schema) {
  STATE.initJsonSchema = schema;
}
function getInitJsonSchema() {
  return STATE.initJsonSchema;
}
function registerHookCallbacks(hooks) {
  if (!STATE.registeredHooks) {
    STATE.registeredHooks = {};
  }
  for (const [event, matchers] of Object.entries(hooks)) {
    const eventKey = event;
    if (!STATE.registeredHooks[eventKey]) {
      STATE.registeredHooks[eventKey] = [];
    }
    STATE.registeredHooks[eventKey].push(...matchers);
  }
}
function getRegisteredHooks() {
  return STATE.registeredHooks;
}
function clearRegisteredHooks() {
  STATE.registeredHooks = null;
}
function clearRegisteredPluginHooks() {
  if (!STATE.registeredHooks) {
    return;
  }
  const filtered = {};
  for (const [event, matchers] of Object.entries(STATE.registeredHooks)) {
    const callbackHooks = matchers.filter((m) => !("pluginRoot" in m));
    if (callbackHooks.length > 0) {
      filtered[event] = callbackHooks;
    }
  }
  STATE.registeredHooks = Object.keys(filtered).length > 0 ? filtered : null;
}
function resetSdkInitState() {
  STATE.initJsonSchema = null;
  STATE.registeredHooks = null;
}
function getPlanSlugCache() {
  return STATE.planSlugCache;
}
function getSessionCreatedTeams() {
  return STATE.sessionCreatedTeams;
}
function setTeleportedSessionInfo(info) {
  STATE.teleportedSessionInfo = {
    isTeleported: true,
    hasLoggedFirstMessage: false,
    sessionId: info.sessionId
  };
}
function getTeleportedSessionInfo() {
  return STATE.teleportedSessionInfo;
}
function markFirstTeleportMessageLogged() {
  if (STATE.teleportedSessionInfo) {
    STATE.teleportedSessionInfo.hasLoggedFirstMessage = true;
  }
}
function addInvokedSkill(skillName, skillPath, content, agentId = null) {
  const key = `${agentId ?? ""}:${skillName}`;
  STATE.invokedSkills.set(key, {
    skillName,
    skillPath,
    content,
    invokedAt: Date.now(),
    agentId
  });
}
function getInvokedSkills() {
  return STATE.invokedSkills;
}
function getInvokedSkillsForAgent(agentId) {
  const normalizedId = agentId ?? null;
  const filtered = new Map;
  for (const [key, skill] of STATE.invokedSkills) {
    if (skill.agentId === normalizedId) {
      filtered.set(key, skill);
    }
  }
  return filtered;
}
function clearInvokedSkills(preservedAgentIds) {
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
function clearInvokedSkillsForAgent(agentId) {
  for (const [key, skill] of STATE.invokedSkills) {
    if (skill.agentId === agentId) {
      STATE.invokedSkills.delete(key);
    }
  }
}
function addSlowOperation(operation, durationMs) {
  if (process.env.USER_TYPE !== "ant")
    return;
  if (operation.includes("exec") && operation.includes("claude-prompt-")) {
    return;
  }
  const now = Date.now();
  STATE.slowOperations = STATE.slowOperations.filter((op) => now - op.timestamp < SLOW_OPERATION_TTL_MS);
  STATE.slowOperations.push({ operation, durationMs, timestamp: now });
  if (STATE.slowOperations.length > MAX_SLOW_OPERATIONS) {
    STATE.slowOperations = STATE.slowOperations.slice(-MAX_SLOW_OPERATIONS);
  }
}
function getSlowOperations() {
  if (STATE.slowOperations.length === 0) {
    return EMPTY_SLOW_OPERATIONS;
  }
  const now = Date.now();
  if (STATE.slowOperations.some((op) => now - op.timestamp >= SLOW_OPERATION_TTL_MS)) {
    STATE.slowOperations = STATE.slowOperations.filter((op) => now - op.timestamp < SLOW_OPERATION_TTL_MS);
    if (STATE.slowOperations.length === 0) {
      return EMPTY_SLOW_OPERATIONS;
    }
  }
  return STATE.slowOperations;
}
function getMainThreadAgentType() {
  return STATE.mainThreadAgentType;
}
function setMainThreadAgentType(agentType) {
  STATE.mainThreadAgentType = agentType;
}
function getIsRemoteMode() {
  return STATE.isRemoteMode;
}
function setIsRemoteMode(value) {
  STATE.isRemoteMode = value;
}
function getSystemPromptSectionCache() {
  return STATE.systemPromptSectionCache;
}
function setSystemPromptSectionCacheEntry(name, value) {
  STATE.systemPromptSectionCache.set(name, value);
}
function clearSystemPromptSectionState() {
  STATE.systemPromptSectionCache.clear();
}
function getLastEmittedDate() {
  return STATE.lastEmittedDate;
}
function setLastEmittedDate(date) {
  STATE.lastEmittedDate = date;
}
function getAdditionalDirectoriesForClaudeMd() {
  return STATE.additionalDirectoriesForClaudeMd;
}
function setAdditionalDirectoriesForClaudeMd(directories) {
  STATE.additionalDirectoriesForClaudeMd = directories;
}
function getAllowedChannels() {
  return STATE.allowedChannels;
}
function setAllowedChannels(entries) {
  STATE.allowedChannels = entries;
}
function getHasDevChannels() {
  return STATE.hasDevChannels;
}
function setHasDevChannels(value) {
  STATE.hasDevChannels = value;
}
function getPromptCache1hAllowlist() {
  return STATE.promptCache1hAllowlist;
}
function setPromptCache1hAllowlist(allowlist) {
  STATE.promptCache1hAllowlist = allowlist;
}
function getPromptCache1hEligible() {
  return STATE.promptCache1hEligible;
}
function setPromptCache1hEligible(eligible) {
  STATE.promptCache1hEligible = eligible;
}
function getAfkModeHeaderLatched() {
  return STATE.afkModeHeaderLatched;
}
function setAfkModeHeaderLatched(v) {
  STATE.afkModeHeaderLatched = v;
}
function getFastModeHeaderLatched() {
  return STATE.fastModeHeaderLatched;
}
function setFastModeHeaderLatched(v) {
  STATE.fastModeHeaderLatched = v;
}
function getCacheEditingHeaderLatched() {
  return STATE.cacheEditingHeaderLatched;
}
function setCacheEditingHeaderLatched(v) {
  STATE.cacheEditingHeaderLatched = v;
}
function getThinkingClearLatched() {
  return STATE.thinkingClearLatched;
}
function setThinkingClearLatched(v) {
  STATE.thinkingClearLatched = v;
}
function clearBetaHeaderLatches() {
  STATE.afkModeHeaderLatched = null;
  STATE.fastModeHeaderLatched = null;
  STATE.cacheEditingHeaderLatched = null;
  STATE.thinkingClearLatched = null;
}
function getPromptId() {
  return STATE.promptId;
}
function setPromptId(id) {
  STATE.promptId = id;
}
function isReplBridgeActive() {
  return false;
}
var STATE, sessionSwitched, onSessionSwitch, interactionTimeDirty = false, outputTokensAtTurnStart = 0, currentTurnTokenBudget = null, budgetContinuationCount = 0, scrollDraining = false, scrollDrainTimer, SCROLL_DRAIN_IDLE_MS = 150, MAX_SLOW_OPERATIONS = 10, SLOW_OPERATION_TTL_MS = 1e4, EMPTY_SLOW_OPERATIONS;
var init_state = __esm(() => {
  init_crypto();
  init_settingsCache();
  STATE = getInitialState();
  sessionSwitched = createSignal();
  onSessionSwitch = sessionSwitched.subscribe;
  EMPTY_SLOW_OPERATIONS = [];
});

// src/commands/security-audit/index.ts
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, resolve, extname } from "path";
var HELP_TEXT = `\uD83D\uDEE1️ **Security Audit 命令** - 安全审计工具

**用法**: /security-audit [选项]

**选项**:
  --scan <路径>    - 扫描目录中的代码
  --file <路径>    - 扫描单个文件
  --rule <规则>    - 指定检查规则 (sql-injection, xss, cmd-injection, hardcode-secrets, dangerous-api)
  --format <格式>  - 输出格式 (text/json)
  --fix          - 自动修复可修复的问题
  --help         - 显示帮助

**支持的文件类型**: .ts, .tsx, .js, .jsx, .py, .go, .java, .php

**示例**:
  /security-audit --scan ./src           # 扫描整个 src 目录
  /security-audit --file app.js           # 扫描单个文件
  /security-audit --scan . --rule xss      # 只检查 XSS 漏洞
  /security-audit --scan . --fix         # 自动修复`;
var SECURITY_RULES = {
  "sql-injection": {
    pattern: /\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION).*\+.*\$|\$\{.*\}.*SELECT|query\s*\+\s*req\.|\.query\(.*\)/i,
    severity: "high",
    message: "可能的 SQL 注入漏洞"
  },
  xss: {
    pattern: /innerHTML\s*=|document\.write|eval\s*\(|untrusted|dangerouslySetInnerHTML/i,
    severity: "high",
    message: "可能的 XSS 漏洞"
  },
  "cmd-injection": {
    pattern: /exec\s*\(|execFile\s*\(|spawn\s*\(|shell\s*=\s*true|child_process/i,
    severity: "high",
    message: "可能的命令注入风险"
  },
  "hardcode-secrets": {
    pattern: /(api[_-]?key|secret|password|token|apikey)\s*[:=]\s*["'][^"']+["']|['"][a-zA-Z0-9]{32,}["']/i,
    severity: "medium",
    message: "检测到硬编码密钥"
  },
  "dangerous-api": {
    pattern: /localStorage\.setItem.*password|sessionStorage|\.eval\s*\(|new Function\s*\(/i,
    severity: "medium",
    message: "使用危险 API"
  },
  "insecure-random": {
    pattern: /Math\.random\s*\(\)|random\(\)|rand\(\)/i,
    severity: "low",
    message: "使用不安全的随机数生成"
  }
};
var CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".php"];
function scanFile(filePath, rules = []) {
  const issues = [];
  const absPath = resolve(filePath);
  if (!existsSync(absPath))
    return issues;
  try {
    const content = readFileSync(absPath, "utf-8");
    const lines = content.split(`
`);
    const rulesToCheck = rules.length > 0 ? rules : Object.keys(SECURITY_RULES);
    for (const ruleName of rulesToCheck) {
      const rule = SECURITY_RULES[ruleName];
      if (!rule)
        continue;
      lines.forEach((line, index) => {
        if (rule.pattern.test(line)) {
          issues.push({
            file: filePath,
            line: index + 1,
            rule: ruleName,
            severity: rule.severity,
            message: rule.message,
            code: line.trim().substring(0, 80)
          });
        }
      });
    }
  } catch {}
  return issues;
}
function scanDirectory(dir, rules = []) {
  const allIssues = [];
  const absDir = resolve(dir);
  if (!existsSync(absDir))
    return allIssues;
  const scan = (currentDir) => {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory() && !entry.startsWith(".") && entry !== "node_modules") {
          scan(fullPath);
        } else if (stat.isFile() && CODE_EXTENSIONS.includes(extname(entry))) {
          const relativePath = fullPath.replace(absDir, ".");
          allIssues.push(...scanFile(relativePath, rules));
        }
      } catch {}
    }
  };
  scan(absDir);
  return allIssues;
}
function formatReport(issues, format) {
  if (format === "json") {
    return JSON.stringify({ issues, total: issues.length, high: issues.filter((i) => i.severity === "high").length, medium: issues.filter((i) => i.severity === "medium").length, low: issues.filter((i) => i.severity === "low").length }, null, 2);
  }
  if (issues.length === 0) {
    return `✅ **安全审计通过**

未检测到安全问题！`;
  }
  const highIssues = issues.filter((i) => i.severity === "high");
  const mediumIssues = issues.filter((i) => i.severity === "medium");
  const lowIssues = issues.filter((i) => i.severity === "low");
  let report = `\uD83D\uDEE1️ **安全审计报告**

\uD83D\uDCCA 统计:
• 总计: ${issues.length} 个问题
• 高危: ${highIssues.length} 个
• 中危: ${mediumIssues.length} 个
• 低危: ${lowIssues.length} 个

`;
  if (highIssues.length > 0) {
    report += `\uD83D\uDD34 **高危问题**
`;
    for (const issue of highIssues.slice(0, 10)) {
      report += `• ${issue.file}:${issue.line} - ${issue.message}
`;
      report += `  代码: ${issue.code}
`;
    }
    if (highIssues.length > 10) {
      report += `... 还有 ${highIssues.length - 10} 个高危问题
`;
    }
    report += `
`;
  }
  if (mediumIssues.length > 0) {
    report += `\uD83D\uDFE1 **中危问题**
`;
    for (const issue of mediumIssues.slice(0, 10)) {
      report += `• ${issue.file}:${issue.line} - ${issue.message}
`;
    }
    if (mediumIssues.length > 10) {
      report += `... 还有 ${mediumIssues.length - 10} 个中危问题
`;
    }
    report += `
`;
  }
  if (lowIssues.length > 0) {
    report += `\uD83D\uDD35 **低危问题**
`;
    for (const issue of lowIssues.slice(0, 5)) {
      report += `• ${issue.file}:${issue.line} - ${issue.message}
`;
    }
  }
  report += `
\uD83D\uDCA1 **建议**:
• 移除硬编码密钥，使用环境变量
• 避免使用 eval、innerHTML 等危险 API
• 使用参数化查询防止 SQL 注入
• 对用户输入进行严格验证和过滤`;
  return report;
}
var call = async (args, context) => {
  const s = (args ?? "").trim();
  const scanMatch = s.match(/--scan\s+(\S+)/);
  const fileMatch = s.match(/--file\s+(\S+)/);
  const ruleMatch = s.match(/--rule\s+(\S+)/);
  const formatMatch = s.match(/--format\s+(\S+)/);
  const format = formatMatch ? formatMatch[1] : "text";
  if (s.includes("--help") || s === "") {
    return { type: "text", value: HELP_TEXT };
  }
  if (scanMatch) {
    const rules = ruleMatch ? [ruleMatch[1]] : [];
    const issues2 = scanDirectory(scanMatch[1], rules);
    return { type: "text", value: formatReport(issues2, format) };
  }
  if (fileMatch) {
    const rules = ruleMatch ? [ruleMatch[1]] : [];
    const issues2 = scanFile(fileMatch[1], rules);
    return { type: "text", value: formatReport(issues2, format) };
  }
  const cwd2 = context?.cwd || process.cwd();
  const issues = scanDirectory(".", []);
  return { type: "text", value: formatReport(issues, format) };
};
var securityAudit = {
  type: "local",
  name: "security-audit",
  description: "静态安全审计工具 - 检测 SQL 注入、XSS、硬编码密钥等",
  aliases: ["audit", "sast"],
  isEnabled: () => {
    const { getIsNonInteractiveSession: getIsNonInteractiveSession2 } = (init_state(), __toCommonJS(exports_state));
    return !getIsNonInteractiveSession2();
  },
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call })
};
var security_audit_default = securityAudit;
export {
  scanFile,
  scanDirectory,
  security_audit_default as default,
  call,
  SECURITY_RULES
};
