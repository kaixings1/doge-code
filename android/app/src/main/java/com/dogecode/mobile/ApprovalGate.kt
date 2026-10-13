package com.dogecode.mobile

/**
 * 敏感操作的「事中确认」闸门（吸收自 termux-mcp 的 approval.py）。
 *
 * ## 与 [PermissionRules] 的分工
 *
 * [PermissionRules] 是**事先策略**（"这个工具以后总是允许"），一次设定、
 * 长期生效，粒度是「工具名」。
 * 本类是**事中确认**：对即将执行的具体动作（如某条命令的字面量）当场
 * 请用户确认一次，粒度是「这一次、这一条动作」。两者互补，不重叠：
 * · 事先策略挡的是「反复询问的骚扰」
 * · 事中确认挡的是「白名单内命令的实际破坏」（如 `git push` 到错分支）
 *
 * ## 吸收的关键语义（来自 approval.py）
 *
 * 1. **批准带 TTL**：用户批准某个 action 后，在 TTL 内**同一 action**
 *    不再重复询问 —— 避免模型连发同一命令时反复打扰。
 * 2. **action 归一化**：`key()` 把连续空白折叠，使「内容相同、空格不同」
 *    的命令命中同一条批准。
 * 3. **上限与淘汰**：持有条目有上限，超限淘汰**最早过期**的一条
 *    （approval.py 的 MAX_HELD=16）。防止长期运行累积。
 *
 * ## 为什么是纯逻辑（无 Android 依赖）
 *
 * 与 [PermissionRules.decide] 同一约定：判定逻辑抽成 internal 纯函数，
 * 让单测直接盯着生产代码，而不是复刻一份。真正弹指纹/对话框的
 * Android 实现放在 [ApprovalPrompt]，由调用方注入 —— 这样本类可在
 * JVM 单测里零 Context 运行。
 *
 * ## 判据实测说明（避免"守卫恒真"的坑）
 *
 * `shouldAsk` 的返回必须真实区分两种分支：从未批准 → true；
 * 已批准且在 TTL 内 → false。单测用「批准→立刻问→应为 false」与
 * 「批准→推进时钟超过 TTL→应为 true」两条用例证明它真能区分，
 * 而非恒真/恒假。
 */
object ApprovalGate {

    /** 批准有效期（秒）。与 approval.py 的 TTL_SECONDS=180 一致。 */
    const val TTL_SECONDS = 180

    /** 最多同时持有多少条有效批准。超限淘汰最早过期的一条。 */
    const val MAX_HELD = 16

    /**
     * 把动作归一化为「批准键」：折叠连续空白、去首尾空白。
     *
     * 为什么折叠空白：模型生成的同一条命令，空格数可能不同
     * （`ls  -la` vs `ls -la`），语义相同却会各占一条批准、导致重复询问。
     * 归一化后二者命中同一条。
     */
    internal fun actionKey(action: String?): String =
        (action ?: "").trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")

    /**
     * 是否应当向用户询问。
     *
     * @param action 即将执行的**动作字面量**（如完整命令）
     * @param held 已批准的 action-key → 过期时间戳（毫秒）
     * @param nowMs 当前时间戳（注入以便单测控制时钟）
     * @return true 表示需要询问；false 表示命中有效批准、可静默放行
     */
    internal fun shouldAsk(
        action: String,
        held: Map<String, Long>,
        nowMs: Long,
    ): Boolean {
        val k = actionKey(action)
        if (k.isEmpty()) return true   // 空动作不缓行，一律问
        val until = held[k] ?: return true
        return nowMs >= until          // 已过期（含等于）即需再问
    }

    /**
     * 记录一次批准，返回**更新后**的持有表（不修改入参 —— 纯函数）。
     *
     * 淘汰规则：超过 [MAX_HELD] 时，先清掉所有已过期条目，仍超限则
     * 淘汰**最早过期**的一条（与 approval.py 的 `_prune` + `min(until)` 一致）。
     */
    internal fun grant(
        held: Map<String, Long>,
        action: String,
        nowMs: Long,
        ttlSeconds: Int = TTL_SECONDS,
    ): Map<String, Long> {
        val k = actionKey(action)
        if (k.isEmpty()) return held

        // 先清理已过期
        val alive = held.filterValues { it > nowMs }.toMutableMap()
        alive[k] = nowMs + ttlSeconds * 1000L

        // 仍超限：淘汰最早过期的
        while (alive.size > MAX_HELD) {
            val oldest = alive.minByOrNull { it.value }?.key ?: break
            alive.remove(oldest)
        }
        return alive
    }
}
