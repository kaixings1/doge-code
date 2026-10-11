package com.dogecode.mobile

/**
 * 代理后端：UI 与「谁在真正执行任务」之间的唯一接缝。
 *
 * ## 为什么需要这层抽象
 *
 * 客户端要支持两种工作模式：
 * · **远端**：连电脑上的 CLI 桥接（现有 [BridgeClient]）
 * · **本地**：手机自己调 Provider API 跑推理循环（新增）
 *
 * 两者的**传输、配置、能力边界完全不同**，但对 UI 而言，它们提供的
 * 是同一件事：把一段用户输入送出去，然后陆续收到事件。
 * 把这层接缝显式化，UI 就不必区分模式 —— 这也是能**共享全部已完成
 * 的 UI 工作**（工具气泡、回合分组、折叠、语音、搜索）的前提。
 *
 * ## 接口只放「两种模式都有」的能力
 *
 * 刻意**不含**远端专属的 connect / setConfig / renameSession /
 * sendPermissionResponse：本地模式没有「连接」概念（API key 配好即可用）、
 * 没有「远端配置」（配置在本地设置页）、没有「会话重命名」（没有多实例）。
 *
 * 若把它们塞进接口，本地实现只能写一堆空方法或抛异常 —— 那是
 * 「接口比实现大」的典型症状，会让调用方误以为这些能力在所有模式下可用。
 * 远端专属能力由 UI 在 `mode == REMOTE` 分支里直接调 [BridgeClient]。
 *
 * ## 关于事件流
 *
 * 用回调（[onEvent]）而非 Flow/Channel：现有 [BridgeClient] 已是回调风格
 *（`onEvent`），改成 Flow 要动它的线程模型与全部调用点，收益不抵风险。
 * 本地实现同样按回调发事件即可，两条路径在 UI 处汇合。
 */
interface AgentBackend {

    /**
     * 是否处于「可发送」状态。
     *
     * 语义在两模式下略有差异，但**对 UI 的用途一致**：置灰发送按钮、
     * 提示用户为何发不出去。
     * · 远端：WebSocket 是否已连上
     * · 本地：是否已配置好 Provider（key 非空且模型已选）
     */
    val isReady: Boolean

    /** 事件回调（由 UI 在创建后立即设置）。 */
    var onEvent: ((BridgeClient.Event) -> Unit)?

    /**
     * 发送一条用户消息。
     *
     * @param requestId 客户端生成的请求 id。远端模式用它做回声去重
     *   （服务端回推时带回）；本地模式用它关联「哪条消息触发了这轮推理」。
     * @return 是否真的发出去了（false 表示未就绪或发送失败）
     */
    fun send(text: String, requestId: String): Boolean

    /**
     * 发送带图片的消息。
     *
     * 默认实现退化为纯文本发送 —— 本地模式初期不支持图片时不必写空实现，
     * 而远端模式覆写它以带上 base64。
     */
    fun sendWithImages(text: String, images: List<Pair<String, String>>, requestId: String): Boolean =
        send(text, requestId)

    /** 请求中断当前回合。 */
    fun interrupt()

    /** 消息编辑后重新提交（两种模式都有此语义）。 */
    fun editMessage(newText: String, requestId: String): Boolean

    /** 释放资源（连接、线程、后台任务）。 */
    fun close()

    /**
     * 当前会话累计 token 用量（本地模式由 [LocalAgentBackend] /
     * [LocalInferenceBackend] 维护；远端模式无此概念，回落零值）。
     */
    fun sessionUsage(): ChatUsage = ChatUsage(0, 0)

    /** 清零累计用量（随清空对话调用）。 */
    fun resetUsage() {}
}
