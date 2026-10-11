package com.dogecode.mobile

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * L3 的两块：GlobPattern 纯函数与 LocalTools 的 glob / 正则搜索。
 *
 * ## glob 匹配错了是静默的
 *
 * 模型搜 `*.kt` 拿到空结果会得出「没有 Kotlin 文件」的错误结论，
 * 然后基于它做后续决策 —— 全程无报错。`*` vs `**` 的跨目录语义
 * 是最容易写错的一处（正则的 `*` 没有这层限制，直接转换必错）。
 */
class GlobAndRegexTest {

    private lateinit var root: File

    @Before
    fun setUp() {
        root = File.createTempFile("glob-test", "").apply {
            delete()
            mkdirs()
        }
    }

    @After
    fun tearDown() {
        root.deleteRecursively()
    }

    private fun touch(rel: String) {
        File(root, rel).apply {
            parentFile?.mkdirs()
            writeText("x")
        }
    }

    // ── GlobPattern 纯函数 ──

    @Test
    fun `星号不跨目录`() {
        // glob 的核心语义：* 只在单段内匹配
        assertTrue(GlobPattern.matches("*.kt", "Main.kt"))
        assertFalse("*.kt 不该匹配子目录里的文件", GlobPattern.matches("*.kt", "src/Main.kt"))
    }

    @Test
    fun `双星号跨目录`() {
        assertTrue(GlobPattern.matches("**/*.kt", "Main.kt"))
        assertTrue(GlobPattern.matches("**/*.kt", "src/Main.kt"))
        assertTrue(GlobPattern.matches("**/*.kt", "a/b/c/Main.kt"))
    }

    @Test
    fun `双星号中间段`() {
        // a/**/b 应匹配 a/b（中间零段）与 a/x/y/b（中间多段）
        assertTrue(GlobPattern.matches("a/**/b", "a/b"))
        assertTrue(GlobPattern.matches("a/**/b", "a/x/y/b"))
        assertFalse(GlobPattern.matches("a/**/b", "x/a/b"))
    }

    @Test
    fun `问号匹配单字符不跨目录`() {
        assertTrue(GlobPattern.matches("config?.json", "configs.json"))
        assertFalse(GlobPattern.matches("config?.json", "configss.json"))
        assertFalse(GlobPattern.matches("?", "a/b"))
    }

    @Test
    fun `特殊字符按字面量处理`() {
        // 模式里的 . + ( 等必须是字面量，不是正则元字符
        assertTrue(GlobPattern.matches("a.b+c.txt", "a.b+c.txt"))
        assertFalse(GlobPattern.matches("a.b", "axb"))
    }

    @Test
    fun `精确文件名全匹配`() {
        assertTrue(GlobPattern.matches("Main.kt", "Main.kt"))
        assertFalse("部分匹配不算（matches 是全匹配）", GlobPattern.matches("Main", "Main.kt"))
    }

    // ── glob 工具（真实文件系统）──

    @Test
    fun `找当前目录的匹配文件`() {
        touch("A.kt"); touch("B.kt"); touch("C.txt")
        val r = LocalTools.execute(root, "glob", """{"pattern":"*.kt"}""")
        assertTrue(r.ok)
        assertTrue(r.content.contains("A.kt"))
        assertTrue(r.content.contains("B.kt"))
        assertFalse(r.content.contains("C.txt"))
    }

    @Test
    fun `跨目录模式命中子目录文件`() {
        touch("src/main/Main.kt"); touch("lib/Util.kt")
        val r = LocalTools.execute(root, "glob", """{"pattern":"**/*.kt"}""")
        assertTrue(r.ok)
        assertTrue(r.content.contains("src/main/Main.kt"))
        assertTrue(r.content.contains("lib/Util.kt"))
    }

    @Test
    fun `单星不跨目录（工具层同语义）`() {
        touch("Top.kt"); touch("src/Inner.kt")
        val r = LocalTools.execute(root, "glob", """{"pattern":"*.kt"}""")
        assertTrue(r.ok)
        assertTrue(r.content.contains("Top.kt"))
        assertFalse("子目录的文件不该被 *.kt 命中", r.content.contains("src/Inner.kt"))
    }

    @Test
    fun `跳过 node_modules 等目录`() {
        touch("node_modules/pkg/index.js"); touch("mine.js")
        val r = LocalTools.execute(root, "glob", """{"pattern":"**/*.js"}""")
        assertTrue(r.ok)
        assertFalse("依赖目录不该出现在结果里", r.content.contains("node_modules"))
        assertTrue(r.content.contains("mine.js"))
    }

    @Test
    fun `无匹配时明确说明`() {
        val r = LocalTools.execute(root, "glob", """{"pattern":"*.xyz"}""")
        assertTrue(r.ok)
        assertTrue(r.content.contains("没有匹配"))
    }

    @Test
    fun `缺 pattern 报错`() {
        val r = LocalTools.execute(root, "glob", "{}")
        assertFalse(r.ok)
        assertTrue(r.content.contains("pattern"))
    }

    // ── search_in_files 的正则模式 ──

    @Test
    fun `默认仍是纯文本匹配（向后兼容）`() {
        File(root, "a.txt").writeText("fun main() {}")
        // 这行包含正则元字符，按纯文本搜必须命中
        val r = LocalTools.execute(root, "search_in_files", """{"query":"fun main() {}"}""")
        assertTrue(r.ok)
        assertTrue(r.content.contains("a.txt"))
    }

    @Test
    fun `regex 模式支持正则语法`() {
        File(root, "a.txt").writeText("TODO: 修这个\nFIXME: 以及这个\n正常行")
        val r = LocalTools.execute(
            root,
            "search_in_files",
            """{"query":"TODO|FIXME","regex":true}""",
        )
        assertTrue(r.ok)
        assertTrue("应命中 TODO 行", r.content.contains("TODO"))
        assertTrue("应命中 FIXME 行", r.content.contains("FIXME"))
        assertFalse("不该命中正常行", r.content.contains("正常行"))
    }

    @Test
    fun `regex 模式支持锚定与字符类`() {
        File(root, "a.txt").writeText("val x1 = 1\nnotval y = 2")
        // Kotlin raw string 里 \d 不再转义，直接写进 JSON；JSON 解析后
        // 传给 Regex 的是 "val x\d"（一个反斜杠）
        val json = """{"query":"val x\\d","regex":true}"""
        val r = LocalTools.execute(root, "search_in_files", json)
        assertTrue(r.ok)
        assertTrue(r.content.contains("val x1"))
        assertFalse("锚定 ^ 应排除 notval 行", r.content.contains("notval"))
    }

    @Test
    fun `非法正则立即报错而非静默回退`() {
        // 模型以为在搜正则，静默回退子串会给出错误的「未找到」结论
        File(root, "a.txt").writeText("content")
        val r = LocalTools.execute(
            root,
            "search_in_files",
            """{"query":"[unclosed","regex":true}""",
        )
        assertFalse("非法正则必须失败", r.ok)
        assertTrue("应指引修正或去 regex 参数", r.content.contains("正则"))
    }

    @Test
    fun `系统提示词提及 glob 与正则（双向契约）`() {
        val prompt = SystemPrompt.build("test")
        assertTrue("提示词应列 glob", prompt.contains("glob"))
        assertTrue("应指引找文件优先 glob", prompt.contains("优先用"))
    }
}
