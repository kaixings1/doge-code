package com.dogecode.mobile

import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * 通过 HTTP 对接**本地 OpenAI 兼容推理服务端**的具体引擎实现。
 *
 * ## 为什么是「具体引擎」而非 GGUF native 库
 *
 * doge 铁律禁止引入 native `.so` 与 NDK 编译。真·GGUF 离线（在手机上
 * 直接跑 llama.cpp）必然要 native 库，故本仓库不引入。但「本地推理」的
 * 用户场景仍要落地：用户在手机上（如 Termux）或同网段起一个
 * OpenAI 兼容服务端（llama.cpp server / Ollama / LocalAI），暴露
 * `http://127.0.0.1:8080/v1`，本引擎通过 HTTP 复用 [SseParser] 对接它。
 *
 * 这与 [ProviderClient] 走远程 API 是**同一套 OpenAI 协议**，区别仅在于
 * 地址指向 `127.0.0.1` 的本地服务、且**无需鉴权 key**（本地服务一般
 * 不设 key）。这样「手机离线推理」真正可编译、可运行，且零新依赖。
 *
 * ## 后续升级路径（ponytail: 有意简化）
 *
 * 若日后引入原生 GGUF 引擎（需 NDK，须经用户明确决策解除铁律），只需
 * 另写 `class LlamaCppEngine : LocalInferenceEngine` 并在
 * [LocalInferenceBackend] 的工厂里返回它，本类与 UI/循环/工具全部零改动。
 * 当前 HTTP 引擎是第一优先级的「真能跑」形态。
 *
 * ## 复用而非重写
 *
 * SSE 解析、工具调用分片拼接、思考内容剥离等易错逻辑全在 [SseParser]，
 * 本类只做「拼 body + 发请求 + 喂行给 SseParser」，不重复实现解析。
 */
