import { APIError } from '@anthropic-ai/sdk';
import { isEqual } from '../vendor/lodash.js';
import { getIsNonInteractiveSession } from '../bootstrap/state.js';
import { isClaudeAISubscriber } from '../utils/auth.js';
import { getModelBetas } from '../utils/betas.js';
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js';
import { logError } from '../utils/log.js';
import { getSmallFastModel } from '../utils/model/model.js';
import { isEssentialTrafficOnly } from '../utils/privacyLevel.js';
import { logEvent } from './analytics/index.js';
import { getAPIMetadata } from './api/claude.js';
import { getAnthropicClient } from './api/client.js';
import { processRateLimitHeaders, shouldProcessRateLimits, } from './rateLimitMocking.js';
// Re-export message functions from centralized location
export { getRateLimitErrorMessage, getRateLimitWarning, getUsingOverageText, } from './rateLimitMessages.js';
// Early warning configurations in priority order (checked first to last)
// Used as fallback when server doesn't send surpassed-threshold header
// Warns users when they're consuming quota faster than the time window allows
const EARLY_WARNING_CONFIGS = [
    {
        rateLimitType: 'five_hour',
        claimAbbrev: '5h',
        windowSeconds: 5 * 60 * 60,
        thresholds: [{ utilization: 0.9, timePct: 0.72 }],
    },
    {
        rateLimitType: 'seven_day',
        claimAbbrev: '7d',
        windowSeconds: 7 * 24 * 60 * 60,
        thresholds: [
            { utilization: 0.75, timePct: 0.6 },
            { utilization: 0.5, timePct: 0.35 },
            { utilization: 0.25, timePct: 0.15 },
        ],
    },
];
// Maps claim abbreviations to rate limit types for header-based detection
const EARLY_WARNING_CLAIM_MAP = {
    '5h': 'five_hour',
    '7d': 'seven_day',
    overage: 'overage',
};
const RATE_LIMIT_DISPLAY_NAMES = {
    five_hour: 'session limit',
    seven_day: 'weekly limit',
    seven_day_opus: 'Opus limit',
    seven_day_sonnet: 'Sonnet limit',
    overage: 'extra usage limit',
};
export function getRateLimitDisplayName(type) {
    return RATE_LIMIT_DISPLAY_NAMES[type] || type;
}
/**
 * Calculate what fraction of a time window has elapsed.
 * Used for time-relative early warning fallback.
 * @param resetsAt - Unix epoch timestamp in seconds when the limit resets
 * @param windowSeconds - Duration of the window in seconds
 * @returns fraction (0-1) of the window that has elapsed
 */
function computeTimeProgress(resetsAt, windowSeconds) {
    const nowSeconds = Date.now() / 1000;
    const windowStart = resetsAt - windowSeconds;
    const elapsed = nowSeconds - windowStart;
    return Math.max(0, Math.min(1, elapsed / windowSeconds));
}
// Exported for testing only
export let currentLimits = {
    status: 'allowed',
    unifiedRateLimitFallbackAvailable: false,
    isUsingOverage: false,
};
let rawUtilization = {};
export function getRawUtilization() {
    return rawUtilization;
}
function extractRawUtilization(headers) {
    const result = {};
    for (const [key, abbrev] of [
        ['five_hour', '5h'],
        ['seven_day', '7d'],
    ]) {
        const util = headers.get(`anthropic-ratelimit-unified-${abbrev}-utilization`);
        const reset = headers.get(`anthropic-ratelimit-unified-${abbrev}-reset`);
        if (util !== null && reset !== null) {
            result[key] = { utilization: Number(util), resets_at: Number(reset) };
        }
    }
    return result;
}
export const statusListeners = new Set();
export function emitStatusChange(limits) {
    currentLimits = limits;
    statusListeners.forEach(listener => listener(limits));
    const hoursTillReset = Math.round((limits.resetsAt ? limits.resetsAt - Date.now() / 1000 : 0) / (60 * 60));
    logEvent('tengu_claudeai_limits_status_changed', {
        status: limits.status,
        unifiedRateLimitFallbackAvailable: limits.unifiedRateLimitFallbackAvailable,
        hoursTillReset,
    });
}
async function makeTestQuery() {
    const model = getSmallFastModel();
    const anthropic = await getAnthropicClient({
        maxRetries: 0,
        model,
        source: 'quota_check',
    });
    const messages = [{ role: 'user', content: 'quota' }];
    const betas = getModelBetas(model);
    // biome-ignore lint/plugin: quota check needs raw response access via asResponse()
    return anthropic.beta.messages
        .create({
        model,
        max_tokens: 1,
        messages,
        metadata: getAPIMetadata(),
        ...(betas.length > 0 ? { betas } : {}),
    })
        .asResponse();
}
export async function checkQuotaStatus() {
    // Skip network requests if nonessential traffic is disabled
    if (isEssentialTrafficOnly()) {
        return;
    }
    // Check if we should process rate limits (real subscriber or mock testing)
    if (!shouldProcessRateLimits(isClaudeAISubscriber())) {
        return;
    }
    // In non-interactive mode (-p), the real query follows immediately and
    // extractQuotaStatusFromHeaders() will update limits from its response
    // headers (claude.ts), so skip this pre-check API call.
    if (getIsNonInteractiveSession()) {
        return;
    }
    try {
        // Make a minimal request to check quota
        const raw = await makeTestQuery();
        // Update limits based on the response
        extractQuotaStatusFromHeaders(raw.headers);
    }
    catch (error) {
        if (error instanceof APIError) {
            extractQuotaStatusFromError(error);
        }
    }
}
/**
 * Check if early warning should be triggered based on surpassed-threshold header.
 * Returns ClaudeAILimits if a threshold was surpassed, null otherwise.
 */
