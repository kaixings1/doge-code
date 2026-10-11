package com.dogecode.mobile

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * agent 循环测试（本地模式最需要验证的一环）。
 *
 * 三个边界的错误代价都很大，且不会抛异常：
 * ① 无轮数上限 → **无限调用 API 烧钱**，界面一直转
 * ② 终止判据错（「有正文就停」）→ 任务做一半就停
 * ③ 回填缺 toolCallId → 模型看不懂结果，重复调用同一工具
 *
 * 用注入的假 chatFn 穷举这些路径（不起 HTTP 服务）。
 *
 * 变异验证：把终止判据从 `toolCalls.isEmpty()` 改成 `text.isNotEmpty()`，
 * 「模型说一句再调工具时不停」用例失败。
 */
class AgentLoopTest {

    private lateinit var root: File

    @Before
    fun setUp() {
        root = File.createTempFile("loop-test", "").apply {
            delete()
            mkdirs()
        }
    }

    @After
    fun tearDown() {
        root.deleteRecursively()
    }

    /** 造一次「模型回复」。 */
    private fun reply(
        text: String = "",
        tools: List<ToolCall> = emptyList(),
    ) = ChatResult(text, tools, if (tools.isEmpty()) "stop" else "tool_calls")

    private fun toolCall(name: String, args: String, id: String = "c1") = ToolCall(id, name, args)

    /** 按顺序返回预设回复的循环。 */
    private fun loopOf(
        vararg replies: ChatResult,
        captured: MutableList<List<ChatMsg>>? = null,
        toolFn: ((String, String) -> LocalTools.ToolResult)? = null,
    ): AgentLoop {
        var i = 0
        val chatFn: (List<ChatMsg>, List<ToolSpec>) -> ChatResult = { msgs, _ ->
            captured?.add(msgs.toList())
            replies[minOf(i, replies.size - 1)].also { i++ }
        }
        return AgentLoop(
            workspace = root,
            chatFn = chatFn,
            toolFn = toolFn ?: { name, args -> LocalTools.execute(root, name, args) },
            systemPrompt = "SYS",
        )
    }

    // ── 基本路径 ──

    @Test
    fun `模型直接回答时不调用工具即结束`() {
        val loop = loopOf(reply(text = "你好"))
        val r = loop.run(emptyList(), "hi")
        assertEquals("你好", r.text)
        assertEquals(AgentLoop.FinishReason.DONE, r.reason)
        assertEquals(1, r.turns)
        assertTrue(r.isDone)
    }

    @Test
    fun `系统提示词作为首条消息`() {
        val captured = mutableListOf<List<ChatMsg>>()
        val loop = loopOf(reply(text = "x"), captured = captured)
        loop.run(emptyList(), "hi")
        assertEquals("system", captured[0][0].role)
        assertEquals("SYS", captured[0][0].content)
    }

    @Test
    fun `历史消息被带入`() {
        val captured = mutableListOf<List<ChatMsg>>()
        val loop = loopOf(reply(text = "x"), captured = captured)
        loop.run(listOf(ChatMsg.user("早前的话")), "现在说的话")
        // [system, 历史, 本次输入]
        assertEquals(3, captured[0].size)
        assertEquals("早前的话", captured[0][1].content)
        assertEquals("现在说的话", captured[0][2].content)
    }

    @Test
    fun `无系统提示词时不插入 system 消息`() {
        val captured = mutableListOf<List<ChatMsg>>()
        var i = 0
        val loop = AgentLoop(
            workspace = root,
            chatFn = { m, _ -> captured.add(m.toList()); reply(text = "x") },
            systemPrompt = "",
        )
        loop.run(emptyList(), "hi")
        assertEquals("user", captured[0][0].role)
    }

    // ── 工具调用路径 ──

    @Test
    fun `模型请求工具后执行并回填`() {
        File(root, "a.txt").writeText("内容")
        val steps = mutableListOf<AgentLoop.Step>()
        val loop = loopOf(
            reply(tools = listOf(toolCall("read_file", """{"path":"a.txt"}"""))),
            reply(text = "读到了"),
        )
        val r = loop.run(emptyList(), "读一下", onStep = { steps.add(it) })

        assertEquals("读到了", r.text)
        assertEquals(2, r.turns)
        assertTrue("应有 ToolCalling 事件", steps.any { it is AgentLoop.Step.ToolCalling })
        assertTrue("应有 ToolDone 事件", steps.any { it is AgentLoop.Step.ToolDone })
    }

