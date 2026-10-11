package com.dogecode.mobile

import android.content.Context
import android.util.Log
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONObject

/**
 * 本地**离线**推理的 [AgentBackend] 实现（与 [LocalAgentBackend] 平级）。
 *
 * ## 定位：真正离线的那条路
 *
 * - [LocalAgentBackend]：手机调**远程 OpenAI 兼容 API**（仍要联网）。
 * - [LocalInferenceBackend]：手机**本地推理引擎**跑（不联网）。
 *
 * 两者对 UI 暴露的接口完全一致（同实现 [AgentBackend]），翻译逻辑
 *（把 [AgentLoop.Step] 翻成 [BridgeClient.Event]）也**逐字复制**自
 * [LocalAgentBackend]——这是双模式架构的核心收益：UI 不关心底层谁在算。
 *
 * ## 关键差异：推理「从哪来」
 *
 * [LocalAgentBackend] 的 `chatFn` 是 `providerClient.chat`（发 HTTP）。
 * 本类的 `chatFn` 是 `engine.generate`（本地引擎），通过一个
 * **工厂 lambda** `engineFactory` 注入：
 *
 * ```
 * engineFactory: () -> LocalInferenceEngine?
 * ```
 *
 * - 返回非 null → 引擎可用，[isReady]=true。
 * - 返回 null（或返回 [NullInferenceEngine]）→ 未配置离线引擎，
 *   [isReady]=false，send 时发 Error 事件提示「需引入 GGUF 库」。
 *
 * ## 为什么默认拿不到真引擎
 *
 * 真·离线 GGUF 推理需要 native `.so`（llama.cpp 等）+ NDK 编译，
 * 而 doge 铁律「不引入新依赖、不用 NDK」。故本任务**只交付架构骨架
 * + 算法吸收**：`engineFactory` 默认返回 null，架构完整、可编译、不破坏
 * 现有远程/Provider 模式。后续引入 .so 时补一个 [LocalInferenceEngine]
 * 实现、在工厂里返回它，即可接入——UI/循环/工具/历史零改动。
 */
