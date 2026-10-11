package com.dogecode.mobile

import org.json.JSONObject

/**
 * 移动桥接协议的解析（纯逻辑，无 Android/网络依赖）。
 *
 * 从 BridgeClient 抽出，因为这是最该被测的一环：协议字段名写错、
 * 分支漏写，都会表现为「消息莫名不见了」或「一直没回复」，
 * 而这类问题在真机上极难定位（要抓包才能看出来）。
 *
 * 协议定义见 src/bridge/mobileBridge.ts。
 */
object BridgeProtocol {

    /** 解析结果。Unparsed 表示不是合法 JSON 或不认识的消息。 */
    sealed interface Msg {
        data class Connected(val interactive: Boolean) : Msg
        data class Incoming(
            val role: String,
            val text: String,
            /**
             * 终端正在前台时服务端会置 true —— 用户就在电脑前，
             * 手机不必再弹通知。消息本身仍渲染。
             *
             * 缺字段时默认 false（不抑制）：老服务端不带此字段，
             * 误判为「要抑制」会让用户完全收不到通知，
             * 而误判为「不抑制」只是偶尔多提醒一次 —— 后者代价小得多。
             */
            val suppressNotify: Boolean = false,
            /**
             * 来源消息的 uuid（仅 user/assistant 回推带）。
             *
             * 手机端发出的消息，其 uuid 即当初的 requestId（服务端
             * forwardToBridge 透传）。该消息随后被广播回所有手机时带此值，
             * 手机端据此精确去重「自己刚发、被服务端回推」的那条，
             * 取代原先依赖 SENDING 状态窗口 + 文本的脆弱去重。
             *
             * 缺字段时为空串：服务端本地产生的消息（终端键入、系统提示）
             * 没有对应的手机 pending，不去重。
             */
            val sourceRequestId: String = "",
        ) : Msg
        data class Queued(val requestId: String) : Msg
        data class Error(val message: String) : Msg

        /**
         * 服务端请求远程批准一次工具执行。
         *
         * 这是「手机端能否完成实际工作」的关键事件：在此之前，AI 要写文件/
         * 跑命令时请求只在电脑终端弹出，手机端完全无感，无法批准任何操作。
         */
        data class PermissionRequest(
            val requestId: String,
            val toolName: String,
            val description: String,
            val inputPreview: String,
            /**
             * diff 预览行（带 +/-/空格前缀）；非文件修改类工具时为空。
             *
             * 为什么需要：只给一个 input 摘要（如「路径: src/a.ts」）就让
             * 用户批准，是**安全上的实质缺口** —— 盲签比不签更糟，
             * 因为它让人以为自己在把关。
             */
            val diffLines: List<String> = emptyList(),
        ) : Msg

        /**
         * 服务端撤销一次权限请求（本地用户已在终端先决定了）。
         *
         * 必须处理：否则手机端会留着一张永远无效的批准卡片，
         * 用户点了之后服务端已无对应 waiter，响应被静默丢弃。
         */
        data class PermissionCancel(val requestId: String) : Msg

        /**
         * 流式增量：AI 正文的一段追加。
         *
         * 与 [Incoming] 的区别：这是**尽力而为**的预览（可丢、可能乱序），
         * 定稿消息（Incoming）才是权威版本，到达时必须替换预览内容。
         */
        data class Delta(val text: String, val seq: Int) : Msg

        /**
         * 工具/子代理活动。
         *
         * tool / thinking 由 MainActivity 落成可折叠的工具气泡（进消息列表，
         * 回合结束后仍留在历史）；agent 渲染在独立的紧凑「活动区」。
         *
         * detail / result 分别是命令原文与执行结果（服务端已截断到上限），
         * toolUseId 用于把 running 与 done 事件配对成同一条气泡。
         */
        data class ToolActivity(
            val kind: String,
            val name: String,
            val target: String,
            val state: String,
            /** 命令原文 / 文件路径 / 思考内容（服务端按 DETAIL_MAX 截断）。 */
            val detail: String = "",
            /** 工具执行结果文本（done/error 时；服务端按 RESULT_MAX 截断）。 */
            val result: String = "",
            /** 服务端 tool_use_id，用于配对 running 与 done。 */
            val toolUseId: String = "",
            /** 字段被服务端截断的标志（用于显示「已截断，共 N 字符」）。 */
            val truncated: Boolean = false,
            /** 截断前的原始长度（0 表示未截断/未知）。 */
            val fullLength: Int = 0,
        ) : Msg

        /**
         * 回合用量快照（累计值，与 CLI 状态栏口径一致）。
         *
         * 全部为累计：客户端在回复气泡下方显示「12.4k tokens · 8.3s」，
         * 让用户不必回电脑看状态栏就知道这次跑得多重。
         */
        data class Usage(
            val inputTokens: Int,
            val outputTokens: Int,
            val cacheReadTokens: Int,
            val durationMs: Long,
            val costUSD: Double,
        ) : Msg

