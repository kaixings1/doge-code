package com.dogecode.mobile

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * 逐条「授权/不授权」规则。
 *
 * 背景：远端模式下 AI 每次要执行工具（读/写文件、跑命令）时，服务端发来
 * 一个权限请求，手机端原本**每次都弹窗**让用户手动点。本类让用户能按工具
 * 预先设好策略：总是允许 / 总是拒绝 / 每次询问（默认）。收到请求时先查规则，
 * 命中前两者则**自动裁决**（直接回传 allow/deny，不再弹窗），只有「每次询问」
 * 才走原弹窗逻辑。
 *
 * 与 [PermissionDecisionStore] 的关系：后者是「**待发决定**的离线队列」
 * （App 没运行时在通知栏点的决定要落盘等重连补发）。本类不存「决定」，
 * 只存「策略」—— 它是弹窗**之前**的一道闸门。两条职责互不重叠。
 *
 * 设计取舍（与项目既有约定一致）：
 * 1. 纯逻辑（`decide`、`normalizePolicy`）抽成 `internal` 独立函数，不依赖
 *    Android，便于单测直接调用生产代码（而非复刻）。
 * 2. 持久化用 SharedPreferences（不是 JSON 文件）：规则条目**无序**、
 *    单值（每个 toolName 一个 policy），StringSet/单 String 都够用，
 *    没必要引入文件读写与损坏恢复。
 * 3. 向后兼容：旧行为（默认 "ask"）完全不变 —— 没有规则时一律回到
 *    「每次询问」，与原实现逐条弹窗等价。
 */
object PermissionRules {

    /** 三种策略常量。用字符串而非枚举：要落盘进 SharedPreferences，字符串直接可读易迁移。 */
    const val POLICY_ALWAYS_ALLOW = "always_allow"
    const val POLICY_ALWAYS_DENY = "always_deny"
    const val POLICY_ASK = "ask"

    /**
     * 已知工具名（来自服务端权限请求的 `toolName` 字段，见 [BridgeProtocol]）。
     *
     * 集中定义、不散落硬编码：服务端工具名是**字面量**（如 "Bash"、"Edit"），
     * 大小写敏感，拼错就会匹配不到、退化成 "ask"。由 [KNOWN_TOOL_NAMES] 这一
     * 处单一来源约束 UI 列表与服务端口径一致。
     *
     * 实际出现哪些取决于服务端；这里列的是 CLAUDE Code 工具集里需要授权的
     * 常见子集。未在列表里的工具名仍可被规则匹配（规则按字符串精确命中），
     * 列表只是给 UI 一个「常见工具」的默认陈列。
     */
    val KNOWN_TOOL_NAMES: List<String> = listOf(
        "Read",
        "Edit",
        "Write",
        "MultiEdit",
        "NotebookEdit",
        "Bash",
        "Glob",
        "Grep",
        "WebFetch",
        "WebSearch",
        "Task",
        "TodoWrite",
        "EnterPlanMode",
        "ExitPlanMode",
    )

    /** 一条规则：某工具对应的策略。 */
    data class PermissionRule(val toolName: String, val policy: String)

    private const val PREFS = "doge_permission_rules"
    private const val KEY_PREFIX = "rule:"

    /**
     * 把（可能非法的）策略值归一化。
     *
     * 抽成纯函数便于单测：非法值（拼错、旧版本残留）一律回落 "ask"，
     * 而不是当成 "always_allow"（那会让误写悄悄放行，比「每次询问」危险得多）。
     */
    internal fun normalizePolicy(raw: String?): String = when (raw) {
        POLICY_ALWAYS_ALLOW, POLICY_ALWAYS_DENY, POLICY_ASK -> raw
        else -> POLICY_ASK
    }

    /**
     * 纯逻辑裁决：给定一条规则 + 请求的请求行为，返回最终应回传的 behavior。
     *
     * 是自动裁决的**唯一来源**，抽成 internal 纯函数（无 Android 依赖）以便单测
     * 直接盯着它。语义：
     * - 规则为 "always_allow" → 直接回 "allow"
     * - 规则为 "always_deny"  → 直接回 "deny"
     * - 规则缺失或为 "ask"    → 返回 null，表示「仍需问用户」（走弹窗）
     *
     * `requestBehavior` 参数预留：服务端未来可能带「建议行为」（如只读操作建议
     * 放行），届时可在本函数内做更细的合并。当前未使用但签名保留，
     * 避免将来加参数破坏调用方。
     *
     * @return "allow" / "deny" 表示已自动裁决；null 表示仍需用户决定
     */
    internal fun decide(
        rule: String?,
        @Suppress("UNUSED_PARAMETER") requestBehavior: String = "allow",
    ): String? {
        return when (normalizePolicy(rule)) {
            POLICY_ALWAYS_ALLOW -> "allow"
            POLICY_ALWAYS_DENY -> "deny"
            else -> null   // 含 "ask" 与所有未知值
        }
    }

    /** 读取某工具的策略（默认 [POLICY_ASK]）。 */
    fun getPolicy(context: Context, toolName: String): String {
        val prefs = prefsOf(context)
        return normalizePolicy(prefs.getString(KEY_PREFIX + toolName, null))
    }

    /** 设置某工具的策略。 */
    fun setPolicy(context: Context, toolName: String, policy: String) {
        val p = normalizePolicy(policy)
        prefsOf(context).edit().putString(KEY_PREFIX + toolName, p).apply()
    }

    /** 列出所有已设置（非默认）的规则。 */
    fun allRules(context: Context): List<PermissionRule> {
        val prefs = prefsOf(context)
        return prefs.all.keys
            .filter { it.startsWith(KEY_PREFIX) }
            .mapNotNull { key ->
                val tool = key.removePrefix(KEY_PREFIX)
                val policy = normalizePolicy(prefs.getString(key, null))
                if (tool.isBlank() || policy == POLICY_ASK) null
                else PermissionRule(tool, policy)
            }
    }

    /**
     * 导出全部规则（含默认值），供 UI 渲染完整列表用。
     *
     * [KNOWN_TOOL_NAMES] 一定出现；额外出现过规则的工具名也补进列表
     * （用户可能给某个没在已知列表里的工具设过规则）。
     */
    fun allRulesWithDefaults(context: Context): List<PermissionRule> {
        val explicit = allRules(context).associateBy { it.toolName }
        val names = LinkedHashSet<String>().apply {
            addAll(KNOWN_TOOL_NAMES)
            addAll(explicit.keys)
        }
        return names.map { PermissionRule(it, explicit[it]?.policy ?: POLICY_ASK) }
    }

    private fun prefsOf(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
