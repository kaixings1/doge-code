package com.dogecode.mobile

import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.text.style.TypefaceSpan
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 消息列表适配器。
 *
 * 三种气泡：用户（右侧蓝）、助手（左侧灰）、系统/错误（居中暗色）。
 * 助手消息做轻量 Markdown 处理：```代码块```、**粗体**、`行内代码`。
 * 不引入完整 Markdown 库 —— 客户端只需要可读，不需要完整规范支持。
 */
class ChatAdapter : RecyclerView.Adapter<ChatAdapter.VH>() {

    private val items = mutableListOf<ChatMessage>()
    private val timeFmt = SimpleDateFormat("HH:mm", Locale.getDefault())

    fun submit(list: List<ChatMessage>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    /** 追加一条并滚动标志位（由调用方决定是否滚到底）。 */
    fun append(msg: ChatMessage): Int {
        items.add(msg)
        notifyItemInserted(items.size - 1)
        return items.size - 1
    }

    /** 按 id 就地更新（用于"发送中 → 已提交/失败"状态变化）。 */
    fun updateStatus(id: String, status: ChatMessage.Status) {
        val i = items.indexOfFirst { it.id == id }
        if (i < 0) return
        val old = items[i]
        if (old.status == status) return
        items[i] = old.copy(status = status)
        notifyItemChanged(i)
    }

    fun snapshot(): List<ChatMessage> = items.toList()

    override fun getItemCount() = items.size

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_message, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        holder.bind(items[position])
    }

    inner class VH(v: View) : RecyclerView.ViewHolder(v) {
        private val row: LinearLayout = v.findViewById(R.id.row)
        private val bubble: TextView = v.findViewById(R.id.bubble)
        private val meta: TextView = v.findViewById(R.id.meta)

        fun bind(m: ChatMessage) {
            when (m.role) {
                "user" -> {
                    row.gravity = Gravity.END
                    bubble.setBackgroundResource(R.drawable.bubble_user)
                    bubble.setTextColor(0xFFEAF2FF.toInt())
                    bubble.text = m.text
                    meta.gravity = Gravity.END
                    meta.text = buildMeta(m)
                }
                "system", "error" -> {
                    row.gravity = Gravity.CENTER
                    bubble.setBackgroundResource(R.drawable.bubble_system)
                    bubble.setTextColor(0xFFB8B8B8.toInt())
                    bubble.text = renderMarkdown(m.text)
                    meta.gravity = Gravity.CENTER
                    meta.text = timeFmt.format(Date(m.timestamp))
                }
                else -> {
                    row.gravity = Gravity.START
                    bubble.setBackgroundResource(R.drawable.bubble_assistant)
                    bubble.setTextColor(0xFFE8E8E8.toInt())
                    bubble.text = renderMarkdown(m.text)
                    meta.gravity = Gravity.START
                    meta.text = timeFmt.format(Date(m.timestamp))
                }
            }
        }

        private fun buildMeta(m: ChatMessage): String {
            val t = timeFmt.format(Date(m.timestamp))
            val s = when (m.status) {
                ChatMessage.Status.SENDING -> "发送中…"
                ChatMessage.Status.QUEUED -> "已提交"
                ChatMessage.Status.FAILED -> "发送失败"
                ChatMessage.Status.NONE -> ""
            }
            return if (s.isEmpty()) t else "$t · $s"
        }
    }

    companion object {
        /** 片段类型，由纯文本解析产生，再由 renderMarkdown 转成 Spannable。 */
        enum class Seg { TEXT, BOLD, CODE_BLOCK, CODE_INLINE }

        data class Piece(val type: Seg, val text: String)

        /**
         * 把极简 Markdown 解析为片段列表。
         *
         * 刻意不依赖任何 Android 类型，因此可在 JVM 单测中完整验证。
         * 渲染（加 span）另由 renderMarkdown 完成 —— 那部分才需要 Android。
         *
         * 规则：
         *   ```块```   → CODE_BLOCK（不解析语言，保持原文）
         *   **粗体**   → BOLD
         *   `行内`     → CODE_INLINE
         * 未闭合的标记按普通文本处理，绝不吞内容 —— AI 流式输出时
         * 出现未闭合标记是常态，吞字符会让用户看不到部分回复。
         */
        fun parseMarkdown(src: String): List<Piece> {
            val out = mutableListOf<Piece>()
            val text = StringBuilder()
            fun flush() {
                if (text.isNotEmpty()) {
                    out.add(Piece(Seg.TEXT, text.toString()))
                    text.clear()
                }
            }
            var i = 0
            while (i < src.length) {
                if (src.startsWith("```", i)) {
                    val end = src.indexOf("```", i + 3)
                    if (end >= 0) {
                        flush()
                        out.add(Piece(Seg.CODE_BLOCK, src.substring(i + 3, end).trim('\n')))
                        i = end + 3
                        continue
                    }
                }
                if (src.startsWith("**", i)) {
                    val end = src.indexOf("**", i + 2)
                    if (end >= 0) {
                        flush()
                        out.add(Piece(Seg.BOLD, src.substring(i + 2, end)))
                        i = end + 2
                        continue
                    }
                }
                if (src[i] == '`') {
                    val end = src.indexOf('`', i + 1)
                    if (end >= 0) {
                        flush()
                        out.add(Piece(Seg.CODE_INLINE, src.substring(i + 1, end)))
                        i = end + 1
                        continue
                    }
                }
                text.append(src[i])
                i++
            }
            flush()
            return out
        }

        /**
         * 片段列表 → Spannable。
         * 只负责加样式，文本内容由 parseMarkdown 决定。
         */
        fun renderMarkdown(src: String): CharSequence {
            val sb = SpannableStringBuilder()
            for (p in parseMarkdown(src)) {
                val start = sb.length
                sb.append(p.text)
                val end = sb.length
                when (p.type) {
                    Seg.CODE_BLOCK -> {
                        sb.setSpan(BackgroundColorSpan(0xFF2A2A2A.toInt()), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        sb.setSpan(TypefaceSpan("monospace"), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        sb.setSpan(ForegroundColorSpan(0xFF9CDCFE.toInt()), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    }
                    Seg.BOLD -> {
                        sb.setSpan(StyleSpan(Typeface.BOLD), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    }
                    Seg.CODE_INLINE -> {
                        sb.setSpan(TypefaceSpan("monospace"), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        sb.setSpan(BackgroundColorSpan(0xFF3A3A3A.toInt()), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    }
                    Seg.TEXT -> {}
                }
            }
            return sb
        }
    }
}
