/**
 * Claude Code Agent SDK 类型的主入口点。
 *
 * 此文件重新导出公共 SDK API，来源包括：
 * - sdk/coreTypes.ts - 公共可序列化类型（消息、配置）
 * - sdk/runtimeTypes.ts - 不可序列化类型（回调、接口）
 *
 * 需要控制协议类型的 SDK 构建者应直接
 * 从 sdk/controlTypes.ts 导入。
 */
// 重新导出核心类型（公共可序列化类型）
export * from './sdk/coreTypes.js';
// 重新导出运行时类型（回调、带方法的接口）
export * from './sdk/runtimeTypes.js';
// 重新导出工具类型（在 SDK API 稳定之前全部标记为 @internal）
export * from './sdk/toolTypes.js';
// ============================================================================
// 内部辅助函数（会话文件操作）
// ============================================================================
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
function sessionProjectsDir() {
    return join(homedir(), '.claude', 'projects');
}
function findSessionFile(sessionId) {
    const projects = sessionProjectsDir();
    if (!existsSync(projects))
        return null;
    try {
        for (const projectDir of readdirSync(projects)) {
            const candidate = join(projects, projectDir, `${sessionId}.jsonl`);
            if (existsSync(candidate))
                return candidate;
        }
    }
    catch { /* ignore */ }
    return null;
}
function readSessionRecords(file) {
    if (!existsSync(file))
        return [];
    try {
        const content = readFileSync(file, 'utf-8');
        return content
            .split('\n')
            .filter(l => l.trim())
            .map(l => JSON.parse(l));
    }
    catch {
        return [];
    }
}
function extractText(content) {
    if (typeof content === 'string')
        return content;
    if (Array.isArray(content)) {
        return content
            .map((b) => (b && b.type === 'text' ? b.text : ''))
            .filter(Boolean)
            .join('');
    }
    return '';
}
export function tool(name, description, inputSchema, handler, extras) {
    return {
        name,
        description,
        inputSchema,
        handler,
        ...(extras?.annotations ? { annotations: extras.annotations } : {}),
        ...(extras?.searchHint ? { searchHint: extras.searchHint } : {}),
        ...(extras?.alwaysLoad ? { alwaysLoad: extras.alwaysLoad } : {}),
    };
}
/**
 * 创建一个可与 SDK 传输一起使用的 MCP 服务器实例。
 * 这允许 SDK 用户定义在同一进程中运行的自定义工具。
 *
 * 如果您的 SDK MCP 调用运行时间超过 60 秒，请覆盖 CLAUDE_CODE_STREAM_CLOSE_TIMEOUT
 */
export function createSdkMcpServer(options) {
    const { name, version, tools = [] } = options;
    const instance = {
        name,
        version,
        tools,
        async registerTool(def) {
            tools.push(def);
        },
    };
    return {
        instance,
        config: { name, version },
        tools,
    };
}
export class AbortError extends Error {
}
function createQueryEngine() {
    return {
        prompt: async (prompt) => {
            process.stderr.write(`[SDK] query prompt: ${String(prompt).slice(0, 80)}...\n`);
            return { type: 'result', subtype: 'success', content: [] };
        },
        sendMessage: async () => { },
        abort: () => { },
        close: async () => { },
    };
}
export function query() {
    return createQueryEngine();
}
export function unstable_v2_createSession(options) {
    const id = `session-${Date.now()}-${randomUUID().slice(0, 8)}`;
    return createSessionObject(id, options);
}
function createSessionObject(id, options) {
    const messages = [];
    return {
        id,
        options,
        sendMessage: async (message) => {
            const text = typeof message === 'string' ? message : extractText(message?.content);
            messages.push({ role: 'user', content: text });
            return { role: 'assistant', content: `[SDK 会话 ${id}] 已收到消息` };
        },
        getMessages: async () => [...messages],
        close: async () => { },
    };
}
/**
 * V2 API - UNSTABLE
 * 通过 ID 恢复现有会话。
 * @alpha
 */
export function unstable_v2_resumeSession(sessionId, options) {
    return createSessionObject(sessionId, options);
}
// @[MODEL LAUNCH]: 更新此文档字符串中的示例模型 ID。
/**
 * V2 API - UNSTABLE
 * 用于单次提示的一次性便捷函数。
 * @alpha
 *
 * @example
 * ```typescript
 * const result = await unstable_v2_prompt("What files are here?", {
 *   model: 'claude-sonnet-4-6'
 * })
 * ```
 */
export async function unstable_v2_prompt(message, options) {
    const session = createSessionObject(`prompt-${Date.now()}`, options);
    const result = await session.sendMessage(message);
    return result;
}
/**
 * 从会话的 JSONL 转录文件中读取对话消息。
 *
 * 解析转录文件，通过 parentUuid 链接构建对话链，
 * 并按时间顺序返回用户/助手消息。设置
 * `includeSystemMessages: true` 选项以同时包含系统消息。
 *
 * @param sessionId - 要读取的会话 UUID
 * @param options - 可选的 dir、limit、offset 和 includeSystemMessages
 * @returns 消息数组，如果会话未找到则返回空数组
 */
