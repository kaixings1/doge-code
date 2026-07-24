import axios from 'axios';
import { memoize } from '../../vendor/lodash.js';
import { getOauthConfig } from '../../constants/oauth.js';
import { logEvent, } from '../../services/analytics/index.js';
import { getClaudeAIOAuthTokens } from '../../utils/auth.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
import { logForDebugging } from '../../utils/debug.js';
import { isEnvDefinedFalsy } from '../../utils/envUtils.js';
import { clearMcpAuthCache } from './client.js';
import { normalizeNameForMCP } from './normalization.js';
const FETCH_TIMEOUT_MS = 5000;
const MCP_SERVERS_BETA_HEADER = 'mcp-servers-2025-12-04';
/**
 * Fetches MCP server configurations from Claude.ai org configs.
 * These servers are managed by the organization via Claude.ai.
 *
 * Results are memoized for the session lifetime (fetch once per CLI session).
 */
export const fetchClaudeAIMcpConfigsIfEligible = memoize(async () => {
    require('fs').writeFileSync('d:/mcp_trace.log', `claudeai FN ENTER at ${Date.now()}\n`, { flag: 'a' });
    try {
        if (isEnvDefinedFalsy(process.env.ENABLE_CLAUDEAI_MCP_SERVERS)) {
            logForDebugging('[claudeai-mcp] Disabled via env var');
            logEvent('tengu_claudeai_mcp_eligibility', {
                state: 'disabled_env_var',
            });
            return {};
        }
        const tokens = getClaudeAIOAuthTokens();
        require('fs').writeFileSync('d:/mcp_trace.log', `claudeai after getClaudeAIOAuthTokens hasToken=${!!tokens?.accessToken} at ${Date.now()}\n`, { flag: 'a' });
        if (!tokens?.accessToken) {
            require('fs').writeFileSync('d:/mcp_trace.log', `claudeai RETURN no-token at ${Date.now()}\n`, { flag: 'a' });
            logForDebugging('[claudeai-mcp] No access token');
            logEvent('tengu_claudeai_mcp_eligibility', {
                state: 'no_oauth_token',
            });
            return {};
        }
        // Check for user:mcp_servers scope directly instead of isClaudeAISubscriber().
        // In non-interactive mode, isClaudeAISubscriber() returns false when DOGE_API_KEY
        // is set (even with valid OAuth tokens) because preferThirdPartyAuthentication() causes
        // isAnthropicAuthEnabled() to return false. Checking the scope directly allows users
        // with both API keys and OAuth tokens to access claude.ai MCPs in print mode.
        if (!tokens.scopes?.includes('user:mcp_servers')) {
            require('fs').writeFileSync('d:/mcp_trace.log', `claudeai RETURN missing-scope at ${Date.now()}\n`, { flag: 'a' });
            logForDebugging(`[claudeai-mcp] Missing user:mcp_servers scope (scopes=${tokens.scopes?.join(',') || 'none'})`);
            logEvent('tengu_claudeai_mcp_eligibility', {
                state: 'missing_scope',
            });
            return {};
        }
        const baseUrl = getOauthConfig().BASE_API_URL;
        const url = `${baseUrl}/v1/mcp_servers?limit=1000`;
        require('fs').writeFileSync('d:/mcp_trace.log', `claudeai before axios.get ${url} at ${Date.now()}\n`, { flag: 'a' });
        logForDebugging(`[claudeai-mcp] Fetching from ${url}`);
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
                'anthropic-beta': MCP_SERVERS_BETA_HEADER,
                'anthropic-version': '2023-06-01',
            },
            timeout: FETCH_TIMEOUT_MS,
        });
        const configs = {};
        // Track used normalized names to detect collisions and assign (2), (3), etc. suffixes.
        // We check the final normalized name (including suffix) to handle edge cases where
        // a suffixed name collides with another server's base name (e.g., "Example Server 2"
        // colliding with "Example Server! (2)" which both normalize to claude_ai_Example_Server_2).
        const usedNormalizedNames = new Set();
        for (const server of response.data.data) {
            const baseName = `claude.ai ${server.display_name}`;
            // Try without suffix first, then increment until we find an unused normalized name
            let finalName = baseName;
            let finalNormalized = normalizeNameForMCP(finalName);
            let count = 1;
            while (usedNormalizedNames.has(finalNormalized)) {
                count++;
                finalName = `${baseName} (${count})`;
                finalNormalized = normalizeNameForMCP(finalName);
            }
            usedNormalizedNames.add(finalNormalized);
            configs[finalName] = {
                type: 'claudeai-proxy',
                url: server.url,
                id: server.id,
                scope: 'claudeai',
            };
        }
        logForDebugging(`[claudeai-mcp] Fetched ${Object.keys(configs).length} servers`);
        logEvent('tengu_claudeai_mcp_eligibility', {
            state: 'eligible',
        });
        return configs;
    }
    catch {
        logForDebugging(`[claudeai-mcp] Fetch failed`);
        return {};
    }
});
/**
 * Clears the memoized cache for fetchClaudeAIMcpConfigsIfEligible.
 * Call this after login so the next fetch will use the new auth tokens.
 */
export function clearClaudeAIMcpConfigsCache() {
    fetchClaudeAIMcpConfigsIfEligible.cache.clear?.();
    // Also clear the auth cache so freshly-authorized servers get re-connected
    clearMcpAuthCache();
}
/**
 * Record that a claude.ai connector successfully connected. Idempotent.
 *
 * Gates the "N connectors unavailable/need auth" startup notifications: a
 * connector that was working yesterday and is now failed is a state change
 * worth surfacing; an org-configured connector that's been needs-auth since
 * it showed up is one the user has demonstrably ignored.
 */
export function markClaudeAiMcpConnected(name) {
    saveGlobalConfig(current => {
        const seen = current.claudeAiMcpEverConnected ?? [];
        if (seen.includes(name))
            return current;
        return { ...current, claudeAiMcpEverConnected: [...seen, name] };
    });
}
export function hasClaudeAiMcpEverConnected(name) {
    return (getGlobalConfig().claudeAiMcpEverConnected ?? []).includes(name);
}
