import { logEvent, } from '../services/analytics/index.js';
import { logForDebugging } from '../utils/debug.js';
import { errorMessage } from '../utils/errors.js';
import { jsonStringify } from '../utils/slowOperations.js';
const DEBUG_MSG_LIMIT = 2000;
const SECRET_FIELD_NAMES = [
    'session_ingress_token',
    'environment_secret',
    'access_token',
    'secret',
    'token',
];
const SECRET_PATTERN = new RegExp(`"(${SECRET_FIELD_NAMES.join('|')})"\\s*:\\s*"([^"]*)"`, 'g');
const REDACT_MIN_LENGTH = 16;
export function redactSecrets(s) {
    return s.replace(SECRET_PATTERN, (_match, field, value) => {
        if (value.length < REDACT_MIN_LENGTH) {
            return `"${field}":"[REDACTED]"`;
        }
        const redacted = `${value.slice(0, 8)}...${value.slice(-4)}`;
        return `"${field}":"${redacted}"`;
    });
}
/** Truncate a string for debug logging, collapsing newlines. */
export function debugTruncate(s) {
    const flat = s.replace(/\n/g, '\\n');
    if (flat.length <= DEBUG_MSG_LIMIT) {
        return flat;
    }
    return flat.slice(0, DEBUG_MSG_LIMIT) + `... (${flat.length} 字符)`;
}
/** Truncate a JSON-serializable value for debug logging. */
export function debugBody(data) {
    const raw = typeof data === 'string' ? data : jsonStringify(data);
    const s = redactSecrets(raw);
    if (s.length <= DEBUG_MSG_LIMIT) {
        return s;
    }
    return s.slice(0, DEBUG_MSG_LIMIT) + `... (${s.length} 字符)`;
}
/**
 * Extract a descriptive error message from an axios error (or any error).
 * For HTTP errors, appends the server's response body message if available,
 * since axios's default message only includes the status code.
 */
export function describeAxiosError(err) {
    const msg = errorMessage(err);
    if (err && typeof err === 'object' && 'response' in err) {
        const response = err.response;
        if (response?.data && typeof response.data === 'object') {
            const data = response.data;
            const detail = typeof data.message === 'string'
                ? data.message
                : typeof data.error === 'object' &&
                    data.error &&
                    'message' in data.error &&
                    typeof data.error.message ===
                        'string'
                    ? data.error.message
                    : undefined;
            if (detail) {
                return `${msg}: ${detail}`;
            }
        }
    }
    return msg;
}
/**
 * Extract the HTTP status code from an axios error, if present.
 * Returns undefined for non-HTTP errors (e.g. network failures).
 */
export function extractHttpStatus(err) {
    if (err &&
        typeof err === 'object' &&
        'response' in err &&
        err.response &&
        typeof err.response.status ===
            'number') {
        return err.response.status;
    }
    return undefined;
}
/**
 * Pull a human-readable message out of an API error response body.
 * Checks `data.message` first, then `data.error.message`.
 */
export function extractErrorDetail(data) {
    if (!data || typeof data !== 'object')
        return undefined;
    if ('message' in data && typeof data.message === 'string') {
        return data.message;
    }
    if ('error' in data &&
        data.error !== null &&
        typeof data.error === 'object' &&
        'message' in data.error &&
        typeof data.error.message === 'string') {
        return data.error.message;
    }
    return undefined;
}
/**
 * Log a bridge init skip — debug message + `tengu_bridge_repl_skipped`
 * analytics event. Centralizes the event name and the AnalyticsMetadata
 * cast so call sites don't each repeat the 5-line boilerplate.
 */
export function logBridgeSkip(reason, debugMsg, v2) {
    if (debugMsg) {
        logForDebugging(debugMsg);
    }
    logEvent('tengu_bridge_repl_skipped', {
        reason: reason,
        ...(v2 !== undefined && { v2 }),
    });
}
//# sourceMappingURL=debugUtils.js.map