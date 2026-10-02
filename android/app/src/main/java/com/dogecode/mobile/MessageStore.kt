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
class MessageStore(context: Context) {

    private val file = File(context.filesDir, "history.json")

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
            // 先写临时文件再改名，避免写入中断留下半个文件
            val tmp = File(file.parentFile, "history.json.tmp")
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
    }
}
