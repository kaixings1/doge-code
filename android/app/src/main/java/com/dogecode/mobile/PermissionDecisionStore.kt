package com.dogecode.mobile

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * 待发送的权限决定的本地队列。
 *
 * 为什么需要持久化（不是内存队列就够）：
 * 用户在**通知栏**点了「批准」时，App 可能根本没在运行。这一刻只有两件事
 * 能保证决定不丢：落盘、或让服务端永远等着。显然后者不可接受 ——
 * 服务端的权限请求是**阻塞**的，AI 会一直卡在那里。
 *
 * 所以流程是：通知栏点击 → 落盘 → （能拉起 App 就立刻发）→ 下次连接时补发。
 * 落盘这一步让「App 被系统杀死」这个常见情况不会丢决定。
 *
 * 用 JSON 数组而非 SharedPreferences 的 StringSet：需要保证顺序
 * （先批准的先生效），且要带 behavior 值，StringSet 表达不了。
 */
object PermissionDecisionStore {

    private const val TAG = "PermDecisionStore"
    private const val PREFS = "doge_pending_permissions"
    private const val KEY = "pending"

    /** 队列上限。正常情况下队列是空的（连上就发），满说明长期离线。 */
    private const val MAX_PENDING = 50

    data class Pending(val requestId: String, val behavior: String, val source: String)

    /**
     * 队列更新的**纯逻辑**：把一条决定并入队列。
     *
     * 抽成独立函数（而非内联在 enqueue 里）是为了能被单测**直接调用**。
     * 此前这段逻辑只存在于 enqueue 内部（需要 Context），测试被迫复刻一份
     * 等价实现 —— 那种「复刻型测试」在生产代码变异时不会失败，等于没测。
     * （实测确认：把去重改成直接追加，复刻版测试仍全绿。）
     *
     * 两条语义都必须被锁定：
     * 1. **同 requestId 覆盖而非追加**。用户可能先点通知栏批准、又进 App
     *    点拒绝，后者应生效。追加会让服务端收到矛盾响应，先到的生效，
     *    结果取决于时序，难以复现。
     * 2. **超上限丢最旧的**。最旧的决定对应请求大概率已被服务端超时清理。
     */
    fun merge(
        existing: List<Pending>,
        incoming: Pending,
        max: Int = MAX_PENDING,
    ): List<Pending> {
        val list = existing.filterNot { it.requestId == incoming.requestId }.toMutableList()
        list.add(incoming)
        while (list.size > max) list.removeAt(0)
        return list
    }

    /**
     * 追加一条待发决定。
     *
     * 同一 requestId 已有记录时**覆盖**而非追加 —— 见 [merge] 的说明。
     */
    fun enqueue(context: Context, requestId: String, behavior: String, source: String) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val list = merge(load(prefs), Pending(requestId, behavior, source))
        save(prefs, list)
        Log.i(TAG, "已排队: $behavior requestId=$requestId（来源: $source，待发 ${list.size} 条）")
    }

    /** 取出全部待发决定（不删除）。 */
    fun all(context: Context): List<Pending> = load(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE))

    /** 移除单条（发送成功后调用）。 */
    fun remove(context: Context, requestId: String) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val list = load(prefs).filterNot { it.requestId == requestId }
        save(prefs, list)
    }

    /** 清空（切换会话时调用 —— 决定属于特定服务端，跨会话发送会打到错的实例）。 */
    fun clear(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        save(prefs, emptyList())
    }

    private fun load(prefs: android.content.SharedPreferences): List<Pending> {
        val raw = prefs.getString(KEY, null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { i ->
                val o = arr.optJSONObject(i) ?: return@mapNotNull null
                val id = o.optString("requestId")
                val behavior = o.optString("behavior")
                if (id.isBlank() || behavior.isBlank()) return@mapNotNull null
                Pending(id, behavior, o.optString("source"))
            }
        }.getOrElse {
            // 数据损坏不应导致 App 打不开：记日志后从空开始
            Log.w(TAG, "待发决定解析失败，忽略：${it.message}")
            emptyList()
        }
    }

    private fun save(prefs: android.content.SharedPreferences, list: List<Pending>) {
        val arr = JSONArray()
        list.forEach {
            arr.put(JSONObject().apply {
                put("requestId", it.requestId)
                put("behavior", it.behavior)
                put("source", it.source)
            })
        }
        prefs.edit().putString(KEY, arr.toString()).apply()
    }
}