    @Test
    fun `工具结果带 toolCallId 回填（关键）`() {
        // 缺 id 模型无法对应「哪次调用的结果」，会重复调用同一工具
        val captured = mutableListOf<List<ChatMsg>>()
        File(root, "a.txt").writeText("x")
        val loop = loopOf(
            reply(tools = listOf(toolCall("read_file", """{"path":"a.txt"}""", id = "call_abc"))),
            reply(text = "完成"),
            captured = captured,
        )
        loop.run(emptyList(), "读")

        val toolMsg = captured[1].first { it.role == "tool" }
        assertEquals("call_abc", toolMsg.toolCallId)
    }

    @Test
    fun `模型的 assistant 输出（含 tool_calls）被写回历史`() {
        // 不写回 → 下一轮模型看不到自己刚请求过什么 → 重复调用
        val captured = mutableListOf<List<ChatMsg>>()
        File(root, "a.txt").writeText("x")
        val loop = loopOf(
            reply(tools = listOf(toolCall("read_file", """{"path":"a.txt"}"""))),
            reply(text = "完成"),
            captured = captured,
        )
        loop.run(emptyList(), "读")

        val assistantMsg = captured[1].first { it.role == "assistant" }
        assertEquals(1, assistantMsg.toolCalls.size)
        assertEquals("read_file", assistantMsg.toolCalls[0].name)
    }

    @Test
    fun `多个工具调用都被执行`() {
        File(root, "a.txt").writeText("A")
        File(root, "b.txt").writeText("B")
        val done = mutableListOf<String>()
        val loop = loopOf(
            reply(
                tools = listOf(
                    toolCall("read_file", """{"path":"a.txt"}""", "c1"),
                    toolCall("read_file", """{"path":"b.txt"}""", "c2"),
                ),
            ),
            reply(text = "都读完了"),
        )
        loop.run(emptyList(), "读两个", onStep = {
            if (it is AgentLoop.Step.ToolDone) done.add(it.name)
        })
        assertEquals(2, done.size)
    }

    @Test
    fun `工具失败时把错误回填而非中断`() {
        // 模型看到「文件不存在」通常能换一种做法
        val captured = mutableListOf<List<ChatMsg>>()
        val loop = loopOf(
            reply(tools = listOf(toolCall("read_file", """{"path":"nope.txt"}"""))),
            reply(text = "那算了"),
            captured = captured,
        )
        val r = loop.run(emptyList(), "读不存在的")

        assertEquals(AgentLoop.FinishReason.DONE, r.reason)
        val toolMsg = captured[1].first { it.role == "tool" }
        assertTrue("错误应回填给模型", toolMsg.content!!.contains("不存在"))
    }

    @Test
    fun `工具越界时把拒绝原因回填`() {
        val captured = mutableListOf<List<ChatMsg>>()
        val loop = loopOf(
            reply(tools = listOf(toolCall("read_file", """{"path":"../../etc/passwd"}"""))),
            reply(text = "明白了"),
            captured = captured,
        )
        loop.run(emptyList(), "读外部文件")
        val toolMsg = captured[1].first { it.role == "tool" }
        assertTrue("应告知越界", toolMsg.content!!.contains("工作区"))
    }

    // ── 终止判据（最关键）──

    @Test
    fun `模型说一句再调工具时不停（关键）`() {
        // 「有正文就停」的判据会在这里失败：模型常说「我先看一下」+ 调工具
        val loop = loopOf(
            reply(text = "我先看一下", tools = listOf(toolCall("read_file", """{"path":"a.txt"}"""))),
            reply(text = "看完了"),
        )
        File(root, "a.txt").writeText("x")
        val r = loop.run(emptyList(), "看看")

        assertEquals("应跑到第二轮", 2, r.turns)
        assertEquals("看完了", r.text)
    }

    @Test
    fun `只有工具调用没有正文也能继续`() {
        // 模型常只发 tool_calls 不带任何文本
        File(root, "a.txt").writeText("x")
        val loop = loopOf(
            reply(text = "", tools = listOf(toolCall("read_file", """{"path":"a.txt"}"""))),
            reply(text = "结果如下"),
        )
        val r = loop.run(emptyList(), "读")
        assertEquals("结果如下", r.text)
        assertEquals(2, r.turns)
    }

    @Test
    fun `最终文本取最后一次的正文`() {
        val loop = loopOf(
            reply(text = "中间过程", tools = listOf(toolCall("list_dir", """{"path":"."}"""))),
            reply(text = "最终答案"),
        )
        assertEquals("最终答案", loop.run(emptyList(), "做").text)
    }

