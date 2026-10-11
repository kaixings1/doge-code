package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 批量选择集合运算的单元测试（纯逻辑，可单测）。
 *
 * 这些逻辑错了是**静默**的：全选后取消某一格仍显示「全选」、
 * 空列表误判为已全选、退出后集合未清空等。必须可单测覆盖。
 */
class BatchSelectionTest {

    @Test
    fun `toggle 选中未选中的 id`() {
        val s = BatchSelection.toggle(emptySet(), "a")
        assertEquals(setOf("a"), s)
    }

    @Test
    fun `toggle 再次点击已选中的 id 取消`() {
        val s = BatchSelection.toggle(setOf("a"), "a")
        assertEquals(emptySet<String>(), s)
    }

    @Test
    fun `toggleAll 对未全选的列表全选`() {
        val ids = listOf("a", "b", "c")
        assertEquals(setOf("a", "b", "c"), BatchSelection.toggleAll(ids, setOf("a")))
    }

    @Test
    fun `toggleAll 对已全选的列表取消全选`() {
        val ids = listOf("a", "b", "c")
        assertEquals(emptySet<String>(), BatchSelection.toggleAll(ids, setOf("a", "b", "c")))
    }

    @Test
    fun `isAllSelected 仅当全选且列表非空为真`() {
        val ids = listOf("a", "b")
        assertFalse(BatchSelection.isAllSelected(ids, emptySet()))
        assertFalse(BatchSelection.isAllSelected(emptyList(), emptySet())) // 空列表不算全选
        assertTrue(BatchSelection.isAllSelected(ids, setOf("a", "b")))
    }

    @Test
    fun `isActive 有任意选中即激活`() {
        assertFalse(BatchSelection.isActive(emptySet()))
        assertTrue(BatchSelection.isActive(setOf("a")))
    }

    @Test
    fun `clear 返回空集`() {
        assertEquals(emptySet<String>(), BatchSelection.clear())
    }

    /**
     * 变异验证：把 toggleAll 的「已全选→清空」分支改成「总是全选」，
     * 本条应失败（确认全选/取消全选是真正切换的）。
     */
    @Test
    fun `变异：toggleAll 不应总是全选`() {
        val ids = listOf("a", "b", "c")
        val result = BatchSelection.toggleAll(ids, setOf("a", "b", "c"))
        assert(result.isEmpty()) { "已全选时 toggleAll 应取消全选" }
    }
}
