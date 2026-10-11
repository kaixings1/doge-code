package com.dogecode.mobile

import android.content.Context

/**
 * 工作模式：三种独立的连接形态。
 *
 * ## 为什么是独立存储而非塞进 LocalPrefs
 *
 * 与 [ScanPortPrefs] 同理：[LocalPrefs] 的 `set()` 会校验「值必须在
 * 预定义 options 中」—— 而模式**本可以塞进去**（枚举值）。
 * 之所以仍独立：模式是**应用级状态**而非「偏好」，
 * 它的读写时机不同（启动时就要读，早于 LocalPrefs 的界面初始化），
 * 且它的变更会触发**整套 UI 重建**（隐藏连接相关入口），
 * 与普通偏好的「改完重绘」性质不同。分开更清楚。
 *
 * ## 三种模式的本质
 *
 * - [LAN]：手机经 WiFi/USB 连到**同一台电脑**上的 CLI 桥接。
 *   能力与桌面端一致（能跑命令、改项目文件），但需要电脑开机并保持桥接。
 * - [CLOUD]：手机**直接调远程大模型 API**（走互联网），
 *   在自己选定的目录里读写文件。**无需电脑**，但命令执行受限
 *   （仅经 Termux 跑白名单内的只读/常见命令，不支持自由 shell）。
 * - [TUNNEL]：经 **cloudflared 公网隧道**连回本机会话 —— 相当于 LAN 的
 *   加强版，**户外也可用**。后端与 LAN 同为 [RemoteAgentBackend]，
 *   只是地址来自 CLI 回传的公网域名而非局域网扫描/beacon。
 *
 * ## 默认值必须是 LAN
 *
 * 现有用户的 App 就是连电脑（原 REMOTE）。若默认 CLOUD/TUNNEL，
 * 升级后他们会发现「连不上电脑了、还多了一堆要配的 API key」——
 * 这是最糟的升级体验。默认值 = 升级前的行为，是偏好设计的一贯原则。
 */
enum class AppMode {
    /** 局域网连电脑（WiFi/USB）。后端同原 REMOTE。 */
    LAN,

    /** 手机直连云端大模型 API（走互联网，经 ProviderClient）。 */
    CLOUD,

    /** 经公网隧道连回本机（户外可用，地址来自 CLI 回传域名）。 */
    TUNNEL,
    ;

    /**
     * 该模式是否走「手机自带 agent」（LocalAgentBackend）。
     *
     * 抽成属性而非散落 `== CLOUD` 判断：调用点关心的是「是不是云端自带」，
     * 不是枚举名。后续若新增第四种自带 agent 的模式，只改这里。
     */
    val isCloudAgent: Boolean get() = this == CLOUD

    /** 展示名（设置页用）。 */
    val label: String
        get() = when (this) {
            LAN -> "局域网（连电脑）"
            CLOUD -> "云端（直连 API）"
            TUNNEL -> "互联网连本机（隧道）"
        }

    /**
     * 一句话说明「这个模式适合什么场景」。
     *
     * TUNNEL 是三种模式里最灵活、最核心的：它把本机会话暴露到公网，
     * 手机在任何网络（户外、数据流量）下都能连回自己电脑上的会话，
     * 能力**与局域网完全一致**（完整命令执行、改文件），只是地址来自
     * 桌面端 `start-mobile-bridge.mjs --tunnel` 回传的 wss:// 域名。
     */
    val desc: String
        get() = when (this) {
            LAN ->
                "经 WiFi 或 USB 连电脑上的 doge-code。能力完整" +
                    "（能跑命令、改项目文件），但需电脑开机并连同一 WiFi/插线。"
            CLOUD ->
                "手机直接调用大模型 API（Remote），在自己选定的目录里读写文件。" +
                    "无需电脑，但命令执行**受限**（仅经 Termux 跑白名单内" +
                    "的只读/常见命令，不支持自由 shell）。"
            TUNNEL ->
                "通过互联网连回本机会话（局域网的加强版）：手机在户外、用数据流量" +
                    "也能连上自己电脑。能力同局域网模式完整（能跑命令、改文件）。" +
                    "需在电脑端运行 start-mobile-bridge.mjs --tunnel 获取 wss:// 地址填入。"
        }

    companion object {
        /** 存储 key 的缺省模式：升级前的行为（原 REMOTE = 连电脑）。 */
        val DEFAULT = LAN

        /**
         * 解析存储中的模式字符串。
         *
         * 抽成纯函数以便**直接单测**（复刻一份逻辑去测等于没测）。
         * 任何非法输入（null / 未知值 / 手工改坏）一律回落 [DEFAULT]，
         * 绝不抛异常 —— 一个坏的偏好值不该让 App 打不开。
         */
        fun parse(raw: String?): AppMode {
            if (raw == null) return DEFAULT
            return runCatching { valueOf(raw) }.getOrDefault(DEFAULT)
        }
    }
}

/**
 * 模式的持久化。
 *
 * 与 [ScanPortPrefs] 同构：单一职责的小存储类，读写都经过
 * [AppMode] 的解析（非法值回落 LAN，绝不抛异常）。
 */
class AppModePrefs(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /**
     * 读取当前模式。
     *
     * 存的是字符串而非 `ordinal`：枚举顺序一变（如在中间插入新值），
     * ordinal 就会错位 —— 那会让老用户突然切到另一个模式且毫无提示。
     */
    fun get(): AppMode = AppMode.parse(prefs.getString(KEY_MODE, null))

    fun set(mode: AppMode) {
        prefs.edit().putString(KEY_MODE, mode.name).apply()
    }

    companion object {
        private const val PREFS = "doge_mobile_mode"
        private const val KEY_MODE = "app_mode"
    }
}
