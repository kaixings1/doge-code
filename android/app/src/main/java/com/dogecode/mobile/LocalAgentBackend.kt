package com.dogecode.mobile

import android.util.Log
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * 本地模式的 [AgentBackend] 实现：手机自己跑 agent 循环。
 *
 * ## 核心设计：把本地事件翻译成 UI 已认识的事件
 *
 * [AgentLoop] 产出的是自己的 `Step`（ToolCalling / ToolDone / Text /
 * Finished），而 UI 认识的是 [BridgeClient.Event]（Incoming /
 * ToolActivity / Delta / Usage…）。
 *
 * 这里做**翻译**而非让 UI 同时认识两套事件：
 * · UI 不需要知道当前是哪种模式（全部渲染逻辑、工具气泡、折叠、
 *   回合分组全部复用 —— 这是双模式架构最主要的收益）
 * · 新增本地事件类型时只改本类
 *
 * 翻译映射：
 * | AgentLoop.Step        | BridgeClient.Event            |
 * |-----------------------|-------------------------------|
 * | ToolCalling           | ToolActivity(state=running)   |
 * | ToolDone              | ToolActivity(state=done/error)|
 * | Text                  | Delta（流式预览）             |
 * | Finished              | Incoming(role=assistant)      |
 *
 * ## 为什么需要「配对」工具气泡
 *
 * ToolCalling 与 ToolDone 是两次独立事件，UI 靠 `toolUseId` 把它们
 * 合并成同一条气泡（见 `ChatMessage.findRunningToolCallId`）。
 * 故本类**必须为每次调用生成稳定的 toolUseId**，否则每次工具调用会
 * 产生两条气泡（一条「运行中」+ 一条「完成」），列表被刷爆。
 */
