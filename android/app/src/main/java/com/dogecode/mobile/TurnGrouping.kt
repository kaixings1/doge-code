package com.dogecode.mobile

/**
 * 回合分组（纯逻辑，可单测）。
 *
 * 问题：一轮 AI 干活会产生大量过程性气泡（工具调用、思考），
 * 夹杂在正文之间。长任务下用户要滚很久才能看到「这轮到底做了什么」，
 * 而且这些过程信息在回看时多半只关心「跑了几步、有没有失败」。
 *
 * 做法：把同一回合的工具/思考气泡归到一个「本轮活动（N 项）」组头下，
 * 默认折叠成一行，点开展开全部过程气泡。正文与用户消息不参与分组
 * （它们才是对话内容）。
 *
 * 回合边界：用户消息开启新回合；助手定稿回复结束当前回合。
 * 过程气泡归属**其之前最近的那个回合**。
 *
 * 为什么不用时间戳切分：一轮可能跑几分钟，期间用户可能发新消息
 * （打断后重新提问）；时间窗口无法区分「同一回合内」与「新回合」，
 * 而消息顺序天然编码了这个信息。
 */
object TurnGrouping {

    /**
     * 一条可以被分组的消息的投影。
     *
     * 用投影而非直接吃 ChatMessage：分组判据只关心 role，投影让
     * 纯 JVM 测试不必构造完整消息（且明确表达「只用这三个字段」）。
     */
    data class Item(
        val id: String,
        val role: String,
        /**
         * 该消息携带的组折叠键（非组首成员为空串）。
         *
         * 与 [groupExpanded] 一起决定「这个组当前是折叠还是展开」。
         */
        val groupKey: String = "",
        /**
         * 组展开态（仅对带 [groupKey] 的组首成员有意义）。
         *
         * **刻意与工具气泡自身的展开态分开**：那是「这条气泡是否显示
         * 原文与结果」，两者混用会导致「点开单条气泡 → 整组突然全展开」。
         */
        val groupExpanded: Boolean = false,
    )

    /**
     * 从消息投影里挑出「折叠中」的组键集合。
     *
     * 抽成纯函数的原因：这是「组首标记」与「展开态」两个判据的交汇点，
     * 写错（如误用气泡的展开态、忘判组首归属）只会表现为
     * 「折叠状态不对劲」，在真机上极难定位。且它是 Adapter 里唯一
     * 需要跨字段推理的逻辑，适合独立测试。
     */
    fun collapsedKeysOf(items: List<Item>): Set<String> =
        items
            .filter { isGroupable(it.role) && it.groupKey == collapseKeyFor(it.id) }
            .filterNot { it.groupExpanded }
            .map { it.groupKey }
            .toSet()

    /** 分组结果：要么是独立消息，要么是一个过程气泡组。 */
    sealed interface Node {
        /** 单条独立消息（用户 / 助手正文 / 系统）。 */
        data class Single(val index: Int) : Node

        /**
         * 一个过程气泡组。
         *
         * @param indices 组内成员在原始列表中的下标（升序）
         * @param collapsed 是否折叠（默认折叠）
         */
        data class Group(val indices: List<Int>, val collapsed: Boolean) : Node
    }

    /**
     * 把消息列表切成「独立消息 + 过程组」的序列。
     *
     * 规则：
     * 1. 连续的工具气泡（中间没有其他角色）归为一组
     * 2. 只有 1 个成员的组不分组（单独一条气泡套一个组头是多余的层级）
     * 3. 折叠态由组头自身的持久化状态决定（见 [groupKeyOf]），
     *    此处只接受外部传入的「该组是否折叠」
     *
     * @param items 按时间升序的消息投影
     * @param collapsedKeys 已折叠的组键集合（来自持久化）
     */
    fun buildNodes(items: List<Item>, collapsedKeys: Set<String> = emptySet()): List<Node> {
        val nodes = mutableListOf<Node>()
        var i = 0
        while (i < items.size) {
            if (!isGroupable(items[i].role)) {
                nodes.add(Node.Single(i))
                i++
                continue
            }
            // 收集连续的可分组消息
            var j = i
            while (j < items.size && isGroupable(items[j].role)) j++
            val indices = (i until j).toList()
            if (indices.size < 2) {
                // 单个成员不套组头：多一层折叠反而多一次点击
                nodes.add(Node.Single(i))
            } else {
                val key = groupKeyOf(items, indices)
                nodes.add(Node.Group(indices, collapsed = key in collapsedKeys))
            }
            i = j
        }
        return nodes
    }

    /** 哪些角色参与分组。工具气泡只含工具/思考；user/assistant 是对话内容。 */
    fun isGroupable(role: String): Boolean = role == "tool"

    /**
     * 组的稳定键：由**首尾成员 id** 拼成。
     *
     * 为什么不用「组在列表中的序号」：列表会因历史裁剪、消息删除、
     * 新回合到来而重新分组 —— 用序号会让「第 3 组」在插入了新回合后
     * 指到别处，折叠态错乱。用成员 id 则无论列表怎么变，
     * 只要组还在、键就稳定。
     *
     * 用首尾 id 而非全部 id：全部 id 拼接的键会随组内新增成员而变化
     * （工具气泡是边跑边加的），导致「跑着跑着折回去」。首尾 id 中，
     * 首 id 固定、尾 id 只在组尾追加时变 —— 结合下面的 [collapseKeyFor]
     * 只认首 id，可彻底避免。
     */
    fun groupKeyOf(items: List<Item>, indices: List<Int>): String {
        if (indices.isEmpty()) return ""
        // 单一实现来源：折叠键一律由 collapseKeyFor 生成，
        // 调用方点击折叠时也走它 —— 两处算法不一致会导致
        // 「折叠状态存进去读不出来」
        return collapseKeyFor(items[indices.first()].id)
    }

    /**
     * 折叠态持久化用的键：只取组首成员 id。
     *
     * 这是 [groupKeyOf] 的实际实现，单独暴露是为了让调用方（Activity）
     * 在用户点击折叠时能算出同一个键 —— 若两处算法不一致，
     * 折叠状态会「存进去读不出来」。
     */
    fun collapseKeyFor(firstMemberId: String): String = "g:$firstMemberId"

    /** 组头文案，如「本轮活动（12 项）」。 */
    fun groupLabel(count: Int): String = "本轮活动（$count 项）"
}
