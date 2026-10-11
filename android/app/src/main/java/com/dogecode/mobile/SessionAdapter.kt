package com.dogecode.mobile

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

/**
 * 会话列表适配器。
 *
 * 字段与原 SessionPickerDialog 的行一致（标签/端口/交互状态/已连设备数/
 * 工作目录），额外支持「当前」标记。
 *
 * 渲染逻辑刻意保持简单：所有判定都在 [submit] 时算好，bind 只做赋值 ——
 * 避免在滚动时做字符串拼接（RecyclerView 复用会反复调用 bind）。
 */
class SessionAdapter(
    private val onPick: (SessionScanner.Session) -> Unit,
    private val localSuffix: String,
    /**
     * 直接切换到该会话（一步到位，不走详情页）。
     *
     * 与 [onPick] 分开：点整行仍是「看详情」（那里有重命名、复制地址、
     * 恢复命令等），而「切换」是最常用的动作，值得一个独立的一步入口。
     */
    private val onSwitch: (SessionScanner.Session) -> Unit = {},
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    /** 列表项：要么是分组头，要么是一条会话。 */
    private sealed interface Row {
        data class Header(val host: String, val isLocal: Boolean, val count: Int) : Row
        data class Item(val session: SessionScanner.Session) : Row
    }

    private var rows: List<Row> = emptyList()
    private var currentPort: Int? = null

    /**
     * 提交**分组后**的数据。
     *
     * 分组在 [SessionOrganizer] 里做（纯逻辑可测），此处只负责
     * 把分组的树状结构摊平成 RecyclerView 需要的线性列表。
     */
    fun submitGroups(groups: List<SessionOrganizer.Group>, current: Int?) {
        currentPort = current
        rows = buildList {
            groups.forEach { g ->
                add(Row.Header(g.host, g.isLocal, g.sessions.size))
                g.sessions.forEach { add(Row.Item(it)) }
            }
        }
        notifyDataSetChanged()
    }

    override fun getItemCount() = rows.size

    override fun getItemViewType(position: Int) =
        if (rows[position] is Row.Header) TYPE_HEADER else TYPE_ITEM

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return if (viewType == TYPE_HEADER) {
            HeaderVH(inflater.inflate(R.layout.item_session_header, parent, false))
        } else {
            VH(inflater.inflate(R.layout.item_session, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val row = rows[position]) {
            is Row.Header -> (holder as HeaderVH).bind(
                SessionOrganizer.hostLabel(row.host, row.isLocal, localSuffix),
                row.count,
            )
            is Row.Item -> {
                val vh = holder as VH
                vh.bind(row.session, row.session.port == currentPort)
                vh.itemView.setOnClickListener { onPick(row.session) }
                vh.bindSwitch { onSwitch(row.session) }
            }
        }
    }

    /** 分组头：主机名 + 会话数。 */
    class HeaderVH(v: View) : RecyclerView.ViewHolder(v) {
        private val title: TextView = v.findViewById(R.id.header_title)
        private val count: TextView = v.findViewById(R.id.header_count)

        fun bind(label: String, n: Int) {
            title.text = label
            count.text = "($n)"
        }
    }

    companion object {
        private const val TYPE_HEADER = 0
        private const val TYPE_ITEM = 1
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        private val label: TextView = v.findViewById(R.id.item_label)
        private val current: TextView = v.findViewById(R.id.item_current)
        private val meta: TextView = v.findViewById(R.id.item_meta)
        private val cwd: TextView = v.findViewById(R.id.item_cwd)
        private val switchBtn: TextView = v.findViewById(R.id.item_switch)

        /** 绑定「切换」按钮的点击（与「当前会话」互斥显隐见 bind）。 */
        fun bindSwitch(onClick: () -> Unit) {
            switchBtn.setOnClickListener { onClick() }
        }

        fun bind(s: SessionScanner.Session, isCurrent: Boolean) {
            label.text = s.label
            current.visibility = if (isCurrent) View.VISIBLE else View.GONE
            // 已是当前会话时隐藏「切换」——点了没意义，留着只会让人
            // 误以为点了会「重连」
            switchBtn.visibility = if (isCurrent) View.GONE else View.VISIBLE

            // 非交互会话用红字标注：这种会话消息只入队不处理，
            // 用户连上去会以为「发消息没反应」是 bug
            val interactiveText = if (s.interactive) {
                "交互模式"
            } else {
                "⚠ 非交互，消息不会被处理"
            }
            meta.text = buildString {
                append("端口 ").append(s.port).append("   ").append(interactiveText)
                if (s.clients > 0) append("   已连 ").append(s.clients).append(" 台")
            }
            meta.setTextColor(if (s.interactive) 0xFF999999.toInt() else 0xFFF87171.toInt())

            cwd.text = s.cwd
            cwd.visibility = if (s.cwd.isBlank()) View.GONE else View.VISIBLE
        }
    }
}
