package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * MessageStore 保留上限的测试。
 *
 * 这段逻辑的失败模式是静默的：若用 `subList(0, MAX)` 而非
 * `subList(size - MAX, size)`，落盘的是**最旧**的 500 条，
 * 用户看到「历史永远停在很久以前」，且没有任何报错。
 *
 * 因此边界必须逐一钉住：恰好等于上限（不该裁剪）、超出 1 条（该丢最旧 1 条）。
 *
 * 注：本文件曾包含一个「并发写盘会损坏内容」的测试，已删除 —— 它断言的是
 * 竞态**必然发生**，但实测 12 线程中有时全部完整落地（失败=0、内容完整），
 * 属于非确定性断言。非确定性的测试比没有测试更糟：它会随机变红，训练人忽略红灯。
 * 并发问题的正确防线是 MessageStore 内部的单线程 writer（见 saveAsync），
 * 而非一个靠运气的测试。
 */
class MessageStoreTrimTest {

    private fun msgs(n: Int) = (1..n).map { ChatMessage.assistant("m$it") }

    @Test
    fun `未超上限时原样返回同一引用`() {
        val list = msgs(10)
        assertSame("未裁剪时不应复制，避免无谓分配", list, MessageStore.trimToLimit(list))
    }

    @Test
    fun `恰好等于上限时不裁剪`() {
        val list = msgs(500)
        assertEquals(500, MessageStore.trimToLimit(list).size)
        assertEquals("m1", MessageStore.trimToLimit(list).first().text)
    }

    @Test
    fun `超出 1 条时丢掉最旧的那条`() {
        val out = MessageStore.trimToLimit(msgs(501))
        assertEquals(500, out.size)
        // 关键：丢的是最旧的 m1，保留 m2..m501。
        // 若实现写成 subList(0, 500)，这里会得到 m1..m500（丢掉了最新的），
        // 用户表现为「历史停在很久以前」。
        assertEquals("m2", out.first().text)
        assertEquals("m501", out.last().text)
    }

    @Test
    fun `大幅超出时保留最后 500 条`() {
        val out = MessageStore.trimToLimit(msgs(5000))
        assertEquals(500, out.size)
        assertEquals("m4501", out.first().text)
        assertEquals("m5000", out.last().text)
    }

    @Test
    fun `空列表不抛异常`() {
        assertTrue(MessageStore.trimToLimit(emptyList()).isEmpty())
    }
}
