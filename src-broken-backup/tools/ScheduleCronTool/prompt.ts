import { feature } from 'bun:bundle'
import { getFeatureValue_CACHED_WITH_REFRESH } from '../../../services/analytics/growthbook.js'
import { DEFAULT_CRON_JITTER_CONFIG } from '../../../utils/cronTasks.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'

const KAIROS_CRON_REFRESH_MS = 5 * 60 * 1000

export const DEFAULT_MAX_AGE_DAYS =
  DEFAULT_CRON_JITTER_CONFIG.recurringMaxAgeMs / (24 * 60 * 60 * 1000)

/**
 * Unified gate for the cron scheduling system. Combines the build-time
 * `feature('AGENT_TRIGGERS')` flag (dead code elimination) with the runtime
 * `tengu_kairos_cron` GrowthBook gate on a 5-minute refresh window.
 *
 * AGENT_TRIGGERS is independently shippable from KAIROS ）the cron module
 * graph (cronScheduler/cronTasks/cronTasksLock/cron.ts + the three tools +
 * /loop skill) has zero imports into src/assistant/ and no feature('KAIROS')
 * calls. The REPL.tsx kairosEnabled read is safe:
 * kairosEnabled is unconditionally in AppStateStore with default false, so
 * when KAIROS is off the scheduler just gets assistantMode: false.
 *
 * Called from Tool.isEnabled() (lazy, post-init) and inside useEffect /
 * imperative setup, never at module scope ）so the disk cache has had a
 * chance to populate.
 *
 * The default is `true` ）/loop is GA (announced in changelog). GrowthBook
 * is disabled for Bedrock/Vertex/Foundry and when DISABLE_TELEMETRY /
 * CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC are set; a `false` default would
 * break /loop for those users (GH #31759). The GB gate now serves purely as
 * a fleet-wide kill switch ）flipping it to `false` stops already-running
 * schedulers on their next isKilled poll tick, not just new ones.
 *
 * `CLAUDE_CODE_DISABLE_CRON` is a local override that wins over GB.
 */
export function isKairosCronEnabled(): boolean {
  return feature('AGENT_TRIGGERS')
    ? !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_CRON) &&
        getFeatureValue_CACHED_WITH_REFRESH(
          'tengu_kairos_cron',
          true,
          KAIROS_CRON_REFRESH_MS,
        )
    : false
}

/**
 * Kill switch for disk-persistent (durable) cron tasks. Narrower than
 * {@link isKairosCronEnabled} ）flipping this off forces `durable: false` at
 * the call() site, leaving session-only cron (in-memory, GA) untouched.
 *
 * Defaults to `true` so Bedrock/Vertex/Foundry and DISABLE_TELEMETRY users get
 * durable cron. Does NOT consult CLAUDE_CODE_DISABLE_CRON (that kills the whole
 * scheduler via isKairosCronEnabled).
 */
export function isDurableCronEnabled(): boolean {
  return getFeatureValue_CACHED_WITH_REFRESH(
    'tengu_kairos_cron_durable',
    true,
    KAIROS_CRON_REFRESH_MS,
  )
}

export const CRON_CREATE_TOOL_NAME = 'CronCreate'
export const CRON_DELETE_TOOL_NAME = 'CronDelete'
export const CRON_LIST_TOOL_NAME = 'CronList'

export function buildCronCreateDescription(durableEnabled: boolean): string {
  return durableEnabled
    ? '安排提示在未来时间运）—）可以是按 cron 计划重复，或在特定时间运行一次。传）durable: true 以持久化）.claude/scheduled_tasks.json；否则仅会话级别。
    : '安排提示在此 Claude 会话内的未来时间运行 —）可以是按 cron 计划重复，或在特定时间运行一次。
}

