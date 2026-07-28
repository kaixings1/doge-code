import axios from 'axios';
import { debugBody, extractErrorDetail } from './debugUtils.js';
import { BRIDGE_LOGIN_INSTRUCTION, } from './types.js';
const BETA_HEADER = 'environments-2025-11-01';
/** 服务器提供的 ID 在白名单中的模式，用于 URL 路径段。 */
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
/**
 * 验证服务器提供的 ID 是否可以安全地插入到 URL 路径中。
 * 防止路径遍历（例如 `../../admin`）以及包含斜杠、
 * 点或其他特殊字符的 ID 注入。
 */
export function validateBridgeId(id, label) {
    if (!id || !SAFE_ID_PATTERN.test(id)) {
        throw new Error(`无效的 ${label}：包含不安全字符`);
    }
    return id;
}
/** 不应重试的致命桥接器错误（例如认证失败）。 */
export class BridgeFatalError extends Error {
    status;
    /** 服务器提供的错误类型，例如 "environment_expired"。 */
    errorType;
    constructor(message, status, errorType) {
        super(message);
        this.name = 'BridgeFatalError';
        this.status = status;
        this.errorType = errorType;
    }
}
export function createBridgeApiClient(deps) {
    function debug(msg) {
        deps.onDebug?.(msg);
    }
    let consecutiveEmptyPolls = 0;
    const EMPTY_POLL_LOG_INTERVAL = 100;
    function getHeaders(accessToken) {
        const headers = {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            'anthropic-beta': BETA_HEADER,
            'x-environment-runner-version': deps.runnerVersion,
        };
        const deviceToken = deps.getTrustedDeviceToken?.();
        if (deviceToken) {
            headers['X-Trusted-Device-Token'] = deviceToken;
        }
        return headers;
    }
    function resolveAuth() {
        const accessToken = deps.getAccessToken();
        if (!accessToken) {
            throw new Error(BRIDGE_LOGIN_INSTRUCTION);
        }
        return accessToken;
    }
    /**
     * 执行 OAuth 认证的请求，在 401 时重试一次。
     * 收到 401 时，通过 handleOAuth401Error 尝试令牌刷新（与
     * withRetry.ts 中 v1/messages 的模式相同）。如果刷新成功，使用新令牌
     * 重试一次请求。如果刷新失败或重试也返回 401，
     * 则返回 401 响应以供 handleErrorStatus 抛出 BridgeFatalError。
     */
    async function withOAuthRetry(fn, context) {
        const accessToken = resolveAuth();
        const response = await fn(accessToken);
        if (response.status !== 401) {
            return response;
        }
        if (!deps.onAuth401) {
            debug(`[bridge:api] ${context}: 401 received, no refresh handler`);
            return response;
        }
        // 尝试刷新 token——与 withRetry.ts 中的模式匹配
        debug(`[bridge:api] ${context}: 401 received, attempting token refresh`);
        const refreshed = await deps.onAuth401(accessToken);
        if (refreshed) {
            debug(`[bridge:api] ${context}: Token refreshed, retrying request`);
            const newToken = resolveAuth();
            const retryResponse = await fn(newToken);
            if (retryResponse.status !== 401) {
                return retryResponse;
            }
            debug(`[bridge:api] ${context}: Retry after refresh also got 401`);
        }
        else {
            debug(`[bridge:api] ${context}: Token refresh failed`);
        }
        // 刷新失败——返回 401 供 handleErrorStatus 抛出
        return response;
    }
    return {
        async registerBridgeEnvironment(config) {
            debug(`[bridge:api] POST /v1/environments/bridge bridgeId=${config.bridgeId}`);
            const response = await withOAuthRetry((token) => axios.post(`${deps.baseUrl}/v1/environments/bridge`, {
                machine_name: config.machineName,
                directory: config.dir,
                branch: config.branch,
                git_repo_url: config.gitRepoUrl,
                // 通告会话容量，以便 claude.ai/code 可以显示
                // "2/4 sessions"徽章，仅在实际上达到容量时阻止选择器。尚不接受
                // 此字段的后端将静默忽略它。
                max_sessions: config.maxSessions,
                // worker_type 让 claude.ai 按来源过滤环境
                //（例如，助手选择器仅显示助手模式的工作区）。
                // 桌面 cowork 应用发送 "cowork"；我们发送不同的值。
                metadata: { worker_type: config.workerType },
                // 幂等重新注册：如果我们有来自先前会话 (--session-id resume) 的后端发出的
                // environment_id，将其发回以便后端重新附加而不是创建
                // 新环境。后端仍然可能返回一个新的 ID，如果
                // 旧的 ID 已过期——调用方必须比较响应。
                ...(config.reuseEnvironmentId && {
                    environment_id: config.reuseEnvironmentId,
                }),
            }, {
                headers: getHeaders(token),
                timeout: 15_000,
                validateStatus: status => status < 500,
            }), 'Registration');
            handleErrorStatus(response.status, response.data, 'Registration');
            debug(`[bridge:api] POST /v1/environments/bridge -> ${response.status} environment_id=${response.data.environment_id}`);
            debug(`[bridge:api] >>> ${debugBody({ machine_name: config.machineName, directory: config.dir, branch: config.branch, git_repo_url: config.gitRepoUrl, max_sessions: config.maxSessions, metadata: { worker_type: config.workerType } })}`);
            debug(`[bridge:api] <<< ${debugBody(response.data)}`);
            return response.data;
        },
        async pollForWork(environmentId, environmentSecret, signal, reclaimOlderThanMs) {
            validateBridgeId(environmentId, 'environmentId');
            // 保存并重置，以便错误打破"连续为空"的连胜纪录。
            // 在下面当响应确实为空时恢复。
            const prevEmptyPolls = consecutiveEmptyPolls;
            consecutiveEmptyPolls = 0;
            const response = await axios.get(`${deps.baseUrl}/v1/environments/${environmentId}/work/poll`, {
                headers: getHeaders(environmentSecret),
                params: reclaimOlderThanMs !== undefined
                    ? { reclaim_older_than_ms: reclaimOlderThanMs }
                    : undefined,
                timeout: 10_000,
                signal,
                validateStatus: status => status < 500,
            });
            handleErrorStatus(response.status, response.data, 'Poll');
            // 空体或 null = 没有可用工作
            if (!response.data) {
                consecutiveEmptyPolls = prevEmptyPolls + 1;
                if (consecutiveEmptyPolls === 1 ||
                    consecutiveEmptyPolls % EMPTY_POLL_LOG_INTERVAL === 0) {
                    debug(`[bridge:api] GET .../work/poll -> ${response.status} (no work, ${consecutiveEmptyPolls} consecutive empty polls)`);
                }
                return null;
            }
            debug(`[bridge:api] GET .../work/poll -> ${response.status} workId=${response.data.id} type=${response.data.data?.type}${response.data.data?.id ? ` sessionId=${response.data.data.id}` : ''}`);
            debug(`[bridge:api] <<< ${debugBody(response.data)}`);
            return response.data;
        },
        async acknowledgeWork(environmentId, workId, sessionToken) {
            validateBridgeId(environmentId, 'environmentId');
            validateBridgeId(workId, 'workId');
            debug(`[bridge:api] POST .../work/${workId}/ack`);
            const response = await axios.post(`${deps.baseUrl}/v1/environments/${environmentId}/work/${workId}/ack`, {}, {
                headers: getHeaders(sessionToken),
                timeout: 10_000,
                validateStatus: s => s < 500,
            });
            handleErrorStatus(response.status, response.data, 'Acknowledge');
            debug(`[bridge:api] POST .../work/${workId}/ack -> ${response.status}`);
        },
        async stopWork(environmentId, workId, force) {
            validateBridgeId(environmentId, 'environmentId');
            validateBridgeId(workId, 'workId');
            debug(`[bridge:api] POST .../work/${workId}/stop force=${force}`);
            const response = await withOAuthRetry((token) => axios.post(`${deps.baseUrl}/v1/environments/${environmentId}/work/${workId}/stop`, { force }, {
                headers: getHeaders(token),
                timeout: 10_000,
                validateStatus: s => s < 500,
            }), 'StopWork');
            handleErrorStatus(response.status, response.data, 'StopWork');
            debug(`[bridge:api] POST .../work/${workId}/stop -> ${response.status}`);
        },
        async deregisterEnvironment(environmentId) {
            validateBridgeId(environmentId, 'environmentId');
            debug(`[bridge:api] DELETE /v1/environments/bridge/${environmentId}`);
            const response = await withOAuthRetry((token) => axios.delete(`${deps.baseUrl}/v1/environments/bridge/${environmentId}`, {
                headers: getHeaders(token),
                timeout: 10_000,
                validateStatus: s => s < 500,
            }), 'Deregister');
            handleErrorStatus(response.status, response.data, 'Deregister');
            debug(`[bridge:api] DELETE /v1/environments/bridge/${environmentId} -> ${response.status}`);
        },
        async archiveSession(sessionId) {
            validateBridgeId(sessionId, 'sessionId');
            debug(`[bridge:api] POST /v1/sessions/${sessionId}/archive`);
            const response = await withOAuthRetry((token) => axios.post(`${deps.baseUrl}/v1/sessions/${sessionId}/archive`, {}, {
                headers: getHeaders(token),
                timeout: 10_000,
                validateStatus: s => s < 500,
            }), 'ArchiveSession');
            // 409 = 已归档（幂等操作，不是错误）
            if (response.status === 409) {
                debug(`[bridge:api] POST /v1/sessions/${sessionId}/archive -> 409 (already archived)`);
                return;
            }
            handleErrorStatus(response.status, response.data, 'ArchiveSession');
            debug(`[bridge:api] POST /v1/sessions/${sessionId}/archive -> ${response.status}`);
        },
        async reconnectSession(environmentId, sessionId) {
            validateBridgeId(environmentId, 'environmentId');
            validateBridgeId(sessionId, 'sessionId');
            debug(`[bridge:api] POST /v1/environments/${environmentId}/bridge/reconnect session_id=${sessionId}`);
            const response = await withOAuthRetry((token) => axios.post(`${deps.baseUrl}/v1/environments/${environmentId}/bridge/reconnect`, { session_id: sessionId }, {
                headers: getHeaders(token),
                timeout: 10_000,
                validateStatus: s => s < 500,
            }), 'ReconnectSession');
            handleErrorStatus(response.status, response.data, 'ReconnectSession');
            debug(`[bridge:api] POST .../bridge/reconnect -> ${response.status}`);
        },
        async heartbeatWork(environmentId, workId, sessionToken) {
            validateBridgeId(environmentId, 'environmentId');
            validateBridgeId(workId, 'workId');
            debug(`[bridge:api] POST .../work/${workId}/heartbeat`);
            const response = await axios.post(`${deps.baseUrl}/v1/environments/${environmentId}/work/${workId}/heartbeat`, {}, {
                headers: getHeaders(sessionToken),
                timeout: 10_000,
                validateStatus: s => s < 500,
            });
            handleErrorStatus(response.status, response.data, 'Heartbeat');
            debug(`[bridge:api] POST .../work/${workId}/heartbeat -> ${response.status} lease_extended=${response.data.lease_extended} state=${response.data.state}`);
            return response.data;
        },
        async sendPermissionResponseEvent(sessionId, event, sessionToken) {
            validateBridgeId(sessionId, 'sessionId');
            debug(`[bridge:api] POST /v1/sessions/${sessionId}/events type=${event.type}`);
            const response = await axios.post(`${deps.baseUrl}/v1/sessions/${sessionId}/events`, { events: [event] }, {
                headers: getHeaders(sessionToken),
                timeout: 10_000,
                validateStatus: s => s < 500,
            });
            handleErrorStatus(response.status, response.data, 'SendPermissionResponseEvent');
            debug(`[bridge:api] POST /v1/sessions/${sessionId}/events -> ${response.status}`);
            debug(`[bridge:api] >>> ${debugBody({ events: [event] })}`);
            debug(`[bridge:api] <<< ${debugBody(response.data)}`);
        },
    };
}
function handleErrorStatus(status, data, context) {
    if (status === 200 || status === 204) {
        return;
    }
    const detail = extractErrorDetail(data);
    const errorType = extractErrorTypeFromData(data);
    switch (status) {
        case 401:
            throw new BridgeFatalError(`${context}: 认证失败 (401)${detail ? `: ${detail}` : ''}. ${BRIDGE_LOGIN_INSTRUCTION}`, 401, errorType);
        case 403:
            throw new BridgeFatalError(isExpiredErrorType(errorType)
                ? 'Remote Control 会话已过期。请使用 `claude remote-control` 或 /remote-control 重新启动。'
                : `${context}: 访问被拒绝 (403)${detail ? `: ${detail}` : ''}。检查您的组织权限。`, 403, errorType);
        case 404:
            throw new BridgeFatalError(detail ??
                `${context}：未找到 (404)。远程控制可能不适用于此组织。`, 404, errorType);
        case 410:
            throw new BridgeFatalError(detail ??
                '远程控制会话已过期。请使用 `claude remote-control` 或 /remote-control 重新启动。', 410, errorType ?? 'environment_expired');
        case 429:
            throw new Error(`${context}：速率限制 (429)。轮询过于频繁。`);
        default:
            throw new Error(`${context}: 请求失败，状态码 ${status}${detail ? `: ${detail}` : ''}`);
    }
}
/** 检查错误类型字符串是否表示会话/环境已过期。 */
export function isExpiredErrorType(errorType) {
    if (!errorType) {
        return false;
    }
    return errorType.includes('expired') || errorType.includes('lifetime');
}
/**
 * 检查 BridgeFatalError 是否是可抑制的 403 权限错误。
 * 这些是针对 'external_poll_sessions' 等范围或 StopWork 等操作的 403 错误，
 * 因用户的角色缺少 'environments:manage' 而失败。
 * 它们不影响核心功能，不应向用户显示。
 */
export function isSuppressible403(err) {
    if (err.status !== 403) {
        return false;
    }
    return (err.message.includes('external_poll_sessions') ||
        err.message.includes('environments:manage'));
}
function extractErrorTypeFromData(data) {
    if (data && typeof data === 'object') {
        if ('error' in data &&
            data.error &&
            typeof data.error === 'object' &&
            'type' in data.error &&
            typeof data.error.type === 'string') {
            return data.error.type;
        }
    }
    return undefined;
}
//# sourceMappingURL=bridgeApi.js.map