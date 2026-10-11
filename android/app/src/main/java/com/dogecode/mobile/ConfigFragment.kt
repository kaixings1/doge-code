package com.dogecode.mobile

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment

/**
 * 远程配置页（原为两层弹窗：先弹菜单，再弹选项列表）。
 *
 * 相比弹窗版的改进：
 * · 三项**同时可见** —— 弹窗一次只能看一项，改完模型想改权限要再点两次
 * · 每项带**说明文字** —— 弹窗版没有。用户看到「思考强度 4096」时
 *   并不知道这意味着什么
 * · 当前值常驻显示，不必记忆
 * · 改完不关闭，可连续调整
 *
 * 安全约束：权限模式选项不含 Bypass（见 ConfigOptions 的说明）。
 */
class ConfigFragment : Fragment() {

    /** 由 Activity 提供状态与动作。 */
    interface Host {
        fun configConnected(): Boolean
        /** 请求修改配置。 */
        fun configApply(key: String, value: Any?, label: String)
    }

    private val host: Host?
        get() = activity as? Host

    private var modelValue: TextView? = null
    private var thinkingValue: TextView? = null
    private var permissionValue: TextView? = null
    private var resultView: TextView? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = inflater.inflate(R.layout.fragment_config, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        modelValue = view.findViewById(R.id.cfg_model_value)
        thinkingValue = view.findViewById(R.id.cfg_thinking_value)
        permissionValue = view.findViewById(R.id.cfg_permission_value)
        resultView = view.findViewById(R.id.cfg_result)

        val connected = host?.configConnected() == true
        view.findViewById<View>(R.id.cfg_conn_hint).visibility =
            if (connected) View.GONE else View.VISIBLE

        buildChips(
            view.findViewById(R.id.cfg_model_items),
            ConfigOptions.MODELS,
        ) { value, label -> apply("model", value, label) }

        // 思考强度的展示文案带单位，让「4096」不至于失去量纲
        buildChips(
            view.findViewById(R.id.cfg_thinking_items),
            ConfigOptions.THINKING.map { (v, _) -> v as Any to "$v tokens" },
        ) { value, label -> apply("thinkingTokens", value, label) }

        buildChips(
            view.findViewById(R.id.cfg_permission_items),
            ConfigOptions.PERMISSION_MODES,
        ) { value, label -> apply("permissionMode", value, label) }

        buildBoolSection(view.findViewById(R.id.cfg_bool_section))
    }

    /**
     * 动态生成布尔类配置项的开关行。
     *
     * 为什么动态而非在 XML 里写死：条目清单以 ConfigOptions.BOOL_OPTIONS
     * 为唯一来源，新增项只改那张表。XML 写死会让「加一项」变成
     * 改三处（表、XML、绑定代码），而漏改一处就是静默不显示。
     *
     * 用 Switch 而非 chip：布尔项只有两态，开关的语义比「两个 chip 里
     * 选一个」更直觉，且当前值一眼可见（chip 需要额外的高亮状态）。
     */
    private fun buildBoolSection(section: View) {
        val options = ConfigOptions.BOOL_OPTIONS
        if (options.isEmpty()) return
        section.visibility = View.VISIBLE
        val container = section as android.widget.LinearLayout

        options.forEach { opt ->
            val row = android.widget.LinearLayout(requireContext()).apply {
                orientation = android.widget.LinearLayout.VERTICAL
                setPadding(0, dp(8), 0, 0)
            }
            val title = TextView(requireContext()).apply {
                text = opt.label
                textSize = 16f
                setTypeface(null, android.graphics.Typeface.BOLD)
                setTextColor(0xFFE8E8E8.toInt())
            }
            val desc = TextView(requireContext()).apply {
                text = opt.desc
                textSize = 12f
                setTextColor(0xFF777777.toInt())
                setPadding(0, dp(4), 0, 0)
            }
            val toggle = android.widget.Switch(requireContext()).apply {
                // 当前值由服务端回传（见 applyConfigSnapshot）；此处先给默认，
                // 避免开关初始停在一个与服务端不一致的位置
                isChecked = boolState(opt.key)
            }
            bindBoolToggle(toggle, opt.key)
            row.addView(title)
            row.addView(desc)
            row.addView(toggle)
            container.addView(row)
        }
    }

    /**
     * 布尔项的当前值。
     *
     * 由服务端回传的快照决定（见 [applyConfigSnapshot]），未收到时默认 false
     * —— 与服务端 AppState 的初始值一致，避免「开关显示开但实际是关」。
     */
    private val boolStates = mutableMapOf<String, Boolean>()

    private fun boolState(key: String): Boolean = boolStates[key] ?: false

    private fun apply(key: String, value: Any?, label: String) {
        if (host?.configConnected() != true) return
        host?.configApply(key, value, label)
        // 立即回显 —— 不等服务端回执，否则用户以为没点上
        setValue(key, label)
        // 用 also 而非 apply：本方法名就叫 apply，作用域函数 apply 在
        // 同一个类里会造成解析歧义（编译器报 Overload resolution ambiguity）
        resultView?.also { rv ->
            rv.text = getString(R.string.cfg_updated)
            rv.visibility = View.VISIBLE
        }
    }

