package com.dogecode.mobile

import com.dogecode.mobile.ChatAdapter.Companion.Seg
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * parseMarkdown 的纯逻辑测试（不依赖 Android 类型，可在 JVM 跑）。
 *
 * 最重要的不变量：**所有片段的文本拼起来必须等于原文去掉标记后的内容**，
 * 即任何标记都不能吞掉其它字符。AI 流式输出时未闭合标记是常态，
 * 吞字符会导致用户看不到部分回复且没有任何报错。
 */
class MarkdownParseTest {

    private fun join(src: String): String =
        ChatAdapter.parseMarkdown(src).joinToString("") { it.text }

    @Test
    fun `纯文本产生单个 TEXT 片段`() {
        val p = ChatAdapter.parseMarkdown("普通文本")
        assertEquals(1, p.size)
        assertEquals(Seg.TEXT, p[0].type)
        assertEquals("普通文本", p[0].text)
    }

    @Test
    fun `空字符串产生空列表`() {
        assertTrue(ChatAdapter.parseMarkdown("").isEmpty())
    }

    @Test
    fun `代码块被识别且内容保留`() {
        val p = ChatAdapter.parseMarkdown("前\n```\nval x = 1\n```\n后")
        val code = p.first { it.type == Seg.CODE_BLOCK }
        assertEquals("val x = 1", code.text)
        assertTrue(join("前\n```\nval x = 1\n```\n后").contains("val x = 1"))
    }

    @Test
    fun `粗体标记被剥离且内容保留`() {
        val p = ChatAdapter.parseMarkdown("这是**粗体**内容")
        val bold = p.first { it.type == Seg.BOLD }
        assertEquals("粗体", bold.text)
        assertEquals("这是粗体内容", join("这是**粗体**内容"))
    }

    @Test
    fun `行内代码被识别`() {
        val p = ChatAdapter.parseMarkdown("执行 `npm install` 即可")
        val code = p.first { it.type == Seg.CODE_INLINE }
        assertEquals("npm install", code.text)
    }

    // ── 未闭合标记：最关键的一组回归测试 ──

    @Test
    fun `未闭合代码块不吞内容`() {
        val src = "开始 ``` 未闭合的内容还在"
        assertTrue(join(src).contains("未闭合的内容还在"))
    }

    @Test
    fun `未闭合粗体不吞内容`() {
        val src = "前缀 **未闭合粗体"
        assertTrue(join(src).contains("未闭合粗体"))
    }

    @Test
    fun `未闭合行内代码不吞内容`() {
        val src = "前缀 `未闭合"
        assertTrue(join(src).contains("未闭合"))
    }

    @Test
    fun `单个反引号不吞内容`() {
        assertTrue(join("就一个 ` 符号").contains("就一个"))
    }

    @Test
    fun `连着三个反引号但后面再无闭合`() {
        val src = "```python\nprint(1)\n# 没有闭合"
        assertTrue("未闭合时整段应作为文本保留", join(src).contains("print(1)"))
    }

    // ── 混合与边界 ──

    @Test
    fun `多种标记混合不丢字符`() {
        val src = "A**B**C`D`E```F```G"
        val out = join(src)
        listOf("A", "B", "C", "D", "E", "F", "G").forEach {
            assertTrue("缺字符 $it", out.contains(it))
        }
    }

    @Test
    fun `无标记文本零损耗`() {
        val src = "第一行\n第二行  with   spaces\tend"
        assertEquals(src, join(src))
    }

    @Test
    fun `相邻标记正确处理`() {
        val out = join("**a**`b`")
        assertEquals("ab", out)
    }

    @Test
    fun `空粗体不产生片段且不影响后续`() {
        // **** 是空粗体，不应导致死循环或丢字
        val out = join("x****y")
        assertTrue(out.contains("x"))
        assertTrue(out.contains("y"))
    }

    @Test
    fun `多行代码块完整保留`() {
        val src = "```\nline1\nline2\nline3\n```"
        val p = ChatAdapter.parseMarkdown(src)
        val code = p.first { it.type == Seg.CODE_BLOCK }
        assertTrue(code.text.contains("line1"))
        assertTrue(code.text.contains("line3"))
    }
}
