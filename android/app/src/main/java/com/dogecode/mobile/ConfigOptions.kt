package com.dogecode.mobile

/**
 * 远程配置的选项表。
 *
 * 为什么抽成独立的 public object 而非留在 SettingsFragment 的 companion 里：
 * 测试需要**直接引用**它才能形成真正的约束。若选项表藏在 Fragment 私有
 * companion 中，测试只能"镜像"一份期望值 —— 那种复刻型测试在生产代码
 * 改动时不会失败，等于没测。
 *
 * 尤其是权限模式：**这是安全边界**。选项表决定用户能选什么，
 * 服务端 mobileConfig.ts 也有一道白名单（双保险），但两端必须一致：
 * · 客户端有而服务端没有 → 用户点了被拒
 * · 服务端有而客户端没有 → 功能缺失
 *
 * 这是低频改动的常量表，独立成文件不会增加维护负担。
 */
object ConfigOptions {

    /**
     * 模型选项。
     *
     * 不做严格枚举 —— 模型名随供应商与版本变化，硬编码会让用户无法选
     * 新模型。这里给常见项，服务端允许更宽的形状（见 mobileConfig.ts 的
     * MODEL_NAME_PATTERN）。
     */
    val MODELS: List<Pair<String, String>> = listOf(
        "default" to "默认",
        "claude-sonnet-4-6" to "Sonnet 4.6",
        "claude-opus-4-6" to "Opus 4.6",
        "sonnet" to "sonnet",
        "opus" to "opus",
        "haiku" to "haiku",
    )

    /** 思考强度（token 预算）。0 = 关闭。与服务端 MOBILE_ALLOWED_THINKING_TOKENS 一致。 */
    val THINKING: List<Pair<Int, String>> = listOf(
        0 to "关闭",
        1024 to "1024",
        4096 to "4096",
        16384 to "16384",
        32768 to "32768",
    )

    /**
     * 权限模式。与服务端 MOBILE_ALLOWED_PERMISSION_MODES 一致。
     *
     * **刻意不含 Bypass**：把 Bypass 暴露到网络可达的界面意味着
     * 拿到手机即可关掉本机全部防护。本地 CLI 常以
     * --dangerously-skip-permissions 运行，那个开关必须只在终端可及。
     */
    val PERMISSION_MODES: List<Pair<String, String>> = listOf(
        "default" to "每次询问",
        "plan" to "计划模式",
        "acceptEdits" to "自动接受编辑",
        "auto" to "自动判断",
    )

    /** 服务端的模型名形状校验，供测试断言客户端选项能通过。 */
    val MODEL_NAME_PATTERN = Regex("^[A-Za-z0-9._:-]{1,80}$")

    /**
     * 布尔类远程配置项。
     *
     * 与服务端 mobileConfig.ts 的布尔分支一一对应。抽成表而非散落的
     * 各处 if：新增一个布尔项只要往这里加一行，界面自动出现开关。
     *
     * 当前只有「详细模式」——显示压缩边界之前的完整历史。
     * 手机端最需要它的场景正是「想回看被压缩掉的内容」。
     */
    data class BoolOption(val key: String, val label: String, val desc: String)

    val BOOL_OPTIONS: List<BoolOption> = listOf(
        BoolOption(
            key = "verbose",
            label = "详细模式",
            desc = "显示被自动压缩掉的早期对话。回看长会话的完整过程时打开。",
        ),
    )
}