function getHeaderBasedEarlyWarning(headers, unifiedRateLimitFallbackAvailable) {
    // Check each claim type for surpassed threshold header
    for (const [claimAbbrev, rateLimitType] of Object.entries(EARLY_WARNING_CLAIM_MAP)) {
        const surpassedThreshold = headers.get(`anthropic-ratelimit-unified-${claimAbbrev}-surpassed-threshold`);
        // If threshold header is present, user has crossed a warning threshold
        if (surpassedThreshold !== null) {
            const utilizationHeader = headers.get(`anthropic-ratelimit-unified-${claimAbbrev}-utilization`);
            const resetHeader = headers.get(`anthropic-ratelimit-unified-${claimAbbrev}-reset`);
            const utilization = utilizationHeader
                ? Number(utilizationHeader)
                : undefined;
            const resetsAt = resetHeader ? Number(resetHeader) : undefined;
            return {
                status: 'allowed_warning',
                resetsAt,
                rateLimitType: rateLimitType,
                utilization,
                unifiedRateLimitFallbackAvailable,
                isUsingOverage: false,
                surpassedThreshold: Number(surpassedThreshold),
            };
        }
    }
    return null;
}
/**
 * Check if time-relative early warning should be triggered for a rate limit type.
 * Fallback when server doesn't send surpassed-threshold header.
 * Returns ClaudeAILimits if thresholds are exceeded, null otherwise.
 */
function getTimeRelativeEarlyWarning(headers, config, unifiedRateLimitFallbackAvailable) {
    const { rateLimitType, claimAbbrev, windowSeconds, thresholds } = config;
    const utilizationHeader = headers.get(`anthropic-ratelimit-unified-${claimAbbrev}-utilization`);
    const resetHeader = headers.get(`anthropic-ratelimit-unified-${claimAbbrev}-reset`);
    if (utilizationHeader === null || resetHeader === null) {
        return null;
    }
    const utilization = Number(utilizationHeader);
    const resetsAt = Number(resetHeader);
    const timeProgress = computeTimeProgress(resetsAt, windowSeconds);
    // Check if any threshold is exceeded: high usage early in the window
    const shouldWarn = thresholds.some(t => utilization >= t.utilization && timeProgress <= t.timePct);
    if (!shouldWarn) {
        return null;
    }
    return {
        status: 'allowed_warning',
        resetsAt,
        rateLimitType,
        utilization,
        unifiedRateLimitFallbackAvailable,
        isUsingOverage: false,
    };
}
/**
 * Get early warning limits using header-based detection with time-relative fallback.
 * 1. First checks for surpassed-threshold header (new server-side approach)
 * 2. Falls back to time-relative thresholds (client-side calculation)
 */
