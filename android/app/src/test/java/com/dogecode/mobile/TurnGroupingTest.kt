package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 回合分组逻辑测试。
 *
 * 分组错了的表现很隐蔽：组头文案里的「N 项」算错、把正文误吞进组里、
 * 或者折叠键不稳定导致折叠态乱跳。这些都不报错，真机上要仔细看才发现。
 *
 * 变异验证：把 buildNodes 里 `indices.size < 2` 改成 `< 1`，
 * 「单个工具气泡不分组」用例失败。
 */
class TurnGroupingTest {

    private fun u(id: String) = TurnGrouping.Item(id, "user")
    private fun a(id: String) = TurnGrouping.Item(id, "assistant")
    private fun t(id: String) = TurnGrouping.Item(id, "tool")
    private fun s(id: String) = TurnGrouping.Item(id, "system")

    /** 组首成员：带组键（键由自身 id 派生）。 */
    private fun tFirst(id: String, groupExpanded: Boolean = false) =
        TurnGrouping.Item(
            id = id,
            role = "tool",
            groupKey = TurnGrouping.collapseKeyFor(id),
            groupExpanded = groupExpanded,
        )

    /** 组内非首成员：不带组键。 */
    private fun tRest(id: String) =
        TurnGrouping.Item(id = id, role = "tool", groupKey = "")

    // ── isGroupable ──

    @Test
    fun `只有工具气泡参与分组`() {
        assertTrue(TurnGrouping.isGroupable("tool"))
        assertFalse("用户消息是对话内容", TurnGrouping.isGroupable("user"))
        assertFalse("助手正文是对话内容", TurnGrouping.isGroupable("assistant"))
        assertFalse(TurnGrouping.isGroupable("system"))
    }

    // ── buildNodes ──

    @Test
    fun `连续多个工具气泡归为一组`() {
        val items = listOf(u("u1"), t("t1"), t("t2"), t("t3"), a("a1"))
        val nodes = TurnGrouping.buildNodes(items)
        assertEquals(3, nodes.size)
        assertTrue(nodes[0] is TurnGrouping.Node.Single)
        val g = nodes[1] as TurnGrouping.Node.Group
        assertEquals(listOf(1, 2, 3), g.indices)
        assertTrue(nodes[2] is TurnGrouping.Node.Single)
    }

    @Test
    fun `单个工具气泡不分组`() {
        // 单独一条气泡再套一个组头是多余的层级，多一次点击
        val items = listOf(u("u1"), t("t1"), a("a1"))
        val nodes = TurnGrouping.buildNodes(items)
        assertEquals(3, nodes.size)
        assertTrue("单个工具不该成组", nodes[1] is TurnGrouping.Node.Single)
    }

    @Test
    fun `被正文隔开的工具气泡分成两组`() {
        // 中间插了助手正文 → 是两个阶段，不该合成一组
        val items = listOf(u("u1"), t("t1"), t("t2"), a("a1"), t("t3"), t("t4"), a("a2"))
        val nodes = TurnGrouping.buildNodes(items)
        val groups = nodes.filterIsInstance<TurnGrouping.Node.Group>()
        assertEquals(2, groups.size)
        assertEquals(listOf(1, 2), groups[0].indices)
        assertEquals(listOf(4, 5), groups[1].indices)
    }

    @Test
    fun `正文不会被吞进组里`() {
        // 关键：assistant 是对话内容，必须独立成节点
        val items = listOf(t("t1"), t("t2"), a("a1"), t("t3"), t("t4"))
        val nodes = TurnGrouping.buildNodes(items)
        val groupIndices = nodes.filterIsInstance<TurnGrouping.Node.Group>()
            .flatMap { it.indices }
        assertFalse("正文下标不应在组内", 2 in groupIndices)
    }

    @Test
    fun `空列表安全`() {
        assertTrue(TurnGrouping.buildNodes(emptyList()).isEmpty())
    }

    @Test
    fun `全是工具气泡时合成一组`() {
        val items = (1..5).map { t("t$it") }
        val nodes = TurnGrouping.buildNodes(items)
        assertEquals(1, nodes.size)
        val g = nodes[0] as TurnGrouping.Node.Group
        assertEquals(5, g.indices.size)
    }

    @Test
    fun `没有可分组消息时全是独立节点`() {
        val items = listOf(u("u1"), a("a1"), s("s1"))
        val nodes = TurnGrouping.buildNodes(items)
        assertEquals(3, nodes.size)
        assertTrue(nodes.all { it is TurnGrouping.Node.Single })
    }

