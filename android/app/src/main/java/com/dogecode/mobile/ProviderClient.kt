package com.dogecode.mobile

import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Provider HTTP 客户端（本地模式的传输层）。
 *
 * ## 为什么用 HttpURLConnection 而非 OkHttp
 *
 * 本工程已引入 OkHttp（`BridgeClient` 用它做 WebSocket），但这里**不用它**：
 * · 本类只需要「POST 一个 JSON、读一行 SSE」，HttpURLConnection 够用
 * · 少一层依赖的收益：这段代码是**新引入的出错面**（超时、重定向、
 *   流式解析），用 JDK 自带 API 能让问题范围更小
 * · 未来若要换成 OkHttp 或引入 streaming 库，本类已是独立薄层，替换成本低
 *
 * 按 YAGNI 阶梯：标准库能做就不引入依赖。
 *
 * ## 流式（SSE）
 *
 * 手机上等待完整回复的体验很差（首字可能要 10 秒以上），故实现
 * `stream=true` 的增量回调。解析按 SSE 规范：以 `data: ` 开头，
 * `data: [DONE]` 结束。**只认这两条**，不做完整 SSE 规范支持
 *（`event:`/`id:` 等字段对 OpenAI 兼容接口无用）。
 */
class ProviderClient {

    /** 增量回调（在 IO 线程调用，调用方负责切回主线程）。 */
    fun interface OnDelta {
        fun onDelta(text: String)
    }

    private val io = Executors.newSingleThreadExecutor { r ->
        Thread(r, "provider-io").apply { isDaemon = true }
    }

    /**
     * 回主线程用的 handler。
     *
     * 惰性取 `Looper.getMainLooper()` 而非构造时取：JVM 单测里没有主线程
     * Looper，构造即取会让整个类在测试中不可用（而探测逻辑恰恰要单测）。
     */
    private val mainHandler: Handler by lazy { Handler(Looper.getMainLooper()) }

    /**
     * 发一次对话请求（流式）。
     *
     * @param messages OpenAI 格式的消息数组（含 system/assistant/user）
     * @param onDelta  每收到一段增量文本调用一次
     * @return 完整回复文本；失败时抛 [ProviderException]（含可读原因）
     */
    fun chat(
        config: ProviderConfig,
        messages: List<ChatMsg>,
        onDelta: OnDelta? = null,
        tools: List<ToolSpec> = emptyList(),
    ): ChatResult {
        if (!config.isUsable) {
            throw ProviderException("尚未配置 API：请先在设置里填写密钥与地址")
        }
        val url = URL(config.normalizedBaseURL + ENDPOINT)
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = config.timeoutMs
            // 读超时用同一值：流式响应期间每段之间不应间隔过久，
            // 否则视为连接已死（移动网络切换时常见）
            readTimeout = config.timeoutMs
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer ${config.apiKey}")
            setRequestProperty("Accept", "text/event-stream")
            config.headers.forEach { (k, v) -> setRequestProperty(k, v) }
        }

