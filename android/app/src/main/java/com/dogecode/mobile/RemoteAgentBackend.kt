package com.dogecode.mobile

/**
 * 远端模式的 [AgentBackend] 实现：包一层现有 [BridgeClient]。
 *
 * ## 为什么用适配器而不是让 BridgeClient 直接实现接口
 *
 * [BridgeClient] 的 `onEvent` 是**构造参数**（不可变），而接口要求
 * `var onEvent`（可后设）。要让它直接实现接口，就得：
 * · 把构造参数改成可变属性 → 动到 BridgeClient 的构造签名
 * · 进而改它全部调用点与现有测试
 *
 * 而适配器是**零侵入**的：BridgeClient 一行不改、测试全绿，
 * 只是多了一个薄壳把事件转发出来。
 *
 * 代价是多一个类、事件多绕一层（一次函数调用，可忽略）。
 * 在「改动风险」与「一个薄壳」之间，选薄壳 —— 尤其因为
 * BridgeClient 是当前**唯一能用的**后端，不能为了架构美观而动它。
 */
class RemoteAgentBackend(
    private val client: BridgeClient,
) : AgentBackend {

    /**
     * 底层 [BridgeClient]（远端专属能力出口）。
     *
     * 为什么要暴露：setConfig / renameSession / sendPermissionResponse /
     * lastDiagnosis / clearDiagnosis 是**远端专属**能力，不在 [AgentBackend]
     * 接口里（见接口注释：塞进去会让云端实现只能写空方法）。
     * 宿主需要这些能力时，通过本属性拿到「活动会话的那条 client」。
     */
    val bridge: BridgeClient
        get() = client

    override val isReady: Boolean
        get() = client.isConnected

    override var onEvent: ((BridgeClient.Event) -> Unit)? = null

    init {
        // BridgeClient 在构造时就固定了回调；这里只能把「外部设置的
        // onEvent」桥接进去 —— 前提是创建 BridgeClient 时把回调指向本类。
        // 为避免时序问题，由工厂方法 [create] 保证这一点（见下）。
    }

    override fun send(text: String, requestId: String): Boolean =
        client.sendMessage(text, requestId)

    override fun sendWithImages(
        text: String,
        images: List<Pair<String, String>>,
        requestId: String,
    ): Boolean = client.sendMessageWithImages(text, images, requestId)

    override fun interrupt() = client.sendInterrupt()

    override fun editMessage(newText: String, requestId: String): Boolean =
        client.editMessage(newText, requestId)

    override fun close() = client.close()

    companion object {
        /**
         * 工厂：创建「回调已正确接好」的实例。
         *
         * 用工厂而非构造参数，是为了规避「先有鸡还是先有蛋」——
         * BridgeClient 需要回调才能构造，而回调要转发到本类的 onEvent，
         * 而本类的实例要等 BridgeClient 构造完才有。用一个中转 lambda
         * 承接：BridgeClient 构造时拿到的是「查当前 onEvent 再转发」的
         * 闭包，之后外部随时可换 onEvent，转发依然正确。
         */
        fun create(
            onDiagnosis: ((reason: String, httpCode: Int?, address: String) -> Unit)? = null,
        ): RemoteAgentBackend {
            lateinit var backend: RemoteAgentBackend
            val client = BridgeClient(
                onEvent = { ev -> backend.onEvent?.invoke(ev) },
                onDiagnosis = onDiagnosis,
            )
            backend = RemoteAgentBackend(client)
            return backend
        }
    }
}
