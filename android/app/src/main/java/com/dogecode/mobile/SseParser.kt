package com.dogecode.mobile

import org.json.JSONArray
import org.json.JSONObject

/**
 * OpenAI 兼容接口的 SSE 增量解析（纯逻辑，可单测）。
 *
 * ## 为什么抽成独立类
 *
 * 这段是本地模式里**最容易出错、且错了最难发现**的一环：
 * · 工具调用的 `arguments` 是**分片到达**的（`{"pa` + `th":"a"}`），
 *   按整体替换而非拼接会得到残缺 JSON，工具调用静默失败
 * · 增量与定稿的边界（`[DONE]`）处理错，会挂住或漏掉最后一段
 * · 思考内容（`reasoning_content`）与正文混在一起，会让用户看到
 *   思维链混进回复里
 *
 * 而这些错误都不会抛异常，只表现为「回复缺一块」或「工具没被调用」。
 * 埋在 HTTP 读取的循环里就只能靠真机抓包定位；抽出来则可穷举单测。
 *
 * 设计：**喂一行、返回是否结束**（[feed]），不持有 IO 资源 ——
 * 这样测试直接喂字符串即可，不需要造假 HttpURLConnection。
 */
class SseParser(
    /** 增量回调（每段正文调用一次）。 */
    private val onDelta: ProviderClient.OnDelta? = null,
) {

    private val text = StringBuilder()
    private val toolCalls = mutableListOf<Acc>()
    private var finishReason: String? = null

    /**
     * 本次响应的用量（input/output token）。
     *
     * OpenAI 兼容接口在**最后一个 chunk** 的 `usage` 字段里带上
     *（需请求带 `stream_options.include_usage`，由 ProviderClient 负责）。
     * 多数网关只在最后一帧给，取「最后一次看到的」即为全程值。
     *
     * 为 null = 服务端没给（部分网关不回）—— UI 据此显示「—」而非 0。
     */
    private var usage: ChatUsage? = null

    /**
     * 喂入一行。
     *
     * @return true 表示流已结束（遇到 `[DONE]`），调用方应停止读取。
     *
     * 逐行处理而非按字节：`BufferedReader.readLine` 会等到换行才返回，
     * 故一行一定是完整的 JSON —— **不要**改成按字节读再自行拼接，
     * 那才需要处理 TCP 分片。
     */
    fun feed(line: String): Boolean {
        if (!line.startsWith(PREFIX)) return false
        val payload = line.removePrefix(PREFIX).trim()
        if (payload.isEmpty()) return false
        if (payload == DONE) return true

        // 坏 JSON 直接跳过：单帧解析失败不该中断整条流
        //（部分网关会插入非标准的心跳帧）
        val obj = runCatching { JSONObject(payload) }.getOrNull() ?: return false

        // usage 在顶层（与 choices 平级），且常出现在「choices 为空」的
        // 收尾帧里 —— 必须在「取不到 choice」的早退**之前**吸收，
        // 否则永远读不到
        obj.optJSONObject("usage")?.let { u ->
            val p = u.optInt("prompt_tokens", -1)
            val c = u.optInt("completion_tokens", -1)
            if (p >= 0 || c >= 0) usage = ChatUsage(p.takeIf { it >= 0 } ?: 0, c.takeIf { it >= 0 } ?: 0)
        }

        val choice = obj.optJSONArray("choices")?.optJSONObject(0) ?: return false

        choice.optString("finish_reason")
            .takeIf { it.isNotBlank() && it != "null" }
            ?.let { finishReason = it }

        val delta = choice.optJSONObject("delta") ?: return false
        // 只取 content：部分 provider 用 reasoning_content 返回思考内容
        //（DeepSeek 等），一并累积会把它混进回复正文
        delta.optString("content").takeIf { it.isNotEmpty() }?.let {
            text.append(it)
            onDelta?.onDelta(it)
        }
        delta.optJSONArray("tool_calls")?.let { absorbToolCalls(it) }
        return false
    }

    /**
     * 吸收一次 tool_calls 增量。
     *
     * 两个必须做对的点：
     * 1. 按 `index` 归位（一次可能返回多个工具调用的混合增量）
     * 2. `arguments` **拼接**而非替换 —— 它是逐片到达的 JSON 字符串
     */
    private fun absorbToolCalls(arr: JSONArray) {
        for (i in 0 until arr.length()) {
            val tc = arr.optJSONObject(i) ?: continue
            val idx = tc.optInt("index", 0)
            if (idx < 0) continue
            while (toolCalls.size <= idx) toolCalls.add(Acc())
            val acc = toolCalls[idx]
            tc.optString("id").takeIf { it.isNotBlank() }?.let { acc.id = it }
            tc.optJSONObject("function")?.let { f ->
                f.optString("name").takeIf { it.isNotBlank() }?.let { acc.name = it }
                f.optString("arguments").takeIf { it.isNotEmpty() }?.let { acc.args.append(it) }
            }
        }
    }

    /** 汇总结果（流结束后调用）。 */
    fun result(): ChatResult = ChatResult(
        text = text.toString(),
        // 过滤掉没拿到 name 的条目：那说明这一路增量不完整，
        // 带着它去调用工具只会失败并让模型困惑
        toolCalls = toolCalls
            .filter { it.name.isNotBlank() }
            .mapIndexed { i, a ->
                ToolCall(
                    // 少数 provider 不返回 id，补一个稳定的兜底值
                    //（index 参与命名，保证同一轮内不重复）
                    id = a.id.ifBlank { "call_${a.name}_$i" },
                    name = a.name,
                    arguments = a.args.toString(),
                )
            },
        finishReason = finishReason,
        usage = usage,
    )

    private class Acc {
        var id: String = ""
        var name: String = ""
        val args = StringBuilder()
    }

    companion object {
        const val PREFIX = "data:"
        const val DONE = "[DONE]"
    }
}
