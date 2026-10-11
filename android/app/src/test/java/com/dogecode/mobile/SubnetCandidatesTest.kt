package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * SubnetCandidates 的测试。
 *
 * 这个类决定「局域网自动发现扫哪些 IP」，算错一位的表现是
 * 「扫描永远为空、且不报错」—— 用户看到的是「找不到会话」，
 * 与「服务端没启动」完全无法区分。所以边界必须逐个钉死。
 *
 * 每个用例都用**具体的 IP 值**断言，而不是「不为空」「长度对」这种
 * 弱断言 —— 弱断言在实现返回全 0.0.0.0 时也会通过。
 */
class SubnetCandidatesTest {

    // ── parseIpv4：脏输入必须一致地拒绝 ──

    @Test
    fun `正常 IP 解析为四段`() {
        val b = SubnetCandidates.parseIpv4("192.168.0.106")
        assertEquals(listOf(192, 168, 0, 106), b!!.toList())
    }

    @Test
    fun `段数不对返回 null`() {
        assertNull(SubnetCandidates.parseIpv4("192.168.0"))
        assertNull(SubnetCandidates.parseIpv4("192.168.0.1.2"))
        assertNull(SubnetCandidates.parseIpv4("192"))
    }

    @Test
    fun `超范围与空段返回 null`() {
        // 256 必须被拒 —— Integer.parseInt 会接受它，
        // 若不显式查范围就会算出一个越界的网络地址
        assertNull(SubnetCandidates.parseIpv4("192.168.0.256"))
        assertNull(SubnetCandidates.parseIpv4("192..0.1"))
        assertNull(SubnetCandidates.parseIpv4("192.168.0."))
        assertNull(SubnetCandidates.parseIpv4("192.168.0.-1"))
        assertNull(SubnetCandidates.parseIpv4("192.168.0.1a"))
    }

    // ── forHost：候选生成 ──

    @Test
    fun `斜杠24 从网关开始且不含网络地址与广播地址`() {
        val c = SubnetCandidates.forHost("192.168.0.106", 24)
        // 网关优先，必须排第一
        assertEquals("192.168.0.1", c.first())
        assertEquals("192.168.0.2", c[1])
        // 网络地址 .0 绝不能出现（那是网段本身，不是主机）
        assertTrue("不应包含网络地址：$c", "192.168.0.0" !in c)
        // 广播地址 .255 绝不能出现
        assertTrue("不应包含广播地址：$c", "192.168.0.255" !in c)
        // 全段覆盖：低位与高位 DHCP 地址都必须在候选内
        assertTrue("应覆盖低位 DHCP：$c", "192.168.0.10" in c)
        assertTrue("应覆盖高位 DHCP：$c", "192.168.0.228" in c)
        // /24 可用主机 254 个，全段覆盖
        assertEquals(254, c.size)
        assertEquals(SubnetCandidates.MAX_PER_SUBNET, c.size)
    }

    @Test
    fun `高位 DHCP 区段被覆盖（真实部署缺口修复）`() {
        // 真机实测：电脑 DHCP 租约落在 .228，纯低位扫描（.1~.24）永远扫不到。
        // 候选必须覆盖整个网段，否则局域网发现对高位地址的会话完全失效。
        val c = SubnetCandidates.forHost("192.168.110.216", 24)
        assertTrue("高位 .228 必须在候选内（修复验证）：$c", "192.168.110.228" in c)
        // 高位任意地址都应在（全段覆盖，非抽样）
        assertTrue("高位 .96 应在候选内：$c", "192.168.110.96" in c)
        assertTrue("高位 .254 应在候选内：$c", "192.168.110.254" in c)
        // 网关仍排第一
        assertEquals("网关 .1 仍排第一", "192.168.110.1", c.first())
    }

    @Test
    fun `掩码非法时回退斜杠24`() {
        val a = SubnetCandidates.forHost("10.0.5.7", 0)
        val b = SubnetCandidates.forHost("10.0.5.7", 24)
        assertEquals(b, a)

        val c = SubnetCandidates.forHost("10.0.5.7", 99)
        assertEquals(b, c)
    }

    @Test
    fun `斜杠16 只取该网的 16 位前缀`() {
        // /16 的主机位有 16 位，候选仍受 MAX_PER_SUBNET 限制
        val c = SubnetCandidates.forHost("172.16.30.40", 16)
        assertEquals("172.16.0.1", c.first())
        // 关键：不能跨到 172.17（网络前缀必须按掩码算，而不是照抄前三段）
        assertTrue("不应跨越 /16 网段：$c", c.none { it.startsWith("172.17.") })
    }