function getEarlyWarningFromHeaders(headers, unifiedRateLimitFallbackAvailable) {
    // Try header-based detection first (preferred when API sends the header)
    const headerBasedWarning = getHeaderBasedEarlyWarning(headers, unifiedRateLimitFallbackAvailable);
    if (headerBasedWarning) {
        return headerBasedWarning;
    }
    // Fallback: Use time-relative thresholds (client-side calculation)
    // This catches users burning quota faster than sustainable
    for (const config of EARLY_WARNING_CONFIGS) {
        const timeRelativeWarning = getTimeRelativeEarlyWarning(headers, config, unifiedRateLimitFallbackAvailable);
        if (timeRelativeWarning) {
            return timeRelativeWarning;
        }
    }
    return null;
}
function computeNewLimitsFromHeaders(headers) {
    const status = headers.get('anthropic-ratelimit-unified-status') ||
        'allowed';
    const resetsAtHeader = headers.get('anthropic-ratelimit-unified-reset');
    const resetsAt = resetsAtHeader ? Number(resetsAtHeader) : undefined;
    const unifiedRateLimitFallbackAvailable = headers.get('anthropic-ratelimit-unified-fallback') === 'available';
    // Headers for rate limit type and overage support
    const rateLimitType = headers.get('anthropic-ratelimit-unified-representative-claim');
    const overageStatus = headers.get('anthropic-ratelimit-unified-overage-status');
    const overageResetsAtHeader = headers.get('anthropic-ratelimit-unified-overage-reset');
    const overageResetsAt = overageResetsAtHeader
        ? Number(overageResetsAtHeader)
        : undefined;
    // Reason why overage is disabled (spending cap or wallet empty)
    const overageDisabledReason = headers.get('anthropic-ratelimit-unified-overage-disabled-reason');
    // Determine if we're using overage (standard limits rejected but overage allowed)
    const isUsingOverage = status === 'rejected' &&
        (overageStatus === 'allowed' || overageStatus === 'allowed_warning');
    // Check for early warning based on surpassed-threshold header
    // If status is allowed/allowed_warning and we find a surpassed threshold, show warning
    let finalStatus = status;
    if (status === 'allowed' || status === 'allowed_warning') {
        const earlyWarning = getEarlyWarningFromHeaders(headers, unifiedRateLimitFallbackAvailable);
        if (earlyWarning) {
            return earlyWarning;
        }
        // No early warning threshold surpassed
        finalStatus = 'allowed';
    }
    return {
        status: finalStatus,
        resetsAt,
        unifiedRateLimitFallbackAvailable,
        ...(rateLimitType && { rateLimitType }),
        ...(overageStatus && { overageStatus }),
        ...(overageResetsAt && { overageResetsAt }),
        ...(overageDisabledReason && { overageDisabledReason }),
        isUsingOverage,
    };
}
/**
 * Cache the extra usage disabled reason from API headers.
 */
function cacheExtraUsageDisabledReason(headers) {
    // A null reason means extra usage is enabled (no disabled reason header)
    const reason = headers.get('anthropic-ratelimit-unified-overage-disabled-reason') ?? null;
    const cached = getGlobalConfig().cachedExtraUsageDisabledReason;
    if (cached !== reason) {
        saveGlobalConfig(current => ({
            ...current,
            cachedExtraUsageDisabledReason: reason,
        }));
    }
}
export function extractQuotaStatusFromHeaders(headers) {
    // Check if we need to process rate limits
    const isSubscriber = isClaudeAISubscriber();
    if (!shouldProcessRateLimits(isSubscriber)) {
        // If we have any rate limit state, clear it
        rawUtilization = {};
        if (currentLimits.status !== 'allowed' || currentLimits.resetsAt) {
            const defaultLimits = {
                status: 'allowed',
                unifiedRateLimitFallbackAvailable: false,
                isUsingOverage: false,
            };
            emitStatusChange(defaultLimits);
        }
        return;
    }
    // Process headers (applies mocks from /mock-limits command if active)
    const headersToUse = processRateLimitHeaders(headers);
    rawUtilization = extractRawUtilization(headersToUse);
    const newLimits = computeNewLimitsFromHeaders(headersToUse);
    // Cache extra usage status (persists across sessions)
    cacheExtraUsageDisabledReason(headersToUse);
    if (!isEqual(currentLimits, newLimits)) {
        emitStatusChange(newLimits);
    }
}
export function extractQuotaStatusFromError(error) {
    if (!shouldProcessRateLimits(isClaudeAISubscriber()) ||
        error.status !== 429) {
        return;
    }
    try {
        let newLimits = { ...currentLimits };
        if (error.headers) {
            // Process headers (applies mocks from /mock-limits command if active)
            const headersToUse = processRateLimitHeaders(error.headers);
            rawUtilization = extractRawUtilization(headersToUse);
            newLimits = computeNewLimitsFromHeaders(headersToUse);
            // Cache extra usage status (persists across sessions)
            cacheExtraUsageDisabledReason(headersToUse);
        }
        // For errors, always set status to rejected even if headers are not present.
        newLimits.status = 'rejected';
        if (!isEqual(currentLimits, newLimits)) {
            emitStatusChange(newLimits);
        }
    }
    catch (e) {
        logError(e);
    }
}