class HttpLocalEngine(
    /** 本地推理服务端 baseURL，如 `http://127.0.0.1:8080/v1`。 */
    private val baseUrl: String,
    /**
     * 模型名（服务端 `GET /models` 列出的某个 id）。
     * 空串时由 [listLocalModels] 取第一个，或请求时由服务端默认处理。
     */
    private val model: String,
    /** 单次生成超时（毫秒）。<=0 用默认。 */
    private val timeoutMs: Int = 60_000,
) : LocalInferenceEngine {

    /**
     * 生成一次回复（阻塞，应在 IO 线程）。
     *
     * 实现要点：
     * · 走 `/chat/completions`，`stream=true`，复用 [SseParser] 增量解析；
     * · 工具定义（AgentLoop 的 extraSpecs + 文件工具）原样转发，
     *   让本地模型也能「调工具」；
     * · `onToken` 每收一段正文回调（经 [SseParser.onDelta]），供打字机；
     * · `shouldStop` 在「读下一行之前」检查，超时/用户中断即停连接；
     * · 本地服务一般不设鉴权，故不发送 `Authorization` 头
     *   （部分服务对空 Bearer 反而 401，稳妥起见不加）。
     */
    override fun generate(
        messages: List<ChatMsg>,
        tools: List<ToolSpec>,
        onToken: (String) -> Unit,
        shouldStop: () -> Boolean,
    ): EngineResult {
        val url = URL(normalizeBase(baseUrl) + "/chat/completions")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = timeoutMs
            readTimeout = timeoutMs
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "text/event-stream")
        }
        try {
            conn.outputStream.use { os ->
                os.write(buildBody(messages, tools).toString().toByteArray(Charsets.UTF_8))
            }
            val code = conn.responseCode
            if (code !in 200..299) {
                val err = runCatching {
                    conn.errorStream?.bufferedReader()?.use { it.readText() }
                }.getOrNull().orEmpty().take(300)
                throw IllegalStateException("本地引擎返回 $code：$err")
            }
            val parser = SseParser(onDelta = ProviderClient.OnDelta { onToken(it) })
            BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).use { reader ->
                while (true) {
                    if (shouldStop()) break
                    val line = reader.readLine() ?: break
                    if (parser.feed(line)) break // [DONE]
                }
            }
            val r = parser.result()
            return EngineResult(
                text = r.text,
                toolCalls = r.toolCalls,
                finishReason = r.finishReason,
            )
        } finally {
            runCatching { conn.disconnect() }
        }
    }

    /** 拼请求体（OpenAI 格式）。工具与消息的序列化与 ProviderClient 同构。 */
    private fun buildBody(messages: List<ChatMsg>, tools: List<ToolSpec>): org.json.JSONObject =
        org.json.JSONObject().apply {
            if (model.isNotBlank()) put("model", model)
            put("stream", true)
            put("messages", org.json.JSONArray().apply {
                messages.forEach { m ->
                    put(org.json.JSONObject().apply {
                        put("role", m.role)
                        if (m.content != null) put("content", m.content) else put("content", org.json.JSONObject.NULL)
                        m.toolCallId?.let { put("tool_call_id", it) }
                        m.name?.let { put("name", it) }
                        if (m.toolCalls.isNotEmpty()) {
                            put("tool_calls", org.json.JSONArray().apply {
                                m.toolCalls.forEach { tc ->
                                    put(org.json.JSONObject().apply {
                                        put("id", tc.id)
                                        put("type", "function")
                                        put("function", org.json.JSONObject().apply {
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
                put("tools", org.json.JSONArray().apply {
                    tools.forEach { t ->
                        put(org.json.JSONObject().apply {
                            put("type", "function")
                            put("function", org.json.JSONObject().apply {
                                put("name", t.name)
                                put("description", t.description)
                                put("parameters", t.parameters)
                            })
                        })
                    }
                })
            }
        }

    /** 把 `http://host:port` 或 `http://host:port/v1/` 统一成 `http://host:port/v1`。 */
    private fun normalizeBase(raw: String): String {
        var s = raw.trim().trimEnd('/')
        if (!s.endsWith("/v1")) s += "/v1"
        return s
    }

    companion object {
        /** 地址归一化（companion 可见，避免实例依赖）。 */
        private fun normalizeBaseUrl(raw: String): String {
            var s = raw.trim().trimEnd('/')
            if (!s.endsWith("/v1")) s += "/v1"
            return s
        }

        /**
         * 解析 `/models` 响应体为模型 id 列表（与 [ProviderClient.parseModels] 同逻辑，
         * 但本类不依赖 ProviderClient 实例，故内联一份纯解析）。
         *
         * `internal` 而非 private：单测直接断言解析规则（网关响应格式极不统一，
         * 这是接入本地服务端最易出错的一环）。此前测试误引用
         * `ProviderClient.parseModels` —— 那是**实例方法**，静态调用编译不过。
         */
        internal fun parseModels(body: String): List<String> {
            val o = runCatching { org.json.JSONObject(body) }.getOrNull() ?: return emptyList()
            val arr = o.optJSONArray("data") ?: o.optJSONArray("models") ?: return emptyList()
            val out = LinkedHashSet<String>()
            for (i in 0 until arr.length()) {
                when (val e = arr.opt(i)) {
                    is org.json.JSONObject -> e.optString("id").takeIf { it.isNotBlank() }?.let { out.add(it) }
                    is String -> e.takeIf { it.isNotBlank() }?.let { out.add(it) }
                }
            }
            return out.sorted()
        }

        /**
         * 拉取本地服务端可用模型 id 列表（供设置页下拉选模型）。
         *
         * 与远程 `GET /models` 同协议，但**不要求 key**（本地服务一般不鉴权）。
         * 失败抛 [IllegalStateException]（消息面向用户）。
         */
        fun listModels(baseUrl: String, timeoutMs: Int = 15_000): List<String> {
            val url = URL(normalizeBaseUrl(baseUrl) + "/models")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = timeoutMs
                readTimeout = timeoutMs
                setRequestProperty("Accept", "application/json")
            }
            try {
                val code = conn.responseCode
                if (code !in 200..299) {
                    throw IllegalStateException("本地引擎拉模型失败（$code）")
                }
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                return parseModels(body)
            } finally {
                runCatching { conn.disconnect() }
            }
        }
    }
}