    @Test
    fun `组默认展开（未在折叠集合中）`() {
        val items = listOf(t("t1"), t("t2"))
        val nodes = TurnGrouping.buildNodes(items, collapsedKeys = emptySet())
        assertFalse((nodes[0] as TurnGrouping.Node.Group).collapsed)
    }

    @Test
    fun `折叠集合命中时该组折叠`() {
        val items = listOf(t("t1"), t("t2"))
        val key = TurnGrouping.collapseKeyFor("t1")
        val nodes = TurnGrouping.buildNodes(items, collapsedKeys = setOf(key))
        assertTrue((nodes[0] as TurnGrouping.Node.Group).collapsed)
    }

    // ── 折叠键的稳定性 ──

    @Test
    fun `折叠键只取决于组首成员`() {
        // 关键：组尾追加新工具气泡时，键不该变 —— 否则「跑着跑着折回去」
        val key1 = TurnGrouping.collapseKeyFor("t1")

        val before = listOf(t("t1"), t("t2"))
        val after = listOf(t("t1"), t("t2"), t("t3"))
        val kBefore = TurnGrouping.groupKeyOf(before, listOf(0, 1))
        val kAfter = TurnGrouping.groupKeyOf(after, listOf(0, 1, 2))
        assertEquals("组尾追加不应改变键", kBefore, kAfter)
        assertEquals(key1, kBefore)
    }

    @Test
    fun `不同组的键不同`() {
        val items = listOf(t("t1"), t("t2"), a("a1"), t("t3"), t("t4"))
        val groups = TurnGrouping.buildNodes(items)
            .filterIsInstance<TurnGrouping.Node.Group>()
        val keys = groups.map { TurnGrouping.groupKeyOf(items, it.indices) }
        assertEquals("两组应有不同键", 2, keys.toSet().size)
    }

    @Test
    fun `空下标返回空键`() {
        assertEquals("", TurnGrouping.groupKeyOf(emptyList(), emptyList()))
    }

    @Test
    fun `折叠键带前缀避免与消息 id 冲突`() {
        // 前缀确保折叠键不会与某条真实消息的 id 撞上
        val key = TurnGrouping.collapseKeyFor("abc")
        assertTrue(key.startsWith("g:"))
        assertTrue(key.endsWith("abc"))
    }

    // ── collapsedKeysOf（组折叠态的取数）──

    @Test
    fun `默认（未展开）的组首进入折叠集合`() {
        val items = listOf(tFirst("t1"), tRest("t2"))
        val keys = TurnGrouping.collapsedKeysOf(items)
        assertEquals(setOf(TurnGrouping.collapseKeyFor("t1")), keys)
    }

    @Test
    fun `已展开的组首不进折叠集合`() {
        val items = listOf(tFirst("t1", groupExpanded = true), tRest("t2"))
        assertTrue(TurnGrouping.collapsedKeysOf(items).isEmpty())
    }

    @Test
    fun `非组首成员不参与判定`() {
        // 关键：只有「组键 == 自身 id 派生的键」的那条才是组首。
        // 若非首成员也参与判定，一个组会出现多条折叠键、折叠态混乱。
        val items = listOf(tRest("t1"), tRest("t2"))
        assertTrue("没有组首时不应产出任何折叠键", TurnGrouping.collapsedKeysOf(items).isEmpty())
    }

    @Test
    fun `带他人组键的成员不被当作组首`() {
        // 这条是防「去掉组首判据」这个变异的有效用例：
        // 成员 t2 带了 t1 的组键（模拟脏数据 / 也模拟实现漏判组首归属），
        // 它不该因此产出折叠键 —— 否则一个组会有两条判定来源。
        val orphan = TurnGrouping.Item(
            id = "t2",
            role = "tool",
            groupKey = TurnGrouping.collapseKeyFor("t1"),  // 键不属于自己
            groupExpanded = false,
        )
        assertTrue(
            "组键不属于自身的成员不应产出折叠键",
            TurnGrouping.collapsedKeysOf(listOf(orphan)).isEmpty(),
        )
    }

    @Test
    fun `非工具消息即使带组键也不参与`() {
        // 防御：组键字段理论上只写在工具气泡上，但解析历史文件时
        // 可能有脏数据；不该让一条 assistant 消息影响组折叠
        val bad = TurnGrouping.Item(
            id = "a1", role = "assistant",
            groupKey = TurnGrouping.collapseKeyFor("a1"),
            groupExpanded = false,
        )
        assertTrue(TurnGrouping.collapsedKeysOf(listOf(bad)).isEmpty())
    }

