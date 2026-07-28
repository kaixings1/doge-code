import { feature } from 'bun:bundle';
import { randomBytes } from 'crypto';
import { unwatchFile, watchFile } from 'fs';
import { memoize } from '../vendor/lodash.js';
import { pickBy } from '../vendor/lodash.js';
import { basename, dirname, join, resolve } from 'path';
import { getOriginalCwd, getSessionTrustAccepted } from '../bootstrap/state.js';
import { getAutoMemEntrypoint } from '../memdir/paths.js';
import { logEvent } from '../services/analytics/index.js';
import { getCwd } from '../utils/cwd.js';
import { registerCleanup } from './cleanupRegistry.js';
import { logForDebugging } from './debug.js';
import { logForDiagnosticsNoPII } from './diagLogs.js';
import { getGlobalClaudeFile } from './env.js';
import { getClaudeConfigHomeDir, isEnvTruthy } from './envUtils.js';
import { ConfigParseError, getErrnoCode } from './errors.js';
import { writeFileSyncAndFlush_DEPRECATED } from './file.js';
import { getFsImplementation } from './fsOperations.js';
import { findCanonicalGitRoot } from './git.js';
import { safeParseJSON } from './json.js';
import { stripBOM } from './jsonRead.js';
import * as lockfile from './lockfile.js';
import { logError } from './log.js';
import { normalizePathForConfigKey } from './path.js';
import { getEssentialTrafficOnlyReason } from './privacyLevel.js';
import { getManagedFilePath } from './settings/managedPath.js';
const teamMemPaths = feature('TEAMMEM')
    ? require('../memdir/teamMemPaths.js')
    : null;
const ccrAutoConnect = feature('CCR_AUTO_CONNECT')
    ? require('../bridge/bridgeEnabled.js')
    : null;
import { jsonParse, jsonStringify } from './slowOperations.js';
// 重入防护：防止配置文件损坏时发生 getConfig → logEvent → getGlobalConfig → getConfig
// 无限递归。logEvent 的采样检查从全局配置中读取 GrowthBook 特性，这又会调用 getConfig。
let insideGetConfig = false;
const DEFAULT_PROJECT_CONFIG = {
    allowedTools: [],
    mcpContextUris: [],
    mcpServers: {},
    enabledMcpjsonServers: [],
    disabledMcpjsonServers: [],
    hasTrustDialogAccepted: false,
    projectOnboardingSeenCount: 0,
    hasClaudeMdExternalIncludesApproved: false,
    hasClaudeMdExternalIncludesWarningShown: false,
};
export { EDITOR_MODES, NOTIFICATION_CHANNELS, } from './configConstants.js';
/**
 * 用于创建全新默认 GlobalConfig 的工厂函数。替代深度克隆共享常量——
 * 嵌套容器（数组、记录）均为空，因此工厂函数以零克隆成本提供新引用。
 * a factory gives fresh refs at zero clone cost.
 */
function createDefaultGlobalConfig() {
    return {
        customApiEndpoint: {
            baseURL: undefined,
            apiKey: undefined,
            model: undefined,
            savedModels: [],
        },
        numStartups: 0,
        installMethod: undefined,
        autoUpdates: undefined,
        theme: 'dark',
        preferredNotifChannel: 'auto',
        verbose: false,
        editorMode: 'normal',
        autoCompactEnabled: true,
        showTurnDuration: true,
        hasSeenTasksHint: false,
        hasUsedStash: false,
        hasUsedBackgroundTask: false,
        queuedCommandUpHintCount: 0,
        diffTool: 'auto',
        customApiKeyResponses: {
            approved: [],
            rejected: [],
        },
        env: {},
        tipsHistory: {},
        memoryUsageCount: 0,
        promptQueueUseCount: 0,
        btwUseCount: 0,
        todoFeatureEnabled: true,
        showExpandedTodos: false,
        messageIdleNotifThresholdMs: 60000,
        autoScrollEnabled: true,
        autoConnectIde: false,
        autoInstallIdeExtension: true,
        fileCheckpointingEnabled: true,
        terminalProgressBarEnabled: true,
        cachedStatsigGates: {},
        cachedDynamicConfigs: {},
        cachedGrowthBookFeatures: {},
        respectGitignore: true,
        copyFullResponse: false,
        maxListItems: 40,
    };
}
export const DEFAULT_GLOBAL_CONFIG = createDefaultGlobalConfig();
export const GLOBAL_CONFIG_KEYS = [
    'customApiEndpoint',
    'apiKeyHelper',
    'installMethod',
    'autoUpdates',
    'autoUpdatesProtectedForNative',
    'theme',
    'verbose',
    'preferredNotifChannel',
    'shiftEnterKeyBindingInstalled',
    'editorMode',
    'hasUsedBackslashReturn',
    'autoCompactEnabled',
    'showTurnDuration',
    'diffTool',
    'env',
    'tipsHistory',
    'todoFeatureEnabled',
    'showExpandedTodos',
    'messageIdleNotifThresholdMs',
    'autoConnectIde',
    'autoInstallIdeExtension',
    'fileCheckpointingEnabled',
    'terminalProgressBarEnabled',
    'showStatusInTerminalTab',
    'taskCompleteNotifEnabled',
    'inputNeededNotifEnabled',
    'agentPushNotifEnabled',
    'respectGitignore',
    'claudeInChromeDefaultEnabled',
    'hasCompletedClaudeInChromeOnboarding',
    'lspRecommendationDisabled',
    'lspRecommendationNeverPlugins',
    'lspRecommendationIgnoredCount',
    'copyFullResponse',
    'copyOnSelect',
    'permissionExplainerEnabled',
    'prStatusFooterEnabled',
    'remoteControlAtStartup',
    'remoteDialogSeen',
];
export function isGlobalConfigKey(key) {
    return GLOBAL_CONFIG_KEYS.includes(key);
}
export const PROJECT_CONFIG_KEYS = [
    'allowedTools',
    'hasTrustDialogAccepted',
    'hasCompletedProjectOnboarding',
];
/**
 * 检查用户是否已接受当前工作目录的信任对话框。
 *
 * 此函数遍历父目录以检查父目录是否有批准。
 * 接受对某个目录的信任即意味着对其子目录的信任。
 *
 * @returns 信任对话框是否已被接受（即"不应再显示"）
 */
