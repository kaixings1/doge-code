package com.dogecode.mobile

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

/**
 * 对话页。
 *
 * 本轮（任务 #21）只做**结构搬迁** —— 控件从 MainActivity 搬到本 Fragment，
 * 逻辑仍由 MainActivity 持有（Activity 通过 [onChatViewsReady] 回调拿到
 * 控件引用）。这样每步都能编译能跑，不走「大重写导致长时间不可用」的路。
 *
 * 下一步（任务 #22）再把业务逻辑按职责拆成协作类。
 */
class ChatFragment : Fragment() {

    /**
     * 控件就绪回调。Activity 借此接管这些 View（过渡期方案）。
     *
     * 设置时会**立即回放**已缓存的视图 —— 见 [pendingViews] 的说明。
     */
    var onChatViewsReady: ((Views) -> Unit)? = null
        set(value) {
            field = value
            // 若视图已就绪而回调刚被设置，立即回放，否则 Activity 永远拿不到控件
            views?.let { value?.invoke(it) }
        }

    /**
     * 是否启用「键盘顶起输入框」。
     *
     * 关掉时输入栏保持原位（原行为）。默认开启 —— 被键盘挡住输入行是
     * 明确的可用性问题，不该让用户去设置里找开关才发现。
     */
    var keyboardPanEnabled: () -> Boolean = { true }

    /**
     * 双指缩放字号：手势结束后回调最终倍率（供 Activity 持久化）。
     *
     * 传的是**捏合倍率**而非最终 fontScale —— 最终值 = 预设档 × 捏合，
     * 拆开存才不会互相覆盖（见 [PinchZoom] 的说明）。
     */
    var onPinchZoom: ((Float) -> Unit)? = null

    /** 当前捏合倍率（由 Activity 注入初值）。 */
    var pinchFactor: Float = PinchZoom.DEFAULT_FACTOR

    /** 对话页的控件集合。用一个数据类聚合，避免回调参数列表过长。 */
    class Views(
        val list: RecyclerView,
        /** 搜索栏（含输入框与前后跳转按钮）。 */
        val searchBar: View,
        val searchInput: EditText,
        val searchCount: TextView,
        val searchPrev: ImageButton,
        val searchNext: ImageButton,
        val searchClose: ImageButton,
        val msgInput: EditText,
        val sendBtn: ImageButton,
        val stopBtn: ImageButton,
        val activityPanel: View,
        val activityText: TextView,
        val agentStopBtn: ImageButton,
        /** 未读提示（复用「滚动到底」按钮的位置，见布局）。 */
        val unseenBadge: TextView,
        /**
         * 空态占位（无消息时显示，由 ChatAdapter 控制显隐）。
         *
         * 可空：真机曾出现 `findViewById` 返回 null 导致启动崩溃
         *（`findViewById(...) must not be null`）。空态是**锦上添花**的
         * 提示，缺失不应让 App 打不开 —— 故允许为 null，Adapter 侧已判空。
         * 这是在「资源 id 理论上一定存在」与「宁可少个提示也不能崩」之间
         * 的选择：后者优先。
         */
        val emptyHint: TextView?,
        val scrollBottomBtn: ImageButton,
        /** 批量选择操作栏（长按消息进入选择模式时显示）。 */
        val batchBar: View,
        val batchCount: TextView,
        val batchSelectAll: android.widget.TextView,
        val batchCopy: android.widget.TextView,
        val batchDelete: android.widget.TextView,
        val batchCancel: android.widget.TextView,
    )

    private var views: Views? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = inflater.inflate(R.layout.fragment_chat, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val v = Views(
            list = view.findViewById(R.id.list),
            searchBar = view.findViewById(R.id.chat_search_bar),
            searchInput = view.findViewById(R.id.search_input),
            searchCount = view.findViewById(R.id.search_count),
            searchPrev = view.findViewById(R.id.search_prev),
            searchNext = view.findViewById(R.id.search_next),
            searchClose = view.findViewById(R.id.search_close),
            msgInput = view.findViewById(R.id.msg_input),
            sendBtn = view.findViewById(R.id.btn_send),
            stopBtn = view.findViewById(R.id.btn_stop),
            activityPanel = view.findViewById(R.id.activity_panel),
            activityText = view.findViewById(R.id.activity_text),
            agentStopBtn = view.findViewById(R.id.activity_stop),
            unseenBadge = view.findViewById(R.id.btn_unseen),
            // 显式可空类型：找不到时返回 null 而非抛异常（见 Views.emptyHint 说明）
            emptyHint = view.findViewById<TextView?>(R.id.chat_empty_view),
            scrollBottomBtn = view.findViewById(R.id.btn_scroll_bottom),
            batchBar = view.findViewById(R.id.batch_action_bar),
            batchCount = view.findViewById(R.id.batch_count),
            batchSelectAll = view.findViewById(R.id.batch_select_all),
            batchCopy = view.findViewById(R.id.batch_copy),
            batchDelete = view.findViewById(R.id.batch_delete),
            batchCancel = view.findViewById(R.id.batch_cancel),
        )
        v.list.layoutManager = LinearLayoutManager(requireContext()).apply { stackFromEnd = true }
        applyPinchZoom(v.list)
        applyImeInsets(view.findViewById(R.id.input_bar))
        views = v
        onChatViewsReady?.invoke(v)
    }

