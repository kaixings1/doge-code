package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [ApprovalGate] 纯逻辑单测。
 *
 * 覆盖三件事：actionKey 归一化、shouldAsk 的**真区分**（非恒真/恒假）、
 * grant 的 TTL 与淘汰。判据用例刻意成对出现（应问 / 不应问），
 * 这样若某天把判据写反，必有至少一条失败。
 */
class ApprovalGateTest {

    private val t0 = 1_000_000L

    // ── actionKey 归一化 ──

    @Test
    fun `actionKey 折叠连续空白`() {
        assertEquals("ls -la", ApprovalGate.actionKey("  ls   -la  "))
        assertEquals("git status", ApprovalGate.actionKey("git\t status"))
    }

    @Test
    fun `actionKey 空串与 null 都归一为空`() {
        assertEquals("", ApprovalGate.actionKey(""))
        assertEquals("", ApprovalGate.actionKey("   "))
        assertEquals("", ApprovalGate.actionKey(null))
    }

    // ── shouldAsk：真区分两种分支 ──

    @Test
    fun `从未批准应询问`() {
        // 分支 A：held 为空 → 必须问
        assertTrue(ApprovalGate.shouldAsk("git push origin main", emptyMap(), t0))
    }

    @Test
    fun `已批准且未到期不问`() {
        // 分支 B：刚批准 → 不该问
        val held = ApprovalGate.grant(emptyMap(), "git push origin main", t0)
        assertFalse(ApprovalGate.shouldAsk("git push origin main", held, t0))
    }

    @Test
    fun `批准到期后应再问`() {
        // 分支 C：过了 TTL → 又要问。与分支 B 成对，证明判据非恒假。
        val held = ApprovalGate.grant(emptyMap(), "git push origin main", t0, ttlSeconds = 180)
        val after = t0 + 181_000L
        assertTrue(ApprovalGate.shouldAsk("git push origin main", held, after))
    }

    @Test
    fun `到期边界时刻应再问`() {
        // nowMs == until（等于）视为过期 —— 与实现 `nowMs >= until` 一致
        val held = ApprovalGate.grant(emptyMap(), "cmd", t0, ttlSeconds = 100)
        assertTrue(ApprovalGate.shouldAsk("cmd", held, t0 + 100_000L))
        // 前一毫秒仍有效，保证边界是「点」而非区间错位
        assertFalse(ApprovalGate.shouldAsk("cmd", held, t0 + 99_999L))
    }

    @Test
    fun `空白差异命中同一条批准`() {
        // 归一化生效：批准时用宽空格，询问时用单空格，应命中同一 key
        val held = ApprovalGate.grant(emptyMap(), "ls    -la  /sdcard", t0)
        assertFalse(ApprovalGate.shouldAsk("ls -la /sdcard", held, t0))
    }

    @Test
    fun `不同动作互不影响`() {
        // 批准 A 不应放行 B —— 防止把「按 action 确认」退化成「按工具确认」
        val held = ApprovalGate.grant(emptyMap(), "git status", t0)
        assertTrue(ApprovalGate.shouldAsk("git push origin main", held, t0))
    }

    @Test
    fun `空动作一律询问`() {
        assertTrue(ApprovalGate.shouldAsk("   ", emptyMap(), t0))
        val held = ApprovalGate.grant(emptyMap(), "   ", t0)
        assertTrue(ApprovalGate.shouldAsk("", held, t0))
    }

    // ── grant：TTL 与淘汰 ──

    @Test
    fun `grant 不修改入参`() {
        val original = emptyMap<String, Long>()
        ApprovalGate.grant(original, "cmd", t0)
        assertTrue("原 Map 应保持为空（纯函数）", original.isEmpty())
    }

    @Test
    fun `grant 清理已过期条目`() {
        val stale = mapOf("old" to t0 - 1)          // 已过期
        val held = ApprovalGate.grant(stale, "new", t0)
        assertFalse("过期条目应被剔除", held.containsKey("old"))
        assertTrue(held.containsKey("new"))
    }

    @Test
    fun `grant 超上限淘汰最早过期`() {
        // 逐条批准 MAX_HELD+1 条，最早的一条（until 最小）应被淘汰
        var held = emptyMap<String, Long>()
        for (i in 0..ApprovalGate.MAX_HELD) {
            held = ApprovalGate.grant(held, "cmd$i", t0 + i)
        }
        assertEquals("应稳定在 MAX_HELD 条", ApprovalGate.MAX_HELD, held.size)
        assertFalse("最早过期的 cmd0 应被淘汰", held.containsKey("cmd0"))
    }
}
