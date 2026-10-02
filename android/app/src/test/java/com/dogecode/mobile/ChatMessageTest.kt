package com.dogecode.mobile

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ChatMessage 的序列化往返测试。
 *
 * 历史持久化依赖 toJson/fromJson 成对正确 —— 若字段名不一致，
 * 重启后消息会静默丢失或状态错乱，且不会有任何报错。
 */
class ChatMessageTest {

    @Test
    fun `序列化往返保留全部字段`() {
        val original = ChatMessage(
            id = "abc-123",
            role = "user",
            text = "含特殊字符：换行\n引号\"反斜杠\\ 与 emoji 🚀",
            timestamp = 1790942040394L,
            status = ChatMessage.Status.QUEUED,
        )
        val round = ChatMessage.fromJson(original.toJson())

        assertEquals(original.id, round.id)
        assertEquals(original.role, round.role)
        assertEquals(original.text, round.text)
        assertEquals(original.timestamp, round.timestamp)
        assertEquals(original.status, round.status)
    }

    @Test
    fun `未知 status 回落 NONE 而不抛异常`() {
        // 老版本写入的 status 若在新版本被删除，不应导致整个历史读取失败
        val o = JSONObject().apply {
            put("id", "x")
            put("role", "assistant")
            put("text", "hi")
            put("timestamp", 1L)
            put("status", "SOME_REMOVED_STATE")
        }
        assertEquals(ChatMessage.Status.NONE, ChatMessage.fromJson(o).status)
    }

    @Test
    fun `缺失可选字段不抛异常`() {
        // 只给最小字段集，其余走 opt 默认值
        val o = JSONObject().apply {
            put("role", "assistant")
            put("text", "hi")
        }
        val m = ChatMessage.fromJson(o)
        assertEquals("assistant", m.role)
        assertEquals("hi", m.text)
        assertEquals(0L, m.timestamp)
    }

    @Test
    fun `工厂方法产生唯一 id`() {
        val a = ChatMessage.user("x")
        val b = ChatMessage.user("x")
        assertNotEquals(a.id, b.id)
        assertEquals(ChatMessage.Status.SENDING, a.status)
        assertEquals("user", a.role)
    }

    @Test
    fun `newId 多次调用不重复`() {
        val ids = (1..200).map { ChatMessage.newId() }.toSet()
        assertEquals(200, ids.size)
    }

    @Test
    fun `JSON 特殊字符不会破坏结构`() {
        // 文本含引号与换行，若不正确转义会生成非法 JSON
        val m = ChatMessage.assistant("he said \"hi\"\nand left \\")
        val parsed = JSONObject(m.toJson().toString())
        assertEquals(m.text, parsed.getString("text"))
        assertTrue(parsed.getString("text").contains("\n"))
    }
}