let _trustAccepted = false;
export function resetTrustDialogAcceptedCacheForTesting() {
    _trustAccepted = false;
}
export function checkHasTrustDialogAccepted() {
    // 信任在会话期间仅从 false→true 转换（从不反向），
    // 因此一旦为 true 即可锁定。false 不会被缓存——它在每次调用时
    // 重新检查，以便在会话中间能感知到信任对话框的接受。
    // （lodash memoize 不适用，因为它也会缓存 false。）
    return (_trustAccepted ||= computeTrustDialogAccepted());
}
function computeTrustDialogAccepted() {
    // 检查会话级信任（针对信任不持久化的主目录场景）
    // 从主目录运行时，信任对话框会显示但接受仅存储在
    // 内存中。这允许钩子和其他功能在会话期间正常工作。
    if (getSessionTrustAccepted()) {
        return true;
    }
    const config = getGlobalConfig();
    // 始终检查信任保存的位置（git 根目录或原始 cwd）
    // 这是 saveCurrentProjectConfig 持久化信任的主要位置
    const projectPath = getProjectPathForConfig();
    const projectConfig = config.projects?.[projectPath];
    if (projectConfig?.hasTrustDialogAccepted) {
        return true;
    }
    // 从当前工作目录及其父目录开始检查
    // 规范化路径以获得一致的 JSON 键查找
    let currentPath = normalizePathForConfigKey(getCwd());
    // 遍历所有父目录
    while (true) {
        const pathConfig = config.projects?.[currentPath];
        if (pathConfig?.hasTrustDialogAccepted) {
            return true;
        }
        const parentPath = normalizePathForConfigKey(resolve(currentPath, '..'));
        // 如果到达根目录则停止（当父目录与当前目录相同时）
        if (parentPath === currentPath) {
            break;
        }
        currentPath = parentPath;
    }
    return false;
}
/**
 * 检查任意目录（非会话 cwd）的信任状态。
 * 从 `dir` 向上遍历，如果有任何祖先目录持久化了信任，则返回 true。
 * 与 checkHasTrustDialogAccepted 不同，此函数不会查询会话信任或
 * 缓存的项目路径——在目标目录与 cwd 不同时使用（例如
 * /assistant 安装到用户输入的路径时）。
 */
export function isPathTrusted(dir) {
    const config = getGlobalConfig();
    let currentPath = normalizePathForConfigKey(resolve(dir));
    while (true) {
        if (config.projects?.[currentPath]?.hasTrustDialogAccepted)
            return true;
        const parentPath = normalizePathForConfigKey(resolve(currentPath, '..'));
        if (parentPath === currentPath)
            return false;
        currentPath = parentPath;
    }
}
// 我们不得不将测试代码放在这里，因为 Jest 不支持模拟 ES 模块 :O
const TEST_GLOBAL_CONFIG_FOR_TESTING = {
    ...DEFAULT_GLOBAL_CONFIG,
    autoUpdates: false,
};
const TEST_PROJECT_CONFIG_FOR_TESTING = {
    ...DEFAULT_PROJECT_CONFIG,
};
export function isProjectConfigKey(key) {
    return PROJECT_CONFIG_KEYS.includes(key);
}
/**
 * 检测写入 `fresh` 是否会丢失内存缓存中仍存在的认证/入门状态。
 * 当 `getConfig` 遇到写入中途损坏或截断的文件（来自另一个进程或
 * 非原子回退）并返回 DEFAULT_GLOBAL_CONFIG 时会发生这种情况。
 * 将默认值写回会导致永久丢失认证。参见 GH #3117。
 */
