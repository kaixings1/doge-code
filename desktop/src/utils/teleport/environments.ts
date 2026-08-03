import axios from 'axios'
import { getOauthConfig } from '../../constants/oauth.js'
import { getOrganizationUUID } from '../../services/oauth/client.js'
import { getClaudeAIOAuthTokens } from '../auth.js'
import { toError } from '../errors.js'
import { logError } from '../log.js'
import { getOAuthHeaders } from './api.js'

export type EnvironmentKind = 'anthropic_cloud' | 'byoc' | 'bridge'
export type EnvironmentState = 'active'

export type EnvironmentResource = {
  kind: EnvironmentKind
  environment_id: string
  name: string
  created_at: string
  state: EnvironmentState
}

export type EnvironmentListResponse = {
  environments: EnvironmentResource[]
  has_more: boolean
  first_id: string | null
  last_id: string | null
}

/**
 * Fetches the list of available environments from the Environment API
 * @returns Promise<EnvironmentResource[]> Array of available environments
 * @throws Error if the API request fails or no access token is available
 */
export async function fetchEnvironments(): Promise<EnvironmentResource[]> {
  const accessToken = getClaudeAIOAuthTokens()?.accessToken
  if (!accessToken) {
    throw new Error(
      'Claude Code Web 会话需要使用 Claude.ai 账户进行身份验证。API 密钥身份验证不足以胜任。请运行 /login 进行身份验证，或使用 /status 检查您的身份验证状态。',
    )
  }

  const orgUUID = await getOrganizationUUID()
  if (!orgUUID) {
    throw new Error('无法获取组织 UUID')
  }

  const url = `${getOauthConfig().BASE_API_URL}/v1/environment_providers`

  try {
    const headers = {
      ...getOAuthHeaders(accessToken),
      'x-organization-uuid': orgUUID,
    }

    const response = await axios.get<EnvironmentListResponse>(url, {
      headers,
      timeout: 15000,
    })

    if (response.status !== 200) {
      throw new Error(
        `获取环境列表失败：${response.status} ${response.statusText}`,
      )
    }

    return response.data.environments
  } catch (error) {
    const err = toError(error)
    logError(err)
    throw new Error(`获取环境列表失败：${err.message}`)
  }
}

/**
 * Creates a default anthropic_cloud environment for users who have none.
 * Uses the public environment_providers route (same auth as fetchEnvironments).
 */
export async function createDefaultCloudEnvironment(
  name: string,
): Promise<EnvironmentResource> {
  const accessToken = getClaudeAIOAuthTokens()?.accessToken
  if (!accessToken) {
    throw new Error('没有可用的访问令牌')
  }
  const orgUUID = await getOrganizationUUID()
  if (!orgUUID) {
    throw new Error('无法获取组织 UUID')
  }

  const url = `${getOauthConfig().BASE_API_URL}/v1/environment_providers/cloud/create`
  const response = await axios.post<EnvironmentResource>(
    url,
    {
      name,
      kind: 'anthropic_cloud',
      description: '',
      config: {
        environment_type: 'anthropic',
        cwd: '/home/user',
        init_script: null,
        environment: {},
        languages: [
          { name: 'python', version: '3.11' },
          { name: 'node', version: '20' },
        ],
        network_config: {
          allowed_hosts: [],
          allow_default_hosts: true,
        },
      },
    },
    {
      headers: {
        ...getOAuthHeaders(accessToken),
        'anthropic-beta': 'ccr-byoc-2025-07-29',
        'x-organization-uuid': orgUUID,
      },
      timeout: 15000,
    },
  )
  return response.data
}
