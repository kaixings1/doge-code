package com.dogecode.mobile

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 把本地对话历史渲染成可导出的文本（M5 起支持三种格式）。
 *
 * 为什么以 Markdown 为默认：用户导出多半是为了留存或转给他人（贴 issue、
 * 发同事）。Markdown 在纯文本阅读器里可读，在支持的平台上又能正确
 * 渲染代码块 —— 比纯文本信息量大，比 HTML 通用。
 *
 * 其余两种格式的用途：
 * - **纯文本**：粘贴到不支持 Markdown 的地方（短信、备忘录），不带 #
 *   等符号噪音
 * - **JSON**：程序化处理（导入别的工具、写脚本分析），保留全部结构字段
 *
 * 纯逻辑、无 Android 依赖，因此可完整单测。
 */
object ChatExporter {

    private val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())

    /** 导出格式。`desc` 用于选择弹窗的一行说明。 */
    enum class Format(val label: String, val desc: String) {
        /** Markdown（默认，信息量最大）。 */
        MARKDOWN("Markdown", "代码块可渲染，贴 issue/笔记最佳"),
        /** 纯文本（无格式符号，粘贴最干净）。 */
        PLAIN("纯文本", "不带 # 等符号，短信/备忘录最干净"),
        /** JSON（保留全部字段，供程序处理）。 */
        JSON("JSON", "保留全部字段，供脚本或别的工具处理"),
    }

    /**
     * 按格式导出。
     *
     * @param messages 本地历史（时间正序）
     * @param label    会话名，作为标题的一部分；为空时省略
     * @param format   导出格式，默认 [Format.MARKDOWN]（= 改造前行为）
     */
    fun export(messages: List<ChatMessage>, label: String? = null, format: Format = Format.MARKDOWN): String =
        when (format) {
            Format.MARKDOWN -> toMarkdown(messages, label)
            Format.PLAIN -> toPlainText(messages, label)
            Format.JSON -> toJsonText(messages, label)
        }

    /**
     * @param messages 本地历史（时间正序）
     * @param label    会话名，作为标题的一部分；为空时省略
     */
    fun toMarkdown(messages: List<ChatMessage>, label: String? = null): String {
        if (messages.isEmpty()) return ""

        val sb = StringBuilder()
        sb.append("# doge-code 对话记录")
        if (!label.isNullOrBlank()) sb.append(" · ").append(label)
        sb.append("\n\n")

        // 元信息：导出时刻与条数。用户回看时能判断这是哪次导出
        sb.append("- 导出时间：").append(stamp.format(Date())).append('\n')
        sb.append("- 消息条数：").append(messages.size).append("\n\n")
        sb.append("---\n\n")

        messages.forEach { m -> appendMessage(sb, m) }
        return sb.toString()
    }

    private fun appendMessage(sb: StringBuilder, m: ChatMessage) {
        when (m.role) {
            "user" -> {
                sb.append("## 我\n\n")
                sb.append(m.text.trim()).append("\n\n")
            }
            "assistant" -> {
                sb.append("## 助手\n\n")
                sb.append(m.text.trim()).append("\n\n")
            }
            else -> {
                // 系统/错误消息用引用块，与正文区分开
                sb.append("> ").append(m.text.trim().replace("\n", "\n> ")).append("\n\n")
            }
        }
    }

    /**
     * 纯文本格式：只有「角色: 内容」与空行分隔。
     *
     * 刻意不用任何符号装饰（#、>、---）—— 用户选纯文本就是为了粘贴后
     * 干净，符号噪音与 Markdown 一样碍事。
     */
    fun toPlainText(messages: List<ChatMessage>, label: String? = null): String {
        if (messages.isEmpty()) return ""
        val sb = StringBuilder()
        if (!label.isNullOrBlank()) sb.append(label).append("\n\n")
        messages.forEach { m ->
            val who = when (m.role) {
                "user" -> "我"
                "assistant" -> "助手"
                else -> "系统"
            }
            sb.append(who).append(": ").append(m.text.trim()).append("\n\n")
        }
        return sb.toString().trimEnd('\n')
    }

    /**
     * JSON 格式：一行为元信息、其余逐条完整字段。
     *
     * 用 [ChatMessage.toJson] 逐条序列化（与 MessageStore 落盘同源）——
     * 用户拿到的字段名与磁盘文件完全一致，写脚本处理时不用学两套 schema。
     */
    fun toJsonText(messages: List<ChatMessage>, label: String? = null): String {
        if (messages.isEmpty()) return ""
        val arr = org.json.JSONArray()
        arr.put(
            org.json.JSONObject().apply {
                put("type", "meta")
                put("exportedAt", stamp.format(Date()))
                put("count", messages.size)
                if (!label.isNullOrBlank()) put("label", label)
            },
        )
        messages.forEach { arr.put(it.toJson()) }
        return arr.toString(2)
    }
}
