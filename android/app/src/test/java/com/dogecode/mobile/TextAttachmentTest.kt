package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 文本附件的判定与拼接测试。
 *
 * **白名单是安全边界**：只支持文本类，是因为服务端的附件机制依赖远端
 * uuid 下载（移动端不适用），而自建「上传二进制 → 服务端落盘」会引入
 * 整类安全问题。故这里必须严格挡住二进制 —— 用白名单而非黑名单
 * （黑名单永远会漏新格式）。
 *
 * 变异验证：把 isSupported 改成「不在黑名单里就允许」，
 * 「二进制扩展名被拒绝」用例失败。
 */
class TextAttachmentTest {

    // ── 白名单 ──

    @Test
    fun `常见代码与文本扩展名被接受`() {
        val ok = listOf(
            "a.txt", "README.md", "config.json", "app.log", "data.csv",
            "main.kt", "index.ts", "script.py", "server.go", "lib.rs",
            "style.css", "page.html", "build.gradle", "settings.yml",
            "notes.markdown", "settings.toml", "app.conf", "run.sh", "x.bat",
        )
        ok.forEach { assertTrue("$it 应被接受", TextAttachment.isSupported(it)) }
    }

    @Test
    fun `二进制扩展名被拒绝`() {
        // 这是白名单的核心作用 —— 黑名单会漏掉新格式
        val bad = listOf(
            "photo.png", "image.jpg", "video.mp4", "sound.mp3",
            "archive.zip", "lib.so", "app.exe", "data.db", "x.apk",
            "font.ttf", "doc.pdf", "sheet.xlsx", "slide.pptx",
        )
        bad.forEach { assertFalse("$it 应被拒绝", TextAttachment.isSupported(it)) }
    }

    @Test
    fun `扩展名大小写不敏感`() {
        assertTrue(TextAttachment.isSupported("A.TXT"))
        assertTrue(TextAttachment.isSupported("Main.KT"))
        assertFalse(TextAttachment.isSupported("X.PNG"))
    }

    @Test
    fun `无扩展名的常见文本文件名被接受`() {
        assertTrue(TextAttachment.isSupported("Dockerfile"))
        assertTrue(TextAttachment.isSupported("Makefile"))
        assertTrue(TextAttachment.isSupported("LICENSE"))
    }

    @Test
    fun `无扩展名且不在名单里被拒绝`() {
        // 未知的无扩展名文件可能是二进制，保守拒绝
        assertFalse(TextAttachment.isSupported("mybinary"))
        assertFalse(TextAttachment.isSupported(""))
    }

    @Test
    fun `带路径的文件名取最后一段判断`() {
        assertTrue(TextAttachment.isSupported("a/b/c/main.kt"))
        assertTrue(TextAttachment.isSupported("/sdcard/Download/app.log"))
        assertFalse(TextAttachment.isSupported("a/b/c/photo.png"))
    }

    @Test
    fun `伪装的双扩展名按最后一段判断`() {
        // "x.txt.exe" 是二进制（Windows 上常见伪装）
        assertFalse("双扩展名应按最后一段", TextAttachment.isSupported("x.txt.exe"))
    }

    // ── check 综合校验 ──

    @Test
    fun `正常文件通过校验`() {
        val r = TextAttachment.check("a.log", "content", 0)
        assertTrue(r is TextAttachment.Check.Ok)
    }

    @Test
    fun `超数量返回 TooMany 且带当前数量`() {
        val r = TextAttachment.check("a.log", "x", TextAttachment.MAX_FILES)
        assertTrue(r is TextAttachment.Check.TooMany)
        assertEquals(TextAttachment.MAX_FILES, (r as TextAttachment.Check.TooMany).current)
    }

    @Test
    fun `不支持的扩展名返回 Unsupported 且带文件名`() {
        // 带文件名是为了让提示能说清「不支持 .png」而不是笼统的「无法添加」
        val r = TextAttachment.check("photo.png", "x", 0)
        assertTrue(r is TextAttachment.Check.Unsupported)
        assertEquals("photo.png", (r as TextAttachment.Check.Unsupported).fileName)
    }

    @Test
    fun `超大文件返回 TooLarge 且带实际大小`() {
        val big = "x".repeat(TextAttachment.MAX_CHARS + 1)
        val r = TextAttachment.check("big.log", big, 0)
        assertTrue(r is TextAttachment.Check.TooLarge)
        assertEquals(big.length, (r as TextAttachment.Check.TooLarge).chars)
    }

    @Test
    fun `恰好等于上限时通过`() {
        val exact = "x".repeat(TextAttachment.MAX_CHARS)
        assertTrue(TextAttachment.check("x.log", exact, 0) is TextAttachment.Check.Ok)
    }

    @Test
    fun `数量检查优先于扩展名检查`() {
        // 数量已满时，提示「最多 N 个」比「不支持 .png」更切中要害
        val r = TextAttachment.check("photo.png", "x", TextAttachment.MAX_FILES)
        assertTrue(r is TextAttachment.Check.TooMany)
    }

    // ── compose ──

    @Test
    fun `无附件时原样返回`() {
        assertEquals("hello", TextAttachment.compose("hello", emptyList()))
    }

    @Test
    fun `附件拼在正文之后并带分隔标记`() {
        val out = TextAttachment.compose("看看这个", listOf("a.log" to "line1\nline2"))
        assertTrue("正文应在最前", out.startsWith("看看这个"))
        assertTrue("应有起始标记", out.contains("--- a.log ---"))
        assertTrue("应有结束标记", out.contains("--- end a.log ---"))
        assertTrue("内容应保留", out.contains("line1\nline2"))
    }

    @Test
    fun `多个附件各有独立标记`() {
        // 没有标记的话多文件内容会连成一片，AI 分不清边界
        val out = TextAttachment.compose(
            "",
            listOf("a.log" to "AAA", "b.json" to "BBB"),
        )
        assertTrue(out.contains("--- a.log ---"))
        assertTrue(out.contains("--- end a.log ---"))
        assertTrue(out.contains("--- b.json ---"))
        assertTrue(out.contains("--- end b.json ---"))
    }

    @Test
    fun `空正文时附件单独成文`() {
        val out = TextAttachment.compose("", listOf("a.log" to "content"))
        assertTrue(out.startsWith("--- a.log ---"))
    }

    @Test
    fun `纯空白正文不产生多余空行`() {
        val out = TextAttachment.compose("   \n  ", listOf("a.log" to "c"))
        assertTrue("应以附件标记开头", out.startsWith("--- a.log ---"))
    }

    // ── bubbleLabel ──

    @Test
    fun `气泡标签列出文件名`() {
        assertEquals(
            "[附件: a.log, b.json]",
            TextAttachment.bubbleLabel(listOf("a.log" to "x", "b.json" to "y")),
        )
    }

    @Test
    fun `无附件时气泡标签为空`() {
        assertEquals("", TextAttachment.bubbleLabel(emptyList()))
    }
}