    // ── 轮数上限（防烧钱）──

    @Test
    fun `达到最大轮数时停止并报告 MAX_STEPS`() {
        // 模型一直请求工具不给答案 —— 无上限会无限调 API 烧钱
        val loop = loopOf(reply(text = "继续", tools = listOf(toolCall("list_dir", """{"path":"."}"""))))
        loop.maxSteps = 3
        val r = loop.run(emptyList(), "无限任务")

        assertEquals(AgentLoop.FinishReason.MAX_STEPS, r.reason)
        assertEquals(3, r.turns)
        assertFalse("截断不算正常完成", r.isDone)
    }

    @Test
    fun `截断时仍返回已有的文本（不假装成功）`() {
        val loop = loopOf(reply(text = "部分结果", tools = listOf(toolCall("list_dir", """{"path":"."}"""))))
        loop.maxSteps = 2
        val r = loop.run(emptyList(), "x")
        assertEquals("部分结果", r.text)
        assertEquals(AgentLoop.FinishReason.MAX_STEPS, r.reason)
    }

    @Test
    fun `默认上限是 25 轮`() {
        assertEquals(25, AgentLoop.DEFAULT_MAX_STEPS)
        assertEquals(25, AgentLoop(root, { _, _ -> reply() }).maxSteps)
    }

    @Test
    fun `恰好用完轮数上限时按上限结束`() {
        // maxSteps=2：第一轮调工具，第二轮给答案 —— 应正常结束（不截断）
        File(root, "a.txt").writeText("x")
        val loop = loopOf(
            reply(tools = listOf(toolCall("read_file", """{"path":"a.txt"}"""))),
            reply(text = "答案"),
        )
        loop.maxSteps = 2
        assertEquals(AgentLoop.FinishReason.DONE, loop.run(emptyList(), "x").reason)
    }

    // ── 中断 ──

    @Test
    fun `shouldStop 为真时立刻中止`() {
        val loop = loopOf(reply(text = "不该被调用"))
        val r = loop.run(emptyList(), "x", shouldStop = { true })
        assertEquals(AgentLoop.FinishReason.INTERRUPTED, r.reason)
        assertEquals(0, r.turns)
    }

    @Test
    fun `中断在每轮开始检查（不等工具跑完）`() {
        var calls = 0
        // 第一次检查返回 false（允许开始），之后返回 true
        val loop = loopOf(
            reply(tools = listOf(toolCall("list_dir", """{"path":"."}"""))),
            reply(text = "不该到这一轮"),
        )
        val r = loop.run(emptyList(), "x", shouldStop = { calls++ > 0 })
        assertEquals(AgentLoop.FinishReason.INTERRUPTED, r.reason)
        assertEquals("只跑了一轮", 1, r.turns)
    }

    // ── Step 事件 ──

    @Test
    fun `事件顺序符合预期`() {
        File(root, "a.txt").writeText("x")
        val kinds = mutableListOf<String>()
        val loop = loopOf(
            reply(tools = listOf(toolCall("read_file", """{"path":"a.txt"}"""))),
            reply(text = "完成"),
        )
        loop.run(emptyList(), "读", onStep = {
            kinds.add(
                when (it) {
                    is AgentLoop.Step.ToolCalling -> "call"
                    is AgentLoop.Step.ToolDone -> "done"
                    is AgentLoop.Step.Text -> "text"
                    is AgentLoop.Step.Finished -> "finished"
                },
            )
        })
        assertEquals(listOf("call", "done", "text", "finished"), kinds)
    }

    @Test
    fun `工具结果摘要被截断为单行`() {
        // 长输出（如读文件）不该把 UI 撑爆
        val long = "line1\nline2\n" + "x".repeat(500)
        val s = AgentLoop.summarize(long)
        assertFalse("应无换行", s.contains("\n"))
        assertTrue("应被截断", s.length <= 121)
    }

    @Test
    fun `摘要对短内容原样返回`() {
        assertEquals("短内容", AgentLoop.summarize("短内容"))
    }

    // ── 注入 toolFn 的能力（便于模拟极端情况）──

    @Test
    fun `工具抛异常时循环不崩`() {
        val loop = loopOf(
            reply(tools = listOf(toolCall("read_file", """{"path":"a.txt"}"""))),
            reply(text = "继续"),
            toolFn = { name, _ -> LocalTools.ToolResult.error(name, "模拟异常") },
        )
        val r = loop.run(emptyList(), "x")
        assertEquals(AgentLoop.FinishReason.DONE, r.reason)
    }
}
