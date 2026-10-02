package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * MessageStore.keyFor 的测试。
 *
 * 这个函数生成历史文件名，两个要求：
 * 1. 不同会话必须产生不同文件名（否则历史串味）
 * 2. 产物必须是合法文件名（否则写文件抛异常，历史静默丢失）
 */
class MessageStoreKeyTest {

    @Test
    fun `不同端口产生不同 key`() {
        assertNotEquals(
            MessageStore.keyFor("127.0.0.1", 5680),
            MessageStore.keyFor("127.0.0.1", 5681),
        )
    }

    @Test
    fun `不同主机产生不同 key`() {
        assertNotEquals(
            MessageStore.keyFor("127.0.0.1", 5680),
            MessageStore.keyFor("192.168.0.106", 5680),
        )
    }

    @Test
    fun `相同输入产生相同 key`() {
        assertEquals(
            MessageStore.keyFor("127.0.0.1", 5680),
            MessageStore.keyFor("127.0.0.1", 5680),
        )
    }

    @Test
    fun `冒号与 IPv6 方括号被替换为合法字符`() {
        // IPv6 形如 [::1]，含方括号与冒号，直接做文件名在 Windows 上非法
        val k = MessageStore.keyFor("[::1]", 5680)
        assertFalse("不应含冒号", k.contains(":"))
        assertFalse("不应含方括号", k.contains("[") || k.contains("]"))
    }

    @Test
    fun `Windows 非法文件名字符全部被替换`() {
        val illegal = listOf('\\', '/', ':', '*', '?', '"', '<', '>', '|')
        val k = MessageStore.keyFor("host" + illegal.joinToString(""), 5680)
        illegal.forEach { c ->
            assertFalse("不应含非法字符 $c", k.contains(c))
        }
    }

    @Test
    fun `路径穿越字符被消除`() {
        // 若主机名含 .. 或 / 而未被过滤，可能写到预期目录之外
        val k = MessageStore.keyFor("../../etc", 5680)
        assertFalse("不应含斜杠", k.contains("/"))
        assertFalse("不应含反斜杠", k.contains("\\"))
        assertFalse("不应出现连续的 ..", k.contains(".."))
    }

    @Test
    fun `结果非空且含端口`() {
        val k = MessageStore.keyFor("127.0.0.1", 5680)
        assertTrue(k.isNotEmpty())
        assertTrue(k.contains("5680"))
    }
}
