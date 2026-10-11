package com.dogecode.mobile

/**
 * 会话列表的组织：分组与排序（纯逻辑，可单测）。
 *
 * 为什么需要分组：多机场景（USB 的 127.0.0.1 + 局域网的 192.168.x.x）
 * 平铺在一起时，用户分不清哪个在本机 —— 而「切到本机那个」是最常见的操作。
 *
 * 为什么需要排序：默认按端口升序是**实现视角**（端口是分配出来的），
 * 不是用户视角。用户通常想找「刚用过的那个」（活跃时间）或
 * 「名字认识的那个」（标签）。
 */
object SessionOrganizer {

    /** 排序方式。存 LocalPrefs，故用稳定的字符串值。 */
    enum class Order(val key: String) {
        PORT("port"),
        LABEL("label"),
        ACTIVITY("activity"),
        ;

        companion object {
            fun from(key: String?): Order =
                entries.firstOrNull { it.key == key } ?: PORT
        }
    }

    /** 一个分组（一台主机下的会话）。 */
    data class Group(val host: String, val isLocal: Boolean, val sessions: List<SessionScanner.Session>)

    /**
     * 按主机分组，本机组排最前。
     *
     * 本机优先的理由：USB 反向转发（127.0.0.1）是本项目推荐方式，
     * 也是最不容易出问题的方式（不依赖 WiFi、不需要防火墙）。
     * 把它排在最前，让「连不上时先试 USB」这条排障路径最短。
     *
     * 组内按 [order] 排序。
     */
    fun group(sessions: List<SessionScanner.Session>, order: Order): List<Group> {
        if (sessions.isEmpty()) return emptyList()
        return sessions
            .groupBy { it.host.ifBlank { "未知主机" } }
            .map { (host, list) ->
                Group(
                    host = host,
                    isLocal = list.first().isLocal(),
                    sessions = sort(list, order),
                )
            }
            .sortedWith(
                // 本机在前；同为本地或同为远程时按主机名排序（保证稳定顺序，
                // 否则每次扫描后列表顺序可能不同，用户会以为会话变了）
                compareByDescending<Group> { it.isLocal }.thenBy { it.host },
            )
    }

    /**
     * 排序。
     *
     * 「活跃时间」用的是**降序**（最近在前），其余升序 ——
     * 因为用户找的是「最近的」，而不是「最早的」。
     *
     * 相同键时统一用端口升序兜底：保证稳定，避免每次扫描顺序抖动。
     */
    fun sort(
        sessions: List<SessionScanner.Session>,
        order: Order,
    ): List<SessionScanner.Session> = when (order) {
        Order.PORT -> sessions.sortedBy { it.port }
        Order.LABEL -> sessions.sortedWith(
            // 显式构造 Comparator 再 thenBy：变长参数的 compareBy 配
            // CASE_INSENSITIVE_ORDER 时推断不出 T（Kotlin 的已知限制）
            Comparator<SessionScanner.Session> { a, b ->
                String.CASE_INSENSITIVE_ORDER.compare(a.label, b.label)
            }.thenBy { it.port },
        )
        // 降序：最近活跃在前。lastActivity 为 0（服务端未提供）自然排到最后
        Order.ACTIVITY -> sessions.sortedWith(
            compareByDescending<SessionScanner.Session> { it.lastActivity }.thenBy { it.port },
        )
    }

    /** 主机名的展示文案：本机加标注，让用户一眼看出。 */
    fun hostLabel(host: String, isLocal: Boolean, localSuffix: String): String =
        if (isLocal) "$host · $localSuffix" else host
}
