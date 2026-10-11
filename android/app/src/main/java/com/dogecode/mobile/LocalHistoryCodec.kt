package com.dogecode.mobile

import org.json.JSONArray
import org.json.JSONObject

/**
 * 本地模式历史在两种类型之间转换：
 * - [ChatMsg]（OpenAI 格式，`ProviderClient` 用的）—— 推理循环的「真实」历史
 * - [ChatMessage]（UI 用的）—— 适配器渲染的「展示」历史
 *
 * ## 为什么不能直接存 [ChatMessage]
 *
 * [ChatMessage] 是渲染层类型（带 `expanded`、`images`、`toolUseId` 等 UI 字段）。
 * 本地模式的 agent 循环只认 [ChatMsg]（OpenAI 格式）。若把 [ChatMessage] 落盘，
 * 重启后要反序列化、再用 UI 字段构造 [ChatMsg] —— 那些字段对推理毫无价值。
 *
 * 反过来：若只存 [ChatMsg]，那 ChatMessage 怎么显示历史？答：本地模式恢复历史
 * 时**当场转换**。详见 [toChatMsgs]。
 *
 * ## 为什么只持久化 user / assistant 两类
 *
 * `AgentLoop` 内部会产生 `role=tool` 的消息（工具结果回填给模型）。
 * 那些是**上下文**而非「会话条目」—— 模型在下一轮自己会再次请求工具，
 * 回填的 tool 消息会再次出现。落盘反而让历史文件膨胀 3-5 倍。
 *
 * 远端历史也是同样的取舍（服务端只把 user/assistant 推送过来，
 * 工具气泡是事件而非历史）。故此处与远端行为对齐。
 */
object LocalHistoryCodec {

    /**
     * UI 历史 → 推理历史（按需转换，跳过 UI 专属字段）。
     *
     * `expanded` / `images` / `toolUseId` 等不传给模型 —— 那些是渲染态。
     * `role=tool` 的条目直接丢弃：UI 工具气泡是**事件**而非上下文，
     * 重启后 `AgentLoop` 会重新请求工具。
     */
    fun toChatMsgs(messages: List<ChatMessage>): List<ChatMsg> {
        val out = ArrayList<ChatMsg>(messages.size)
        for (m in messages) {
            if (m.role == "tool") continue  // 跳过：见类注释
            // 空文本的 system 不传：发给模型一份「你是助手」(空) 没意义
            if (m.role == "system" && m.text.isBlank()) continue
            when (m.role) {
                "user" -> out.add(ChatMsg.user(m.text))
                "assistant" -> {
                    // 空白气泡不该发给模型（哪怕 ChatMessage 里有可能是占位）
                    if (m.text.isBlank()) continue
                    out.add(ChatMsg.assistant(m.text))
                }
                "system" -> out.add(ChatMsg("system", m.text))
            }
        }
        return out
    }

    /**
     * 推理历史 → UI 历史（重启时把磁盘上的 OpenAI 格式回填给 adapter）。
     *
     * 必须给每条消息**新生成** id —— [ChatMessage.id] 用 UUID 是为了与
     * 「在途」消息不冲突（`ChatMessage.newId()` 即生成新 UUID），不能复用
     * 推理历史里的内容。`timestamp` 持久化会带上，但本地模式重启后
     * 「相对时间」会显示「刚刚」—— 这正是用户期望的（离线后再开该是当下）。
     */
    fun toChatMessages(messages: List<ChatMsg>): List<ChatMessage> {
        val out = ArrayList<ChatMessage>(messages.size)
        for (m in messages) {
            if (m.role == "tool") continue  // tool 不进 UI 历史（与 toChatMsgs 同样的取舍）
            when (m.role) {
                "user" -> out.add(ChatMessage.user(m.content.orEmpty(), id = ChatMessage.newId()))
                "assistant" -> {
                    // 空正文的 assistant 不显示（与 toJson 的取舍一致）——
                    // 否则 UI 会出现一个空白气泡
                    if (m.content.isNullOrBlank()) continue
                    out.add(
                        ChatMessage(
                            id = ChatMessage.newId(),
                            role = "assistant",
                            text = m.content,
                            timestamp = System.currentTimeMillis(),
                        ),
                    )
                }
                "system" -> if (!m.content.isNullOrBlank()) {
                    out.add(
                        ChatMessage(
                            id = ChatMessage.newId(),
                            role = "system",
                            text = m.content,
                            timestamp = System.currentTimeMillis(),
                        ),
                    )
                }
            }
        }
        return out
    }

