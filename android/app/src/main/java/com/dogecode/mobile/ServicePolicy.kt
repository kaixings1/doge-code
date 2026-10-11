package com.dogecode.mobile

/**
 * 前台服务的启动/停止判定（纯逻辑，可单测）。
 *
 * ## 为什么本地模式需要前台服务
 *
 * 本地模式的推理循环（`AgentLoop`）在后台线程跑，可达数十秒甚至更久
 * （多轮工具调用）。Android 对后台应用有两个杀伤机制：
 * - App 切后台后进程优先级下降，内存紧张时被系统回收
 * - API 28+ 对后台执行网络密集型任务有额外限制
 *
 * 一旦进程被杀，正在跑的推理直接消失 —— 用户回来看到的是一片空白，
 * 且已消耗的 API 费用白花。前台服务（通知常驻）把进程优先级抬到
 * 前台级别，是 Android 唯一官方推荐的「长任务保活」手段。
 *
 * ## 为什么远端模式不需要
 *
 * 远端模式下推理跑在**电脑的 CLI 进程**里，手机只是显示端 ——
 * 手机进程被杀不影响任务继续跑，重连后还能看到完整历史。
 * 给远端模式也挂前台服务只会浪费电量和通知栏空间。
 *
 * ## 判据设计
 *
 * 判据必须基于**可观察的回合状态**（start/end 已在 MainActivity 中
 * 成对调用），而不是「worker 是否在跑」—— 后者藏在 LocalAgentBackend
 * 内部，UI 无法可靠感知（本地模式发生异常时 emit(Error) 也不保证成对）。
 */
object ServicePolicy {

    /**
     * 回合是否应该使前台服务保持运行。
     *
     * @param mode    当前工作模式
     * @param inTurn  是否处于回合中（startTurn 与 endTurn 之间）
     */
    fun shouldRun(mode: AppMode, inTurn: Boolean): Boolean =
        mode.isCloudAgent && inTurn

    /**
     * 通知文案：回合中显示「正在处理」，让用户知道为什么通知常驻。
     * （通知本身不带操作按钮：中断入口在 App 内的中断按钮上，
     *  通知栏再放一个「停止」徒增复杂度，且误触代价高——中断不可撤销。）
     */
    fun notifyText(inTurn: Boolean): String =
        if (inTurn) "正在云端处理任务…（可切后台，处理完成后通知你）"
        else "云端模式就绪"

    /**
     * 通知渠道 id。独立于回复/权限渠道：保活通知是**常驻**的，
     * 与「一次一条」的提醒通知性质不同，用户应能单独关闭它
     * （关闭后服务仍工作，只是不可见——Android 允许）。
     */
    const val CHANNEL_ID = "doge_local_service"
}
