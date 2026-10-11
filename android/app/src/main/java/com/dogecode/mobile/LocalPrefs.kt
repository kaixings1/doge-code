package com.dogecode.mobile

import android.content.Context

/**
 * 本地偏好设置（纯客户端，不依赖服务端）。
 *
 * 为什么单独建这个类而不是继续往 MainActivity 里塞：
 * · 设置项会持续增加（本轮从 2 项增到 14 项），散在 Activity 里会失控
 * · 每项都需要「键名 + 默认值 + 读写」三件事，抽出来才能保证一致
 * · **默认值必须显式声明**（见 [Definition.default]）—— 否则升级后
 *   用户会看到界面突变，而他没改过任何设置
 *
 * 设计：所有项都在 [ALL] 里登记，读写走统一的 get/set。
 * 新增一项只需在枚举里加一行 + 在 ALL 里加一条定义。
 */
class LocalPrefs(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** 一项设置的元信息。 */
    data class Definition(
        val key: String,
        val title: String,
        /** 说明文字。**必填** —— 用户不知道「消息密度」影响什么。 */
        val desc: String,
        val default: String,
        /** 可选项 (值, 展示文案)；为空表示这是开关（只有 on/off）。 */
        val options: List<Pair<String, String>> = emptyList(),
    ) {
        val isToggle: Boolean get() = options.isEmpty()

        /** 展示当前值的文案（回落到默认值）。 */
        fun labelOf(value: String): String =
            if (isToggle) {
                if (value == ON) "已开启" else "已关闭"
            } else {
                options.firstOrNull { it.first == value }?.second ?: value
            }
    }

    fun get(key: String): String {
        val def = byKey(key) ?: return ""
        return prefs.getString(key, def.default) ?: def.default
    }

    fun getBool(key: String): Boolean = get(key) == ON

    /**
     * 写入。
     *
     * **校验必须在这里做**：只接受登记过的值。否则用户（或将来某个
     * 客户端）传了个未登记的值，会被静默存下来，读取时回落到默认 ——
     * 表现为「设置了但不生效」，且无从排查。
     *
     * @return 是否写入成功
     */
    fun set(key: String, value: String): Boolean {
        val def = byKey(key) ?: return false
        val allowed = if (def.isToggle) setOf(ON, OFF) else def.options.map { it.first }.toSet()
        if (value !in allowed) return false
        prefs.edit().putString(key, value).apply()
        return true
    }

    fun setBool(key: String, on: Boolean): Boolean = set(key, if (on) ON else OFF)

    /** 恢复某一项为默认。 */
    fun reset(key: String) {
        prefs.edit().remove(key).apply()
    }

    private fun byKey(key: String): Definition? = ALL.firstOrNull { it.key == key }

    companion object {
        private const val PREFS_NAME = "doge_mobile"

        /**
         * 开关的内部取值。
         *
         * 用 "on"/"off" 而非 "true"/"false"：与选项值的形态统一，
         * 读代码时不用在两种表示间切换。对外仍暴露为 Boolean（[getBool]）。
         */
        const val ON = "on"
        const val OFF = "off"

        // ── 键名（集中定义，避免各处硬编码字符串写错）──

        const val KEY_THEME = "pref_theme"
        const val KEY_FONT_SCALE = "pref_font_scale"
        const val KEY_DENSITY = "pref_density"
        const val KEY_TIME_FORMAT = "pref_time_format"

        const val KEY_STREAMING = "pref_streaming"
        const val KEY_AUTO_SCROLL = "pref_auto_scroll"
        const val KEY_MARKDOWN = "pref_markdown"
        const val KEY_CODE_HIGHLIGHT = "pref_code_highlight"

        const val KEY_NOTIFY_REPLY = "pref_notify_reply"
        const val KEY_NOTIFY_ACTION = "pref_notify_action"
        const val KEY_NOTIFY_SUPPRESS = "pref_notify_suppress"
        const val KEY_NOTIFY_SOUND = "pref_notify_sound"

        /**
         * 仅 WiFi 下推送通知。
         *
         * 默认**关闭**：多数用户既连着 WiFi 也用流量，关掉时不限网络。
         * 打开后，在移动数据下**完全不推送**（回复/需介入通知都跳过），
         * 避免后台流量消耗与隐私泄露 —— 通知内容会带对话摘要，流量网络下
         * 明文 WebSocket 的摘要同样经运营商，意义不大。
         */
        const val KEY_NOTIFY_WIFI_ONLY = "pref_notify_wifi_only"

        /**
         * 任务完成时语音播报。
         *
         * 默认**关闭**：语音会占用音频焦点、可能打断用户正在听的音乐或
         * 会议，属侵入性较强的提醒。想用的人明确打开，而不是默认惊到所有人。
         */
        const val KEY_VOICE_ANNOUNCE = "pref_voice_announce"

        /** 播报语速：slow / normal / fast，映射到 TTS 的 rate 倍率。 */
        const val KEY_VOICE_RATE = "pref_voice_rate"

        /**
         * AI 请求批准时也语音提醒。
         *
         * 与「完成播报」**分开**开关：批准是**阻塞等待**（AI 卡着不动），
         * 比「完成」更紧急；但有些人只想要完成的提示、不想被批准打断。
         * 事实上更该开的是这个 —— 完成晚点知道没关系，批准不及时
         * AI 就永久挂着。默认随语音播报一起关闭，由用户自选。
         */
        const val KEY_VOICE_PERMISSION = "pref_voice_permission"

        const val KEY_CONFIRM_DANGEROUS = "pref_confirm_dangerous"

        /**
         * 应用锁（生物识别解锁）。
         *
         * 默认**关闭**：这是一层额外保护，开了要每次指纹/人脸才能看 App，
         * 不是所有人都需要。与 SecureStore 不绑定 —— 它只拦「启动查看」，
         * 不拦后台本地推理（见 AppLock 的说明）。
         *
         * 设备不支持生物识别时，即便用户开了也会自动降级为不开锁，
         * 不会把人卡在弹不出指纹的界面（由 AppLock.evaluate 保证）。
         */
        const val KEY_APP_LOCK = "pref_app_lock"

        /** 局域网自动发现：会话页扫描时是否顺带探测本机网段。 */
        const val KEY_LAN_DISCOVERY = "pref_lan_discovery"

        /** 键盘弹出时是否把输入框顶到键盘之上。 */
        const val KEY_KEYBOARD_PAN = "pref_keyboard_pan"

        /**
         * 本地模式最大推理轮数。
         *
         * **默认 = 25** = [AgentLoop.DEFAULT_MAX_STEPS]（当前行为）。
         * 升级用户不改此设置的话，行为完全不变。
         */
        const val KEY_LOCAL_MAX_STEPS = "pref_local_max_steps"

        /**
         * 本地模式温度。
         *
         * ## 为什么默认值是 `default`（不发送该参数）
         *
         * `ProviderConfig.temperature` 默认 `null` —— `ProviderClient.chat` 在
         * `null` 时**不发送**该参数（`temperature?.let { put("temperature", it) }`），
         * 让服务端用各自的默认值。
         *
         * 若把「精准 0」作为默认，升级后所有用户的请求都会**多一个 `temperature: 0` 字段** —
         * 多数服务端的「默认温度」是 0.7-1.0，强制 0 会让回答变僵。
         * 升级不该让用户感知到行为变化，故默认项 = 「不发送」。
         */
        const val KEY_LOCAL_TEMPERATURE = "pref_local_temperature"

        /**
         * 自动连接：发现唯一会话时自动连上。
         *
         * 默认开 —— 这是「不必每次手点」的核心便利。多个候选时
         * 仍由用户选（连错比不连更烦，见 AutoConnect）。
         */
        const val KEY_AUTO_CONNECT = "pref_auto_connect"

        // 注：会话扫描端口的范围（自由数值型设置）刻意**不放在本枚举里** ——
        // 本类的 set() 会校验「值必须在预定义 options 中」，而端口是
        // 1..65535 的自由数值，塞进来要么破坏校验、要么造几十个选项。
        // 它由独立的 ScanPortPrefs 管理，见该文件的说明。

        /**
         * 回车键行为：发送 / 换行。
         *
         * 为什么需要这个开关：输入框是多行的（描述需求常需要分段），
         * 而多行输入时键盘显示的是**换行键** —— `IME_ACTION_SEND`
         * 永远不会触发，此前那段回车发送的监听器实际是死代码。
         *
         * 两种需求都真实存在，故做成偏好而非写死：
         * · 发送：短问题为主，回车即发最快捷
         * · 换行：常写多段需求，回车换行才不会被误发半截
         */
        const val KEY_ENTER_SENDS = "pref_enter_sends"

        /**
         * 全部设置项。
         *
         * **默认值 = 改造前的实际行为**（见规划文档的约束 2）。
         * 例：流式默认开启（本轮刚实现的功能，用户已习惯）、
         * 自动滚动默认开启（原来就是滚到底的）。
         */
        val ALL: List<Definition> = listOf(
            // ── 外观 ──
            Definition(
                KEY_THEME, "主题", "深色适合夜间；跟随系统则由手机自动切换。",
                default = "dark",
                options = listOf("dark" to "深色", "system" to "跟随系统", "light" to "浅色"),
            ),
            Definition(
                KEY_FONT_SCALE, "字号", "影响消息与界面文字大小。",
                default = "medium",
                options = listOf("small" to "小", "medium" to "中", "large" to "大"),
            ),
            Definition(
                KEY_DENSITY, "消息密度", "紧凑会缩小气泡间距，同屏显示更多内容。",
                default = "comfortable",
                options = listOf("compact" to "紧凑", "comfortable" to "舒适"),
            ),
            Definition(
                KEY_TIME_FORMAT, "时间显示", "相对时间更适合快速判断「多久前」。",
                default = "absolute",
                options = listOf("absolute" to "绝对（14:30）", "relative" to "相对（3 分钟前）"),
            ),

            // ── 消息 ──
            Definition(
                KEY_STREAMING, "流式显示", "关闭后等回复完成再整体显示，可省电省流量。",
                default = ON,
            ),
            Definition(
                KEY_AUTO_SCROLL, "自动滚动", "新消息到达时自动滚到底部。关闭后便于回看历史。",
                default = ON,
            ),
            Definition(
                KEY_MARKDOWN, "Markdown 渲染", "渲染代码块与粗体。关闭后显示纯文本，便于复制原始内容。",
                default = ON,
            ),
            Definition(
                KEY_CODE_HIGHLIGHT, "代码块着色", "给代码块加背景与等宽字体。关闭后与其他文本一致。",
                default = ON,
            ),

            // ── 通知 ──
            Definition(
                KEY_NOTIFY_REPLY, "回复通知", "助手回复到达且 App 不在前台时提醒。",
                default = ON,
            ),
            Definition(
                KEY_NOTIFY_ACTION, "需介入通知", "AI 请求批准或提问时提醒（优先级更高）。",
                default = ON,
            ),
            Definition(
                KEY_NOTIFY_SUPPRESS, "终端活跃时不打扰", "当你在电脑终端前时，手机不再重复提醒。",
                default = ON,
            ),
            Definition(
                KEY_NOTIFY_SOUND, "通知声音", "关闭后通知静音，仅保留通知栏条目。",
                default = ON,
            ),
            Definition(
                KEY_NOTIFY_WIFI_ONLY, "仅 WiFi 推送", "移动数据下完全不推送通知，省流量并避免明文摘要经运营商。",
                default = OFF,
            ),
            Definition(
                KEY_VOICE_ANNOUNCE, "完成时语音播报",
                "任务完成时用语音念出「任务已完成」和回复首句，" +
                    "不必盯着屏幕就知道 AI 干完了。前台后台都会播报。",
                default = OFF,
            ),
            Definition(
                KEY_VOICE_RATE, "播报语速", "念得太慢会着急，太快又听不清，按习惯调。",
                default = "normal",
                options = listOf("slow" to "慢", "normal" to "正常", "fast" to "快"),
            ),
            Definition(
                KEY_VOICE_PERMISSION, "需批准时语音提醒",
                "AI 请求批准操作时念「需要你批准」。这是**阻塞等待** —— " +
                    "不处理 AI 就一直卡着，比完成提醒更值得开。",
                default = OFF,
            ),

            // ── 安全 ──
            Definition(
                KEY_CONFIRM_DANGEROUS, "危险操作二次确认", "清空记录、切换权限模式等操作前再确认一次。",
                default = ON,
            ),
            Definition(
                KEY_APP_LOCK, "应用锁", "开启后每次打开 App 需用指纹/人脸解锁才能查看，" +
                    "防止手机离身时他人直接看到对话与配置。" +
                    "设备不支持生物识别时此开关无效。",
                default = OFF,
            ),

            // ── 连接 ──
            Definition(
                KEY_AUTO_CONNECT, "自动连接唯一会话",
                "发现会话时自动连上（**只在只有一个会话时**）。" +
                    "多个会话时不猜 —— 连错比不连更麻烦。",
                default = ON,
            ),
            Definition(
                KEY_LAN_DISCOVERY, "局域网自动发现", "在会话页扫描时顺带探测本机所在网段，" +
                    "免去手输电脑 IP（不必再插 USB）。弱信号下可关闭以省电。",
                default = ON,
            ),

            // ── 输入 ──
            Definition(
                KEY_ENTER_SENDS, "回车键发送",
                "打开后回车直接发送（适合短问题）；关闭则回车换行，" +
                    "需点发送按钮（适合分段写长需求）。",
                default = ON,
            ),
            Definition(
                KEY_KEYBOARD_PAN, "键盘顶起输入框", "打字时把输入框移到键盘上方，" +
                    "避免输入行被键盘挡住。",
                default = ON,
            ),

            // ── 本地模式 ──
            // maxSteps：上限太低的代价是「任务做一半就停」；太高的代价是
            // 失控时每轮都扣费。故提供 10/25/50 三档，默认 25 = 当前行为。
            Definition(
                KEY_LOCAL_MAX_STEPS, "本地最大轮数",
                "单次任务允许模型+工具的最大轮数。" +
                    "**调低**省费用（短问题不需要 25 轮）；" +
                    "**调高**让长任务能跑完，但失控时也会扣更多费。",
                default = "25",
                options = listOf(
                    "10" to "10（短问题）",
                    "25" to "25（默认）",
                    "50" to "50（长任务）",
                ),
            ),
            // temperature：「default」= 不发送该参数（保持服务端默认行为）。
            // 升级用户的请求体不能多出一个 temperature 字段。
            Definition(
                KEY_LOCAL_TEMPERATURE, "本地温度",
                "「服务端默认」= 不发送该参数（多数服务端是 0.7-1.0）。" +
                    "「精准/平衡/发散」对应 0/0.7/1.2。",
                default = "default",
                options = listOf(
                    "default" to "服务端默认",
                    "0" to "精准（0）",
                    "0.7" to "平衡（0.7）",
                    "1.2" to "发散（1.2）",
                ),
            ),
        )
    }
}
