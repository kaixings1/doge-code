package com.dogecode.mobile

/**
 * Glob 模式匹配（L3）：`*.kt`、`src/**/*Test.kt`、`?`。
 *
 * ## 为什么自己写而不用正则直接转换
 *
 * glob 的 `*` 语义是「不跨目录分隔符」（`*.kt` 不匹配 `a/b/c.kt`），
 * `**` 才是跨目录。直接把 glob 当正则会错：`*` 在正则里没有这层限制。
 * 转换规则：
 * - `**` → `.*`（跨目录任意）
 * - `*` → `[^/]*`（单段内任意）
 * - `?` → `[^/]`（单段内单字符）
 * - 其余字符按字面量转义
 *
 * 纯函数、零依赖，可完整单测 —— 匹配错了是静默的（「明明有却搜不到」，
 * 模型会以为文件不存在）。
 */
object GlobPattern {

    /** 把 glob 模式编译为正则。 */
    fun toRegex(pattern: String): Regex {
        val sb = StringBuilder()
        var i = 0
        while (i < pattern.length) {
            val c = pattern[i]
            when {
                c == '*' && i + 1 < pattern.length && pattern[i + 1] == '*' -> {
                    // **：跨目录任意（吃掉紧随的 / —— `a/**/b` 应匹配 `a/b`）
                    sb.append(".*")
                    i += 2
                    if (i < pattern.length && pattern[i] == '/') i++  // `**/` 的 / 可选
                }
                c == '*' -> {
                    sb.append("[^/]*")
                    i++
                }
                c == '?' -> {
                    sb.append("[^/]")
                    i++
                }
                else -> {
                    sb.append(Regex.escape(c.toString()))
                    i++
                }
            }
        }
        return Regex(sb.toString())
    }

    /** 匹配一个相对路径。 */
    fun matches(pattern: String, relativePath: String): Boolean =
        toRegex(pattern).matches(relativePath)
}
