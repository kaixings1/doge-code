package com.dogecode.mobile

/**
 * 「回合」状态判据：何时该显示中断按钮与进度条。
 *
 * 抽成纯函数而非留在 MainActivity 里，因为这组判据有两个坑，
 * 都只在特定时序下暴露、真机上极难复现：
 *
 * 1. 非交互模式下消息入队后永远不会有 assistant 回复 —— 若照常开回合，
 *    中断按钮与进度条会永久停留，界面看起来像卡死。
 * 2. 断开后中断已无意义（服务端收不到），但回调顺序上 Disconnected
 *    可能晚于最后一帧 assistant，不显式收起会残留。
 *
 * 两个方向的判据都必须可被变异测试证伪：把任一条件取反，
 * 对应用例应失败。
 */
object TurnState {

    /**
     * 发送成功后是否开启回合。
     *
     * 非交互模式不开：消息只入队、不被消费，assistant 永不到来。
     *
     * @param sendOk     WS 是否真的把报文写出去了
     * @param interactive 服务端 client_connected 带回的交互模式标志
     */
    fun startOnSend(sendOk: Boolean, interactive: Boolean): Boolean = sendOk && interactive

    /**
     * 收到入站消息后是否结束回合。
     *
     * 只认 assistant：system 可能是回合中途的提示，user 是别的设备发的，
     * 二者都不能作为「本回合结束」的信号。
     */
    fun endOnIncoming(role: String): Boolean = role == "assistant"

    /**
     * 判断一条 role="user" 的入站消息，是否是「自己刚发出、被服务端回推」的。
     *
     * 服务端会把 user 消息广播给所有连接设备（多设备同步），自己发的也会被
     * 推回来。若不去重，界面会出现两条相同的用户气泡。
     *
     * 判据是「本地存在文本相同、且仍处于 SENDING 的 user 消息」——该状态从
     * append 到收到 queued 回执之间保持，正好覆盖「回推先于回执到达」这一时序。
     *
     * 为什么不含 QUEUED：queued 回执与消息推送到达顺序不确定，若把已转 QUEUED
     * 的也算进来，之后别人发来相同文本时会被误吞（对方的真实消息消失）。
     *
     * 抽成纯函数的原因：这段判据在真机上极难复现（依赖回推与回执的竞态），
     * 且两个方向的错误（少去重→重复气泡；多去重→吞掉他人消息）都不会抛异常，
     * 只能靠单测锁定。参数刻意用 (text, status, role) 而非 ChatMessage，
     * 以便测试直接覆盖「同文本不同状态」的组合。
     */
    fun isOwnEcho(incomingRole: String, incomingText: String, local: List<EchoCandidate>): Boolean {
        if (incomingRole != "user") return false
        return local.any { it.role == "user" && it.status == "SENDING" && it.text == incomingText }
    }

    /**
     * isOwnEcho 的输入投影：只取判据用到的三个字段。
     * 用字符串 status（而非 ChatMessage.Status 枚举）避免 TurnState 依赖
     * 数据类，从而保持可在纯 JVM 测试中构造。
     */
    data class EchoCandidate(val role: String, val text: String, val status: String)
}
