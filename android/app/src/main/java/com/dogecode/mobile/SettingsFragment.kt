package com.dogecode.mobile

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import androidx.fragment.app.Fragment

/**
 * 设置页。
 *
 * 本轮（任务 #21）只做结构搬迁：控件从 MainActivity 的连接面板搬到这里。
 *
 * 与对话页的差别：这里的控件**不需要 Activity 持有**（没有每帧更新的状态），
 * 因此在 Fragment 内直接接线到 Activity 的方法即可 —— 比对话页更早解耦。
 * 对话页之所以还要回调，是因为消息列表/流式预览需要 Activity 的 adapter。
 */
class SettingsFragment : Fragment() {

    private var rowModel: android.widget.TextView? = null
    private var rowThinking: android.widget.TextView? = null
    private var rowPermission: android.widget.TextView? = null

    /**
     * 渲染偏好设置四组。
     *
     * 由 LocalPrefs.ALL 驱动：新增设置项只需改 LocalPrefs，
     * 不必动布局与这里的代码。
     *
     * 分组是**展示决策**，故定义在此处而非 LocalPrefs ——
     * 后者只描述「项」，不该知道 UI 如何组织它们。
     */
    private fun renderPreferenceGroups(root: View) {
        val container = root.findViewById<LinearLayout>(R.id.pref_container) ?: return
        val prefs = LocalPrefs(requireContext())

        // 显式标注泛型：Kotlin 无法从 `listOf(Triple(...), ...)` 推断
        // 嵌套泛型（第一个参数是 String，后两个是 List<String>）
        val groups: List<Pair<String, List<String>>> = listOf(
            Pair(
                getString(R.string.section_appearance),
                listOf(
                    LocalPrefs.KEY_THEME,
                    LocalPrefs.KEY_FONT_SCALE,
                    LocalPrefs.KEY_DENSITY,
                    LocalPrefs.KEY_TIME_FORMAT,
                ),
            ),
            Pair(
                getString(R.string.section_message),
                listOf(
                    LocalPrefs.KEY_STREAMING,
                    LocalPrefs.KEY_AUTO_SCROLL,
                    LocalPrefs.KEY_MARKDOWN,
                    LocalPrefs.KEY_CODE_HIGHLIGHT,
                ),
            ),
            Pair(
                getString(R.string.section_notification),
                listOf(
                    LocalPrefs.KEY_NOTIFY_REPLY,
                    LocalPrefs.KEY_NOTIFY_ACTION,
                    LocalPrefs.KEY_NOTIFY_SUPPRESS,
                    LocalPrefs.KEY_NOTIFY_SOUND,
                    LocalPrefs.KEY_NOTIFY_WIFI_ONLY,
                ),
            ),
            Pair(
                getString(R.string.section_security),
                listOf(LocalPrefs.KEY_CONFIRM_DANGEROUS, LocalPrefs.KEY_APP_LOCK),
            ),
        )

        groups.forEach { (title, keys) ->
            val section = layoutInflater.inflate(R.layout.item_pref_section, container, false)
            section.findViewById<android.widget.TextView>(R.id.section_title).text = title
            val items = section.findViewById<LinearLayout>(R.id.section_items)

            keys.forEach { key ->
                val def = LocalPrefs.ALL.firstOrNull { it.key == key } ?: return@forEach
                if (def.isToggle) {
                    items.addView(buildToggleRow(prefs, def))
                } else {
                    items.addView(buildChoiceRow(prefs, def))
                }
            }
            container.addView(section)
        }
    }

    /** 开关型设置行。 */
    private fun buildToggleRow(prefs: LocalPrefs, def: LocalPrefs.Definition): View {
        val row = layoutInflater.inflate(R.layout.item_pref_toggle, null, false)
        row.findViewById<android.widget.TextView>(R.id.pref_title).text = def.title
        row.findViewById<android.widget.TextView>(R.id.pref_desc).text = def.desc

        val sw = row.findViewById<androidx.appcompat.widget.SwitchCompat>(R.id.pref_switch)
        // 先设值再挂监听：否则程序化 setChecked 会反过来触发一次写入
        sw.isChecked = prefs.getBool(def.key)
        sw.setOnCheckedChangeListener { _, on ->
            actions?.onPrefToggle(def.key, on)
        }
        // 整行可点：开关本身只有 ~40dp 宽，整行点击才符合手机操作习惯
        row.setOnClickListener { sw.toggle() }
        return row
    }

