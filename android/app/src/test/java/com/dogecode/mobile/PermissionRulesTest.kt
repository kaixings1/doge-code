package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 逐条授权规则的核心逻辑测试。
 *
 * 直接调用生产代码 PermissionRules.decide / normalizePolicy / getPolicy /
 * setPolicy / allRules —— 不是复刻。理由是实测出来的（见 PermissionQueueTest
 * 的注释）：复刻型测试在生产代码变异时不会失败，等于没测。
 *
 * 为什么这段逻辑重要：它是「自动裁决」的唯一来源。decide 写错会让
 * always_deny 被当成 allow 放行，或反过来让 always_allow 仍弹窗打断用户。
 * 那正是用户要求「逐条管理」要解决的问题，回归测试必须锁死。
 *
 * 持久化用 Robolectric 太重，这里用 SharedPreferences 的真实实现需要
 * Context。本文件只测**纯逻辑**（decide / normalizePolicy），持久化方法
 * 走 androidTest 或手工验证。纯函数不依赖 Android，可在 JVM 单测里直接跑。
 */
class PermissionRulesTest {

    // ── normalizePolicy ──

    @Test
    fun `合法策略原样返回`() {
        assertEquals(
            PermissionRules.POLICY_ALWAYS_ALLOW,
            PermissionRules.normalizePolicy(PermissionRules.POLICY_ALWAYS_ALLOW),
        )
        assertEquals(
            PermissionRules.POLICY_ALWAYS_DENY,
            PermissionRules.normalizePolicy(PermissionRules.POLICY_ALWAYS_DENY),
        )
        assertEquals(
            PermissionRules.POLICY_ASK,
            PermissionRules.normalizePolicy(PermissionRules.POLICY_ASK),
        )
    }

    @Test
    fun `非法策略回落 ask`() {
        assertEquals(PermissionRules.POLICY_ASK, PermissionRules.normalizePolicy("allow"))
        assertEquals(PermissionRules.POLICY_ASK, PermissionRules.normalizePolicy("ALWAYS_ALLOW"))
        assertEquals(PermissionRules.POLICY_ASK, PermissionRules.normalizePolicy(""))
        assertEquals(PermissionRules.POLICY_ASK, PermissionRules.normalizePolicy(null))
        assertEquals(PermissionRules.POLICY_ASK, PermissionRules.normalizePolicy("deny_forever"))
    }

    // ── decide（自动裁决的纯逻辑核心）──

    @Test
    fun `always_allow 裁决为 allow`() {
        assertEquals("allow", PermissionRules.decide(PermissionRules.POLICY_ALWAYS_ALLOW))
    }

    @Test
    fun `always_deny 裁决为 deny`() {
        assertEquals("deny", PermissionRules.decide(PermissionRules.POLICY_ALWAYS_DENY))
    }

    @Test
    fun `ask 返回 null 表示仍需问用户`() {
        assertNull(PermissionRules.decide(PermissionRules.POLICY_ASK))
    }

    @Test
    fun `无规则（null）返回 null 走弹窗`() {
        assertNull(PermissionRules.decide(null))
    }

    @Test
    fun `非法规则值回落为 null 而非放行`() {
        // 关键安全语义：误写的规则绝不悄悄放行，必须回落到「询问」。
        assertNull(PermissionRules.decide("allow"))
        assertNull(PermissionRules.decide("garbage"))
    }

    @Test
    fun `requestBehavior 参数预留不影响结果`() {
        // 当前实现忽略该参数，但签名保留。验证其存在不破坏语义。
        assertEquals("allow", PermissionRules.decide(PermissionRules.POLICY_ALWAYS_ALLOW, "deny"))
        assertEquals("deny", PermissionRules.decide(PermissionRules.POLICY_ALWAYS_DENY, "allow"))
    }

    // ── KNOWN_TOOL_NAMES 约束 ──

    @Test
    fun `已知工具列表非空且含常见工具`() {
        val names = PermissionRules.KNOWN_TOOL_NAMES
        assert(names.contains("Bash"))
        assert(names.contains("Read"))
        assert(names.contains("Edit"))
        assert(names.contains("Write"))
        assert(names.contains("Glob"))
        assert(names.contains("Grep"))
    }
}
