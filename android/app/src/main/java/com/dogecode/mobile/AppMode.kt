package com.dogecode.mobile

import android.content.Context

/**
 * 工作模式：远端（连电脑 CLI）或本地（手机自己跑 agent）。
 *
 * ## 为什么是独立存储而非塞进 LocalPrefs
 *
 * 与 [ScanPortPrefs] 同理：[LocalPrefs] 的 `set()` 会校验「值必须在
 * 预定义 options 中」—— 而模式**本可以塞进去**（两个枚举值）。
 * 之所以仍独立：模式是**应用级状态**而非「偏好」，
 * 它的读写时机不同（启动时就要读，早于 LocalPrefs 的界面初始化），
 * 且它的变更会触发**整套 UI 重建**（隐藏连接相关入口），
 * 与普通偏好的「改完重绘」性质不同。分开更清楚。
 *
 * ## 默认值必须是 REMOTE
 *
 * 现有用户的 App 就是远端模式。若默认 LOCAL，升级后他们会发现
 * 「连不上电脑了、还多了一堆要配的 API key」—— 这是最糟的升级体验。
 * 默认值 = 升级前的行为，是本地偏好设计的一贯原则。
 */
enum class AppMode {
    /** 连电脑上的 CLI 桥接（现有模式）。 */
    REMOTE,

    /** 手机本地跑 agent（新增）。 */
    LOCAL,
    ;

    /** 展示名（设置页用）。 */
    val label: String
        get() = when (this) {
            REMOTE -> "远端（连电脑）"
            LOCAL -> "本地（手机自带）"
        }

    /** 一句话说明「这个模式适合什么场景」。 */
    val desc: String
        get() = when (this) {
            REMOTE ->
                "连电脑上的 doge-code 运行。能力完整（能跑命令、改项目文件），" +
                    "但需要电脑开机并保持桥接运行。"
            LOCAL ->
                "手机直接调用大模型 API，在自己选定的目录里读写文件。" +
                    "无需电脑，但命令执行**受限**（仅经 Termux 跑白名单内的只读/" +
                    "常见命令，不支持自由 shell）。"
        }

    companion object {
        /** 存储 key 的缺省模式：升级前的行为。 */
        val DEFAULT = REMOTE

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
 * [AppMode] 的解析（非法值回落 REMOTE，绝不抛异常）。
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
