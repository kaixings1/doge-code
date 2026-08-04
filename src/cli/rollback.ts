import { getVersionHistory, installGlobalPackage } from '../utils/autoUpdater.js'

/**
 * `claude rollback` — 回滚到之前的版本。
 *
 * 用法：
 *   claude rollback                 从当前版本回退 1 个版本
 *   claude rollback 3               从当前版本回退 3 个版本
 *   claude rollback 2.0.73-dev.20251217.t190658  回滚到特定版本
 *   claude rollback -l, --list      列出最近发布的版本及其时间
 *   claude rollback --dry-run       仅显示将安装的内容而不实际安装
 *   claude rollback --safe          回滚到服务器固定的安全版本
 */
export async function rollback(
  target?: string,
  options?: { list?: boolean; dryRun?: boolean; safe?: boolean },
): Promise<void> {
  const { list, dryRun, safe } = options || {}

  const versions = await getVersionHistory(50)

  // --list：列出最近发布的版本
  if (list) {
    console.log('最近发布的版本：')
    if (versions.length === 0) {
      console.log('  (无法获取版本历史)')
    }
    versions.forEach((v, i) => console.log(`  ${i + 1}. ${v}`))
    return
  }

  if (versions.length === 0 && !safe) {
    console.error('无法获取版本历史，无法执行回滚')
    process.exitCode = 1
    return
  }

  // 确定目标版本
  let targetVersion: string | null = null
  if (safe) {
    // 服务端固定的安全版本（由值班人员在事故期间设置）
    targetVersion = process.env.CLAUDE_CODE_SAFE_VERSION || versions[0] || null
    if (!targetVersion) {
      console.error('--safe 回滚需要 CLAUDE_CODE_SAFE_VERSION 环境变量指定的安全版本')
      process.exitCode = 1
      return
    }
  } else if (target) {
    if (/^\d+$/.test(target)) {
      const backSteps = parseInt(target, 10)
      const idx = backSteps - 1
      if (idx < 0 || idx >= versions.length) {
        console.error(
          `没有找到可回退 ${backSteps} 个版本的记录（共有 ${versions.length} 个版本）`,
        )
        process.exitCode = 1
        return
      }
      targetVersion = versions[idx]
    } else {
      // 视为精确版本串
      targetVersion = target
    }
  } else {
    // 默认回退 1 个版本
    targetVersion = versions[0]
  }

  if (!targetVersion) {
    console.error('无法确定目标版本')
    process.exitCode = 1
    return
  }

  if (dryRun) {
    console.log(`[dry-run] 将回滚到版本: ${targetVersion}`)
    return
  }

  if (targetVersion === MACRO.VERSION) {
    console.log(`当前已是最新版本（${MACRO.VERSION}），无需回滚`)
    return
  }

  console.log(`正在回滚到版本: ${targetVersion}`)
  const result = await installGlobalPackage(targetVersion)
  console.log(`安装结果: ${result}`)
}
