import { feature } from 'bun:bundle'
import { getFeatureValue_CACHED_WITH_REFRESH } from '../../services/analytics/growthbook.js'
import { DEFAULT_CRON_JITTER_CONFIG } from '../../utils/cronTasks.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

const KAIROS_CRON_REFRESH_MS = 5 * 60 * 1000

export const DEFAULT_MAX_AGE_DAYS =
  DEFAULT_CRON_JITTER_CONFIG.recurringMaxAgeMs / (24 * 60 * 60 * 1000)

/**
 * 定时调度系统的统一开关。结合了编译时的 `feature('AGENT_TRIGGERS')` 标志（死代码消除）
 * 与运行时的 `tengu_kairos_cron` GrowthBook 开关，刷新窗口为 5 分钟。
 *
 * AGENT_TRIGGERS 可以独立于 KAIROS 发布 —— 定时模块的依赖图
 * （cronScheduler/cronTasks/cronTasksLock/cron.ts + 三个工具 + /loop 技能）
 * 完全没有导入 src/assistant/ 中的任何内容，也没有调用 feature('KAIROS')。
 * REPL.tsx 中对 kairosEnabled 的读取是安全的：
 * kairosEnabled 无条件存在于 AppStateStore 中，默认值为 false，
 * 因此当 KAIROS 关闭时，调度器只会收到 assistantMode: false。
 *
 * 从 Tool.isEnabled()（延迟，初始化后调用）和 useEffect / 命令式设置中调用，
 * 绝不在模块作用域调用 —— 因此磁盘缓存有机会预先填充。
 *
 * 默认值为 `true` —— /loop 已正式发布（在更新日志中公告）。GrowthBook
 * 在 Bedrock/Vertex/Foundry 环境下以及设置了 DISABLE_TELEMETRY /
 * CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC 时会被禁用；若默认为 `false` 将
 * 导致这些用户无法使用 /loop（GH #31759）。现在 GB 开关仅用作全舰队级别的
 * 紧急熔断 —— 将其设为 `false` 会停止已在运行的调度器（在其下一次 isKilled 轮询时），
 * 而不仅仅是阻止新建。
 *
 * `CLAUDE_CODE_DISABLE_CRON` 是本地覆盖选项，优先级高于 GB。
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
 * 磁盘持久化（持久）定时任务的紧急熔断开关。比 {@link isKairosCronEnabled} 更窄 ——
 * 关闭此开关会在 call() 处强制设置 `durable: false`，而仅会话期间的定时任务（内存中，已 GA）
 * 不受影响。
 *
 * 默认值为 `true`，这样 Bedrock/Vertex/Foundry 以及设置了 DISABLE_TELEMETRY 的用户
 * 也能获得持久化定时任务。此开关**不参考** CLAUDE_CODE_DISABLE_CRON（后者通过
 * isKairosCronEnabled 关闭整个调度器）。
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
    ? '安排一条提示在将来某个时间运行 —— 可以是按 cron 表达式重复执行，也可以是在特定时间执行一次。传入 durable: true 可将任务持久化到 .claude/scheduled_tasks.json 文件中；否则仅本次会话有效。'
    : '安排一条提示在当前 Claude 会话中的将来某个时间运行 —— 可以是按 cron 表达式重复执行，也可以是在特定时间执行一次。'
}

export function buildCronCreatePrompt(durableEnabled: boolean): string {
  const durabilitySection = durableEnabled
    ? `## 持久性

默认情况下（durable: false）任务仅存在于当前 Claude 会话中 —— 不会写入磁盘，Claude 退出后任务即消失。传入 durable: true 会将任务写入 .claude/scheduled_tasks.json 文件，使其在重启后依然存在。仅当用户明确要求任务持久化（例如“每天都这样做”、“永久设置这个”）时才使用 durable: true。大多数“5 分钟后提醒我”或“一小时后再检查一下”这类请求应保持仅会话有效。`
    : `## 仅会话有效

任务仅存在于当前 Claude 会话中 —— 不会写入磁盘，Claude 退出后任务即消失。`

  const durableRuntimeNote = durableEnabled
    ? '持久化任务会保存到 .claude/scheduled_tasks.json 并在会话重启后依然存在 —— 下次启动时它们会自动恢复。在 REPL 关闭期间错过的单次持久任务会被提取出来供用户追赶处理。仅会话有效的任务会随进程终止而消失。'
    : ''

  return `安排一条提示在将来某个时间加入队列执行。适用于重复性计划和单次提醒。

使用基于用户本地时区的标准 5 字段 cron 表达式：分 时 日 月 周。例如 "0 9 * * *" 表示本地时间上午 9 点 —— 无需进行时区转换。

## 单次任务（recurring: false）

用于“在 X 时间提醒我”或“在 <时间> 做 Y”这类请求 —— 触发一次后自动删除。
将分钟/小时/日期/月份字段固定为具体值：
  “今天下午 2:30 提醒我检查部署” → cron: "30 14 <今天日期> <当前月份> *"，recurring: false
  “明天早上运行冒烟测试” → cron: "57 8 <明天日期> <明天月份> *"，recurring: false

## 重复任务（recurring: true，默认值）

用于“每 N 分钟” / “每小时” / “工作日早上 9 点”这类请求：
  “*/5 * * * *”（每 5 分钟），“0 * * * *”（每小时），“0 9 * * 1-5”（工作日本地时间上午 9 点）