    /** 多选一设置行（点行展开选项条）。 */
    private fun buildChoiceRow(prefs: LocalPrefs, def: LocalPrefs.Definition): View {
        val row = layoutInflater.inflate(R.layout.item_pref_choice, null, false)
        row.findViewById<android.widget.TextView>(R.id.pref_title).text = def.title
        row.findViewById<android.widget.TextView>(R.id.pref_desc).text = def.desc

        val valueView = row.findViewById<android.widget.TextView>(R.id.pref_value)
        val bar = row.findViewById<View>(R.id.pref_options_bar)
        val options = row.findViewById<LinearLayout>(R.id.pref_options)

        fun showValue() {
            valueView.text = def.labelOf(prefs.get(def.key))
        }
        showValue()

        val chips = mutableListOf<android.widget.TextView>()
        def.options.forEach { (value, label) ->
            val chip = android.widget.TextView(requireContext()).apply {
                text = label
                textSize = 13f
                setPadding(dp(12), dp(6), dp(12), dp(6))
                setBackgroundResource(R.drawable.chip_bg)
                setTextColor(0xFFCCCCCC.toInt())
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                )
                lp.setMargins(0, 0, dp(8), 0)
                layoutParams = lp
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    actions?.onPrefChoice(def.key, value)
                    showValue()
                    highlightChips(chips, this)
                }
            }
            chips.add(chip)
            options.addView(chip)
        }

        // 初始高亮当前值
        val current = prefs.get(def.key)
        chips.getOrNull(def.options.indexOfFirst { it.first == current })?.let {
            highlightChips(chips, it)
        }

        row.findViewById<View>(R.id.pref_row).setOnClickListener {
            // 同时只展开一个 —— 展开多个会让设置页变得很长
            val visible = bar.visibility == View.VISIBLE
            expandedPrefBar?.visibility = View.GONE
            bar.visibility = if (visible) View.GONE else View.VISIBLE
            expandedPrefBar = if (visible) null else bar
        }
        return row
    }

    private fun highlightChips(chips: List<android.widget.TextView>, selected: android.widget.TextView) {
        chips.forEach {
            val on = it === selected
            it.setBackgroundResource(if (on) R.drawable.chip_bg_on else R.drawable.chip_bg)
            it.setTextColor(if (on) 0xFF6BD66B.toInt() else 0xFFCCCCCC.toInt())
        }
    }

    /** 当前展开的偏好选项条（保证同时只展开一个）。 */
    private var expandedPrefBar: View? = null

    /**
     * 绑定一行：点行切换展开/收起，点选项触发变更。
     *
     * @param row      可点击的行
     * @param itemsBox 选项条的容器（往里 addView）
     * @param bar      选项条本身（控制可见性）
     * @param options  选项列表 (值, 展示文案)
     */

    /** 展开指定选项条，同时收起其他（避免设置页过长）。 */

    /** 高亮选中项，其余恢复未选中态。 */

    /** 更新行右侧显示的值。 */

    private fun dp(v: Int): Int =
        (v * resources.displayMetrics.density).toInt()

    /** 由 Activity 在拉取到配置后调用，刷新三行当前值。 */
    fun showConfigValue(rows: MainActivity.ConfigRows) {
        rowModel?.text = rows.model ?: getString(R.string.value_unknown)
        rowThinking?.text = rows.thinking ?: getString(R.string.value_unknown)
        rowPermission?.text = rows.permission ?: getString(R.string.value_unknown)
    }

    /** 由 Activity 提供各设置项的动作实现（过渡期方案，任务 #22 再抽类）。 */
    interface Actions {
        fun onConnect(url: String, secret: String)
        fun onScanSessions()
        fun onPickHost()
        /** 一键把地址框填成 Tailscale 地址（固定名，任意网络可用）。 */
        fun onFillTailscaleAddress()
        fun onRemoteConfig()
        /** 内联选项被选中：key 为配置项名，value 为值，label 为展示文案。 */
        fun onConfigValue(key: String, value: Any?, label: String)
        fun onRenameSession()
        fun onExportHistory()
        fun onClearHistory()
        fun onShowDiagnostics()
        fun onShowAbout()
        /** 开关类设置变更。 */
        fun onPrefToggle(key: String, on: Boolean)
        /** 多选一设置变更。 */
        fun onPrefChoice(key: String, value: String)
        /** 查看待发的权限决定。 */
        fun onShowPendingPermissions()
        /** 打开「逐条授权规则」管理页。 */
        fun onShowPermissionRules()
        fun onShowHistory()
        fun onRememberSecretChanged(remember: Boolean)
    }

    private val actions: Actions?
        get() = activity as? Actions

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = inflater.inflate(R.layout.fragment_settings, container, false)

    /**
     * 工作模式与本地配置面板（由 Activity 注入依赖）。
     *
     * 用 lateinit + Activity 赋值而非在 Fragment 里 new：面板需要
     * [LocalPrefsStore]/[AppModePrefs]（依赖 Context）与「模式切换后
     * 通知 Activity」的回调 —— 这些都属于宿主职责。
     */
    private var localPanel: LocalConfigPanel? = null

    /** 由 Activity 在视图就绪后调用，绑定模式与本地配置区块。 */
    fun bindLocalPanel(panel: LocalConfigPanel) {
        localPanel = panel
        view?.let { panel.bind(it) }
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val urlInput = view.findViewById<EditText>(R.id.url_input)
        val secretInput = view.findViewById<EditText>(R.id.secret_input)

        // 视图重建后重新绑定面板（Fragment view 可能被销毁重建）
        localPanel?.bind(view)

        view.findViewById<Button>(R.id.btn_connect).setOnClickListener {
            actions?.onConnect(urlInput.text.toString(), secretInput.text.toString())
        }
        view.findViewById<Button>(R.id.btn_hosts).setOnClickListener { actions?.onPickHost() }
        // Tailscale 一键填入：把地址框换成 Tailscale 地址（固定不变、任意网络可用）。
        // 具体填什么由宿主决定（它才有已知会话/主机名），Fragment 只负责转发。
        view.findViewById<Button>(R.id.btn_tailscale).setOnClickListener {
            actions?.onFillTailscaleAddress()
        }
        rowModel = view.findViewById(R.id.row_model_value)
        rowThinking = view.findViewById(R.id.row_thinking_value)
        rowPermission = view.findViewById(R.id.row_permission_value)

        // 三项各自的行与选项条。点击行 → 展开/收起该项的选项。
        //
        // 相比原来的「点一行弹 AlertDialog」：弹窗盖住其他项、改完就关
        // （无法连续调整多项）、选项与当前值的对照要靠记忆。
        // 内联展开保留了现场，改完能立刻对着值确认。
        view.findViewById<Button>(R.id.btn_scan).setOnClickListener { actions?.onScanSessions() }
        view.findViewById<Button>(R.id.btn_rename).setOnClickListener { actions?.onRenameSession() }
        view.findViewById<Button>(R.id.btn_export).setOnClickListener { actions?.onExportHistory() }
        view.findViewById<Button>(R.id.btn_clear).setOnClickListener { actions?.onClearHistory() }
        view.findViewById<Button>(R.id.btn_diagnostics).setOnClickListener {
            actions?.onShowDiagnostics()
        }
        view.findViewById<Button>(R.id.btn_about).setOnClickListener { actions?.onShowAbout() }
        view.findViewById<Button>(R.id.btn_pending_perms).setOnClickListener {
            actions?.onShowPendingPermissions()
        }
        view.findViewById<Button>(R.id.btn_permission_rules).setOnClickListener {
            actions?.onShowPermissionRules()
        }
        view.findViewById<Button>(R.id.btn_history).setOnClickListener { actions?.onShowHistory() }

        renderPreferenceGroups(view)
        view.findViewById<CheckBox>(R.id.chk_remember_secret).setOnCheckedChangeListener { _, checked ->
            actions?.onRememberSecretChanged(checked)
        }

        bindScanPortInput(view)
        bindScanIpInput(view)

        pendingSettingsViews = urlInput to secretInput
        onSettingsViewsReady?.invoke(urlInput, secretInput)
    }

    /**
     * 绑定「扫描端口段」输入框。
     *
     * 与服务端起始端口（CLAUDE_CODE_MOBILE_PORT）必须一致：服务端从起始
     * 端口起试 10 个，客户端扫不到这一段就永远发现不了会话 —— 表现为
     * 「服务明明起来了、手机上扫不到」。默认 5680-5689，但本机若该段被
     * Windows 保留（Hyper-V/WSL），服务端会改用别的段（如 6000），此时
     * 这里必须同步修改。
     *
     * 只读已有设置（不 new 新存储）：写入交回 [ScanPortPrefs]，它的
     * setRange() 会规范化非法输入（越界/起点大于终点/跨度超限），
     * 界面回显规范化后的实际值 —— 用户能立刻看出自己填错了什么。
     */
    private fun bindScanPortInput(view: View) {
        val input = view.findViewById<EditText>(R.id.scan_port_input) ?: return
        val prefs = ScanPortPrefs(requireContext())
        val (s, e) = prefs.range()
        input.setText(ScanPortPrefs.formatRange(s, e))

        // 失焦时才写：逐键写入会在用户输入「6」「60」「600」「6000」过程中
        // 反复存下非法中间态（如起止倒置），并触发规范化把输入框内容改掉。
        input.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) saveScanPort(input, prefs)
        }
        input.setOnEditorActionListener { _, _, _ ->
            saveScanPort(input, prefs)
            true
        }
    }

    /** 解析 "起-止" 并保存；格式非法时回显当前生效值，不发散错误。 */
    private fun saveScanPort(input: EditText, prefs: ScanPortPrefs) {
        val parsed = ScanPortPrefs.parseRange(input.text.toString())
        if (parsed == null) {
            // 解析失败（非数字/缺分隔符）：还原为当前生效值，不留非法串。
            val (s, e) = prefs.range()
            input.setText(ScanPortPrefs.formatRange(s, e))
            return
        }
        // 回显实际生效范围：填了 6000-5680（倒置）或越界时，用户立刻
        // 看到被纠正成的值，而不是以为「保存了却没生效」。
        val (s, e) = prefs.setRange(parsed.first, parsed.second)
        input.setText(ScanPortPrefs.formatRange(s, e))
    }

    /**
     * 绑定「扫描主机号范围」输入框（与端口范围同一套交互模式）。
     *
     * 复用 [ScanPortPrefs.parseRange] 解析 —— 两者格式相同（`起-止`），
     * 各写一份必然漂移。写入交回 [IpRangePrefs.setRange]（它负责夹取
     * 越界值与纠正倒置）。
     */
    private fun bindScanIpInput(view: View) {
        val input = view.findViewById<EditText>(R.id.scan_ip_input) ?: return
        val prefs = IpRangePrefs(requireContext())
        val (from, to) = prefs.range()
        input.setText(IpRangePrefs.formatRange(from, to))

        // 失焦时才写：逐键写入会存下「1」「10」「100」等中间态
        input.setOnFocusChangeListener { _, hasFocus ->
            if (!hasFocus) saveScanIp(input, prefs)
        }
        input.setOnEditorActionListener { _, _, _ ->
            saveScanIp(input, prefs)
            true
        }
    }

    /** 解析 "起-止" 并保存主机号范围；格式非法时回显当前生效值。 */
    private fun saveScanIp(input: EditText, prefs: IpRangePrefs) {
        val parsed = ScanPortPrefs.parseRange(input.text.toString())
        if (parsed == null) {
            val (f, t) = prefs.range()
            input.setText(IpRangePrefs.formatRange(f, t))
            return
        }
        // 回显实际生效范围（越界/倒置被纠正后用户立刻看到）
        val (f, t) = prefs.setRange(parsed.first, parsed.second)
        input.setText(IpRangePrefs.formatRange(f, t))
    }

    /**
     * Activity 借此拿到地址/密钥输入框（连接状态、诊断需要读它们）。
     *
     * 设置时**立即回放**已缓存的视图：`commitNow()` 是同步的，
     * Fragment 的 onViewCreated 会在 Activity 设置本回调之前跑完。
     * 若不回放，onViewCreated 里的 `?.invoke()` 会因回调为 null 被静默吞掉，
     * Activity 的 urlInput 永远未赋值 —— 真机上表现为启动即崩。
     */
    var onSettingsViewsReady: ((EditText, EditText) -> Unit)? = null
        set(value) {
            field = value
            pendingSettingsViews?.let { (u, s) -> value?.invoke(u, s) }
        }

    /** 已就绪的输入框，供回调后到时回放。 */
    private var pendingSettingsViews: Pair<EditText, EditText>? = null

    override fun onDestroyView() {
        pendingSettingsViews = null
        super.onDestroyView()
    }
}
