package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 消息操作逻辑测试。
 *
 * 抽出来的理由是「菜单项是动态的」—— 不含代码块的消息不该出现
 * 「复制代码块」，否则是多一个点了没反应的项。这类判定属易错且可测。
 *
 * 变异验证：把 extractCodeBlocks 的未闭合处理改成「取到字符串末尾」，
 * 「未闭合的代码块不提取」用例失败。
 */
class MessageActionsTest {

    private fun msg(text: String) =
        ChatMessage(ChatMessage.newId(), "assistant", text, 0L)

    // ── extractCodeBlocks ──

    @Test
    fun `提取单个代码块`() {
        val t = "看这个：\n```kotlin\nfun main() {}\n```\n就这样"
        assertEquals(listOf("fun main() {}"), MessageActions.extractCodeBlocks(t))
    }

    @Test
    fun `提取多个代码块`() {
        val t = "```\na\n```\n中间\n```\nb\n```"
        assertEquals(listOf("a", "b"), MessageActions.extractCodeBlocks(t))
    }

    @Test
    fun `跳过语言标记行`() {
        // ```kotlin 的 kotlin 不该进内容
        assertEquals(listOf("val x = 1"), MessageActions.extractCodeBlocks("```kotlin\nval x = 1\n```"))
    }

    @Test
    fun `未闭合的代码块不提取`() {
        // 无法判断块到哪里结束；宁可少给，也不要给出被截断的内容
        // 让用户以为复制成功
        val t = "```kotlin\nfun main() {\n// 忘了闭合"
        assertTrue(MessageActions.extractCodeBlocks(t).isEmpty())
    }

    @Test
    fun `无代码块返回空`() {
        assertTrue(MessageActions.extractCodeBlocks("普通文本").isEmpty())
    }

    @Test
    fun `行内码不算代码块`() {
        // 单个 ` 是行内码，不该当块处理（否则会把整段当代码）
        assertTrue(MessageActions.extractCodeBlocks("这是 `行内码` 而已").isEmpty())
    }

    @Test
    fun `代码块内容保留缩进`() {
        // 缩进是代码语义的一部分，trim 掉会让复制出来的代码坏掉
        val t = "```\nif (x) {\n    y()\n}\n```"
        assertEquals("if (x) {\n    y()\n}", MessageActions.extractCodeBlocks(t)[0])
    }

    @Test
    fun `空代码块被提取为空串`() {
        assertEquals(listOf(""), MessageActions.extractCodeBlocks("```\n```"))
    }

    // ── quote ──

    @Test
    fun `引用给每行加前缀`() {
        val q = MessageActions.quote("第一行\n第二行")
        assertTrue(q.startsWith("> 第一行\n> 第二行"))
    }

    @Test
    fun `引用的空行保持引用标记`() {
        // 只给非空行加前缀会让空行成为正文，引用边界消失
        val q = MessageActions.quote("A\n\nB")
        assertTrue(q.contains("> A\n>\n> B"))
    }

    @Test
    fun `超长引用被截断并说明原长度`() {
        val long = (1..20).joinToString("\n") { "line$it" }
        val q = MessageActions.quote(long, maxLines = 5)
        assertTrue("应只保留 5 行", q.contains("> line5"))
        assertFalse("不应含第 6 行", q.contains("> line6"))
        assertTrue("应说明被截断", q.contains("20 行"))
    }

    @Test
    fun `引用末尾留空行便于续写`() {
        // 用户在引用下方继续输入，没有空行会紧贴引用
        assertTrue(MessageActions.quote("x").endsWith("\n\n"))
    }

    @Test
    fun `引用前先 trim 掉首尾空白`() {
        val q = MessageActions.quote("\n\n  内容  \n\n")
        assertTrue(q.startsWith("> 内容"))
    }

    // ── availableActions ──

    @Test
    fun `普通文本只有复制与引用与删除`() {
        val a = MessageActions.availableActions(msg("普通文本"))
        assertTrue(a.contains(MessageActions.Action.COPY_ALL))
        assertTrue(a.contains(MessageActions.Action.QUOTE))
        assertTrue(a.contains(MessageActions.Action.DELETE))
        assertFalse("无代码块时不应出现复制代码块", a.contains(MessageActions.Action.COPY_CODE))
    }

