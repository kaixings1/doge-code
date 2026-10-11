package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 工作模式的纯逻辑测试。
 *
 * 为什么必须测：
 * · **默认值必须是 REMOTE** —— 若默认 LOCAL，现有用户升级后会发现
 *   「连不上电脑、还多了一堆要配的 API key」，这是最糟的升级体验
 * · 模式**不能靠 ordinal 持久化** —— 枚举顺序一变就错位，
 *   会让老用户突然切到另一个模式且毫无提示
 * · 两种模式的说明必须**如实告知限制**（本地不能执行命令），
 *   否则用户会以为本地模式和远端一样强
 *
 * 变异验证：把 `AppModePrefs.get()` 的默认值从 REMOTE 改成 LOCAL，
 * 「默认模式是远端」用例失败。
 */
class AppModeTest {

    @Test
    fun `共有两种模式`() {
        assertEquals(2, AppMode.entries.size)
        assertEquals(AppMode.REMOTE, AppMode.entries[0])
        assertEquals(AppMode.LOCAL, AppMode.entries[1])
    }

    @Test
    fun `默认模式是远端（升级体验契约）`() {
        // 用 AppModePrefs 的实际默认值断言，而非只测常量 ——
        // 测的是「用户开箱即得什么」
        val d = defaultMode()
        assertEquals(
            "默认必须是 REMOTE：现有用户升级后不该看到需要重配的界面",
            AppMode.REMOTE,
            d,
        )
    }

    @Test
    fun `模式名的字符串稳定（持久化契约）`() {
        // 存的必须是 name（字符串）而非 ordinal —— 这里锁死字符串值，
        // 若有人重命名枚举常量，会在此失败并提醒「旧数据读不出来」
        assertEquals("REMOTE", AppMode.REMOTE.name)
        assertEquals("LOCAL", AppMode.LOCAL.name)
    }

    @Test
    fun `未知模式值回落 REMOTE 而非崩溃`() {
        // 旧版本存的值、或手工改坏的 prefs，都不该让 App 打不开。
        // 测的是**真实的** parse（AppModePrefs.get 也调它）
        assertEquals(AppMode.REMOTE, AppMode.parse("TURBO"))
        assertEquals(AppMode.REMOTE, AppMode.parse(""))
        assertEquals(AppMode.REMOTE, AppMode.parse("remote")) // 大小写敏感：不认识就回落
    }

    @Test
    fun `合法模式名正确解析`() {
        assertEquals(AppMode.REMOTE, AppMode.parse("REMOTE"))
        assertEquals(AppMode.LOCAL, AppMode.parse("LOCAL"))
    }

    @Test
    fun `DEFAULT 与 parse(null) 一致`() {
        // 两处必须同步，否则「未存过」与「存了默认值」行为不同
        assertEquals(AppMode.DEFAULT, AppMode.parse(null))
    }

    @Test
    fun `两种模式的展示名不同且非空`() {
        assertTrue(AppMode.REMOTE.label.isNotBlank())
        assertTrue(AppMode.LOCAL.label.isNotBlank())
        assertNotEquals(AppMode.REMOTE.label, AppMode.LOCAL.label)
    }

    @Test
    fun `本地模式的说明如实告知命令执行受限`() {
        // 关键：不能让用户以为本地模式 = 电脑上的完整体验。
        // 手机上命令只能经 Termux 跑受限白名单命令，必须写进说明。
        assertTrue(
            "本地模式说明必须提到命令执行受限（非自由 shell）",
            AppMode.LOCAL.desc.contains("命令执行") ||
                AppMode.LOCAL.desc.contains("受限") ||
                AppMode.LOCAL.desc.contains("白名单"),
        )
    }

    @Test
    fun `远端模式的说明提到需要电脑`() {
        // 反过来也要说清：远端模式依赖电脑开机
        assertTrue(
            "远端模式说明应提到依赖电脑",
            AppMode.REMOTE.desc.contains("电脑"),
        )
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
