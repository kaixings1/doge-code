package com.dogecode.mobile

import android.content.Context

/**
 * 局域网扫描的**主机号范围**设定（如仅扫 `192.168.0.100` ~ `.130`）。
 *
 * ## 为什么需要它（真机实测驱动）
 *
 * [LanScanner] 默认对每个本机网卡生成整段 /24 候选。真机实测本机有
 * 3 个网卡（WiFi `192.168.0.x` + VMware `192.168.26.x` + Tailscale
 * `100.99.x`），共 **762 个候选 IP** —— 在原来的 20s deadline 内扫不完，
 * 靠后的 IP 被静默截断（实测 6011/6012 就是被漏掉的）。
 *
 * 收窄主机号范围是最有效的降本手段：只扫 100~130 就把候选从 254 降到 31，
 * 单网段耗时降到约 1/8。真实部署里电脑的 DHCP 租约多落在这一段。
 *
 * ## 为什么默认 100-130 而不是 1-254
 *
 * 用户明确要求「从 100 到 130 之间搜索，不要从 2 开始」。理由充分：
 * 家用路由的 DHCP 池通常从 100 起分配（1~99 多留给静态设备），
 * 扫 1~99 绝大多数是浪费。范围仍可配置，用户可按自己网络的实际情况调整。
 *
 * ## 与 [ScanPortPrefs] 的关系
 *
 * 两者独立：端口范围管「探哪些端口」，本类管「探哪些主机号」。
 * `parseRange` 复用 [ScanPortPrefs.parseRange]（同一套格式解析，
 * 避免两份实现漂移）。
 */
class IpRangePrefs(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** 读取主机号范围（已规范化）。 */
    fun range(): Pair<Int, Int> = normalize(
        prefs.getInt(KEY_FROM, DEFAULT_FROM),
        prefs.getInt(KEY_TO, DEFAULT_TO),
    )

    /**
     * 写入主机号范围（先规范化再存，理由同 [ScanPortPrefs.setRange]）。
     * @return 实际保存的 (from, to)
     */
    fun setRange(from: Int, to: Int): Pair<Int, Int> {
        val (f, t) = normalize(from, to)
        prefs.edit().putInt(KEY_FROM, f).putInt(KEY_TO, t).apply()
        return f to t
    }

    /** 恢复默认范围。 */
    fun reset() {
        prefs.edit().putInt(KEY_FROM, DEFAULT_FROM).putInt(KEY_TO, DEFAULT_TO).apply()
    }

    companion object {
        private const val PREFS = "doge_mobile_scan"
        private const val KEY_FROM = "scan_ip_from"
        private const val KEY_TO = "scan_ip_to"

        /** 默认下界：100（家用 DHCP 池起始处）。 */
        const val DEFAULT_FROM = 100
        /** 默认上界：130（覆盖常见 DHCP 分配区间）。 */
        const val DEFAULT_TO = 130

        /**
         * 规范化主机号范围。**纯函数，可单测**。
         *
         * 规则（每条都有明确理由）：
         * - 越界（<1 或 >254）→ 夹到 1..254：主机号合法值只有 1..254
         *   （0 是网络地址、255 是广播地址）。
         * - 倒置（from > to）→ 互换：用户填反了应当纠正而非拒绝。
         * - 结果是空段（理论上不会，因夹取后 from<=to）→ 回落默认。
         *
         * @return 规范化后的 (from, to)
         */
        fun normalize(from: Int, to: Int): Pair<Int, Int> {
            var f = from.coerceIn(1, 254)
            var t = to.coerceIn(1, 254)
            if (f > t) { val tmp = f; f = t; t = tmp }
            if (f == t) {
                // 单值范围（如 100-100）合法但极少用；不特殊处理，原样返回。
                return f to t
            }
            return f to t
        }

        /** 把范围渲染为输入框文本（与 [ScanPortPrefs.parseRange] 互逆）。 */
        fun formatRange(from: Int, to: Int): String = "$from-$to"
    }
}
