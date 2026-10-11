package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 待发权限决定队列的测试。
 *
 * **直接调用生产代码** PermissionDecisionStore.merge —— 不是复刻。
 *
 * 这个区别是实测出来的：本文件初版复刻了一份等价的合并逻辑（因为
 * merge 当时内联在需要 Context 的 enqueue 里）。做变异测试时把生产代码的
 * 去重改成「直接追加」，复刻版测试**仍然全绿** —— 完全没有约束力。
 * 于是把逻辑抽成纯函数 merge，让测试真正盯着生产代码。
 * 现在同样的变异会让本文件失败。
 *
 * 为什么这段逻辑重要：它是「通知栏批准不丢」的唯一保障。用户可能在 App
 * 完全没运行时就在通知栏点了批准，那一刻没有连接可发 —— 决定只能落盘
 * 等下次连接补发。若合并语义有误，服务端的权限请求会**永久悬挂**，
 * AI 一直卡着，而用户以为自己已经批准了。
 */
class PermissionQueueTest {

    private fun p(id: String, behavior: String) =
        PermissionDecisionStore.Pending(id, behavior, "test")

    @Test
    fun `同 requestId 重复入队时后者覆盖前者`() {
        // 场景：用户先点通知栏「批准」，又进 App 点「拒绝」。
        // 后者应生效 —— 若变成两条记录，服务端会收到矛盾的响应，
        // 先到的生效，结果取决于时序，是难以复现的错误。
        val list = PermissionDecisionStore.merge(
            listOf(p("req-1", "allow")),
            p("req-1", "deny"),
        )
        assertEquals("应只有一条记录", 1, list.size)
        assertEquals("后者应覆盖前者", "deny", list[0].behavior)
    }

    @Test
    fun `覆盖操作不改变总量`() {
        val base = listOf(p("x", "allow"), p("y", "allow"))
        val list = PermissionDecisionStore.merge(base, p("x", "deny"))
        assertEquals(2, list.size)
    }

    @Test
    fun `覆盖会把条目移到队尾（最后入队的最后发送）`() {
        // 这是 merge 的副作用，必须显式锁定：
        // 先 filterNot 移除旧条目、再 add 到末尾，所以覆盖后位置在最后。
        // 语义上是对的 —— 用户最新做的决定应当最后发给服务端，
        // 与「后者生效」一致。但若将来有人把实现改成「原位替换」，
        // 这条用例会失败，提示他确认顺序语义是否仍成立。
        val list = PermissionDecisionStore.merge(
            listOf(p("x", "allow"), p("y", "allow")),
            p("x", "deny"),
        )
        assertEquals(listOf("y", "x"), list.map { it.requestId })
        assertEquals("deny", list.last().behavior)
    }

    @Test
    fun `不同 requestId 各自保留`() {
        var list = emptyList<PermissionDecisionStore.Pending>()
        list = PermissionDecisionStore.merge(list, p("req-1", "allow"))
        list = PermissionDecisionStore.merge(list, p("req-2", "deny"))
        assertEquals(2, list.size)
    }

    @Test
    fun `保持入队顺序（顺序对服务端有意义）`() {
        var list = emptyList<PermissionDecisionStore.Pending>()
        list = PermissionDecisionStore.merge(list, p("a", "allow"))
        list = PermissionDecisionStore.merge(list, p("b", "deny"))
        list = PermissionDecisionStore.merge(list, p("c", "allow"))
        assertEquals(listOf("a", "b", "c"), list.map { it.requestId })
    }

    @Test
    fun `超上限时丢弃最旧的`() {
        // 队列长期不空说明用户长时间离线；丢最旧的比无限增长好
        var list = emptyList<PermissionDecisionStore.Pending>()
        repeat(60) { list = PermissionDecisionStore.merge(list, p("r$it", "allow"), max = 50) }
        assertEquals(50, list.size)
        assertEquals("r10", list.first().requestId)
        assertEquals("r59", list.last().requestId)
    }

    @Test
    fun `恰好等于上限时不丢弃`() {
        var list = emptyList<PermissionDecisionStore.Pending>()
        repeat(50) { list = PermissionDecisionStore.merge(list, p("r$it", "allow"), max = 50) }
        assertEquals(50, list.size)
        assertEquals("r0", list.first().requestId)
    }

    @Test
    fun `空队列合并安全`() {
        val list = PermissionDecisionStore.merge(emptyList(), p("a", "allow"))
        assertEquals(1, list.size)
    }

    @Test
    fun `合并到上限后再覆盖不丢已有条目`() {
        // 覆盖不增加长度，因此不该触发裁剪把有效条目挤掉
        var list = emptyList<PermissionDecisionStore.Pending>()
        repeat(50) { list = PermissionDecisionStore.merge(list, p("r$it", "allow"), max = 50) }
        list = PermissionDecisionStore.merge(list, p("r49", "deny"), max = 50)
        assertEquals(50, list.size)
        assertEquals("r0", list.first().requestId)
        assertEquals("deny", list.last().behavior)
    }

    @Test
    fun `行为值原样保留不归一化`() {
        // 归一化是服务端的职责（它只认精确的 "allow"）。
        // 客户端若擅自改写，会掩盖上层的拼写错误。
        val list = PermissionDecisionStore.merge(emptyList(), p("a", "ALLOW"))
        assertEquals("ALLOW", list[0].behavior)
    }

    @Test
    fun `merge 不修改传入的列表`() {
        // 纯函数契约：调用方可能持有原列表引用
        val original = listOf(p("a", "allow"))
        val copied = ArrayList(original)
        PermissionDecisionStore.merge(original, p("b", "deny"))
        assertEquals("不应修改入参", copied, original)
        assertTrue(original.size == 1)
    }
}
