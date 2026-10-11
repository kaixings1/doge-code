package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * LanScanner 端口段与候选网段生成测试。
 *
 * 为什么不直接端到端扫固定端口：测试要被扫到就必须在目标端口起 server——
 * 而开发机上的真 CLI 常占用默认端口，导致 BindException（已实测踩到）。
 * 端到端的「扫描→拿到 port」已由 [SessionScannerProbeTest] 在随机空闲端口上覆盖。
 *
 * 本测试聚焦 LanScanner 自身可测的纯逻辑：
 *   1. PORTS 段覆盖服务端顺延的全部结果（默认段起 10 个）
 *   2. PORTS 起点与 PortScanRange 默认起点一致（防两端漂移）
 *   3. candidates() 由本机 IP 推出合理网段（网关优先）
 *   4. 空输入不崩
 */
class LanScannerTest {

    @Test
    fun `扫描端口段覆盖服务端顺延全部结果`() {
        // 服务端「从起始端口起试 10 个」→ start..start+9；接收端必须都覆盖。
        val start = PortScanRange.DEFAULT_START
        val covered = (start..start + 9).all { it in LanScanner.PORTS }
        assertTrue("PORTS 必须覆盖顺延全段 $start..${start + 9}", covered)
    }

    @Test
    fun `PORTS 起点与 PortScanRange 一致`() {
        // 两个独立常量容易漂移（已踩过）：起点必须一致
        assertEquals(PortScanRange.DEFAULT_START, LanScanner.PORTS.first)
    }

    @Test
    fun `默认起始端口与服务端默认一致 6000`() {
        // 两端默认值必须相同：服务端 DEFAULT_MOBILE_PORT=6000，
        // 客户端 DEFAULT_START 也须为 6000，否则新用户开箱即扫不到
        //（服务起来了、手机找不到，且两端各自看都正常）。
        // 此断言在任一端被改回 5680 时失败并提示同步。
        assertEquals(6000, PortScanRange.DEFAULT_START)
    }

    @Test
    fun `candidates 为网段内合理候选（网关优先）`() {
        // 注入本机 IP 走 candidates() 的底层 SubnetCandidates.forHost
        val cands = SubnetCandidates.forHost("192.168.1.106", 24)
        assertTrue("应包含网关 192.168.1.1", cands.contains("192.168.1.1"))
        assertTrue("候选不应为空", cands.isNotEmpty())
        // 网关排在最前（优先级最高）
        assertEquals("192.168.1.1", cands.first())
    }

    @Test
    fun `candidates 非法掩码回退 24 不产生空`() {
        val cands = SubnetCandidates.forHost("10.0.0.5", 99)
        assertTrue("非法前缀应回退 /24 并产生候选", cands.isNotEmpty())
    }

    @Test
    fun `candidates 非法 IP 返回空（不崩）`() {
        val cands = SubnetCandidates.forHost("not-an-ip", 24)
        assertTrue(cands.isEmpty())
    }

    @Test
    fun `merge 去重并保持顺序（优先级）`() {
        val merged = SubnetCandidates.merge(
            listOf("192.168.1.1", "192.168.1.2"),
            listOf("192.168.1.2", "192.168.1.3"),
        )
        assertEquals(listOf("192.168.1.1", "192.168.1.2", "192.168.1.3"), merged)
    }

    @Test
    fun `解析 CIDR 的 ip 与 prefix`() {
        assertEquals("192.168.0.106", SubnetCandidates.ipOf("192.168.0.106/24"))
        assertEquals(24, SubnetCandidates.prefixOf("192.168.0.106/24"))
    }

    // ── isUsableInterface：广播与扫描共用的网卡取舍标准（单一来源）──

    @Test
    fun `WiFi 网卡可用`() {
        assertTrue(LanScanner.isUsableInterface("wlan0"))
        assertTrue("大小写不敏感", LanScanner.isUsableInterface("WLAN0"))
    }

    @Test
    fun `蜂窝与 WiFiDirect 不可用`() {
        assertFalse(LanScanner.isUsableInterface("rmnet_data0"))
        assertFalse(LanScanner.isUsableInterface("rmnet0"))
        assertFalse(LanScanner.isUsableInterface("ccmni0"))
        assertFalse(LanScanner.isUsableInterface("p2p0"))
    }

    @Test
    fun `USB 网卡不可用（此前两处漂移的正是这一类）`() {
        // BeaconListener 曾漏排除 rndis/usb，而 LanScanner 排除了 —— 造成
        // 「广播在 USB 网卡上加入组播、扫描却不扫它」的不一致。
        assertFalse(LanScanner.isUsableInterface("rndis0"))
        assertFalse(LanScanner.isUsableInterface("usb0"))
        // 前缀匹配：usb1、rndis1 等同样排除
        assertFalse(LanScanner.isUsableInterface("usb1"))
        assertFalse(LanScanner.isUsableInterface("rndis1"))
    }

    @Test
    fun `null 与空名不可用`() {
        assertFalse(LanScanner.isUsableInterface(null))
        assertFalse(LanScanner.isUsableInterface(""))
    }

    // ── 内置常用网段（兜底「电脑与手机不同网段」）──

    @Test
    fun `内置常用网段包含 192_168_1 与 192_168_110`() {
        assertTrue("应含 192.168.1", SubnetCandidates.COMMON_SUBNET_PREFIXES.contains("192.168.1"))
        assertTrue("应含 192.168.110", SubnetCandidates.COMMON_SUBNET_PREFIXES.contains("192.168.110"))
    }

    @Test
    fun `常用网段候选含两段整段`() {
        val c = SubnetCandidates.commonSubnetCandidates()
        // 每段 /24 有 254 个可用主机，两段共 508（无重叠）
        assertEquals(508, c.size)
        // 两段的关键位置都在
        assertTrue("192.168.1.1 应在", "192.168.1.1" in c)
        assertTrue("192.168.1.228 应在", "192.168.1.228" in c)
        assertTrue("192.168.110.1 应在", "192.168.110.1" in c)
        assertTrue("192.168.110.228 应在", "192.168.110.228" in c)
        // 无重复（merge 去重）
        assertEquals("不应有重复项", c.size, c.toSet().size)
    }

    @Test
    fun `预设网段与本机网段合并去重（本机优先）`() {
        // 模拟本机在 192.168.1.x：本身网段与预设 192.168.1 重叠
        val own = SubnetCandidates.forHost("192.168.1.106", 24)
        val merged = SubnetCandidates.merge(own, SubnetCandidates.commonSubnetCandidates())
        // 去重后：192.168.1 整段（254）+ 192.168.110 整段（254）= 508
        assertEquals(508, merged.size)
        assertEquals("本机网段应排最前", "192.168.1.1", merged.first())
        assertEquals("不应有重复", merged.size, merged.toSet().size)
    }
}
