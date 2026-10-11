package com.dogecode.mobile

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * L2 的两块契约：todo 工具与 usage 解析。
 *
 * ## todo 为什么必须测
 *
 * 「整表替换 + 状态机」错了全是静默的：清单没更新 → 模型以为自己
 * 报过进度、用户看不到；状态校验失效 → 模型把所有任务标 completed
 * 却没做完。二者都不会报错。
 *
 * ## usage 为什么必须测
 *
 * SseParser 此前**丢弃** usage 字段（grep 确认零引用）—— `/cost` 没有
 * 数据源。解析位置有讲究：usage 在「choices 为空」的收尾帧里，
 * 放在早退之后就永远读不到（这正是首版易错点）。
 */
class LocalTodoUsageTest {

    private lateinit var root: File

    @Before
    fun setUp() {
        root = File.createTempFile("todo-test", "").apply {
            delete()
            mkdirs()
        }
        LocalTools.clearTodos()
    }

    @After
    fun tearDown() {
        root.deleteRecursively()
        LocalTools.clearTodos()
    }

    private fun exec(json: String) = LocalTools.execute(root, "todo", json)

    // ── todo 工具 ──

    @Test
    fun `建清单后 currentTodoContext 反映状态`() {
        val r = exec(
            """{"todos":[
                {"content":"读配置","status":"completed"},
                {"content":"改实现","status":"in_progress"},
                {"content":"验证","status":"pending"}
            ]}""",
        )
        assertTrue(r.ok)
        val ctx = LocalTools.currentTodoContext()!!
        assertTrue("完成的应有 ✓", ctx.contains("✓ 1. 读配置"))
        assertTrue("进行中的应有 ▶ 与标注", ctx.contains("▶ 2. 改实现（进行中）"))
        assertTrue("未开始的不带标注", ctx.contains(" 3. 验证"))
    }

    @Test
    fun `空清单时 context 为 null（不注入省 token）`() {
        assertNull(LocalTools.currentTodoContext())
    }

    @Test
    fun `整表替换而非追加`() {
        exec("""{"todos":[{"content":"旧任务","status":"pending"}]}""")
        exec("""{"todos":[{"content":"新任务","status":"pending"}]}""")
        val ctx = LocalTools.currentTodoContext()!!
        assertTrue("旧任务应被替换掉", !ctx.contains("旧任务"))
        assertTrue(ctx.contains("新任务"))
    }

    @Test
    fun `清空待办`() {
        exec("""{"todos":[{"content":"x","status":"pending"}]}""")
        LocalTools.clearTodos()
        assertNull(LocalTools.currentTodoContext())
    }

    @Test
    fun `非法 status 被拒绝并指明合法值`() {
        val r = exec("""{"todos":[{"content":"x","status":"doing"}]}""")
        assertTrue(r.ok.not())
        assertTrue("错误信息应列出合法值", r.content.contains("pending / in_progress / completed"))
        // 拒绝时不落任何状态（清单保持空）
        assertNull(LocalTools.currentTodoContext())
    }

    @Test
    fun `多个 in_progress 被拒绝`() {
        // 吸收自 CLI 的规则：同一时间只应有一个进行中 ——
        // 多个进行中意味着模型没有真正聚焦
        val r = exec(
            """{"todos":[
                {"content":"a","status":"in_progress"},
                {"content":"b","status":"in_progress"}
            ]}""",
        )
        assertTrue(r.ok.not())
        assertTrue(r.content.contains("in_progress"))
    }

    @Test
    fun `空 content 被拒绝`() {
        val r = exec("""{"todos":[{"content":"  ","status":"pending"}]}""")
        assertTrue(r.ok.not())
    }

    @Test
    fun `缺 todos 数组报错`() {
        val r = exec("{}")
        assertTrue(r.ok.not())
        assertTrue(r.content.contains("todos"))
    }

    @Test
    fun `超上限拒绝`() {
        val many = (1..LocalTools.MAX_TODOS + 1).joinToString(",") {
            """{"content":"t$it","status":"pending"}"""
        }
        val r = exec("""{"todos":[$many]}""")
        assertTrue(r.ok.not())
        assertTrue(r.content.contains("最多"))
    }

    @Test
    fun `系统提示词提及 todo 工具（双向契约）`() {
        val prompt = SystemPrompt.build("test")
        assertTrue("提示词应列 todo", prompt.contains("todo"))
        assertTrue("应指引多步任务建清单", prompt.contains("多步任务"))
    }

    // ── SseParser 的 usage 解析 ──

