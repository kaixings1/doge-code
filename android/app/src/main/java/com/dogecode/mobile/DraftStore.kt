package com.dogecode.mobile

/**
 * 未发送草稿的持久化（**按会话隔离**）。
 *
 * 问题：Activity 重建（旋屏、被系统回收、多任务切换）时输入框内容默认丢失，
 * 用户打了一半的长需求就白打了。手机上打字本来就慢，这个损失尤其明显。
 *
 * 抽成独立类的理由同 [HostHistory]：逻辑简单但**边界有陷阱**，
 * 而且此前夹在 MainActivity 里无法单测。
 *
 * 陷阱 1：**空内容必须删除键，而不是存空串**。否则用户主动清空输入框后，
 * 重建时会把清空前的内容「复活」，看起来像界面出了幽灵文本。
 *
 * 陷阱 2（本客户端真实 bug，已修）：草稿必须**按会话分存**。原实现用固定
 * 单键 `draft`，导致切到会话 B 时输入框里出现会话 A 的半截输入 —— 用户
 * 以为自己打的字被串改，或误发错会话。修复：每个会话用 `draft_<sessionKey>`
 * 各自存，切换会话时只加载本会话那份。
 */
class DraftStore(prefs: android.content.SharedPreferences) {

    private val prefs = prefs

    /**
     * 读取某会话的草稿；无草稿返回空串（调用方直接 setText 即可）。
     *
     * @param sessionKey 会话标识（来自 MainActivity.activeKey）。空串表示
     *   尚未连接任何会话（冷启动早期），此时仍用 `draft_` 前缀避免与
     *   旧版单键 `draft` 冲突 —— 旧版已无调用方，前缀隔离保证平滑升级。
     */
    fun load(sessionKey: String): String =
        prefs.getString(keyFor(sessionKey), "").orEmpty()

    /**
     * 保存某会话的草稿。
     *
     * 空内容/纯空白 → 删除该会话的键（见类注释：存空串会让旧内容"复活"）。
     */
    fun save(sessionKey: String, text: String) {
        prefs.edit().apply {
            if (text.isBlank()) remove(keyFor(sessionKey)) else putString(keyFor(sessionKey), text)
        }.apply()
    }

    /** 清除某会话草稿（发送成功后调用）。 */
    fun clear(sessionKey: String) = save(sessionKey, "")

    /** 单键 → 按会话隔离的键。前缀隔离旧版，避免升级后读到错会话的脏数据。 */
    private fun keyFor(sessionKey: String): String = "$KEY_DRAFT_PREFIX$sessionKey"

    companion object {
        private const val KEY_DRAFT_PREFIX = "draft_"
    }
}