    @Test
    fun `含代码块时多出复制代码块`() {
        val a = MessageActions.availableActions(msg("```\nx\n```"))
        assertTrue(a.contains(MessageActions.Action.COPY_CODE))
    }

    @Test
    fun `空助手消息只剩重新生成与删除与选择多条`() {
        // 复制空文本无意义；引用空文本也没有内容。
        // 但「重新生成」仍应保留 —— 空回复（如只有工具调用没正文）
        // 恰恰是用户最想重跑的情形。
        val a = MessageActions.availableActions(msg(""))
        assertEquals(
            listOf(
                MessageActions.Action.REGENERATE,
                MessageActions.Action.DELETE,
                MessageActions.Action.SELECT_MULTIPLE,
            ),
            a,
        )
    }

    @Test
    fun `纯空白助手消息同样只剩重新生成与删除与选择多条`() {
        val a = MessageActions.availableActions(msg("   \n  "))
        assertEquals(
            listOf(
                MessageActions.Action.REGENERATE,
                MessageActions.Action.DELETE,
                MessageActions.Action.SELECT_MULTIPLE,
            ),
            a,
        )
    }

    @Test
    fun `空用户消息只剩删除与选择多条`() {
        // 用户消息没有重新生成项（用户消息不是「回复」）
        val a = MessageActions.availableActions(
            ChatMessage(ChatMessage.newId(), "user", "", 0L),
        )
        assertEquals(listOf(MessageActions.Action.DELETE, MessageActions.Action.SELECT_MULTIPLE), a)
    }

    @Test
    fun `任意消息菜单都含选择多条入口`() {
        // SELECT_MULTIPLE 是单条菜单通往批量模式的唯一入口，
        // 缺了它批量功能就只剩「从某条进」之外的死路 —— 必须常驻
        val a = MessageActions.availableActions(assistantMsg("回复内容"))
        assertTrue("普通助手消息应含选择多条", a.contains(MessageActions.Action.SELECT_MULTIPLE))
        val t = MessageActions.availableActions(toolMsg("▸ Bash", "ls", "ok"))
        assertTrue("工具气泡也应含选择多条", t.contains(MessageActions.Action.SELECT_MULTIPLE))
    }

    @Test
    fun `变异：选择多条不应被 availableActions 遗漏`() {
        // 把判定改成「不追加 SELECT_MULTIPLE」，本条应失败，
        // 确认它是真正被加入菜单的（而非写在 enum 里却从未返回）
        val a = MessageActions.availableActions(assistantMsg("回复内容"))
        assertTrue(a.contains(MessageActions.Action.SELECT_MULTIPLE))
    }

    // ── labelOf ──

    @Test
    fun `多个代码块时文案带数量`() {
        assertEquals("复制代码块（3 个）", MessageActions.labelOf(MessageActions.Action.COPY_CODE, 3))
    }

    @Test
    fun `单个代码块时文案不带数量`() {
        assertEquals("复制代码块", MessageActions.labelOf(MessageActions.Action.COPY_CODE, 1))
    }

    @Test
    fun `删除的文案说明仅本地`() {
        // 必须让用户知道只删本地 —— 否则会误以为删了服务端记录
        assertTrue(MessageActions.labelOf(MessageActions.Action.DELETE, 0).contains("仅本地"))
    }

    // ── withEditIfLast（D2 的位置相关判据）──

    private val base = listOf(
        MessageActions.Action.COPY_ALL,
        MessageActions.Action.QUOTE,
        MessageActions.Action.DELETE,
    )

    @Test
    fun `最后一条用户消息时多出编辑项`() {
        val a = MessageActions.withEditIfLast(base, isLastUser = true)
        assertTrue("应含编辑项", a.contains(MessageActions.Action.EDIT_LAST))
    }

    @Test
    fun `非最后一条时不出现编辑项`() {
        // 改历史中间的消息会让后续上下文失效 —— 故不提供入口
        val a = MessageActions.withEditIfLast(base, isLastUser = false)
        assertFalse("不应含编辑项", a.contains(MessageActions.Action.EDIT_LAST))
    }

