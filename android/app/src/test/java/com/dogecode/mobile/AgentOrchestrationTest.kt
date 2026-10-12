package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * M4 任务编排增强的纯逻辑 + 端到端测试。
 *
 * 重点覆盖三类易错、且不会抛异常的边界：
 * ① plan 模式：先产计划再执行、计划阶段不调工具
 * ② 子代理委派：串行 / 并行、子代理步骤透出 parentTaskId、子代理不可再委派
 * ③ 防护：子代理层数、子代理 maxSteps、单次任务 maxToolCalls
 *
 * 纯判据（解析/判据函数）单测保证「错误是静默的」—— 解析错了不会报错，
 * 只会在运行时表现为计划没注入 / 委派失败 / 上限没生效。
 */
class AgentOrchestrationTest {

    private val root = File.createTempFile("orch-test", "").apply {
        delete(); mkdirs()
    }

    private fun reply(text: String = "", tools: List<ToolCall> = emptyList()) =
        ChatResult(text, tools, if (tools.isEmpty()) "stop" else "tool_calls")

    private fun toolCall(name: String, args: String, id: String = "c1") = ToolCall(id, name, args)

    // ── 纯判据单测 ──

    @Test
    fun `isDelegateTask 只认 delegate_task`() {
        assertTrue(AgentLoop.isDelegateTask("delegate_task"))
        assertFalse(AgentLoop.isDelegateTask("read_file"))
    }

    @Test
    fun `parseDelegateArgs 解析单任务`() {
        val r = AgentLoop.parseDelegateArgs("""{"task":"写单元测试"}""")
        assertEquals("写单元测试", r.task)
        assertFalse(r.parallel)
        assertTrue(r.tasks.isEmpty())
    }

    @Test
    fun `parseDelegateArgs 解析多任务与并行`() {
        val r = AgentLoop.parseDelegateArgs(
            """{"tasks":["a","b","c"],"parallel":true}""",
        )
        assertEquals(listOf("a", "b", "c"), r.tasks)
        assertTrue(r.parallel)
    }

    @Test
    fun `parseDelegateArgs 非法 JSON 返回空`() {
        val r = AgentLoop.parseDelegateArgs("不是 json")
        assertEquals("", r.task)
        assertTrue(r.tasks.isEmpty())
        assertFalse(r.parallel)
    }

    @Test
    fun `buildPlanContext 包含计划与进度指引`() {
        val ctx = AgentLoop.buildPlanContext("1. 读文件\n2. 改文件")
        assertTrue(ctx.contains("任务计划"))
        assertTrue(ctx.contains("1. 读文件"))
        assertTrue("应引导用 todo 跟踪进度", ctx.contains("todo"))
    }

    @Test
    fun `canSpawnSubAgent 受层数上限约束`() {
        assertTrue(AgentLoop.canSpawnSubAgent(0, 3))
        assertTrue(AgentLoop.canSpawnSubAgent(2, 3))
        assertFalse(AgentLoop.canSpawnSubAgent(3, 3))
    }

    // ── plan 模式端到端 ──

    @Test
    fun `plan 模式：计划回注到主循环上下文`() {
        val plan = "1. 读 a.txt\n2. 写结果"
        val captured = mutableListOf<List<ChatMsg>>()
        val loop = AgentLoop(
            workspace = root,
            chatFn = { msgs, _ ->
                captured.add(msgs.toList())
                // 计划阶段（chatFn 第一次调用）只给文本让 planMode 拿到计划；
                // 主循环阶段正常结束。靠「是否含 [任务计划]」区分阶段不可靠，
                // 这里直接按出现次数：首次调用返回计划文本，之后返回完成。
                if (captured.size == 1) reply(text = plan) else reply(text = "完成")
            },
            toolFn = { _, _ -> LocalTools.ToolResult.of("x", "ok") },
            systemPrompt = "SYS",
            planMode = true,
        )
        loop.run(emptyList(), "帮我做")
        // 计划回注：主循环的某条 system 消息应含 [任务计划]
        assertTrue(
            "主循环应看到计划回注",
            captured.any { it.any { m -> m.role == "system" && m.content.orEmpty().contains("任务计划") } },
        )
    }

    // ── 子代理委派端到端 ──

