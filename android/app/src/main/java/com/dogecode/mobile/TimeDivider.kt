package com.dogecode.mobile

import java.util.Calendar
import java.util.Locale

/**
 * 消息时间分隔线的判据（纯逻辑，可单测）。
 *
 * 问题：长对话里消息只有各自的时间戳，但看不出「中间隔了多久」——
 * 用户回看时无法分辨「这些是刚才连着聊的」还是「这是昨天的事」。
 *
 * 做法：在**时间跨度足够大**的两条消息之间插一条分隔线，
 * 显示「今天 14:30」「昨天」「3 天前」「2026-08-01」这类相对标签。
 *
 * 为什么需要「足够大」这个阈值：逐条插分隔线会把列表切得七零八落
 * （每一行都顶着一条线，反而更难读）。只在真正有跨度的地方插。
 */
object TimeDivider {

    /**
     * 两条消息间隔超过该值时插分隔线。
     *
     * 取 30 分钟：同一次对话的连续性提问通常在这个尺度内，
     * 超过它多半意味着「放下手机又拿起来」，此时标一下时间有信息量。
     * 太小（如 5 分钟）会在正常对话中插一堆线；太大（如 4 小时）
     * 则一天之内的上下文切换都标不出来。
     */
    const val GAP_MS = 30 * 60 * 1000L

    /**
     * 判断下标 [index] 的消息之前是否应插分隔线。
     *
     * 规则：
     * 1. 首条消息前不插（没有「间隔」可言，凭空一条线很奇怪）
     * 2. 与**前一条**的时间差超过 [GAP_MS] 才插
     * 3. 前一条时间戳为 0（旧数据缺时间）时**不插** —— 0 会让差值
     *    变得极大而误插，宁可漏也不要在每条旧消息前都插一条
     *
     * @param timestamps 整个列表的时间戳（升序）
     */
    fun shouldDivide(timestamps: List<Long>, index: Int): Boolean {
        if (index <= 0 || index >= timestamps.size) return false
        val prev = timestamps[index - 1]
        val cur = timestamps[index]
        // 旧数据缺时间戳 → 不做判断（见规则 3）
        if (prev <= 0 || cur <= 0) return false
        return cur - prev > GAP_MS
    }

    /**
     * 分隔线的展示文案。
     *
     * 相对化优先：用户关心的是「多久以前」，而不是精确到秒的时间。
     * 判据基于**日历日**而非 24 小时差值 —— 「昨天 23:00 到 今天 01:00」
     * 只隔 2 小时却已跨日，按 24 小时算会说成「今天」，反直觉。
     *
     * @param ts 消息时间戳
     * @param now 当前时间（注入以便单测）
     */
    fun label(ts: Long, now: Long = System.currentTimeMillis()): String {
        if (ts <= 0) return ""
        val days = calendarDaysBetween(ts, now)
        val hm = String.format(Locale.US, "%02d:%02d", hourOf(ts), minuteOf(ts))
        return when {
            days <= 0L -> "今天 $hm"
            days == 1L -> "昨天 $hm"
            days < 7L -> "$days 天前"
            // 超过一周用日期：说「23 天前」用户还得自己换算
            else -> dateOf(ts)
        }
    }

    /**
     * 两个时间戳相差几个**日历日**（按本地时区，忽略时刻）。
     *
     * 用 Calendar 归零到当天 0 点再相减：直接相除 86400000 会因为
     * 时区偏移与夏令时算出错误的天数（例如相差 23 小时可能跨了一天
     * 却算成 0 天）。
     */
    private fun calendarDaysBetween(a: Long, b: Long): Long {
        val ca = Calendar.getInstance().apply {
            timeInMillis = a
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val cb = Calendar.getInstance().apply {
            timeInMillis = b
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        return (cb.timeInMillis - ca.timeInMillis) / 86_400_000L
    }

    private fun hourOf(ts: Long) = Calendar.getInstance().apply { timeInMillis = ts }
        .get(Calendar.HOUR_OF_DAY)

    private fun minuteOf(ts: Long) = Calendar.getInstance().apply { timeInMillis = ts }
        .get(Calendar.MINUTE)

    private fun dateOf(ts: Long): String {
        val c = Calendar.getInstance().apply { timeInMillis = ts }
        return String.format(
            Locale.US,
            "%04d-%02d-%02d",
            c.get(Calendar.YEAR),
            c.get(Calendar.MONTH) + 1,
            c.get(Calendar.DAY_OF_MONTH),
        )
    }
}
