package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

/**
 * [ApprovalCoordinator] 单测：验证「弹/不弹」分支真能区分、
 * 跨线程等待正确、超时按拒绝、拒不给缓存。
 *
 * 全部用即时返回的假 [ApprovalCoordinator.Prompt]，零 Android 依赖。
 */
class ApprovalCoordinatorTest {

    private var now = 1_000_000L

    /** 立即批准、并记录被调用次数的假 Prompt。 */
    private fun approvingPrompt(counter: AtomicInteger) =
        ApprovalCoordinator.Prompt { _, onResult ->
            counter.incrementAndGet()
            onResult(true)
            true
        }

    private fun rejectingPrompt(counter: AtomicInteger) =
        ApprovalCoordinator.Prompt { _, onResult ->
            counter.incrementAndGet()
            onResult(false)
            true
        }

    private fun coord(prompt: ApprovalCoordinator.Prompt) =
        ApprovalCoordinator(prompt = prompt, clock = { now })

    // ── 基本批准/拒绝 ──

    @Test
    fun `批准后返回 true`() {
        val c = AtomicInteger()
        assertTrue(coord(approvingPrompt(c)).request("git status"))
        assertEquals(1, c.get())
    }

    @Test
    fun `拒绝后返回 false`() {
        val c = AtomicInteger()
        assertFalse(coord(rejectingPrompt(c)).request("git status"))
        assertEquals(1, c.get())
    }

    // ── TTL 命中：真区分弹/不弹（核心判据） ──

    @Test
    fun `批准后同动作不再弹`() {
        val c = AtomicInteger()
        val co = coord(approvingPrompt(c))
        assertTrue(co.request("git push origin main"))
        assertTrue("第二次应命中 TTL，直接放行", co.request("git push origin main"))
        assertEquals("Prompt 只应被调用一次", 1, c.get())
    }

    @Test
    fun `批准后不同动作仍弹`() {
        val c = AtomicInteger()
        val co = coord(approvingPrompt(c))
        co.request("git status")
        co.request("git push origin main")
        assertEquals("不同动作各弹一次", 2, c.get())
    }

    @Test
    fun `TTL 过期后同动作重弹`() {
        val c = AtomicInteger()
        val co = coord(approvingPrompt(c))
        co.request("git status")
        now += (ApprovalGate.TTL_SECONDS + 1) * 1000L
        co.request("git status")
        assertEquals("过期后应再次弹窗", 2, c.get())
    }

    @Test
    fun `拒绝不产生缓存`() {
        val c = AtomicInteger()
        val co = coord(rejectingPrompt(c))
        assertFalse(co.request("rm x"))
        assertFalse("再次请求仍应弹（拒绝不缓存）", co.request("rm x"))
        assertEquals(2, c.get())
    }

    // ── 边界：无法弹窗 / 超时 ──

    @Test
    fun `Prompt 报告无法送达时保守拒绝`() {
        val noDelivery = ApprovalCoordinator.Prompt { _, _ -> false }
        assertFalse("无法弹窗应拒绝而非放行", coord(noDelivery).request("cmd"))
    }

    @Test
    fun `超时按拒绝处理`() {
        // Prompt 永不回调 → 协调器应超时返回 false
        val never = ApprovalCoordinator.Prompt { _, _ -> true }
        val co = ApprovalCoordinator(prompt = never, waitSeconds = 1, clock = { now })
        val start = System.currentTimeMillis()
        assertFalse(co.request("cmd"))
        val elapsed = System.currentTimeMillis() - start
        assertTrue("应等待约 1 秒，实际 ${elapsed}ms", elapsed >= 900)
    }

    @Test
    fun `reset 清空缓存后重弹`() {
        val c = AtomicInteger()
        val co = coord(approvingPrompt(c))
        co.request("git status")
        co.reset()
        co.request("git status")
        assertEquals("reset 后应重弹", 2, c.get())
    }

    // ── 跨线程：UI 线程异步回调，worker 阻塞等待 ──

    @Test
    fun `异步回调能被阻塞线程等到`() {
        val prompt = ApprovalCoordinator.Prompt { _, onResult ->
            Thread {
                Thread.sleep(100)
                onResult(true)
            }.start()
            true
        }
        val co = ApprovalCoordinator(prompt = prompt, clock = { now })
        assertTrue("应等到异步回调的结果", co.request("cmd"))
    }
}
