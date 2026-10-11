package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 服务端 UDP 广播的解析测试（跨端契约）。
 *
 * 为什么必须测：这是**服务端发、客户端收**的契约。字段名/类型不一致会
 * 表现为「手机完全发现不了会话」——UDP 无连接、无回执，**没有任何报错**，
 * 只能靠抓包才查得出。
 *
 * 最关键的判据：非法 `port` 必须拒绝 —— 连到一个错的端口
 * 比连不上更糟（用户会以为「程序坏了」而非「发现错了」）。
 *
 * 变异验证：把 parse 里的 port 校验去掉，「端口非法被拒绝」用例失败。
 */
class BeaconProtocolTest {

    private fun beacon(
        beacon: String = BeaconProtocol.TAG,
        v: Int = BeaconProtocol.VERSION,
        port: Int = 5680,
        extra: String = "",
    ): String = """{"beacon":"$beacon","v":$v,"port":$port$extra}"""

    private fun parse(raw: String, host: String = "192.168.1.5") =
        BeaconProtocol.parse(raw, host)

    // ── 正常解析 ──

    @Test
    fun `解析完整报文`() {
        val raw = """
            {"beacon":"doge-mobile","v":1,"port":5680,"sessionId":"mobile-1",
             "cwd":"D:\\proj","label":"前端重构","interactive":true,"clients":2,
             "resumeSessionId":"abc-123","ts":1700000000000}
        """.trimIndent()
        val s = parse(raw)!!
        assertEquals(5680, s.port)
        assertEquals("192.168.1.5", s.host)
        assertEquals("前端重构", s.label)
        assertEquals("D:\\proj", s.cwd)
        assertTrue(s.interactive)
        assertEquals(2, s.clients)
        assertEquals("abc-123", s.resumeSessionId)
    }

    @Test
    fun `host 取自数据包来源（广播报文里没有 IP）`() {
        // 这正是客户端要连的地址 —— 取错就连不上
        val s = parse(beacon(), host = "10.0.0.7")!!
        assertEquals("10.0.0.7", s.host)
    }

    @Test
    fun `标签为空时回落为主机地址`() {
        // 列表里显示空标签会让用户不知道是哪个会话
        val s = parse("""{"beacon":"doge-mobile","v":1,"port":5680,"label":""}""")!!
        assertEquals("192.168.1.5", s.label)
    }

    // ── 拒绝非法输入（跨端契约的关键）──

    @Test
    fun `非 JSON 被拒绝`() {
        assertNull(parse("not json"))
        assertNull(parse(""))
        assertNull(parse("{bad"))
    }

    @Test
    fun `非本协议被拒绝`() {
        // 同一组播地址可能有别的程序在用
        assertNull(parse(beacon(beacon = "other-app")))
        assertNull(parse("""{"port":5680}"""))
    }

    @Test
    fun `版本不匹配被拒绝（不猜字段语义）`() {
        // 新旧版本字段语义可能不同，猜错比不认更糟
        assertNull(parse(beacon(v = 2)) as Any?)
        assertNull(parse(beacon(v = 0)) as Any?)
        assertNull(parse("""{"beacon":"doge-mobile","port":5680}"""))
    }

    @Test
    fun `端口非法被拒绝（关键：连错端口比不连更糟）`() {
        assertNull(parse("""{"beacon":"doge-mobile","v":1}"""))
        assertNull(parse("""{"beacon":"doge-mobile","v":1,"port":0}"""))
        assertNull(parse("""{"beacon":"doge-mobile","v":1,"port":-1}"""))
        assertNull(parse("""{"beacon":"doge-mobile","v":1,"port":70000}"""))
        assertNull(parse("""{"beacon":"doge-mobile","v":1,"port":"5680"}"""))
    }

    @Test
    fun `缺可选字段时回落安全默认值`() {
        val s = parse(beacon())!!
        assertEquals("", s.cwd)
        assertEquals("", s.sessionId)
        // interactive 默认 false（保守：不是 true 就不当交互模式）
        assertFalse(s.interactive)
        assertEquals(0, s.clients)
        assertNull(s.resumeSessionId)
    }

    @Test
    fun `interactive 只有严格 true 才算真`() {
        // 与「通知抑制」同样的保守原则：类型异常时落到安全的一侧
        assertTrue(parse("""{"beacon":"doge-mobile","v":1,"port":1,"interactive":true}""")!!.interactive)
        assertFalse(parse("""{"beacon":"doge-mobile","v":1,"port":1,"interactive":"true"}""")!!.interactive)
        assertFalse(parse("""{"beacon":"doge-mobile","v":1,"port":1,"interactive":1}""")!!.interactive)
    }

