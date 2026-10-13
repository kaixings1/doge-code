package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 会话分组与排序测试。
 *
 * 三处判定的理由（都不是「怎么都行」的偏好）：
 * 1. **本机组排最前** —— USB 反向转发是本项目推荐方式且最不易出问题，
 *    把它排最前让「连不上先试 USB」的排障路径最短
 * 2. **活跃时间降序** —— 用户找的是「最近的」，不是「最早的」
 * 3. **相同键时用端口兜底** —— 否则每次扫描后顺序可能抖动，
 *    用户会以为会话变了
 *
 * 变异验证：把本机组的排序改成升序（去掉 Descending），
 * 「本机组排最前」用例失败。
 */
class SessionOrganizerTest {

    private fun s(
        port: Int,
        label: String = "s$port",
        host: String = "127.0.0.1",
        lastActivity: Long = 0L,
        alive: Boolean = true,
    ) = SessionScanner.Session(
        port = port,
        sessionId = "mobile-$port",
        label = label,
        cwd = "/x",
        interactive = true,
        clients = 0,
        host = host,
        lastActivity = lastActivity,
        alive = alive,
    )

    // ── 分组 ──

    @Test
    fun `本机组排在最前`() {
        val list = listOf(
            s(5680, host = "192.168.0.106"),
            s(5681, host = "127.0.0.1"),
            s(5682, host = "10.0.0.5"),
        )
        val groups = SessionOrganizer.group(list, SessionOrganizer.Order.PORT)
        assertEquals("127.0.0.1", groups[0].host)
        assertTrue("本机组应标记为 local", groups[0].isLocal)
        assertFalse(groups[1].isLocal)
    }

    @Test
    fun `localhost 与 IPv6 回环也算本机`() {
        for (h in listOf("localhost", "::1", "[::1]", "127.0.0.1")) {
            val groups = SessionOrganizer.group(listOf(s(5680, host = h)), SessionOrganizer.Order.PORT)
            assertTrue("$h 应被识别为本机", groups[0].isLocal)
        }
    }

    @Test
    fun `同主机的会话归入同一组`() {
        val list = listOf(
            s(5680, host = "127.0.0.1"),
            s(5681, host = "127.0.0.1"),
            s(5682, host = "192.168.1.5"),
        )
        val groups = SessionOrganizer.group(list, SessionOrganizer.Order.PORT)
        assertEquals(2, groups.size)
        assertEquals(2, groups[0].sessions.size)
        assertEquals(1, groups[1].sessions.size)
    }

    @Test
    fun `空列表返回空分组`() {
        assertTrue(SessionOrganizer.group(emptyList(), SessionOrganizer.Order.PORT).isEmpty())
    }

    @Test
    fun `host 为空时归入未知主机组`() {
        // 用空白 host 作组名会让分组头渲染出一个空条
        val groups = SessionOrganizer.group(listOf(s(5680, host = "")), SessionOrganizer.Order.PORT)
        assertEquals("未知主机", groups[0].host)
    }

    @Test
    fun `多个远程主机之间按名称排序（保证稳定）`() {
        val list = listOf(
            s(5680, host = "192.168.0.106"),
            s(5681, host = "10.0.0.5"),
            s(5682, host = "127.0.0.1"),
        )
        val groups = SessionOrganizer.group(list, SessionOrganizer.Order.PORT)
        assertEquals(listOf("127.0.0.1", "10.0.0.5", "192.168.0.106"), groups.map { it.host })
    }

    // ── 排序 ──

    @Test
    fun `按端口升序`() {
        val r = SessionOrganizer.sort(listOf(s(5682), s(5680), s(5681)), SessionOrganizer.Order.PORT)
        assertEquals(listOf(5680, 5681, 5682), r.map { it.port })
    }

    @Test
    fun `按名称不区分大小写`() {
        val r = SessionOrganizer.sort(
            listOf(s(1, label = "zeta"), s(2, label = "Alpha"), s(3, label = "beta")),
            SessionOrganizer.Order.LABEL,
        )
        assertEquals(listOf("Alpha", "beta", "zeta"), r.map { it.label })
    }

    @Test
    fun `按活跃时间降序（最近在前）`() {
        // 用户找的是「最近的」，不是「最早的」
        val r = SessionOrganizer.sort(
            listOf(s(5680, lastActivity = 100), s(5681, lastActivity = 300), s(5682, lastActivity = 200)),
            SessionOrganizer.Order.ACTIVITY,
        )
        assertEquals(listOf(5681, 5682, 5680), r.map { it.port })
    }

