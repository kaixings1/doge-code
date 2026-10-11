package com.dogecode.mobile

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * 连接失败的历史记录（线 C2）。
 *
 * 现状：`BridgeClient.lastDiagnosis` 只保留**最近一次**失败，
 * 成功连接后还会被清空。用户遇到间歇性断连时，回到 App 看到的
 * 永远是「暂无失败记录」—— 而那正是他最需要信息的时候。
 *
 * 设计取舍：**只记失败，不记成功**。成功的次数对排障没有价值
 * （用户知道它现在连上了），只记失败能让记录更聚焦、更省空间。
 *
 * 上限 20 条：够看出「是不是每隔几分钟就断」，又不至于让诊断页变成长列表。
 */
class DiagnosisLog(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** 一条失败记录。 */
    data class Record(
        val reason: String,
        val httpCode: Int?,
        /** 失败发生时连接的地址 —— 用户可能中途换过地址，不记的话无法对应。 */
        val address: String,
        val at: Long,
    ) {
        fun toJson(): JSONObject = JSONObject().apply {
            put("reason", reason)
            put("address", address)
            put("at", at)
            if (httpCode != null) put("httpCode", httpCode)
        }

        companion object {
            fun fromJson(o: JSONObject) = Record(
                reason = o.optString("reason"),
                httpCode = if (o.has("httpCode")) o.optInt("httpCode") else null,
                address = o.optString("address"),
                at = o.optLong("at"),
            )
        }
    }

    /** 记录一次失败（最新的在前）。 */
    fun append(reason: String, httpCode: Int?, address: String) {
        val record = Record(reason, httpCode, address, System.currentTimeMillis())
        save(prepend(load(), record, MAX_RECORDS))
    }

    /** 读取全部失败记录（最新的在前）。 */
    fun load(): List<Record> {
        val raw = prefs.getString(KEY, null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { i ->
                arr.optJSONObject(i)?.let { Record.fromJson(it) }
            }
        }.getOrElse {
            // 数据损坏不该让诊断页打不开：记日志后当作空
            Log.w(TAG, "失败历史解析失败，忽略：${it.message}")
            emptyList()
        }
    }

    fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    /** 展示用的汇总文案，如 "共 5 次失败，最近 3 分钟前"。 */
    fun summaryLabel(now: Long = System.currentTimeMillis()): String {
        val list = load()
        if (list.isEmpty()) return ""
        val latest = list.first().at
        val minutes = ((now - latest) / 60000).coerceAtLeast(0)
        val ago = when {
            minutes < 1 -> "刚刚"
            minutes < 60 -> "$minutes 分钟前"
            minutes < 60 * 24 -> "${minutes / 60} 小时前"
            else -> "${minutes / 60 / 24} 天前"
        }
        return "共 ${list.size} 次失败，最近 $ago"
    }

    private fun save(list: List<Record>) {
        val arr = JSONArray()
        list.forEach { arr.put(it.toJson()) }
        prefs.edit().putString(KEY, arr.toString()).apply()
    }

    companion object {
        private const val TAG = "DiagnosisLog"
        private const val PREFS = "doge_mobile"
        private const val KEY = "diagnosis_history"

        /**
         * 把新记录插到队首并裁剪到上限。**纯函数**，可直测。
         *
         * 抽出来的理由：顺序（新的在前）与裁剪方向（丢最旧的）
         * 是两条必须锁定的契约，但原实现埋在 append 里（需要 Context），
         * 测试只能「复刻」一遍 —— 那种测试在生产改动时不会失败。
         *
         * @return 新列表（不修改入参）
         */
        fun prepend(
            existing: List<Record>,
            record: Record,
            max: Int = MAX_RECORDS,
        ): List<Record> {
            // 新的插到队首：用户打开诊断页先看到最近的问题
            val list = mutableListOf(record).also { it.addAll(existing) }
            // 丢最旧的：若丢最新，等于永远看不到刚发生的问题，失去记录的意义
            while (list.size > max) list.removeAt(list.size - 1)
            return list
        }

        /**
         * 记录上限。
         *
         * 20 条足以看出「是不是每隔几分钟就断」这类模式；
         * 再多会让诊断页变成长列表，反而看不出模式。
         */
        const val MAX_RECORDS = 20
    }
}