    @Test
    fun `编辑项排在删除之前`() {
        // 编辑是正向操作，删除是破坏性的 —— 正向的靠前，
        // 降低用户手滑点到删除的概率
        val a = MessageActions.withEditIfLast(base, isLastUser = true)
        assertTrue(
            "编辑应在删除之前",
            a.indexOf(MessageActions.Action.EDIT_LAST) < a.indexOf(MessageActions.Action.DELETE),
        )
    }

    @Test
    fun `非最后一条时原样返回（不增不减）`() {
        val a = MessageActions.withEditIfLast(base, isLastUser = false)
        assertEquals(base, a)
    }

    @Test
    fun `幂等：连续调用两次不出现两个编辑项`() {
        val once = MessageActions.withEditIfLast(base, isLastUser = true)
        val twice = MessageActions.withEditIfLast(once, isLastUser = true)
        assertEquals(1, twice.count { it == MessageActions.Action.EDIT_LAST })
    }

    @Test
    fun `空动作列表且是最后一条时得到编辑与删除`() {
        // 实现总会补上 DELETE（删除对所有消息都可用），
        // 故空入参时结果是 [EDIT_LAST, DELETE] 而非只有 EDIT_LAST
        val a = MessageActions.withEditIfLast(emptyList(), isLastUser = true)
        assertEquals(
            listOf(MessageActions.Action.EDIT_LAST, MessageActions.Action.DELETE),
            a,
        )
    }

    @Test
    fun `非最后一条且已含编辑项时会被清掉`() {
        // 调用方可能传入上一次判断为「最后一条」的结果 ——
        // 必须清掉，否则非最后一条也会出现编辑入口
        val withEdit = listOf(
            MessageActions.Action.COPY_ALL,
            MessageActions.Action.EDIT_LAST,
            MessageActions.Action.DELETE,
        )
        val a = MessageActions.withEditIfLast(withEdit, isLastUser = false)
        assertFalse(a.contains(MessageActions.Action.EDIT_LAST))
    }

    // ── toolFullText（工具气泡复制全文）──

    private fun toolMsg(
        text: String,
        detail: String = "",
        result: String = "",
    ): ChatMessage = ChatMessage(
        id = ChatMessage.newId(),
        role = "tool",
        text = text,
        timestamp = 0L,
        toolDetail = detail,
        toolResult = result,
        toolState = "done",
    )

    @Test
    fun `工具气泡复制全文含标题原文与结果`() {
        val full = MessageActions.toolFullText(toolMsg("▸ Bash  ls", "ls -la", "total 4"))
        assertTrue("应含标题", full.contains("▸ Bash"))
        assertTrue("应含原文", full.contains("ls -la"))
        assertTrue("应含结果", full.contains("total 4"))
    }

    @Test
    fun `工具气泡无原文无结果时回落为标题`() {
        val full = MessageActions.toolFullText(toolMsg("▸ Bash  ls"))
        assertEquals("▸ Bash  ls", full)
    }

    @Test
    fun `普通消息的全文就是其文本`() {
        // 非工具消息不受影响，避免与既有复制逻辑冲突
        val m = msg("普通助手回复")
        assertEquals("普通助手回复", MessageActions.toolFullText(m))
    }

    // ── 工具气泡的菜单项 ──

    @Test
    fun `工具气泡菜单含仅复制命令与仅复制结果`() {
        val a = MessageActions.availableActions(toolMsg("▸ Bash", "ls -la", "total 4"))
        assertTrue("应有仅复制命令", a.contains(MessageActions.Action.COPY_TOOL_DETAIL))
        assertTrue("应有仅复制结果", a.contains(MessageActions.Action.COPY_TOOL_RESULT))
        assertTrue("应有复制全文", a.contains(MessageActions.Action.COPY_ALL))
    }

    @Test
    fun `工具气泡无原文时不出现仅复制命令`() {
        // 点了没反应的菜单项比没有更糟
        val a = MessageActions.availableActions(toolMsg("▸ Bash", result = "output"))
        assertFalse(a.contains(MessageActions.Action.COPY_TOOL_DETAIL))
        assertTrue(a.contains(MessageActions.Action.COPY_TOOL_RESULT))
    }

