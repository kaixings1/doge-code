package com.dogecode.mobile

/**
 * 地址历史：记录用过的服务端地址，供快速切换。
 *
 * 为什么抽成独立类而非留在 MainActivity：
 * · 逻辑是纯字符串处理（去重、置顶、裁剪），**零 Android 依赖**，可单测
 * · 此前这段夹在 1445 行的 MainActivity 里，无法单独验证
 * · USB(127.0.0.1) 与局域网(192.168.x.x) 地址完全不同，来回切换很常见，
 *   而手打地址出错的表现是「连不上」—— 用户很难意识到是自己少打一位
 *
 * 存储格式：换行分隔的字符串（SharedPreferences 存不下数组）。
 * 用换行而非逗号/JSON：地址里不会出现换行，但可能出现逗号（IPv6 不会，
 * 但用户可能粘贴带查询参数的 URL），换行最安全且人眼可读。
 */
object HostHistory {

    /** 保留条数上限。列表太长就失去「快速切换」的意义。 */
    const val MAX_HOSTS = 8

    /**
     * 把地址并入历史：去重后置顶，超限丢最旧。
     *
     * @return 新列表（不修改入参）
     */
    fun remember(existing: List<String>, url: String, max: Int = MAX_HOSTS): List<String> {
        val trimmed = url.trim()
        if (trimmed.isEmpty()) return existing
        // 去掉重复项再置顶：用户在两个地址间来回切时不会堆积重复条目
        val rest = existing.filterNot { it == trimmed }
        return (listOf(trimmed) + rest).take(max)
    }

    /** 序列化（换行分隔）。 */
    fun serialize(hosts: List<String>): String = hosts.joinToString("\n")

    /**
     * 反序列化。
     *
     * 容忍脏数据：空行/首尾空白一律丢弃 —— 手工改过配置文件、
     * 或旧版本用别的格式存过，都不该让整个列表解析失败。
     */
    fun parse(raw: String?): List<String> {
        if (raw.isNullOrBlank()) return emptyList()
        return raw.split("\n").map { it.trim() }.filter { it.isNotEmpty() }
    }
}