    @Test
    fun `字段类型异常时不崩且回落默认值`() {
        val raw = """{"beacon":"doge-mobile","v":1,"port":5680,
                      "label":{},"cwd":[],"sessionId":123,"clients":"many"}"""
        val s = parse(raw)!!
        assertEquals("192.168.1.5", s.label) // 回落主机名
        assertEquals("", s.cwd)
        assertEquals("", s.sessionId)
        assertEquals(0, s.clients)
    }

    @Test
    fun `空 resumeSessionId 视为无`() {
        val s = parse("""{"beacon":"doge-mobile","v":1,"port":5680,"resumeSessionId":""}""")!!
        assertNull(s.resumeSessionId)
    }

    // ── 过期判定 ──

    @Test
    fun `刚收到的广播不算过期`() {
        assertFalse(BeaconProtocol.isStale(lastSeen = 1000, now = 1500))
    }

    @Test
    fun `超阈值算过期`() {
        assertTrue(BeaconProtocol.isStale(lastSeen = 0, now = BeaconProtocol.STALE_MS + 1))
    }

    @Test
    fun `恰好等于阈值不算过期`() {
        assertFalse(BeaconProtocol.isStale(lastSeen = 0, now = BeaconProtocol.STALE_MS))
    }

    @Test
    fun `过期阈值能容忍连丢数个包（3 秒间隔）`() {
        // 服务端 3 秒发一次；阈值太紧会让列表里的会话频繁闪进闪出
        assertTrue(BeaconProtocol.STALE_MS >= 3 * 3000)
    }

    // ── 合并去重 ──

    private fun session(host: String, port: Int, label: String = "s") =
        SessionScanner.Session(
            port = port, sessionId = "id-$port", label = label, cwd = "",
            interactive = true, clients = 0, host = host,
        )

    @Test
    fun `广播与扫描同一会话时保留广播的（实时值更准）`() {
        val fromBeacon = session("192.168.1.5", 5680, label = "广播版")
        val fromScan = session("192.168.1.5", 5680, label = "扫描版")
        val merged = BeaconProtocol.merge(listOf(fromBeacon), listOf(fromScan))
        assertEquals(1, merged.size)
        assertEquals("广播版", merged[0].label)
    }

    @Test
    fun `扫描独有的会话被保留（广播被拦时的唯一途径）`() {
        // 关键：广播常被路由器拦（AP 隔离），此时扫描是唯一发现途径，
        // 不能因为做了广播就丢掉扫描结果
        val fromBeacon = session("192.168.1.5", 5680)
        val onlyScanned = session("192.168.1.9", 5680)
        val merged = BeaconProtocol.merge(listOf(fromBeacon), listOf(onlyScanned))
        assertEquals(2, merged.size)
        assertTrue(merged.any { it.host == "192.168.1.9" })
    }

    @Test
    fun `端口不同视为不同会话`() {
        // 同一台电脑上的多个 CLI 实例：同 host 不同 port，必须都保留
        val a = session("192.168.1.5", 5680)
        val b = session("192.168.1.5", 5681)
        assertEquals(2, BeaconProtocol.merge(listOf(a, b), emptyList()).size)
    }

    @Test
    fun `主机不同视为不同会话`() {
        val a = session("192.168.1.5", 5680)
        val b = session("192.168.1.9", 5680)
        assertEquals(2, BeaconProtocol.merge(listOf(a, b), emptyList()).size)
    }

    @Test
    fun `合并结果按主机与端口升序`() {
        val list = listOf(
            session("192.168.1.9", 5681),
            session("192.168.1.5", 5681),
            session("192.168.1.5", 5680),
        )
        val merged = BeaconProtocol.merge(list, emptyList())
        assertEquals(listOf(5680, 5681, 5681), merged.map { it.port })
        assertEquals("192.168.1.5", merged.first().host)
    }

    @Test
    fun `空输入合并为空`() {
        assertTrue(BeaconProtocol.merge(emptyList(), emptyList()).isEmpty())
    }

    @Test
    fun `重复的广播条目被去重`() {
        // 广播周期重复到达，同一会话可能被重复加入
        val dup = session("192.168.1.5", 5680)
        val merged = BeaconProtocol.merge(listOf(dup, dup), emptyList())
        assertEquals(1, merged.size)
    }
}
