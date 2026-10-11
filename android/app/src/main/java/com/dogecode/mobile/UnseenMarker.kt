package com.dogecode.mobile

/**
 * 「有新消息未看到」的判据（纯逻辑，可单测）。
 *
 * 为什么要抽出来：这段判据涉及三个易错边界，且错了只是「提示不出现」
 * 或「提示赖着不走」，都不会报错：
 *
 * 1. **列表尚未布局**：RecyclerView 在消息刚到、还没走完一次 layout 时，
 *    `findLastVisibleItemPosition()` 返回 -1（NO_POSITION）。此时若按
 *    「总项数 - (-1) > 2」算，会得出「有未读」——而用户其实正看着最新，
 *    于是刚打开 App 就挂一个「N 条新消息」的提示。必须在 -1 时判为
 *    「在看最新」（不提示）。
 *
 * 2. **空列表**：项数为 0 时任何比较都没有意义，直接不提示。
 *
 * 3. **阈值方向**：距底部「2 项以内」算看到最新。判据要写成
 *    `总项 - 最后可见 - 1 <= 阈值` 这种不易搞反的形式；用
 *    `最后可见 >= 总项 - 阈值` 也等价，但两者混用会差一位。
 */
object UnseenMarker {

    /**
     * 距底部几个项以内算「在看最新」，不提示。
     *
     * 取 1（即最后一项已可见）而非更大值：要求「完全滚到底」才清除提示
     * 会让提示赖着不走；而阈值太大又会在用户明显没看到最新时就当作已读。
     * 1 表示「最后一项已出现在屏幕上」。
     */
    const val NEAR_BOTTOM_THRESHOLD = 1

    /**
     * 是否应提示「有新消息」。
     *
     * @param totalItems      列表总项数
     * @param lastVisiblePos  最后可见项下标；未布局时为 -1（NO_POSITION）
     */
    fun shouldMark(totalItems: Int, lastVisiblePos: Int): Boolean {
        if (totalItems <= 0) return false
        // 尚未布局（-1）：无法判断位置，按「在看最新」处理，不打扰。
        // 若反过来判成「有未读」，刚打开 App 就会看到一个假的未读提示。
        if (lastVisiblePos < 0) return false
        val distanceFromBottom = totalItems - 1 - lastVisiblePos
        return distanceFromBottom > NEAR_BOTTOM_THRESHOLD
    }

    /**
     * 是否已接近底部（用于清除提示、以及决定「滚动到底」箭头的显隐）。
     *
     * 与 [shouldMark] 是**互补**关系：此处为真时那边应为假。
     * 分开写而非取反，是因为两者语义不同（一个是「要不要提示」、
     * 一个是「要不要显示箭头」），将来可能各自加条件。
     */
    fun isNearBottom(totalItems: Int, lastVisiblePos: Int): Boolean {
        if (totalItems <= 0) return true
        if (lastVisiblePos < 0) return true // 未布局 → 当作在底部（不显示箭头）
        return totalItems - 1 - lastVisiblePos <= NEAR_BOTTOM_THRESHOLD
    }

    /**
     * 未读提示的文案。
     *
     * 超过 99 显示「99+」：三位数以上的具体数字对用户没有帮助，
     * 且会让按钮变宽挤占列表区域。
     */
    fun badgeText(count: Int): String = when {
        count <= 0 -> ""
        count > 99 -> "99+ 条新消息"
        else -> "$count 条新消息"
    }
}
