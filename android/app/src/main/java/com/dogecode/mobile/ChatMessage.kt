package com.dogecode.mobile

import org.json.JSONObject

/**
 * 一条聊天消息。
 *
 * role 与服务端 WS 协议一致：'user' | 'assistant' | 'system' | 'error'。
 * status 只对用户消息有意义：发送中 / 已提交（服务端入队回执）/ 发送失败。
 */
data class ChatMessage(
    val id: String,
    val role: String,
    val text: String,
    val timestamp: Long,
    val status: Status = Status.NONE,
) {
    enum class Status { NONE, SENDING, QUEUED, FAILED }

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("role", role)
        put("text", text)
        put("timestamp", timestamp)
        put("status", status.name)
    }

    companion object {
        fun fromJson(o: JSONObject): ChatMessage = ChatMessage(
            id = o.optString("id"),
            role = o.optString("role"),
            text = o.optString("text"),
            timestamp = o.optLong("timestamp"),
            status = runCatching { Status.valueOf(o.optString("status", "NONE")) }
                .getOrDefault(Status.NONE),
        )

        fun user(text: String, id: String = newId()) =
            ChatMessage(id, "user", text, System.currentTimeMillis(), Status.SENDING)

        fun assistant(text: String) =
            ChatMessage(newId(), "assistant", text, System.currentTimeMillis())

        fun system(text: String) =
            ChatMessage(newId(), "system", text, System.currentTimeMillis())

        fun newId(): String = java.util.UUID.randomUUID().toString()
    }
}