        try {
            conn.outputStream.use { it.write(buildBody(config, messages, tools).toString().toByteArray()) }

            val code = conn.responseCode
            if (code !in 200..299) {
                // 错误体里通常有可读原因（如 invalid_api_key / model_not_found），
                // 必须读出来 —— 只报状态码用户无法判断是 key 错还是模型名错
                val errBody = runCatching {
                    conn.errorStream?.bufferedReader()?.use { it.readText() }
                }.getOrNull().orEmpty()
                throw ProviderException(humanError(code, errBody))
            }

            return parseStream(conn, onDelta)
        } finally {
            runCatching { conn.disconnect() }
        }
    }

    /**
     * 异步版：避免调用方自己开线程。
     *
     * @param onDone  主线程外的完成回调（成功带结果，失败带异常）
     */
    fun chatAsync(
        config: ProviderConfig,
        messages: List<ChatMsg>,
        tools: List<ToolSpec> = emptyList(),
        onDelta: OnDelta? = null,
        onDone: (Result<ChatResult>) -> Unit,
    ) {
        io.execute {
            val r = runCatching { chat(config, messages, onDelta, tools) }
            onDone(r)
        }
    }

    fun shutdown() {
        io.shutdownNow()
    }

    /**
     * 在 IO 线程跑一段探测，结果回调到**主线程**。
     *
     * 为什么需要它：「获取模型」「测试会话」都要弹对话框 / 改控件，
     * 而 [chatAsync] 的 `onDone` 是在 IO 线程回调的（供 agent 循环用，
     * 那里不需要碰 UI）。设置页必须切回主线程，否则会崩在
     * `CalledFromWrongThreadException`。
     *
     * @param block 在 IO 线程执行，返回要传回主线程的值
     * @param onDone 主线程回调（成功值）
     * @param onError 主线程回调（面向用户的失败原因）
     */
    fun <T> runAsync(
        block: () -> T,
        onDone: (T) -> Unit,
        onError: (String) -> Unit,
    ) {
        io.execute {
            val result = runCatching { block() }
            mainHandler.post {
                result.onSuccess(onDone).onFailure { e ->
                    // ProviderException 的消息是写给用户看的，直接透传；
                    // 其它异常（IO/解析）没有用户可操作信息，给个兜底文案
                    onError(
                        (e as? ProviderException)?.message
                            ?: "请求失败：${e.message ?: e::class.java.simpleName}",
                    )
                }
            }
        }
    }

    // ── 模型列表 ──

    /**
     * 拉取该 baseURL 上可用的模型 id 列表（`GET /models`）。
     *
     * ## 为什么需要「填完 URL + key 就能列出模型」
     *
     * 用户最大的障碍是**不知道模型名该填什么**：多数中转/网关的模型名是
     * 自定义的（`gpt-4o` 在某网关叫 `gpt-4o-all`），填错的报错是 404，
     * 与「地址填错」无从区分。让程序问服务端要列表，用户只需点选。
     *
     * @return 模型 id 列表（已按 id 去重排序）；失败抛 [ProviderException]。
     *         列表为空时不算失败 —— 有些网关确实返回空列表。
     */
    fun listModels(config: ProviderConfig): List<String> {
        if (config.apiKey.isBlank()) {
            throw ProviderException("请先在上方填写 API 密钥")
        }
        if (!ProviderConfig.isUrlLike(config.baseURL)) {
            throw ProviderException("API 地址不合法（需 http/https 开头）")
        }
        val conn = open(config, MODELS_ENDPOINT) {
            setRequestProperty("Accept", "application/json")
        }
        try {
            val code = conn.responseCode
            if (code !in 200..299) {
                throw ProviderException(humanError(code, readErrorBody(conn)))
            }
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            return parseModels(body)
        } finally {
            runCatching { conn.disconnect() }
        }
    }

    /**
     * 测试配置是否真的能跑通一轮对话（`max_tokens` 取小值，不流式）。
     *
     * ## 为什么「列模型成功」还不够
     *
     * `/models` 只读权限，很多网关用「只读子 key」也能列出模型，但
     * **发不出对话**（403/402）。若只测 `/models`，用户会在列表出来了、
     * 兴冲冲发第一条消息时才撞上失败。测试必须落在真正的对话端点上。
     *
     * @return 模型实际返回的第一小段文本（空串表示服务端没给内容，但**连通成功**）
     */
    fun testChat(config: ProviderConfig): String {
        if (!config.isUsable) {
            throw ProviderException("请先在上方填写 API 密钥与地址")
        }
        val conn = open(config, ENDPOINT) {
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
        }
        try {
            conn.doOutput = true
            conn.outputStream.use {
                it.write(
                    JSONObject()
                        .put("model", pickModel(config))
                        .put("stream", false)
                        .put("max_tokens", TEST_MAX_TOKENS)
                        .put(
                            "messages",
                            JSONArray().put(
                                JSONObject().put("role", "user").put("content", TEST_PROMPT),
                            ),
                        )
                        .toString()
                        .toByteArray(),
                )
            }
            val code = conn.responseCode
            if (code !in 200..299) {
                throw ProviderException(humanError(code, readErrorBody(conn)))
            }
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            return extractContent(body)
        } finally {
            runCatching { conn.disconnect() }
        }
    }

    // ── 内部 ──

    /**
     * 打开一个带鉴权的连接。
     *
     * 与 [chat] 的差别：这里要拼 `/models` 与「不流式」两种场景，
     * 故抽出来避免把鉴权头写两遍（写两遍必然漂移）。
     */
    private fun open(
        config: ProviderConfig,
        endpoint: String,
        extra: HttpURLConnection.() -> Unit = {},
    ): HttpURLConnection {
        val url = URL(config.normalizedBaseURL + endpoint)
        return (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            // 探测类请求用独立超时：默认 60 秒会让用户盯着转圈一分钟，
            // 而「拉模型/测连接」失败后立刻重填即可，不需要等那么久
            val t = config.timeoutMs.coerceAtMost(PROBE_TIMEOUT_MS)
            connectTimeout = t
            readTimeout = t
            setRequestProperty("Authorization", "Bearer ${config.apiKey}")
            config.headers.forEach { (k, v) -> setRequestProperty(k, v) }
            extra()
        }
    }

    /**
     * 测试用的模型名：留空时不能什么都不填 —— 多数网关会因缺字段报 400，
     * 而「模型名错了」与「模型名没填」的错误信息往往一模一样，用户无从分辨。
     * 留空就从 /models 取第一个，仍取不到才让用户知情地失败。
     */
    private fun pickModel(config: ProviderConfig): String {
        if (config.model.isNotBlank()) return config.model
        return runCatching { listModels(config).firstOrNull() }.getOrNull()
            ?: throw ProviderException(
                "模型名未填写，且无法从 $MODELS_ENDPOINT 自动获取 —— 请在模型框里手填一个",
            )
    }

    /** 读错误响应体（用于把 4xx 翻译成人话）。 */
    private fun readErrorBody(conn: HttpURLConnection): String =
        runCatching { conn.errorStream?.bufferedReader()?.use { it.readText() } }
            .getOrNull().orEmpty()

    private fun buildBody(
        config: ProviderConfig,
        messages: List<ChatMsg>,
        tools: List<ToolSpec>,
    ): JSONObject = JSONObject().apply {
        if (config.model.isNotBlank()) put("model", config.model)
        put("stream", true)
        config.temperature?.let { put("temperature", it) }
        config.maxTokens?.let { put("max_tokens", it) }
        // 思考强度：0 表示关闭，不注入任何字段（兼容所有模型）。
        // >0 时按 provider 类型注入对应字段 —— 不同 OpenAI 兼容网关字段名不同：
        // · DeepSeek 风格（baseURL 含 deepseek）用 thinking 开关
        // · OpenAI o 系列 / 多数网关用 reasoning_effort（数字预算）
        // 不支持的模型会把多余参数当作 400，但本地模式是用户自选模型，属可控后果。
        if (config.thinkingBudget > 0) {
            when {
                config.normalizedBaseURL.contains("deepseek", ignoreCase = true) ->
                    put("thinking", JSONObject().apply { put("type", "enabled") })
                else ->
                    put("reasoning_effort", config.thinkingBudget)
            }
        }
        put("messages", JSONArray().apply {
            messages.forEach { m ->
                put(JSONObject().apply {
                    put("role", m.role)
                    // content 为 null 是合法的（assistant 只带 tool_calls 时）
                    if (m.content != null) put("content", m.content) else put("content", JSONObject.NULL)
                    m.toolCallId?.let { put("tool_call_id", it) }
                    m.name?.let { put("name", it) }
                    if (m.toolCalls.isNotEmpty()) {
                        put("tool_calls", JSONArray().apply {
                            m.toolCalls.forEach { tc ->
                                put(JSONObject().apply {
                                    put("id", tc.id)
                                    put("type", "function")
                                    put("function", JSONObject().apply {
                                        put("name", tc.name)
                                        put("arguments", tc.arguments)
                                    })
                                })
                            }
                        })
                    }
                })
            }
        })
        if (tools.isNotEmpty()) {
            put("tools", JSONArray().apply {
                tools.forEach { t ->
                    put(JSONObject().apply {
                        put("type", "function")
                        put("function", JSONObject().apply {
                            put("name", t.name)
                            put("description", t.description)
                            put("parameters", t.parameters)
                        })
                    })
                }
            })
        }
    }

    /**
     * 解析 `GET /models` 的响应体为模型 id 列表。
     *
     * 容错点（都是实测网关的真实差异）：
     * · 顶层字段可能是 `data`（OpenAI 规范）或 `models`（部分网关）
     * · `data` 的元素可能是对象（含 `id`）或**直接的 id 字符串**
     * · 某些网关会返回非模型的条目（如 embedding），此处**不猜**，
     *   全部列出让用户自己挑（自作聪明过滤会漏掉能用的模型）
     *
     * 解析失败返回空列表而非抛异常：调用方把它当作「这个端点不支持列模型」，
     * 提示用户手填 —— 比抛一个「JSON 解析失败」更有指导性。
     */
    internal fun parseModels(body: String): List<String> {
        val o = runCatching { JSONObject(body) }.getOrNull() ?: return emptyList()
        val arr = o.optJSONArray("data") ?: o.optJSONArray("models") ?: return emptyList()
        val out = LinkedHashSet<String>()
        for (i in 0 until arr.length()) {
            when (val e = arr.opt(i)) {
                is JSONObject -> e.optString("id").takeIf { it.isNotBlank() }?.let { out.add(it) }
                is String -> e.takeIf { it.isNotBlank() }?.let { out.add(it) }
            }
        }
        return out.sorted()
    }

    /**
     * 从非流式响应体里取助手文本。
     *
     * 取不到内容**不算失败**：测试的目的是验证「能不能跑通一轮对话」，
     * 而某些网关在极低 `max_tokens` 下就返回空 content —— 那反证了连接是通的。
     * 故返回空串由调用方按成功处理。
     */
    internal fun extractContent(body: String): String {
        val o = runCatching { JSONObject(body) }.getOrNull() ?: return ""
        val msg = o.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")
            ?: return ""
        val raw = msg.opt("content")
        // content 在部分网关返回的是数组（[{"type":"text","text":"..."}]）——
        // 直接 optString 会得到 "[]" 这种无意义文本，必须挡掉
        return (raw as? String)?.trim().orEmpty()
    }

    /** 从连接读 SSE 并解析（只负责 IO，解析交给 [SseParser]）。 */
    private fun parseStream(conn: HttpURLConnection, onDelta: OnDelta?): ChatResult {
        val parser = SseParser(onDelta)
        BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).use { reader ->
            while (true) {
                val line = reader.readLine() ?: break
                if (parser.feed(line)) break // [DONE] 已到
            }
        }
        return parser.result()
    }

    /**
     * 把 HTTP 错误转成用户能看懂的话。
     *
     * 关键：**区分「key 错」与「模型名错」** —— 两者都返回 4xx，
     * 但用户的下一步动作完全不同（改 key vs 改模型名）。
     * 只报「请求失败（401）」会让他反复试错。
     */
    private fun humanError(code: Int, body: String): String {
        val snippet = body.take(300).replace(Regex("\\s+"), " ").trim()
        val lower = body.lowercase()
        val hint = when {
            lower.contains("invalid_api_key") || lower.contains("incorrect api key") ->
                "API 密钥无效，请检查设置里的密钥"
            lower.contains("model") && (lower.contains("not found") || lower.contains("not exist")) ->
                "模型名不存在，请检查设置里的模型名"
            lower.contains("insufficient") || lower.contains("quota") || lower.contains("balance") ->
                "额度不足或欠费，请检查账户"
            code == 401 -> "认证失败（401），请检查 API 密钥"
            code == 403 -> "无权限（403），该密钥可能不允许访问此模型"
            code == 404 -> "地址不存在（404），请检查 API 地址是否填错"
            code == 429 -> "请求过于频繁（429），请稍后重试"
            code >= 500 -> "服务端错误（$code），请稍后重试"
            else -> "请求失败（$code）"
        }
        return if (snippet.isEmpty()) hint else "$hint\n\n服务端返回：$snippet"
    }

    companion object {
        private const val TAG = "ProviderClient"
        private const val ENDPOINT = "/chat/completions"
        private const val MODELS_ENDPOINT = "/models"
        private const val DATA_PREFIX = "data:"
        private const val DONE_SENTINEL = "[DONE]"

        /**
         * 探测类请求（拉模型 / 测试连接）的超时上限。
         *
         * 15 秒：正常网关 1-3 秒就返回。取 15 而非配置的 60 秒 —— 用户点
         * 「获取模型」后盯着转圈一分钟，会直接判定「这个功能坏了」而放弃。
         */
        const val PROBE_TIMEOUT_MS = 15_000

        /** 测试会话的提问。刻意极短：只验证链路，不消耗额度。 */
        const val TEST_PROMPT = "hi"

        /**
         * 测试会话的最大 token。
         *
         * 16 而非 1：某些网关把 `max_tokens=1` 视为非法并报 400，
         * 让人误判成「配置错了」，其实是参数太苛刻。
         */
        const val TEST_MAX_TOKENS = 16
    }

}