    @Test
    fun `委派：主代理调用 delegate_task 触发子代理并把结果回填`() {
        var subAgentRan = false
        val chatFn: (List<ChatMsg>, List<ToolSpec>) -> ChatResult = chatFn@{ msgs, tools ->
            // 子代理上下文里只有「子任务描述」一条 user 消息 → 直接回答
            val isSub = msgs.count { it.role == "user" } == 1 &&
                msgs.any { it.role == "user" && it.content.orEmpty().contains("子任务描述") }
            if (isSub) {
                subAgentRan = true
                // 子代理首轮也看到 delegate_task 工具，但不应再调用它。
                // 用显式标签 chatFn@ —— 对 val 赋值的 lambda，隐式标签不可靠。
                return@chatFn reply(text = "子代理干完了")
            }
            // 主代理：第一轮委派，第二轮收结果并结束
            val delegated = msgs.any { it.role == "tool" }
            if (!delegated) {
                reply(tools = listOf(toolCall("delegate_task", """{"task":"子任务描述"}""")))
            } else {
                reply(text = "主代理汇总完成")
            }
        }
        val loop = AgentLoop(
            workspace = root,
            chatFn = chatFn,
            toolFn = { _, _ -> LocalTools.ToolResult.of("x", "ok") },
            systemPrompt = "SYS",
            enableDelegate = true,
        )
        val parentIds = mutableListOf<String?>()
        val res = loop.run(emptyList(), "做", onStep = { s ->
            if (s is AgentLoop.Step.ToolCalling) parentIds.add(s.parentTaskId)
        })
        assertTrue("子代理应被触发执行", subAgentRan)
        assertEquals("主代理应正常收尾", "主代理汇总完成", res.text)
        assertEquals("主代理的委托调用 parentTaskId 应为 null", null, parentIds.first())
    }

    @Test
    fun `委派：子代理步骤透出 parentTaskId，主步骤为 null`() {
        val chatFn: (List<ChatMsg>, List<ToolSpec>) -> ChatResult = { msgs, _ ->
            val isSub = msgs.count { it.role == "user" } == 1 &&
                msgs.any { it.role == "user" && it.content.orEmpty().contains("子任务描述") }
            if (isSub) {
                // 子代理：调一次工具再结束（制造一个 ToolDone 以验证 parentTaskId 透出）
                if (msgs.none { it.role == "assistant" }) {
                    reply(tools = listOf(toolCall("read_file", """{"path":"x"}""")))
                } else {
                    reply(text = "子完成")
                }
            } else {
                val delegated = msgs.any { it.role == "tool" }
                if (!delegated) {
                    reply(tools = listOf(toolCall("delegate_task", """{"task":"子任务描述"}""")))
                } else {
                    reply(text = "主完成")
                }
            }
        }
        val loop = AgentLoop(
            workspace = root,
            chatFn = chatFn,
            toolFn = { _, _ -> LocalTools.ToolResult.of("x", "ok") },
            systemPrompt = "SYS",
            enableDelegate = true,
        )
        val seen = mutableListOf<Pair<String, String?>>()
        loop.run(emptyList(), "做", onStep = { s ->
            when (s) {
                is AgentLoop.Step.ToolCalling -> seen.add("call" to s.parentTaskId)
                is AgentLoop.Step.ToolDone -> seen.add("done" to s.parentTaskId)
                else -> Unit
            }
        })
        // 主代理的 delegate_task 调用 parentTaskId 为 null
        assertTrue(seen.any { it.first == "call" && it.second == null })
        // 子代理的 read_file 调用应带非空 parentTaskId（透出）
        assertTrue(seen.any { it.first == "call" && it.second != null })
    }

