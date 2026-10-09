package com.dogecode.mobile

import android.content.Context

/**
 * 会话扫描端口的范围设定（自由数值型偏好）。
 *
 * ## 为什么不放进 LocalPrefs
 *
 * [LocalPrefs] 是**枚举/开关型**设置：它的 `set()` 会校验「值必须在
 * 预定义 options 列表里」，这是它保证「不会有非法值被静默写入」的核心
 * 机制。而端口是 1..65535 的自由数值 —— 硬塞进去要么破坏那道校验、
 * 要么为每个端口造一个选项（荒谬）。两类设置的性质不同，分开存放
 * 比让 LocalPrefs 长出两个维护路径更清楚。
 *
 * ## 为什么需要它
 *
 * 服务端会「起始端口被占用时自动顺延（最多 10 个）」，且起始端口可经
 * `CLAUDE_CODE_MOBILE_PORT` 指定。若用户把起始端口设成 6000，客户端
 * 仍只扫 5680 起就**永远发现不了** —— 表现为「服务明明起来了、手机上
 * 扫不到」，而归因极难（两端各自看都正常）。
 */
class ScanPortPrefs(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** 读取范围（已规范化；用户填的非法值不会传出去）。 */
    fun range(): Pair<Int, Int> = PortScanRange.normalize(
        start = prefs.getInt(KEY_START, PortScanRange.DEFAULT_START),
        end = prefs.getInt(KEY_END, PortScanRange.DEFAULT_END),
    )

    /**
     * 写入范围。
     *
     * **先规范化再存**：把非法值直接拒绝会让用户「点了保存但没生效」
     * 且不知原因；存规范化后的值，界面上再回显实际生效的范围，
     * 用户能立刻看出自己填的哪里不对。
     *
     * @return 实际保存的 (start, end)
     */
    fun setRange(start: Int, end: Int): Pair<Int, Int> {
        val (s, e) = PortScanRange.normalize(start, end)
        prefs.edit().putInt(KEY_START, s).putInt(KEY_END, e).apply()
        return s to e
    }

    /** 恢复默认范围。 */
    fun reset() {
        prefs.edit()
            .putInt(KEY_START, PortScanRange.DEFAULT_START)
            .putInt(KEY_END, PortScanRange.DEFAULT_END)
            .apply()
    }

    companion object {
        private const val PREFS = "doge_mobile_scan"
        private const val KEY_START = "scan_port_start"
        private const val KEY_END = "scan_port_end"

        /**
         * 解析用户输入的「起-止」端口串。**纯函数**，故可单测。
         *
         * 抽出来的理由：设置页的输入框是 Android 控件，难测；而格式解析
         * 是纯字符串处理，是这块逻辑里最易错（分隔符缺失、非数字、多余
         * 空格、倒置）也最该覆盖的部分。
         *
         * 接受的分隔符：半角 `-` 与全角 `－`（中文输入法下极易打出全角，
         * 若不兼容，用户会以为「填了没反应」）。两侧空格容忍。
         *
         * @return 解析出的 (start, end)；格式非法或非数字时返回 null，
         *         由调用方回退到当前生效值（不静默写入垃圾）。
         */
        fun parseRange(text: String): Pair<Int, Int>? {
            val parts = text.trim().split('-', '－').map { it.trim() }
            if (parts.size != 2) return null
            val start = parts[0].toIntOrNull() ?: return null
            val end = parts[1].toIntOrNull() ?: return null
            return start to end
        }

        /** 把范围渲染为输入框文本（与 [parseRange] 互逆）。 */
        fun formatRange(start: Int, end: Int): String = "$start-$end"
    }
}
