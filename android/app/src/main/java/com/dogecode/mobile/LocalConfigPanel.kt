package com.dogecode.mobile

import android.app.AlertDialog
import android.view.LayoutInflater
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment

/**
 * 设置页的「工作模式 + 本地配置」面板。
 *
 * ## 为什么独立一个类
 *
 * [SettingsFragment] 已承载偏好渲染（1300+ 行）；把模式切换、Provider
 * 配置、工作区选择塞进去会让它继续膨胀。这些逻辑只依赖
 * [LocalPrefsStore] 与 [AppModePrefs]，边界清晰，适合独立。
 *
 * ## 职责
 *
 * · 渲染模式选项（点选即切换，切换后重建界面可见性）
 * · 渲染本地配置：Provider 预设、地址、key、模型、工作区
 * · 保存前校验（缺 key / 地址非法时明确提示，而非静默失败）
 * · 按模式切换两个区块的可见性（局域网/隧道看「连接」，云端看「本地配置」）
 */
class LocalConfigPanel(
    private val fragment: Fragment,
    private val store: LocalPrefsStore,
    private val modePrefs: AppModePrefs,
    /** 模式切换后回调（Activity 需要据此重建界面状态）。 */
    private val onModeChanged: (AppMode) -> Unit,
    /** 技能持久化层（读取可用技能 + 启用集合）。设置页的开关状态都落在这里。 */
    private val skillStore: SkillStore,
) {

    private var modeValue: TextView? = null
    private var modeDesc: TextView? = null
    private var modeItems: LinearLayout? = null
    private var localSection: View? = null
    private var connectionSection: View? = null
    private var urlInput: EditText? = null
    private var scanPortLabel: TextView? = null
    private var scanPortInput: EditText? = null
    private var scanPortDesc: TextView? = null
    private var localStatus: TextView? = null
    private var localHint: TextView? = null
    private var providerItems: LinearLayout? = null
    private var baseUrlInput: EditText? = null
    private var apiKeyInput: EditText? = null
    private var modelInput: EditText? = null
    private var workspaceValue: TextView? = null
    private var localResult: TextView? = null
    private var fetchModelsBtn: Button? = null
    private var testBtn: Button? = null
    private var thinkingValue: TextView? = null
    private var profileSpinner: Spinner? = null
    private var newProfileBtn: Button? = null
    private var deleteProfileBtn: Button? = null
    private var skillItems: LinearLayout? = null

    /** 当前选中的档案 id（切换后据此读/写配置）。 */
    private var currentProfileId: String? = null

    /** 当前选中的思考强度（token 预算，0=关闭）。未保存也算，让用户「先试后存」。 */
    private var thinkingBudget: Int = 0

    /** 当前选中的预设 id（用于高亮）。 */
    private var presetId: String = store.presetId()

    /**
     * 探测用的 HTTP 客户端。
     *
     * 与 [LocalAgentBackend] 里的实例**分开**：本类的请求是「拉模型 / 测一次」，
     * 生命周期跟着设置页；而那个跟着会话。共用一个会让关闭会话后设置页的
     * 探测也失效（反过来同理）。
     */
    private val probeClient = ProviderClient()

    /** 探测进行中（防连点起多个请求）。 */
    private var probing = false

    fun bind(root: View) {
        modeValue = root.findViewById(R.id.mode_value)
        modeDesc = root.findViewById(R.id.mode_desc)
        modeItems = root.findViewById(R.id.mode_items)
        localSection = root.findViewById(R.id.local_section)
        connectionSection = root.findViewById(R.id.connection_section)
        urlInput = root.findViewById(R.id.url_input)
        scanPortLabel = root.findViewById(R.id.scan_port_label)
        scanPortInput = root.findViewById(R.id.scan_port_input)
        scanPortDesc = root.findViewById(R.id.scan_port_desc)
        localStatus = root.findViewById(R.id.local_status)
        localHint = root.findViewById(R.id.local_hint)
        providerItems = root.findViewById(R.id.provider_items)
        baseUrlInput = root.findViewById(R.id.base_url_input)
        apiKeyInput = root.findViewById(R.id.api_key_input)
        modelInput = root.findViewById(R.id.model_input)
        workspaceValue = root.findViewById(R.id.workspace_value)
        localResult = root.findViewById(R.id.local_result)
        fetchModelsBtn = root.findViewById(R.id.btn_fetch_models)
        testBtn = root.findViewById(R.id.btn_test_local)
        thinkingValue = root.findViewById(R.id.thinking_value)
        profileSpinner = root.findViewById(R.id.profile_spinner)
        newProfileBtn = root.findViewById(R.id.btn_new_profile)
        deleteProfileBtn = root.findViewById(R.id.btn_delete_profile)
        skillItems = root.findViewById(R.id.skill_items)

        buildModeChips()
        buildProviderChips()
        rebuildProfileSpinner()
        loadConfigIntoFields()
        buildSkillSwitches()

        root.findViewById<Button>(R.id.btn_save_local).setOnClickListener { save() }
        root.findViewById<Button>(R.id.btn_pick_workspace).setOnClickListener { pickWorkspace() }
        fetchModelsBtn?.setOnClickListener { fetchModels() }
        testBtn?.setOnClickListener { testChat() }
        thinkingValue?.setOnClickListener { pickThinking() }
        newProfileBtn?.setOnClickListener { newProfile() }
        deleteProfileBtn?.setOnClickListener { deleteProfile() }

        refreshMode()
    }

    /**
     * 选择思考强度（云端推理）：弹出与局域网配置同款的 5 档（关闭/1024/4096/16384/32768）。
     *
     * 复用 [ConfigOptions.THINKING] 保证与远端选项一致。不自动保存 ——
     * 与模型选择同策略：选完只更新内存值与显示，点「保存配置」才落盘。
     */
    private fun pickThinking() {
        val options = ConfigOptions.THINKING
        val labels = options.map { (v, l) -> if (v == 0) "关闭" else "$v" }.toTypedArray()
        val current = options.indexOfFirst { it.first == thinkingBudget }.coerceAtLeast(0)
        AlertDialog.Builder(fragment.requireContext())
            .setTitle(R.string.label_thinking)
            .setSingleChoiceItems(labels, current) { d, which ->
                thinkingBudget = options[which].first
                refreshThinkingDisplay()
                d.dismiss()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /** 把当前 thinkingBudget 渲染到显示控件。 */
    private fun refreshThinkingDisplay() {
        thinkingValue?.text = if (thinkingBudget == 0) "关闭" else thinkingBudget.toString()
    }

    /**
     * 拉取模型列表并让用户点选。
     *
     * ## 为什么「先取列表再点选」而不是让用户手填
     *
     * 手填模型名是云端模式最容易卡住的一步：多数中转网关的模型名是自定义的
     *（`gpt-4o` 在某网关叫 `gpt-4o-all`），填错的报错是 404，与「地址填错」
     * 完全无法区分。填完 URL + key 让程序去问服务端要列表，用户只需点一下。
     *
     * **不自动保存**：选完只是填进输入框，仍需点「保存配置」。自动保存会让
     * 用户分不清「我浏览了一下模型」与「我已经改了配置」。
     */
    private fun fetchModels() {
        val cfg = currentInputConfig()
        if (!cfg.isUsable) {
            showResult(
                if (cfg.apiKey.isBlank()) {
                    fragment.getString(R.string.local_need_key)
                } else {
                    fragment.getString(R.string.local_need_url)
                },
                ok = false,
            )
            return
        }
        if (!beginProbe()) return

        probeClient.runAsync(
            onDone = { models ->
                endProbe()
                if (models.isEmpty()) {
                    showResult(fragment.getString(R.string.local_models_empty), ok = false)
                    return@runAsync
                }
                pickFromModels(models)
            },
            onError = { msg ->
                endProbe()
                showResult(msg, ok = false)
            },
            block = { probeClient.listModels(cfg) },
        )
    }

    /** 弹出模型列表供点选，选中即填入模型框（不自动保存）。 */
    private fun pickFromModels(models: List<String>) {
        AlertDialog.Builder(fragment.requireContext())
            .setTitle(R.string.local_models_title)
            .setItems(models.toTypedArray()) { _, which ->
                val picked = models[which]
                modelInput?.setText(picked)
                showResult(
                    fragment.getString(R.string.local_models_picked, picked),
                    ok = true,
                )
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /**
     * 测试一轮真实会话。
     *
     * 与「获取模型」分开的必要性：列模型走 `/models`，很多网关用**只读子 key**
     * 也能列出，但发不出对话（403）。只有真正打一次 `/chat/completions`
     * 才能证明「这个 key 能跑会话」。
     */
    private fun testChat() {
        val cfg = currentInputConfig()
        if (!cfg.isUsable) {
            showResult(
                if (cfg.apiKey.isBlank()) {
                    fragment.getString(R.string.local_need_key)
                } else {
                    fragment.getString(R.string.local_need_url)
                },
                ok = false,
            )
            return
        }
        if (!beginProbe()) return

        probeClient.runAsync(
            onDone = { text ->
                endProbe()
                showResult(
                    if (text.isBlank()) {
                        fragment.getString(R.string.local_test_ok_empty)
                    } else {
                        fragment.getString(R.string.local_test_ok, text)
                    },
                    ok = true,
                )
            },
            onError = { msg ->
                endProbe()
                showResult(msg, ok = false)
            },
            block = { probeClient.testChat(cfg) },
        )
    }

    /** 读取输入框当前值（未保存也算 —— 让用户「先试后存」）。 */
    private fun currentInputConfig(): ProviderConfig = ProviderConfig(
        apiKey = apiKeyInput?.text?.toString()?.trim().orEmpty(),
        baseURL = baseUrlInput?.text?.toString()?.trim().orEmpty(),
        model = modelInput?.text?.toString()?.trim().orEmpty(),
        timeoutMs = ProviderConfig.DEFAULT_TIMEOUT_MS,
        thinkingBudget = thinkingBudget,
    )

    /** 开始探测；已在探测中则提示并返回 false。 */
    private fun beginProbe(): Boolean {
        if (probing) {
            showResult(fragment.getString(R.string.local_busy), ok = false)
            return false
        }
        probing = true
        setProbeButtonsEnabled(false)
        showResult(fragment.getString(R.string.local_busy), ok = true)
        return true
    }

    private fun endProbe() {
        probing = false
        setProbeButtonsEnabled(true)
    }

    private fun setProbeButtonsEnabled(enabled: Boolean) {
        fetchModelsBtn?.isEnabled = enabled
        testBtn?.isEnabled = enabled
    }

    /** 模式切换后刷新界面（由 Activity 在切换时调用）。 */
    fun refreshMode() {
        val mode = modePrefs.get()
        modeValue?.text = mode.label
        modeDesc?.text = mode.desc
        // 按模式显示对应区块：云端看「本地配置」（API/模型/工作区），
        // 局域网与隧道看「连接」（连电脑）。两个都显示会让用户困惑。
        // 注：localSection 文案原写「本地配置」，现指云端直连的配置，
        // 区块含义不变（填 API key/模型/工作区）。
        localSection?.visibility = if (mode.isCloudAgent) View.VISIBLE else View.GONE
        connectionSection?.visibility = if (mode.isCloudAgent) View.GONE else View.VISIBLE
        // 连接区内的「局域网端口扫描」仅 LAN 需要：TUNNEL 是公网 wss 地址，
        // 没有「同一网段扫描本机会话」的概念，留着只会误导用户去填端口段。
        val showLanScan = mode == AppMode.LAN
        val scanVis = if (showLanScan) View.VISIBLE else View.GONE
        scanPortLabel?.visibility = scanVis
        scanPortInput?.visibility = scanVis
        // scan_port_desc 在两个模式都要用，但内容不同：
        //   LAN    → 端口段说明
        //   TUNNEL → 隧道地址怎么来的（就近引导，别让用户对着空框发懵）
        // 故不随 scanVis 一起藏，而是按模式改文本后始终显示。
        scanPortDesc?.visibility = View.VISIBLE
        scanPortDesc?.text = if (mode == AppMode.TUNNEL) {
            fragment.getString(R.string.tunnel_connect_guide)
        } else {
            fragment.getString(R.string.scan_port_desc)
        }
        // 地址框 hint 随模式切换：LAN 提示局域网/USB 地址，TUNNEL 提示公网 wss。
        urlInput?.hint = if (mode == AppMode.TUNNEL) {
            fragment.getString(R.string.url_hint_tunnel)
        } else {
            fragment.getString(R.string.url_hint)
        }
        if (mode.isCloudAgent) {
            refreshLocalStatus()
            buildSkillSwitches() // 重新进入云端模式时，按最新持久化状态重建开关
        }
        highlightModeChips(mode)
    }

    private fun buildModeChips() {
        val container = modeItems ?: return
        container.removeAllViews()
        AppMode.entries.forEach { mode ->
            val chip = modeChip(mode.label)
            chip.setOnClickListener { switchMode(mode) }
            container.addView(chip)
        }
    }

    /**
     * 切换模式。
     *
     * 立即持久化 + 立即刷新 —— 不设「保存」按钮：
     * 模式是**全局开关**，多一步确认没有收益，反而让用户以为
     * 「没点保存所以没生效」。
     */
    private fun switchMode(mode: AppMode) {
        if (modePrefs.get() == mode) return
        modePrefs.set(mode)
        refreshMode()
        onModeChanged(mode)
        val name = mode.label
        Toast.makeText(fragment.requireContext(), "已切换到$name", Toast.LENGTH_SHORT).show()
    }

    private fun highlightModeChips(current: AppMode) {
        val container = modeItems ?: return
        for (i in 0 until container.childCount) {
            val chip = container.getChildAt(i) as? TextView ?: continue
            val isOn = chip.text == current.label
            chip.setBackgroundResource(if (isOn) R.drawable.chip_bg_on else R.drawable.chip_bg)
            chip.setTextColor(if (isOn) 0xFF8AB4F8.toInt() else 0xFFCCCCCC.toInt())
        }
    }

    private fun buildProviderChips() {
        val container = providerItems ?: return
        container.removeAllViews()
        ProviderPresets.ALL.forEach { p ->
            val chip = modeChip(p.label)
            chip.setOnClickListener { applyPreset(p) }
            container.addView(chip)
        }
        highlightProviderChips()
    }

    /**
     * 应用预设：只填充**地址与默认模型**，不动用户已填的 key。
     *
     * 为什么不动 key：用户可能已经从别处复制好 key，切换预设时
     * 清掉它会让人重新粘贴 —— 且 key 与预设通常无关（同一 key 可配多个端点）。
     */
    private fun applyPreset(p: ProviderPresets.Preset) {
        presetId = p.id
        store.setPresetId(p.id)
        if (p.baseURL.isNotEmpty()) baseUrlInput?.setText(p.baseURL)
        if (p.defaultModel.isNotEmpty() && modelInput?.text.isNullOrBlank()) {
            modelInput?.setText(p.defaultModel)
        }
        highlightProviderChips()
        showHint(p.hint)
    }

    private fun highlightProviderChips() {
        val container = providerItems ?: return
        ProviderPresets.ALL.forEachIndexed { i, p ->
            val chip = container.getChildAt(i) as? TextView ?: return@forEachIndexed
            val isOn = p.id == presetId
            chip.setBackgroundResource(if (isOn) R.drawable.chip_bg_on else R.drawable.chip_bg)
            chip.setTextColor(if (isOn) 0xFF8AB4F8.toInt() else 0xFFCCCCCC.toInt())
        }
    }

    private fun modeChip(label: String): TextView =
        TextView(fragment.requireContext()).apply {
            text = label
            textSize = 13f
            setTextColor(0xFFCCCCCC.toInt())
            setPadding(dp(14), dp(8), dp(14), dp(8))
            setBackgroundResource(R.drawable.chip_bg)
            isClickable = true
            isFocusable = true
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { marginEnd = dp(8) }
        }

    private fun loadConfigIntoFields() {
        val c = store.providerConfig()
        baseUrlInput?.setText(c.baseURL)
        apiKeyInput?.setText(c.apiKey)
        modelInput?.setText(c.model)
        thinkingBudget = c.thinkingBudget
        refreshThinkingDisplay()
        refreshWorkspaceText()
    }

    /**
     * 重建档案下拉列表并定位到当前档案。
     *
     * 列表项展示档案名；当前档案（首项）自动选中。点选切换时调
     * [onProfileSelected] 加载该档案的 URL/KEY/model。
     */
    private fun rebuildProfileSpinner() {
        val spinner = profileSpinner ?: return
        val profiles = store.profiles()
        if (profiles.isEmpty()) return
        currentProfileId = profiles.first().id
        val labels = profiles.map { it.name }.toTypedArray()
        val adapter = ArrayAdapter(
            fragment.requireContext(),
            android.R.layout.simple_spinner_item,
            labels,
        )
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinner.adapter = adapter
        spinner.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onItemSelected(
                parent: android.widget.AdapterView<*>,
                view: android.view.View?,
                position: Int,
                id: Long,
            ) {
                val p = profiles.getOrNull(position) ?: return
                if (p.id != currentProfileId) onProfileSelected(p.id)
            }

            override fun onNothingSelected(parent: android.widget.AdapterView<*>) = Unit
        }
    }

    /**
     * 切换到指定档案：置为当前并加载其配置到输入框。
     *
     * 与「先试后存」一致：切换只改内存态与显示，不自动保存 —— 用户若
     * 在旧档案改了没存就切走，改动随当前档案变更而丢弃（与旧单份行为一致）。
     */
    private fun onProfileSelected(id: String) {
        store.setCurrentProfile(id)
        currentProfileId = id
        loadConfigIntoFields()
        showResult(fragment.getString(R.string.profile_switched, store.profiles().first().name), ok = true)
    }

    /**
     * 新建档案：弹框输入名称，生成新 Profile 并置为当前。
     *
     * 新建的档案是空白配置（apiKey 空），逼用户填接入信息 —— 而非复制
     * 当前档案，避免「误把 A 的 key 当成 B 的」这类静默错误。
     */
    private fun newProfile() {
        val ctx = fragment.requireContext()
        val input = EditText(ctx).apply {
            hint = ctx.getString(R.string.profile_new_hint)
            setPadding(dp(14), dp(10), dp(14), dp(10))
        }
        AlertDialog.Builder(ctx)
            .setTitle(R.string.profile_new_title)
            .setView(input)
            .setPositiveButton(R.string.action_save_local) { _, _ ->
                val name = input.text?.toString()?.trim().orEmpty()
                if (name.isEmpty()) {
                    showResult(ctx.getString(R.string.profile_name_empty), ok = false)
                    return@setPositiveButton
                }
                val profile = ProviderProfiles.create(name)
                store.addProfile(profile)
                currentProfileId = profile.id
                rebuildProfileSpinner()
                loadConfigIntoFields()
                showResult(ctx.getString(R.string.profile_created, name), ok = true)
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /**
     * 删除当前档案（至少保留 1 个）。
     *
     * 删到只剩 1 个时拒绝，并明确提示用户「至少保留 1 个」——
     * 否则用户把唯一档案删光后无配置可选（[LocalPrefsStore.removeProfile]
     * 内部也守着同一不变量，双保险）。
     */
    private fun deleteProfile() {
        val ctx = fragment.requireContext()
        val id = currentProfileId ?: return
        val profiles = store.profiles()
        if (profiles.size <= 1) {
            showResult(ctx.getString(R.string.profile_delete_last), ok = false)
            return
        }
        val name = profiles.firstOrNull { it.id == id }?.name ?: "当前档案"
        store.removeProfile(id)
        currentProfileId = store.currentProfileId()
        rebuildProfileSpinner()
        loadConfigIntoFields()
        showResult(ctx.getString(R.string.profile_deleted, name), ok = true)
    }

    private fun refreshWorkspaceText() {
        val f = store.resolvedWorkspace()
        workspaceValue?.text = f.absolutePath
        if (store.isUsingFallbackWorkspace()) {
            // 明确告知用的是回落目录 —— 否则用户会困惑「我设的目录去哪了」
            localHint?.text = fragment.getString(R.string.local_workspace_fallback)
        }
    }

    private fun refreshLocalStatus() {
        val c = store.providerConfig()
        val status = when {
            !store.secureAvailable -> fragment.getString(R.string.local_no_secure)
            c.isUsable -> "已配置（${c.model.ifBlank { "默认模型" }}）"
            else -> "未配置"
        }
        localStatus?.text = status
        if (!store.secureAvailable) {
            localStatus?.setTextColor(0xFFEF5350.toInt())
        }
    }

    /**
     * 构建「技能开关」列表（动态，塞进 [skillItems] 容器）。
     *
     * ## 数据来源
     *
     * 预置（[SkillStore.loadPreset]）+ 自定义（[SkillStore.loadCustom]）合并去重。
     * 自定义与预置同名时前者覆盖（与 [SkillStore.applyTo] 的优先级一致）。
     *
     * ## 开关初始态：与 applyTo 语义对齐
     *
     * [SkillStore.enabledIds] 为空集合 = 全部启用（开箱即用）。所以：某技能
     * 的开关默认「开」，当且仅当它的 id **不在** enabledIds 的非空集合里——
     * 即：enabledIds 为空（全开）或 id 已被显式列入。
     *
     * ## 切换时的序列化（关键，务必与 applyTo 对齐）
     *
     * 收集所有技能的「开着的 id」记为 `enabled`：
     * · 若 `enabled == 全部 id`（等于默认全开）→ 存**空集合**，回落到
     *   applyTo 的「空=全开」语义，与首次使用完全一致；
     * · 否则存 `enabled`（显式开启的那些）。
     * 这样「全开」永远以空集合表示，避免「把所有 id 写进去」造成的不一致。
     */
    private fun buildSkillSwitches() {
        val container = skillItems ?: return
        container.removeAllViews()

        // 合并去重（LinkedHashMap 保序：预置在前，自定义覆盖同名）
        val merged = LinkedHashMap<String, Skill>()
        skillStore.loadPreset().forEach { merged[it.id] = it }
        skillStore.loadCustom().forEach { merged[it.id] = it }
        val all = merged.values.toList()
        if (all.isEmpty()) {
            container.addView(
                TextView(fragment.requireContext()).apply {
                    text = fragment.getString(R.string.skills_empty)
                    setTextColor(0xFF777777.toInt())
                    textSize = 12f
                    setPadding(dp(2), dp(4), dp(2), dp(4))
                },
            )
            return
        }

        // 已启用 id：空集合 = 全部启用。
        val enabled = skillStore.enabledIds()
        val allOnByDefault = enabled.isEmpty()

        all.forEach { skill ->
            val on = allOnByDefault || enabled.contains(skill.id)

            // 单行：左右两列，左为名称+描述，右为 Switch。
            val row = LinearLayout(fragment.requireContext()).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setPadding(dp(2), dp(6), dp(2), dp(6))
            }

            // 左列：名称（主）+ 描述（副）。weight=1 占满，给 Switch 留空间。
            val texts = LinearLayout(fragment.requireContext()).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(
                    0,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    1f,
                )
            }
            texts.addView(
                TextView(fragment.requireContext()).apply {
                    text = skill.name
                    setTextColor(0xFFE8E8E8.toInt())
                    textSize = 13f
                },
            )
            texts.addView(
                TextView(fragment.requireContext()).apply {
                    text = skill.description.ifBlank { fragment.getString(R.string.skills_no_desc) }
                    setTextColor(0xFF777777.toInt())
                    textSize = 11f
                    setPadding(0, dp(2), 0, 0)
                },
            )

            // 右列：Switch。初始态由 enabledIds 决定（见上面 allOnByDefault/on）。
            val sw = Switch(fragment.requireContext()).apply {
                isChecked = on
                // 切开关即实时保存：不需要点「保存配置」。
                setOnCheckedChangeListener { _, _ -> persistSkillEnabled(all) }
            }

            row.addView(texts)
            row.addView(sw)
            container.addView(row)
        }
    }

    /**
     * 把当前所有技能开关状态序列化并落盘。
     *
     * 规则见 [buildSkillSwitches] 说明：全开 → 空集合（回落 applyTo 的全开
     * 语义）；否则 → 开启的那些 id。
     */
    private fun persistSkillEnabled(all: List<Skill>) {
        val container = skillItems ?: return
        // 按渲染顺序回读每个 Switch 的勾选态（与 all 一一对应）。
        val enabled = all.filterIndexed { i, _ ->
            val row = container.getChildAt(i) as? LinearLayout ?: return@filterIndexed false
            // 右列最后一个就是 Switch。
            val sw = row.getChildAt(row.childCount - 1) as? Switch ?: return@filterIndexed false
            sw.isChecked
        }.map { it.id }.toSet()

        val allIds = all.map { it.id }.toSet()
        // 全开 → 空集合（与 applyTo「空=全开」对齐）；否则存开启集合。
        skillStore.saveEnabledIds(if (enabled == allIds) emptySet() else enabled)
    }

    private fun showHint(text: String) {
        localHint?.text = text
    }

    private fun showResult(text: String, ok: Boolean) {
        localResult?.apply {
            this.text = text
            setTextColor(if (ok) 0xFF6BD66B.toInt() else 0xFFEF5350.toInt())
            visibility = View.VISIBLE
        }
    }

    /**
     * 保存配置。
     *
     * 校验顺序有讲究：先报「缺 key」再报「地址非法」——
     * key 是用户最可能漏填的，且没有它整条链路都不通。
     */
    private fun save() {
        val url = baseUrlInput?.text?.toString()?.trim().orEmpty()
        val key = apiKeyInput?.text?.toString()?.trim().orEmpty()
        val model = modelInput?.text?.toString()?.trim().orEmpty()

        if (key.isEmpty()) {
            showResult(fragment.getString(R.string.local_need_key), ok = false)
            return
        }
        if (!ProviderConfig.isUrlLike(url)) {
            showResult(fragment.getString(R.string.local_need_url), ok = false)
            return
        }

        store.saveProviderConfig(
            ProviderConfig(
                apiKey = key,
                baseURL = url,
                model = model,
                timeoutMs = ProviderConfig.DEFAULT_TIMEOUT_MS,
                thinkingBudget = thinkingBudget,
            ),
        )
        showResult(fragment.getString(R.string.local_saved), ok = true)
        refreshLocalStatus()
    }

    /**
     * 管理/选择工作区（多工作区，M4）。
     *
     * 对话框结构：
     * ```
     * ── 当前（点选切换）──
     *   /sdcard/Documents/proj   ← 首项带「当前」标记
     *   /sdcard/Download/demo
     *   [移除…]                  ← 长按列表项或点「移除」进入
     * ── 添加新目录 ──
     *   应用私有目录（最可靠…）
     *   公共文档目录（Documents）
     * ```
     *
     * 用候选列表而非系统目录选择器：Android 的 SAF 返回
     * `content://` URI，与工具层的 `java.io.File` 是两套 API
     *（详见 [LocalPrefsStore] 的说明）。故给出**确实可写的候选**，
     * 让用户点选，而不是让他面对一个选了也用不了的文件选择器。
     */
    private fun pickWorkspace() {
        val saved = store.workspaceList()
        val candidates = store.workspaceCandidates()

        val labels = buildList {
            if (saved.isNotEmpty()) add("── 已保存（点选切换）──")
            saved.forEachIndexed { i, p ->
                add(if (i == 0) "▶ $p（当前）" else "   $p")
            }
            add("── 添加新目录 ──")
            candidates.forEach { add(it.second) }
        }.toTypedArray()

        // 「已保存」段在 labels 中的起始下标（含段标题）
        val savedStart = 1
        val savedEnd = savedStart + saved.size
        val addStart = savedEnd + 1

        AlertDialog.Builder(fragment.requireContext())
            .setTitle(R.string.label_workspace)
            .setItems(labels) { _, which ->
                when {
                    // 点「已保存」段的一项：切换
                    which in savedStart until savedEnd -> {
                        val path = saved[which - savedStart]
                        val ok = store.switchWorkspace(path)
                        if (ok) {
                            onWorkspaceChanged(path)
                        } else {
                            showResult("切换失败：目录可能已被移除", ok = false)
                        }
                    }
                    // 点「添加」段的一项：加入并置为当前
                    which >= addStart -> {
                        val path = candidates[which - addStart].first
                        val ok = store.addWorkspace(path)
                        if (ok) {
                            onWorkspaceChanged(path)
                        } else {
                            showResult("该目录不可写，请换一个", ok = false)
                        }
                    }
                    // 段标题行：无操作
                }
            }
            // 中性键：管理（移除）入口。单独一个按钮比长按更可发现
            .setNeutralButton("移除…") { _, _ -> showRemoveWorkspace(saved) }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /** 工作区切换/新增后的统一处理：刷新界面 + 通知 Activity（切历史文件）。 */
    private fun onWorkspaceChanged(path: String) {
        refreshWorkspaceText()
        showResult("工作区已切换为：$path", ok = true)
        onWorkspaceSwitched?.invoke(path)
    }

    /**
     * 工作区被切换/添加后回调（Activity 据此切历史文件并重建本地后端 ——
     * M1 的 `refreshSessionScope` 正吃这个信号）。
     */
    var onWorkspaceSwitched: ((String) -> Unit)? = null

    /** 移除已保存的工作区（不动磁盘目录）。 */
    private fun showRemoveWorkspace(saved: List<String>) {
        if (saved.isEmpty()) {
            showResult("没有已保存的工作区", ok = false)
            return
        }
        val labels = saved.toTypedArray()
        AlertDialog.Builder(fragment.requireContext())
            .setTitle("移除哪个工作区？")
            .setItems(labels) { _, which ->
                val path = saved[which]
                store.removeWorkspace(path)
                // 移除当前项后 workspacePath() 会指向下一项（或 null → 回落私有目录）
                refreshWorkspaceText()
                showResult("已移除：$path", ok = true)
                onWorkspaceSwitched?.invoke(store.workspacePath() ?: "")
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun dp(v: Int): Int =
        (v * fragment.resources.displayMetrics.density).toInt()
}