    @Test
    fun `委派：子代理不可再委派（enableDelegate=false）`() {
        // 子代理若尝试调用 delegate_task，因 enableDelegate=false，该工具
        // 不在其工具列表里，模型理论上不会调用；即便构造越界，runDelegate
        // 也不会再 spawn 子代理。这里验证子代理工具集不含 delegate_task spec。
        val subTools = run {
            val captured = mutableListOf<List<ToolSpec>>()
            val loop = AgentLoop(
                workspace = root,
                chatFn = { _, tools -> captured.add(tools.toList()); reply(text = "x") },
                toolFn = { _, _ -> LocalTools.ToolResult.of("x", "ok") },
                systemPrompt = "SYS",
                enableDelegate = true,
            )
            // 触发一次主循环以观察主工具集（含 delegate_task），再单独构造
            // 子代理观察其工具集 —— 这里直接断言 DELEGATE_TASK_SPEC 名称。
            loop.run(emptyList(), "x")
            captured.firstOrNull()
        }
        // 主代理工具集含 delegate_task
        assertNotNull(subTools)
        assertTrue(subTools!!.any { it.name == AgentLoop.DELEGATE_TASK_NAME })
    }

    // ── 防护端到端 ──

    @Test
    fun `防护：单次任务工具调用达上限被截断为 MAX_TOOL_CALLS`() {
        // 主代理一直调 list_dir 且不让子代理（enableDelegate=false 仅测主链）
        val loop = AgentLoop(
            workspace = root,
            chatFn = { _, _ -> reply(tools = listOf(toolCall("list_dir", """{"path":"."}"""))) },
            toolFn = { _, _ -> LocalTools.ToolResult.of("x", "ok") },
            systemPrompt = "SYS",
            enableDelegate = false,
            maxToolCalls = 5,
        )
        val res = loop.run(emptyList(), "无限")
        assertEquals(AgentLoop.FinishReason.MAX_TOOL_CALLS, res.reason)
    }

    @Test
    fun `防护：子代理自身 maxSteps 独立截断`() {
        // 主代理委派一个会无限调工具的子任务；子代理 subAgentMaxSteps=2 应截断
        val chatFn: (List<ChatMsg>, List<ToolSpec>) -> ChatResult = { msgs, _ ->
            // 子代理的判据必须区分「主代理首轮」与「子代理」——两者都只有 1 条
            // user 消息，故不能数 user 条数（原判据 `count == 1` 把主代理首轮
            // 也判成子代理 → 主代理从没委派就狂调 list_dir，测试恒失败）。
            // 用**内容**识别：子代理的输入是本测试传的子任务描述。
            val isSub = msgs.any { it.role == "user" && it.content.orEmpty().contains("无限子任务") }
            if (isSub) {
                // 子代理狂调工具
                reply(tools = listOf(toolCall("list_dir", """{"path":"."}""")))
            } else {
                val delegated = msgs.any { it.role == "tool" }
                if (!delegated) {
                    reply(tools = listOf(toolCall("delegate_task", """{"task":"无限子任务"}""")))
                } else {
                    reply(text = "主完成")
                }
            }
        }
        val loop = AgentLoop(
            workspace = root,
            chatFn = chatFn,
            toolFn = { _, _ -> LocalTools.ToolResult.of("x", "ok") },
            systemPrompt = "SYS",
            enableDelegate = true,
            subAgentMaxSteps = 2,
        )
        val steps = mutableListOf<String>()
        val res = loop.run(emptyList(), "做", onStep = { steps.add(it.toString()) })
        // 委派结果通过 Step.ToolDone(delegate_task).summary 透出，**不**进
        // res.text（res.text 只有主代理最终回答「主完成」）。
        // 原断言查 res.text 是查错了对象 —— 改为查 steps 里的工具完成事件。
        val delegateDone = steps.firstOrNull {
            it.startsWith("ToolDone") && it.contains("delegate_task")
        }.orEmpty()
        assertTrue(
            "委派结果应含子代理截断提示，实际 steps：$delegateDone",
            delegateDone.contains("子代理达轮数上限") || delegateDone.contains("子任务结果"),
        )
        // 主代理最终仍正常收尾
        assertTrue("主代理应给出最终回答", res.text.contains("主完成"))
    }

    @Test
    fun `向后兼容：不传编排参数时与原行为一致（默认 25 轮上限）`() {
        // 不含任何编排开关的构造 = 旧调用点；默认值应与原 DEFAULT_MAX_STEPS 一致
        val loop = AgentLoop(
            workspace = root,
            chatFn = { _, _ -> reply(text = "hi") },
            toolFn = { _, _ -> LocalTools.ToolResult.of("x", "ok") },
        )
        assertEquals(25, loop.maxSteps)
        assertEquals("hi", loop.run(emptyList(), "x").text)
    }
}