/** OpenAI 格式的一条消息。 */
data class ChatMsg(
    val role: String,
    val content: String?,
    val toolCallId: String? = null,
    val name: String? = null,
    val toolCalls: List<ToolCall> = emptyList(),
) {
    companion object {
        fun system(text: String) = ChatMsg("system", text)
        fun user(text: String) = ChatMsg("user", text)
        fun assistant(text: String) = ChatMsg("assistant", text)
        fun tool(toolCallId: String, content: String, name: String? = null) =
            ChatMsg("tool", content, toolCallId = toolCallId, name = name)
    }
}

/** 模型请求调用一个工具。 */
data class ToolCall(val id: String, val name: String, val arguments: String)

/** 暴露给模型的工具定义。 */
data class ToolSpec(val name: String, val description: String, val parameters: JSONObject)

/** 一次对话的 token 用量（服务端没给时字段为 0，见 ChatResult.usage 可空）。 */
data class ChatUsage(
    /** 输入（prompt）token 数。 */
    val promptTokens: Int,
    /** 输出（completion）token 数。 */
    val completionTokens: Int,
) {
    /** 合计。 */
    val totalTokens: Int get() = promptTokens + completionTokens

    companion object {
        fun fromJson(o: org.json.JSONObject?): ChatUsage? {
            if (o == null) return null
            val p = o.optInt("prompt_tokens", -1)
            val c = o.optInt("completion_tokens", -1)
            if (p < 0 && c < 0) return null
            return ChatUsage(p.takeIf { it >= 0 } ?: 0, c.takeIf { it >= 0 } ?: 0)
        }
    }
}

/** 一次对话的结果。 */
data class ChatResult(
    val text: String,
    val toolCalls: List<ToolCall>,
    val finishReason: String?,
    /** 本次调用的 token 用量；服务端未返回时为 null（UI 显示「—」）。 */
    val usage: ChatUsage? = null,
)

/** Provider 调用失败（消息面向用户）。 */
class ProviderException(message: String) : Exception(message)
