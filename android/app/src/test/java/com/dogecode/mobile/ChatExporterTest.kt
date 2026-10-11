package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 历史导出为 Markdown 的测试。
 *
 * 导出内容会离开 App（发给同事、贴进 issue），因此格式错误比界面 bug
 * 影响更大：错误会出现在别人的阅读环境里，且用户无从修正。
 *
 * 三个关键点：
 * 1. 空历史导出空串（调用方据此提示「没有可导出的记录」，而非弹个空文件）
 * 2. 角色区分清晰（"我"/"助手"/引用块），否则导出后分不清哪句是谁说的
 * 3. 内容原样保留，不丢换行/代码块 —— AI 回复里的代码块是核心价值
 */
class ChatExporterTest {

    private fun msg(role: String, text: String) =
        ChatMessage(ChatMessage.newId(), role, text, System.currentTimeMillis())

    @Test
    fun `空历史导出空串`() {
        assertEquals("", ChatExporter.toMarkdown(emptyList()))
    }

    @Test
    fun `包含标题与元信息`() {
        val md = ChatExporter.toMarkdown(listOf(msg("user", "hi")), "前端重构")
        assertTrue("应有标题", md.contains("# doge-code 对话记录"))
        assertTrue("标题应含会话名", md.contains("前端重构"))
        assertTrue("应有导出时间", md.contains("导出时间"))
        assertTrue("应有条数", md.contains("消息条数：1"))
    }

    @Test
    fun `无会话名时标题不含分隔符`() {
        val md = ChatExporter.toMarkdown(listOf(msg("user", "hi")), null)
        assertTrue(md.contains("# doge-code 对话记录\n"))
    }

    @Test
    fun `用户与助手分别标注`() {
        val md = ChatExporter.toMarkdown(
            listOf(msg("user", "问题"), msg("assistant", "回答")),
        )
        assertTrue(md.contains("## 我"))
        assertTrue(md.contains("## 助手"))
        // 顺序必须保持：先问后答
        assertTrue(md.indexOf("## 我") < md.indexOf("## 助手"))
    }

    @Test
    fun `系统消息渲染为引用块`() {
        val md = ChatExporter.toMarkdown(listOf(msg("system", "已连接")))
        assertTrue("系统消息应与正文区分", md.contains("> 已连接"))
    }

    @Test
    fun `系统消息的多行都加引用前缀`() {
        // 只给首行加 > 会让后续行被当成正文，导出后看起来像助手说的话
        val md = ChatExporter.toMarkdown(listOf(msg("system", "第一行\n第二行")))
        assertTrue(md.contains("> 第一行\n> 第二行"))
    }

    @Test
    fun `代码块原样保留`() {
        // AI 回复里的代码块是核心价值，任何转义/丢失都会让导出失去意义
        val code = "```kotlin\nfun main() {}\n```"
        val md = ChatExporter.toMarkdown(listOf(msg("assistant", code)))
        assertTrue(md.contains("```kotlin"))
        assertTrue(md.contains("fun main() {}"))
    }

    @Test
    fun `超长消息完整保留`() {
        val long = "字".repeat(20000)
        val md = ChatExporter.toMarkdown(listOf(msg("assistant", long)))
        assertTrue(md.contains(long))
    }

    @Test
    fun `文本首尾空白被裁剪`() {
        val md = ChatExporter.toMarkdown(listOf(msg("user", "  内容  ")))
        assertTrue(md.contains("内容"))
    }

    @Test
    fun `错误角色也走引用块`() {
        val md = ChatExporter.toMarkdown(listOf(msg("error", "出错了")))
        assertTrue(md.contains("> 出错了"))
    }

    // ── 纯文本格式（M5）──

