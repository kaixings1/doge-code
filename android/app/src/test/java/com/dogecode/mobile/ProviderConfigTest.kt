package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Provider 配置的校验与规范化测试（本地模式的入口守卫）。
 *
 * 为什么必须测：这两处错了的表现都是**「配好了却用不了」且看不出原因**：
 * · URL 校验过松 → 半截地址被当成合法，请求时才失败（错误指向网络）
 * · 缺尾斜杠处理 → `.../v1//chat/completions` 双斜杠，部分网关直接 404
 * · 超时夹取缺失 → 用户填 0 会立刻超时、填极大值会永久挂起
 *
 * 变异验证：把 isUrlLike 的 `afterPrefixIsHost` 判断去掉，
 * 「只有协议没主机名的地址不合法」用例失败。
 */
class ProviderConfigTest {

    // ── isUsable ──

    @Test
    fun `有 key 且地址合法时可用`() {
        val c = ProviderConfig(apiKey = "sk-xxx", baseURL = "https://api.openai.com/v1")
        assertTrue(c.isUsable)
    }

    @Test
    fun `缺 key 时不可用`() {
        assertFalse(ProviderConfig(baseURL = "https://api.openai.com/v1").isUsable)
    }

    @Test
    fun `只有空白 key 时不可用`() {
        // 用户可能误敲空格，不能算填了
        assertFalse(ProviderConfig(apiKey = "   ", baseURL = "https://x.com").isUsable)
    }

    @Test
    fun `缺地址时不可用`() {
        assertFalse(ProviderConfig(apiKey = "sk-xxx").isUsable)
    }

    @Test
    fun `未选模型仍算可用（关键取舍）`() {
        // 多数 provider 在 model 空时有默认；若把 model 也计入判据，
        // 填了 key 和地址的用户会看到「未配置」，误以为前两项没生效
        val c = ProviderConfig(apiKey = "sk-xxx", baseURL = "https://x.com/v1", model = "")
        assertTrue(c.isUsable)
    }

    // ── isUrlLike ──

    @Test
    fun `http 与 https 都合法`() {
        assertTrue(ProviderConfig.isUrlLike("http://127.0.0.1:8080/v1"))
        assertTrue(ProviderConfig.isUrlLike("https://api.deepseek.com/v1"))
    }

    @Test
    fun `大小写协议都认`() {
        assertTrue(ProviderConfig.isUrlLike("HTTPS://API.EXAMPLE.COM"))
    }

    @Test
    fun `缺协议不合法`() {
        assertFalse(ProviderConfig.isUrlLike("api.openai.com/v1"))
        assertFalse(ProviderConfig.isUrlLike("//api.openai.com"))
    }

    @Test
    fun `只有协议没主机名不合法`() {
        assertFalse(ProviderConfig.isUrlLike("https://"))
        assertFalse(ProviderConfig.isUrlLike("http://"))
        assertFalse(ProviderConfig.isUrlLike("https:///v1"))
    }

    @Test
    fun `空串与空白不合法`() {
        assertFalse(ProviderConfig.isUrlLike(""))
        assertFalse(ProviderConfig.isUrlLike("   "))
    }

    @Test
    fun `首尾空白被容忍`() {
        assertTrue(ProviderConfig.isUrlLike("  https://x.com  "))
    }

    // ── normalizedBaseURL ──

    @Test
    fun `末尾斜杠被去掉（防双斜杠）`() {
        // 不去掉会拼出 .../v1//chat/completions，部分网关 404 且
        // 错误信息完全不提示是这里的问题
        val c = ProviderConfig(baseURL = "https://x.com/v1/")
        assertEquals("https://x.com/v1", c.normalizedBaseURL)
    }

    @Test
    fun `多个末尾斜杠也去掉`() {
        assertEquals(
            "https://x.com/v1",
            ProviderConfig(baseURL = "https://x.com/v1///").normalizedBaseURL,
        )
    }

    @Test
    fun `无末尾斜杠时不变`() {
        assertEquals(
            "https://x.com/v1",
            ProviderConfig(baseURL = "https://x.com/v1").normalizedBaseURL,
        )
    }

    @Test
    fun `首尾空白被清理`() {
        assertEquals(
            "https://x.com",
            ProviderConfig(baseURL = "  https://x.com  ").normalizedBaseURL,
        )
    }

    // ── clampTimeout ──

    @Test
    fun `超时被夹到合法区间`() {
        // 填 0 会立刻超时、填极大值会永久挂起
        assertEquals(ProviderConfig.MIN_TIMEOUT_MS, ProviderConfig.clampTimeout(0))
        assertEquals(ProviderConfig.MIN_TIMEOUT_MS, ProviderConfig.clampTimeout(-1))
        assertEquals(ProviderConfig.MAX_TIMEOUT_MS, ProviderConfig.clampTimeout(Int.MAX_VALUE))
    }

    @Test
    fun `合法超时原样返回`() {
        assertEquals(10_000, ProviderConfig.clampTimeout(10_000))
        assertEquals(ProviderConfig.DEFAULT_TIMEOUT_MS, ProviderConfig.clampTimeout(60_000))
    }

    @Test
    fun `默认超时足够宽松（手机弱网）`() {
        // 太短会让用户以为「连不上」，而实际只是首字延迟慢
        assertTrue(ProviderConfig.DEFAULT_TIMEOUT_MS >= 30_000)
    }

    // ── 预设 ──

    @Test
    fun `预设都带必填信息`() {
        ProviderPresets.ALL.forEach { p ->
            assertTrue("${p.id} 缺 label", p.label.isNotBlank())
            assertTrue("${p.id} 缺 hint（手机上无处查文档）", p.hint.isNotBlank())
        }
    }

    @Test
    fun `自定义预设的地址为空（供手填）`() {
        val custom = ProviderPresets.byId("custom")!!
        assertEquals("", custom.baseURL)
    }

    @Test
    fun `除自定义外预设地址都合法`() {
        // 预设填错会让用户「选了一项却连不上」，且归因极难
        ProviderPresets.ALL.filter { it.id != "custom" }.forEach { p ->
            assertTrue(
                "${p.id} 的 baseURL 不合法：${p.baseURL}",
                ProviderConfig.isUrlLike(p.baseURL),
            )
        }
    }

    @Test
    fun `预设 id 唯一`() {
        val ids = ProviderPresets.ALL.map { it.id }
        assertEquals(ids.size, ids.toSet().size)
    }

    @Test
    fun `byId 未知返回 null`() {
        assertEquals(null, ProviderPresets.byId("nonexistent"))
    }
}
