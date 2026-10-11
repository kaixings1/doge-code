package com.dogecode.mobile

/**
 * 消息批量选择的集合运算（纯逻辑，可单测，零 Android 依赖）。
 *
 * 为什么单独抽：选择态的「切换 / 全选 / 计数 / 是否含」这套逻辑易错且错了是
 * 静默的（多选漏选、全选后取消某一格仍显示「全选」等）。且它不依赖
 * RecyclerView/Adapter，应在 JVM 单测里完整覆盖。
 *
 * 选中态本身存在 [ChatMessage.selected]（运行时 UI 态，不落盘）；
 * 本类只管「id 集合」的运算，是选中态的**唯一事实来源** ——
 * Adapter 渲染时按本集合判断是否高亮，避免「数据和视图两套选中记录」脱节。
 */
object BatchSelection {

    /**
     * 切换某条消息的选中态。
     *
     * @return 新的选中 id 集合（不可变，调用方据此替换旧集合）。
     *   已选中的点一下变未选；未选中的点一下变选中。
     */
    fun toggle(selected: Set<String>, id: String): Set<String> =
        if (id in selected) {
            selected - id
        } else {
            selected + id
        }

    /**
     * 全选 / 取消全选。
     *
     * @param ids 当前可见的全部消息 id（用于全选）。
     * @param currentlySelected 当前已选集合。
     * @return 若已全选则清空（取消全选），否则选满全部。
     */
    fun toggleAll(ids: List<String>, currentlySelected: Set<String>): Set<String> =
        if (currentlySelected.size == ids.size && ids.isNotEmpty()) {
            emptySet()
        } else {
            ids.toSet()
        }

    /** 是否已全选（空列表视为未全选，避免「没消息却显示全选」）。 */
    fun isAllSelected(ids: List<String>, selected: Set<String>): Boolean =
        ids.isNotEmpty() && selected.size == ids.size

    /** 是否处于选择模式（有任意选中即视为选择模式开启）。 */
    fun isActive(selected: Set<String>): Boolean = selected.isNotEmpty()

    /** 清空选择（退出选择模式）。 */
    fun clear(): Set<String> = emptySet()
}
