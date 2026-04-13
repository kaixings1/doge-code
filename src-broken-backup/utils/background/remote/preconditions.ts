import axios from 'axios'
import { getOauthConfig } from '../../../../../constants/oauth.js'
import { getOrganizationUUID } from '../../../../../services/oauth/client.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../../../../services/analytics/growthbook.js'
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens,
  isClaudeAISubscriber,
} from '../../../../auth.js'
import { getCwd } from '../../../../cwd.js'
import { logForDebugging } from '../../../../debug.js'
import { detectCurrentRepository } from '../../../../detectRepository.js'
import { errorMessage } from '../../../../errors.js'
import { findGitRoot, getIsClean } from '../../../../git.js'
import { getOAuthHeaders } from '../../../../teleport/api.js'
import { fetchEnvironments } from '../../../../teleport/environments.js'

/**
 * 检查用户是否需要登）Claude.ai
 * 提取）TeleportError.tsx 中的 getTeleportErrors()
 * @returns 如果需要登录返）true，否则返）false
 */
export async function checkNeedsClaudeAiLogin(): Promise<boolean> {
  if (!isClaudeAISubscriber()) {
    return false
  }
  return checkAndRefreshOAuthTokenIfNeeded()
}

/**
 * 检）git 工作目录是否干净（没有未提交的更改）
 * 忽略未跟踪的文件，因为它们不会在切换分支时丢。
 * 提取）TeleportError.tsx 中的 getTeleportErrors()
 * @returns 如果 git 是干净的返）true，否则返）false
 */
export async function checkIsGitClean(): Promise<boolean> {
  const isClean = await getIsClean({ ignoreUntracked: true })
  return isClean
}

/**
 * 检查用户是否可以访问至少一个远程环。
 * @returns 如果用户有远程环境返）true，否则返）false
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
 * 检查当前目录是否在 git 仓库内（）.git/）。
 * ）checkHasGitRemote 不同 ）仅本地的仓库会通过这个检查，但不会通过那个。
 */
export function checkIsInGitRepo(): boolean {
  return findGitRoot(getCwd()) !== null
}

/**
 * 检查当前仓库是否配置了 GitHub 远程地址。
 * 对于仅本地的仓库（git init 但没）`origin`）返）false。
 */
export async function checkHasGitRemote(): Promise<boolean> {
  const repository = await detectCurrentRepository()
  return repository !== null
}

/**
 * 检）GitHub app 是否已在特定仓库上安。
 * @param owner 仓库所有者（例如 "anthropics"。
 * @param repo 仓库名称（例）"claude-cli-internal"。
 * @returns 如果 GitHub app 已安装返）true，否则返）false
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
        'checkGithubAppInstalled: 未找到访问令牌，假设未安）app',
      )
      return false
    }

    const orgUUID = await getOrganizationUUID()
    if (!orgUUID) {
      logForDebugging(
        'checkGithubAppInstalled: 未找）org UUID，假设未安装 app',
      )
      return false
    }

    const url = `${getOauthConfig().BASE_API_URL}/api/oauth/organizations/${orgUUID}/code/repos/${owner}/${repo}`
    const headers = {
      ...getOAuthHeaders(accessToken),
      'x-organization-uuid': orgUUID,
    }

    logForDebugging(`检）${owner}/${repo} ）GitHub app 安装状态`)

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
          `GitHub app ${installed ? '。 : '）}安装）${owner}/${repo}`,
        )
        return installed
      }
      // status ）null - app 未在此仓库上安装
      logForDebugging(
        `GitHub app 未安装在 ${owner}/${repo}（status ）null）`,
      )
      return false
    }

    logForDebugging(
      `checkGithubAppInstalled: 意外的响应状）${response.status}`,
    )
    return false
  } catch (error) {
    // 4XX 错误通常意味着 app 未安装或仓库不可访问
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      if (status && status >= 400 && status < 500) {
        logForDebugging(
          `checkGithubAppInstalled: 收到 ${status} 错误，app 可能未安装在 ${owner}/${repo}`,
        )
        return false
      }
    }

    logForDebugging(`checkGithubAppInstalled 错误: ${errorMessage(error)}`)
    return false
  }
}

/**
 * 检查用户是否通过 /web-setup 同步了他们的 GitHub 凭证
 * @returns 如果 GitHub 令牌已同步返）true，否则返）false
 */
export async function checkGithubTokenSynced(): Promise<boolean> {
  try {
    const accessToken = getClaudeAIOAuthTokens()?.accessToken
    if (!accessToken) {
      logForDebugging('checkGithubTokenSynced: 未找到访问令）)
      return false
    }

    const orgUUID = await getOrganizationUUID()
    if (!orgUUID) {
      logForDebugging('checkGithubTokenSynced: 未找）org UUID')
      return false
    }

    const url = `${getOauthConfig().BASE_API_URL}/api/oauth/organizations/${orgUUID}/sync/github/auth`
    const headers = {
      ...getOAuthHeaders(accessToken),
      'x-organization-uuid': orgUUID,
    }

    logForDebugging('检）GitHub 令牌是否通过 web-setup 同步')

    const response = await axios.get(url, {
      headers,
      timeout: 15000,
    })

    const synced =
      response.status === 200 && response.data?.is_authenticated === true
    logForDebugging(
      `GitHub 令牌已同。 ${synced}（status=${response.status}, data=${JSON.stringify(response.data)}）`,
    )
    return synced
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      if (status && status >= 400 && status < 500) {
        logForDebugging(
          `checkGithubTokenSynced: 收到 ${status}，令牌未同步`,
        )
        return false
      }
    }

    logForDebugging(`checkGithubTokenSynced 错误: ${errorMessage(error)}`)
    return false
  }
}

type RepoAccessMethod = 'github-app' | 'token-sync' | 'none'

/**
 * 分层检）GitHub 仓库是否可用于远程操作。
 * 1. 仓库上安装了 GitHub App
 * 2. 通过 /web-setup 同步）GitHub 令牌
 * 3. 都没））调用者应提示用户设置访问权限
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
