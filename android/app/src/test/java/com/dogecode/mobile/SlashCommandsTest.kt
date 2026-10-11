package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 斜杠命令的**按模式过滤**测试（M2）。
 *
 * ## 为什么要测
 *
 * 本地模式下服务端命令（`/compact` `/cost` `/summary` `/files`）**全部不可用**，
 * 而快捷指令面板此前把它们一并列出 —— 用户点了之后，那串字符作为普通消息
 * 发给模型，模型收到 `/compact` 一脸茫然。**静默错误**，不报错、不提示。
 *
 * 过滤逻辑写错（如条件取反、漏了 BOTH 分支）同样静默 —— 表现为
 * 「某个模式少了几条命令」，用户只会觉得「功能少」而非「出 bug」。
 */
class SlashCommandsTest {

    private val remote = SlashCommands.Entry.Scope.REMOTE
    private val local = SlashCommands.Entry.Scope.LOCAL

    private fun names(scope: SlashCommands.Entry.Scope) =
        SlashCommands.matching("/", scope).map { it.command }

    // ── 模式过滤 ──

    @Test
    fun `本地模式不含服务端专属命令`() {
        val n = names(local)
        // /cost 已改为 BOTH（本地模式有客户端实现的用量统计），
        // 不再属于「服务端专属」
        listOf("compact", "summary", "files").forEach {
            assertFalse("本地模式不该出现 /$it（服务端能力，点了只会发出字面文本）", it in n)
        }
    }

    @Test
    fun `远端模式不含本地专属命令`() {
        val n = names(remote)
        listOf("workspace", "model", "tools").forEach {
            assertFalse("远端模式不该出现 /$it（查的是本机状态）", it in n)
        }
    }

    @Test
    fun `本地模式包含本地专属命令`() {
        val n = names(local)
        assertTrue("应有 /workspace", "workspace" in n)
        assertTrue("应有 /model", "model" in n)
        assertTrue("应有 /tools", "tools" in n)
    }

    @Test
    fun `远端模式包含服务端专属命令`() {
        val n = names(remote)
        assertTrue("应有 /compact", "compact" in n)
        assertTrue("应有 /cost", "cost" in n)
        assertTrue("应有 /summary", "summary" in n)
        assertTrue("应有 /files", "files" in n)
    }

    @Test
    fun `BOTH 命令在两种模式下都出现`() {
        assertTrue("远端应有 /clear", "clear" in names(remote))
        assertTrue("本地应有 /clear", "clear" in names(local))
    }

    @Test
    fun `不传 scope 时不过滤（向后兼容 + 全局检查用）`() {
        val all = SlashCommands.matching("/").map { it.command }
        assertEquals(SlashCommands.ALL.size, all.size)
    }

    @Test
    fun `两种模式的可见集合互不相交（除 BOTH）`() {
        val r = names(remote).toSet()
        val l = names(local).toSet()
        val both = SlashCommands.ALL
            .filter { it.scope == SlashCommands.Entry.Scope.BOTH }
            .map { it.command }
            .toSet()
        assertEquals("交集必须恰好等于 BOTH 集合：${r intersect l}", both, r intersect l)
    }

    // ── 前缀过滤（沿用既有语义）──

    @Test
    fun `前缀过滤只看命令名`() {
        val m = SlashCommands.matching("/co", remote).map { it.command }
        assertEquals(listOf("compact", "cost"), m)
    }

    @Test
    fun `前缀过滤忽略命令后的参数`() {
        val m = SlashCommands.matching("/cost --json", remote).map { it.command }
        assertEquals(listOf("cost"), m)
    }

    @Test
    fun `前缀过滤大小写不敏感`() {
        assertEquals(
            SlashCommands.matching("/CO", remote).map { it.command },
            SlashCommands.matching("/co", remote).map { it.command },
        )
    }

    @Test
    fun `非斜杠输入返回空`() {
        assertTrue(SlashCommands.matching("hello", remote).isEmpty())
        assertTrue(SlashCommands.matching("", remote).isEmpty())
    }

    @Test
    fun `本地模式下前缀过滤不会捞到服务端命令`() {
        // /c 在远端能匹配 compact/cost/clear；本地剩 cost + clear（按 ALL 声明序）
        val local = SlashCommands.matching("/c", this.local).map { it.command }
        assertEquals(listOf("cost", "clear"), local)
    }

    // ── isKnown 的模式感知 ──

    @Test
    fun `isKnown 在本地模式下否认服务端专属命令`() {
        // /cost 已是 BOTH（本地有客户端实现），换 compact 验证否认路径
        assertFalse(
            "/compact 在本地模式必须被认作不可用（否则会发出字面文本）",
            SlashCommands.isKnown("/compact", local),
        )
    }

    @Test
    fun `isKnown 在两种模式下都认 BOTH 命令`() {
        assertTrue(SlashCommands.isKnown("/cost", local))
        assertTrue(SlashCommands.isKnown("/cost", remote))
    }

    @Test
    fun `isKnown 在远端模式下确认服务端命令`() {
        assertTrue(SlashCommands.isKnown("/cost", remote))
    }

    @Test
    fun `isKnown 不传 scope 时只看命令是否存在`() {
        assertTrue(SlashCommands.isKnown("/cost"))
        assertTrue(SlashCommands.isKnown("/workspace"))
        assertFalse(SlashCommands.isKnown("/doctor"))
    }

    @Test
    fun `isKnown 支持带参数的输入`() {
        assertTrue(SlashCommands.isKnown("/cost --json", remote))
    }

    @Test
    fun `跨模式命令在两边都被认可`() {
        assertTrue(SlashCommands.isKnown("/clear", remote))
        assertTrue(SlashCommands.isKnown("/clear", local))
    }

    // ── looksLikeCommand（未变，但要保证没被改坏）──

    @Test
    fun `looksLikeCommand 识别斜杠开头`() {
        assertTrue(SlashCommands.looksLikeCommand("/x"))
        assertFalse(SlashCommands.looksLikeCommand("x"))
        assertFalse("单个斜杠不是命令", SlashCommands.looksLikeCommand("/"))
    }

    // ── 数据完整性 ──

    @Test
    fun `每条命令都有 scope 与描述`() {
        SlashCommands.ALL.forEach {
            assertTrue("/${it.command} 缺描述", it.desc.isNotBlank())
            assertEquals("labal 应与 command 对应", "/${it.command}", it.label)
        }
    }

    @Test
    fun `命令名不重复`() {
        val dupes = SlashCommands.ALL.groupBy { it.command }.filter { it.value.size > 1 }.keys
        assertTrue("命令名重复：$dupes", dupes.isEmpty())
    }

    @Test
    fun `本地专属命令都与服务端白名单无交集（避免误判）`() {
        // 若本地命令名与服务端白名单同名，服务端会尝试执行它 —— 语义冲突
        val serverNames = setOf("compact", "cost", "summary", "files", "clear")
        SlashCommands.ALL.filter { it.scope == SlashCommands.Entry.Scope.LOCAL }.forEach {
            assertFalse(
                "/${it.command} 与 REST 白名单重名，会导致服务端误执行",
                it.command in serverNames,
            )
        }
    }
}
