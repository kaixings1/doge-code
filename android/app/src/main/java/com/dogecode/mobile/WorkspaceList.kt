package com.dogecode.mobile

/**
 * 多工作区列表的纯逻辑（M4）。
 *
 * ## 为什么抽成独立 object
 *
 * 与 [HostHistory] 同一模式：列表操作（去重置顶/切换/移除/序列化）全是
 * 纯字符串处理，零 Android 依赖。这些操作错了**全部是静默的**：
 * - 「切换」写成追加 → 用户点切换后列表越来越长，当前项却没变
 * - 「移除当前项」丢错了方向 → 用户的工作区莫名其妙消失
 * - 序列化丢空行 → 手改过的配置文件读不出
 * 故必须可单测（[LocalPrefsStore] 依赖 Context，测不了）。
 */
object WorkspaceList {

    /** 列表上限（超出丢最旧）。太长失去「快速切换」的意义。 */
    const val MAX = 8

    /**
     * 解析存储字符串。
     *
     * 容忍脏数据：空行/首尾空白一律丢弃（手改配置文件不该让列表解析失败）。
     */
    fun parse(raw: String?): List<String> {
        if (raw.isNullOrBlank()) return emptyList()
        return raw.split("\n").map { it.trim() }.filter { it.isNotEmpty() }
    }

    /** 序列化（换行分隔）。 */
    fun serialize(list: List<String>): String =
        list.joinToString("\n")

    /**
     * 添加（或置顶）一个工作区。
     *
     * 已存在时**置顶**而非重复 —— 用户重复选同一目录的意图是「切过去」。
     * 超过 [MAX] 丢最旧的（新加的在首位，丢的是尾部）。
     */
    fun add(list: List<String>, path: String): List<String> {
        val p = path.trim()
        if (p.isEmpty()) return list
        return (listOf(p) + list.filterNot { it == p }).take(MAX)
    }

    /**
     * 把列表中已有的一项切为当前（置顶）。
     *
     * **只在列表内找**：传入不在列表中的路径时原样返回（调用方据
     * 「首位没变」判断失败）。
     */
    fun switchTo(list: List<String>, path: String): List<String> {
        if (path !in list) return list
        return listOf(path) + list.filterNot { it == path }
    }

    /** 移除一项（不存在时原样返回）。移除当前项后首位即新的当前。 */
    fun remove(list: List<String>, path: String): List<String> =
        list.filterNot { it == path }
}
