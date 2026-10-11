package com.dogecode.mobile

import android.content.Context

/**
 * 未发送草稿的持久化。
 *
 * 问题：Activity 重建（旋屏、被系统回收、多任务切换）时输入框内容默认丢失，
 * 用户打了一半的长需求就白打了。手机上打字本来就慢，这个损失尤其明显。
 *
 * 抽成独立类的理由同 [HostHistory]：逻辑简单但**边界有陷阱**，
 * 而且此前夹在 MainActivity 里无法单测。
 *
 * 唯一的陷阱：**空内容必须删除键，而不是存空串**。
 * 否则用户主动清空输入框后，重建时会把清空前的内容「复活」，
 * 看起来像界面出了幽灵文本。
 */
class DraftStore(private val context: Context) {

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** 读取草稿；无草稿返回空串（调用方直接 setText 即可）。 */
    fun load(): String = prefs.getString(KEY_DRAFT, "").orEmpty()

    /**
     * 保存草稿。
     *
     * 空内容/纯空白 → 删除键（见类注释：存空串会让旧内容"复活"）。
     */
    fun save(text: String) {
        prefs.edit().apply {
            if (text.isBlank()) remove(KEY_DRAFT) else putString(KEY_DRAFT, text)
        }.apply()
    }

    /** 清除草稿（发送成功后调用）。 */
    fun clear() = save("")

    companion object {
        private const val PREFS = "doge_mobile"
        private const val KEY_DRAFT = "draft"
    }
}
