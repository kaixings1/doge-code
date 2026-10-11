package com.dogecode.mobile

/**
 * 对话搜索的匹配逻辑（纯函数，可单测）。
 *
 * 为什么抽出来：搜「有没有搜到、在第几个、下一个在哪」这套逻辑
 * 涉及三条容易写错的边界，且错了都是静默的 ——
 * ① 空查询应返回**空结果**（不是全部）：空查询下高亮全部消息毫无意义
 * ② 大小写不敏感：用户输入 "API" 期望匹配 "api"
 * ③ 循环跳转：在最后一个命中处点「下一个」应回到第一个，
 *    否则用户到了末尾就卡住（而界面上没有任何提示）
 *
 * 与「会话搜索」的区别：那边空查询返回全部（用户想看列表），
 * 这边空查询返回空（用户还没开始搜）。同名的函数，语义相反 ——
 * 这正是不能复用的原因。
 */
object ChatSearch {

    /**
     * 在消息列表里找出所有匹配的下标。
     *
     * @return 匹配的消息下标（升序）；查询为空或无匹配时返回空列表
     */
    fun findMatches(messages: List<ChatMessage>, query: String): List<Int> {
        val q = query.trim()
        if (q.isEmpty()) return emptyList()
        val lower = q.lowercase()
        return messages.indices.filter { i ->
            messages[i].text.lowercase().contains(lower)
        }
    }

    /**
     * 从 [current] 出发按方向找下一个匹配（循环）。
     *
     * @param direction +1 下一个 / -1 上一个
     * @return 下一个匹配的下标；无匹配时返回 null
     *
     * 循环语义：到末尾后回到开头。理由：对话是**时间序列**，
     * 用户搜到最后一个后想回到第一个继续看，是常见操作；
     * 不循环则需要先点一次「上一个」再手动滚，多一步且反直觉。
     */
    fun nextIndex(matches: List<Int>, current: Int, direction: Int): Int? {
        if (matches.isEmpty()) return null
        if (matches.size == 1) return matches[0]
        val step = if (direction >= 0) 1 else -1
        // 找到 current 在 matches 中的位置（未命中时从边界开始）
        val pos = matches.indexOf(current)
        val nextPos = when {
            pos < 0 -> if (step > 0) 0 else matches.size - 1
            else -> (pos + step + matches.size) % matches.size
        }
        return matches[nextPos]
    }

    /** 展示用的计数文案，如 "2 / 5"；无匹配时为 "无匹配"。 */
    fun countLabel(matches: List<Int>, current: Int, noMatchLabel: String): String {
        if (matches.isEmpty()) return noMatchLabel
        val pos = matches.indexOf(current)
        return if (pos < 0) "${matches.size} 处匹配" else "${pos + 1} / ${matches.size}"
    }
}
