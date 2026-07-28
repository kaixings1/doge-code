import axios from 'axios';
import { getOauthConfig } from '../../constants/oauth.js';
import { getClaudeAIOAuthTokens, hasProfileScope, isClaudeAISubscriber, } from '../../utils/auth.js';
import { getAuthHeaders } from '../../utils/http.js';
import { getClaudeCodeUserAgent } from '../../utils/userAgent.js';
import { isOAuthTokenExpired } from '../oauth/client.js';
export async function fetchUtilization() {
    if (!isClaudeAISubscriber() || !hasProfileScope()) {
        return {};
    }
    // Skip API call if OAuth token is expired to avoid 401 errors
    const tokens = getClaudeAIOAuthTokens();
    if (tokens && isOAuthTokenExpired(tokens.expiresAt)) {
        return null;
    }
    const authResult = getAuthHeaders();
    if (authResult.error) {
        throw new Error(`认证错误：${authResult.error}`);
    }
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': getClaudeCodeUserAgent(),
        ...authResult.headers,
    };
    const url = `${getOauthConfig().BASE_API_URL}/api/oauth/usage`;
    const response = await axios.get(url, {
        headers,
        timeout: 5000, // 5 second timeout
    });
    return response.data;
}
//# sourceMappingURL=usage.js.map