## 如果任务允许，避免使用 :00 和 :30 分钟点

每个要求“9 点”的用户都会得到 \`0 9\`，每个要求“每小时”的用户都会得到 \`0 *\` —— 这意味着来自全球的请求会同时涌向 API。当用户的要求较为宽松时，选择一个**不是** 0 或 30 的分钟数：
  “每天早上 9 点左右” → “57 8 * * *” 或 “3 9 * * *”（不要用 “0 9 * * *”）
  “每小时” → “7 * * * *”（不要用 “0 * * * *”）
  “大约一小时后提醒我……” → 就选你当前碰到的分钟数，不要凑整

只有当用户明确指定了精确时间且意图清晰（例如“9 点整”、“半点准时”、配合会议安排）时才使用 0 或 30 分钟。如果不确定，就提前或推迟几分钟 —— 用户不会察觉，但整个服务集群会受益。

${durabilitySection}

## 运行时行为

任务仅在 REPL 空闲时（非查询进行中）触发。${durableRuntimeNote}调度器会在您选择的时间基础上叠加一个很小的确定性抖动：重复任务最多延迟其周期时长的 10% 触发（上限 15 分钟）；落在 :00 或 :30 分钟点的单次任务会提前最多 90 秒触发。但选择一个非整点分钟数依然是更有效的手段。

重复任务会在 ${DEFAULT_MAX_AGE_DAYS} 天后自动过期 —— 它们会触发最后一次执行，然后被删除。这限制了会话的生命周期。在安排重复任务时，请告知用户这个 ${DEFAULT_MAX_AGE_DAYS} 天的限制。

返回一个任务 ID，可用于 ${CRON_DELETE_TOOL_NAME} 工具。`
}

export const CRON_DELETE_DESCRIPTION = '按 ID 取消预定的定时任务'
export function buildCronDeletePrompt(durableEnabled: boolean): string {
  return durableEnabled
    ? `取消之前通过 ${CRON_CREATE_TOOL_NAME} 安排的定时任务。会将其从 .claude/scheduled_tasks.json 文件（持久化任务）或内存会话存储（仅会话任务）中移除。`
    : `取消之前通过 ${CRON_CREATE_TOOL_NAME} 安排的定时任务。会将其从内存会话存储中移除。`
}

export const CRON_LIST_DESCRIPTION = '列出已安排的定时任务'
export function buildCronListPrompt(durableEnabled: boolean): string {
  return durableEnabled
    ? `列出所有通过 ${CRON_CREATE_TOOL_NAME} 安排的定时任务，包括持久化任务（.claude/scheduled_tasks.json）和仅会话任务。`
    : `列出当前会话中所有通过 ${CRON_CREATE_TOOL_NAME} 安排的定时任务。`
}