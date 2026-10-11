package com.dogecode.mobile

/**
 * 工具气泡的视觉判定（纯函数，可单测）。
 *
 * 为什么抽出来：着色与截断的判据看着简单，实际有一串易错边界 ——
 * 工具名大小写、未知工具的兜底色、行数恰好等于上限时该不该截断、
 * 极长单行（无换行）怎么算。而这些错了只是「颜色怪 / 少显示几行」，
 * 不会报错，真机上极难注意到。
 */
object ToolVisual {

    /** 工具类别：决定气泡左侧色条与状态文字颜色。 */
    enum class Category {
        /** 读文件 / 搜索 / 查看类 */
        READ,

        /** 写文件 / 编辑 / 执行命令类（有副作用，最需要引起注意） */
        WRITE,

        /** 网络 / 外部请求类 */
        NETWORK,

        /** 子代理 */
        AGENT,

        /** 未知工具 */
        OTHER,
    }

    /**
     * 按工具名判定类别。
     *
     * 用**包含匹配**而非精确匹配：工具名在不同版本/来源下大小写与
     * 前后缀会变（`Read` / `read_file` / `mcp__fs__read`），
     * 精确匹配会大面积漏判而全部落入 OTHER（都是灰的，等于没着色）。
     *
     * 判定顺序有意义：**先判 WRITE 再判 READ** —— `Edit`、`Write` 等
     * 名字里不含 read，但 `NotebookEdit` 含 "edit" 也含 "not"... 之类
     * 的交叉情况要以「有副作用优先」为准，因为误判成 READ 会让用户
     * 低估风险，误判成 WRITE 只是多一分警惕。
     */
    fun categoryOf(toolName: String, kind: String = "tool"): Category {
        if (kind == "agent") return Category.AGENT
        if (kind == "thinking") return Category.OTHER
        val n = toolName.lowercase()

        // 有副作用的优先判：宁可让用户多一分警惕
        if (n.contains("write") || n.contains("edit") || n.contains("bash") ||
            n.contains("shell") || n.contains("exec") || n.contains("run") ||
            n.contains("command") || n.contains("powershell")
        ) {
            return Category.WRITE
        }
        if (n.contains("read") || n.contains("glob") || n.contains("grep") ||
            n.contains("search") || n.contains("find") || n.contains("list") ||
            n.contains("view") || n.contains("cat")
        ) {
            return Category.READ
        }
        if (n.contains("fetch") || n.contains("http") || n.contains("web") ||
            n.contains("curl") || n.contains("download") || n.contains("upload")
        ) {
            return Category.NETWORK
        }
        if (n.contains("agent") || n.contains("task")) return Category.AGENT
        return Category.OTHER
    }

    /**
     * 结果的最大显示行数。
     *
     * 为什么限制：一次 `npm test` 或 `git log` 可能输出几百行，
     * 全部展开会把列表撑得没法用（要滚好几屏才到下一条消息）。
     * 显示前 N 行 + 「还有 M 行」，既能看出结果性质，
     * 又不至于淹没其余内容。
     */
    const val RESULT_MAX_LINES = 20

    /**
     * 按行数截断结果文本。
     *
     * 返回值第二项为被截掉的行数（0 表示未截断）。
     *
     * 边界处理：
     * - 行数**等于**上限时不截断（用户看到的刚好是全部）
     * - 单行超长文本不按行截（只有 1 行），交给 TextView 自身滚动/省略，
     *   否则会把一条长错误信息从中间切断
     */
    fun truncateResult(text: String, maxLines: Int = RESULT_MAX_LINES): Pair<String, Int> {
        if (text.isEmpty()) return text to 0
        val lines = text.lines()
        if (lines.size <= maxLines) return text to 0
        val kept = lines.take(maxLines).joinToString("\n")
        return kept to (lines.size - maxLines)
    }

    /**
     * 命令原文的最大显示行数。
     *
     * 比结果更严：命令通常就是一两行，多出来的往往是 heredoc
     * 或脚本内容，看开头足以判断它要干什么。
     */
    const val DETAIL_MAX_LINES = 10

    /** 按行数截断命令原文（语义同 [truncateResult]）。 */
    fun truncateDetail(text: String, maxLines: Int = DETAIL_MAX_LINES): Pair<String, Int> =
        truncateResult(text, maxLines)
}
