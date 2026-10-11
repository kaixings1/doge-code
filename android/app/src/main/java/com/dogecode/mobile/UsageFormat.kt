package com.dogecode.mobile

import java.util.Locale

/**
 * 用量数据的展示格式（纯函数，可单测）。
 *
 * 为什么抽出来：这是「看起来简单、写错很隐蔽」的典型 ——
 * 数字单位换算（k/M）、时长进位（秒/分）、千分位，每一处都容易
 * 在边界上出错，而错了只是「显示得怪」，不会报错。
 *
 * 口径与 CLI 状态栏保持一致（累计值），否则用户会发现
 * 「手机和电脑显示的对不上」而怀疑数据是错的。
 */
object UsageFormat {

    /** 1k 起用 k，1M 起用 M；小于 1000 显示原数。 */
    fun tokens(n: Int): String = when {
        n < 1_000 -> n.toString()
        n < 1_000_000 -> {
            // 一位小数；整数时省略小数（12.0k → 12k），避免视觉噪音
            val k = n / 1000.0
            if (k == k.toLong().toDouble()) "${k.toLong()}k"
            else String.format(Locale.US, "%.1fk", k)
        }
        else -> {
            val m = n / 1_000_000.0
            if (m == m.toLong().toDouble()) "${m.toLong()}M"
            else String.format(Locale.US, "%.1fM", m)
        }
    }

    /**
     * 时长：小于 60 秒显示「8.3s」，超过显示「1m23s」。
     *
     * 为什么小于 60 秒保留一位小数：跑 8.3 秒和 8 秒的体验差异
     * 用户是感觉得到的，整数会抹掉这个信息；而超过一分钟后
     * 小数已无意义（谁在乎是 83.2 秒还是 83 秒）。
     */
    fun duration(ms: Long): String {
        // 0 与负数统一返回 "0s"：显示 "0.0s" 会让人以为真的跑了 0 秒
        //（实际是「未记录时长」），而不带小数的 0s 更像个明确的空值。
        if (ms <= 0) return "0s"
        val totalSec = ms / 1000.0
        return if (totalSec < 60) {
            String.format(Locale.US, "%.1fs", totalSec)
        } else {
            val m = (totalSec / 60).toInt()
            val s = (totalSec % 60).toInt()
            "${m}m${s}s"
        }
    }

    /** 成本：0 时返回空串（不显示「$0.00」这种无信息量的内容）。 */
    fun cost(usd: Double): String {
        if (usd <= 0.0) return ""
        // 极小额也保留 4 位，否则一次对话显示成 $0.00 让人以为没计费
        return if (usd < 0.01) String.format(Locale.US, "$%.4f", usd)
        else String.format(Locale.US, "$%.3f", usd)
    }

    /**
     * 组装一行完整用量文案，如「12.4k tokens · 8.3s · $0.0231」。
     *
     * tokens 取输入+输出之和（用户关心的是「总共过了多少 token」，
     * 拆开显示对决策没帮助；缓存读取单独不显示 —— 它是省钱项，
     * 展示成消耗会误导）。
     *
     * 成本为 0 时省略该段：模型可能无定价信息，显示 $0.0000 会
     * 让人误以为「免费」。
     */
    fun line(
        inputTokens: Int,
        outputTokens: Int,
        durationMs: Long,
        costUSD: Double,
    ): String {
        val parts = mutableListOf<String>()
        val total = inputTokens + outputTokens
        if (total > 0) parts.add("${tokens(total)} tokens")
        if (durationMs > 0) parts.add(duration(durationMs))
        val c = cost(costUSD)
        if (c.isNotEmpty()) parts.add(c)
        return parts.joinToString(" · ")
    }
}