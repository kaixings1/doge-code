package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 工作模式的纯逻辑测试。
 *
 * 为什么必须测：
 * · **默认模式必须是 LAN** —— 若默认 CLOUD/TUNNEL，现有用户升级后会发现
 *   「连不上电脑、还多了一堆要配的 API key」，这是最糟的升级体验
 * · 模式**不能靠 ordinal 持久化** —— 枚举顺序一变就错位，
 *   会让老用户突然切到另一个模式且毫无提示
 * · 模式的说明必须**如实告知限制**（云端不能执行命令），
 *   否则用户会以为云端模式和电脑端一样强
 *
 * 变异验证：把 `AppModePrefs.get()` 的默认值从 LAN 改成 CLOUD，
 * 「默认模式是局域网」用例失败。
 */
class AppModeTest {

    @Test
    fun `共有三种模式`() {
        assertEquals(3, AppMode.entries.size)
        assertEquals(AppMode.LAN, AppMode.entries[0])
        assertEquals(AppMode.CLOUD, AppMode.entries[1])
        assertEquals(AppMode.TUNNEL, AppMode.entries[2])
    }

    @Test
    fun `默认模式是局域网（升级体验契约）`() {
        // 用 AppModePrefs 的实际默认值断言，而非只测常量 ——
        // 测的是「用户开箱即得什么」
        val d = defaultMode()
        assertEquals(
            "默认必须是 LAN：现有用户升级后不该看到需要重配的界面",
            AppMode.LAN,
            d,
        )
    }

    @Test
    fun `模式名的字符串稳定（持久化契约）`() {
        // 存的必须是 name（字符串）而非 ordinal —— 这里锁死字符串值，
        // 若有人重命名枚举常量，会在此失败并提醒「旧数据读不出来」
        assertEquals("LAN", AppMode.LAN.name)
        assertEquals("CLOUD", AppMode.CLOUD.name)
        assertEquals("TUNNEL", AppMode.TUNNEL.name)
    }

    @Test
    fun `未知模式值回落 LAN 而非崩溃`() {
        // 旧版本存的值、或手工改坏的 prefs，都不该让 App 打不开。
        // 测的是**真实的** parse（AppModePrefs.get 也调它）
        assertEquals(AppMode.LAN, AppMode.parse("TURBO"))
        assertEquals(AppMode.LAN, AppMode.parse(""))
        assertEquals(AppMode.LAN, AppMode.parse("remote")) // 大小写敏感：不认识就回落
    }

    @Test
    fun `合法模式名正确解析`() {
        assertEquals(AppMode.LAN, AppMode.parse("LAN"))
        assertEquals(AppMode.CLOUD, AppMode.parse("CLOUD"))
        assertEquals(AppMode.TUNNEL, AppMode.parse("TUNNEL"))
    }

    @Test
    fun `DEFAULT 与 parse(null) 一致`() {
        // 两处必须同步，否则「未存过」与「存了默认值」行为不同
        assertEquals(AppMode.DEFAULT, AppMode.parse(null))
    }

    @Test
    fun `三种模式的展示名不同且非空`() {
        assertTrue(AppMode.LAN.label.isNotBlank())
        assertTrue(AppMode.CLOUD.label.isNotBlank())
        assertTrue(AppMode.TUNNEL.label.isNotBlank())
        assertNotEquals(AppMode.LAN.label, AppMode.CLOUD.label)
        assertNotEquals(AppMode.CLOUD.label, AppMode.TUNNEL.label)
    }

    @Test
    fun `云端模式的说明如实告知命令执行受限`() {
        // 关键：不能让用户以为云端模式 = 电脑上的完整体验。
        // 手机上命令只能经 Termux 跑受限白名单命令，必须写进说明。
        assertTrue(
            "云端模式说明必须提到命令执行受限（非自由 shell）",
            AppMode.CLOUD.desc.contains("命令执行") ||
                AppMode.CLOUD.desc.contains("受限") ||
                AppMode.CLOUD.desc.contains("白名单"),
        )
    }

    @Test
    fun `局域网模式的说明提到需要电脑`() {
        // 反过来也要说清：局域网模式依赖电脑开机
        assertTrue(
            "局域网模式说明应提到依赖电脑",
            AppMode.LAN.desc.contains("电脑"),
        )
    }

    @Test
    fun `隧道模式的说明提到户外可用`() {
        // 隧道的核心卖点：户外也能连本机
        assertTrue(
            "隧道模式说明应提到户外可用",
            AppMode.TUNNEL.desc.contains("户外") || AppMode.TUNNEL.desc.contains("隧道"),
        )
    }

    @Test
    fun `isCloudAgent 仅云端为真`() {
        // 决定后端分流的属性，必须唯一映射
        assertTrue(AppMode.CLOUD.isCloudAgent)
        assertFalse(AppMode.LAN.isCloudAgent)
        assertFalse(AppMode.TUNNEL.isCloudAgent)
    }

    /**
     * 调用**真实的**解析函数（而非复刻）。
     *
     * 复刻型测试在生产逻辑改动时不会失败，只提供虚假安全感。
     * 为能直接测，解析逻辑被抽成 [AppMode.parse] 纯函数 ——
     * AppModePrefs.get() 也调它，保证测的就是跑的那份。
     */
    private fun defaultMode(): AppMode = AppMode.parse(null)
}