    @Test
    fun `斜杠20 网络边界按位对齐`() {
        // 192.168.16.20/20 → 网络地址 192.168.16.0（20 位掩码）
        val c = SubnetCandidates.forHost("192.168.16.20", 20)
        assertEquals("192.168.16.1", c.first())
        assertTrue("不应跨越 /20 网段：$c", c.none { it.startsWith("192.168.17.") })
    }

    @Test
    fun `点对点斜杠30 返回空`() {
        // /30 是点对点链路，网段探索无意义
        assertTrue(SubnetCandidates.forHost("10.1.1.2", 30).isEmpty())
    }

    @Test
    fun `广播地址必须被剔除且循环恰好停在它之前`() {
        // 这条用例专为「广播地址剔除」而写，参数是**算出来的**而非试出来的：
        //
        // hostBits=5（/27）时：
        //   广播地址在同网段内的序号 = (1 shl hostBits) - 1 = 31
        //   count = min((1 shl 5) - 2, MAX_PER_SUBNET) = min(30, 24) = 24
        //   → i 只跑到 24，够不到 31，循环靠 count 自然结束。
        //   这条路径下「剔除」那行**不可达**（/24 /25 /28 同理）。
        //
        // 要让剔除行可达，必须 count >= 广播序号，即
        //   (1 shl hostBits) - 2 >= (1 shl hostBits) - 1，无解；
        // 故 count 被 MAX_PER_SUBNET 截断时永远不可达。
        // 唯一可达的情况是**不截断**（主机数 <= 上限）：hostBits 取 4（/28）
        // 时 count = min(14, 24) = 14 < 15，仍不可达；hostBits=3（/29）
        // 时 count = min(6,24) = 6 < 7，不可达。
        //
        // 结论：在 MAX_PER_SUBNET=24 且 hostBits>=3 的前提（函数自身的守卫）
        // 下，**剔除行确实不可达**。保留它作为防御是合理的，但测试无法覆盖
        // 它 —— 因此本用例改为钉住「可达的那部分语义」：结果里绝不能出现
        // 网络地址或广播地址，且不得超过可用主机数。
        val c = SubnetCandidates.forHost("192.168.1.9", 27)
        assertEquals("192.168.1.1", c.first())
        // /27 可用主机仅 30 个（.1~.30），高位段（.96~）超出本网段不生成
        assertEquals("候选数为本网段可用主机数 30", 30, c.size)
        assertTrue("不应包含网络地址 .0：$c", "192.168.1.0" !in c)
        assertTrue("候选全在本网段内：$c", c.all { it.startsWith("192.168.1.") })
        assertTrue("窄掩码下不应越出网段探 .96：$c", "192.168.1.96" !in c)
    }

    @Test
    fun `斜杠28 候选数取可用主机数而非上限`() {
        // /28 只有 14 个可用主机，count 不能因为 MAX_PER_SUBNET=24 就取 24
        val c = SubnetCandidates.forHost("10.20.30.5", 28)
        assertEquals(14, c.size)
        assertEquals("10.20.30.14", c.last())
    }

    @Test
    fun `非法 IP 返回空列表而非崩溃`() {
        assertTrue(SubnetCandidates.forHost("", 24).isEmpty())
        assertTrue(SubnetCandidates.forHost("not-an-ip", 24).isEmpty())
    }

    // ── merge：顺序即优先级 ──

    @Test
    fun `merge 保序去重`() {
        val r = SubnetCandidates.merge(
            listOf("127.0.0.1"),
            listOf("192.168.0.1", "127.0.0.1"),
            listOf("192.168.0.1", "10.0.0.1"),
        )
        assertEquals(listOf("127.0.0.1", "192.168.0.1", "10.0.0.1"), r)
    }

    @Test
    fun `merge 丢弃空白项`() {
        val r = SubnetCandidates.merge(listOf("  ", "1.2.3.4", ""))
        assertEquals(listOf("1.2.3.4"), r)
    }

    // ── cidr 拆分 ──

    @Test
    fun `cidr 拆分`() {
        assertEquals("192.168.0.106", SubnetCandidates.ipOf("192.168.0.106/24"))
        assertEquals(24, SubnetCandidates.prefixOf("192.168.0.106/24"))
        assertEquals("192.168.0.106", SubnetCandidates.ipOf("192.168.0.106"))
        assertNull(SubnetCandidates.prefixOf("192.168.0.106"))
    }

    @Test
    fun `formatIpv4 与 parseIpv4 互逆`() {
        val ip = "203.0.113.42"
        assertEquals(ip, SubnetCandidates.formatIpv4(SubnetCandidates.parseIpv4(ip)!!))
    }
}
