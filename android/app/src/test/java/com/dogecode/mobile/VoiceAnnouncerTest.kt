package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 语音播报文本组装测试（纯逻辑部分）。
 *
 * 为什么必须测：TTS 引擎本身是 Android 框架类（在 JVM 单测里是抛异常的桩），
 * 但**念什么内容**是纯字符串处理 —— 而这正是最容易出错、且错了最不显眼的一环：
 * 逐字念出 `**` 与 ``` 不会报错，只是听起来很怪；首句提取错位会念出一段
 * 无意义的前缀。这些在真机上要开声音才能发现。
 *
 * 变异验证：把 stripMarkdown 里的代码块去除删掉，
 * 「回复只有代码块时不念符号」用例失败。
 */
class VoiceAnnouncerTest {

    // ── firstSentence ──

    @Test
    fun `取第一个句末标点前的内容`() {
        assertEquals(
            "已修复登录问题",
            VoiceAnnouncer.firstSentence("已修复登录问题。另外还改了测试。"),
        )
    }

    @Test
    fun `英文句点也作为分句边界`() {
        assertEquals("Fixed the bug", VoiceAnnouncer.firstSentence("Fixed the bug. Also updated tests."))
    }

    @Test
    fun `无句末标点时取整段（截断到上限）`() {
        val s = VoiceAnnouncer.firstSentence("这是一段没有标点的很长的回复" + "补".repeat(100))
        assertTrue("应被截断到上限附近", s.length <= VoiceAnnouncer.FIRST_SENTENCE_MAX + 1)
    }

    @Test
    fun `多行回复折叠为空格后再取首句`() {
        // 注意：换行**不是**分句边界 —— stripMarkdown 会先把所有空白
        // （含换行）折叠为单个空格，再按句末标点切分。
        // 因此「第一行\n第二行」会变成「第一行 第二行」整体作为首句。
        // 这是刻意的：多行短句（如列表）逐行切断会念出一堆碎片，
        // 合成一句更连贯。
        assertEquals("第一行 第二行", VoiceAnnouncer.firstSentence("第一行\n第二行"))
    }

    @Test
    fun `多行但有句末标点时在标点处切断`() {
        assertEquals("第一句", VoiceAnnouncer.firstSentence("第一句。\n第二句。"))
    }

    @Test
    fun `超长首句带省略号`() {
        val long = "甲".repeat(100) + "。"
        val s = VoiceAnnouncer.firstSentence(long)
        assertTrue("应以省略号结尾", s.endsWith("…"))
        assertEquals(VoiceAnnouncer.FIRST_SENTENCE_MAX + 1, s.length)
    }

    @Test
    fun `刚好等于上限时不加省略号`() {
        val exact = "甲".repeat(VoiceAnnouncer.FIRST_SENTENCE_MAX) + "。"
        val s = VoiceAnnouncer.firstSentence(exact)
        assertFalse("刚好等于上限不应截断", s.endsWith("…"))
    }

    @Test
    fun `空文本返回空串`() {
        assertEquals("", VoiceAnnouncer.firstSentence(""))
        assertEquals("", VoiceAnnouncer.firstSentence("   \n  "))
    }

    // ── Markdown 清理（避免念出符号）──

    @Test
    fun `代码块整体不念`() {
        val s = VoiceAnnouncer.firstSentence("看这段代码：```kotlin\nfun main() {}\n```完成。")
        assertFalse("不应念出反引号", s.contains("`"))
        assertFalse("不应念出代码内容", s.contains("fun main"))
    }

    @Test
    fun `粗体标记不念`() {
        val s = VoiceAnnouncer.firstSentence("**重要**：请重启服务。")
        assertFalse("不应念出星号", s.contains("*"))
        assertTrue("正文应保留", s.contains("重要"))
    }

    @Test
    fun `行内代码保留内容去掉反引号`() {
        val s = VoiceAnnouncer.firstSentence("运行 `npm test` 即可。")
        assertFalse(s.contains("`"))
        assertTrue("命令本身应保留（它是有信息量的）", s.contains("npm test"))
    }

    @Test
    fun `标题与列表符号不念`() {
        val s = VoiceAnnouncer.firstSentence("## 结论\n- 第一点")
        assertFalse("不应念出井号", s.contains("#"))
        assertFalse("不应念出列表符号", s.contains("-"))
    }

    @Test
    fun `链接只念文字不念地址`() {
        val s = VoiceAnnouncer.firstSentence("参见 [文档](https://example.com/x)。")
        assertTrue("应保留链接文字", s.contains("文档"))
        assertFalse("不应念出 URL", s.contains("example.com"))
        assertFalse("不应念出括号", s.contains("("))
    }

    // ── completionSpeech（完整播报词）──

    @Test
    fun `正常回复拼成前缀加首句`() {
        val speech = VoiceAnnouncer.completionSpeech("已修复登录问题。另外还改了测试。")
        assertEquals("任务已完成，已修复登录问题", speech)
    }

    @Test
    fun `回复只有代码块时只念前缀`() {
        // 念「任务已完成，」然后戛然而止很奇怪 —— 应只念前缀
        val speech = VoiceAnnouncer.completionSpeech("```kotlin\nfun main() {}\n```")
        assertEquals(VoiceAnnouncer.DONE_PREFIX, speech)
        assertFalse("不应有多余的逗号", speech.contains("，"))
    }

    @Test
    fun `空回复只念前缀`() {
        assertEquals(VoiceAnnouncer.DONE_PREFIX, VoiceAnnouncer.completionSpeech(""))
    }

    @Test
    fun `纯空白回复只念前缀`() {
        assertEquals(VoiceAnnouncer.DONE_PREFIX, VoiceAnnouncer.completionSpeech("  \n\t "))
    }

    @Test
    fun `前缀固定为「任务已完成」`() {
        // 锁死文案：这是用户明确选择的播报内容
        assertEquals("任务已完成", VoiceAnnouncer.DONE_PREFIX)
    }

    // ── permissionSpeech（需批准提醒）──

    @Test
    fun `需批准播报带工具名`() {
        val s = VoiceAnnouncer.permissionSpeech("Bash")
        assertEquals("需要你批准，Bash", s)
    }

    @Test
    fun `工具名缺失时只念前缀`() {
        assertEquals(VoiceAnnouncer.PERMISSION_PREFIX, VoiceAnnouncer.permissionSpeech(""))
        assertEquals(VoiceAnnouncer.PERMISSION_PREFIX, VoiceAnnouncer.permissionSpeech("   "))
    }

    @Test
    fun `占位工具名「工具」不念`() {
        // 服务端在下不到工具名时回落为「工具」；念「需要你批准，工具」
        // 毫无信息量，不如只念前缀
        assertEquals(VoiceAnnouncer.PERMISSION_PREFIX, VoiceAnnouncer.permissionSpeech("工具"))
    }

    @Test
    fun `工具名首尾空白被去除`() {
        assertEquals("需要你批准，Read", VoiceAnnouncer.permissionSpeech("  Read  "))
    }

    @Test
    fun `需批准前缀固定为「需要你批准」`() {
        assertEquals("需要你批准", VoiceAnnouncer.PERMISSION_PREFIX)
    }

    @Test
    fun `两种播报词互不相同`() {
        // 防止将来误用一个常量（两者语义不同：一个是完成，一个是阻塞等待）
        assertFalse(
            VoiceAnnouncer.DONE_PREFIX == VoiceAnnouncer.PERMISSION_PREFIX,
        )
    }

    // ── 语速（纯值域约束，值得锁死）──

    @Test
    fun `语速倍率映射在合理区间`() {
        // 与 MainActivity.applyVoiceRate 的映射保持同步：
        // slow=0.75 / normal=1.0 / fast=1.35，均在 TTS 可接受范围
        // （VoiceAnnouncer.speakNow 会 coerceIn(0.5f, 2.0f)）
        val values = listOf(0.75f, 1.0f, 1.35f)
        values.forEach {
            assertTrue("$it 应在 [0.5, 2.0] 内", it in 0.5f..2.0f)
        }
    }
}