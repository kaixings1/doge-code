package com.dogecode.mobile

/**
 * 连接失败时的可操作提示（纯逻辑，可单测）。
 *
 * ## 为什么需要它
 *
 * 之前的失败提示是「已断开，重连中…」——**用户只能干等**，
 * 而真实原因往往是他无法从界面推断的：
 *
 * 1. **USB 转发丢失**：`adb reverse tcp:5680 tcp:5680` 建立的转发是
 *    **内存态**，拔插 USB / 设备重连 / adb 服务重启都会清掉。
 *    此时 `127.0.0.1:5680` 必然连不上，而 App 会一直重试它 ——
 *    用户以为「程序坏了」，实际只需在电脑上重跑一条命令。
 *
 * 2. **USB 与 WiFi 地址混用**：`127.0.0.1` 只在 USB 场景有效，
 *    局域网场景必须用电脑的真实 IP。用户不会知道这个区别。
 *
 * 3. **端口被占满**：多开窗口时端口顺延，若超出扫描范围就找不到。
 *
 * 这些原因**从界面完全看不出**，故必须把「怎么排查」直接说出来。
 * 抽成纯逻辑以便单测：判据涉及地址形态与错误类型，易错且错了只是
 * 「提示不准确」，不会报错。
 */
object ConnectionHint {

    /**
     * 根据「连接目标地址」与「失败原因」给出可操作提示。
     *
     * @param address 当前尝试连接的地址（如 `http://127.0.0.1:5680`）
     * @param failedAttempts 已连续失败次数（用于决定提示的强度）
     * @return 面向用户的提示；无需提示时返回 null
     */
    fun hintFor(address: String, failedAttempts: Int): String? {
        // 首次失败不提示：瞬时抖动很常见，一失败就弹提示是噪音。
        // 连续 2 次以上才认为「真的有问题」。
        if (failedAttempts < 2) return null

        return if (isLoopback(address)) {
            // 回环地址 = USB 转发场景。连不上几乎必然是转发没建
            "USB 连接不可用。请在电脑上执行：\n" +
                "adb reverse tcp:5680 tcp:5680\n\n" +
                "（拔插数据线、重启 adb 后转发会失效，需重新执行）\n" +
                "或改用局域网地址：让电脑与手机连同一 WiFi，" +
                "在「会话」页扫描即可发现。"
        } else {
            // 非回环 = 局域网场景。常见原因是不同网段/防火墙/AP 隔离
            "连接不上 $address。请检查：\n" +
                "1. 电脑与手机在同一 WiFi（不同网段无法互相访问）\n" +
                "2. 电脑防火墙放行端口（Windows 首次监听会弹窗询问）\n" +
                "3. 路由器是否开启了「AP 隔离」（会禁止设备互访）"
        }
    }

    /**
     * 是否是回环地址（USB 转发场景）。
     *
     * 覆盖 `127.0.0.1` / `localhost` / `::1` / `[::1]`。
     */
    fun isLoopback(address: String): Boolean {
        val a = address.lowercase()
        return a.contains("127.0.0.1") ||
            a.contains("localhost") ||
            a.contains("[::1]") ||
            a.contains("::1")
    }

    /**
     * 多会话提示用的「是否建议去会话页」判据。
     *
     * 场景：App 启动时连接失败。若用户从未打开过「会话」页，
     * 自动发现（广播/扫描）根本没跑过 —— 应引导他去一次。
     */
    fun shouldSuggestDiscovery(failedAttempts: Int): Boolean = failedAttempts >= 2

    /**
     * 「正在发现会话」时的等待提示。
     *
     * ## 为什么需要（基于实测数据）
     *
     * 实测：**CLI 启动到首条广播需要 13.3 秒**（需先加载 7487 个模块），
     * 之后每 3 秒一条。用户重启 CLI 后盯着手机等待，若界面毫无反馈，
     * 13 秒足够让人判定「又没生效」并放弃。
     *
     * 明确说出「要等十几秒」和「已经过了一半」，用户才愿意等。
     *
     * @param elapsedMs 已等待时长
     * @return 提示文案；尚未到需要提示的时长时返回 null
     */
    fun waitingHint(elapsedMs: Long): String? {
        if (elapsedMs < WAIT_HINT_AFTER_MS) return null
        val secs = elapsedMs / 1000
        return if (elapsedMs < CLI_STARTUP_MS) {
            "正在搜索会话…（已等 ${secs}秒）\n" +
                "若刚启动电脑上的 CLI，它需要约 ${CLI_STARTUP_MS / 1000} 秒" +
                "加载完才会开始广播，请稍候。"
        } else {
            "仍在搜索会话…（已等 ${secs}秒）\n" +
                "若电脑上的 CLI 已启动，请确认：\n" +
                "1. 手机与电脑在同一 WiFi\n" +
                "2. 或已建立 USB 转发：adb reverse tcp:5680 tcp:5680"
        }
    }

    /**
     * 超过这个时长才开始提示「等待中」。
     *
     * 取 3 秒：小于广播间隔（3 秒）+ 一点余量 —— 若 3 秒内就发现了
     * 会话，这条提示根本不会显示（不该让用户看到一闪而过的文字）。
     */
    const val WAIT_HINT_AFTER_MS = 3_000L

    /**
     * CLI 启动到开始广播的实测耗时。
     *
     * **实测值 13.3 秒**（加载 7487 个模块约 10 秒 + 首次广播）。
     * 取 15 秒作为阈值：超过它就不再为 CLI 开脱，转而怀疑网络配置。
     */
    const val CLI_STARTUP_MS = 15_000L

    /** 生成提示的失败次数阈值（`object` 直接用顶层常量，不需要 companion）。 */
    const val HINT_THRESHOLD = 2
}