function wouldLoseAuthState(fresh) {
    const cached = globalConfigCache.config;
    if (!cached)
        return false;
    const lostOauth = cached.oauthAccount !== undefined && fresh.oauthAccount === undefined;
    const lostOnboarding = cached.hasCompletedOnboarding === true &&
        fresh.hasCompletedOnboarding !== true;
    return lostOauth || lostOnboarding;
}
export function saveGlobalConfig(updater) {
    if (process.env.NODE_ENV === 'test') {
        const config = updater(TEST_GLOBAL_CONFIG_FOR_TESTING);
        // 如果没有变更则跳过（返回相同引用）
        if (config === TEST_GLOBAL_CONFIG_FOR_TESTING) {
            return;
        }
        Object.assign(TEST_GLOBAL_CONFIG_FOR_TESTING, config);
        return;
    }
    let written = null;
    try {
        const didWrite = saveConfigWithLock(getGlobalClaudeFile(), createDefaultGlobalConfig, current => {
            const config = updater(current);
            // 如果没有变更则跳过（返回相同引用）
            if (config === current) {
                return current;
            }
            written = {
                ...config,
                projects: removeProjectHistory(current.projects),
            };
            return written;
        });
        // 仅在实际写入时穿透缓存。如果认证丢失保护
        // 触发（或更新器未作更改），文件未被修改且
        // 缓存仍然有效——触碰它则会破坏保护机制。
        if (didWrite && written) {
            writeThroughGlobalConfigCache(written);
        }
    }
    catch (error) {
        logForDebugging(`Failed to save config with lock: ${error}`, {
            level: 'error',
        });
        // 出错时回退到非锁定版本。此回退存在竞态
        // 窗口：如果另一个进程正在写入中（或文件被截断），
        // getConfig 返回默认值。拒绝将默认值写入良好的缓存
        // 配置，以避免擦除认证。参见 GH #3117。
        const currentConfig = getConfig(getGlobalClaudeFile(), createDefaultGlobalConfig);
        if (wouldLoseAuthState(currentConfig)) {
            logForDebugging('saveGlobalConfig fallback: re-read config is missing auth that cache has; refusing to write. See GH #3117.', { level: 'error' });
            logEvent('tengu_config_auth_loss_prevented', {});
            return;
        }
        const config = updater(currentConfig);
        // 如果没有变更则跳过（返回相同引用）
        if (config === currentConfig) {
            return;
        }
        written = {
            ...config,
            projects: removeProjectHistory(currentConfig.projects),
        };
        saveConfig(getGlobalClaudeFile(), written, DEFAULT_GLOBAL_CONFIG);
        writeThroughGlobalConfigCache(written);
    }
}
// 全局配置缓存
let globalConfigCache = {
    config: null,
    mtime: 0,
};
// 配置文件操作追踪（遥测）
let lastReadFileStats = null;
let configCacheHits = 0;
let configCacheMisses = 0;
// 全局配置文件实际磁盘写入的会话总量计数。
// 对仅 ant 的开发诊断可见（参见 inc-4552），以便在异常写入
// 速率损坏 ~/.claude.json 之前，在 UI 中暴露出来。
let globalConfigWriteCount = 0;
export function getGlobalConfigWriteCount() {
    return globalConfigWriteCount;
}
export const CONFIG_WRITE_DISPLAY_THRESHOLD = 20;
function reportConfigCacheStats() {
    const total = configCacheHits + configCacheMisses;
    if (total > 0) {
        logEvent('tengu_config_cache_stats', {
            cache_hits: configCacheHits,
            cache_misses: configCacheMisses,
            hit_rate: configCacheHits / total,
        });
    }
    configCacheHits = 0;
    configCacheMisses = 0;
}
// 注册清理函数，在会话结束时报告缓存统计
// eslint-disable-next-line custom-rules/no-top-level-side-effects
registerCleanup(async () => {
    reportConfigCacheStats();
});
/**
 * Migrates old autoUpdaterStatus to new installMethod and autoUpdates fields
 * @internal
 */
function migrateConfigFields(config) {
    // 已迁移
    if (config.installMethod !== undefined) {
        return config;
    }
    // autoUpdaterStatus is removed from the type but may exist in old configs
    const legacy = config;
    // Determine install method and auto-update preference from old field
    let installMethod = 'unknown';
    let autoUpdates = config.autoUpdates ?? true; // Default to enabled unless explicitly disabled
    switch (legacy.autoUpdaterStatus) {
        case 'migrated':
            installMethod = 'local';
            break;
        case 'installed':
            installMethod = 'native';
            break;
        case 'disabled':
            // 禁用时，我们不知道安装方法
            autoUpdates = false;
            break;
        case 'enabled':
        case 'no_permissions':
        case 'not_configured':
            // 这些状态暗示了全局安装
            installMethod = 'global';
            break;
        case undefined:
            // 无旧状态，保留默认值
            break;
    }
    return {
        ...config,
        installMethod,
        autoUpdates,
    };
}
/**
 * Removes history field from projects (migrated to history.jsonl)
 * @internal
 */