    /**
     * 让输入栏避开软键盘。
     *
     * 为什么必须自己处理：targetSdk=35（Android 15）起系统**强制边到边**，
     * Manifest 里的 `adjustResize` 不再自动缩小窗口 —— 键盘会直接盖住
     * 底部输入栏。用户打了一串字却看不见自己打了什么，只能盲打。
     *
     * 做法：监听 ime inset（键盘占用的高度），把它作为输入栏的
     * 底部 padding。键盘弹出时 padding = 键盘高度（输入栏被顶到键盘之上）；
     * 收起时 padding = 基础 8dp（与顶部保持视觉对称）。
     *
     * 为什么不用 WindowCompat.setDecorFitsSystemWindows(false) 再全屏处理：
     * 那会连带影响顶栏与底部导航，需要给每个页面都补 inset，
     * 改动面远大于收益 —— 只有输入栏真正需要避让。
     */
    private fun applyImeInsets(inputBar: View) {
        val basePadding = (8 * resources.displayMetrics.density).toInt()
        // 保存基础 padding 到 tag，避免重复设置时把「上次的键盘高度」
        // 当成新的基准（会导致 padding 越来越大）。
        inputBar.setPadding(
            inputBar.paddingStart,
            inputBar.paddingTop,
            inputBar.paddingEnd,
            basePadding,
        )
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(inputBar) { view, insets ->
            // ViewCompat 的监听器给的就是 WindowInsetsCompat（已是 Compat 版），
            // 不要再包一层 toWindowInsetsCompat —— 那接受的是 platform 版。
            val ime = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.ime()).bottom
            val target = if (keyboardPanEnabled() && ime > 0) ime else basePadding
            if (view.paddingBottom != target) {
                view.setPadding(view.paddingStart, view.paddingTop, view.paddingEnd, target)
            }
            insets
        }
        // 主动请求一次：若键盘已弹出（如从后台切回），不请求就不会收到回调
        androidx.core.view.ViewCompat.requestApplyInsets(inputBar)
    }

    /**
     * 双指缩放字号。
     *
     * ## 为什么用 ScaleGestureDetector 且**不**消费单指事件
     *
     * 列表本身要处理单指滚动。若把触摸事件整个拦截，滚动就废了。
     * `ScaleGestureDetector` 的设计正是为此：它只在**检测到双指**
     * 时才 `onScale`，单指时它不消费事件，滚动照常。
     *
     * 但仍需注意：`ScaleGestureDetector` 要求所有事件都喂给它
     *（否则它检测不到第二根手指落下）。故用 `OnTouchListener`
     * **监听而不消费**（返回 false），让事件继续传到 RecyclerView。
     *
     * ## 为什么在 onScaleEnd 才回调持久化
     *
     * `onScale` 在捏合过程中会触发几十次，每次都写盘（SharedPreferences）
     * 是浪费。且中途退出 App 时存的是中间值也无所谓 —— 用户会重新捏。
     * 手指抬起（`onScaleEnd`）才写，一次手势只写一次。
     */
    private fun applyPinchZoom(list: RecyclerView) {
        val detector = android.view.ScaleGestureDetector(
            requireContext(),
            object : android.view.ScaleGestureDetector.SimpleOnScaleGestureListener() {
                override fun onScale(detector: android.view.ScaleGestureDetector): Boolean {
                    pinchFactor = PinchZoom.applyScale(pinchFactor, detector.scaleFactor)
                    // 实时生效：捏的过程中就能看到字号变化
                    onPinchZoomLive?.invoke(pinchFactor)
                    return true
                }

                override fun onScaleEnd(detector: android.view.ScaleGestureDetector) {
                    // 手势结束才持久化（一次手势只写一次盘）
                    onPinchZoom?.invoke(pinchFactor)
                }
            },
        )

        list.setOnTouchListener { _, event ->
            detector.onTouchEvent(event)
            // **必须返回 false**：不消费事件，滚动与点击才能正常工作
            false
        }
    }

    /** 捏合过程中实时回调（不持久化，仅刷新界面）。 */
    var onPinchZoomLive: ((Float) -> Unit)? = null

    /** 供 Activity 在配置变更/重入时重新取用（Fragment view 可能被重建）。 */
    fun currentViews(): Views? = views

    override fun onDestroyView() {
        views = null
        super.onDestroyView()
    }
}
