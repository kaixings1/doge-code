package com.dogecode.mobile

/**
 * 消息上的可用操作（纯逻辑，可单测）。
 *
 * 为什么抽出来：长按菜单的**菜单项是动态的** ——
 * 不含代码块的消息不该出现「复制代码块」，否则用户点了没反应。
 * 而「哪些操作可用」这套判定涉及文本解析，属易错且可测的逻辑。
 */
object MessageActions {

    /**
     * 从文本里提取所有 ``` 代码块的内容。
     *
     * 与 [ChatAdapter.parseMarkdown] 的差别：那边是**渲染**（需要区分
     * 行内码与块码、保留标记），这边只需要**提取内容**用于复制。
     * 两者关心的东西不同，强行复用会让各自的代码都变复杂。
     *
     * 未闭合的 ``` 不提取（无法判断块到哪里结束）—— 宁可少给，
     * 不要给出一个被截断的代码块让用户以为复制成功。
     */
    fun extractCodeBlocks(text: String): List<String> {
        val blocks = mutableListOf<String>()
        var i = 0
        while (i < text.length) {
            if (!text.startsWith("```", i)) {
                i++
                continue
            }
            val end = text.indexOf("```", i + 3)
            if (end < 0) break   // 未闭合，停止
            // 跳过语言标记行（```kotlin\n... 里的 kotlin）
            var content = text.substring(i + 3, end)
            val nl = content.indexOf('\n')
            if (nl >= 0) content = content.substring(nl + 1)
            blocks.add(content.trim('\n'))
            i = end + 3
        }
        return blocks
    }

    /**
     * 引用一条消息：转成引用块文本，供填入输入框。
     *
     * 每行加 "> " 前缀（Markdown 引用语法），空行保持空行 ——
     * 只给首行加前缀会让后续行被当成正文，引用边界消失。
     *
     * 超过 [maxLines] 行时截断：引用一整条长回复会让输入框变得没法用，
     * 而用户真正想引用的通常是最后一两段。
     */
    fun quote(text: String, maxLines: Int = 6): String {
        val lines = text.trim().lines()
        val head = if (lines.size > maxLines) lines.take(maxLines) else lines
        val body = head.joinToString("\n") { if (it.isBlank()) ">" else "> $it" }
        val suffix = if (lines.size > maxLines) "\n> …（已截断，原消息共 ${lines.size} 行）" else ""
        return body + suffix + "\n\n"
    }

    /** 菜单里应显示哪些操作。 */
    enum class Action {
        COPY_ALL,
        COPY_CODE,
        /** 工具气泡专用：只复制命令原文（不含结果）。 */
        COPY_TOOL_DETAIL,
        /** 工具气泡专用：只复制执行结果（不含命令）。 */
        COPY_TOOL_RESULT,
        QUOTE,
        /**
         * 编辑重发。
         *
         * **只对最后一条用户消息可用** —— 改历史中间的消息会让后续所有
         * 消息的上下文失效（AI 是基于含旧内容的上下文生成的回复），
         * 且用户预期不明确。只改最后一条等同于「重新提问」，语义清晰。
         */
        EDIT_LAST,
        /**
         * 重新生成回复（把最后一条用户消息原样重发）。
         *
         * 与 [EDIT_LAST] 的区别：那个让用户改文本，这个不改、直接重跑。
         * 对回复不满意时想「换个答案」是高频操作，而 EDIT_LAST 的
         * 弹框要求先看到文本再确认，多一步且容易被误认为必须改动。
         *
         * 挂在哪条消息上：挂在**最后一条助手回复**上更符合直觉
         * （用户想重新生成的是「这条回复」），但实现的语义是「重跑
         * 最后一轮」，故两者都可见会让人困惑 —— 只在助手消息上提供，
         * 因为它表示「对这个答案不满意」。
         */
        REGENERATE,
        DELETE,
        /**
         * 进入批量选择模式（从单条菜单通往「多选/全选/批量操作」的入口）。
         *
         * 为什么放在单条菜单里而不是靠长按直进：长按直进会让**单条消息的成熟
         * 菜单（复制/引用/编辑/重生成/删除）失去触发点**（上一轮批量改造即因此
         * 变成死代码）。保留单条菜单、在末尾挂一个「选择多条」入口，两路都可达：
         * 想批量长按这条 → 菜单里有；想单条操作 → 仍是长按菜单。
         */
        SELECT_MULTIPLE,
    }

