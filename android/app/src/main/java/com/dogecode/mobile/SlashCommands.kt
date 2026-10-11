package com.dogecode.mobile

/**
 * 手机端可用的斜杠命令。
 *
 * **这是与服务端 `BRIDGE_SAFE_COMMANDS` 白名单对应的客户端镜像**，
 * 两边必须一致：
 * · 客户端有而服务端没有 → 用户点了只收到「/xxx 在远程控制中不可用」
 * · 服务端有而客户端没有 → 该命令在手机上无从被发现（等于没有）
 *
 * ## 为什么必须有这个表
 *
 * 服务端**早就**允许这些命令从桥接端执行了（`src/commands.ts` 的
 * `BRIDGE_SAFE_COMMANDS`，注释还写着「在手机上会话中期很有用」），
 * `processUserInput` 也实现了「白名单内则放开、否则回一句不可用」。
 * 但手机端**没有任何入口暴露它们** —— 用户不可能知道能敲 `/compact`，
 * 于是这套机制形同虚设。本表就是把这条已铺好的路接上。
 *
 * ## 为什么单独一张表而非混进快捷指令
 *
 * 两者行为不同，混在一起会让用户误判：
 * · 快捷指令是 **prompt 模板** —— 填入输入框等用户补充细节后发送
 * · 斜杠命令是**完整指令** —— 填入即应直接发送（`/compact` 后面
 *   不需要也无法补充什么）
 *
 * 混在一起就会出现「有的点了要再按发送、有的直接发」的不一致。
 *
 * ## 为什么按模式过滤
 *
 * M2 起区分 [Entry.Scope]：
 * · `REMOTE` —— 依赖 CLI 服务端能力（`/compact` 压上下文、`/cost` 查成本…）
 *   本地模式没有这些，列出来只会让用户点了收到字面文本
 * · `LOCAL` —— 手机自带能力（`/workspace` 显路径、`/model` 显模型、`/tools` 显工具）
 *   远端模式无意义
 * · `BOTH` —— 行为可两用（`/clear` 在两端都只是清空 UI）
 */
object SlashCommands {

    /**
     * 一条可用的斜杠命令。
     *
     * @param command 命令名（不含斜杠）
     * @param label   菜单里的展示名（带斜杠，让用户知道这是命令）
     * @param desc    说明「它做什么、什么时候用」——只写命令名用户看不懂
     * @param scope   适用模式
     * @param sendImmediately 是否点击后直接发送。当前全为 true：这些都是
     *   语义完整的命令，填入再让用户按发送是多余的一步（且用户会以为
     *   「点了没反应」）。
     */
    data class Entry(
        val command: String,
        val label: String,
        val desc: String,
        val scope: Scope,
        val sendImmediately: Boolean = true,
    ) {
        /** 适用模式。 */
        enum class Scope {
            /** 仅远端模式（依赖 CLI 服务端能力）。 */
            REMOTE,
            /** 仅本地模式（手机自带的 agent 循环直接实现）。 */
            LOCAL,
            /** 两种模式都能用（行为可能因模式而异，由实现决定）。 */
            BOTH,
        }
    }

    /**
     * 当前可用的命令清单。
     *
     * 选取标准：**该模式下真正能用**，而不是把服务端白名单照抄一遍。
     * 远端命令依赖 CLI 服务端能力（`/compact` 压上下文、`/cost` 查成本、
     * `/summary` 总结、`/files` 追踪改动），本地模式没有这些能力 —
     * 列出来只会让用户点了之后收到字面文本。
     *
     * 本地专属命令见下方说明。
     */
    val ALL: List<Entry> = listOf(
        // ── 远端专属 ──
        Entry(
            command = "compact",
            label = "/compact",
            desc = "压缩上下文。长会话聊到一半上下文快满时会变慢或开始遗忘，" +
                "压缩后能继续。远程时最需要它 —— 此前必须回电脑敲。",
            scope = Entry.Scope.REMOTE,
        ),
        Entry(
            command = "cost",
            label = "/cost",
            desc = "查看本次会话的 token 用量（本地模式为累计输入/输出 token；" +
                "远端模式为服务端的详细成本统计）。",
            scope = Entry.Scope.BOTH,
        ),
        Entry(
            command = "summary",
            label = "/summary",
            desc = "让 AI 总结当前对话。离开一会儿回来时，先看摘要比翻记录快。",
            scope = Entry.Scope.REMOTE,
        ),
        Entry(
            command = "files",
            label = "/files",
            desc = "列出本次会话跟踪改动的文件。想知道「AI 刚才动了哪些文件」时用。",
            scope = Entry.Scope.REMOTE,
        ),
        // ── 通用 ──
        Entry(
            command = "clear",
            label = "/clear",
            desc = "清空当前对话记录。⚠ 会丢失上下文，重新开始新任务时用。",
            scope = Entry.Scope.BOTH,
        ),
        // ── 本地专属 ──
        Entry(
            command = "workspace",
            label = "/workspace",
            desc = "显示当前工作区绝对路径。本地模式下文件读写都在这个目录里，" +
                "AI 看不到的路径就是这条路径之外。",
            scope = Entry.Scope.LOCAL,
        ),
        Entry(
            command = "model",
            label = "/model",
            desc = "显示当前使用的模型名。不必进设置页。",
            scope = Entry.Scope.LOCAL,
        ),
        Entry(
            command = "tools",
            label = "/tools",
            desc = "列出本地模式可用的工具（读文件、改文件、列目录、搜代码）。" +
                "**本地模式不能执行命令** —— Android 沙箱不提供 shell。",
            scope = Entry.Scope.LOCAL,
        ),
    )

