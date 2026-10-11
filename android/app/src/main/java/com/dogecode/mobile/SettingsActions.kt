package com.dogecode.mobile

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.widget.EditText
import android.widget.Toast

/**
 * 设置类弹窗：远程配置 / 地址历史 / 连接诊断 / 会话重命名 / 历史导出。
 *
 * 从 MainActivity 抽出（原本约 250 行，是最大的一块职责）。
 * 抽它的理由不只是"行数"：
 *
 * · **它不依赖对话页控件**。只用得到 Context、当前地址、当前会话名 ——
 *   而其余方法（onEvent/sendCurrent/append）都紧耦合聊天列表。
 *   这条边界让抽取风险最低，收益最高。
 * · 抽出后 MainActivity 只保留"接线与对话协调"，职责变单纯。
 * · 这些弹窗的选项列表（模型/思考强度/权限模式）是**安全相关**的
 *   （权限模式白名单），独立成文件后更容易审查。
 *
 * 设计：用宿主接口 [Host] 而非直接持有 Activity —— 否则等于没拆，
 * 只是把耦合挪了个地方。
 */
class SettingsActions(
    private val ctx: Context,
    private val host: Host,
) {

    /** 宿主提供必要状态与动作，避免本类直接依赖 MainActivity。 */
    interface Host {
        /** 当前地址历史（由宿主读写 SharedPreferences）。 */
        fun loadHostHistory(): List<String>
        fun rememberHost(url: String)
        fun clearHostHistory()
        /** 当前会话标签（重命名时作为初值）。 */
        fun currentSessionLabel(): String?
        fun onSessionLabelChanged(label: String)
        /** 当前是否已连接（配置类操作需要连接）。 */
        fun isConnected(): Boolean
        /** 发送配置变更。 */
        fun sendConfig(key: String, value: Any?, label: String)
        /** 追加一条系统消息（重命名/导出等操作的反馈）。 */
        fun appendSystem(text: String)
        /** 本地历史快照（导出用）。 */
        fun localHistory(): List<ChatMessage>
        /** 当前地址与密钥（诊断用）。 */
        fun currentAddress(): String
        fun currentSecret(): String
        fun connectionStatusText(): String
        fun lastFailure(): BridgeClient.Diagnosis?
        /** 重试连接。 */
        fun retryConnect(url: String, secret: String)
    }

    // ── 远程配置 ──

    /**
     * 远程配置入口。
     *
     * **权限模式选项刻意不含 Bypass**：与服务端 mobileConfig.ts 的白名单一致。
     * 客户端不展示就不会有用户点了被拒的挫败感；更重要的是少一处将来被
     * 改坏的风险 —— 把 Bypass 暴露到网络可达的界面意味着拿到手机即可
     * 关掉本机全部防护。
     */
    fun showRemoteConfig() {
        val items = arrayOf("切换模型", "思考强度", "权限模式")
        AlertDialog.Builder(ctx)
            .setTitle("远程设置")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> chooseModel()
                    1 -> chooseThinking()
                    2 -> choosePermissionMode()
                }
            }
            .setNegativeButton("关闭", null)
            .show()
    }

    private fun requireConnected(): Boolean {
        if (!host.isConnected()) {
            Toast.makeText(ctx, "未连接", Toast.LENGTH_SHORT).show()
            return false
        }
        return true
    }

    private fun chooseModel() {
        val models = arrayOf(
            "default（恢复默认）",
            "claude-sonnet-4-6",
            "claude-opus-4-6",
            "sonnet",
            "opus",
            "haiku",
        )
        AlertDialog.Builder(ctx)
            .setTitle("选择模型")
            .setItems(models) { _, which ->
                if (!requireConnected()) return@setItems
                val value = if (which == 0) "default" else models[which]
                host.sendConfig("model", value, "模型 → ${models[which]}")
            }
            .setNegativeButton("取消", null)
            .show()
    }

    private fun chooseThinking() {
        val labels = arrayOf("关闭思考（0）", "1024 tokens", "4096 tokens", "16384 tokens", "32768 tokens")
        val values = intArrayOf(0, 1024, 4096, 16384, 32768)
        AlertDialog.Builder(ctx)
            .setTitle("思考强度")
            .setItems(labels) { _, which ->
                if (!requireConnected()) return@setItems
                host.sendConfig("thinkingTokens", values[which], "思考强度 → ${labels[which]}")
            }
            .setNegativeButton("取消", null)
            .show()
    }

    private fun choosePermissionMode() {
        // 与 service 端 mobileConfig.ts 的 MOBILE_ALLOWED_PERMISSION_MODES 一致。
        // 不含 bypassPermissions —— 见 showRemoteConfig 的说明。
        val labels = arrayOf(
            "default（每次询问）",
            "plan（只读，先给计划）",
            "acceptEdits（自动接受编辑）",
            "auto（自动判断）",
        )
        val values = arrayOf("default", "plan", "acceptEdits", "auto")
        AlertDialog.Builder(ctx)
            .setTitle("权限模式")
            .setItems(labels) { _, which ->
                if (!requireConnected()) return@setItems
                host.sendConfig("permissionMode", values[which], "权限模式 → ${labels[which]}")
            }
            .setNegativeButton("取消", null)
            .show()
    }

    // ── 地址历史 ──

    fun showHostHistory() {
        val hosts = host.loadHostHistory()
        if (hosts.isEmpty()) {
            Toast.makeText(ctx, "还没有历史地址", Toast.LENGTH_SHORT).show()
            return
        }
        AlertDialog.Builder(ctx)
            .setTitle("选择地址")
            .setItems(hosts.toTypedArray()) { _, which ->
                host.retryConnect(hosts[which], host.currentSecret())
            }
            .setNeutralButton("清空历史") { _, _ ->
                host.clearHostHistory()
                Toast.makeText(ctx, "已清空地址历史", Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton("取消", null)
            .show()
    }

    // ── 诊断 ──

    /**
     * 连接诊断面板。
     *
     * 用户「连不上」时只看到状态栏一闪而过的「已断开」，无从判断该改地址、
     * 改密钥还是开防火墙 —— 全部排障手段此前都在 adb logcat 里，
     * 而普通用户不会去连电脑看日志。
     *
     * 两个快捷出口（重试 / 切 USB）覆盖绝大多数真实场景：地址写错、
     * 服务端没起、WiFi 隔离。
     */
    fun showDiagnostics() {
        val d = host.lastFailure()
        val body = buildString {
            append("当前地址：").append(host.currentAddress()).append('\n')
            append("状态：").append(host.connectionStatusText()).append('\n')
            append("密钥：").append(if (host.currentSecret().isBlank()) "未设置" else "已设置")
            append("\n\n")
            if (d == null) {
                append("暂无失败记录。\n\n若连接不正常，请依次检查：\n")
                append("1. 电脑上 CLI 是否在运行（关掉窗口桥接就没了）\n")
                append("2. 启动时是否设了 CLAUDE_CODE_MOBILE_BRIDGE=1\n")
                append("3. 局域网模式下是否放行防火墙（需带 remoteip 限定）\n")
                append("4. 密钥是否与服务端 CLAUDE_CODE_MOBILE_SECRET 一致")
            } else {
                append("最近一次失败：\n")
                append("原因：").append(d.reason).append('\n')
                if (d.httpCode != null) append("HTTP 码：").append(d.httpCode).append('\n')
                append("已重试：").append(d.attempts).append(" 次\n\n")
                append("常见原因对照：\n")
                append("· ECONNREFUSED / 拒绝连接 → 桥接没起或端口不对\n")
                append("· SocketTimeout / 超时 → 防火墙拦截或 IP 不通\n")
                append("· Unable to resolve host → 地址写错\n")
                append("· code=4001 → 密钥不匹配（会单独提示）")
            }
        }
        AlertDialog.Builder(ctx)
            .setTitle("连接诊断")
            .setPositiveButton("重试") { _, _ ->
                host.retryConnect(host.currentAddress(), host.currentSecret())
            }
            .setNeutralButton("切到 USB 地址") { _, _ ->
                host.retryConnect("http://127.0.0.1:5680", host.currentSecret())
            }
            .setNegativeButton("关闭", null)
            .show()
    }

    // ── 会话重命名 ──

    /**
     * 弹输入框改会话名。
     *
     * 为什么值得做：多终端常在同一目录开多个窗口，此时默认标签（目录名）
     * 全都一样，手机上根本分不清哪个是哪个。
     */
    fun promptRenameSession() {
        val input = EditText(ctx).apply {
            setText(host.currentSessionLabel().orEmpty())
            hint = "会话名（最多 40 字）"
            setSingleLine()
        }
        AlertDialog.Builder(ctx)
            .setTitle("重命名当前会话")
            .setView(input)
            .setPositiveButton("确定") { _, _ ->
                val name = input.text.toString().trim()
                if (name.isEmpty()) {
                    Toast.makeText(ctx, "名称不能为空", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                if (!requireConnected()) return@setPositiveButton
                host.sendConfig("renameSession", name, "会话名 → $name")
                // 本地也立即更新（服务端会做长度截断，回执用于纠正）
                host.onSessionLabelChanged(name)
                host.appendSystem("会话已重命名为「$name」")
            }
            .setNegativeButton("取消", null)
            .show()
    }

    // ── 导出 ──

    /**
     * 导出本地历史为 Markdown，走系统分享。
     *
     * 用 ACTION_SEND 而非写文件到公共目录：用户自己选发给谁（微信/邮件/笔记），
     * 也能存进文件管理器 —— 一次实现覆盖所有去向，且完全不需要存储权限。
     *
     * 只导出**本地已有的**历史（上限 500 条，见 MessageStore），
     * 不是服务端的完整会话记录 —— 后者本项目拿不到（会话在进程内存里）。
     */
    fun exportHistory() {
        val all = host.localHistory()
        if (all.isEmpty()) {
            Toast.makeText(ctx, "没有可导出的记录", Toast.LENGTH_SHORT).show()
            return
        }
        // 格式选择（M5）：三选一弹窗。默认仍走 Markdown —— 不弹直接导出
        // 会让「选格式」这个功能无人发现；弹窗一步成本换可发现性
        val formats = ChatExporter.Format.entries.toTypedArray()
        val labels = formats.map { "${it.label} — ${it.desc}" }.toTypedArray()
        android.app.AlertDialog.Builder(ctx)
            .setTitle("导出格式")
            .setItems(labels) { _, which ->
                doExport(all, formats[which])
            }
            .setNegativeButton("取消", null)
            .show()
    }

    private fun doExport(all: List<ChatMessage>, format: ChatExporter.Format) {
        val text = ChatExporter.export(all, host.currentSessionLabel(), format)
        val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(android.content.Intent.EXTRA_SUBJECT, "doge-code 对话记录")
            putExtra(android.content.Intent.EXTRA_TEXT, text)
        }
        runCatching {
            ctx.startActivity(
                android.content.Intent.createChooser(intent, "导出对话").apply {
                    if (ctx !is Activity) addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                },
            )
        }.onFailure {
            Toast.makeText(ctx, "没有可用的分享应用", Toast.LENGTH_SHORT).show()
        }
    }
}