        /**
         * 回合结束信号（与内容解耦）。
         *
         * 服务端在助手定稿到达时无条件推送（无论有无文本）。此前客户端只靠
         * role=assistant 定稿倒推结束，导致「只调工具不出文本」的回合永远
         * 收不到结束信号，进度条/中断按钮永久卡住。现改用本事件收起回合态。
         */
        data class TurnEnd(val reason: String) : Msg

        /** 合法 JSON 但类型未知/无需处理（如 client_disconnected）。 */
        object Ignored : Msg
        /** 非法 JSON 或缺关键字段。 */
        object Unparsed : Msg
    }

    /** 权限请求里 input 的预览长度上限。 */
    private const val INPUT_PREVIEW_MAX = 400

    /**
     * 把一条 WS 文本消息解析为 Msg。
     * 任何异常都返回 Unparsed —— 收到坏数据不应让客户端崩溃。
     */
    fun parse(text: String): Msg {
        val o = runCatching { JSONObject(text) }.getOrNull() ?: return Msg.Unparsed
        return when (o.optString("type")) {
            "client_connected" -> Msg.Connected(
                // 缺 interactive 字段时按 true 处理：服务端旧版本没有该字段，
                // 误报「非交互」比漏报更扰人。
                o.optJSONObject("data")?.optBoolean("interactive", true) ?: true,
            )

            // 服务端会把其它设备（或 CLI 终端）键入的消息以 type:"user" 广播，
            // 用于多设备同步。不能丢——否则 B 设备看不到 A 发的消息。
            // 自己发的那条由调用方按 sourceRequestId 精确去重（见 MainActivity）。
            "user" -> {
                val t = textOf(o) ?: return Msg.Unparsed
                Msg.Incoming("user", t, suppressFlagOf(o), sourceRequestIdOf(o))
            }

            "assistant", "message" -> {
                val t = textOf(o) ?: return Msg.Unparsed
                Msg.Incoming("assistant", t, suppressFlagOf(o), sourceRequestIdOf(o))
            }

            "system" -> {
                val t = o.optJSONObject("data")?.optString("message").orEmpty()
                if (t.isBlank()) Msg.Unparsed else Msg.Incoming("system", t, sourceRequestId = sourceRequestIdOf(o))
            }

            "result" -> {
                val d = o.optJSONObject("data")
                if (d == null) return Msg.Unparsed
                if (d.optString("status") == "queued") {
                    Msg.Queued(o.optString("requestId"))
                } else {
                    // 非 queued 的 result 可能带 message（如错误说明）
                    val m = d.optString("message").orEmpty()
                    if (m.isBlank()) Msg.Ignored else Msg.Incoming("assistant", m)
                }
            }

            "error" -> {
                val e = o.optJSONObject("data")?.optString("error").orEmpty()
                Msg.Error(e.ifBlank { "未知错误" })
            }

            // 服务端要求远程批准一次工具执行（见 mobileBridge.requestMobilePermission）
            "permission_request" -> {
                val d = o.optJSONObject("data") ?: return Msg.Unparsed
                val requestId = d.optString("requestId")
                // 缺 requestId 就无法回传决定 —— 必须丢弃而不是渲染一张
                // 点了没反应的卡片
                if (requestId.isBlank()) return Msg.Unparsed
                Msg.PermissionRequest(
                    requestId = requestId,
                    toolName = d.optString("toolName").ifBlank { "工具" },
                    description = d.optString("description"),
                    inputPreview = previewOf(d.opt("input")),
                    diffLines = diffLinesOf(d.optJSONObject("diff")),
                )
            }

            // 服务端撤销（本地用户已在终端先决定）
            "permission_cancel" -> {
                val id = o.optJSONObject("data")?.optString("requestId").orEmpty()
                if (id.isBlank()) Msg.Unparsed else Msg.PermissionCancel(id)
            }

            // 流式增量（见 mobileBridge.pushDeltaToMobileClients）
            "assistant_delta" -> {
                val d = o.optJSONObject("data") ?: return Msg.Unparsed
                val t = d.optString("text")
                if (t.isEmpty()) Msg.Unparsed else Msg.Delta(t, d.optInt("seq", 0))
            }

            // 工具/子代理活动（见 mobileBridge.pushToolActivityToMobileClients）
            "tool_activity" -> {
                val d = o.optJSONObject("data") ?: return Msg.Unparsed
                val name = d.optString("name")
                val state = d.optString("state").ifBlank { "running" }
                // 工具**结果**事件（done/error）的服务端 name 留空 —— Anthropic
                // 结果块只有 tool_use_id 没有工具名，靠 result 内容与 toolUseId
                // 配对到先前的 running 气泡。故只有「无名且非结果」的活动才丢弃，
                // 避免活动区出现一行只有图标没有内容的空白条目。
                val isResultEvent =
                    (state == "done" || state == "error") && d.optString("result").isNotBlank()
                if (name.isBlank() && !isResultEvent) return Msg.Unparsed
                Msg.ToolActivity(
                    kind = d.optString("kind").ifBlank { "tool" },
                    name = name,
                    target = d.optString("target"),
                    state = state,
                    detail = d.optString("detail"),
                    result = d.optString("result"),
                    toolUseId = d.optString("toolUseId"),
                    truncated = d.optBoolean("truncated", false),
                    fullLength = d.optInt("fullLength", 0),
                )
            }

            // 回合结束信号（见 mobileBridge.pushTurnEndToMobileClients）
            "turn_end" -> {
                val d = o.optJSONObject("data")
                Msg.TurnEnd(d?.optString("reason").orEmpty().ifBlank { "complete" })
            }

            // 回合用量（见 mobileBridge.pushUsageToMobileClients）
            "usage" -> {
                val d = o.optJSONObject("data") ?: return Msg.Unparsed
                Msg.Usage(
                    inputTokens = d.optInt("inputTokens"),
                    outputTokens = d.optInt("outputTokens"),
                    cacheReadTokens = d.optInt("cacheReadTokens"),
                    durationMs = d.optLong("durationMs"),
                    costUSD = d.optDouble("costUSD", 0.0),
                )
            }

            else -> Msg.Ignored
        }
    }