    /**
     * 按消息内容决定可用操作。
     *
     * 「复制代码块」只在确实有代码块时出现 —— 否则是多一个点了没反应的项。
     * 「删除」只对本地消息可用（所有消息都在本地存，故都可用）。
     */
    fun availableActions(message: ChatMessage): List<Action> {
        // 工具气泡走独立分支：它的「复制」语义与普通消息不同 ——
        // 用户复制工具气泡时，想要的往往**只是命令**或**只是输出**，
        // 而不是两者黏在一起（粘到聊天里时黏在一起还得手动删）。
        if (message.isTool) {
            val actions = mutableListOf<Action>()
            if (message.toolDetail.isNotBlank()) actions.add(Action.COPY_TOOL_DETAIL)
            if (message.toolResult.isNotBlank()) actions.add(Action.COPY_TOOL_RESULT)
            if (message.text.isNotBlank() || message.toolDetail.isNotBlank() ||
                message.toolResult.isNotBlank()
            ) {
                actions.add(Action.COPY_ALL)
            }
            actions.add(Action.DELETE)
            actions.add(Action.SELECT_MULTIPLE)
            return actions
        }

        val actions = mutableListOf<Action>()
        if (message.text.isNotBlank()) {
            actions.add(Action.COPY_ALL)
            if (extractCodeBlocks(message.text).isNotEmpty()) {
                actions.add(Action.COPY_CODE)
            }
            actions.add(Action.QUOTE)
        }
        // 重新生成只对助手回复有意义（用户消息没有「回复」可重新生成）。
        // 「是否最后一条助手回复」是位置相关判断，由 withEditIfLast 处理。
        if (message.role == "assistant") {
            actions.add(Action.REGENERATE)
        }
        actions.add(Action.DELETE)
        actions.add(Action.SELECT_MULTIPLE)
        return actions
    }

    /**
     * 工具气泡的完整可复制文本。
     *
     * 工具气泡折叠态只显示一行标题（[ChatMessage.text]），但长按复制时应
     * 复制**全部**内容（标题 + 命令原文 + 结果），否则用户复制到的只是
     * 一个「▸ Bash ls」而看不到真正执行的命令与输出。
     */
    fun toolFullText(m: ChatMessage): String {
        if (!m.isTool) return m.text
        val parts = mutableListOf<String>()
        if (m.text.isNotBlank()) parts.add(m.text)
        if (m.toolDetail.isNotBlank()) parts.add(m.toolDetail)
        if (m.toolResult.isNotBlank()) parts.add(m.toolResult)
        return parts.joinToString("\n\n")
    }

    /**
     * 按「是否是最后一条用户消息」决定是否加入编辑项。
     *
     * 与 [availableActions] 分开：那个只看单条消息的内容，
     * 这个需要知道**它在列表中的位置** —— 是位置相关的判断。
     */
    fun withEditIfLast(actions: List<Action>, isLastUser: Boolean): List<Action> =
        if (isLastUser) {
            // 先移除可能已存在的 EDIT_LAST —— 幂等性要求：
            // 之前只过滤 DELETE，连调两次会累积出两个编辑项
            //（被单测「幂等：连续调用两次不出现两个编辑项」抓出）
            val withoutEdit = actions.filterNot { it == Action.EDIT_LAST || it == Action.DELETE }
            // 插在删除之前：编辑是正向操作，删除是破坏性的，正向的靠前
            withoutEdit + Action.EDIT_LAST + Action.DELETE
        } else {
            // 非最后一条时也要清掉 EDIT_LAST —— 调用方可能传入了
            // 上一次判断为「最后一条」时的结果
            actions.filterNot { it == Action.EDIT_LAST }
        }

    /**
     * 按「是否是最后一条助手回复」决定是否保留重新生成项。
     *
     * 与 [withEditIfLast] 分开而非合并成一个双布尔方法：两者的位置判据
     * 不同（用户消息 vs 助手消息），合并后签名变成
     * `(actions, isLastUser, isLastAssistant)`，调用方极易传错顺序，
     * 且两个布尔同时为真的组合无意义。
     *
     * 非最后一条助手回复时**移除**该项：重新生成的实现是「重跑最后一轮」，
     * 若允许对中间的历史回复点它，用户以为会重生成那一条，
     * 实际却重跑了最新一轮 —— 行为与预期不符比没有这个功能更糟。
     */
    fun withRegenerateIfLast(actions: List<Action>, isLastAssistant: Boolean): List<Action> =
        if (isLastAssistant) {
            actions
        } else {
            actions.filterNot { it == Action.REGENERATE }
        }

    /** 操作对应的展示文案。 */
    fun labelOf(action: Action, codeBlockCount: Int): String = when (action) {
        Action.COPY_ALL -> "复制全文"
        Action.COPY_CODE -> if (codeBlockCount > 1) "复制代码块（$codeBlockCount 个）" else "复制代码块"
        Action.COPY_TOOL_DETAIL -> "仅复制命令"
        Action.COPY_TOOL_RESULT -> "仅复制结果"
        Action.QUOTE -> "引用此消息"
        Action.EDIT_LAST -> "编辑并重发"
        Action.REGENERATE -> "重新生成回复"
        Action.DELETE -> "删除此条（仅本地）"
        Action.SELECT_MULTIPLE -> "选择多条"
    }
}
