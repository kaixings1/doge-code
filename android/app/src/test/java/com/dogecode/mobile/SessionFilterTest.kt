package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 会话列表过滤的测试。
 *
 * 看着简单，但两个边界最容易写错，且错了会静默变成「列表空了」：
 * 1. **空查询必须返回全部**，而不是返回空列表 —— 后者会让用户一进
 *    会话页就看到「未发现会话」，以为服务端没起，实际只是初始渲染时
 *    搜索框还没内容。
 * 2. **必须大小写不敏感** —— 用户输入 "CI" 期望匹配 "修CI"，反过来也是。
 *
 * 变异验证：把 `q.isEmpty()` 改成返回 emptyList()，
 * 「空查询返回全部」用例必然失败。
 */
class SessionFilterTest {

    private fun s(label: String, cwd: String = "/x", port: Int = 5680) =
        SessionScanner.Session(
            port = port,
            sessionId = "mobile-$port",
            label = label,
            cwd = cwd,
            interactive = true,
            clients = 0,
        )

    private val all = listOf(
        s("前端重构", "D:\\proj\\web", 5680),
        s("修CI", "D:\\proj\\server", 5681),
        s("写文档", "D:\\docs", 5682),
    )

    @Test
    fun `空查询返回全部`() {
        // 关键：不是返回空列表。空列表会让用户一进页面就以为没会话
        assertEquals(3, SessionFragment.filterSessions(all, "").size)
        assertEquals(3, SessionFragment.filterSessions(all, "   ").size)
    }

    @Test
    fun `按标签匹配`() {
        val r = SessionFragment.filterSessions(all, "前端")
        assertEquals(1, r.size)
        assertEquals("前端重构", r[0].label)
    }

    @Test
    fun `按工作目录匹配`() {
        val r = SessionFragment.filterSessions(all, "server")
        assertEquals(1, r.size)
        assertEquals("修CI", r[0].label)
    }

    @Test
    fun `按端口号匹配`() {
        val r = SessionFragment.filterSessions(all, "5682")
        assertEquals(1, r.size)
        assertEquals("写文档", r[0].label)
    }

    @Test
    fun `大小写不敏感`() {
        // "ci" 应匹配 "修CI"
        assertEquals(1, SessionFragment.filterSessions(all, "ci").size)
        assertEquals(1, SessionFragment.filterSessions(all, "CI").size)
        assertTrue(SessionFragment.filterSessions(all, "Ci").isNotEmpty())
    }

    @Test
    fun `无匹配返回空列表`() {
        assertTrue(SessionFragment.filterSessions(all, "不存在的名字").isEmpty())
    }

    @Test
    fun `查询词首尾空白被忽略`() {
        assertEquals(1, SessionFragment.filterSessions(all, "  前端  ").size)
    }

    @Test
    fun `空会话列表返回空`() {
        assertTrue(SessionFragment.filterSessions(emptyList(), "x").isEmpty())
        assertTrue(SessionFragment.filterSessions(emptyList(), "").isEmpty())
    }

    @Test
    fun `部分匹配（子串而非前缀）`() {
        // 用 startsWith 会让「重构」搜不到「前端重构」
        assertEquals(1, SessionFragment.filterSessions(all, "重构").size)
    }

    @Test
    fun `过滤不改变原列表`() {
        val copy = ArrayList(all)
        SessionFragment.filterSessions(all, "前端")
        assertEquals("不应修改入参", copy, all)
    }
}

/**
 * 扫描 watchdog 的复位判据测试（卡死防护）。
 *
 * 背景：SessionFragment.scanning 是防重复扫描的守卫，一旦卡 true，
 * 会话页从此扫不动。watchdog 超时兜底复位它 —— 但只在**仍在扫描**时
 * 才该复位；扫描已正常完成后迟到的 watchdog 若也复位，会把成功结果
 * 误报成「超时」。两个方向都错得静默，须锁死。
 *
 * 变异验证：把 shouldForceReset 改成恒 false（永不复位）→ 用例 1 失败；
 * 改成恒 true（迟到也复位）→ 用例 2 失败。
 */
class ScanWatchdogTest {

    @Test
    fun `扫描中收超时回调才复位`() {
        assertTrue("扫描中应复位", SessionFragment.shouldForceReset(scanning = true))
    }

    @Test
    fun `扫描已完成时迟到的回调不复位`() {
        // 关键：扫描提前正常完成时，watchdog 回调是迟到者，必须被忽略，
        // 否则会把一次成功扫描误报为超时
        assertTrue(
            "已完成的扫描不应被迟到回调复位",
            !SessionFragment.shouldForceReset(scanning = false),
        )
    }
}