export function buildCronCreatePrompt(durableEnabled: boolean): string {
  const durabilitySection = durableEnabled
    ? `## 持久。

默认情况下（durable: false）任务仅存在于当）Claude 会话）—）不会写入磁盘，Claude 退出后任务消失。传）durable: true 以写）.claude/scheduled_tasks.json 使任务在重启后保留。仅在用户明确要求任务持久化时使）durable: true）每天继续这样））永久设置这个"）。大多数"5 分钟后提醒我"）一小时后回来检）请求应保持会话级别。`
    : `## 仅会。

任务仅存在于当前 Claude 会话）—）不会写入磁盘，Claude 退出后任务消失。`

  const durableRuntimeNote = durableEnabled
    ? '持久化任务会写入 .claude/scheduled_tasks.json 并在会话重启后保）—）下次启动时自动恢复。错）REPL 关闭期间的一次性持久化任务会被 surfaced 以便补做。会话级别任务随进程死亡。
    : ''

  return `安排提示在未来时间入队。用于定期计划和一次性提醒。

使用标准）5 字段 cron，在用户本地时区：分）小时 ））星期）0 9 * * *" 表示本地 9 ）—）不需要时区转换。

## 一次性任务（recurring: false。

用于"）X 提醒）））时间>，做 Y"请求 —）触发一次然后自动删除。
将分）小时/）月固定为特定值：
  "今天下午 2:30 提醒我检查部。 ）cron: "30 14 <今天。 <今天。 *", recurring: false
  "明早运行冒烟测试" ）cron: "57 8 <明天。 <明天。 *", recurring: false

## 定期任务（recurring: true，默认值）

用于"）N 分钟"）每小））工作日上）9 ）请求。
  "*/5 * * * *"（每 5 分钟））0 * * * *"（每小时））0 9 * * 1-5"（工作日上午 9 点本地）

## 当任务允许时，避）:00 ）:30 分钟标记

每个要求"9 ）的用户都会用 \`0 9\`，每个要）每小）的用户都会用 \`0 *\` —）这意味着来自全球的请求会同时到达 API。当用户的请求是近似的，选择一个不）0 ）30 的分钟：
  "每天早上 9 点左。 ）"57 8 * * *" ）"3 9 * * *"（不）"0 9 * * *"。
  "每小。 ）"7 * * * *"（不）"0 * * * *"。
  "大约一小时后，提醒）.." ）选择你到达的任何分钟，不要舍。

仅当用户明确提到那个确切时间且明显是那个意思时才使用分）0 ）30）9:00 ））半点"、与会议协调）。当不确定时，提前或推迟几分）—）用户不会注意到，但整个集群会。

${durabilitySection}

## 运行时行。

任务仅在 REPL 空闲时触发（不在查询中间））{durableRuntimeNote}调度器会在你选择的基础上添加小的确定性抖动：定期任务触发延迟其周期的 10%（最）15 分钟）；落在 :00 ）:30 的一次性任务提前最）90 秒触发。选择非整点分钟仍然是更大的杠杆。

定期任务）${DEFAULT_MAX_AGE_DAYS} 天后自动过期 —）它们最后一次触发然后被删除。这限制了会话生命周期。安排定期任务时告诉用户 ${DEFAULT_MAX_AGE_DAYS} 天的限制。

返回一）job ID，你可以传递给 ${CRON_DELETE_TOOL_NAME}。`
}

export const CRON_DELETE_DESCRIPTION = '）ID 取消预定的定时任。
export function buildCronDeletePrompt(durableEnabled: boolean): string {
  return durableEnabled
    ? `取消之前使用 ${CRON_CREATE_TOOL_NAME} 安排）cron 任务。从 .claude/scheduled_tasks.json（持久化任务）或内存会话存储（仅会话任务）中删除它。`
    : `取消之前使用 ${CRON_CREATE_TOOL_NAME} 安排）cron 任务。从内存会话存储中删除它。`
}

export const CRON_LIST_DESCRIPTION = '列出已安排的定时任务'
export function buildCronListPrompt(durableEnabled: boolean): string {
  return durableEnabled
    ? `列出通过 ${CRON_CREATE_TOOL_NAME} 安排的所）cron 任务，包括持久化）claude/scheduled_tasks.json）和仅会话的任务。`
    : `列出通过 ${CRON_CREATE_TOOL_NAME} 在此会话中安排的所）cron 任务。`
}
