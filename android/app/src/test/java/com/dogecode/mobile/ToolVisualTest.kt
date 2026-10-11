package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 工具气泡视觉判定测试。
 *
 * 两个判据都属「错了不报错、只是显示怪」的类型：
 * ① 类别判定错了 → 颜色是错的（用户不会报告「颜色不对」）
 * ② 截断判据错了 → 要么把内容截没了，要么没截而撑爆列表
 *
 * 变异验证：把 categoryOf 里的 WRITE 判断删掉，「写类工具判定为 WRITE」失败。
 */
class ToolVisualTest {

    // ── categoryOf ──

    @Test
    fun `写类工具判定为 WRITE`() {
        assertEquals(ToolVisual.Category.WRITE, ToolVisual.categoryOf("Write"))
        assertEquals(ToolVisual.Category.WRITE, ToolVisual.categoryOf("Edit"))
        assertEquals(ToolVisual.Category.WRITE, ToolVisual.categoryOf("Bash"))
    }

    @Test
    fun `读类工具判定为 READ`() {
        assertEquals(ToolVisual.Category.READ, ToolVisual.categoryOf("Read"))
        assertEquals(ToolVisual.Category.READ, ToolVisual.categoryOf("Glob"))
        assertEquals(ToolVisual.Category.READ, ToolVisual.categoryOf("Grep"))
    }

    @Test
    fun `网络类工具判定为 NETWORK`() {
        assertEquals(ToolVisual.Category.NETWORK, ToolVisual.categoryOf("WebFetch"))
        assertEquals(ToolVisual.Category.NETWORK, ToolVisual.categoryOf("curl"))
    }

    @Test
    fun `子代理判定为 AGENT`() {
        assertEquals(ToolVisual.Category.AGENT, ToolVisual.categoryOf("Task"))
    }

    @Test
    fun `未知工具回落 OTHER`() {
        assertEquals(ToolVisual.Category.OTHER, ToolVisual.categoryOf("SomethingWeird"))
        assertEquals(ToolVisual.Category.OTHER, ToolVisual.categoryOf(""))
    }

    @Test
    fun `大小写不敏感`() {
        // 工具名在不同来源下大小写会变（Read / read_file / mcp__fs__read）
        assertEquals(ToolVisual.Category.READ, ToolVisual.categoryOf("read"))
        assertEquals(ToolVisual.Category.READ, ToolVisual.categoryOf("READ_FILE"))
        assertEquals(ToolVisual.Category.WRITE, ToolVisual.categoryOf("bash"))
    }

    @Test
    fun `带前缀的工具名也能识别`() {
        // MCP 工具名形如 mcp__fs__read_file
        assertEquals(ToolVisual.Category.READ, ToolVisual.categoryOf("mcp__fs__read_file"))
        assertEquals(ToolVisual.Category.WRITE, ToolVisual.categoryOf("mcp__git__write_file"))
    }

    @Test
    fun `有副作用优先于只读`() {
        // 关键判据：名字同时含 read 与 edit 时，必须以「有副作用」为准 ——
        // 误判成 READ 会让用户低估风险
        assertEquals(ToolVisual.Category.WRITE, ToolVisual.categoryOf("readAndEdit"))
    }

    @Test
    fun `kind 为 agent 时直接判为 AGENT`() {
        // 子代理活动走独立通道，不看工具名
        assertEquals(ToolVisual.Category.AGENT, ToolVisual.categoryOf("whatever", "agent"))
    }

    @Test
    fun `kind 为 thinking 时判为 OTHER（不染成工具色）`() {
        assertEquals(ToolVisual.Category.OTHER, ToolVisual.categoryOf("思考", "thinking"))
    }

    // ── truncateResult ──

    @Test
    fun `少于上限时不截断`() {
        val text = (1..5).joinToString("\n") { "line$it" }
        val (kept, dropped) = ToolVisual.truncateResult(text, maxLines = 20)
        assertEquals(text, kept)
        assertEquals(0, dropped)
    }

    @Test
    fun `恰好等于上限时不截断`() {
        // 边界：等于上限应完整显示（用户看到的刚好是全部）
        val text = (1..20).joinToString("\n") { "line$it" }
        val (kept, dropped) = ToolVisual.truncateResult(text, maxLines = 20)
        assertEquals(text, kept)
        assertEquals(0, dropped)
    }

    @Test
    fun `超过上限时截断并报告丢弃行数`() {
        val text = (1..25).joinToString("\n") { "line$it" }
        val (kept, dropped) = ToolVisual.truncateResult(text, maxLines = 20)
        assertEquals(5, dropped)
        assertTrue("应保留前 20 行", kept.contains("line20"))
        assertTrue("不应含第 21 行", !kept.contains("line21"))
    }

    @Test
    fun `单行超长文本不按行截断`() {
        // 只有一行时 lines().size == 1 <= max，不会被截
        // 交给 TextView 自身省略，否则会把一条长错误从中间切断
        val long = "x".repeat(10_000)
        val (kept, dropped) = ToolVisual.truncateResult(long, maxLines = 20)
        assertEquals(long, kept)
        assertEquals(0, dropped)
    }

    @Test
    fun `空文本安全`() {
        val (kept, dropped) = ToolVisual.truncateResult("")
        assertEquals("", kept)
        assertEquals(0, dropped)
    }

    @Test
    fun `默认上限为 20 行`() {
        assertEquals(20, ToolVisual.RESULT_MAX_LINES)
    }

    @Test
    fun `命令原文默认上限更严（10 行）`() {
        // 命令通常一两行，多出来的是脚本内容，看开头即可
        assertEquals(10, ToolVisual.DETAIL_MAX_LINES)
        val text = (1..15).joinToString("\n") { "l$it" }
        val (_, dropped) = ToolVisual.truncateDetail(text)
        assertEquals(5, dropped)
    }
}