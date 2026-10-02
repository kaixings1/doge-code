package com.dogecode.mobile

import android.content.Context
import android.util.Log
import org.json.JSONArray
import java.io.File

/**
 * 消息历史的本地持久化。
 *
 * 用应用私有目录下的 JSON 文件而非 SharedPreferences：消息量大时
 * SharedPreferences 会整表读写、性能差，且没有合适的大小上限。
 *
 * 保留上限 MAX_MESSAGES 条，超出时丢弃最旧的，避免文件无限增长。
 * 读写都在调用线程进行，调用方负责放到 IO 线程（见 MainActivity）。
 */
class MessageStore(private val context: Context, sessionKey: String = "default") {

    /**
     * 历史按会话分文件。
     *
     * 多会话切换时若共用一条时间线，用户会把 A 会话的回复误认成 B 的 ——
     * 这比单纯的「体验不好」更严重。sessionKey 由连接时的主机:端口构成，
     * 正好区分不同 CLI 实例。
     */
    private var file = File(context.filesDir, "history-$sessionKey.json")

    /** 切换会话：改指另一个历史文件。调用方无需重建实例。 */
    fun useSession(sessionKey: String) {
        file = File(context.filesDir, "history-$sessionKey.json")
    }

    fun load(): MutableList<ChatMessage> {
        if (!file.exists()) return mutableListOf()
        return try {
            val arr = JSONArray(file.readText())
            MutableList(arr.length()) { ChatMessage.fromJson(arr.getJSONObject(it)) }
        } catch (e: Exception) {
            // 文件损坏不应导致 App 打不开：记日志后从空历史开始
            Log.w(TAG, "读取历史失败，忽略：${e.message}")
            mutableListOf()
        }
    }

    fun save(messages: List<ChatMessage>) {
        try {
            val trimmed = if (messages.size > MAX_MESSAGES) {
                messages.subList(messages.size - MAX_MESSAGES, messages.size)
            } else messages
            val arr = JSONArray()
            trimmed.forEach { arr.put(it.toJson()) }
            // 先写临时文件再改名，避免写入中断留下半个文件。
            // 临时文件名跟随目标文件，避免多会话同时写时互相踩踏。
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(arr.toString())
            if (!tmp.renameTo(file)) {
                file.writeText(arr.toString())
                tmp.delete()
            }
        } catch (e: Exception) {
            Log.w(TAG, "保存历史失败：${e.message}")
        }
    }

    fun clear() {
        runCatching { file.delete() }
    }

    companion object {
        private const val TAG = "MessageStore"
        private const val MAX_MESSAGES = 500

        /**
         * 会话标识：主机_端口，用作历史文件名。
         *
         * 两步过滤，缺一不可：
         * 1. 只保留 [A-Za-z0-9_.-]，其余替换为 _
         * 2. 再把连续的 "." 折叠为单个 —— 上面一步保留了 "."（为可读性），
         *    但 ".." 是路径穿越字符，仅靠字符白名单挡不住（"." 本身合法）。
         *    测试 `路径穿越字符被消除` 覆盖此点。
         */
        fun keyFor(host: String, port: Int): String =
            "${host}_$port"
                .replace(Regex("[^A-Za-z0-9_.-]"), "_")
                .replace(Regex("\\.{2,}"), "_")
    }
}