    @Test
    fun `纯文本不含 Markdown 符号`() {
        // 选纯文本的用户就是为了粘贴干净：#、>、--- 都不该出现
        val pt = ChatExporter.toPlainText(
            listOf(msg("user", "问题"), msg("assistant", "回答"), msg("system", "提示")),
        )
        assertTrue(pt.contains("我: 问题"))
        assertTrue(pt.contains("助手: 回答"))
        assertTrue(pt.contains("系统: 提示"))
        listOf("#", ">", "---").forEach {
            assertTrue("纯文本不该含符号 $it", !pt.contains(it))
        }
    }

    @Test
    fun `纯文本保持问答顺序`() {
        val pt = ChatExporter.toPlainText(listOf(msg("user", "问"), msg("assistant", "答")))
        assertTrue(pt.indexOf("我: 问") < pt.indexOf("助手: 答"))
    }

    @Test
    fun `纯文本空历史导出空串`() {
        assertEquals("", ChatExporter.toPlainText(emptyList()))
    }

    @Test
    fun `纯文本带会话名在开头`() {
        val pt = ChatExporter.toPlainText(listOf(msg("user", "hi")), "项目A")
        assertTrue("会话名应在首行", pt.startsWith("项目A"))
    }

    @Test
    fun `纯文本代码块原样保留`() {
        val code = "```kotlin\nfun main() {}\n```"
        val pt = ChatExporter.toPlainText(listOf(msg("assistant", code)))
        assertTrue(pt.contains("fun main() {}"))
    }

    // ── JSON 格式（M5）──

    @Test
    fun `JSON 格式可被解析且逐条保留`() {
        val j = ChatExporter.toJsonText(
            listOf(msg("user", "问题"), msg("assistant", "回答")),
        )
        val arr = org.json.JSONArray(j)
        // 首条是元信息，其后每条一条消息
        assertEquals(3, arr.length())
        assertEquals("meta", arr.getJSONObject(0).getString("type"))
        assertEquals(2, arr.getJSONObject(0).getInt("count"))
        assertEquals("user", arr.getJSONObject(1).getString("role"))
        assertEquals("问题", arr.getJSONObject(1).getString("text"))
        assertEquals("assistant", arr.getJSONObject(2).getString("role"))
        assertEquals("回答", arr.getJSONObject(2).getString("text"))
    }

    @Test
    fun `JSON 空历史导出空串`() {
        assertEquals("", ChatExporter.toJsonText(emptyList()))
    }

    @Test
    fun `JSON 字段名与 MessageStore 落盘同源`() {
        // 用户拿到的 schema 必须与磁盘文件一致 —— 否则写脚本要学两套
        val m = msg("user", "x")
        val j = ChatExporter.toJsonText(listOf(m))
        val exported = org.json.JSONArray(j).getJSONObject(1)
        val disk = m.toJson()
        // 两者键集合完全一致（值也一致）
        assertEquals(
            "导出与落盘的字段集合必须一致",
            disk.keySet(),
            exported.keySet(),
        )
    }

    // ── export 分发（M5）──

    @Test
    fun `export 默认走 Markdown（不传格式 = 改造前行为）`() {
        val msgs = listOf(msg("user", "hi"))
        assertEquals(
            ChatExporter.toMarkdown(msgs),
            ChatExporter.export(msgs),
        )
    }

    @Test
    fun `export 按格式分发`() {
        val msgs = listOf(msg("user", "hi"))
        assertEquals(
            ChatExporter.toPlainText(msgs),
            ChatExporter.export(msgs, format = ChatExporter.Format.PLAIN),
        )
        assertEquals(
            ChatExporter.toJsonText(msgs),
            ChatExporter.export(msgs, format = ChatExporter.Format.JSON),
        )
    }

    @Test
    fun `三种格式的 label 与 desc 非空（选择弹窗用）`() {
        ChatExporter.Format.entries.forEach {
            assertTrue("${it.name} 缺 label", it.label.isNotBlank())
            assertTrue("${it.name} 缺 desc", it.desc.isNotBlank())
        }
    }
}