function removeProjectHistory(projects) {
    if (!projects) {
        return projects;
    }
    const cleanedProjects = {};
    let needsCleaning = false;
    for (const [path, projectConfig] of Object.entries(projects)) {
        // history 已从类型中移除，但可能存在于旧配置中
        const legacy = projectConfig;
        if (legacy.history !== undefined) {
            needsCleaning = true;
            const { history, ...cleanedConfig } = legacy;
            cleanedProjects[path] = cleanedConfig;
        }
        else {
            cleanedProjects[path] = projectConfig;
        }
    }
    return needsCleaning ? cleanedProjects : projects;
}
// fs.watchFile 轮询间隔，用于检测其他实例的写入（毫秒）
const CONFIG_FRESHNESS_POLL_MS = 1000;
let freshnessWatcherStarted = false;
// fs.watchFile 在 libuv 线程池上轮询 stat，仅在 mtime
// 发生变化时调用我们——卡住的 stat 永远不会阻塞主线程。
function startGlobalConfigFreshnessWatcher() {
    if (freshnessWatcherStarted || process.env.NODE_ENV === 'test')
        return;
    freshnessWatcherStarted = true;
    const file = getGlobalClaudeFile();
    watchFile(file, { interval: CONFIG_FRESHNESS_POLL_MS, persistent: false }, curr => {
        // 我们自己的写入也会触发此回调——写入穿透的 Date.now()
        // 超出量使得 cache.mtime > 文件 mtime，因此我们跳过重读。
        // 当文件不存在时（初始回调或删除），Bun/Node 也会以 curr.mtimeMs=0 触发
        // ——<= 比较也能处理这种情况。
        if (curr.mtimeMs <= globalConfigCache.mtime)
            return;
        void getFsImplementation()
            .readFile(file, { encoding: 'utf-8' })
            .then(content => {
            // 写入穿透可能在我们读取时已经更新了缓存；
            // 不要回退到 watchFile 统计的过期快照。
            if (curr.mtimeMs <= globalConfigCache.mtime)
                return;
            const parsed = safeParseJSON(stripBOM(content));
            if (parsed === null || typeof parsed !== 'object')
                return;
            globalConfigCache = {
                config: migrateConfigFields({
                    ...createDefaultGlobalConfig(),
                    ...parsed,
                }),
                mtime: curr.mtimeMs,
            };
            lastReadFileStats = { mtime: curr.mtimeMs, size: curr.size };
        })
            .catch(() => { });
    });
    registerCleanup(async () => {
        unwatchFile(file);
        freshnessWatcherStarted = false;
    });
}
// 写入穿透：我们刚写入的就是新配置。cache.mtime 超出
// 文件的真实 mtime（Date.now() 在写入后记录），因此
// 新鲜度监视器会在下一次 tick 时跳过重读我们自己的写入。
function writeThroughGlobalConfigCache(config) {
    globalConfigCache = { config, mtime: Date.now() };
    lastReadFileStats = null;
}
export function getGlobalConfig() {
    if (process.env.NODE_ENV === 'test') {
        return TEST_GLOBAL_CONFIG_FOR_TESTING;
    }
    // 快速路径：纯内存读取。启动后总能命中——我们自己的
    // 写入走写入穿透，其他实例的写入由后台
    // 新鲜度监视器捕获（从不阻塞此路径）。
    if (globalConfigCache.config) {
        configCacheHits++;
        return globalConfigCache.config;
    }
    // 慢速路径：启动加载。同步 I/O 在此可接受，因为它在任何 UI
    // 渲染之前只运行一次。先 stat 再读取，以便任何竞态
    // 能自我修正（旧 mtime + 新内容 → 监视器在下一个 tick 重读）。
    configCacheMisses++;
    try {
        let stats = null;
        try {
            stats = getFsImplementation().statSync(getGlobalClaudeFile());
        }
        catch {
            // 文件不存在
        }
        const config = migrateConfigFields(getConfig(getGlobalClaudeFile(), createDefaultGlobalConfig));
        globalConfigCache = {
            config,
            mtime: stats?.mtimeMs ?? Date.now(),
        };
        lastReadFileStats = stats
            ? { mtime: stats.mtimeMs, size: stats.size }
            : null;
        startGlobalConfigFreshnessWatcher();
        return config;
    }
    catch {
        // 如果出现问题，回退到无缓存行为
        return migrateConfigFields(getConfig(getGlobalClaudeFile(), createDefaultGlobalConfig));
    }
}
/**
 * 返回 remoteControlAtStartup 的有效值。优先级：
 *   1. 用户的显式配置值（始终优先——尊重选择退出）
 *   2. CCR 自动连接默认值（仅 ant 构建，受 GrowthBook 控制）
 *   3. false（远程控制必须显式选择加入）
 */
export function getRemoteControlAtStartup() {
    const explicit = getGlobalConfig().remoteControlAtStartup;
    if (explicit !== undefined)
        return explicit;
    if (feature('CCR_AUTO_CONNECT')) {
        if (ccrAutoConnect?.getCcrAutoConnectDefault())
            return true;
    }
    return false;
}
export function getCustomApiKeyStatus(truncatedApiKey) {
    const config = getGlobalConfig();
    if (config.customApiKeyResponses?.approved?.includes(truncatedApiKey)) {
        return 'approved';
    }
    if (config.customApiKeyResponses?.rejected?.includes(truncatedApiKey)) {
        return 'rejected';
    }
    return 'new';
}
function saveConfig(file, config, defaultConfig) {
    // 确保写入配置文件前目录存在
    const dir = dirname(file);
    const fs = getFsImplementation();
    // mkdirSync 在 FsOperations 实现中已经是递归的
    fs.mkdirSync(dir);
    // 过滤掉与默认值匹配的所有值
    const filteredConfig = pickBy(config, (value, key) => jsonStringify(value) !== jsonStringify(defaultConfig[key]));
    // 以安全权限写入配置文件 - mode 仅适用于新文件
    writeFileSyncAndFlush_DEPRECATED(file, jsonStringify(filteredConfig, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
    });
    if (file === getGlobalClaudeFile()) {
        globalConfigWriteCount++;
    }
}
/**
 * 如果执行了写入则返回 true；如果写入被跳过则返回 false
 * （无变更，或认证丢失保护触发）。调用者用此返回值来决定
 * 是否要使缓存失效——在跳过的写入后使缓存失效会破坏
 * 认证丢失保护所依赖的良好缓存状态。
 */