    private fun setValue(key: String, label: String) {
        when (key) {
            "model" -> modelValue?.text = label
            "thinkingTokens" -> thinkingValue?.text = label
            "permissionMode" -> permissionValue?.text = label
        }
    }

    /**
     * 由 Activity 在拉到服务端配置后调用。
     *
     * @param sources 值来源标签。界面据此提示「被环境变量覆盖」这类
     *   让用户困惑的情况 —— 原界面完全无法解释「为什么改了没生效」。
     */
    fun showValues(
        model: String?,
        thinking: String?,
        permission: String?,
        sources: MainActivity.ConfigSourceLabels = MainActivity.ConfigSourceLabels.empty(),
        /**
         * 详细模式的当前值。null 表示服务端未提供该字段（老服务端），
         * 此时界面保持开关的默认位置而不猜测 —— 猜错会让用户以为
         * 「服务端支持且当前是关的」。
         */
        verbose: Boolean? = null,
    ) {
        modelValue?.text = withSource(model, sources.model)
        thinkingValue?.text = withSource(thinking, sources.thinking)
        permissionValue?.text = withSource(permission, sources.permission)
        if (verbose != null) {
            boolStates["verbose"] = verbose
            syncBoolToggles()
        }
    }

    /**
     * 把 [boolStates] 的当前值同步到界面上的开关。
     *
     * 必须先摘掉监听再设值：Switch.setChecked 会触发
     * OnCheckedChangeListener，那会把「服务端回传的值」当成「用户的点击」
     * 再发一次 setConfig，形成无意义的回环请求。
     */
    private fun syncBoolToggles() {
        val section = view?.findViewById<android.view.View>(R.id.cfg_bool_section) ?: return
        val container = section as? android.widget.LinearLayout ?: return
        for (i in 0 until container.childCount) {
            val row = container.getChildAt(i) as? android.widget.LinearLayout ?: continue
            val toggle = row.getChildAt(2) as? android.widget.Switch ?: continue
            val opt = ConfigOptions.BOOL_OPTIONS.getOrNull(i) ?: continue
            val target = boolState(opt.key)
            if (toggle.isChecked == target) continue
            // Kotlin 无法读回已设的监听器（只有 setter），故重建一个 ——
            // 直接置 null 会让开关从此失去响应。重建等价且更简单。
            toggle.setOnCheckedChangeListener(null)
            toggle.isChecked = target
            bindBoolToggle(toggle, opt.key)
        }
    }

    /**
     * 给一个布尔开关绑定变更回调。
     *
     * 抽出来是因为它被用在两处（初次构建、服务端回传后重新绑定）——
     * 两处若各写一份，一旦改了「如何上报」的语义就会漏改一处。
     */
    private fun bindBoolToggle(toggle: android.widget.Switch, key: String) {
        toggle.setOnCheckedChangeListener { _, checked ->
            // 显式 this@ConfigFragment 消歧：本类有自己的 apply 方法，
            // 与 Kotlin 作用域函数 apply 同名
            this@ConfigFragment.apply(key, checked, if (checked) "已开启" else "已关闭")
            boolStates[key] = checked
        }
    }

    /** 值 + 来源标注，如 "sonnet（配置文件）"。来源未知时只显示值。 */
    private fun withSource(value: String?, source: String?): String {
        val v = value ?: getString(R.string.value_unknown)
        return if (source == null) v else "$v（$source）"
    }

    /**
     * 构建一行选项 chip。
     *
     * 与 SettingsFragment 的同名逻辑类似，但不复用 —— 那边的版本会把
     * 选中项回写到「行右侧的值」，而这里的值与选项不在同一行（分区块布局）。
     * 强行复用要加一堆参数，不如各自简单。
     */
    private fun buildChips(
        container: LinearLayout,
        options: List<Pair<Any, String>>,
        onChange: (Any, String) -> Unit,
    ) {
        container.removeAllViews()
        options.forEach { (value, label) ->
            val chip = TextView(requireContext()).apply {
                text = label
                textSize = 13f
                setTextColor(0xFFCCCCCC.toInt())
                setPadding(dp(12), dp(6), dp(12), dp(6))
                setBackgroundResource(R.drawable.chip_bg)
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                )
                lp.setMargins(0, 0, dp(8), 0)
                layoutParams = lp
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    onChange(value, label)
                    highlight(container, this)
                }
            }
            container.addView(chip)
        }
    }

    private fun highlight(container: LinearLayout, selected: View) {
        for (i in 0 until container.childCount) {
            val child = container.getChildAt(i) as TextView
            val on = child === selected
            child.setBackgroundResource(if (on) R.drawable.chip_bg_on else R.drawable.chip_bg)
            child.setTextColor(if (on) 0xFF6BD66B.toInt() else 0xFFCCCCCC.toInt())
        }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