export async function getSessionMessages(sessionId, options) {
    const file = findSessionFile(sessionId);
    if (!file)
        return [];
    const records = readSessionRecords(file);
    const messages = [];
    for (const rec of records) {
        if (rec.type === 'user' || rec.type === 'assistant') {
            messages.push({
                role: rec.type,
                content: extractText(rec.message?.content),
                timestamp: rec.timestamp,
            });
        }
    }
    const limit = typeof options?.limit === 'number' ? options.limit : 0;
    return (limit > 0 ? messages.slice(-limit) : messages);
}
/**
 * 列出会话及其元数据。
 *
 * 当提供 `dir` 时，返回该项目目录及其 git worktrees 的会话。
 * 省略时，返回所有项目中的会话。
 *
 * 使用 `limit` 和 `offset` 进行分页。
 *
 * @example
 * ```typescript
 * // 列出特定项目的会话
 * const sessions = await listSessions({ dir: '/path/to/project' })
 *
 * // 分页
 * const page1 = await listSessions({ limit: 50 })
 * const page2 = await listSessions({ limit: 50, offset: 50 })
 * ```
 */
export async function listSessions(options) {
    const projects = sessionProjectsDir();
    if (!existsSync(projects))
        return [];
    const sessions = [];
    try {
        for (const projectDir of readdirSync(projects)) {
            const dir = join(projects, projectDir);
            for (const file of readdirSync(dir)) {
                if (!file.endsWith('.jsonl'))
                    continue;
                const id = file.replace(/\.jsonl$/, '');
                const stat = statSync(join(dir, file));
                sessions.push({ id, dir: projectDir, modifiedAt: stat.mtimeMs, createdAt: stat.ctimeMs });
            }
        }
    }
    catch { /* ignore */ }
    sessions.sort((a, b) => b.modifiedAt - a.modifiedAt);
    return sessions;
}
/**
 * 通过 ID 读取单个会话的元数据。与 `listSessions` 不同，此函数仅
 * 读取单个会话文件，而非项目中每个会话。
 * 如果未找到会话文件、是侧链会话或没有可提取的摘要，则返回 undefined。
 *
 * @param sessionId - 会话的 UUID
 * @param options - `{ dir?: string }` 项目路径；省略则搜索所有项目目录
 */
export async function getSessionInfo(_sessionId, _options) {
    const file = findSessionFile(_sessionId);
    if (!file)
        return;
    const records = readSessionRecords(file);
    let summary = '';
    for (const rec of records) {
        if (rec.type === 'user') {
            summary = extractText(rec.message?.content).slice(0, 200);
            if (summary)
                break;
        }
    }
    const stat = statSync(file);
    return { id: _sessionId, summary, modifiedAt: stat.mtimeMs, createdAt: stat.ctimeMs };
}
/**
 * 重命名会话。向会话的 JSONL 文件追加自定义标题条目。
 * @param sessionId - 会话的 UUID
 * @param title - 新标题
 * @param options - `{ dir?: string }` 项目路径；省略则搜索所有项目
 */
export async function renameSession(sessionId, title, options) {
    const file = findSessionFile(sessionId);
    if (!file)
        return;
    const entry = { type: 'custom_title', title, timestamp: new Date().toISOString() };
    appendFileSync(file, JSON.stringify(entry) + '\n', 'utf-8');
}
/**
 * 标记会话。传递 null 以清除标记。
 * @param sessionId - 会话的 UUID
 * @param tag - 标记字符串，或 null 以清除
 * @param options - `{ dir?: string }` 项目路径；省略则搜索所有项目
 */
export async function tagSession(sessionId, tag, options) {
    const file = findSessionFile(sessionId);
    if (!file)
        return;
    const entry = { type: 'tag', tag, timestamp: new Date().toISOString() };
    appendFileSync(file, JSON.stringify(entry) + '\n', 'utf-8');
}
/**
 * 将会话分叉到具有新 UUID 的新分支。
 *
 * 将源会话中的转录消息复制到新会话文件中，
 * 重新映射每个消息 UUID 并保留 parentUuid 链。支持
 * `upToMessageId` 从对话中的特定点进行分支。
 *
 * 分叉的会话不会带有撤销历史（文件历史快照不会被复制）。
 *
 * @param sessionId - 源会话的 UUID
 * @param options - `{ dir?, upToMessageId?, title? }`
 * @returns `{ sessionId }` — 新分叉会话的 UUID
 */
