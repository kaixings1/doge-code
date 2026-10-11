package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 远程配置选项表的测试。
 *
 * **直接引用生产代码** ConfigOptions —— 不是镜像。
 *
 * 这一点值得记录：本文件初版在测试里重新声明了一份期望值（因为选项表
 * 当时藏在 SettingsFragment 的私有 companion 中，测试无法引用）。那种
 * 镜像/复刻型测试在生产代码改动时**不会失败**，等于没测。
 * 于是把选项表抽成 public object ConfigOptions，让测试真正盯着它。
 *
 * **这是安全边界测试**：选项表决定用户能选什么，尤其是权限模式。
 *
 * 变异验证：往 ConfigOptions.PERMISSION_MODES 里加一项 bypassPermissions，
 * 「权限选项不含 Bypass」用例必然失败。
 */
class ConfigOptionsTest {

    // ── 权限模式：安全关键 ──

    @Test
    fun `权限选项不含 Bypass（安全关键）`() {
        val values = ConfigOptions.PERMISSION_MODES.map { it.first }
        assertFalse(
            "手机端绝不能提供 Bypass 权限选项：拿到手机即可关掉本机全部防护",
            values.any { it.contains("bypass", ignoreCase = true) },
        )
    }

    @Test
    fun `权限选项与服务端白名单一致`() {
        // 服务端 mobileConfig.MOBILE_ALLOWED_PERMISSION_MODES。
        // 两端必须一致：客户端有而服务端没有 → 用户点了被拒；
        // 服务端有而客户端没有 → 功能缺失。
        val serverAllowed = setOf("default", "plan", "acceptEdits", "auto")
        val clientOffered = ConfigOptions.PERMISSION_MODES.map { it.first }.toSet()
        assertEquals("客户端选项与服务端白名单必须一致", serverAllowed, clientOffered)
    }

    @Test
    fun `权限选项无重复`() {
        val values = ConfigOptions.PERMISSION_MODES.map { it.first }
        assertEquals("选项不应重复", values.size, values.toSet().size)
    }

    @Test
    fun `权限选项的展示名非空`() {
        ConfigOptions.PERMISSION_MODES.forEach { (value, label) ->
            assertTrue("$value 的展示名不应为空", label.isNotBlank())
        }
    }

    // ── 思考强度 ──

    @Test
    fun `思考强度含 0（表示关闭）`() {
        assertTrue(
            "0 是合法值，表示关闭思考；缺了它用户无法关掉",
            ConfigOptions.THINKING.any { it.first == 0 },
        )
    }

    @Test
    fun `思考强度全为非负整数`() {
        ConfigOptions.THINKING.forEach { (v, _) -> assertTrue("$v 应为非负", v >= 0) }
    }

    @Test
    fun `思考强度不含超大值（防耗尽配额）`() {
        assertTrue(
            "不应提供 10 万以上的值 —— 一次请求就能耗尽配额",
            ConfigOptions.THINKING.none { it.first > 100_000 },
        )
    }

    @Test
    fun `思考强度与服务端白名单一致`() {
        val serverAllowed = setOf(0, 1024, 4096, 16384, 32768)
        val clientOffered = ConfigOptions.THINKING.map { it.first }.toSet()
        assertEquals(serverAllowed, clientOffered)
    }

    // ── 模型 ──

    @Test
    fun `模型选项含 default（恢复默认）`() {
        assertTrue("必须能恢复默认模型", ConfigOptions.MODELS.any { it.first == "default" })
    }

    @Test
    fun `模型选项名能通过服务端的形状校验`() {
        // 否则用户点了会被服务端拒绝。规则与服务端
        // mobileConfig.MODEL_NAME_PATTERN 一致。
        ConfigOptions.MODELS.forEach { (value, _) ->
            assertTrue(
                "模型名「$value」应能通过服务端校验",
                ConfigOptions.MODEL_NAME_PATTERN.matches(value),
            )
        }
    }

    @Test
    fun `模型选项无重复`() {
        val values = ConfigOptions.MODELS.map { it.first }
        assertEquals(values.size, values.toSet().size)
    }
}
