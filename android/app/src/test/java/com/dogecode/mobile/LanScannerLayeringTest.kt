package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 三层扫描（端口 → IP → 网段）的分层判据测试。
 *
 * ## 要钉死的不变量
 *
 * 用户报的痛点是「一个 IP 连不上就换下一个 IP，整段都扫不到」。修复是把搜索
 * 变成三层。这里有两条不变量，任何一条破了都会静默退回旧行为（表现仍是
 * 「扫不到」），必须靠测试拦住：
 *
 * 1. **第一轮端口数 ≥ 否决阈值** —— 否则第一轮永远达不到否决线，死主机
 *    全数存活，第二轮被迫对每个 IP 探满 → 退化成全量扫描。
 * 2. **两轮合计覆盖默认段宽度** —— 存活主机必须能拿到完整端口段，否则
 *    「端口顺延到第 4 个」的实例仍会漏（正是原 bug）。
 */
class LanScannerLayeringTest {

    private val defaultPorts = PortScanRange.portsOf(
        PortScanRange.DEFAULT_START,
        PortScanRange.DEFAULT_END,
    )

    @Test
    fun `第一轮端口数不小于否决阈值（否则死主机否不掉）`() {
        val (first, _) = LanScanner.splitPorts(defaultPorts)
        assertTrue(
            "第一轮端口数(${first.size}) 必须 ≥ 否决阈值(${LanScanner.REJECT_THRESHOLD})，" +
                "否则第一轮永远达不到否决线、第二轮会被迫全量扫描",
            first.size >= LanScanner.REJECT_THRESHOLD,
        )
    }

    @Test
    fun `两轮合计覆盖默认段全部端口`() {
        val (first, second) = LanScanner.splitPorts(defaultPorts)
        val union = (first + second).toSet()
        defaultPorts.forEach { p ->
            assertTrue("端口 $p 必须被某一轮覆盖（漏了就退化为扫不到顺延端口）", p in union)
        }
    }

    @Test
    fun `两轮无重叠（同一端口不该探两次）`() {
        val (first, second) = LanScanner.splitPorts(defaultPorts)
        assertTrue("两轮不应有重叠：${first.intersect(second.toSet())}", first.none { it in second })
    }

    @Test
    fun `第二轮保留端口顺序（低端口优先）`() {
        val (_, second) = LanScanner.splitPorts(defaultPorts)
        assertEquals(second.sorted(), second)
        assertEquals("第二轮首个应是第一轮之后的第一个端口",
            defaultPorts[LanScanner.FIRST_ROUND_PORTS], second.first())
    }

    @Test
    fun `端口数少于阈值时第一轮全取（仍不退化）`() {
        // 用户只配了 2 个端口：第一轮必须取满这 2 个（而不是取 3 个拿不到）
        val (first, second) = LanScanner.splitPorts(listOf(6000, 6001))
        assertEquals(listOf(6000, 6001), first)
        assertTrue("第二轮应为空（端口已取完）", second.isEmpty())
    }

    @Test
    fun `单个端口时第一轮取它且第二轮为空`() {
        val (first, second) = LanScanner.splitPorts(listOf(6000))
        assertEquals(listOf(6000), first)
        assertTrue(second.isEmpty())
    }

    @Test
    fun `空端口表不崩`() {
        val (first, second) = LanScanner.splitPorts(emptyList())
        assertTrue(first.isEmpty())
        assertTrue(second.isEmpty())
    }

    @Test
    fun `两轮合计覆盖全部端口（无截断，修 6011 漏扫）`() {
        // 真机实测缺陷：原先第二轮 `take(8)`，3+8=11 < 段宽 21，
        // 第 12 个端口（6011）起永远扫不到。此用例锁定「完整覆盖」。
        val ports = (6000..6020).toList() // 默认段，21 个
        val (first, second) = LanScanner.splitPorts(ports)
        val union = (first + second).toSet()
        assertEquals("两轮合计必须覆盖全部端口", ports.toSet(), union)
        assertTrue("6011 必须被覆盖（旧实现的漏点）", 6011 in union)
    }

    @Test
    fun `段宽超过 21 时第二轮仍全覆盖（预算自适应）`() {
        // 用户可把段配得更宽；固定预算会随段宽增长再次漏尾部
        val many = (6000 until 6100).toList() // 100 个
        val (first, second) = LanScanner.splitPorts(many)
        assertEquals(many.toSet(), (first + second).toSet())
    }
}