function saveConfigWithLock(file, createDefault, mergeFn) {
    const defaultConfig = createDefault();
    const dir = dirname(file);
    const fs = getFsImplementation();
    // 确保目录存在（mkdirSync 在 FsOperations 中已经是递归的）
    fs.mkdirSync(dir);
    let release;
    try {
        const lockFilePath = `${file}.lock`;
        const startTime = Date.now();
        release = lockfile.lockSync(file, {
            lockfilePath: lockFilePath,
            onCompromised: err => {
                // 默认的 onCompromised 从 setTimeout 回调中抛出异常，
                // 这会导致未处理的异常。改为记录日志——锁被
                // 窃取（例如在 10 秒事件循环暂停后）是可恢复的。
                logForDebugging(`配置锁被破坏: ${err}`, { level: 'error' });
            },
        });
        const lockTime = Date.now() - startTime;
        if (lockTime > 100) {
            logForDebugging('获取锁的时间超出预期 - 可能正在运行另一个 Claude 实例');
            logEvent('tengu_config_lock_contention', {
                lock_time_ms: lockTime,
            });
        }
        // 检查过时写入——自上次读取后文件已更改
        // 仅检查全局配置文件，因为 lastReadFileStats 跟踪的是该特定文件
        if (lastReadFileStats && file === getGlobalClaudeFile()) {
            try {
                const currentStats = fs.statSync(file);
                if (currentStats.mtimeMs !== lastReadFileStats.mtime ||
                    currentStats.size !== lastReadFileStats.size) {
                    logEvent('tengu_config_stale_write', {
                        read_mtime: lastReadFileStats.mtime,
                        write_mtime: currentStats.mtimeMs,
                        read_size: lastReadFileStats.size,
                        write_size: currentStats.size,
                    });
                }
            }
            catch (e) {
                const code = getErrnoCode(e);
                if (code !== 'ENOENT') {
                    throw e;
                }
                // 文件尚不存在，无需过时检查
            }
        }
        // 重新读取当前配置以获取最新状态。如果文件
        // 暂时损坏（并发写入、写入过程中被杀死），这将
        // 返回默认值——我们不能将默认值写回良好的配置。
        const currentConfig = getConfig(file, createDefault);
        if (file === getGlobalClaudeFile() && wouldLoseAuthState(currentConfig)) {
            logForDebugging('saveConfigWithLock: 重新读取的配置缺少缓存中的认证；拒绝写入以避免清空 ~/.claude.json。参见 GH #3117。', { level: 'error' });
            logEvent('tengu_config_auth_loss_prevented', {});
            return false;
        }
        // 应用合并函数以获取更新后的配置
        const mergedConfig = mergeFn(currentConfig);
        // 如果没有变更则跳过写入（返回相同引用）
        if (mergedConfig === currentConfig) {
            return false;
        }
        // 过滤掉与默认值匹配的所有值
        const filteredConfig = pickBy(mergedConfig, (value, key) => jsonStringify(value) !== jsonStringify(defaultConfig[key]));
        // 在写入前创建现有配置的时间戳备份
        // 我们保留多个备份，以防止重置/损坏的配置
        // 覆盖好的备份。备份存储在 ~/.claude/backups/ 中，
        // 以保持主目录整洁。
        try {
            const fileBase = basename(file);
            const backupDir = getConfigBackupDir();
            // 确保备份目录存在
            try {
                fs.mkdirSync(backupDir);
            }
            catch (mkdirErr) {
                const mkdirCode = getErrnoCode(mkdirErr);
                if (mkdirCode !== 'EEXIST') {
                    throw mkdirErr;
                }
            }
            // 首先检查现有备份——如果近期备份已存在则跳过创建新的。
            // 在启动时，许多 saveGlobalConfig 调用在几毫秒内接连触发；
            // 没有此检查，每次调用都会创建一个新的备份文件，在磁盘上累积。
            const MIN_BACKUP_INTERVAL_MS = 60_000;
            const existingBackups = fs
                .readdirStringSync(backupDir)
                .filter(f => f.startsWith(`${fileBase}.backup.`))
                .sort()
                .reverse(); // 最新的在前（时间戳按字典序排序）
            const mostRecentBackup = existingBackups[0];
            const mostRecentTimestamp = mostRecentBackup
                ? Number(mostRecentBackup.split('.backup.').pop())
                : 0;
            const shouldCreateBackup = Number.isNaN(mostRecentTimestamp) ||
                Date.now() - mostRecentTimestamp >= MIN_BACKUP_INTERVAL_MS;
            if (shouldCreateBackup) {
                const backupPath = join(backupDir, `${fileBase}.backup.${Date.now()}`);
                fs.copyFileSync(file, backupPath);
            }
            // 清理旧备份，仅保留最近 5 个
            const MAX_BACKUPS = 5;
            // 如果刚创建了一个备份则重新读取列表；否则重用现有列表
            const backupsForCleanup = shouldCreateBackup
                ? fs
                    .readdirStringSync(backupDir)
                    .filter(f => f.startsWith(`${fileBase}.backup.`))
                    .sort()
                    .reverse()
                : existingBackups;
            for (const oldBackup of backupsForCleanup.slice(MAX_BACKUPS)) {
                try {
                    fs.unlinkSync(join(backupDir, oldBackup));
                }
                catch {
                    // 忽略清理错误
                }
            }
        }
        catch (e) {
            const code = getErrnoCode(e);
            if (code !== 'ENOENT') {
                logForDebugging(`配置备份失败: ${e}`, {
                    level: 'error',
                });
            }
            // 没有文件可备份或备份失败，继续写入
        }
        // 以安全权限写入配置文件 - mode 仅适用于新文件
        writeFileSyncAndFlush_DEPRECATED(file, jsonStringify(filteredConfig, null, 2), {
            encoding: 'utf-8',
            mode: 0o600,
        });
        if (file === getGlobalClaudeFile()) {
            globalConfigWriteCount++;
        }
        return true;
    }
    finally {
        if (release) {
            release();
        }
    }
}
// 标记以跟踪是否允许读取配置
let configReadingAllowed = false;
export function enableConfigs() {
    if (configReadingAllowed) {
        // 确保此操作是幂等的
        return;
    }
    const startTime = Date.now();
    logForDiagnosticsNoPII('info', 'enable_configs_started');
    // 在此标记设置前对配置的任何读取都会显示控制台警告，
    // 以防止我们在模块初始化期间添加配置读取
    configReadingAllowed = true;
    // 我们只检查全局配置，因为目前所有配置共享一个文件
    getConfig(getGlobalClaudeFile(), createDefaultGlobalConfig, true /* throw on invalid */);
    logForDiagnosticsNoPII('info', 'enable_configs_completed', {
        duration_ms: Date.now() - startTime,
    });
}
/**
 * 返回配置文件备份存储的目录。
 * 使用 ~/.claude/backups/ 以保持主目录整洁。
 */
