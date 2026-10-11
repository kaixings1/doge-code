package com.dogecode.mobile

/**
 * 工作区路径的安全解析（纯逻辑，可单测）。
 *
 * ## 这是本地模式最重要的安全边界
 *
 * 本地模式下，模型可以**主动请求读写文件**（它自己决定路径字符串）。
 * 若不做校验，一个被注入的提示词就能让它读 `/data/data/<包名>/` 下的
 * 凭证，或写到工作区之外。所以：
 *
 * **所有路径必须落在用户授权的工作区根目录内。**
 *
 * ## 为什么必须在「字符串层面」判，而不是只看解析结果
 *
 * 用户（和模型）会给出各种形式：
 * · `../../etc/passwd` —— 经典越界
 * · `/data/local/tmp/x` —— 绝对路径，直接跳过根
 * · `a/./../../b` —— 绕一圈回到外面
 * · `\\..\\..\\x` —— Windows 风格分隔符（有些模型习惯这么写）
 *
 * 单纯 `File.resolve()` 在部分平台上**不会**报错，而是安静地解析成
 * 工作区外的路径。故本类先**拒绝一切绝对路径**，再把分隔符归一化，
 * 然后逐段处理 `..`（不能简单删除 —— `a/../b` 与 `a/b` 不同）。
 *
 * 抽成纯逻辑对象的原因：这段判据错了**不会报错、只会静默放行**，
 * 必须能穷举单测。
 */
object WorkspacePath {

    /** 解析失败的统一原因（给用户/模型看）。 */
    const val ERROR_OUTSIDE = "路径超出工作区范围，已拒绝"
    const val ERROR_ABSOLUTE = "不接受绝对路径，请使用相对工作区的路径"
    const val ERROR_EMPTY = "路径为空"

    /** 解析结果：要么得到相对路径，要么得到拒绝原因。 */
    sealed interface Resolved {
        /** 安全的工作区内相对路径（已归一化，如 `src/a.ts`）。 */
        data class Ok(val relative: String) : Resolved

        /** 被拒绝，附可读原因。 */
        data class Rejected(val reason: String) : Resolved
    }

    /**
     * 把模型给的路径字符串解析为安全的工作区相对路径。
     *
     * 规则（按顺序）：
     * 1. 空 → 拒绝
     * 2. **任何绝对路径都拒绝**：`/x`、`C:\x`、`\\server\x`。
     *    不做「自动转成相对」—— 那会让模型的错误写法看起来「能用」，
     *    掩盖了它其实不理解工作区概念这件事
     * 3. 分隔符归一化（`\` → `/`）
     * 4. 逐段处理：`.` 丢弃、`..` 回退一层；**若已到顶再 `..` 则拒绝**
     *    （这正是 `../x` 越界的位置）
     */
    fun resolve(raw: String): Resolved {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return Resolved.Rejected(ERROR_EMPTY)

        // 统一的 Windows 风格分隔符：模型常这么写
        val normalized = trimmed.replace('\\', '/')

        if (isAbsolute(normalized)) return Resolved.Rejected(ERROR_ABSOLUTE)

        val out = mutableListOf<String>()
        for (seg in normalized.split('/')) {
            when (seg) {
                "", "." -> continue // 空段（重复斜杠）与当前目录：丢弃
                ".." -> {
                    if (out.isEmpty()) {
                        // 关键：已经到顶还往上退 = 越界
                        return Resolved.Rejected(ERROR_OUTSIDE)
                    }
                    out.removeAt(out.size - 1)
                }
                else -> out.add(seg)
            }
        }
        if (out.isEmpty()) {
            // 形如 "." 或 "./" —— 指向工作区根，合法但需要显式值
            return Resolved.Ok(ROOT_SENTINEL)
        }
        return Resolved.Ok(out.joinToString("/"))
    }

    /**
     * 是否绝对路径。
     *
     * 覆盖三类：
     * · Unix 绝对：`/x`
     * · Windows 盘符：`C:/x`、`c:\x`
     * · UNC：`//server/share`（归一化前是 `\\server\share`）
     */
    fun isAbsolute(normalized: String): Boolean {
        if (normalized.startsWith("/")) return true
        // 盘符形如 "X:" + 分隔或结尾
        if (normalized.length >= 2 && normalized[1] == ':' &&
            normalized[0].isLetter()
        ) {
            return true
        }
        return false
    }

    /**
     * 表示「工作区根」的哨兵值。
     *
     * 用 "." 而非空串：向下游（java.io.File）传空串会在多数平台上
     * 报错或解析成意外位置。
     */
    const val ROOT_SENTINEL = "."

    /** 展示用：把相对路径还原成以 / 开头的形式（仅用于界面显示）。 */
    fun display(relative: String): String =
        if (relative == ROOT_SENTINEL) "/" else "/$relative"
}
