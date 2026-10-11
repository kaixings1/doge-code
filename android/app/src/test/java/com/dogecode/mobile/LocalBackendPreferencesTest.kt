package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * `LocalAgentBackend` 的偏好接线契约测试（M3）。
 *
 * ## 要钉死的两件事
 *
 * 1. **`maxSteps` 真的传给了 `AgentLoop`** —— 否则调低轮数不生效，
 *    用户以为省了费其实没省。
 * 2. **温度真的覆盖了 cfg** —— 选了「精准 0」却仍用服务端默认 0.7，
 *    输出会跟期望完全不一样。
 *
 * 两条都是**静默错误**（不报错，只是行为不对），故必须靠测试验证。
 *
 * 同步策略：等 [MemStore.savedLatch]。`runTurn` 末尾的 `historyStore.save`
 * 是该 round 最后一步，countDown 后主线程读 `captured` 才有可见性保证。
 */
class LocalBackendPreferencesTest {

    private val workspace = File.createTempFile("work", "").apply {
        delete()
        mkdirs()
    }

    private fun validCfg(temp: Double? = null) = ProviderConfig(
        apiKey = "k",
        baseURL = "https://example.com/v1",
        model = "m",
        temperature = temp,
    )

    @Test
    fun `maxSteps=1 让循环立刻被截断（与默认值隔离）`() {
        val mem = MemStore()
        // 注意断言的是「模型被调用几次」而非「收到几条消息」——
        // `msgs` 是消息数组（含 system+user），用列表 size 会数错
        val calls = intArrayOf(0)
        val b = LocalAgentBackend(
            workspace = workspace,
            configProvider = { validCfg() },
            historyStore = mem,
            localPrefs = object : LocalAgentBackend.LocalPrefsReader {
                override fun maxSteps() = 1
                override fun temperature() = null
            },
            modelCallOverride = { _, _, _ ->
                calls[0]++
                ChatResult(
                    text = "",
                    toolCalls = listOf(ToolCall("c1", "noop", "{}")),
                    finishReason = "tool_calls",
                )
            },
        )

        val ok = b.send("hi", "req-1")
        assertTrue(ok)
        if (!mem.savedLatch.await(3, TimeUnit.SECONDS)) {
            b.close()
            error("超时：runTurn 未完成")
        }
        b.close()

        assertEquals("maxSteps=1 必须只调一次模型（第二轮开始即被截断）", 1, calls[0])
    }

    @Test
    fun `不传 prefs 仍能正常构造与 send（DEFAULT 兜底）`() {
        val mem = MemStore()
        val called = intArrayOf(0)
        val errs = mutableListOf<String>()
        val b = LocalAgentBackend(
            workspace = workspace,
            configProvider = { validCfg() },
            historyStore = mem,
            modelCallOverride = { _, _, _ ->
                called[0]++
                ChatResult("hi", emptyList(), "stop")
            },
        )
        b.onEvent = { ev -> if (ev is BridgeClient.Event.Error) errs.add(ev.message) }
        val sent = b.send("hi", "req-1")
        if (!mem.savedLatch.await(3, TimeUnit.SECONDS)) {
            b.close()
            error("超时：runTurn 未完成；send=$sent, called=${called[0]}, errs=$errs")
        }
        b.close()
        assertTrue("DEFAULT 应能正常工作（不传 prefs）", called[0] >= 1)
    }

    @Test
    fun `温度 null 不会让 cfg 的 temperature 字段变成 0（默认行为保持）`() {
        // M3 的核心约束：升级用户不该感知到行为变化
        val mem = MemStore()
        val captured = mutableListOf<ProviderConfig>()
        val b = LocalAgentBackend(
            workspace = workspace,
            configProvider = { validCfg(temp = null) },
            historyStore = mem,
            localPrefs = object : LocalAgentBackend.LocalPrefsReader {
                override fun maxSteps() = 25
                override fun temperature() = null
            },
            modelCallOverride = { cfg, _, _ ->
                captured.add(cfg)
                ChatResult("hi", emptyList(), "stop")
            },
        )
        b.send("hi", "req-1")
        if (!mem.savedLatch.await(3, TimeUnit.SECONDS)) {
            b.close()
            error("超时：runTurn 未完成")
        }
        b.close()

        assertEquals(1, captured.size)
        assertNull(
            "温度=null 时 cfg.temperature 必须保持 null，绝不能变成 0（那会让所有回复变僵）",
            captured[0].temperature,
        )
    }

    @Test
    fun `温度非 null 真的覆盖 cfg 的 temperature 字段（让用户改完立即生效）`() {
        val mem = MemStore()
        val captured = mutableListOf<ProviderConfig>()
        val b = LocalAgentBackend(
            workspace = workspace,
            configProvider = { validCfg(temp = 0.7) },
            historyStore = mem,
            localPrefs = object : LocalAgentBackend.LocalPrefsReader {
                override fun maxSteps() = 25
                override fun temperature() = 0.0
            },
            modelCallOverride = { cfg, _, _ ->
                captured.add(cfg)
                ChatResult("hi", emptyList(), "stop")
            },
        )
        b.send("hi", "req-1")
        if (!mem.savedLatch.await(3, TimeUnit.SECONDS)) {
            b.close()
            error("超时：runTurn 未完成")
        }
        b.close()

        assertEquals(1, captured.size)
        assertEquals(
            "localPrefs 的 0.0 必须覆盖 cfg 原有的 0.7",
            0.0, captured[0].temperature!!,
            0.0,
        )
    }

    /** 内存版历史存储（save 时 countDown 通知主线程）。 */
    private class MemStore(initial: List<ChatMsg> = emptyList()) : LocalAgentBackend.HistoryStore {
        var loaded = initial
        val savedLatch = CountDownLatch(1)
        override fun load(): List<ChatMsg> = loaded
        override fun save(messages: List<ChatMsg>) {
            loaded = messages.toList()
            savedLatch.countDown()
        }
    }
}