function getConfigBackupDir() {
    return join(getClaudeConfigHomeDir(), 'backups');
}
/**
 * 查找给定配置文件的最新备份文件。
 * 首先检查 ~/.claude/backups/，然后回退到旧位置
 * （配置文件旁边）以保持向后兼容。
 * 返回最新备份的完整路径，如果不存在则返回 null。
 */
function findMostRecentBackup(file) {
    const fs = getFsImplementation();
    const fileBase = basename(file);
    const backupDir = getConfigBackupDir();
    // 首先检查新的备份目录
    try {
        const backups = fs
            .readdirStringSync(backupDir)
            .filter(f => f.startsWith(`${fileBase}.backup.`))
            .sort();
        const mostRecent = backups.at(-1); // 时间戳按字典序排序
        if (mostRecent) {
            return join(backupDir, mostRecent);
        }
    }
    catch {
        // 备份目录尚不存在
    }
    // 回退到旧位置（配置文件旁边）
    const fileDir = dirname(file);
    try {
        const backups = fs
            .readdirStringSync(fileDir)
            .filter(f => f.startsWith(`${fileBase}.backup.`))
            .sort();
        const mostRecent = backups.at(-1); // 时间戳按字典序排序
        if (mostRecent) {
            return join(fileDir, mostRecent);
        }
        // 检查旧版备份文件（无时间戳）
        const legacyBackup = `${file}.backup`;
        try {
            fs.statSync(legacyBackup);
            return legacyBackup;
        }
        catch {
            // 旧版备份不存在
        }
    }
    catch {
        // 忽略读取目录时的错误
    }
    return null;
}
function getConfig(file, createDefault, throwOnInvalid) {
    // 如果在允许之前访问配置，则记录警告
    if (!configReadingAllowed && process.env.NODE_ENV !== 'test') {
        throw new Error('Config accessed before allowed.');
    }
    const fs = getFsImplementation();
    try {
        const fileContent = fs.readFileSync(file, {
            encoding: 'utf-8',
        });
        try {
            // 在解析前去除 BOM - PowerShell 5.x 会向 UTF-8 文件添加 BOM
            const parsedConfig = jsonParse(stripBOM(fileContent));
            return {
                ...createDefault(),
                ...parsedConfig,
            };
        }
        catch (error) {
            // 抛出包含文件路径和默认配置的 ConfigParseError
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new ConfigParseError(errorMessage, file, createDefault());
        }
    }
    catch (error) {
        // 处理文件未找到 - 检查备份并返回默认值
        const errCode = getErrnoCode(error);
        if (errCode === 'ENOENT') {
            const backupPath = findMostRecentBackup(file);
            if (backupPath) {
                process.stderr.write(`\n未能在以下位置找到 Claude 配置文件：${file}\n` +
                    `存在备份文件：${backupPath}\n` +
                    `你可以手动运行以下命令来恢复：cp "${backupPath}" "${file}"\n\n`);
            }
            return createDefault();
        }
        // 如果 throwOnInvalid 为 true，则重新抛出 ConfigParseError
        if (error instanceof ConfigParseError && throwOnInvalid) {
            throw error;
        }
        // 记录配置解析错误，以便用户了解发生了什么
        if (error instanceof ConfigParseError) {
            logForDebugging(`配置文件损坏，正在重置为默认值: ${error.message}`, { level: 'error' });
            // 保护：logEvent → shouldSampleEvent → getGlobalConfig → getConfig
            // 在配置文件损坏时会导致无限递归，因为
            // 采样检查从全局配置中读取 GrowthBook 特性。
            // 仅在最外层调用时记录分析事件。
            if (!insideGetConfig) {
                insideGetConfig = true;
                try {
                    // 记录错误以进行监控
                    logError(error);
                    // 记录配置损坏的分析事件
                    let hasBackup = false;
                    try {
                        fs.statSync(`${file}.backup`);
                        hasBackup = true;
                    }
                    catch {
                        // 无备份
                    }
                    logEvent('tengu_config_parse_error', {
                        has_backup: hasBackup,
                    });
                }
                finally {
                    insideGetConfig = false;
                }
            }
            process.stderr.write(`\nClaude configuration file at ${file} is corrupted: ${error.message}\n`);
            // 尝试备份损坏的配置文件（仅当尚未备份时）
            const fileBase = basename(file);
            const corruptedBackupDir = getConfigBackupDir();
            // 确保备份目录存在
            try {
                fs.mkdirSync(corruptedBackupDir);
            }
            catch (mkdirErr) {
                const mkdirCode = getErrnoCode(mkdirErr);
                if (mkdirCode !== 'EEXIST') {
                    throw mkdirErr;
                }
            }
            const existingCorruptedBackups = fs
                .readdirStringSync(corruptedBackupDir)
                .filter(f => f.startsWith(`${fileBase}.corrupted.`));
            let corruptedBackupPath;
            let alreadyBackedUp = false;
            // 检查当前损坏内容是否与任何现有备份匹配
            const currentContent = fs.readFileSync(file, { encoding: 'utf-8' });
            for (const backup of existingCorruptedBackups) {
                try {
                    const backupContent = fs.readFileSync(join(corruptedBackupDir, backup), { encoding: 'utf-8' });
                    if (currentContent === backupContent) {
                        alreadyBackedUp = true;
                        break;
                    }
                }
                catch {
                    // 忽略备份的读取错误
                }
            }
            if (!alreadyBackedUp) {
                corruptedBackupPath = join(corruptedBackupDir, `${fileBase}.corrupted.${Date.now()}`);
                try {
                    fs.copyFileSync(file, corruptedBackupPath);
                    logForDebugging(`Corrupted config backed up to: ${corruptedBackupPath}`, {
                        level: 'error',
                    });
                }
                catch {
                    // 忽略备份错误
                }
            }
            // 通知用户有关配置损坏和可用备份的信息
            const backupPath = findMostRecentBackup(file);
            if (corruptedBackupPath) {
                process.stderr.write(`The corrupted file has been backed up to: ${corruptedBackupPath}\n`);
            }
            else if (alreadyBackedUp) {
                process.stderr.write(`The corrupted file has already been backed up.\n`);
            }
            if (backupPath) {
                process.stderr.write(`存在备份文件：${backupPath}\n` +
                    `你可以手动运行以下命令来恢复：cp "${backupPath}" "${file}"\n\n`);
            }
            else {
                process.stderr.write(`\n`);
            }
        }
        return createDefault();
    }
}
// 用于获取配置查找项目路径的记忆化函数
export const getProjectPathForConfig = memoize(() => {
    const originalCwd = getOriginalCwd();
    const gitRoot = findCanonicalGitRoot(originalCwd);
    if (gitRoot) {
        // 规范化以获得一致的 JSON 键（所有平台使用正斜杠）
        // 这确保 C:\Users\... 和 C:/Users/... 等路径映射到相同的键
        return normalizePathForConfigKey(gitRoot);
    }
    // 不在 git 仓库中
    return normalizePathForConfigKey(resolve(originalCwd));
});
export function getCurrentProjectConfig() {
    if (process.env.NODE_ENV === 'test') {
        return TEST_PROJECT_CONFIG_FOR_TESTING;
    }
    const absolutePath = getProjectPathForConfig();
    const config = getGlobalConfig();
    if (!config.projects) {
        return DEFAULT_PROJECT_CONFIG;
    }
    const projectConfig = config.projects[absolutePath] ?? DEFAULT_PROJECT_CONFIG;
    // 不确定这个字段怎么变成了字符串
    // TODO: 修复上游
    if (typeof projectConfig.allowedTools === 'string') {
        projectConfig.allowedTools =
            safeParseJSON(projectConfig.allowedTools) ?? [];
    }
    return projectConfig;
}
export function saveCurrentProjectConfig(updater) {
    if (process.env.NODE_ENV === 'test') {
        const config = updater(TEST_PROJECT_CONFIG_FOR_TESTING);
        // 如果没有变更则跳过（返回相同引用）
        if (config === TEST_PROJECT_CONFIG_FOR_TESTING) {
            return;
        }
        Object.assign(TEST_PROJECT_CONFIG_FOR_TESTING, config);
        return;
    }
    const absolutePath = getProjectPathForConfig();
    let written = null;
    try {
        const didWrite = saveConfigWithLock(getGlobalClaudeFile(), createDefaultGlobalConfig, current => {
            const currentProjectConfig = current.projects?.[absolutePath] ?? DEFAULT_PROJECT_CONFIG;
            const newProjectConfig = updater(currentProjectConfig);
            // 如果没有变更则跳过（返回相同引用）
            if (newProjectConfig === currentProjectConfig) {
                return current;
            }
            written = {
                ...current,
                projects: {
                    ...current.projects,
                    [absolutePath]: newProjectConfig,
                },
            };
            return written;
        });
        if (didWrite && written) {
            writeThroughGlobalConfigCache(written);
        }
    }
    catch (error) {
        logForDebugging(`Failed to save config with lock: ${error}`, {
            level: 'error',
        });
        // Same race window as saveGlobalConfig's fallback -- refuse to write
        // defaults over good cached config. See GH #3117.
        const config = getConfig(getGlobalClaudeFile(), createDefaultGlobalConfig);
        if (wouldLoseAuthState(config)) {
            logForDebugging('saveCurrentProjectConfig fallback: re-read config is missing auth that cache has; refusing to write. See GH #3117.', { level: 'error' });
            logEvent('tengu_config_auth_loss_prevented', {});
            return;
        }
        const currentProjectConfig = config.projects?.[absolutePath] ?? DEFAULT_PROJECT_CONFIG;
        const newProjectConfig = updater(currentProjectConfig);
        // Skip if no changes (same reference returned)
        if (newProjectConfig === currentProjectConfig) {
            return;
        }
        written = {
            ...config,
            projects: {
                ...config.projects,
                [absolutePath]: newProjectConfig,
            },
        };
        saveConfig(getGlobalClaudeFile(), written, DEFAULT_GLOBAL_CONFIG);
        writeThroughGlobalConfigCache(written);
    }
}
export function isAutoUpdaterDisabled() {
    return getAutoUpdaterDisabledReason() !== null;
}
/**
 * 如果插件自动更新应被跳过则返回 true。
 * 此函数检查自动更新器是否已禁用，并且 FORCE_AUTOUPDATE_PLUGINS
 * 环境变量未设置为 'true'。该环境变量允许在自动更新器被禁用时
 * 强制进行插件自动更新。
 */