    @Test
    fun `多个组各自独立判定折叠`() {
        val items = listOf(
            tFirst("t1"),              // 折叠
            tRest("t2"),
            a("a1"),
            tFirst("t3", groupExpanded = true),  // 展开
            tRest("t4"),
        )
        val keys = TurnGrouping.collapsedKeysOf(items)
        assertEquals(setOf(TurnGrouping.collapseKeyFor("t1")), keys)
    }

    @Test
    fun `空列表返回空集合`() {
        assertTrue(TurnGrouping.collapsedKeysOf(emptyList()).isEmpty())
    }

    @Test
    fun `旧历史（无组键）的组默认展开`() {
        // 兼容性契约：旧版本存下的历史里工具气泡没有 turnGroupKey。
        // 这些组必须**默认展开**，否则用户升级后会看到「历史里的一堆
        // 工具气泡凭空消失、只剩一行组头」而不知如何恢复。
        val legacy = listOf(t("t1"), t("t2"))  // groupKey 均为空
        val collapsed = TurnGrouping.collapsedKeysOf(legacy)
        assertTrue("无组键不应产出折叠键", collapsed.isEmpty())

        val nodes = TurnGrouping.buildNodes(legacy, collapsed)
        val g = nodes[0] as TurnGrouping.Node.Group
        assertFalse("旧历史的组应默认展开", g.collapsed)
    }

    @Test
    fun `组展开态与气泡展开态互不影响（关键契约）`() {
        // 用同一组数据构造两种情形：气泡态怎么变，组判定都不该受影响。
        // 这正是 Adapter 里曾误用 expanded 的那个 bug 的防线。
        val collapsed = listOf(tFirst("t1", groupExpanded = false), tRest("t2"))
        val expanded = listOf(tFirst("t1", groupExpanded = true), tRest("t2"))
        assertEquals(1, TurnGrouping.collapsedKeysOf(collapsed).size)
        assertEquals(0, TurnGrouping.collapsedKeysOf(expanded).size)
    }

    // ── 回合边界（用户发消息 / 助手定稿）──

    @Test
    fun `助手定稿回复后新回合的工具气泡独立成组`() {
        // 回合边界语义：一轮产生 t1,t2；助手定稿 a1（结束当前回合）；
        // 用户再发 u2 开启新回合，又产生 t3,t4 —— 这两组必须分开，
        // 不能因为「都是 tool」而糊成一组。
        val items = listOf(
            u("u1"), t("t1"), t("t2"), a("a1"),
            u("u2"), t("t3"), t("t4"), a("a2"),
        )
        val groups = TurnGrouping.buildNodes(items).filterIsInstance<TurnGrouping.Node.Group>()
        assertEquals(2, groups.size)
        assertEquals(listOf(1, 2), groups[0].indices)
        assertEquals(listOf(5, 6), groups[1].indices)
    }

    @Test
    fun `用户打断后新回合独立成组（无助手定稿）`() {
        // 用户发 u1 → AI 跑 t1,t2（还没定稿） → 用户又发 u2 打断 →
        // AI 新跑 t3,t4。两批工具分属不同回合，必须分开。
        // （单条工具气泡不套组头，故新回合至少 2 条才能成组）
        val items = listOf(u("u1"), t("t1"), t("t2"), u("u2"), t("t3"), t("t4"))
        val groups = TurnGrouping.buildNodes(items).filterIsInstance<TurnGrouping.Node.Group>()
        assertEquals(2, groups.size)
        assertEquals(listOf(1, 2), groups[0].indices)
        assertEquals(listOf(4, 5), groups[1].indices)
    }

    // ── groupLabel ──

    @Test
    fun `组头文案带项数`() {
        assertEquals("本轮活动（12 项）", TurnGrouping.groupLabel(12))
        assertEquals("本轮活动（2 项）", TurnGrouping.groupLabel(2))
    }

    // ── 与界面渲染的一致性（序列化往返）──

    @Test
    fun `分组后所有下标恰好覆盖可分组消息一次`() {
        // 不重不漏：每个工具气泡必须恰好出现在一个组里
        val items = listOf(u("u1"), t("t1"), t("t2"), a("a1"), t("t3"), t("t4"), t("t5"))
        val nodes = TurnGrouping.buildNodes(items)
        val covered = nodes.filterIsInstance<TurnGrouping.Node.Group>()
            .flatMap { it.indices }
            .sorted()
        val expected = items.indices.filter { TurnGrouping.isGroupable(items[it].role) }
        assertEquals(expected, covered)
    }
}