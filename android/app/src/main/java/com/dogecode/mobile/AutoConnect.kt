package com.dogecode.mobile

/**
 * 自动连接策略（纯逻辑，可单测）。
 *
 * ## 为什么需要「策略」而不是「发现了就连」
 *
 * 最朴素的实现是「发现会话就连」，但它有三个会让人恼火的问题：
 *
 * 1. **连错**：发现 3 个会话时连了第 1 个，而用户想要第 3 个 ——
 *    他还得先断开再切，比不自动连更麻烦
 * 2. **断不掉**：用户手动断开后，下次广播又把它连回来 ——
 *    用户会以为「断不开、程序有 bug」
 * 3. **打断输入**：用户正在填地址/改配置，突然被切到别的会话
 *
 * 故策略是：**只有一个会话时才自动连**（无歧义），多个时列出让用户选。
 * 这是「宁可不自动，也不连错」的取舍。
 *
 * ## 为什么抽成纯逻辑
 *
 * 判据涉及多个状态的组合（已连接？用户手动断过？只有一个？），
 * 且错了的表现是「该连不连」或「不该连连上」——都不会报错。
 */
object AutoConnect {

    /**
     * 是否应自动连接。
     *
     * @param enabled 用户是否开启「自动连接」（默认开）
     * @param candidates 发现的会话（合并广播与扫描后的完整列表）
     * @param alreadyConnected 当前是否已连接（已连则不重复连）
     * @param userDisconnected 用户是否手动断开过
     *   （**关键**：为真时不再自动连，否则用户无法断开）
     * @param currentPort 当前已配置的端口（若候选里有它，说明无需切换）
     */
    fun shouldConnect(
        enabled: Boolean,
        candidates: List<SessionScanner.Session>,
        alreadyConnected: Boolean,
        userDisconnected: Boolean,
        currentPort: Int? = null,
    ): Decision {
        if (!enabled) return Decision.Skip("自动连接已关闭")
        if (alreadyConnected) return Decision.Skip("已连接")
        // 用户主动断开后不自动连回 —— 否则「断开」这个动作没有意义
        if (userDisconnected) return Decision.Skip("用户已手动断开")
        if (candidates.isEmpty()) return Decision.Skip("未发现会话")
        if (candidates.size > 1) {
            // 多个候选时**不猜**：连错比不连更烦
            return Decision.Skip("发现 ${candidates.size} 个会话，请手动选择")
        }

        val only = candidates.first()
        // 候选恰是当前配置的那个端口：说明上次就是这个，直接连
        if (currentPort != null && only.port == currentPort) {
            return Decision.Connect(only, "恢复上次的会话")
        }
        return Decision.Connect(only, "自动连接唯一会话")
    }

    /** 决策结果。 */
    sealed interface Decision {
        data class Connect(val session: SessionScanner.Session, val reason: String) : Decision
        data class Skip(val reason: String) : Decision

        /**
         * 便捷取会话（跳过时返回 null）。
         *
         * 命名为 `connectedSession` 而非 `session`：后者会与
         * [Connect.session] 同名，编译器报「hides member of supertype」。
         */
        val connectedSession: SessionScanner.Session?
            get() = (this as? Connect)?.session
    }

    /**
     * 多个候选时的提示文案。
     *
     * 明确说「发现 N 个，请选择」而不是静默什么都不做 ——
     * 后者会让用户以为自动连接没生效。
     */
    fun multiSessionHint(count: Int): String = "发现 $count 个会话，点选要连接的一个"

    /** 自动连接偏好的默认值（`object` 直接用顶层常量，不需要 companion）。 */
    const val DEFAULT_ENABLED = true
}
