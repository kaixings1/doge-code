import { execa } from 'execa';
import { memoize } from '../vendor/lodash.js';
import { getSessionId } from '../bootstrap/state.js';
import { getOauthAccountInfo, getRateLimitTier, getSubscriptionType, } from './auth.js';
import { getGlobalConfig, getOrCreateUserID } from './config.js';
import { getCwd } from './cwd.js';
import { getHostPlatformForAnalytics } from './env.js';
import { isEnvTruthy } from './envUtils.js';
// Cache for email fetched asynchronously at startup
let cachedEmail = null; // null means not fetched yet
let emailFetchPromise = null;
/**
 * Initialize user data asynchronously. Should be called early in startup.
 * This pre-fetches the email so getUser() can remain synchronous.
 */
export async function initUser() {
    if (cachedEmail === null && !emailFetchPromise) {
        emailFetchPromise = getEmailAsync();
        cachedEmail = await emailFetchPromise;
        emailFetchPromise = null;
        // Clear memoization cache so next call picks up the email
        getCoreUserData.cache.clear?.();
    }
}
/**
 * Reset all user data caches. Call on auth changes (login/logout/account switch)
 * so the next getCoreUserData() call picks up fresh credentials and email.
 */
export function resetUserCache() {
    cachedEmail = null;
    emailFetchPromise = null;
    getCoreUserData.cache.clear?.();
    getGitEmail.cache.clear?.();
}
/**
 * Get core user data.
 * This is the base representation that gets transformed for different analytics providers.
 */
export const getCoreUserData = memoize((includeAnalyticsMetadata) => {
    const deviceId = getOrCreateUserID();
    const config = getGlobalConfig();
    let subscriptionType;
    let rateLimitTier;
    let firstTokenTime;
    if (includeAnalyticsMetadata) {
        subscriptionType = getSubscriptionType() ?? undefined;
        rateLimitTier = getRateLimitTier() ?? undefined;
        if (subscriptionType && config.claudeCodeFirstTokenDate) {
            const configFirstTokenTime = new Date(config.claudeCodeFirstTokenDate).getTime();
            if (!isNaN(configFirstTokenTime)) {
                firstTokenTime = configFirstTokenTime;
            }
        }
    }
    // Only include OAuth account data when actively using OAuth authentication
    const oauthAccount = getOauthAccountInfo();
    const organizationUuid = oauthAccount?.organizationUuid;
    const accountUuid = oauthAccount?.accountUuid;
    return {
        deviceId,
        sessionId: getSessionId(),
        email: getEmail(),
        appVersion: MACRO.VERSION,
        platform: getHostPlatformForAnalytics(),
        organizationUuid,
        accountUuid,
        userType: process.env.USER_TYPE,
        subscriptionType,
        rateLimitTier,
        firstTokenTime,
        ...(isEnvTruthy(process.env.GITHUB_ACTIONS) && {
            githubActionsMetadata: {
                actor: process.env.GITHUB_ACTOR,
                actorId: process.env.GITHUB_ACTOR_ID,
                repository: process.env.GITHUB_REPOSITORY,
                repositoryId: process.env.GITHUB_REPOSITORY_ID,
                repositoryOwner: process.env.GITHUB_REPOSITORY_OWNER,
                repositoryOwnerId: process.env.GITHUB_REPOSITORY_OWNER_ID,
            },
        }),
    };
});
/**
 * Get user data for GrowthBook (same as core data with analytics metadata).
 */
export function getUserForGrowthBook() {
    return getCoreUserData(true);
}
function getEmail() {
    // Return cached email if available (from async initialization)
    if (cachedEmail !== null) {
        return cachedEmail;
    }
    // Only include OAuth email when actively using OAuth authentication
    const oauthAccount = getOauthAccountInfo();
    if (oauthAccount?.emailAddress) {
        return oauthAccount.emailAddress;
    }
    // Ant-only fallbacks below (no execSync)
    if (process.env.USER_TYPE !== 'ant') {
        return undefined;
    }
    if (process.env.COO_CREATOR) {
        return `${process.env.COO_CREATOR}@anthropic.com`;
    }
    // If initUser() wasn't called, we return undefined instead of blocking
    return undefined;
}
async function getEmailAsync() {
    // Only include OAuth email when actively using OAuth authentication
    const oauthAccount = getOauthAccountInfo();
    if (oauthAccount?.emailAddress) {
        return oauthAccount.emailAddress;
    }
    // Ant-only fallbacks below
    if (process.env.USER_TYPE !== 'ant') {
        return undefined;
    }
    if (process.env.COO_CREATOR) {
        return `${process.env.COO_CREATOR}@anthropic.com`;
    }
    return getGitEmail();
}
/**
 * Get the user's git email from `git config user.email`.
 * Memoized so the subprocess only spawns once per process.
 */
export const getGitEmail = memoize(async () => {
    const result = await execa('git config --get user.email', {
        shell: true,
        reject: false,
        cwd: getCwd(),
    });
    return result.exitCode === 0 && result.stdout
        ? result.stdout.trim()
        : undefined;
});
//# sourceMappingURL=user.js.map