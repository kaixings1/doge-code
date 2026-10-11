package com.dogecode.mobile

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Collections
import java.util.concurrent.Executors

/**
 * 本地模式的 agent 循环（组装消息 → 调 API → 执行工具 → 回填 → 再调）。
 *
 * ## 为什么抽成独立类而不是写进 UI
 *
 * 这个循环有三个**必须做对、否则代价很大**的边界：
 *
 * 1. **最大轮数**：模型可能反复请求工具而不给最终答案。没有轮数上限
 *    会**无限调用 API 烧钱**，且用户只看到界面一直转
 * 2. **终止判据**：什么情况下算「做完了」——是「没有 tool_calls」还是
 *    「有正文」？搞错会让任务做一半就停
 * 3. **工具结果回填格式**：回填错（如缺 tool_call_id）会让模型看不懂
 *    结果并重复调用同一个工具
 *
 * 这些都是纯逻辑，可完整单测；写进 UI 就只能靠真机试。
 *
 * ## 依赖注入而非直接调 API
 *
 * 循环通过 [ChatFn] 取「一次模型回复」——这样测试可注入假回复，
 * 穷举「模型连续请求工具」「模型直接回答」「模型请求不存在的工具」
 * 等路径，不必起 HTTP 服务。
 *
 * ## 任务编排增强（M4）
 *
 * 在原来的线性循环之上，本类新增三层编排能力，全部可通过构造参数
 * 开关，**默认全部关闭以保持向后兼容**：
 *
 * 1. **plan 模式** ([planMode])：复杂任务先让模型产出一份结构化计划，
 *    作为 system 消息回注后再进入正常执行循环。计划阶段**不执行工具**。
 * 2. **子代理委派** ([delegate_task] 工具，[enableDelegate])：模型可把
 *    子任务交给一个**独立的子 AgentLoop 实例**（共享 chatFn/toolFn，
 *    独立消息上下文）执行，结果回填主循环。支持串行（默认）与并行
 *    （`tasks` 数组 + `parallel:true`，用线程池 + 结果合并）。
 * 3. **任务进度透出**：通过 [Step.parentTaskId] 标识某一步属于哪个
 *    子任务，便于 UI 区分主/子任务（最小改动，未改 onStep 签名）。
 *
 * ## 防护铁律（必须有，否则会烧钱/卡死）
 *
 * - 子代理层数上限 [DEFAULT_MAX_SUBAGENT_DEPTH]（默认 3 层嵌套）
 * - 子代理自身轮数上限 [DEFAULT_SUBAGENT_MAX_STEPS]（默认 8）
 * - 单次任务工具调用总数上限 [DEFAULT_MAX_TOOL_CALLS]（默认 60），超出
 *   截断并提示，防止「模型狂调工具」或「spawn 炸弹」
 */
