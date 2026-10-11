package com.dogecode.mobile

import org.json.JSONObject

/**
 * 一条聊天消息。
 *
 * role 与服务端 WS 协议一致：'user' | 'assistant' | 'system' | 'error'。
 * 另有 'tool' —— 工具调用气泡（命令原文 + 结果 + 可折叠），见下方各字段。
 * status 只对用户消息有意义：发送中 / 已提交（服务端入队回执）/ 发送失败。
 *
 * 工具气泡（role == "tool"）的字段语义：
 * - text：折叠态显示的一行摘要（工具名 + 目标，或「思考」）
 * - toolDetail：命令原文（完整命令/路径/参数），展开后显示
 * - toolResult：工具执行结果（done/error 时），展开后显示
 * - toolState：running（进行中）/ done / error / thinking
 * - toolUseId：服务端 tool_use_id，用于把 running 与 done 事件配对成同一条气泡
 * - toolTruncated / toolFullLength：结果/原文被服务端截断时的提示
 * - expanded：折叠状态（用户点开/收起）。持久化，列表重建后不丢。
 */
data class ChatMessage(
    val id: String,
    val role: String,
    val text: String,
    val timestamp: Long,
    val status: Status = Status.NONE,
    val toolDetail: String = "",
    val toolResult: String = "",
    val toolState: String = "",
    val toolUseId: String = "",
    val toolTruncated: Boolean = false,
    val toolFullLength: Int = 0,
    val expanded: Boolean = false,
    /**
     * 所属回合分组的**折叠键**（仅工具气泡有值）。
     *
     * 为什么持久化在消息上而非单独一张表：折叠态是「这条过程气泡所在
     * 那一组的显示状态」，把它挂在组首成员上，列表重建时无需额外查询
     * 就能还原 —— 单独一张表还要处理消息被裁剪后的孤儿键。
     *
     * 只有组首成员带此值；它同时充当「这是本组第一条」的标记。
     */
    val turnGroupKey: String = "",
    /**
     * 所属回合分组是否已展开（仅对有 [turnGroupKey] 的组首成员有意义）。
     *
     * **必须是独立字段**，不能复用 [expanded]：后者是「这条工具气泡
     * 自身是否展开显示原文与结果」。二者语义不同 —— 用户点开单条气泡
     * 不应让整个组被判定为已展开（那会导致刷新后组内其他气泡突然
     * 全都冒出来）。默认 false（折叠），因为过程信息多数时候只需
     * 知道「跑了几步」。
     */
    val turnGroupExpanded: Boolean = false,
    /**
     * 用户消息附带的图片（base64，不含 data: 前缀）。
     *
     * 为什么存 base64 而非文件路径：图片经压缩后本就是内存里的 base64
     * （见 ImageCompressor），直接存省去「落盘 + 读回 + 清理」三步；
     * 且历史文件本身就是 JSON，base64 天然可序列化。
     *
     * 代价是历史文件变大 —— 故在存取两端都做了上限（见 MAX_IMAGES_PER_MSG
     * 与持久化时的裁剪），避免几十张图把 history.json 撑到几 MB。
     */
    val images: List<String> = emptyList(),

    /** 图片的 MIME 类型（与 [images] 一一对应的简化处理：同一条消息的图通常同类型）。 */
    val imageMediaType: String = "",

    /**
     * 批量选择模式下的选中态。
     *
     * **不进 [toJson]**：这是纯运行时 UI 态，落盘会污染历史文件，
     * 且重加载后也无意义（每次进 App 都是未选状态）。手写 toJson 本就不含它，
     * 故安全。
     */
    val selected: Boolean = false,
) {
    enum class Status { NONE, SENDING, QUEUED, FAILED }

    /** 是否为工具气泡。 */
    val isTool: Boolean get() = role == "tool"

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("role", role)
        put("text", text)
        put("timestamp", timestamp)
        put("status", status.name)
        if (toolDetail.isNotEmpty()) put("toolDetail", toolDetail)
        if (toolResult.isNotEmpty()) put("toolResult", toolResult)
        if (toolState.isNotEmpty()) put("toolState", toolState)
        if (toolUseId.isNotEmpty()) put("toolUseId", toolUseId)
        if (turnGroupKey.isNotEmpty()) put("turnGroupKey", turnGroupKey)
        if (turnGroupExpanded) put("turnGroupExpanded", true)
        if (images.isNotEmpty()) {
            put("images", org.json.JSONArray(images))
            if (imageMediaType.isNotEmpty()) put("imageMediaType", imageMediaType)
        }
        if (toolTruncated) put("toolTruncated", true)
        if (toolFullLength > 0) put("toolFullLength", toolFullLength)
        if (expanded) put("expanded", true)
    }

    companion object {
        fun fromJson(o: JSONObject): ChatMessage = ChatMessage(
            id = o.optString("id"),
            role = o.optString("role"),
            text = o.optString("text"),
            timestamp = o.optLong("timestamp"),
            status = runCatching { Status.valueOf(o.optString("status", "NONE")) }
                .getOrDefault(Status.NONE),
            toolDetail = o.optString("toolDetail"),
            toolResult = o.optString("toolResult"),
            toolState = o.optString("toolState"),
            toolUseId = o.optString("toolUseId"),
            toolTruncated = o.optBoolean("toolTruncated"),
            toolFullLength = o.optInt("toolFullLength"),
            expanded = o.optBoolean("expanded"),
            turnGroupKey = o.optString("turnGroupKey"),
            turnGroupExpanded = o.optBoolean("turnGroupExpanded"),
            images = imagesFrom(o.optJSONArray("images")),
            imageMediaType = o.optString("imageMediaType"),
        )

        /**
         * 从 JSON 数组读图片列表。
         *
         * 只接受非空字符串，且**限制条数**：历史文件可能被手工编辑或
         * 来自旧版本，条数不设限会让一条消息带着几十张图把列表卡死。
         */
        private fun imagesFrom(arr: org.json.JSONArray?): List<String> {
            if (arr == null) return emptyList()
            val out = mutableListOf<String>()
            for (i in 0 until minOf(arr.length(), MAX_IMAGES_PER_MSG)) {
                val s = arr.optString(i)
                if (s.isNotEmpty()) out.add(s)
            }
            return out
        }

        /** 单条消息最多显示/保存的图片数。 */
        const val MAX_IMAGES_PER_MSG = 4

        fun user(text: String, id: String = newId()) =
            ChatMessage(id, "user", text, System.currentTimeMillis(), Status.SENDING)

        /**
         * 带图片的用户消息。
         *
         * @param images base64（不含 data: 前缀），超过 [MAX_IMAGES_PER_MSG] 时截断
         * @param mediaType 图片 MIME，如 image/jpeg
         */
        fun userWithImages(
            text: String,
            images: List<String>,
            mediaType: String,
            id: String = newId(),
        ) = ChatMessage(
            id = id,
            role = "user",
            text = text,
            timestamp = System.currentTimeMillis(),
            status = Status.SENDING,
            images = images.take(MAX_IMAGES_PER_MSG),
            imageMediaType = mediaType,
        )

        fun assistant(text: String) =
            ChatMessage(newId(), "assistant", text, System.currentTimeMillis())

        fun system(text: String) =
            ChatMessage(newId(), "system", text, System.currentTimeMillis())

        /**
         * 新建一条工具气泡。
         *
         * @param title 折叠态摘要（工具名 + 目标，或「思考」）
         * @param state running / done / error / thinking
         * @param toolUseId 服务端 tool_use_id；thinking 无此值传空
         */
        fun tool(
            title: String,
            detail: String = "",
            result: String = "",
            state: String,
            toolUseId: String = "",
            truncated: Boolean = false,
            fullLength: Int = 0,
        ) = ChatMessage(
            id = newId(),
            role = "tool",
            text = title,
            timestamp = System.currentTimeMillis(),
            toolDetail = detail,
            toolResult = result,
            toolState = state,
            toolUseId = toolUseId,
            toolTruncated = truncated,
            toolFullLength = fullLength,
        )

        /**
         * 在消息列表中查找 toolUseId 匹配、仍在 running 的工具气泡，返回其 id。
         *
         * 工具结果（done/error 事件）按 toolUseId 配对到先前的 running 气泡，
         * 把结果与最终状态合并进同一条气泡 —— 否则每次工具调用会产生两条
         * 气泡（一条「运行中」、一条「结果」），列表被过程性活动刷爆。
         *
         * 返回 null 表示没有可配对的 running 气泡（结果先于 running 乱序到达、
         * 或列表裁剪把 running 气泡挤掉了），调用方应新建一条结果气泡。
         */
        fun findRunningToolCallId(messages: List<ChatMessage>, toolUseId: String): String? {
            if (toolUseId.isBlank()) return null
            return messages.firstOrNull {
                it.isTool && it.toolUseId == toolUseId && it.toolState == "running"
            }?.id
        }

        fun newId(): String = java.util.UUID.randomUUID().toString()
    }
}