class LocalInferenceBackend(
  /** 工作区根目录（用户在设置里选定的目录）。 */
  private val workspace: File,
  /**
   * 本地推理服务端地址（`http://127.0.0.1:8080/v1`）。
   * 默认空：工厂回落 NullInferenceEngine（见 [engineFactory]）。
   * 一般通过 [fromHttp] 便捷构造器传入，而非直接填主构造。
   */
  private val engineBaseUrl: String = "",
  /**
   * 模型名读取（本地引擎需要知道自己加载哪个权重）。注入而非直接读
   * [LocalPrefs]，便于 JVM 单测传固定值。
   */
  private val modelNameProvider: () -> String = { "" },
  /** 单次推理超时（毫秒）；<=0 表示不限制（仅听用户中断）。 */
  private val inferenceTimeoutMs: Long = 0L,
  /**
   * 本地推理引擎工厂。
   *
   * 每次 `runTurn` 调用取最新实例（支持运行中换引擎/配置）。
   * 默认工厂按 [engineBaseUrl] 构造 [HttpLocalEngine]：
   * · 地址非空 → 返回真实 HTTP 引擎（对接本地 OpenAI 兼容服务端）；
   * · 地址为空 → 返回 [NullInferenceEngine]，[isReady]=false，
   *   send 报「需在设置页填写本地引擎地址」。
   *
   * 也可注入自定义工厂（如未来接入 GGUF native 引擎）。
   */
  private val engineFactory: () -> LocalInferenceEngine? = {
    if (engineBaseUrl.isBlank()) {
      NullInferenceEngine
    } else {
      HttpLocalEngine(engineBaseUrl, modelNameProvider(), inferenceTimeoutMs.toInt())
    }
  },
  /** 历史持久化（同 [LocalAgentBackend]，默认 no-op）。 */
  private val historyStore: HistoryStore = HistoryStore.NO_OP,
  /** Android 上下文（仅供 [LocalTools.execute] 的 run_command 调起 Termux）。 */
  private val androidContext: Context? = null,
  /** 本地偏好读取（maxSteps / temperature），同 [LocalAgentBackend]。 */
  private val localPrefs: LocalPrefsReader = LocalPrefsReader.DEFAULT,
  /** 是否开启 plan 模式（同 [LocalAgentBackend]）。 */
  private val planMode: Boolean = false,
  /** 是否暴露 delegate_task 委派工具（同 [LocalAgentBackend]）。 */
  private val enableDelegate: Boolean = false,
  /** 技能存储（可选，同 [LocalAgentBackend]）。 */
  private val skillStore: SkillStore? = null,
) : AgentBackend {

  /**
   * 把 [LocalInferenceEngine] 适配成 [AgentLoop] 需要的 `ChatFn`。
   *
   * [AgentLoop] 只认 `(List<ChatMsg>, List<ToolSpec>) -> ChatResult`，
   * 而本地引擎签名多了 `onToken`/`shouldStop`。这里做**胶水适配**：
   * - 用 [LocalInferenceAlgorithms.StreamAccumulator] 累积流式 token，
   *   顺手剥离 `<think>` 标签（算法吸收自 OfflineLLM）。
   * - 用 [LocalInferenceAlgorithms.InferenceTimeout.withDeadline] 把
   *   「超时 + 用户中断」合成一个 `shouldStop`。
   * - 引擎产出的 [EngineResult] 直接映射回 [ChatResult]。
   */
  private fun makeChatFn(
    engine: LocalInferenceEngine,
    onDelta: (String) -> Unit,
  ): (List<ChatMsg>, List<ToolSpec>) -> ChatResult {
    return { msgs, tools ->
      val accumulator = LocalInferenceAlgorithms.StreamAccumulator { visible ->
        // 引擎逐 token 推来的可见文本，直接转成流式 Delta（打字机效果）。
        // 与 LocalAgentBackend 的 onDelta 同源：UI 看到的是增量而非定稿。
        if (visible.isNotEmpty()) onDelta(visible)
      }
      val stop = LocalInferenceAlgorithms.InferenceTimeout.withDeadline(
        timeoutMs = inferenceTimeoutMs,
        externalStop = { stopRequested.get() },
      )
      val result = engine.generate(
        messages = msgs,
        tools = tools,
        onToken = { accumulator.add(it) },
        shouldStop = stop,
      )
      // result.text 已是清洗后的完整文本（引擎经 onToken 已流式推出），
      // 作为定稿交给 AgentLoop（Loop 只在非空时推一次 Step.Text，
      // 由 runTurn 收口为 Incoming，不会与上面的 Delta 重复显示）。
      ChatResult(
        text = result.text,
        toolCalls = result.toolCalls,
        finishReason = result.finishReason,
        usage = null, // 本地引擎不向 OpenAI 报 token 用量；如需可扩展 EngineResult
      )
    }
  }

  private val worker = Executors.newSingleThreadExecutor { r ->
    Thread(r, "local-inference").apply { isDaemon = true }
  }

  /** 跨回合累计 token 用量（本地引擎暂无用量来源，先占位）。 */
  private val totalPrompt = AtomicInteger(0)
  private val totalCompletion = AtomicInteger(0)
  override fun sessionUsage(): ChatUsage = ChatUsage(totalPrompt.get(), totalCompletion.get())
  override fun resetUsage() { totalPrompt.set(0); totalCompletion.set(0) }

  /** 中断标志（UI 置位，工作线程读）。 */
  private val stopRequested = AtomicBoolean(false)
  /** 是否正在跑（UI 据此禁用重复发送）。 */
  private val running = AtomicBoolean(false)

  override var onEvent: ((BridgeClient.Event) -> Unit)? = null

  /**
   * 是否可发送：引擎工厂能产出可用引擎（非 null）且未在跑。
   *
   * 与 [LocalAgentBackend.isReady] 同语义，只是判据从「Provider 配置可用」
   * 换成「本地引擎可用」。
   */
  override val isReady: Boolean
    get() = engineFactory() != null && !running.get()

  /** 会话历史（与 [LocalAgentBackend] 同款：by lazy 恢复）。 */
  private val history: MutableList<ChatMsg> by lazy {
    runCatching { historyStore.load() }.getOrDefault(emptyList()).toMutableList()
  }

  override fun send(text: String, requestId: String): Boolean {
    val engine = engineFactory()
    if (engine == null) {
      emit(
        BridgeClient.Event.Error(
          "尚未配置本地推理引擎：需引入 GGUF native 库（如 llama.cpp .so）" +
            "并实现 LocalInferenceEngine 后接入 engineFactory。",
        ),
      )
      return false
    }
    if (!running.compareAndSet(false, true)) {
      emit(BridgeClient.Event.Error("上一轮还在跑，请先中断"))
      return false
    }
    stopRequested.set(false)

    worker.execute {
      try {
        runTurn(text, engine)
      } catch (e: Exception) {
        Log.w(TAG, "本地离线推理失败：${e.message}")
        emit(BridgeClient.Event.Error(e.message ?: "本地离线推理失败"))
      } finally {
        running.set(false)
      }
    }
    return true
  }

  /** 实际跑一轮（在工作线程）。翻译逻辑逐字复用 [LocalAgentBackend]。 */
  private fun runTurn(userInput: String, engine: LocalInferenceEngine) {
    val runMaxSteps = localPrefs.maxSteps()
    val runTemperature = localPrefs.temperature()
    // 本地引擎暂不直接吃 temperature（取决于引擎实现），保留以便将来扩展。
    val modelName = modelNameProvider()

    val skillRegistry = SkillRegistry().also { skillStore?.applyTo(it) }
    val skillBridge: ((String, String) -> String?) = { name, args ->
      val skill = skillRegistry.resolveCall(name)
      if (skill == null) {
        null
      } else {
        val userArgs = runCatching { JSONObject(args.ifBlank { "{}" }) }
          .getOrNull()?.optString("args")?.takeIf { it.isNotBlank() }
        skillRegistry.buildInjection(skill, userArgs)
      }
    }

    // 工具气泡配对 / Delta 序号：必须在 makeChatFn 闭包前声明，供流式 token 转发引用。
    val pendingToolIds = ArrayDeque<String>()
    var callSeq = 0

    // 把引擎适配成 AgentLoop 的 ChatFn
    val chatFn = makeChatFn(engine) { visible ->
      emit(BridgeClient.Event.Delta(visible, seq = callSeq))
    }

    val loop = AgentLoop(
      workspace = workspace,
      chatFn = chatFn,
      toolFn = { name, args -> LocalTools.execute(workspace, name, args, androidContext) },
      systemPrompt = SystemPrompt.build(
        workspace.name.ifBlank { "工作区" },
        planMode = planMode,
        enableDelegate = enableDelegate,
      ),
      planMode = planMode,
      enableDelegate = enableDelegate,
      extraSpecs = skillRegistry.toToolSpecs(),
      skillBridge = skillBridge,
    ).also { it.maxSteps = runMaxSteps }

    // 把引擎每次产出的 token 实时推成 Delta（打字机）。注意：适配层已让
    // 引擎 token 经 onToken 流出，这里在 Step.Text 里转发即可。
    val result = loop.run(
      history = history.toList(),
      userInput = userInput,
      onStep = { step ->
        when (step) {
          is AgentLoop.Step.ToolCalling -> {
            val id = "local-inf-tool-${callSeq++}"
            pendingToolIds.addLast(id)
            emit(
              BridgeClient.Event.ToolActivity(
                kind = "tool", name = step.name, target = "",
                state = "running", detail = step.arguments, toolUseId = id,
              ),
            )
          }
          is AgentLoop.Step.ToolDone -> {
            val id = pendingToolIds.removeFirstOrNull() ?: ""
            emit(
              BridgeClient.Event.ToolActivity(
                kind = "tool", name = step.name, target = "",
                state = if (step.ok) "done" else "error",
                result = step.summary, toolUseId = id,
              ),
            )
          }
          is AgentLoop.Step.Text -> {
            emit(BridgeClient.Event.Delta(step.chunk, seq = callSeq))
          }
          is AgentLoop.Step.Finished -> Unit
        }
      },
      shouldStop = { stopRequested.get() },
    )

    history.add(ChatMsg.user(userInput))
    if (result.text.isNotBlank()) history.add(ChatMsg.assistant(result.text))
    runCatching { historyStore.save(history.toList()) }

    result.usage?.let {
      totalPrompt.addAndGet(it.promptTokens)
      totalCompletion.addAndGet(it.completionTokens)
    }

    val finalText = when {
      result.text.isNotBlank() -> result.text
      result.reason == AgentLoop.FinishReason.MAX_STEPS ->
        "（已达最大轮数 ${AgentLoop.DEFAULT_MAX_STEPS}，任务可能未完成）"
      result.reason == AgentLoop.FinishReason.INTERRUPTED -> "（已中断）"
      else -> "（无输出）"
    }
    emit(BridgeClient.Event.Incoming(role = "assistant", text = finalText))
  }

  private fun emit(ev: BridgeClient.Event) { onEvent?.invoke(ev) }

  override fun interrupt() { stopRequested.set(true) }

  override fun editMessage(newText: String, requestId: String): Boolean {
    val lastUser = history.indexOfLast { it.role == "user" }
    if (lastUser >= 0) {
      while (history.size > lastUser) history.removeAt(history.size - 1)
    }
    runCatching { historyStore.save(history.toList()) }
    emit(BridgeClient.Event.Incoming(role = "system", text = "已替换并重新提交"))
    return send(newText, requestId)
  }

  override fun close() {
    stopRequested.set(true)
    worker.shutdownNow()
  }

  /**
   * 本地偏好读取接口（仅 maxSteps / temperature，与 [LocalAgentBackend] 一致）。
   */
  interface LocalPrefsReader {
    fun maxSteps(): Int
    fun temperature(): Double?
    companion object {
      val DEFAULT = object : LocalPrefsReader {
        override fun maxSteps() = AgentLoop.DEFAULT_MAX_STEPS
        override fun temperature(): Double? = null
      }
    }
  }

  /** 历史持久化接口（与 [LocalAgentBackend] 同款，保持单测零 Context）。 */
  interface HistoryStore {
    fun load(): List<ChatMsg>
    fun save(messages: List<ChatMsg>)
    companion object {
      val NO_OP = object : HistoryStore {
        override fun load(): List<ChatMsg> = emptyList()
        override fun save(messages: List<ChatMsg>) = Unit
      }
    }
  }

  companion object {
    private const val TAG = "LocalInferenceBackend"

    /**
     * 便捷构造：用「本地 HTTP 推理服务」做引擎。
     *
     * [engineBaseUrl] 留空字符串时，工厂返回 [NullInferenceEngine]，
     * [isReady] 为 false（UI 据此提示「先在设置页填本地引擎地址」）。
     *
     * @param engineBaseUrl 本地服务端 baseURL，如 `http://127.0.0.1:8080/v1`
     * @param modelNameProvider 模型名读取（与服务端 `GET /models` 的某个 id 对应）
     */
    fun fromHttp(
      workspace: File,
      engineBaseUrl: String,
      modelNameProvider: () -> String = { "" },
      historyStore: HistoryStore = HistoryStore.NO_OP,
      androidContext: Context? = null,
      localPrefs: LocalPrefsReader = LocalPrefsReader.DEFAULT,
      planMode: Boolean = false,
      enableDelegate: Boolean = false,
      skillStore: SkillStore? = null,
      inferenceTimeoutMs: Long = 0L,
    ): LocalInferenceBackend = LocalInferenceBackend(
      workspace = workspace,
      engineBaseUrl = engineBaseUrl,
      engineFactory = {
        if (engineBaseUrl.isBlank()) NullInferenceEngine
        else HttpLocalEngine(engineBaseUrl, modelNameProvider(), inferenceTimeoutMs.toInt())
      },
      modelNameProvider = modelNameProvider,
      historyStore = historyStore,
      androidContext = androidContext,
      localPrefs = localPrefs,
      planMode = planMode,
      enableDelegate = enableDelegate,
      skillStore = skillStore,
      inferenceTimeoutMs = inferenceTimeoutMs,
    )
  }
}