export function shouldSkipPluginAutoupdate() {
    return (isAutoUpdaterDisabled() &&
        !isEnvTruthy(process.env.FORCE_AUTOUPDATE_PLUGINS));
}
export function formatAutoUpdaterDisabledReason(reason) {
    switch (reason.type) {
        case 'development':
            return '开发构建';
        case 'env':
            return `已设置 ${reason.envVar}`;
        case 'config':
            return '配置';
    }
}
export function getAutoUpdaterDisabledReason() {
    if (process.env.NODE_ENV === 'development') {
        return { type: 'development' };
    }
    if (isEnvTruthy(process.env.DISABLE_AUTOUPDATER)) {
        return { type: 'env', envVar: 'DISABLE_AUTOUPDATER' };
    }
    const essentialTrafficEnvVar = getEssentialTrafficOnlyReason();
    if (essentialTrafficEnvVar) {
        return { type: 'env', envVar: essentialTrafficEnvVar };
    }
    const config = getGlobalConfig();
    if (config.autoUpdates === false &&
        (config.installMethod !== 'native' ||
            config.autoUpdatesProtectedForNative !== true)) {
        return { type: 'config' };
    }
    return null;
}
export function getOrCreateUserID() {
    const config = getGlobalConfig();
    if (config.userID) {
        return config.userID;
    }
    const userID = randomBytes(32).toString('hex');
    saveGlobalConfig(current => ({ ...current, userID }));
    return userID;
}
export function recordFirstStartTime() {
    const config = getGlobalConfig();
    if (!config.firstStartTime) {
        const firstStartTime = new Date().toISOString();
        saveGlobalConfig(current => ({
            ...current,
            firstStartTime: current.firstStartTime ?? firstStartTime,
        }));
    }
}
export function getMemoryPath(memoryType) {
    const cwd = getOriginalCwd();
    switch (memoryType) {
        case 'User':
            return join(getClaudeConfigHomeDir(), 'CLAUDE.md');
        case 'Local':
            return join(cwd, 'CLAUDE.local.md');
        case 'Project':
            return join(cwd, 'CLAUDE.md');
        case 'Managed':
            return join(getManagedFilePath(), 'CLAUDE.md');
        case 'AutoMem':
            return getAutoMemEntrypoint();
    }
    // TeamMem 仅在 feature('TEAMMEM') 为 true 时才是有效的 MemoryType
    if (feature('TEAMMEM')) {
        return teamMemPaths.getTeamMemEntrypoint();
    }
    return ''; // 在 TeamMem 不在 MemoryType 中的外部构建中不可达
}
export function getManagedClaudeRulesDir() {
    return join(getManagedFilePath(), '.claude', 'rules');
}
export function getUserClaudeRulesDir() {
    return join(getClaudeConfigHomeDir(), 'rules');
}
// 仅用于测试的导出
export const _getConfigForTesting = getConfig;
export const _wouldLoseAuthStateForTesting = wouldLoseAuthState;
export function _setGlobalConfigCacheForTesting(config) {
    globalConfigCache.config = config;
    globalConfigCache.mtime = config ? Date.now() : 0;
}
//# sourceMappingURL=config.js.map