package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 对话搜索逻辑测试。
 *
 * 三处边界，错了都是静默的：
 * 1. **空查询返回空结果**（不是全部）—— 与「会话搜索」语义**相反**，
 *    那边空查询返回全部（用户想看列表），这边返回空（用户还没开始搜）。
 *    同名不同义，正是不能复用的原因。
 * 2. **大小写不敏感** —— 输入 "API" 应匹配 "api"
 * 3. **循环跳转** —— 末尾点「下一个」回到开头，否则用户卡在末尾且无提示
 *
 * 变异验证：把 nextIndex 的取模改成简单加法，
 * 「末尾下一个回到开头」用例失败。
 */
class ChatSearchTest {

    private fun msgs(vararg texts: String) =
        texts.map { ChatMessage(ChatMessage.newId(), "assistant", it, 0L) }

    // ── findMatches ──

    @Test
    fun `空查询返回空结果（不是全部）`() {
        // 与 SessionFragment.filterSessions 语义相反：那边空查询返回全部。
        // 此处空查询若返回全部，意味着「刚打开搜索框就高亮所有消息」，无意义
        val m = msgs("a", "b", "c")
        assertTrue(ChatSearch.findMatches(m, "").isEmpty())
        assertTrue(ChatSearch.findMatches(m, "   ").isEmpty())
    }

    @Test
    fun `找到所有匹配的下标`() {
        val m = msgs("hello world", "nothing", "world peace")
        assertEquals(listOf(0, 2), ChatSearch.findMatches(m, "world"))
    }

    @Test
    fun `大小写不敏感`() {
        val m = msgs("Use API here", "api again")
        assertEquals(listOf(0, 1), ChatSearch.findMatches(m, "api"))
        assertEquals(listOf(0, 1), ChatSearch.findMatches(m, "API"))
    }

    @Test
    fun `查询词首尾空白被忽略`() {
        val m = msgs("hello")
        assertEquals(listOf(0), ChatSearch.findMatches(m, "  hello  "))
    }

    @Test
    fun `无匹配返回空`() {
        assertTrue(ChatSearch.findMatches(msgs("a", "b"), "zzz").isEmpty())
    }

    @Test
    fun `空消息列表返回空`() {
        assertTrue(ChatSearch.findMatches(emptyList(), "x").isEmpty())
    }

    @Test
    fun `子串匹配（而非前缀）`() {
        // 用 startsWith 会搜不到中间出现的词
        assertEquals(listOf(0), ChatSearch.findMatches(msgs("a needle in haystack"), "needle"))
    }

    @Test
    fun `同一消息多次出现只算一次匹配`() {
        // 否则「3 / 3」里其实只有一条消息，计数会误导
        assertEquals(listOf(0), ChatSearch.findMatches(msgs("aa aa aa"), "aa"))
    }

    // ── nextIndex ──

    @Test
    fun `下一个取相邻命中`() {
        val matches = listOf(2, 5, 9)
        assertEquals(5, ChatSearch.nextIndex(matches, 2, 1))
        assertEquals(9, ChatSearch.nextIndex(matches, 5, 1))
    }

    @Test
    fun `末尾的下一个循环回开头`() {
        // 不循环则用户卡在末尾，且界面无任何提示
        val matches = listOf(2, 5, 9)
        assertEquals(2, ChatSearch.nextIndex(matches, 9, 1))
    }

    @Test
    fun `开头的上一个循环到末尾`() {
        val matches = listOf(2, 5, 9)
        assertEquals(9, ChatSearch.nextIndex(matches, 2, -1))
    }

    @Test
    fun `单个命中时前后跳都停在原地`() {
        val matches = listOf(7)
        assertEquals(7, ChatSearch.nextIndex(matches, 7, 1))
        assertEquals(7, ChatSearch.nextIndex(matches, 7, -1))
    }

    @Test
    fun `当前不在命中列表时从边界开始`() {
        val matches = listOf(2, 5, 9)
        // 向后：从第一个开始
        assertEquals(2, ChatSearch.nextIndex(matches, -1, 1))
        // 向前：从最后一个开始
        assertEquals(9, ChatSearch.nextIndex(matches, -1, -1))
    }

    @Test
    fun `无匹配返回 null`() {
        assertNull(ChatSearch.nextIndex(emptyList(), 0, 1))
        assertNull(ChatSearch.nextIndex(emptyList(), 0, -1))
    }

    @Test
    fun `连续跳完一轮回到起点`() {
        val matches = listOf(1, 4, 7)
        var cur = 1
        repeat(3) { cur = ChatSearch.nextIndex(matches, cur, 1)!! }
        assertEquals("跳 3 次应回到起点", 1, cur)
    }

    // ── countLabel ──

    @Test
    fun `计数文案显示当前位置与总数`() {
        assertEquals("2 / 3", ChatSearch.countLabel(listOf(1, 4, 7), 4, "无匹配"))
    }

    @Test
    fun `无匹配时显示传入的文案`() {
        assertEquals("无匹配", ChatSearch.countLabel(emptyList(), -1, "无匹配"))
    }

    @Test
    fun `当前不在命中列表时只显示总数`() {
        // 避免显示「-1 / 3」这种误导
        assertEquals("3 处匹配", ChatSearch.countLabel(listOf(1, 4, 7), -1, "无匹配"))
    }
}