    /**
     * 把权限请求的 input 压成可读的一行预览。
     *
     * 手机上不可能展示完整 diff 或整个文件内容，只给关键字段的摘要，
     * 让用户判断「这个操作我认不认」。完整内容回电脑看。
     *
     * 取 key 的顺序按「最能说明这次操作在做什么」排：命令 > 路径 > 模式，
     * 都没有时退化为整个 JSON 的截断。
     */
    private fun previewOf(input: Any?): String {
        if (input == null) return ""
        if (input is String) return input.take(INPUT_PREVIEW_MAX)
        val o = input as? JSONObject ?: return input.toString().take(INPUT_PREVIEW_MAX)

        val keys = listOf("command", "file_path", "path", "pattern", "url", "prompt")
        for (k in keys) {
            val v = o.optString(k)
            if (v.isNotBlank()) {
                val label = when (k) {
                    "command" -> "命令"
                    "file_path", "path" -> "路径"
                    "pattern" -> "匹配"
                    "url" -> "地址"
                    else -> k
                }
                return "$label: ${v.take(INPUT_PREVIEW_MAX)}"
            }
        }
        return o.toString().take(INPUT_PREVIEW_MAX)
    }

    /**
     * 从 diff 对象里取出预览行。
     *
     * 坏数据一律返回空列表而非抛异常 —— diff 只是**辅助信息**，
     * 它解析失败不该导致整条权限请求被丢弃（那会让用户完全看不到
     * 请求，AI 永久挂起）。宁可不显示 diff，也要让批准流程走得通。
     */
    private fun diffLinesOf(diff: JSONObject?): List<String> {
        if (diff == null) return emptyList()
        val arr = diff.optJSONArray("lines") ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            arr.optString(i).takeIf { it.isNotEmpty() }
        }
    }

    /**
     * 从 data 中读通知抑制标志。
     *
     * 缺字段返回 false（不抑制）。理由：老服务端不带该字段，
     * 若默认 true，这些用户会**完全收不到通知** —— 静默失效；
     * 默认 false 只是偶尔多提醒一次，代价小得多。
     *
     * 必须显式判 Boolean 类型，不能直接用 optBoolean：
     * `optBoolean` 会把字符串 "true" / 数字 1 也解析为 true，
     * 而「抑制通知」是偏危险的方向 —— 类型异常时应落到「不抑制」，
     * 让用户至少能看到通知，而不是静默失联。
     */
    private fun suppressFlagOf(o: JSONObject): Boolean {
        val d = o.optJSONObject("data") ?: return false
        if (!d.has("suppressNotify")) return false
        return d.opt("suppressNotify") == true
    }

    /**
     * 从 data 中读来源 uuid（sourceUuid）。
     *
     * 手机端发出的消息其 uuid 即当初的 requestId，服务端推送回所有手机时
     * 带此字段，手机端据此匹配 pending 去重自己刚发的那条。
     *
     * 缺字段或空串返回 ""（不去重）：服务端本地产生的消息、或老服务端
     * 不带该字段时，不应被错配到任何 pending 集合。
     */
    private fun sourceRequestIdOf(o: JSONObject): String {
        val d = o.optJSONObject("data") ?: return ""
        return d.optString("sourceUuid").takeIf { it.isNotBlank() } ?: ""
    }

    /**
     * 从 data 中按优先级提取文本字段。
     * 服务端不同路径下字段名不一致，故依次尝试 text / message / content。
     */
    private fun textOf(o: JSONObject): String? {
        val d = o.optJSONObject("data") ?: return null
        val t = d.optString("text")
            .ifBlank { d.optString("message") }
            .ifBlank { d.optString("content") }
        return t.ifBlank { null }
    }
}
