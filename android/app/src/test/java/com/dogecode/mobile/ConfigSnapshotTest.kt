package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 服务端当前配置的解析测试。
 *
 * 这段决定设置页显示「当前是什么」。**显示错比不显示更糟** ——
 * 用户会据此判断「我刚才那次修改生效了吗」，若显示的是编造的默认值，
 * 用户会以为改成功了（或没成功），而实际相反。
 *
 * 因此核心判据是：**缺字段必须返回 null（界面显示「—」），
 * 而不是编造一个默认值**。
 *
 * 变异验证：把 `takeIf { it.isNotBlank() }` 去掉改成直接返回空串，
 * 「model 为空时不编造值」用例会失败（空串会被当成有效值渲染成空白行）。
 */
class ConfigSnapshotTest {

    @Test
    fun `完整 config 正常解析`() {
        val json = """
            {"sessionId":"x","port":5680,
             "config":{"model":"claude-sonnet-4-6","thinkingTokens":4096,"permissionMode":"plan"}}
        """.trimIndent()
        val c = SessionScanner.configFrom(json)!!
        assertEquals("claude-sonnet-4-6", c.model)
        assertEquals(4096, c.thinkingTokens)
        assertEquals("plan", c.permissionMode)
    }

    @Test
    fun `缺 config 字段返回 null（显示「—」而非编造值）`() {
        // 老服务端不带 config。编造默认值会让用户以为「当前就是默认」，
        // 而实际可能不是 —— 显示「—」才是诚实的
        assertNull(SessionScanner.configFrom("""{"sessionId":"x","port":5680}"""))
    }

    @Test
    fun `缺单项时该单项为 null`() {
        val json = """{"config":{"model":"sonnet"}}"""
        val c = SessionScanner.configFrom(json)!!
        assertEquals("sonnet", c.model)
        assertNull("缺 thinkingTokens 应为 null 而非 0", c.thinkingTokens)
        assertNull("缺 permissionMode 应为 null", c.permissionMode)
    }

    @Test
    fun `model 为空串时视为未知`() {
        val c = SessionScanner.configFrom("""{"config":{"model":""}}""")!!
        assertNull(c.model)
    }

    @Test
    fun `thinkingTokens 为 0 是有效值（表示关闭）`() {
        // 关键区别：0 是「明确关闭思考」，与「未知（null）」不同。
        // 若把 0 也当未知，用户关掉思考后会看到「—」，以为没生效
        val c = SessionScanner.configFrom("""{"config":{"thinkingTokens":0}}""")!!
        assertEquals(0, c.thinkingTokens)
    }

    @Test
    fun `非法 JSON 返回 null 而非崩`() {
        assertNull(SessionScanner.configFrom("not json"))
        assertNull(SessionScanner.configFrom(""))
        assertNull(SessionScanner.configFrom(null))
    }

    @Test
    fun `config 非对象时返回 null`() {
        assertNull(SessionScanner.configFrom("""{"config":"str"}"""))
        assertNull(SessionScanner.configFrom("""{"config":[]}"""))
    }

    @Test
    fun `不影响 session-info 的其它字段解析`() {
        // 回归：config 解析是新加的，不该影响既有的 label/port 解析
        val json = """
            {"sessionId":"s1","port":5681,"label":"修CI","cwd":"D:\\x",
             "config":{"model":"opus"}}
        """.trimIndent()
        val s = SessionScanner.parseSessionInfo(json, 5681)
        assertEquals("修CI", s?.label)
        assertEquals(5681, s?.port)
        assertEquals("opus", SessionScanner.configFrom(json)?.model)
    }

    // ── verbose 布尔项 ──

    @Test
    fun `verbose 为 true 时解析为 true`() {
        val c = SessionScanner.configFrom("""{"config":{"verbose":true}}""")!!
        assertEquals(true, c.verbose)
    }

    @Test
    fun `verbose 为 false 时解析为 false 而非 null`() {
        // 关键：「服务端说当前是关」与「服务端没说这个字段」是两回事。
        // 用 optBoolean 会把二者都读成 false，界面就无法区分
        // 「支持但关闭」与「不支持（老服务端）」。
        val c = SessionScanner.configFrom("""{"config":{"verbose":false}}""")!!
        assertEquals(false, c.verbose)
    }

    @Test
    fun `缺 verbose 字段时为 null（界面不显示该开关）`() {
        val c = SessionScanner.configFrom("""{"config":{"model":"opus"}}""")!!
        assertNull("缺字段必须是 null，不能编造 false", c.verbose)
    }
}
