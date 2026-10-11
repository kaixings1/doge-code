package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * `SubnetCandidates.groupBySubnet` 测试。
 *
 * 这个函数是「换网段」这一层的**唯一依据**：分组错了，扫描就换不了网段
 *（表现为整段扫完没结果就直接结束、而不是继续搜下一个网段）。而「分组错了」
 * 不会报错、也不会让已有用例失败 —— 故必须单独钉死。
 */
class SubnetGroupingTest {

    @Test
    fun `按前三段分组`() {
        val groups = SubnetCandidates.groupBySubnet(
            listOf("192.168.1.5", "192.168.1.9", "192.168.110.3"),
        )
        assertEquals(2, groups.size)
        assertEquals("192.168.1", groups[0].prefix)
        assertEquals(listOf("192.168.1.5", "192.168.1.9"), groups[0].ips)
        assertEquals("192.168.110", groups[1].prefix)
        assertEquals(listOf("192.168.110.3"), groups[1].ips)
    }

    @Test
    fun `组间顺序由各组成员首次出现顺序决定`() {
        // 关键：不能按字典序排 —— 候选列表的顺序即优先级（本机网段排最前）
        val groups = SubnetCandidates.groupBySubnet(
            listOf("10.0.0.1", "192.168.1.1", "10.0.0.2"),
        )
        assertEquals(listOf("10.0.0", "192.168.1"), groups.map { it.prefix })
    }

    @Test
    fun `组内保持原顺序（网关仍排第一）`() {
        val own = SubnetCandidates.forHost("192.168.1.106", 24)
        val groups = SubnetCandidates.groupBySubnet(own)
        assertEquals(1, groups.size)
        assertEquals("网关 .1 必须仍是组内第一个", "192.168.1.1", groups[0].ips.first())
        assertEquals(254, groups[0].ips.size)
    }

    @Test
    fun `非法 IP 被丢弃且不生成空组`() {
        val groups = SubnetCandidates.groupBySubnet(
            listOf("not-an-ip", "192.168.1.1", "1.2.3"),
        )
        assertEquals("只应保留合法 IP 所在的组", 1, groups.size)
        assertEquals("192.168.1", groups[0].prefix)
        assertTrue("不得出现空组", groups.all { it.ips.isNotEmpty() })
    }

    @Test
    fun `空输入返回空列表`() {
        assertTrue(SubnetCandidates.groupBySubnet(emptyList()).isEmpty())
    }

    @Test
    fun `真实候选集被分成多个网段且本机网段排最前`() {
        // 模拟：本机在 192.168.110.x，另有内置常用网段 192.168.1 兜底
        val own = SubnetCandidates.forHost("192.168.110.216", 24)
        val merged = SubnetCandidates.merge(own, SubnetCandidates.commonSubnetCandidates())
        val groups = SubnetCandidates.groupBySubnet(merged)
        assertTrue("至少应有 2 个网段", groups.size >= 2)
        assertEquals("本机网段必须排最前（换网段前先搜完本机段）",
            "192.168.110", groups[0].prefix)
        // 全部候选都在某个组里，一个都不能丢
        assertEquals("分组不得丢 IP", merged.toSet().size, groups.sumOf { it.ips.size })
    }
}