class AgentLoop(
    /** 工作区根目录（工具的操作范围）。 */
    private val workspace: File,
    /** 调用一次模型。生产环境传 [ProviderClient.chat]，测试传假实现。 */
    private val chatFn: (List<ChatMsg>, List<ToolSpec>) -> ChatResult,
    /** 工具执行（生产传 [LocalTools.execute]；抽成参数便于测试注入失败）。 */
    private val toolFn: (String, String) -> LocalTools.ToolResult = { name, args ->
        LocalTools.execute(workspace, name, args)
    },
    /** 系统提示词（由 [SystemPrompt] 生成）。 */
    private val systemPrompt: String = "",
    /**
     * plan 模式开关。
     *
     * 开启时，第一轮先让模型只产出**结构化计划**（不执行工具），
     * 计划作为 system 消息回注后，再进入正常执行循环。
     *
     * **默认 false** —— 不传时行为完全等于改造前（向后兼容）。
     */
    private val planMode: Boolean = false,
    /**
     * 子代理最大嵌套层数（主代理为第 0 层）。超过则子代理内的委派被拒绝。
     *
     * 防止无限递归 spawn 烧钱。
     */
    private val maxSubAgentDepth: Int = DEFAULT_MAX_SUBAGENT_DEPTH,
    /** 子代理自身的最大轮数（独立于主循环的 [maxSteps]）。 */
    private val subAgentMaxSteps: Int = DEFAULT_SUBAGENT_MAX_STEPS,
    /**
     * 单次任务的工具调用总数上限（含委派触发的子代理工具调用）。
     *
     * 超出则截断本轮并返回 [FinishReason.MAX_TOOL_CALLS]，
     * 告知用户「工具调用过多，可能陷入循环」。
     */
    private val maxToolCalls: Int = DEFAULT_MAX_TOOL_CALLS,
    /**
     * 是否向模型暴露 [DELEGATE_TASK_NAME] 工具。
     *
     * **默认 false** 保持向后兼容：旧调用点（如测试、远端旧路径）不传时
     * 不会意外暴露委派工具。
     *
     * 子代理内部统一传 false（子代理不再 spawn，层数上限见 [maxSubAgentDepth]）。
     */
    private val enableDelegate: Boolean = false,
    /**
     * 额外的工具定义（通常是「技能」伪装成的 ToolSpec）。
     *
     * ## 为什么单独传而非并进 [LocalTools.specs]
     *
     * 技能是**动态**的（用户可在设置里开关），而 [LocalTools.specs] 是
     * 编译期固定的文件工具。分开传，AgentLoop 只负责「把这份 extraSpecs
     * 一起交给模型」，不关心它到底是技能还是别的扩展。**零改主流程**。
     */
    private val extraSpecs: List<ToolSpec> = emptyList(),
    /**
     * 技能调用桥接（默认 null = 不启用技能）。
     *
     * 收到模型请求 `use_skill_<id>` 时，[LocalAgentBackend] 注入一个函数：
     * 命中则返回「注入文本」（技能 prompt），AgentLoop 把它当作工具结果
     * 回填，模型下一轮即看到注入的专家工作流；未命中返回 null，走普通
     * [toolFn]（文件工具）。返回类型用 `String?` 而非 [Skill]，保持
     * AgentLoop 对技能模块零依赖（纯逻辑可无 Context 单测）。
     */
    private val skillBridge: ((String, String) -> String?)? = null,
) {

    /** 一轮循环的可观察事件（UI 据此渲染）。 */
    sealed interface Step {
        /** 模型请求调用工具。 */
        data class ToolCalling(
            val name: String,
            val arguments: String,
            /**
             * 所属子任务标识（null 表示主任务）。
             *
             * 子代理的步骤透传时带此值，便于 UI 区分主/子任务。
             * **默认 null**，旧调用点不传也兼容。
             */
            val parentTaskId: String? = null,
        ) : Step

        /** 工具执行完成。 */
        data class ToolDone(
            val name: String,
            val ok: Boolean,
            val summary: String,
            /** 所属子任务标识（null 表示主任务）。默认 null 保持兼容。 */
            val parentTaskId: String? = null,
        ) : Step

        /** 模型给出的一段正文（流式时为增量）。 */
        data class Text(val chunk: String) : Step

        /** 循环结束。 */
        data class Finished(val reason: FinishReason, val text: String) : Step
    }

    /** 结束原因 —— UI 需要区分「正常做完」与「被上限截断」。 */
    enum class FinishReason {
        /** 模型给出答复且不再请求工具。 */
        DONE,

        /** 达到最大轮数（可能任务未完成，需告知用户）。 */
        MAX_STEPS,

        /** 工具调用总数达到上限（可能模型陷入循环，需告知用户）。 */
        MAX_TOOL_CALLS,

        /** 用户中断。 */
        INTERRUPTED,
    }

    /**
     * 跑一轮完整对话（从用户输入到最终答复）。
     *
     * **阻塞调用**，应在 IO 线程执行（调用方负责）。
     *
     * @param history  已有对话（不含本次用户输入）
     * @param userInput 用户本次输入
     * @param onStep   每步回调（在调用线程执行，调用方负责切主线程）
     * @param shouldStop 中断检查（每轮开始时调用；返回 true 则中止）
     * @return 本轮最终答复文本
     */
    fun run(
        history: List<ChatMsg>,
        userInput: String,
        onStep: (Step) -> Unit = {},
        shouldStop: () -> Boolean = { false },
    ): RunResult {
        val messages = mutableListOf<ChatMsg>()
        if (systemPrompt.isNotBlank()) messages.add(ChatMsg.system(systemPrompt))
        messages.addAll(history)
        // 注入当前待办清单（L2）：放在 user 输入**前**的一条短上下文 ——
        // 模型把它当「当前状态」而非「背景设定」，且每轮都看到最新版。
        // 空清单不注入（省 token）。
        LocalTools.currentTodoContext()?.let { messages.add(ChatMsg.system(it)) }
        messages.add(ChatMsg.user(userInput))

        // 用量按轮累计（L2）：一次任务可能调多次模型，用户要的是总开销。
        // 提前到这里声明，使下面的 plan 阶段与主循环都能累加。
        var usagePrompt = 0
        var usageCompletion = 0

        // ── plan 模式：先产出结构化计划（不执行工具）──
        // 计划阶段只调一次模型取「计划文本」，忽略其 tool_calls，
        // 把计划作为一条 system 消息回注，再进入正常执行循环。
        if (planMode) {
            val planMessages = mutableListOf<ChatMsg>()
            if (systemPrompt.isNotBlank()) planMessages.add(ChatMsg.system(systemPrompt))
            planMessages.addAll(history)
            planMessages.add(ChatMsg.user(userInput))
            val planResult = chatFn(planMessages, LocalTools.specs())
            planResult.usage?.let {
                usagePrompt += it.promptTokens
                usageCompletion += it.completionTokens
            }
            val planText = planResult.text.trim()
            if (planText.isNotEmpty()) {
                // 计划回注为 system 消息；后续主循环据此执行并跟踪进度。
                messages.add(ChatMsg.system(buildPlanContext(planText)))
            }
        }

        // 主循环可见的工具集：本地全部工具 +（可选）委派工具 +（可选）技能工具。
        val mainTools = buildList {
            addAll(LocalTools.specs())
            if (enableDelegate) add(DELEGATE_TASK_SPEC)
            addAll(extraSpecs)
        }

        var steps = 0
        var lastText = ""
        // 工具调用总数（含委派触发的子代理工具）：用于 [maxToolCalls] 防护
        var toolCallCount = 0

        while (true) {
            // 中断检查放在**每轮开始**：用户点停止后应尽快退出，
            // 而不是等这一轮的工具都跑完
            if (shouldStop()) {
                onStep(Step.Finished(FinishReason.INTERRUPTED, lastText))
                return RunResult(
                    lastText, FinishReason.INTERRUPTED, turns = steps,
                    usage = ChatUsage(usagePrompt, usageCompletion),
                )
            }
            if (steps >= maxSteps) {
                // 告知用户「没做完」，而不是假装成功 ——
                // 截断后静默返回会让用户以为任务完成
                onStep(Step.Finished(FinishReason.MAX_STEPS, lastText))
                return RunResult(
                    lastText, FinishReason.MAX_STEPS, turns = steps,
                    usage = ChatUsage(usagePrompt, usageCompletion),
                )
            }
            steps++

            val result = chatFn(messages, mainTools)
            result.usage?.let {
                usagePrompt += it.promptTokens
                usageCompletion += it.completionTokens
            }

            // 回应正文（若非空）：追加到历史，供下一轮参考
            if (result.text.isNotEmpty()) {
                lastText = result.text
                onStep(Step.Text(result.text))
            }

            // **终止判据：模型不再请求工具**。
            // 不是「有正文就停」—— 模型常常「说一句 + 调工具」，
            // 有正文就停会让任务做一半。
            if (result.toolCalls.isEmpty()) {
                onStep(Step.Finished(FinishReason.DONE, lastText))
                return RunResult(
                    lastText, FinishReason.DONE, turns = steps,
                    usage = ChatUsage(usagePrompt, usageCompletion),
                )
            }

            // 把模型的这轮输出（含 tool_calls）写回历史，
            // 否则下一轮模型看不到自己刚请求过什么 → 重复调用
            messages.add(
                ChatMsg(
                    role = "assistant",
                    content = result.text.ifEmpty { null },
                    toolCalls = result.toolCalls,
                ),
            )

            for (call in result.toolCalls) {
                // 工具调用总数上限：每次执行前检查，超出即截断。
                // 防「模型狂调工具」与「spawn 炸弹」烧钱。
                if (++toolCallCount > maxToolCalls) {
                    onStep(Step.Finished(FinishReason.MAX_TOOL_CALLS, lastText))
                    return RunResult(
                        lastText, FinishReason.MAX_TOOL_CALLS, turns = steps,
                        usage = ChatUsage(usagePrompt, usageCompletion),
                    )
                }
                // ── 子代理委派：拦截 delegate_task，不走通用 toolFn ──
                if (isDelegateTask(call.name)) {
                    onStep(Step.ToolCalling(call.name, call.arguments))
                    val req = parseDelegateArgs(call.arguments)
                    val resultText = runDelegate(req, onStep, shouldStop)
                    onStep(Step.ToolDone(call.name, true, summarize(resultText)))
                    // 回填委派结果。**必须带 toolCallId** —— 缺了它模型
                    // 无法把结果对应到哪次调用，会重复请求同一工具
                    messages.add(ChatMsg.tool(call.id, resultText, call.name))
                    continue
                }
                // ── 技能调用：拦截 use_skill_<id>，不走通用 toolFn ──
                // skillBridge 命中（返回非 null 注入文本）即视为技能调用，
                // 把技能 prompt 当作工具结果回填，模型下一轮即按该工作流工作。
                val skillInjection = skillBridge?.invoke(call.name, call.arguments)
                if (skillInjection != null) {
                    onStep(Step.ToolCalling(call.name, call.arguments))
                    onStep(Step.ToolDone(call.name, true, summarize(skillInjection)))
                    // 回填技能注入。**必须带 toolCallId** —— 缺了它模型无法把
                    // 结果对应到哪次调用，会重复请求同一技能
                    messages.add(ChatMsg.tool(call.id, skillInjection, call.name))
                    continue
                }
                onStep(Step.ToolCalling(call.name, call.arguments))
                val tr = toolFn(call.name, call.arguments)
                onStep(Step.ToolDone(call.name, tr.ok, summarize(tr.content)))
                // 回填工具结果。**必须带 toolCallId** —— 缺了它模型无法把
                // 结果对应到哪次调用，会重复请求同一个工具
                messages.add(ChatMsg.tool(call.id, tr.content, call.name))
            }
        }
    }

    /**
     * 执行一次委派请求。
     *
     * 串行（单个 task 或 tasks 数组但 parallel=false）逐条跑；
     * 并行（tasks 数组 + parallel=true）用线程池并发跑子代理，结果按
     * 原始顺序合并。子代理是**独立 AgentLoop 实例**（共享 chatFn/toolFn，
     * 独立消息上下文），不可再委派（[enableDelegate]=false）。
     *
     * @param req 解析后的委派请求
     */
    private fun runDelegate(
        req: DelegateRequest,
        onStep: (Step) -> Unit,
        shouldStop: () -> Boolean,
    ): String {
        val tasks = if (req.tasks.isNotEmpty()) {
            req.tasks
        } else if (req.task.isNotBlank()) {
            listOf(req.task)
        } else {
            return "错误：delegate_task 缺少 task 或 tasks 参数"
        }
        return if (req.parallel && tasks.size > 1) {
            spawnParallel(tasks, onStep, shouldStop)
        } else {
            tasks.mapIndexed { i, t ->
                "### 子任务 ${i + 1}\n" + spawnSubAgent(t, "delegate-${i + 1}", onStep, shouldStop)
            }.joinToString("\n\n")
        }
    }

    /**
     * 生成一个子代理并执行单个子任务。
     *
     * 子代理与主代理**共享 chatFn/toolFn**（工具执行复用 [LocalTools.execute]，
     * 不重复实现工具集），但拥有**独立消息上下文**（从空历史开始，
     * 只拿子任务描述当输入）。子代理不可再委派（[enableDelegate]=false），
     * 且其轮数受 [subAgentMaxSteps] 限制。
     *
     * 子代理的步骤通过 [onStep] 透传给上层，并打上 [parentTaskId] 标识，
     * 便于 UI 区分主/子任务；但子代理的 `Finished` **不冒泡**（避免 UI
     * 误以为主循环结束）。
     *
     * @return 子任务的结果文本（含结束原因），供主循环回填
     */
    private fun spawnSubAgent(
        task: String,
        parentTaskId: String,
        onStep: (Step) -> Unit,
        shouldStop: () -> Boolean,
    ): String {
        val sub = AgentLoop(
            workspace = workspace,
            chatFn = chatFn,
            toolFn = toolFn,
            // 子代理系统提示：复用主提示 + 明确「你是子代理、不要再次委派」
            systemPrompt = if (systemPrompt.isNotBlank()) {
                systemPrompt + SUB_AGENT_SUFFIX
            } else {
                SUB_AGENT_SUFFIX.trim()
            },
            planMode = false,
            maxSubAgentDepth = 0, // 子代理不再 spawn
            subAgentMaxSteps = subAgentMaxSteps,
            maxToolCalls = maxToolCalls,
            enableDelegate = false,
            // 子代理同样能看到技能工具（共享 extraSpecs/skillBridge），
            // 但不能再次委派（enableDelegate=false 已阻断）
            extraSpecs = extraSpecs,
            skillBridge = skillBridge,
        )
        val res = sub.run(emptyList(), task, onStep = { s ->
            // 透传子代理步骤并打上 parentTaskId；Finished 不冒泡
            when (s) {
                is Step.ToolCalling -> onStep(s.copy(parentTaskId = parentTaskId))
                is Step.ToolDone -> onStep(s.copy(parentTaskId = parentTaskId))
                is Step.Text -> onStep(s)
                is Step.Finished -> Unit
            }
        }, shouldStop = shouldStop)
        val reasonNote = when (res.reason) {
            FinishReason.MAX_STEPS -> "（子代理达轮数上限，可能未完成）"
            FinishReason.MAX_TOOL_CALLS -> "（子代理工具调用达上限）"
            FinishReason.INTERRUPTED -> "（子代理被中断）"
            else -> ""
        }
        return buildString {
            append("子任务结果")
            if (reasonNote.isNotEmpty()) append(reasonNote)
            append("：\n").append(res.text)
        }
    }

    /**
     * 并行执行多个子任务。
     *
     * 用固定大小线程池并发跑子代理，**结果按原始顺序合并**（即便先完成
     * 的是后面的任务，也按 `tasks` 下标排序），保证主代理看到稳定的结构。
     * 结果收集用 `synchronized` 保护（线程池多线写入）。
     */
    private fun spawnParallel(
        tasks: List<String>,
        onStep: (Step) -> Unit,
        shouldStop: () -> Boolean,
    ): String {
        val pool = Executors.newFixedThreadPool(minOf(tasks.size, MAX_PARALLEL_SUBAGENTS))
        val collected = Collections.synchronizedList(ArrayList<Pair<Int, String>>(tasks.size))
        try {
            val futures = tasks.mapIndexed { idx, t ->
                pool.submit {
                    val r = runCatching {
                        spawnSubAgent(t, "parallel-$idx", onStep, shouldStop)
                    }.getOrDefault("（子任务执行失败）")
                    collected.add(idx to r)
                }
            }
            // 等待全部完成（任一失败也不影响其余；失败已被 runCatching 吞掉）
            futures.forEach { runCatching { it.get() } }
        } finally {
            pool.shutdown()
        }
        return collected.sortedBy { it.first }
            .joinToString("\n\n") { (i, r) -> "### 子任务 ${i + 1}\n$r" }
    }

    /** 一次运行的统计结果。 */
    data class RunResult(
        val text: String,
        val reason: FinishReason,
        /** 实际调用的模型轮数。 */
        val turns: Int,
        /** 本次任务的累计 token 用量（各轮相加；服务端从未返回时为 0）。 */
        val usage: ChatUsage? = null,
    ) {
        /** 是否正常完成（未被上限截断、未中断）。 */
        val isDone: Boolean get() = reason == FinishReason.DONE
    }

    companion object {
        /**
         * 最大轮数。
         *
         * 取 25：一个「读文件 → 改文件 → 再读确认」的完整任务通常
         * 在 10 轮内完成；25 留足余量，同时把失控的上限控制住
         *（每轮都是一次 API 调用，25 轮已是可观的费用）。
         */
        const val DEFAULT_MAX_STEPS = 25

        /** 子代理最大嵌套层数（含主代理第 0 层）。默认 3 层防无限递归。 */
        const val DEFAULT_MAX_SUBAGENT_DEPTH = 3

        /** 子代理自身最大轮数（参考 gpt_mobile 的 maxRounds=8）。 */
        const val DEFAULT_SUBAGENT_MAX_STEPS = 8

        /** 单次任务工具调用总数上限（含委派触发的子代理工具）。 */
        const val DEFAULT_MAX_TOOL_CALLS = 60

        /** 并行子代理的最大并发数（线程池上限，防资源耗尽）。 */
        const val MAX_PARALLEL_SUBAGENTS = 4

        /** 委派工具名。 */
        const val DELEGATE_TASK_NAME = "delegate_task"

        /** 工具结果摘要长度（UI 显示用，完整内容仍回填给模型）。 */
        private const val SUMMARY_LEN = 120

        /** 子代理系统提示后缀（明确其角色与不再次委派）。 */
        private const val SUB_AGENT_SUFFIX = """

[你是一个子代理，正在处理主代理委派下来的一个**独立子任务**。]
- 你拥有与主代理相同的文件/搜索/命令工具，但**不要再次调用 delegate_task**（你无权委派）。
- 只聚焦完成下方给你的子任务描述，不要发散做额外的事。
- 完成后用简洁中文汇报结果。
"""

        /** 委派工具定义（OpenAI function 格式，注入给主代理）。 */
        internal val DELEGATE_TASK_SPEC: ToolSpec = ToolSpec(
            name = DELEGATE_TASK_NAME,
            description = "把一个子任务委派给一个独立的子代理去执行，子代理拥有与主代理" +
                "相同的工具但独立的上下文，完成后把结果回填给你。可用于把大任务拆给" +
                "子代理并行或串行处理。子代理**不可再委派**。",
            parameters = JSONObject().apply {
                put("type", "object")
                put("properties", JSONObject().apply {
                    put("task", JSONObject().apply {
                        put("type", "string")
                        put("description", "单个子任务的自然语言描述（串行执行）")
                    })
                    put("tasks", JSONObject().apply {
                        put("type", "array")
                        put("description", "多个子任务描述（与 parallel 配合做并行/串行批处理）")
                        put("items", JSONObject().apply { put("type", "string") })
                    })
                    put("parallel", JSONObject().apply {
                        put("type", "boolean")
                        put("description", "tasks 含多个子任务时是否并行执行（默认 false=串行）")
                    })
                })
                put("required", JSONArray(listOf("task")))
            },
        )

        /** 是否为委派工具名（纯判据，便于单测）。 */
        internal fun isDelegateTask(name: String): Boolean = name == DELEGATE_TASK_NAME

        /**
         * 解析委派参数（纯函数，便于单测）。
         *
         * 兼容两种用法：`task`（单任务）或 `tasks` 数组（批量，配合 parallel）。
         * 参数非法（非 JSON / 缺字段）时返回空请求，由调用方决定报错文案。
         */
        internal fun parseDelegateArgs(args: String): DelegateRequest {
            val o = runCatching { JSONObject(args.ifBlank { "{}" }) }.getOrNull()
                ?: return DelegateRequest("", emptyList(), false)
            val task = o.optString("task").orEmpty()
            val parallel = o.optBoolean("parallel", false)
            val arr = o.optJSONArray("tasks")
            val tasks = if (arr != null) {
                (0 until arr.length()).mapNotNull { arr.optString(it).takeIf { s -> s.isNotBlank() } }
            } else {
                emptyList()
            }
            return DelegateRequest(task, tasks, parallel)
        }

        /** 把计划文本包成回注用的 system 消息内容（纯函数，便于单测）。 */
        internal fun buildPlanContext(plan: String): String =
            "[任务计划]\n$plan\n\n请严格按上述计划执行，并随时用 todo 工具跟踪与更新进度。"

        /** 生成 UI 用的结果摘要（单行、截断）。 */
        fun summarize(content: String): String {
            val oneLine = content.replace(Regex("\\s+"), " ").trim()
            return if (oneLine.length > SUMMARY_LEN) oneLine.take(SUMMARY_LEN) + "…" else oneLine
        }

        /** 判断在给定深度是否还能 spawn 子代理（纯判据，便于单测）。 */
        internal fun canSpawnSubAgent(depth: Int, maxDepth: Int): Boolean = depth < maxDepth
    }

    /** 委派请求的解析结果（companion 之外便于测试引用）。 */
    internal data class DelegateRequest(
        val task: String,
        val tasks: List<String>,
        val parallel: Boolean,
    )

    /**
     * 最大轮数（构造后可改，便于测试用极小值）。
     *
     * 默认 [DEFAULT_MAX_STEPS]；测试注入 1-2 验证截断路径。
     */
    var maxSteps: Int = DEFAULT_MAX_STEPS
}
