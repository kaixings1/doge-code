package com.dogecode.mobile

/**
 * 连接韧性策略（纯逻辑，可单测）。
 *
 * ## 要解决的真实痛点
 *
 * 用户报告：拔掉 USB 后 App 一直连不上。`127.0.0.1:5680` 只在 USB 转发存在时
 * 可达，拔线后**该地址永不可达**，但 App 会一直重试它 —— 且**不会主动切到
 * 局域网里已发现的会话**。表现为「程序卡死在失效地址」。
 *
 * 根因：原逻辑在发现到局域网会话后，只在「恰好只有 1 个会话」时由 AutoConnect
 * 自动连。但若发现 0 个或多个，或保存的地址仍是 `127.0.0.1`，App 就停在那儿
 * 反复重试失效地址，没有任何「放弃失效地址」的机制。
 *
 * ## 本类的职责
 *
 * 给定「当前保存的地址」与「本次发现到的会话列表」，判断：
 * - 当前地址已失效（回环但无 USB 转发）时，是否应切到发现的局域网会话；
 * - 若有多个候选，给出「请用户选择」而非乱猜。
 *
 * 只做决策，不做 IO（切地址的动作由调用方执行）。
 */
object ConnectionStrategy {

    /**
     * 地址是否「可能已失效的回环地址」。
     *
     * 回环地址在手机上**只有 USB 转发场景**才可达。一旦 USB 断开或转发丢失，
     * 它就永远连不上。故「保存的是回环地址 + 连接失败」是强信号：该地址已失效，
     * 应优先尝试发现的局域网会话。
     *
     * **覆盖整个 `127.0.0.0/8`**（而非仅 `127.0.0.1`）：该网段整段都是回环，
     * 用户完全可能填 `127.0.0.2`、`127.1.1.1` 等（都是合法回环，且同样只在
     * USB 转发下可达）。若只认字面量 `127.0.0.1`，这些地址会被判成「正常
     * 局域网地址」→ 走 [decide] 的 `RetrySaved` 分支永不切换 →
     * **恰好卡死在该模块本要解决的失效地址上**。
     */
    fun isLikelyDeadLoopback(host: String): Boolean {
        val h = host.trim().lowercase()
        if (h == "localhost") return true
        // IPv6 回环：可带方括号（URL 字面量形式）
        if (h == "::1" || h == "[::1]") return true
        // IPv4：整个 127.0.0.0/8 都是回环段
        return h == "127.0.0.1" || h.startsWith("127.")
    }

    /**
     * 决定连接失败后下一步做什么。
     *
     * @param savedHost   当前保存的连接主机（如 "127.0.0.1"）
     * @param savedPort   当前保存的端口
     * @param discovered  本次发现到的会话（广播 + 扫描合并后）
     * @param failedAttempts 连续失败次数（用于判断「已确认失效」）
     * @return 决策：切到某个发现地址 / 让用户选 / 继续重试当前地址
     */
    fun decide(
        savedHost: String,
        savedPort: Int,
        discovered: List<SessionScanner.Session>,
        failedAttempts: Int,
    ): Decision {
        // 仅当已多次失败才考虑放弃当前地址 —— 单次抖动不该触发切换
        val confirmedDead = failedAttempts >= 2

        // 当前地址不是回环（可能是正常局域网地址）→ 先别乱切，
        // 继续重试它（可能是临时网络抖动）
        if (!isLikelyDeadLoopback(savedHost)) {
            return Decision.RetrySaved
        }

        // 当前是回环地址：它已极可能失效。看发现结果里有没有别的地址
        val others = discovered.filter { !isLikelyDeadLoopback(it.host) }
        return when {
            // 仍未发现任何局域网会话：无路可走，只能继续重试回环（等 USB 重连）
            !confirmedDead -> Decision.RetrySaved
            others.isEmpty() -> Decision.RetrySaved
            // 恰好发现一个局域网会话：直接建议切过去（无歧义）
            others.size == 1 -> Decision.SwitchTo(others[0])
            // 多个：不猜，让用户选（连错比不切更烦）
            else -> Decision.ChooseFrom(others)
        }
    }

    sealed interface Decision {
        /** 继续重试当前保存的地址（不切换）。 */
        object RetrySaved : Decision

        /** 切换到发现的会话（地址已失效，且只有一个明确候选）。 */
        data class SwitchTo(val session: SessionScanner.Session) : Decision

        /** 发现多个候选，让用户手动选（不自动连错）。 */
        data class ChooseFrom(val sessions: List<SessionScanner.Session>) : Decision
    }
}
