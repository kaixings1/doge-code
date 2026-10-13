package com.dogecode.mobile

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * 敏感操作的**事中确认协调器**：把 [ApprovalGate] 的纯逻辑（TTL/去重）
 * 与「向用户弹出确认」的实际交互接起来，并解决**跨线程等待**问题。
 *
 * ## 为什么需要跨线程
 *
 * 工具在 `LocalAgentBackend` 的单线程 worker（"local-agent"）上执行，
 * 但确认弹窗必须发生在 **UI 线程**（Activity 前台）。worker 必须**阻塞**
 * 等用户点完才能决定放行还是拒绝 —— 否则模型会拿到"已执行"的假象。
 * 这里用 [CountDownLatch] 把异步的 UI 结果同步回 worker。
 *
 * ## 测试友好（沿用本工程约定）
 *
 * 与 Android 的交互抽成 [Prompt] 接口（注入）。单测传一个**立即返回**
 * 的假 Prompt，就能在 JVM 里验证：命中 TTL 时不弹、未命中才弹、
 * 拒绝返回 false、超时按拒绝处理 —— 全程零 Context。
 *
 * ## 判据实测（避免守卫恒真的坑）
 *
 * `request` 的命中分支与未命中分支必须真实区分：批准一次后立即再请求
 * 同动作应**不弹**（prompt 调用计数不增），不同动作应**弹**。单测用
 * 调用计数证明，而非只看返回值。
 */
class ApprovalCoordinator(
    /** 真正与用户交互的实现。生产为设备凭据确认；测试为立即返回的假实现。 */
    private val prompt: Prompt,
    /** 等待用户确认的最长时间（秒）。超时按「拒绝」处理，避免 worker 永久挂起。 */
    private val waitSeconds: Long = 120,
    /** 时钟注入，便于单测控制 TTL。 */
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    /**
     * 与用户交互的接缝。
     *
     * @param action 要确认的动作字面量（完整命令）
     * @param onResult 用户决定：true=批准，false=拒绝/取消
     * @return 是否成功把请求送出去（false 表示无法弹窗，如不在前台）
     */
    fun interface Prompt {
        fun ask(action: String, onResult: (Boolean) -> Unit): Boolean
    }

    /** 已批准的 action-key → 过期时间戳。所有访问经 [lock] 串行化。 */
    private val held = LinkedHashMap<String, Long>()
    private val lock = Any()

    /**
     * 请求执行 [action] 的批准。**阻塞**直到用户决定或超时。
     *
     * @return true 表示已获批准（含命中缓存），false 表示拒绝/超时/无法询问
     */
    fun request(action: String): Boolean {
        val now = clock()
        synchronized(lock) {
            if (!ApprovalGate.shouldAsk(action, held, now)) return true
        }

        // 需要询问：把 UI 结果同步回本线程
        val latch = CountDownLatch(1)
        val result = AtomicReference(false)
        val delivered = prompt.ask(action) { approved ->
            result.set(approved)
            latch.countDown()
        }
        if (!delivered) return false          // 无法弹窗（如不在前台）→ 保守拒绝

        val ok = try {
            latch.await(waitSeconds, TimeUnit.SECONDS)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            false
        }
        if (!ok) return false                 // 超时 → 拒绝

        val approved = result.get()
        if (approved) {
            synchronized(lock) {
                val updated = ApprovalGate.grant(held, action, clock())
                held.clear()
                held.putAll(updated)
            }
        }
        return approved
    }

    /** 清空所有已批准缓存（如切换工作区/会话时调用，避免跨上下文复用批准）。 */
    fun reset() {
        synchronized(lock) { held.clear() }
    }
}
