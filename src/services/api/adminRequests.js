import axios from 'axios';
import { getOauthConfig } from '../../constants/oauth.js';
import { getOAuthHeaders, prepareApiRequest } from '../../utils/teleport/api.js';
/**
 * Create an admin request (limit increase or seat upgrade).
 *
 * For Team/Enterprise users who don't have billing/admin permissions,
 * this creates a request that their admin can act on.
 *
 * If a pending request of the same type already exists for this user,
 * returns the existing request instead of creating a new one.
 */
export async function createAdminRequest(params) {
    const { accessToken, orgUUID } = await prepareApiRequest();
    const headers = {
        ...getOAuthHeaders(accessToken),
        'x-organization-uuid': orgUUID,
    };
    const url = `${getOauthConfig().BASE_API_URL}/api/oauth/organizations/${orgUUID}/admin_requests`;
    const response = await axios.post(url, params, { headers });
    return response.data;
}
/**
 * Get pending admin request of a specific type for the current user.
 *
 * Returns the pending request if one exists, otherwise null.
 */
export async function getMyAdminRequests(requestType, statuses) {
    const { accessToken, orgUUID } = await prepareApiRequest();
    const headers = {
        ...getOAuthHeaders(accessToken),
        'x-organization-uuid': orgUUID,
    };
    let url = `${getOauthConfig().BASE_API_URL}/api/oauth/organizations/${orgUUID}/admin_requests/me?request_type=${requestType}`;
    for (const status of statuses) {
        url += `&statuses=${status}`;
    }
    const response = await axios.get(url, {
        headers,
    });
    return response.data;
}
/**
 * Check if a specific admin request type is allowed for this org.
 */
export async function checkAdminRequestEligibility(requestType) {
    const { accessToken, orgUUID } = await prepareApiRequest();
    const headers = {
        ...getOAuthHeaders(accessToken),
        'x-organization-uuid': orgUUID,
    };
    const url = `${getOauthConfig().BASE_API_URL}/api/oauth/organizations/${orgUUID}/admin_requests/eligibility?request_type=${requestType}`;
    const response = await axios.get(url, {
        headers,
    });
    return response.data;
}