class LocalAgentBackend(
    /** 工作区根目录（用户在设置里选定的目录）。 */
    private val workspace: File,
    /** Provider 配置（读取时取最新值，支持运行中改配置）。 */
    private val configProvider: () -> ProviderConfig,
    /**
     * 历史持久化（可选）。
     *
     * ## 为什么注入函数而非直接持有 MessageStore
     *
     * [MessageStore] 依赖 `Context`（写应用私有目录），而本类要能**单测**
     *（已有 `AgentLoopTest` 等纯逻辑测试，不启动 Android 运行时）。
     * 注入读写函数让测试传内存实现，生产传 `MessageStore` 包装。
     *
     * ## 为什么默认是 no-op 而非 null
     *
     * 调用点若无持久化需求（如测试、或早期版本），传默认值即可 ——
     * 免去调用点的 null 判断，也避免「忘了传就不保存」这类静默缺陷。
     *
     * 契约：`load` 返回 OpenAI 格式的 [ChatMsg] 快照；`save` 接收完整快照
     *（非增量），由实现决定何时落盘（`MessageStore.saveAsync` 是排队异步写）。
     */
    private val historyStore: HistoryStore = HistoryStore.NO_OP,
    /**
     * Android 上下文（仅供 [LocalTools.execute] 的 `run_command` 检测并调起
     * Termux 使用）。文件类工具不依赖它，故默认 null —— 单测不传。
     *
     * **默认 null 而非强制注入**：本类要能在 JVM 单测里跑（不起 Android
     * 运行时）。测试里 run_command 不会真正执行，无需 context。
     */
    private val androidContext: android.content.Context? = null,
    /**
     * 本地偏好读取（注入而非直接依赖 Android 的 [LocalPrefs]）。
     *
     * ## 为什么抽接口
     *
     * 本类要在 JVM 单测里跑（与 [AgentLoopTest] 同环境），而 `LocalPrefs`
     * 依赖 `Context`（SharedPreferences）。抽成接口让测试传固定值，
     * 生产传 `LocalPrefs.getLocal*()` 的 lambda。
     *
     * 每次 `runTurn` 读取：用户切了轮数立即生效，无须重启。
     */
    private val localPrefs: LocalPrefsReader = LocalPrefsReader.DEFAULT,
    /**
     * 把 (cfg, msgs, tools) 真正发出 HTTP 的函数（默认走 [providerClient.chat]，
     * 测试可注入假实现）。
     *
     * ## 为什么注入而非直接调 providerClient
     *
     * 与 `HistoryStore` 同源 —— 本类要能在 JVM 单测里跑（不起 HTTP 服务）。
     * 单测里注入假 chatFn 验证「`runTurn` 是否真的把温度覆盖后的 cfg 传出去」
     * —— 这是 M3 的契约。
     *
     * **不能在字段默认值里直接引用 [providerClient]**：Kotlin 字段初始化
     * 按声明顺序进行，此 lambda 表达式需要 `providerClient` 已被赋值。
     */
    private val modelCallOverride: ((ProviderConfig, List<ChatMsg>, List<ToolSpec>) -> ChatResult)? = null,
    /**
     * 是否开启 plan 模式（M4）。
     *
     * 开启时 [AgentLoop] 会先让模型产出结构化计划再执行，且 [SystemPrompt]
     * 会加「plan mode」段。默认 false —— 旧调用点不传，行为等于改造前。
     *
     * 注入而非读本地偏好：plan 模式是「能力开关」，本类不关心它从设置页
     * 还是别处来；生产传 `LocalPrefs` 的 lambda，测试传固定值。
     */
    private val planMode: Boolean = false,
    /**
     * 是否向模型暴露 `delegate_task` 委派工具（M4）。
     *
     * 必须与 [planMode] 类似用注入开关控制，且需与 [SystemPrompt.build] 的
     * `enableDelegate` 保持一致（提示词声明了工具，循环才真的注入它）。
     * 默认 false —— 保持向后兼容，不破坏现有调用点与单测。
     */
    private val enableDelegate: Boolean = false,
    /**
     * 技能存储（可选）。
     *
     * ## 默认 null 而非强制注入：保持 JVM 单测零 Context
     *
     * 不传则不加载任何技能，AgentLoop 的 extraSpecs / skillBridge 都是空，
     * 行为与改造前**完全一致**（单测契约不被破坏）。生产环境由
     * [MainActivity] 注入 [SkillStore]。
     */
    private val skillStore: SkillStore? = null,
) : AgentBackend {

    /**
     * 实际发 HTTP 的函数。
     *
     * 解析顺序：调用方注入的 [modelCallOverride] → 默认的真发 HTTP 实现。
     *
     * ## 为什么不用 init 块赋默认
     *
     * 首版写成 `private var modelCall = {...}; init { modelCall = 真实现 }`，
     * 导致**调用方注入的 lambda 被 init 块覆盖**——测试注入的假实现
     * 完全失效，静默地真发了 HTTP（表现为测试超时 + 405）。
     * 改成「可空参数 + `?:` 兜底」从结构上杜绝这类覆盖。
     */
    private val modelCall: (ProviderConfig, List<ChatMsg>, List<ToolSpec>) -> ChatResult
        get() = modelCallOverride
            ?: { cfg, msgs, tools -> providerClient.chat(cfg, msgs, null, tools) }

    /**
     * 本地偏好读取接口（仅 M3 需要的两个字段）。
     *
     * **故意只暴露这两个键**：本类只关心 maxSteps 与 temperature，
     * 不该知道其他偏好（不关心主题、字号等）。
     * 后续若要新增可配置项，加方法即可——避免接口膨胀成大杂烩。
     */
    interface LocalPrefsReader {
        /** 最大推理轮数。 */
        fun maxSteps(): Int
        /** 温度。`null` 表示不发送该参数。 */
        fun temperature(): Double?

        companion object {
            /**
             * 默认实现 = 当前行为（不读偏好，硬编码）。
             *
             * 与 [AgentLoop.DEFAULT_MAX_STEPS] / `ProviderConfig.temperature == null` 一致。
             * 调用点若不传 prefs，本类行为**完全等于改造前**。
             */
            val DEFAULT = object : LocalPrefsReader {
                override fun maxSteps() = AgentLoop.DEFAULT_MAX_STEPS
                override fun temperature(): Double? = null
            }
        }
    }

    /**
     * 本地历史持久化接口（读写全量快照）。
     *
     * 抽成接口的收益：`LocalAgentBackend` 不再依赖 `Context`，
     * 单测可注入内存实现验证「发送 → 落盘 → 重载」的完整往返。
     */
    interface HistoryStore {
        /** 读取历史（OpenAI 格式）。无历史返回空列表。 */
        fun load(): List<ChatMsg>

        /** 保存全量历史快照（实现自行决定同步/异步）。 */
        fun save(messages: List<ChatMsg>)

        companion object {
            /** 不做任何持久化（默认）。 */
            val NO_OP = object : HistoryStore {
                override fun load(): List<ChatMsg> = emptyList()
                override fun save(messages: List<ChatMsg>) = Unit
            }
        }
    }

    private val worker = Executors.newSingleThreadExecutor { r ->
        Thread(r, "local-agent").apply { isDaemon = true }
    }

    /**
     * 会话累计 token 用量（L2：`/cost` 的数据源）。
     *
     * 跨回合累计（AgentLoop 只累计单次任务内各轮）。reset 时机：
     * `/clear` 清空对话时一并清零（语义与 CLI `/cost` 一致 —— 会话级）。
     */
    private val totalPrompt = java.util.concurrent.atomic.AtomicInteger(0)
    private val totalCompletion = java.util.concurrent.atomic.AtomicInteger(0)

    /** 当前会话累计用量快照（供 UI / 斜杠命令读取）。 */
    override fun sessionUsage(): ChatUsage = ChatUsage(totalPrompt.get(), totalCompletion.get())

    /** 清零累计用量（随清空对话调用）。 */
    override fun resetUsage() {
        totalPrompt.set(0)
        totalCompletion.set(0)
    }

    /** 中断标志（由 UI 线程置位，工作线程读取）。 */
    private val stopRequested = AtomicBoolean(false)

    /** 正在执行（UI 据此禁用重复发送）。 */
    private val running = AtomicBoolean(false)

    private val providerClient = ProviderClient()

    override var onEvent: ((BridgeClient.Event) -> Unit)? = null

    /**
     * 是否可发送。
     *
     * 判据 = 「Provider 配置可用」而非「已连接」——本地模式没有连接概念。
     * 用 `configProvider()` 取**最新**配置（用户可能刚填完 key），
     * 而不是构造时快照。
     */
    override val isReady: Boolean
        get() = configProvider().isUsable && !running.get()

    /**
     * 会话历史（本地模式自己维护；远端模式下由 CLI 侧维护）。
     *
     * **初始化时从 [historyStore] 恢复** —— 进程被杀后重开必须能接着聊，
     * 否则「本地模式」在用户看来是「每次重开都失忆」。
     *
     * 惰性（`by lazy`）而非构造时读：构造发生在 `MainActivity.onCreate`，
     * 此时读盘会拖慢启动；且 `historyStore` 可能在构造后（模式切换时）
     * 被重新指向另一个会话文件 —— 用 `by lazy` 会把「首次读取」的时机
     * 推迟到真正需要时。**注意**：切换会话文件必须重建本类实例
     *（见 [MessageStore.useSession]），否则 lazy 已缓存旧历史。
     */
    private val history: MutableList<ChatMsg> by lazy {
        runCatching { historyStore.load() }.getOrDefault(emptyList()).toMutableList()
    }

    /**
     * 发送一条用户消息并启动本地推理。
     *
     * **立即返回**：真正的推理在工作线程跑，结果通过 [onEvent] 推回。
     * 若在调用线程直接跑，会阻塞 UI（网络请求 + 工具执行可达数十秒）。
     */
    override fun send(text: String, requestId: String): Boolean {
        val cfg = configProvider()
        if (!cfg.isUsable) {
            // 明确的失败事件而非静默 false —— 用户点了发送却毫无反应
            // 是最难排查的体验
            emit(BridgeClient.Event.Error("尚未配置 API：请在设置里填写密钥与地址"))
            return false
        }
        if (!running.compareAndSet(false, true)) {
            emit(BridgeClient.Event.Error("上一轮还在跑，请先中断"))
            return false
        }
        stopRequested.set(false)

        worker.execute {
            try {
                runTurn(text)
            } catch (e: Exception) {
                Log.w(TAG, "本地推理失败：${e.message}")
                emit(BridgeClient.Event.Error(e.message ?: "本地推理失败"))
            } finally {
                running.set(false)
            }
        }
        return true
    }

    /** 实际跑一轮（在工作线程）。 */
    private fun runTurn(userInput: String) {
        val cfg = configProvider()
        // 每次读最新偏好：用户可能改完 maxSteps/温度立刻想生效。
        // 合成一个临时 cfg 覆盖温度 —— 不写回 LocalPrefsStore，避免污染
        // 设置页里那个「API 默认」字段（它跟偏好语义不同）。
        val runMaxSteps = localPrefs.maxSteps()
        val runTemperature = localPrefs.temperature()
        val effectiveCfg = if (runTemperature == cfg.temperature) cfg else {
            cfg.copy(temperature = runTemperature)
        }
        // 每次运行新建 client 不合适（线程池），故复用实例，
        // 只用最新 config —— 用户可能刚改了 key 或模型

        // 技能注册表：每轮重新从 SkillStore 装配（用户切了开关立即生效，
        // 不必重启）。skillStore 为 null 时注册表为空，不产出任何技能 spec。
        val skillRegistry = SkillRegistry().also { skillStore?.applyTo(it) }

        // 技能桥接：把模型对 use_skill_<id> 的调用解析回 Skill，并拼装注入文本。
        // 返回非 null 即命中（AgentLoop 据此走「注入 prompt」而非文件工具）。
        val skillBridge: ((String, String) -> String?) = { name, args ->
            val skill = skillRegistry.resolveCall(name)
            if (skill == null) {
                null
            } else {
                val userArgs = runCatching { org.json.JSONObject(args.ifBlank { "{}" }) }
                    .getOrNull()?.optString("args")?.takeIf { it.isNotBlank() }
                skillRegistry.buildInjection(skill, userArgs)
            }
        }

        val loop = AgentLoop(
            workspace = workspace,
            chatFn = { msgs, tools -> modelCall(effectiveCfg, msgs, tools) },
            toolFn = { name, args -> LocalTools.execute(workspace, name, args, androidContext) },
            systemPrompt = SystemPrompt.build(
                workspace.name.ifBlank { "工作区" },
                planMode = planMode,
                enableDelegate = enableDelegate,
            ),
            // 本地模式主代理是否开 plan 模式 / 暴露委派工具，由构造参数开关控制
            //（默认都为 false，保持与原行为一致）；技能工具通过 extraSpecs + skillBridge 注入。
            planMode = planMode,
            enableDelegate = enableDelegate,
            extraSpecs = skillRegistry.toToolSpecs(),
            skillBridge = skillBridge,
        ).also { it.maxSteps = runMaxSteps }

        // 工具气泡配对用：把 AgentLoop 的一次调用映射为一个稳定 id
        val pendingToolIds = ArrayDeque<String>()
        var callSeq = 0

        val result = loop.run(
            history = history.toList(),
            userInput = userInput,
            onStep = { step ->
                when (step) {
                    is AgentLoop.Step.ToolCalling -> {
                        // 生成稳定 id 并在后续 ToolDone 复用 —— 缺了它
                        // UI 会把「运行中」与「完成」渲染成两条气泡
                        val id = "local-tool-${callSeq++}"
                        pendingToolIds.addLast(id)
                        emit(
                            BridgeClient.Event.ToolActivity(
                                kind = "tool",
                                name = step.name,
                                target = "",
                                state = "running",
                                detail = step.arguments,
                                toolUseId = id,
                            ),
                        )
                    }
                    is AgentLoop.Step.ToolDone -> {
                        val id = pendingToolIds.removeFirstOrNull() ?: ""
                        emit(
                            BridgeClient.Event.ToolActivity(
                                kind = "tool",
                                name = step.name,
                                target = "",
                                state = if (step.ok) "done" else "error",
                                result = step.summary,
                                toolUseId = id,
                            ),
                        )
                    }
                    is AgentLoop.Step.Text -> {
                        // 用 Delta（流式预览）—— UI 会把它渲染成打字机效果，
                        // 定稿（Finished）到达时替换
                        emit(BridgeClient.Event.Delta(step.chunk, seq = callSeq))
                    }
                    is AgentLoop.Step.Finished -> Unit // 在下面统一发 Incoming
                }
            },
            shouldStop = { stopRequested.get() },
        )

        // 把本轮的用户输入与最终回复写入历史（供下一轮参考）
        history.add(ChatMsg.user(userInput))
        if (result.text.isNotBlank()) history.add(ChatMsg.assistant(result.text))
        // 落盘：**每轮结束后**写一次（不是每条消息都写）。
        // MessageStore 内部单线程 executor 已序列化多次 save 竞争。
        // 落盘失败不抛 —— 历史丢失只是用户下次重开看不到，**不该让本轮失败**。
        runCatching { historyStore.save(history.toList()) }

        // 累计用量（L2）：挂在轮末尾而非每轮回调 —— 用户看的是
        // 会话累计而非中间值，轮末一次足够
        result.usage?.let {
            totalPrompt.addAndGet(it.promptTokens)
            totalCompletion.addAndGet(it.completionTokens)
        }

        // 定稿消息：UI 见 role=assistant 即结束回合、收起中断按钮
        val finalText = when {
            result.text.isNotBlank() -> result.text
            result.reason == AgentLoop.FinishReason.MAX_STEPS ->
                "（已达最大轮数 ${AgentLoop.DEFAULT_MAX_STEPS}，任务可能未完成）"
            result.reason == AgentLoop.FinishReason.INTERRUPTED -> "（已中断）"
            else -> "（无输出）"
        }
        emit(BridgeClient.Event.Incoming(role = "assistant", text = finalText))
    }

    private fun emit(ev: BridgeClient.Event) {
        onEvent?.invoke(ev)
    }

    /**
     * 请求中断。
     *
     * 只置标志位，不强制杀线程 —— 工作线程在**每轮开始**检查该标志
     * （见 [AgentLoop.run] 的 shouldStop），故最多多跑完当前一轮的工具。
     * 强杀线程会留下写了一半的文件。
     */
    override fun interrupt() {
        stopRequested.set(true)
    }

    /**
     * 编辑后重发。
     *
     * 本地模式的历史由本类维护，故「编辑最后一条用户消息」=
     * 回退历史到那一条之前，再用新文本重发。
     */
    override fun editMessage(newText: String, requestId: String): Boolean {
        // 移除最后一条 user 及其之后的助手回复
        val lastUser = history.indexOfLast { it.role == "user" }
        if (lastUser >= 0) {
            while (history.size > lastUser) history.removeAt(history.size - 1)
        }
        // 编辑后落盘：回退后的历史就是新基线，否则下次重启会看到旧版
        runCatching { historyStore.save(history.toList()) }
        emit(BridgeClient.Event.Incoming(role = "system", text = "已替换并重新提交"))
        return send(newText, requestId)
    }

    override fun close() {
        stopRequested.set(true)
        worker.shutdownNow()
        providerClient.shutdown()
    }

    companion object {
        private const val TAG = "LocalAgentBackend"
    }
}