    // ── 内部：JSON 序列化（与 MessageStore 的持久化格式解耦） ──

    /**
     * 序列化为 JSON 数组字符串（仅 user/assistant 两类，跳过 tool）。
     *
     * 跳过 tool 的同时**不**试图恢复——工具气泡是事件流，丢就丢。
     * 持久化时跳过它们，文件大小约为全量保存的 1/4。
     */
    fun toJson(messages: List<ChatMsg>): String {
        val arr = JSONArray()
        for (m in messages) {
            // 不用 `when` + `continue`：`continue` 在 when 分支体内只对
            // 内层 if 起作用，跳不到外层 for —— 这是 Kotlin 语法陷阱
            // （continue 必须直接出现在循环体内）。
            if (m.role == "tool") continue  // 跳过：见类注释
            if (m.role == "assistant" && m.content.isNullOrBlank()) {
                // 仅有 tool_calls 没正文的 assistant：保留（模型下一轮要靠它继续）
                if (m.toolCalls.isEmpty()) continue
            }
            if (m.role == "system" && m.content.isNullOrBlank()) {
                // 空系统消息没意义（也不能恢复为空字符串 —— 会让模型困惑）
                continue
            }
            val obj = JSONObject().apply {
                put("role", m.role)
                when (m.role) {
                    "user" -> put("content", m.content.orEmpty())
                    "assistant" -> {
                        if (!m.content.isNullOrBlank()) put("content", m.content)
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
                    }
                    "system" -> if (!m.content.isNullOrBlank()) put("content", m.content)
                }
            }
            arr.put(obj)
        }
        return arr.toString()
    }

    /**
     * 从 JSON 字符串恢复 [ChatMsg] 列表。
     *
     * ## 容错级别：整文件失败 → 空列表
     *
     * 用 `JSONArray(json)` 整体解析。**不用**逐条解析：历史文件由本类写出
     * （`toJson` 保证合法），损坏只会来自「用户手工编辑」或「写入中断」，
     * 两种情况下整体丢弃比「尽力抢救出半截数组」更安全 —— 半截历史会让
     * 模型看到断裂的对话链（如 assistant 说「我来改文件」然后没有下文）。
     *
     * 与 `MessageStore.load()` 的行为一致（那边也是坏文件返回空）。
     *
     * 单条内的问题（缺 role、非法 role、content 类型不对）逐条跳过。
     */
    fun fromJson(json: String): List<ChatMsg> {
        if (json.isBlank()) return emptyList()
        val arr = runCatching { JSONArray(json) }.getOrNull() ?: return emptyList()
        val out = ArrayList<ChatMsg>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val role = o.optString("role").takeIf { it.isNotBlank() } ?: continue
            val content = o.opt("content")?.let { if (it == JSONObject.NULL) null else it as? String }
            val msg = when (role) {
                "user" -> ChatMsg.user(content.orEmpty())
                "system" -> ChatMsg("system", content)
                "assistant" -> ChatMsg(
                    role = "assistant",
                    content = content,
                    toolCalls = parseToolCalls(o.optJSONArray("tool_calls")),
                )
                else -> continue
            }
            out.add(msg)
        }
        return out
    }

    private fun parseToolCalls(arr: JSONArray?): List<ToolCall> {
        if (arr == null) return emptyList()
        val out = ArrayList<ToolCall>(arr.length())
        for (i in 0 until arr.length()) {
            val tc = arr.optJSONObject(i) ?: continue
            val id = tc.optString("id").ifBlank { "call_$i" }
            val fn = tc.optJSONObject("function") ?: continue
            val name = fn.optString("name")
            if (name.isBlank()) continue
            val args = fn.optString("arguments")
            out.add(ToolCall(id = id, name = name, arguments = args))
        }
        return out
    }
}
