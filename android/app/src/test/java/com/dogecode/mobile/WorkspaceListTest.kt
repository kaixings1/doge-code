package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * `WorkspaceList` 测试（M4）。
 *
 * 这些操作错了全是静默的（切换不生效/工作区消失），必须钉死。
 * 与 `keyForLocal` 的契约联动：列表首项 = 当前工作区 = 历史文件名。
 */
class WorkspaceListTest {

    // ── parse / serialize ──

    @Test
    fun `parse 容忍空行与空白`() {
        assertEquals(
            listOf("/a", "/b"),
            WorkspaceList.parse(" /a \n\n  \n/b\n"),
        )
    }

    @Test
    fun `parse 空输入返回空列表`() {
        assertTrue(WorkspaceList.parse(null).isEmpty())
        assertTrue(WorkspaceList.parse("").isEmpty())
        assertTrue(WorkspaceList.parse("   ").isEmpty())
    }

    @Test
    fun `serialize 与 parse 互逆`() {
        val list = listOf("/sdcard/Documents/proj", "/sdcard/Download/demo")
        assertEquals(list, WorkspaceList.parse(WorkspaceList.serialize(list)))
    }

    // ── add ──

    @Test
    fun `add 新路径置顶`() {
        val r = WorkspaceList.add(listOf("/a", "/b"), "/c")
        assertEquals(listOf("/c", "/a", "/b"), r)
    }

    @Test
    fun `add 已存在路径置顶而非重复`() {
        // 用户重复选同一目录 = 想切过去，不是想加第二条
        val r = WorkspaceList.add(listOf("/a", "/b"), "/b")
        assertEquals(listOf("/b", "/a"), r)
    }

    @Test
    fun `add 超上限丢最旧`() {
        // MAX=8：满列表 [/p1../p8]，加 /new 后 take(8) → [/new, /p1../p7]
        val full = (1..WorkspaceList.MAX).map { "/p$it" }
        val r = WorkspaceList.add(full, "/new")
        assertEquals(WorkspaceList.MAX, r.size)
        assertEquals("/new 在首位", "/new", r.first())
        assertEquals("尾部的 /p8 被挤掉", "/p7", r.last())
    }

    @Test
    fun `add 空路径原样返回`() {
        val list = listOf("/a")
        assertEquals(list, WorkspaceList.add(list, "  "))
    }

    // ── switchTo ──

    @Test
    fun `switchTo 把已有项切到首位`() {
        val r = WorkspaceList.switchTo(listOf("/a", "/b", "/c"), "/c")
        assertEquals(listOf("/c", "/a", "/b"), r)
    }

    @Test
    fun `switchTo 不在列表中的路径原样返回`() {
        val list = listOf("/a", "/b")
        assertEquals("切到未验证目录必须被拒", list, WorkspaceList.switchTo(list, "/not-in-list"))
    }

    @Test
    fun `switchTo 当前项已在首位时不变`() {
        val list = listOf("/a", "/b")
        assertEquals(list, WorkspaceList.switchTo(list, "/a"))
    }

    // ── remove ──

    @Test
    fun `remove 移除当前项后下一项成为当前`() {
        val r = WorkspaceList.remove(listOf("/a", "/b", "/c"), "/a")
        assertEquals(listOf("/b", "/c"), r)
    }

    @Test
    fun `remove 移除中间项保持其余顺序`() {
        val r = WorkspaceList.remove(listOf("/a", "/b", "/c"), "/b")
        assertEquals(listOf("/a", "/c"), r)
    }

    @Test
    fun `remove 不存在的项原样返回`() {
        val list = listOf("/a")
        assertEquals(list, WorkspaceList.remove(list, "/nope"))
    }

    @Test
    fun `remove 全部移除得到空列表（回落私有目录的信号）`() {
        assertTrue(WorkspaceList.remove(listOf("/a"), "/a").isEmpty())
    }

    // ── 与 keyForLocal 的联动契约 ──

    @Test
    fun `列表首项（当前工作区）决定历史文件 key（M1 联动）`() {
        val a = WorkspaceList.switchTo(listOf("/a", "/b"), "/b")
        val b = WorkspaceList.switchTo(listOf("/a", "/b"), "/a")
        // 首项不同 → keyForLocal 不同 → 历史文件不同
        assertTrue(
            "切换后首项不同，历史 key 必须不同",
            MessageStore.keyForLocal(a.first()) != MessageStore.keyForLocal(b.first()),
        )
    }
}
