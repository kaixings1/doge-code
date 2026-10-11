package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * `LocalAgentBackend` 的历史持久化契约测试（M1）。
 *
 * ## 为什么必须测（而不是靠 agentLoop 的既有测试）
 *
 * M1 修的是「本地模式历史只活在进程里、重开即失忆」。既有 `AgentLoopTest`
 * 只验证循环逻辑，完全覆盖不到「历史是否落盘」—— 这正是缺陷长期存在的原因。
 *
 * 本测试注入内存 [LocalAgentBackend.HistoryStore]，验证：
 * 1. 启动时从 store **恢复**历史（否则「重开失忆」没修好）
 * 2. 每轮结束后**落盘**（否则「重开失忆」仍存在）
 * 3. `editMessage` 回退后落盘（否则重开看到旧版）
 *
 * ## 为什么用假 ProviderClient 而非真 HTTP
 *
 * 需求是验证「持久化的时机与内容」，不是 HTTP。故把模型调用替换为
 * 一个即时返回的假实现 —— 通过 `MAX_STEPS` 之外的注入点无法替换
 * `providerClient`，故这里改为验证**可观察的结果**：事件序列 + store 内容。
 *
 * 局限：需要真实网络的部分（chatFn）在此不可注入，故本测试只覆盖
 * 「配置不可用 → 不发请求」与「store 初始恢复」两条路径；落盘时机由
 * [LocalHistoryCodecTest] + 下方 store 契约用例联合覆盖。
 */
class LocalBackendHistoryTest {

    /** 内存版历史存储（记录 save 被调用了几次、最后一次的内容）。 */
    private class MemStore(initial: List<ChatMsg> = emptyList()) : LocalAgentBackend.HistoryStore {
        var loaded = initial
        var saveCount = 0
        var lastSaved: List<ChatMsg>? = null
        val latch = CountDownLatch(1)

        override fun load(): List<ChatMsg> = loaded

        override fun save(messages: List<ChatMsg>) {
            saveCount++
            lastSaved = messages.toList()
            loaded = messages.toList()
            latch.countDown()
        }
    }

    private val workspace = File.createTempFile("work", "").apply {
        delete()
        mkdirs()
    }

    private fun backend(
        store: LocalAgentBackend.HistoryStore,
        cfg: ProviderConfig = ProviderConfig(),
    ) = LocalAgentBackend(
        workspace = workspace,
        configProvider = { cfg },
        historyStore = store,
    )

    @Test
    fun `未配置 Provider 时发送被拒绝且不落盘（无效轮次不该污染历史）`() {
        val mem = MemStore()
        val b = backend(mem) // ProviderConfig() 默认 apiKey 为空 → isUsable == false

        var sawError = false
        b.onEvent = { ev -> if (ev is BridgeClient.Event.Error) sawError = true }

        val accepted = b.send("hi", "req-1")
        assertTrue("未配置时 send 应返回 false", !accepted)
        assertTrue("应发出 Error 事件（而非静默失败）", sawError)
        assertEquals("无效轮次不该落盘", 0, mem.saveCount)
        b.close()
    }

    @Test
    fun `HistoryStore 默认值是 no-op（不传也能构造）`() {
        // 保证调用点忘传时不会 NPE —— 契约的一部分
        val b = LocalAgentBackend(
            workspace = workspace,
            configProvider = { ProviderConfig() },
        )
        assertNotNull(b)
        assertEquals(false, b.isReady)
        b.close()
    }

    @Test
    fun `初始历史从 store 恢复（重开不失忆的关键）`() {
        val prior = listOf(
            ChatMsg.user("上次说的话"),
            ChatMsg.assistant("上次的回复"),
        )
        val mem = MemStore(prior)
        val b = backend(mem)

        // 通过 editMessage 触发「读历史」路径：它会回退到最后一条 user 之前
        // 并落盘 —— 落盘内容即「恢复后的历史去掉了最后一条 user」
        b.editMessage("换成这句", "req-2")
        // editMessage 会落盘（同步，不依赖网络）
        assertTrue("editMessage 应立即落盘", mem.saveCount >= 1)
        // 恢复的历史被回退到「最后一条 user 之前」→ 只剩首条 assistant？
        // 实际：prior = [user, assistant]，lastUser 索引 0，移除它之后 → []
        assertEquals("回退后应只剩 user 之前的内容（此处为空）", 0, mem.lastSaved?.size ?: -1)
        b.close()
    }

    @Test
    fun `editMessage 回退并落盘（否则重开会看到旧版）`() {
        val mem = MemStore(
            listOf(
                ChatMsg.user("第一轮"),
                ChatMsg.assistant("第一轮回复"),
                ChatMsg.user("第二轮"),
            ),
        )
        val b = backend(mem)
        b.editMessage("第二轮改后", "req-3")

        // 回退到最后一条 user 之前 → 保留 [user 第一轮, assistant 第一轮回复]
        val saved = mem.lastSaved
        assertNotNull("editMessage 必须落盘", saved)
        assertEquals(2, saved!!.size)
        assertEquals("第一轮", saved[0].content)
        assertEquals("第一轮回复", saved[1].content)
        b.close()
    }

    @Test
    fun `close 后再 send 不抛异常`() {
        val mem = MemStore()
        val b = backend(mem)
        b.close()
        // 关闭后 worker 已 shutdownNow，send 的 execute 会抛 RejectedExecutionException
        // 该异常不应外泄到调用方（UI 线程）
        val ok = runCatching { b.send("hi", "req-4") }
        assertTrue("close 后 send 不应抛异常：${ok.exceptionOrNull()}", ok.isSuccess)
    }
}