    @Test
    fun `工具气泡无结果时不出现仅复制结果`() {
        val a = MessageActions.availableActions(toolMsg("▸ Bash", detail = "ls"))
        assertTrue(a.contains(MessageActions.Action.COPY_TOOL_DETAIL))
        assertFalse(a.contains(MessageActions.Action.COPY_TOOL_RESULT))
    }

    @Test
    fun `工具气泡不出现引用与编辑项`() {
        // 引用一条工具调用对对话没有意义；编辑工具没有语义
        val a = MessageActions.availableActions(toolMsg("▸ Bash", "ls", "ok"))
        assertFalse("不应有引用", a.contains(MessageActions.Action.QUOTE))
        assertFalse("不应有编辑", a.contains(MessageActions.Action.EDIT_LAST))
        assertFalse("不应有复制代码块", a.contains(MessageActions.Action.COPY_CODE))
    }

    @Test
    fun `工具气泡始终可删除`() {
        val a = MessageActions.availableActions(toolMsg("▸ Bash"))
        assertTrue(a.contains(MessageActions.Action.DELETE))
    }

    @Test
    fun `仅复制命令与仅复制结果的文案明确`() {
        assertEquals("仅复制命令", MessageActions.labelOf(MessageActions.Action.COPY_TOOL_DETAIL, 0))
        assertEquals("仅复制结果", MessageActions.labelOf(MessageActions.Action.COPY_TOOL_RESULT, 0))
    }

    // ── REGENERATE（重新生成回复）──

    private fun assistantMsg(text: String) =
        ChatMessage(ChatMessage.newId(), "assistant", text, 0L)

    @Test
    fun `助手消息含重新生成项`() {
        val a = MessageActions.availableActions(assistantMsg("回复内容"))
        assertTrue(a.contains(MessageActions.Action.REGENERATE))
    }

    @Test
    fun `用户消息不含重新生成项`() {
        // 用户消息没有「回复」可重新生成
        val a = MessageActions.availableActions(
            ChatMessage(ChatMessage.newId(), "user", "提问", 0L),
        )
        assertFalse(a.contains(MessageActions.Action.REGENERATE))
    }

    @Test
    fun `工具气泡不含重新生成项`() {
        val a = MessageActions.availableActions(toolMsg("▸ Bash"))
        assertFalse(a.contains(MessageActions.Action.REGENERATE))
    }

    @Test
    fun `最后一条助手回复保留重新生成项`() {
        val a = MessageActions.withRegenerateIfLast(
            listOf(MessageActions.Action.COPY_ALL, MessageActions.Action.REGENERATE, MessageActions.Action.DELETE),
            isLastAssistant = true,
        )
        assertTrue(a.contains(MessageActions.Action.REGENERATE))
    }

    @Test
    fun `非最后一条助手回复移除重新生成项`() {
        // 关键：实现是「重跑最后一轮」。若对中间的历史回复点它，
        // 用户以为重生成那一条，实际却重跑了最新的 —— 行为与预期不符。
        val a = MessageActions.withRegenerateIfLast(
            listOf(MessageActions.Action.COPY_ALL, MessageActions.Action.REGENERATE, MessageActions.Action.DELETE),
            isLastAssistant = false,
        )
        assertFalse(a.contains(MessageActions.Action.REGENERATE))
    }

    @Test
    fun `重新生成的文案明确`() {
        assertEquals("重新生成回复", MessageActions.labelOf(MessageActions.Action.REGENERATE, 0))
    }

    @Test
    fun `重新生成不影响编辑项的位置判据（两个判据独立）`() {
        // 两者位置判据不同（用户消息 vs 助手消息），需能各自独立生效
        val forAssistant = MessageActions.withRegenerateIfLast(
            MessageActions.withEditIfLast(
                listOf(MessageActions.Action.COPY_ALL, MessageActions.Action.REGENERATE, MessageActions.Action.DELETE),
                isLastUser = false,
            ),
            isLastAssistant = true,
        )
        assertTrue("助手场景：应保留重新生成", forAssistant.contains(MessageActions.Action.REGENERATE))
        assertFalse("助手场景：不应有编辑项", forAssistant.contains(MessageActions.Action.EDIT_LAST))
    }
}
