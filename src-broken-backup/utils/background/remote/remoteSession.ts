import type { SDKMessage } from '../../../../../entrypoints/agentSdkTypes.js'
import { checkGate_CACHED_OR_BLOCKING } from '../../../../../services/analytics/growthbook.js'
import { isPolicyAllowed } from '../../../../../services/policyLimits/index.js'
import { detectCurrentRepositoryWithHost } from '../../../../detectRepository.js'
import { isEnvTruthy } from '../../../../envUtils.js'
import type { TodoList } from '../../../../todo/types.js'
import {
  checkGithubAppInstalled,
  checkHasRemoteEnvironment,
  checkIsInGitRepo,
  checkNeedsClaudeAiLogin,
} from './preconditions.js'

/**
 * 用于管理 teleport 会话的后台远程会话类。
 */
export type BackgroundRemoteSession = {
  id: string
  command: string
  startTime: number
  status: 'starting' | 'running' | 'completed' | 'failed' | 'killed'
  todoList: TodoList
  title: string
  type: 'remote_session'
  log: SDKMessage[]
}

/**
 * 后台远程会话的前置条件失。
 */
export type BackgroundRemoteSessionPrecondition =
  | { type: 'not_logged_in' }
  | { type: 'no_remote_environment' }
  | { type: 'not_in_git_repo' }
  | { type: 'no_git_remote' }
  | { type: 'github_app_not_installed' }
  | { type: 'policy_blocked' }

/**
 * 检查是否有资格创建后台远程会话
 * 返回失败的前置条件数组（空数组表示所有检查都通过。
 *
 * @returns 失败的前置条件数。
 */
export async function checkBackgroundRemoteSessionEligibility({
  skipBundle = false,
}: {
  skipBundle?: boolean
} = {}): Promise<BackgroundRemoteSessionPrecondition[]> {
  const errors: BackgroundRemoteSessionPrecondition[] = []

  // 首先检查策）- 如果被阻止，无需检查其他前置条。
  if (!isPolicyAllowed('allow_remote_sessions')) {
    errors.push({ type: 'policy_blocked' })
    return errors
  }

  const [needsLogin, hasRemoteEnv, repository] = await Promise.all([
    checkNeedsClaudeAiLogin(),
    checkHasRemoteEnvironment(),
    detectCurrentRepositoryWithHost(),
  ])

  if (needsLogin) {
    errors.push({ type: 'not_logged_in' })
  }

  if (!hasRemoteEnv) {
    errors.push({ type: 'no_remote_environment' })
  }

  // ）bundle 种子开启时，在 git 仓库内就足够 ）CCR 可以。
  // 本地 bundle 播种。不需）GitHub 远程）app。与
  // teleport.tsx bundleSeedGateOn 相同的门控。
  const bundleSeedGateOn =
    !skipBundle &&
    (isEnvTruthy(process.env.CCR_FORCE_BUNDLE) ||
      isEnvTruthy(process.env.CCR_ENABLE_BUNDLE) ||
      (await checkGate_CACHED_OR_BLOCKING('tengu_ccr_bundle_seed_enabled')))

  if (!checkIsInGitRepo()) {
    errors.push({ type: 'not_in_git_repo' })
  } else if (bundleSeedGateOn) {
    // ）.git/，bundle 将工））跳过远程+app 检。
  } else if (repository === null) {
    errors.push({ type: 'no_git_remote' })
  } else if (repository.host === 'github.com') {
    const hasGithubApp = await checkGithubAppInstalled(
      repository.owner,
      repository.name,
    )
    if (!hasGithubApp) {
      errors.push({ type: 'github_app_not_installed' })
    }
  }

  return errors
}
