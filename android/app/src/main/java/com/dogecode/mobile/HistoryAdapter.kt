package com.dogecode.mobile

import android.text.format.DateUtils
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

/**
 * 历史列表适配器。
 *
 * 时间用系统 [DateUtils] 格式化（"3 分钟前" 这类相对时间）：
 * 历史列表关心的是「多久没用了」，绝对时间反而要在脑子里换算。
 */
class HistoryAdapter(
    private val onDelete: (HistoryStore.Entry) -> Unit,
) : RecyclerView.Adapter<HistoryAdapter.VH>() {

    private var items: List<HistoryStore.Entry> = emptyList()

    fun submit(list: List<HistoryStore.Entry>) {
        items = list
        notifyDataSetChanged()
    }

    override fun getItemCount() = items.size

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_history, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val e = items[position]
        holder.bind(e)
        holder.delete.setOnClickListener { onDelete(e) }
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        private val key: TextView = v.findViewById(R.id.history_key)
        private val meta: TextView = v.findViewById(R.id.history_meta)
        val delete: ImageButton = v.findViewById(R.id.history_delete)

        fun bind(e: HistoryStore.Entry) {
            key.text = e.sessionKey

            val rel = DateUtils.getRelativeTimeSpanString(
                e.lastModified,
                System.currentTimeMillis(),
                DateUtils.MINUTE_IN_MILLIS,
            ).toString()

            // 条数 + 大小 + 相对时间。条数为 0 通常意味着文件损坏 ——
            // 标注出来，否则用户会疑惑「为什么这个 0 条还占空间」
            val countLabel = if (e.messageCount == 0) "0 条（可能已损坏）" else "${e.messageCount} 条"
            meta.text = "$countLabel · ${e.sizeLabel()} · $rel"
        }
    }
}