    /**
     * 按输入前缀与模式过滤命令（供输入框联想）。
     *
     * 前缀匹配而非包含匹配：用户敲 `/co` 期望看到 `/compact`、`/cost`，
     * 而不是任何描述里含 "co" 的命令。
     *
     * @param input 用户当前输入的完整文本（如 "/co"）
     * @param scope 当前模式：传 [Entry.Scope.LOCAL] 时**只**返回本地/通用命令，
     *              传 [Entry.Scope.REMOTE] 时**只**返回远端/通用命令。
     *              不传则不过滤（保留旧调用方兼容 —— 但生产代码现在都传）。
     */
    fun matching(
        input: String,
        scope: Entry.Scope? = null,
    ): List<Entry> {
        val t = input.trim()
        if (!t.startsWith("/")) return emptyList()
        // 只按命令名过滤，忽略后面的参数（如 "/cost --json" 仍应匹配 /cost）
        val name = t.removePrefix("/").substringBefore(' ')
        val pool = if (scope == null) ALL else ALL.filter { it.matches(scope) }
        if (name.isEmpty()) return pool
        return pool.filter { it.command.startsWith(name, ignoreCase = true) }
    }

    /**
     * 判断一段输入是否是「已知的、可在当前模式下执行」斜杠命令。
     *
     * 用途：决定「发送时是否给用户一个提示」。用户敲了 `/doctor`
     * （不在白名单）时，服务端会回一句不可用 —— 但那是**一轮往返之后**。
     * 客户端提前识别能让用户立刻知道，不必等。
     *
     * 不做「拦住不发送」：服务端才是权威，客户端只做提示。
     * 若客户端误判（如将来白名单扩大而这里没同步），拦住发不出去
     * 比发出去被服务端礼貌拒绝更糟。
     *
     * @param command 完整输入（含斜杠）
     * @param scope   当前模式；为 null 时**只**判断命令是否存在（不区分模式）
     */
    fun isKnown(command: String, scope: Entry.Scope? = null): Boolean {
        val name = command.trim().removePrefix("/").substringBefore(' ')
        return ALL.any { it.command.equals(name, ignoreCase = true) && it.matches(scope) }
    }

    /**
     * 输入是否「看起来像斜杠命令」（以 / 开头且非空）。
     *
     * 与 [isKnown] 分开：未知命令也要能识别出「这是个斜杠命令」，
     * 才能给出「该命令在手机上不可用」的准确提示，而不是把它当普通
     * 消息发出去、让 AI 收到字面文本 `/doctor`。
     */
    fun looksLikeCommand(input: String): Boolean {
        val t = input.trim()
        return t.startsWith("/") && t.length > 1
    }

    /**
     * 一条命令在指定模式下是否可用。
     *
     * `scope == null` 表示「不区分模式」（用于全局检查是否在白名单）；
     * 否则只接受精确匹配或 BOTH。
     *
     * BOTH 永远通过（两种模式都可用），REMOTE/LOCAL 只在传入对应 scope 时通过。
     */
    fun Entry.matches(scope: Entry.Scope?): Boolean {
        if (scope == null) return true
        return this.scope == Entry.Scope.BOTH || this.scope == scope
    }
}