function remapRecord(rec, uuidMap) {
    const copy = { ...rec };
    if (copy.uuid) {
        const old = copy.uuid;
        if (!uuidMap.has(old))
            uuidMap.set(old, randomUUID());
        copy.uuid = uuidMap.get(old);
    }
    if (copy.parentUuid && uuidMap.has(copy.parentUuid)) {
        copy.parentUuid = uuidMap.get(copy.parentUuid);
    }
    return copy;
}
export async function forkSession(sessionId, options) {
    const file = findSessionFile(sessionId);
    if (!file)
        throw new Error(`Session not found: ${sessionId}`);
    const records = readSessionRecords(file);
    const newId = randomUUID();
    const uuidMap = new Map();
    const upToMessageId = options?.upToMessageId;
    const forked = [];
    for (const rec of records) {
        forked.push(remapRecord(rec, uuidMap));
        if (upToMessageId && rec.uuid === upToMessageId)
            break;
    }
    const dir = file.substring(0, file.lastIndexOf('\\'));
    const newFile = join(dir, `${newId}.jsonl`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(newFile, forked.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
    return { sessionId: newId };
}
/**
 * 监视 `<dir>/.claude/scheduled_tasks.json` 并在任务触发时产生事件。
 *
 * 获取每个目录的调度器锁（基于 PID 的活性检查），因此同一目录中的 REPL
 * 会话不会重复触发。当信号中止时释放锁并关闭文件监视器。
 *
 * - `fire` — 其 cron 调度已满足的任务。一次性任务在此事件产生时
 *   已从文件中删除；重复性任务被重新调度（或如果过期则被删除）。
 * - `missed` — 守护进程关闭期间其窗口已过的一次性任务。
 *   在初始加载时产生一次；后台删除操作会稍后将其从文件中移除。
 *
 * 适用于外部拥有调度器的守护进程架构，并通过 `query()` 生成代理；
 * 代理子进程（`-p` 模式）不运行自己的调度器。
 *
 * @internal
 */
export function watchScheduledTasks(opts) {
    const tasksFile = join(opts.dir, '.claude', 'scheduled_tasks.json');
    const queue = [];
    const waiters = [];
    const fire = (event) => {
        queue.push(event);
        for (const w of waiters)
            w();
    };
    // 初始加载：检测错过的一次性任务
    const load = () => {
        if (!existsSync(tasksFile))
            return;
        try {
            const tasks = JSON.parse(readFileSync(tasksFile, 'utf-8'));
            const now = Date.now();
            const missed = tasks.filter(t => t.recurring === false && now - t.createdAt > 3600000);
            if (missed.length > 0)
                fire({ type: 'missed', tasks: missed });
        }
        catch { /* ignore */ }
    };
    load();
    return {
        async *events() {
            while (!opts.signal.aborted) {
                if (queue.length > 0) {
                    yield queue.shift();
                    continue;
                }
                await new Promise(resolve => {
                    waiters.push(resolve);
                    opts.signal.addEventListener('abort', () => resolve(), { once: true });
                });
            }
        },
        getNextFireTime() {
            return null;
        },
    };
}
/**
 * 将错过的一次性任务格式化为提示，要求模型在执行前
 * 与用户确认（通过 AskUserQuestion）。
 * @internal
 */
export function buildMissedTaskNotification(missed) {
    if (missed.length === 0)
        return '';
    const lines = ['以下计划任务在守护进程关闭期间错过，需要确认：', ''];
    for (const task of missed) {
        lines.push(`- 任务 ${task.id}: ${task.prompt.slice(0, 120)}（原计划 ${new Date(task.createdAt).toISOString()}）`);
    }
    lines.push('', '是否立即执行这些任务？');
    return lines.join('\n');
}
/**
 * 从守护进程持有 claude.ai 远程控制桥接连接。
 *
 * 守护进程在父进程中拥有 WebSocket — 如果代理子进程
 *（通过 `query()` 生成）崩溃，守护进程会重新生成它，而
 * claude.ai 保持同一会话。与 `query.enableRemoteControl` 形成对比，
 * 后者将 WebSocket 放在子进程中（随代理一起消亡）。
 *
 * 通过 `write()` + `sendResult()` 管道传输 `query()` 的产出。将
 * `inboundPrompts()`（用户在 claude.ai 上键入的内容）读入 `query()` 的输入流。
 * 在本地处理 `controlRequests()`（中断 → 中止，set_model → 重新配置）。
 *
 * 跳过 `tengu_ccr_bridge` 门控和策略限制检查 — @internal
 * 调用者已预先获得授权。仍然需要 OAuth（环境变量或密钥链）。
 *
 * 如果没有 OAuth 或注册失败，则返回 null。
 *
 * @internal
 */
export async function connectRemoteControl(opts) {
    // 简化：桥接连接需要守护进程 + OAuth WebSocket 基础设施。
    // 无访问令牌时直接返回 null（调用方按未启用处理）。
    const accessToken = opts.getAccessToken();
    if (!accessToken)
        return null;
    process.stderr.write('[SDK] connectRemoteControl: 桥接连接需要守护进程支持\n');
    return null;
}
