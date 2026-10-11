package com.dogecode.mobile

/**
 * 文本附件的判定与拼接（纯逻辑，可单测）。
 *
 * **为什么只支持文本类**（评估结论）：
 * 服务端的附件机制依赖「文件先上传到远端服务、消息里只带 file_uuid、
 * 服务端再按 uuid 下载」这套体系，移动端没有它。自建「客户端上传二进制 →
 * 服务端落盘」会引入整类安全问题（写入路径、体积炸弹、符号链接）。
 * 而手机端发附件的真实场景（贴日志、贴配置、贴代码片段）恰好都是文本。
 *
 * 所以：把文本**读出来拼进 message**，零落盘、零服务端改动。
 */
object TextAttachment {

    /**
     * 体积上限（字符数）。
     *
     * 文本也需限制：一整本日志文件塞进 prompt 会瞬间吃光上下文，
     * 而用户往往只是想让 AI 看其中的报错。200KB 够放几万行日志，
     * 又不会让上下文失控。
     */
    const val MAX_CHARS = 200_000

    /**
     * 单条消息里最多附几个文件。
     *
     * 3 个够用（如「日志 + 配置 + 报错截图文本」），
     * 再多说明用户应该改用别的方式（如让 AI 直接读项目文件）。
     */
    const val MAX_FILES = 3

    /**
     * 允许的扩展名白名单。
     *
     * **用白名单而非黑名单**：黑名单永远会漏（新的二进制格式层出不穷），
     * 而白名单在遇到未知格式时默认拒绝 —— 安全方向正确。
     */
    private val TEXT_EXTENSIONS = setOf(
        // 纯文本与文档
        "txt", "md", "markdown", "rst", "log", "csv", "tsv",
        // 数据与配置
        "json", "yaml", "yml", "toml", "ini", "conf", "cfg", "properties", "env", "xml",
        // 代码
        "kt", "java", "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rb", "go", "rs",
        "c", "h", "cpp", "hpp", "cc", "cs", "swift", "php", "sh", "bash", "zsh",
        "bat", "cmd", "ps1", "sql", "html", "htm", "css", "scss", "less", "vue", "svelte",
        // 构建与依赖
        "gradle", "cmake", "mk", "dockerfile", "gitignore", "editorconfig",
    )

    /**
     * 判断文件名是否是支持的文本附件。
     *
     * 只看扩展名，不看 MIME —— 因为 SAF 返回的 MIME 经常不准
     * （不同文件管理器对同一个 .md 可能给 text/markdown、
     * text/plain 甚至 application/octet-stream）。扩展名更可靠。
     */
    fun isSupported(fileName: String): Boolean {
        val name = fileName.substringAfterLast('/', fileName).lowercase()
        if (name.isEmpty()) return false
        // 无扩展名的常见文本文件（Dockerfile、Makefile 等）
        if (!name.contains('.')) {
            return name in setOf("dockerfile", "makefile", "rakefile", "gemfile", "license", "readme")
        }
        val ext = name.substringAfterLast('.')
        return ext in TEXT_EXTENSIONS
    }

    /** 判定结果：为什么不受支持。 */
    sealed interface Check {
        object Ok : Check
        /** 扩展名不在白名单里。 */
        data class Unsupported(val fileName: String) : Check
        /** 体积超限。 */
        data class TooLarge(val fileName: String, val chars: Int) : Check
        /** 附件数量超限。 */
        data class TooMany(val current: Int) : Check
    }

    /**
     * 综合校验：能否再附这个文件。
     *
     * 分开返回原因而非布尔值：调用方要给出**具体**提示
     *（"不支持 .png" vs "文件太大（320KB）"），笼统的"无法添加"
     * 会让用户反复尝试。
     */
    fun check(fileName: String, content: String, currentCount: Int): Check = when {
        currentCount >= MAX_FILES -> Check.TooMany(currentCount)
        !isSupported(fileName) -> Check.Unsupported(fileName)
        content.length > MAX_CHARS -> Check.TooLarge(fileName, content.length)
        else -> Check.Ok
    }

    /**
     * 把附件拼进消息正文。
     *
     * 格式设计：每个附件用「文件名的代码块」包裹内容 ——
     * 让 AI 能清楚区分附件边界（否则多文件时内容会连成一片），
     * 也让用户回看时知道哪段是附件。
     *
     * 放在正文**之后**：用户写的话在前，附件作为补充材料。
     */
    fun compose(userText: String, attachments: List<Pair<String, String>>): String {
        if (attachments.isEmpty()) return userText
        val sb = StringBuilder()
        if (userText.isNotBlank()) {
            sb.append(userText).append("\n\n")
        }
        attachments.forEach { (name, content) ->
            sb.append("--- ").append(name).append(" ---\n")
            sb.append(content.trimEnd())
            sb.append("\n--- end ").append(name).append(" ---\n")
        }
        return sb.toString().trimEnd()
    }

    /** 气泡里显示的摘要，如 "[附件: app.log, config.json]"。 */
    fun bubbleLabel(attachments: List<Pair<String, String>>): String {
        if (attachments.isEmpty()) return ""
        return "[附件: " + attachments.joinToString(", ") { it.first } + "]"
    }
}