    @Test
    fun `收尾帧的 usage 被解析（choices 为空也不丢）`() {
        // OpenAI 兼容流的收尾帧：choices 是空数组、usage 在顶层。
        // 解析必须在「取不到 choice」的早退**之前**吸收 usage ——
        // 这是本实现最易错的一处
        val parser = SseParser()
        parser.feed("""data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":50}}""")
        val u = parser.result().usage
        assertNotNull("收尾帧的 usage 必须被解析", u)
        assertEquals(100, u!!.promptTokens)
        assertEquals(50, u.completionTokens)
    }

    @Test
    fun `普通帧带的 usage 也能解析`() {
        val parser = SseParser()
        parser.feed(
            """data: {"choices":[{"delta":{"content":"hi"}}],"usage":{"prompt_tokens":10,"completion_tokens":5}}""",
        )
        val u = parser.result().usage
        assertNotNull(u)
        assertEquals(10, u!!.promptTokens)
        assertEquals(5, u.completionTokens)
    }

    @Test
    fun `无 usage 时为 null（UI 显示而非编造 0）`() {
        val parser = SseParser()
        parser.feed("""data: {"choices":[{"delta":{"content":"hi"}}]}""")
        assertNull(parser.result().usage)
    }

    @Test
    fun `多次出现取最后一次（全程值覆盖中间值）`() {
        val parser = SseParser()
        parser.feed("""data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}""")
        parser.feed("""data: {"choices":[],"usage":{"prompt_tokens":200,"completion_tokens":80}}""")
        val u = parser.result().usage!!
        assertEquals(200, u.promptTokens)
        assertEquals(80, u.completionTokens)
    }

    // ── AgentLoop 的 usage 累计 ──

    @Test
    fun `多轮调用的 usage 逐轮累加`() {
        var call = 0
        val loop = AgentLoop(
            workspace = root,
            chatFn = { _, _ ->
                call++
                // 第一轮带工具调用，第二轮纯文本结束
                if (call == 1) {
                    ChatResult(
                        text = "",
                        toolCalls = listOf(ToolCall("c1", "read_file", """{"path":"a"}""")),
                        finishReason = "tool_calls",
                        usage = ChatUsage(100, 20),
                    )
                } else {
                    ChatResult("done", emptyList(), "stop", usage = ChatUsage(150, 30))
                }
            },
        )
        val result = loop.run(emptyList(), "go")
        assertEquals(2, result.turns)
        val u = result.usage!!
        assertEquals("prompt 应累计 100+150", 250, u.promptTokens)
        assertEquals("completion 应累计 20+30", 50, u.completionTokens)
    }

    @Test
    fun `服务端不给 usage 时 RunResult 的 usage 为各轮 null 之和的兜底`() {
        // 全程无 usage：返回 0,0（而非 null 混 null）—— UI 显示「无统计」
        val loop = AgentLoop(
            workspace = root,
            chatFn = { _, _ -> ChatResult("done", emptyList(), "stop", usage = null) },
        )
        val result = loop.run(emptyList(), "go")
        assertEquals(0, result.usage!!.promptTokens)
        assertEquals(0, result.usage!!.completionTokens)
    }

    // ── AgentLoop 的 todo 注入 ──

    @Test
    fun `有待办时每轮注入清单上下文`() {
        exec("""{"todos":[{"content":"任务A","status":"in_progress"}]}""")
        val captured = mutableListOf<List<ChatMsg>>()
        var call = 0
        val loop = AgentLoop(
            workspace = root,
            chatFn = { msgs, _ ->
                captured.add(msgs.toList())
                call++
                if (call == 1) {
                    ChatResult(
                        "",
                        listOf(ToolCall("c1", "read_file", """{"path":"a"}""")),
                        "tool_calls",
                    )
                } else {
                    ChatResult("done", emptyList(), "stop")
                }
            },
            systemPrompt = "SYS",
        )
        loop.run(emptyList(), "go")
        // 两轮都注入了清单（不是只第一轮）
        captured.forEach { msgs ->
            assertTrue(
                "每轮都应看到待办清单",
                msgs.any { it.role == "system" && it.content.orEmpty().contains("任务A") },
            )
        }
    }

    @Test
    fun `无待办时不注入（省 token）`() {
        val captured = mutableListOf<List<ChatMsg>>()
        val loop = AgentLoop(
            workspace = root,
            chatFn = { msgs, _ ->
                captured.add(msgs.toList())
                ChatResult("done", emptyList(), "stop")
            },
            systemPrompt = "SYS",
        )
        loop.run(emptyList(), "go")
        // 只有 system prompt + user，没有额外的清单消息
        assertEquals(2, captured[0].size)
    }
}
