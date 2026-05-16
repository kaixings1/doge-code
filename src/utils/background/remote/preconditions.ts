import axios from 'axios'
import { getOauthConfig } from '../../../constants/oauth.js'
import { getOrganizationUUID } from '../../../services/oauth/client.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../../services/analytics/growthbook.js'
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens,
  isClaudeAISubscriber,
} from '../../auth.js'
import { getCwd } from '../../cwd.js'
import { logForDebugging } from '../../debug.js'
import { detectCurrentRepository } from '../../detectRepository.js'
import { errorMessage } from '../../errors.js'
import { findGitRoot, getIsClean } from '../../git.js'
import { getOAuthHeaders } from '../../teleport/api.js'
import { fetchEnvironments } from '../../teleport/environments.js'

/**
 * 检查用户是否需要登录 Claude.ai
 * 从 TeleportError.tsx 的 getTeleportErrors() 中提取
 * @returns 需要登录返回 true，否则返回 false
 */
export async function checkNeedsClaudeAiLogin(): Promise<boolean> {
  if (!isClaudeAISubscriber()) {
    return false
  }
  return checkAndRefreshOAuthTokenIfNeeded()
}

/**
 * 检查 Git 工作目录是否干净（没有未提交的更改）
 * 忽略未跟踪的文件，因为它们在切换分支时不会丢失
 * 从 TeleportError.tsx 的 getTeleportErrors() 中提取
 * @returns Git 干净返回 true，否则返回 false
 */
export async function checkIsGitClean(): Promise<boolean> {
  const isClean = await getIsClean({ ignoreUntracked: true })
  return isClean
}

/**
 * 检查用户是否有权访问至少一个远程环境
 * @returns 有远程环境返回 true，否则返回 false
 */
export async function checkHasRemoteEnvironment(): Promise<boolean> {
  try {
    const environments = await fetchEnvironments()
    return environments.length > 0
  } catch (error) {
    logForDebugging(`checkHasRemoteEnvironment failed: ${errorMessage(error)}`)
    return false
  }
}

/**
 * 检查当前目录是否在 Git 仓库内（是否有 .git/）。
 * 与 checkHasGitRemote 不同 —— 仅本地的仓库会通过此项检查但不通过远程检查。
 */
export function checkIsInGitRepo(): boolean {
  return findGitRoot(getCwd()) !== null
}

/**
 * 检查当前仓库是否配置了 GitHub 远端。
 * 对于仅本地仓库（git init 时未设置 `origin`）返回 false。
 */
export async function checkHasGitRemote(): Promise<boolean> {
  const repository = await detectCurrentRepository()
  return repository !== null
}

/**
 * 检查 GitHub App 是否安装在特定仓库上
 * @param owner 仓库所有者（例如 "anthropics"）
 * @param repo 仓库名称（例如 "claude-cli-internal"）
 * @returns 已安装 GitHub App 返回 true，否则返回 false
 */
export async function checkGithubAppInstalled(
  owner: string,
  repo: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const accessToken = getClaudeAIOAuthTokens()?.accessToken
    if (!accessToken) {
      logForDebugging(
        'checkGithubAppInstalled: No access token found, assuming app not installed',
      )
      return false
    }

    const orgUUID = await getOrganizationUUID()
    if (!orgUUID) {
      logForDebugging(
        'checkGithubAppInstalled: No org UUID found, assuming app not installed',
      )
      return false
    }

    const url = `${getOauthConfig().BASE_API_URL}/api/oauth/organizations/${orgUUID}/code/repos/${owner}/${repo}`
    const headers = {
      ...getOAuthHeaders(accessToken),
      'x-organization-uuid': orgUUID,
    }

    logForDebugging(`Checking GitHub app installation for ${owner}/${repo}`)

    const response = await axios.get<{
      repo: {
        name: string
        owner: { login: string }
        default_branch: string
      }
      status: {
        app_installed: boolean
        relay_enabled: boolean
      } | null
    }>(url, {
      headers,
      timeout: 15000,
      signal,
    })

    if (response.status === 200) {
      if (response.data.status) {
        const installed = response.data.status.app_installed
        logForDebugging(
          `GitHub app ${installed ? 'is' : 'is not'} installed on ${owner}/${repo}`,
        )
        return installed
      }
      // status is null - app is not installed on this repo
      logForDebugging(
        `GitHub app is not installed on ${owner}/${repo} (status is null)`,
      )
      return false
    }

    logForDebugging(
      `checkGithubAppInstalled: Unexpected response status ${response.status}`,
    )
    return false
  } catch (error) {
    // 4XX 错误通常意味着应用未安装或仓库不可访问
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      if (status && status >= 400 && status < 500) {
        logForDebugging(
          `checkGithubAppInstalled: Got ${status} error, app likely not installed on ${owner}/${repo}`,
        )
        return false
      }
    }

    logForDebugging(`checkGithubAppInstalled error: ${errorMessage(error)}`)
    return false
  }
}

/**
 * 检查用户是否通过 /web-setup 同步了 GitHub 凭据
 * @returns GitHub Token 已同步返回 true，否则返回 false
 */
export async function checkGithubTokenSynced(): Promise<boolean> {
  try {
    const accessToken = getClaudeAIOAuthTokens()?.accessToken
    if (!accessToken) {
      logForDebugging('checkGithubTokenSynced: No access token found')
      return false
    }

    const orgUUID = await getOrganizationUUID()
    if (!orgUUID) {
      logForDebugging('checkGithubTokenSynced: No org UUID found')
      return false
    }

    const url = `${getOauthConfig().BASE_API_URL}/api/oauth/organizations/${orgUUID}/sync/github/auth`
    const headers = {
      ...getOAuthHeaders(accessToken),
      'x-organization-uuid': orgUUID,
    }

    logForDebugging('Checking if GitHub token is synced via web-setup')

    const response = await axios.get(url, {
      headers,
      timeout: 15000,
    })

    const synced =
      response.status === 200 && response.data?.is_authenticated === true
    logForDebugging(
      `GitHub token synced: ${synced} (status=${response.status}, data=${JSON.stringify(response.data)})`,
    )
    return synced
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      if (status && status >= 400 && status < 500) {
        logForDebugging(
          `checkGithubTokenSynced: Got ${status}, token not synced`,
        )
        return false
      }
    }

    logForDebugging(`checkGithubTokenSynced error: ${errorMessage(error)}`)
    return false
  }
}

type RepoAccessMethod = 'github-app' | 'token-sync' | 'none'

/**
 * 分层检查 GitHub 仓库是否可进行远程操作。
 * 1. GitHub App 已安装在仓库上
 * 2. GitHub Token 已通过 /web-setup 同步
 * 3. 都不满足 —— 调用方需要提示用户设置访问权限
 */
export async function checkRepoForRemoteAccess(
  owner: string,
  repo: string,
): Promise<{ hasAccess: boolean; method: RepoAccessMethod }> {
  if (await checkGithubAppInstalled(owner, repo)) {
    return { hasAccess: true, method: 'github-app' }
  }
  if (
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_lantern', false) &&
    (await checkGithubTokenSynced())
  ) {
    return { hasAccess: true, method: 'token-sync' }
  }
  return { hasAccess: false, method: 'none' }
}
