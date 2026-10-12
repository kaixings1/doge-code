package com.dogecode.mobile

import android.animation.ValueAnimator
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
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
 * 另有一种「工具气泡」（role="tool"）：可折叠，折叠时一行，展开显示
 * 命令原文与结果 —— 见 [ToolVH]。
 *
 * 助手消息做轻量 Markdown 处理：```代码块```、**粗体**、`行内代码`。
 * 不引入完整 Markdown 库 —— 客户端只需要可读，不需要完整规范支持。
 */
class ChatAdapter : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    /**
     * 渲染参数（由偏好决定）。
     *
     * 作为**单一来源**传给列表项，而不是让每个 VH 自己读偏好 ——
     * 后者会在滚动时反复读 SharedPreferences（性能）且难以测试。
     *
     * 默认值 = 改造前的观感，保证不设置偏好时行为不变。
     */
    data class DisplayOptions(
        /** 是否渲染 Markdown（关则显示纯文本，便于复制原始内容）。 */
        val markdown: Boolean = true,
        /** 代码块是否加背景与等宽字体。 */
        val codeHighlight: Boolean = true,
        /** 字号倍率（1.0 = 中）。 */
        val fontScale: Float = 1.0f,
        /** 消息密度：紧凑时缩小气泡间距。 */
        val compact: Boolean = false,
        /** 时间显示：相对（3 分钟前）还是绝对（14:30）。 */
        val relativeTime: Boolean = false,
    )

    /** 当前渲染参数。变更后需调 [applyOptions] 触发重绘。 */
    private var options = DisplayOptions()

    /**
     * 空态视图（无消息时显示）。由宿主经 [bindEmptyView] 注入。
     *
     * 为什么放在 adapter 而非各调用点：空态显隐应与「列表内容」严格同步，
     * 而 adapter 是内容的唯一权威（items）。若让多个 `adapter.submit()`
     * 调用点各自维护显隐，漏一处就会出现「有消息却显示空态」这类不一致。
     * 集中到 [refresh] 后不可能脱节。
     */
    private var emptyView: android.view.View? = null

    /** 注入空态视图（宿主在拿到视图后调用一次）。 */
    fun bindEmptyView(v: android.view.View?) {
        emptyView = v
        syncEmptyView()
    }

    /**
     * 同步空态可见性：无渲染行时显示，否则隐藏。
     *
     * 判据用 `rows.isEmpty()` 而非 `items.isEmpty()` —— 折叠分组等情形下
     * 两者可能不同，而「屏幕上有没有东西」取决于渲染行。
     * 注意流式预览也是渲染行（Row.Streaming），故生成中不会误显示空态。
     */
    private fun syncEmptyView() {
        val v = emptyView ?: return
        v.visibility = if (rows.isEmpty()) android.view.View.VISIBLE else android.view.View.GONE
    }

    /** 由 Activity 在偏好变化时调用。 */
    fun applyOptions(newOptions: DisplayOptions) {
        options = newOptions
        // 只改样式不改分组，但必须在重建行**之后**通知 ——
        // 构造后 Activity 会立即调本方法，此时 rows 还是空的，
        // 只 notify 不重建会导致列表空白
        refresh()
    }

    private val items = mutableListOf<ChatMessage>()
    private val timeFmt = SimpleDateFormat("HH:mm", Locale.getDefault())

    /** 长按一条消息（用户复制等）。null 时长按无行为。 */
    var onLongPress: ((ChatMessage) -> Unit)? = null

    /** 点击一条「发送失败」的消息重发。null 时点击无行为。 */
    var onRetry: ((ChatMessage) -> Unit)? = null

    /**
     * 用户点击工具气泡的标题行切换折叠。
     *
     * 由 Activity 挂接：先调 [toggleTool] 翻转数据里的折叠态并刷新，
     * 再持久化（折叠状态要随历史保存，列表重建后不丢）。
     */
    var onToolToggle: ((String) -> Unit)? = null

    /**
     * 用户点击回合分组的组头切换折叠。
     *
     * 传入组首成员的 id：折叠态存在那条消息上（见 rebuildRows）。
     */
    var onGroupToggle: ((String) -> Unit)? = null

    /**
     * 点击图片缩略图查看大图。参数为 base64 与 MIME 类型。
     *
     * 由 Activity 弹出一个可缩放的全屏对话框 —— 缩略图 160dp 看不清
     * 截图里的报错信息，而「拍张报错截图问 AI」正是这个客户端的
     * 主要用法之一，回看时看不清等于白存。
     */
    var onImageClick: ((String, String) -> Unit)? = null

    /**
     * 批量选择模式下的选中 id 集合（唯一事实来源）。
     *
     * 由 Activity 通过 [applySelection] 写入，渲染时按此集合高亮。
     * 不放进每条 ChatMessage（那是落盘数据），保持 UI 态与数据分离。
     */
    private var selectedIds: Set<String> = emptySet()

    /** 选择模式下点击一条消息：Activity 据此切换该条的选中态。 */
    var onSelectionClick: ((ChatMessage) -> Unit)? = null

    /** 写入新的选中集合并刷新（[selectedIds] 的唯一入口）。 */
    fun applySelection(set: Set<String>) {
        selectedIds = set
        refresh()
    }

    /**
     * 流式预览文本（AI 正在生成的正文）。
     *
     * 作为**虚拟的最后一项**渲染，不进 items —— 它每几十毫秒变一次，
     * 进 items 会导致 notifyItemInserted/Changed 频繁触发，
     * 且定稿消息到达时还要精确移除那一项，容易与真实消息索引错位。
     *
     * 定稿消息到达时调用方必须置回 null，否则预览与定稿会同时显示。
     */
    private var streamingPreview: String? = null

    fun setStreamingPreview(text: String?) {
        val had = streamingPreview != null
        val will = !text.isNullOrEmpty()
        streamingPreview = text?.takeIf { it.isNotEmpty() }
        // 预览是虚拟行，但它会改变 rows 的构成，故统一走重建
        if (had != will || will) refresh()
    }

    fun submit(list: List<ChatMessage>) {
        items.clear()
        items.addAll(list)
        refresh()
    }

    /**
     * 追加一条并返回它在**渲染行**中的位置（供调用方 scrollToPosition）。
     *
     * 返回渲染位置而非 items 下标：启用回合分组后两者不再相等
     * （折叠的组会把成员从渲染中剔除），若返回 items 下标，
     * 调用方滚到的是错误的位置。
     */
    fun append(msg: ChatMessage): Int {
        items.add(msg)
        refresh()
        val idx = rows.indexOfLast { it is Row.Msg && (it as Row.Msg).index == items.size - 1 }
        return if (idx >= 0) idx else rows.lastIndex
    }

    /** 按 id 就地更新（用于"发送中 → 已提交/失败"状态变化）。 */
    fun updateStatus(id: String, status: ChatMessage.Status) {
        val i = items.indexOfFirst { it.id == id }
        if (i < 0) return
        val old = items[i]
        if (old.status == status) return
        items[i] = old.copy(status = status)
        refresh()
    }

    /**
     * 重建渲染行并整体刷新。
     *
     * 用 notifyDataSetChanged 而非精确通知：分组是全局重算
     * （插入一条消息可能让「单个气泡」变成「一个组」，影响多行），
     * 精确 diff 的成本与出错率都高于整表刷新，而消息量级在几百条内，
     * 整表刷新的开销可忽略。
     */
    private fun refresh() {
        rebuildRows()
        notifyDataSetChanged()
        // 空态与内容同步（所有内容变更都经此处，漏不掉）
        syncEmptyView()
    }

    fun snapshot(): List<ChatMessage> = items.toList()

    /**
     * 渲染行：由 [items] 经回合分组计算而来。
     *
     * 为什么不直接按 items 下标渲染：折叠的组要把组内成员**从列表里
     * 剔除**，此时渲染位置与 items 下标不再一一对应。用一层显式的
     * 行列表把「数据」与「显示」解耦，避免在下标上做易错的偏移运算
     * （那正是折叠展开时列表错位的常见根因）。
     *
     * 每次 [rebuildRows] 重建：分组是纯函数（[TurnGrouping.buildNodes]），
     * 消息量级在几百条内，重建成本可忽略，换来的是「永不与数据脱节」。
     */
    private sealed interface Row {
        data class Msg(val index: Int) : Row
        data class GroupHeader(val firstIndex: Int, val count: Int, val collapsed: Boolean) : Row

        /**
         * 时间分隔线。
         *
         * 承载的是**标签文本**而非下标 —— 标签依赖「当前时间」，
         * 若在 bind 时重算，同一条线在列表滚动/重建后可能显示不同文案
         * （跨过午夜就变了），看起来像界面在乱跳。构建行时算一次即可。
         */
        data class Divider(val label: String) : Row
        object Streaming : Row
    }

    private var rows: List<Row> = emptyList()

    /** 重新计算渲染行。任何会改变分组或折叠态的变更后都要调用。 */
    private fun rebuildRows() {
        val projection = items.map {
            TurnGrouping.Item(
                id = it.id,
                role = it.role,
                groupKey = it.turnGroupKey,
                groupExpanded = it.turnGroupExpanded,
            )
        }
        // 折叠态取数抽成纯函数（TurnGrouping.collapsedKeysOf）——
        // 「组首标记」与「展开态」的交汇判据易错且可测，
        // 留在 Adapter 里会因无法在 JVM 单测中构造而失去覆盖。
        val collapsedKeys = TurnGrouping.collapsedKeysOf(projection)

        val nodes = TurnGrouping.buildNodes(projection, collapsedKeys)
        val out = mutableListOf<Row>()

        // 时间戳序列：供分隔线判据使用（只看「前一条」的间隔）
        val stamps = items.map { it.timestamp }
        val now = System.currentTimeMillis()

        /** 在插入某条消息前，按需先插入分隔线。 */
        fun maybeDivider(index: Int) {
            if (!TimeDivider.shouldDivide(stamps, index)) return
            // 避免与前一条行重复：同一时间点连续插入多条（如组内展开）
            // 时不该出现两条相同的线
            val label = TimeDivider.label(stamps[index], now)
            if (label.isEmpty()) return
            if (out.lastOrNull() is Row.Divider) return
            out.add(Row.Divider(label))
        }

        for (n in nodes) {
            when (n) {
                is TurnGrouping.Node.Single -> {
                    maybeDivider(n.index)
                    out.add(Row.Msg(n.index))
                }
                is TurnGrouping.Node.Group -> {
                    maybeDivider(n.indices.first())
                    out.add(Row.GroupHeader(n.indices.first(), n.indices.size, n.collapsed))
                    // 折叠时只显示组头 —— 组内成员完全不进渲染列表
                    if (!n.collapsed) n.indices.forEach {
                        maybeDivider(it)
                        out.add(Row.Msg(it))
                    }
                }
            }
        }
        if (streamingPreview != null) out.add(Row.Streaming)
        rows = out
    }

    /** 真实消息数 + 预览（若存在）。 */
    override fun getItemCount(): Int {
        // rows 由 rebuildRows 维护；此处兜底重建以防调用方漏调
        return rows.size
    }

    override fun getItemViewType(position: Int): Int = when (rows.getOrNull(position)) {
        is Row.GroupHeader -> VIEW_TYPE_GROUP
        is Row.Divider -> VIEW_TYPE_DIVIDER
        is Row.Msg -> if (items[rows[position].let { (it as Row.Msg).index }].isTool) {
            VIEW_TYPE_TOOL
        } else {
            VIEW_TYPE_MESSAGE
        }
        else -> VIEW_TYPE_MESSAGE
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return when (viewType) {
            VIEW_TYPE_TOOL -> ToolVH(inflater.inflate(R.layout.item_tool, parent, false))
            VIEW_TYPE_GROUP -> GroupVH(inflater.inflate(R.layout.item_turn_group, parent, false))
            VIEW_TYPE_DIVIDER -> DividerVH(inflater.inflate(R.layout.item_time_divider, parent, false))
            else -> VH(inflater.inflate(R.layout.item_message, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val row = rows.getOrNull(position)) {
            is Row.Streaming -> (holder as VH).bindStreaming(streamingPreview ?: return)
            is Row.GroupHeader -> (holder as GroupVH).bind(row.firstIndex, row.count, row.collapsed)
            is Row.Divider -> (holder as DividerVH).bind(row.label)
            is Row.Msg -> {
                val m = items.getOrNull(row.index) ?: return
                if (holder is ToolVH) holder.bind(m) else (holder as VH).bind(m)
            }
            null -> Unit
        }
    }

    /** 按 id 翻转工具气泡的折叠态并刷新（数据就地更新，供持久化）。 */
    fun toggleTool(id: String) {
        val i = items.indexOfFirst { it.id == id }
        if (i < 0) return
        items[i] = items[i].copy(expanded = !items[i].expanded)
        refresh()
    }

    /**
     * 切换回合分组的折叠态（传入组首成员 id）。
     *
     * 折叠状态存在组首成员的 expanded 上：expanded=true 表示组已展开。
     * 注意与工具气泡自身的 expanded 语义**方向相反**（气泡 true=展开，
     * 这里是「组展开」）—— 二者不冲突，因为组首成员同时也是工具气泡，
     * 但它作为气泡的折叠态在组展开时并不生效（组折叠时它根本不渲染）。
     */
    fun toggleGroup(firstMemberId: String) {
        val i = items.indexOfFirst { it.id == firstMemberId }
        if (i < 0) return
        val old = items[i]
        // 翻转的是**组**展开态（turnGroupExpanded），不动该气泡自身的
        // expanded —— 两者独立，混用会让「点组头」与「点气泡」互相干扰
        items[i] = old.copy(turnGroupExpanded = !old.turnGroupExpanded)
        refresh()
    }

    /**
     * 把工具结果合并进一条 running 的工具气泡（按 id 定位）。
     *
     * 结果到达时自动展开 —— 用户刚看到「运行中」的下一步自然是想看结果，
     * 若保持折叠，结果「悄悄到了」而用户毫无感知。
     */
    fun updateToolResult(
        id: String,
        result: String,
        state: String,
        truncated: Boolean,
        fullLength: Int,
    ) {
        val i = items.indexOfFirst { it.id == id }
        if (i < 0) return
        val old = items[i]
        if (!old.isTool) return
        items[i] = old.copy(
            toolResult = result,
            toolState = state,
            toolTruncated = truncated,
            toolFullLength = fullLength,
            expanded = true,
        )
        refresh()
    }

    /**
     * 回合分组组头：显示「本轮活动（N 项）」与折叠箭头。
     *
     * 点击整行切换折叠。折叠态写在组首成员（[firstIndex] 对应的消息）的
     * expanded 字段上，随历史持久化。
     */
    inner class GroupVH(v: View) : RecyclerView.ViewHolder(v) {
        private val arrow: TextView = v.findViewById(R.id.group_arrow)
        private val label: TextView = v.findViewById(R.id.group_label)

        fun bind(firstIndex: Int, count: Int, collapsed: Boolean) {
            label.textSize = 12f * options.fontScale
            label.text = TurnGrouping.groupLabel(count)
            // 折叠时箭头向右（▸，展开它），展开时向下（▾，收起它）——
            // 箭头方向表达的是「点下去的后果」，与工具气泡保持一致
            arrow.text = if (collapsed) "▸" else "▾"
            val first = items.getOrNull(firstIndex) ?: return
            itemView.findViewById<View>(R.id.group_header).setOnClickListener {
                onGroupToggle?.invoke(first.id)
            }
        }
    }

    /** 时间分隔线：居中一行小字，两侧留白由布局处理。 */
    inner class DividerVH(v: View) : RecyclerView.ViewHolder(v) {
        private val label: TextView = v.findViewById(R.id.divider_label)

        fun bind(text: String) {
            label.textSize = 11f * options.fontScale
            label.text = text
        }
    }

    /** 工具气泡专用 ViewHolder：一行标题可点击折叠，展开显示原文与结果。 */
    inner class ToolVH(v: View) : RecyclerView.ViewHolder(v) {
        private val body: View = v.findViewById(R.id.tool_body)
        private val arrow: TextView = v.findViewById(R.id.tool_arrow)
        private val title: TextView = v.findViewById(R.id.tool_title)
        private val state: TextView = v.findViewById(R.id.tool_state)
        private val detail: TextView = v.findViewById(R.id.tool_detail)
        private val result: TextView = v.findViewById(R.id.tool_result)
        private val meta: TextView = v.findViewById(R.id.tool_meta)

        fun bind(m: ChatMessage) {
            title.textSize = 13f * options.fontScale
            detail.textSize = 12f * options.fontScale
            result.textSize = 12f * options.fontScale

            title.text = m.text
            state.text = stateLabel(m.toolState)
            arrow.text = if (m.expanded) "▾" else "▸"

            // 展开体按「有内容才显示」，折叠时整体隐藏
            body.visibility = if (m.expanded) View.VISIBLE else View.GONE

            // 命令原文：按行数截断（超长 heredoc/脚本看开头即可）。
            // 截断提示追加在末尾，让用户知道还有内容没显示。
            if (m.toolDetail.isNotEmpty()) {
                val (kept, dropped) = ToolVisual.truncateDetail(m.toolDetail)
                detail.visibility = View.VISIBLE
                detail.text = if (dropped > 0) "$kept\n…（还有 $dropped 行未显示）" else kept
            } else {
                detail.visibility = View.GONE
            }

            // 结果：同样按行数截断。这是最需要限制的一处——
            // 一次 npm test 的输出能有好几百行。
            if (m.toolResult.isNotEmpty()) {
                val (kept, dropped) = ToolVisual.truncateResult(m.toolResult)
                result.visibility = View.VISIBLE
                result.text = if (dropped > 0) "$kept\n…（还有 $dropped 行未显示）" else kept
            } else {
                result.visibility = View.GONE
            }

            // 按工具类别着色：有副作用的工具（写/执行）用暖色，读类用冷色。
            // 用户扫一眼就能分辨「刚才那步是改文件还是只看了看」。
            applyCategoryColor(m)

            // 截断提示 + 时间
            val truncation = if (m.toolTruncated && m.toolFullLength > 0) {
                "已截断，共 ${m.toolFullLength} 字符"
            } else {
                ""
            }
            val timeText = timeFmt.format(Date(m.timestamp))
            meta.visibility = if (truncation.isNotEmpty()) View.VISIBLE else View.GONE
            meta.text = if (truncation.isNotEmpty()) "$truncation · $timeText" else ""

            // 点击标题行折叠；长按复制（原文 + 结果一并）。
            val header = itemView.findViewById<View>(R.id.tool_header)
            header.setOnClickListener { onToolToggle?.invoke(m.id) }
            header.setOnLongClickListener {
                val handler = onLongPress
                if (handler == null) false else { handler(m); true }
            }
        }

        /**
         * 按工具类别给标题与状态着色。
         *
         * 失败（state="error"）时**强制红色**且优先于类别色 ——
         * 用户最需要一眼看到的就是「哪一步炸了」，此时按类别染成
         * 蓝/绿反而掩盖了这个信息。
         */
        private fun applyCategoryColor(m: ChatMessage) {
            val header = itemView.findViewById<View>(R.id.tool_header)
            if (m.toolState == "error") {
                title.setTextColor(COLOR_ERROR)
                state.setTextColor(COLOR_ERROR)
                header.setBackgroundResource(R.drawable.bubble_tool_error)
                return
            }
            val color = when (ToolVisual.categoryOf(m.text, "")) {
                ToolVisual.Category.WRITE -> COLOR_WRITE
                ToolVisual.Category.READ -> COLOR_READ
                ToolVisual.Category.NETWORK -> COLOR_NETWORK
                ToolVisual.Category.AGENT -> COLOR_AGENT
                ToolVisual.Category.OTHER -> COLOR_OTHER
            }
            title.setTextColor(color)
            state.setTextColor(COLOR_DIM)
            header.setBackgroundResource(R.drawable.bubble_tool)
        }

        /** 状态 → 一行可读文字。 */
        private fun stateLabel(state: String): String = when (state) {
            "running" -> "运行中"
            "done" -> "完成"
            "error" -> "失败"
            "thinking" -> "思考中"
            else -> ""
        }
    }

    inner class VH(v: View) : RecyclerView.ViewHolder(v) {
        private val row: LinearLayout = v.findViewById(R.id.row)
        private val bubble: TextView = v.findViewById(R.id.bubble)
        private val meta: TextView = v.findViewById(R.id.meta)
        private val imageRow: LinearLayout = v.findViewById(R.id.image_row)

        /** 呼吸光标的 span（每次绑定流式预览时复用同一实例）。 */
        private var cursorSpan: TypingCursorSpan? = null

        /** 呼吸动画。仅在流式预览期间非 null，见 [stopCursorAnimation]。 */
        private var cursorAnimator: ValueAnimator? = null

        /**
         * 渲染消息附带的图片缩略图。
         *
         * 每次 bind 都清空重建：RecyclerView 复用 ViewHolder，
         * 不清空会让上一条消息的图片「串」到下一条上 —— 那是很显眼的
         * 错乱（用户会以为自己的图发错了）。
         *
         * 解码失败时跳过该图而非留空位：坏数据的图片没法显示，
         * 留个灰方块只会让人以为是加载中。
         */
        private fun bindImages(m: ChatMessage) {
            imageRow.removeAllViews()
            if (m.images.isEmpty()) {
                imageRow.visibility = View.GONE
                return
            }
            val sizePx = (160 * imageRow.resources.displayMetrics.density).toInt()
            val marginPx = (6 * imageRow.resources.displayMetrics.density).toInt()
            var shown = 0
            m.images.forEach { b64 ->
                val iv = android.widget.ImageView(imageRow.context).apply {
                    layoutParams = LinearLayout.LayoutParams(sizePx, sizePx).apply {
                        // 第一张不留左边距，其余留 —— 否则整行会往右偏
                        marginStart = if (shown == 0) 0 else marginPx
                    }
                    scaleType = android.widget.ImageView.ScaleType.CENTER_CROP
                    setBackgroundResource(R.drawable.bubble_system)
                    contentDescription = "图片"
                }
                if (ImagePreview.renderThumb(iv, b64)) {
                    // 只有「原图明显更大」才给点击看大图的交互 ——
                    // 否则点开只是把图放大成模糊一团，不如不给
                    if (ImagePreview.worthPreviewing(b64)) {
                        iv.setOnClickListener { onImageClick?.invoke(b64, m.imageMediaType) }
                    }
                    imageRow.addView(iv)
                    shown++
                }
            }
            imageRow.visibility = if (shown > 0) View.VISIBLE else View.GONE
        }

        /**
         * 渲染流式预览（助手正在生成的正文）。
         *
         * 与 bind 的助手分支同样式，但 meta 显示「生成中…」而非时间 ——
         * 让用户明确知道这段文字还在增长，不是已完成的回复。
         * 不绑定长按/点击（预览是临时的，复制它没有意义，定稿后才是正式内容）。
         */
        fun bindStreaming(text: String) {
            // 预览是助手正文，不带图片；但复用同一个 VH 时必须清掉
            // 上一条消息残留的图片，否则会出现「生成中」下方挂着别人的图
            imageRow.removeAllViews()
            imageRow.visibility = View.GONE
            row.gravity = Gravity.START
            bubble.setBackgroundResource(R.drawable.bubble_assistant)
            bubble.setTextColor(STREAMING_TEXT_COLOR)
            bubble.textSize = 15f * options.fontScale
            // 正文 + 末尾呼吸光标。光标是 ReplacementSpan，必须设在 Spannable 上，
            // 故这里不能用 renderIfMarkdown 的 CharSequence 直接赋值 —— 需包一层
            // SpannableStringBuilder 以便 setSpan。
            bubble.text = withTypingCursor(renderIfMarkdown(text))
            meta.gravity = Gravity.START
            meta.text = "生成中…"
            bubble.setOnLongClickListener(null)
            bubble.isClickable = false
            bubble.setOnClickListener(null)
            startCursorAnimation()
            // 诊断探针：确认光标真的挂上了（span 存在）+ 动画在跑。
            // 呼吸圆点极小，截图上不易辨认，靠日志确认代码路径确实执行到。
            android.util.Log.i(
                "doge-cursor",
                "bindStreaming len=${text.length} span=${cursorSpan != null} anim=${cursorAnimator?.isRunning == true}",
            )
        }

        /**
         * 在正文末尾追加呼吸光标。
         *
         * 先 append 一个空格再 setSpan 其上：ReplacementSpan 会占据该字符的宽度，
         * 直接设在末尾空位置（length..length）多数 TextView 不会调用 draw。
         */
        private fun withTypingCursor(body: CharSequence): CharSequence {
            val sb = SpannableStringBuilder(body)
            sb.append(" ")
            val span = cursorSpan ?: TypingCursorSpan(
                dotColor = STREAMING_TEXT_COLOR,
                // 密度从资源取，而非估计 —— 见 TypingCursorSpan 注释
                density = bubble.resources.displayMetrics.density,
            ).also { cursorSpan = it }
            sb.setSpan(span, sb.length - 1, sb.length, Spanned.SPAN_INCLUSIVE_EXCLUSIVE)
            return sb
        }

        /**
         * 启动呼吸动画（幂等：已在跑则直接返回）。
         *
         * 用 ValueAnimator.REVERSE + INFINITE 做「胀-缩」循环，
         * 每帧改 span.scale 并 invalidate —— 比每帧重设 text 便宜得多。
         */
        private fun startCursorAnimation() {
            if (cursorAnimator != null) return
            cursorAnimator = ValueAnimator.ofFloat(TypingCursorSpan.MIN_SCALE, TypingCursorSpan.MAX_SCALE).apply {
                duration = CURSOR_BREATH_MS
                repeatMode = ValueAnimator.REVERSE
                repeatCount = ValueAnimator.INFINITE
                addUpdateListener {
                    cursorSpan?.scale = it.animatedValue as Float
                    bubble.invalidate()
                }
                start()
            }
        }

        /**
         * 停止呼吸动画（预览结束 / ViewHolder 被回收时调用）。
         *
         * **必须停**：RecyclerView 回收后 TextView 可能已不可见，
         * 但 ValueAnimator 仍持有它并每帧 invalidate → 泄漏 + 无谓耗电。
         */
        fun stopCursorAnimation() {
            cursorAnimator?.cancel()
            cursorAnimator = null
            cursorSpan = null
        }

        fun bind(m: ChatMessage) {
            // 字号与密度由偏好决定 —— 用户改设置后能立刻看到效果
            bubble.textSize = 15f * options.fontScale
            meta.textSize = 11f * options.fontScale
            val vPad = if (options.compact) 2 else 6
            row.setPadding(row.paddingLeft, vPad, row.paddingRight, vPad)
            bindImages(m)

            when (m.role) {
                "user" -> {
                    row.gravity = Gravity.END
                    bubble.setBackgroundResource(R.drawable.bubble_user)
                    bubble.setTextColor(0xFFEAF2FF.toInt())
                    // 用户消息不做 Markdown 渲染 —— 用户打的字应原样显示
                    //（否则他打的 `code` 会突然变成等宽，不是预期）
                    bubble.text = m.text
                    meta.gravity = Gravity.END
                    meta.text = buildMeta(m)
                }
                "system", "error" -> {
                    row.gravity = Gravity.CENTER
                    bubble.setBackgroundResource(R.drawable.bubble_system)
                    bubble.setTextColor(0xFFB8B8B8.toInt())
                    bubble.text = renderIfMarkdown(m.text)
                    meta.gravity = Gravity.CENTER
                    meta.text = formatTime(m.timestamp)
                }
                else -> {
                    row.gravity = Gravity.START
                    bubble.setBackgroundResource(R.drawable.bubble_assistant)
                    bubble.setTextColor(0xFFE8E8E8.toInt())
                    bubble.text = renderIfMarkdown(m.text)
                    meta.gravity = Gravity.START
                    meta.text = formatTime(m.timestamp)
                }
            }

            // 长按复制：助手/系统的长回复在手机上很难手动选中，长按是最省事的取文本方式
            bubble.setOnLongClickListener {
                val handler = onLongPress
                if (handler == null) false else { handler(m); true }
            }
            // 选择模式下点击 = 切换选中（优先于失败重发）；否则只有
            // 发送失败的消息可点击重发
            if (selectedIds.isNotEmpty()) {
                bubble.isClickable = true
                bubble.setOnClickListener { onSelectionClick?.invoke(m) }
                // 选中态高亮：左侧加一条强调色条 + 轻微底色，让选中项一眼可辨
                if (selectedIds.contains(m.id)) {
                    bubble.setBackgroundResource(R.drawable.bubble_selected)
                } else {
                    bubble.setBackgroundResource(defaultBubbleFor(m.role))
                }
            } else {
                bubble.isClickable = m.role == "user" && m.status == ChatMessage.Status.FAILED
                bubble.setOnClickListener {
                    if (bubble.isClickable) onRetry?.invoke(m)
                }
                bubble.setBackgroundResource(defaultBubbleFor(m.role))
            }
        }

        /** 按角色返回默认气泡背景（选中态解除后还原）。 */
        private fun defaultBubbleFor(role: String): Int = when (role) {
            "user" -> R.drawable.bubble_user
            "system", "error" -> R.drawable.bubble_system
            else -> R.drawable.bubble_assistant
        }

        /**
         * 按偏好决定是否渲染 Markdown。
         *
         * 关闭时直接给纯文本 —— 便于用户长按复制原始内容
         *（渲染会加 span，复制时行为不一致）。
         */
        private fun renderIfMarkdown(text: String): CharSequence =
            if (options.markdown) renderMarkdown(text, options.codeHighlight) else text

        /** 按偏好格式化时间（相对/绝对）。 */
        private fun formatTime(ts: Long): String =
            if (options.relativeTime) {
                android.text.format.DateUtils.getRelativeTimeSpanString(
                    ts,
                    System.currentTimeMillis(),
                    android.text.format.DateUtils.MINUTE_IN_MILLIS,
                ).toString()
            } else {
                timeFmt.format(Date(ts))
            }

        private fun buildMeta(m: ChatMessage): String {
            val t = formatTime(m.timestamp)
            val s = when (m.status) {
                ChatMessage.Status.SENDING -> "发送中…"
                ChatMessage.Status.QUEUED -> "已提交"
                ChatMessage.Status.FAILED -> "发送失败（点按重试）"
                ChatMessage.Status.NONE -> ""
            }
            return if (s.isEmpty()) t else "$t · $s"
        }
    }

    /**
     * ViewHolder 被回收时停掉呼吸动画。
     *
     * 必需的清理：动画在跑时 ValueAnimator 持有 TextView 并每帧 invalidate，
     * 回收后若不停，会同时造成内存泄漏与无谓耗电。此前的实现没有动画，
     * 故也没有 onViewRecycled —— 这次一并补上。
     */
    override fun onViewRecycled(holder: RecyclerView.ViewHolder) {
        super.onViewRecycled(holder)
        (holder as? VH)?.stopCursorAnimation()
    }

    companion object {
        private const val VIEW_TYPE_MESSAGE = 0
        private const val VIEW_TYPE_TOOL = 1
        private const val VIEW_TYPE_GROUP = 2
        private const val VIEW_TYPE_DIVIDER = 3

        // ── 工具气泡配色（深色主题下选定，见 ToolVisual.categoryOf）──
        // 用 -0x... 的写法而非 0xFF...：Kotlin 的 Int 字面量上限是
        // 0x7FFFFFFF，0xFF8AB4F8 这类值必须显式 toInt()（或写成负数），
        // 直接写 0xFF8AB4F8 会因超出 Int 范围而编译失败。
        /** 失败：红。优先级高于类别色 —— 用户最需要一眼看到「哪步炸了」。 */
        private val COLOR_ERROR = 0xFFEF5350.toInt()
        /** 有副作用（写/编辑/执行）：暖橙，提示「这步改了东西」。 */
        private val COLOR_WRITE = 0xFFFFB74D.toInt()
        /** 只读（读/搜索）：冷蓝，安全操作的默认观感。 */
        private val COLOR_READ = 0xFF8AB4F8.toInt()
        /** 网络请求：青，与本地操作区分。 */
        private val COLOR_NETWORK = 0xFF4DD0E1.toInt()
        /** 子代理：紫，与工具区分。 */
        private val COLOR_AGENT = 0xFFBA68C8.toInt()
        /** 未知工具：灰。 */
        private val COLOR_OTHER = 0xFFBDBDBD.toInt()
        /** 状态文字：暗灰，不与标题抢视觉。 */
        private val COLOR_DIM = 0xFF888888.toInt()

        /**
         * 流式预览的正文/光标色。
         *
         * 与 `bindStreaming` 里气泡文字色一致 —— 光标跟正文同色最自然。
         * 单列常量避免两处硬编码漂移（改一处忘一处会让光标突兀地变成别的颜色）。
         */
        private val STREAMING_TEXT_COLOR = 0xFFE8E8E8.toInt()

        /** 呼吸动画一次涨/缩的时长（毫秒）。800ms 接近人的呼吸节奏，不抢注意力。 */
        private const val CURSOR_BREATH_MS = 800L

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
        fun renderMarkdown(src: String, codeHighlight: Boolean = true): CharSequence {
            val sb = SpannableStringBuilder()
            for (p in parseMarkdown(src)) {
                val start = sb.length
                sb.append(p.text)
                val end = sb.length
                when (p.type) {
                    Seg.CODE_BLOCK -> {
                        // 关闭代码着色时仍保留等宽字体 —— 那不影响复制，
                        // 而等宽对代码可读性是必要的
                        sb.setSpan(TypefaceSpan("monospace"), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        if (codeHighlight) {
                            sb.setSpan(BackgroundColorSpan(0xFF2A2A2A.toInt()), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                            sb.setSpan(ForegroundColorSpan(0xFF9CDCFE.toInt()), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        }
                    }
                    Seg.BOLD -> {
                        sb.setSpan(StyleSpan(Typeface.BOLD), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    }
                    Seg.CODE_INLINE -> {
                        sb.setSpan(TypefaceSpan("monospace"), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        if (codeHighlight) {
                            sb.setSpan(BackgroundColorSpan(0xFF3A3A3A.toInt()), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        }
                    }
                    Seg.TEXT -> {}
                }
            }
            return sb
        }
    }
}