    @Test
    fun `活跃时间为 0（服务端未提供）排在最后`() {
        val r = SessionOrganizer.sort(
            listOf(s(5680, lastActivity = 0), s(5681, lastActivity = 999)),
            SessionOrganizer.Order.ACTIVITY,
        )
        assertEquals(5681, r[0].port)
    }

    @Test
    fun `相同键时用端口兜底（避免顺序抖动）`() {
        // 三次排序应得到相同结果；否则用户每次扫描看到不同顺序，以为会话变了
        val list = listOf(s(5682, label = "same"), s(5680, label = "same"), s(5681, label = "same"))
        val a = SessionOrganizer.sort(list, SessionOrganizer.Order.LABEL).map { it.port }
        val b = SessionOrganizer.sort(list.shuffled(), SessionOrganizer.Order.LABEL).map { it.port }
        val c = SessionOrganizer.sort(list.reversed(), SessionOrganizer.Order.LABEL).map { it.port }
        assertEquals(a, b)
        assertEquals(a, c)
        assertEquals(listOf(5680, 5681, 5682), a)
    }

    @Test
    fun `排序不修改入参`() {
        val original = listOf(s(5682), s(5680))
        val copy = ArrayList(original)
        SessionOrganizer.sort(original, SessionOrganizer.Order.PORT)
        assertEquals(copy, original)
    }

    // ── Order.from ──

    @Test
    fun `Order 从字符串解析，未知值回落端口排序`() {
        assertEquals(SessionOrganizer.Order.PORT, SessionOrganizer.Order.from("port"))
        assertEquals(SessionOrganizer.Order.LABEL, SessionOrganizer.Order.from("label"))
        assertEquals(SessionOrganizer.Order.ACTIVITY, SessionOrganizer.Order.from("activity"))
        assertEquals(SessionOrganizer.Order.PORT, SessionOrganizer.Order.from("nonsense"))
        assertEquals(SessionOrganizer.Order.PORT, SessionOrganizer.Order.from(null))
    }

    // ── hostLabel ──

    @Test
    fun `本机主机名带标注`() {
        assertEquals("127.0.0.1 · 本机", SessionOrganizer.hostLabel("127.0.0.1", true, "本机"))
        assertEquals("192.168.0.106", SessionOrganizer.hostLabel("192.168.0.106", false, "本机"))
    }

    // ── 死会话排在最后（用户报过「列表大量内容却连不上」）──

    @Test
    fun `按端口排序时死会话被排到最后`() {
        // 端口 6000 是死的，但它端口最小 —— 若不特殊处理会排在最前，
        // 用户一眼看到并误点，然后得到 ConnectException。
        val list = listOf(
            s(6000, alive = false),
            s(6001),
            s(6002, alive = false),
            s(6003),
        )
        val sorted = SessionOrganizer.sort(list, SessionOrganizer.Order.PORT)
        assertEquals("活的在前（组内仍按端口升序）", listOf(6001, 6003), sorted.filter { it.alive }.map { it.port })
        assertEquals("死的在后", listOf(6000, 6002), sorted.filter { !it.alive }.map { it.port })
        assertTrue("死会话不应出现在首位", sorted.first().alive)
    }

    @Test
    fun `按活跃时间排序时同样把死的压到最后`() {
        val list = listOf(
            s(6000, lastActivity = 999L, alive = false), // 最活跃但是死的
            s(6001, lastActivity = 1L),
        )
        val sorted = SessionOrganizer.sort(list, SessionOrganizer.Order.ACTIVITY)
        assertEquals("死会话即使在最活跃也必须排最后", 6001, sorted.first().port)
    }

    @Test
    fun `全部为活时排序结果与不区分死活一致`() {
        val list = listOf(s(6003), s(6001), s(6002))
        val sorted = SessionOrganizer.sort(list, SessionOrganizer.Order.PORT)
        assertEquals(listOf(6001, 6002, 6003), sorted.map { it.port })
    }

    @Test
    fun `死的排最后是稳定排序（活的原序不变）`() {
        val a = s(6001, label = "A")
        val b = s(6002, label = "B")
        val dead = s(6003, alive = false)
        val sorted = SessionOrganizer.sort(listOf(a, b, dead), SessionOrganizer.Order.LABEL)
        assertEquals(listOf("A", "B", "s6003"), sorted.map { it.label })
    }
}
