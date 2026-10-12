package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 扫描端口范围的规范化测试。
 *
 * 为什么必须测：三种非法输入的表现**都不是报错，而是「扫不到」**：
 * · 起点 > 终点 → Kotlin 的 `(start..end)` 是空区间 → 一个都不扫
 * · 越界 → 全部探测失败
 * · 跨度太大 → 卡很久（每端口一次请求）
 * 用户看到的是「服务明明起来了，手机上扫不到会话」，而这归因极难。
 *
 * 变异验证：把 normalize 里 `if (end < start) start` 改成 `end`，
 * 「起止写反时纠正为起点……」用例失败（空区间会返回 0 个端口）。
 */
class PortScanRangeTest {

    @Test
    fun `默认范围覆盖多实例顺延的 21 个端口`() {
        // 服务端起始端口被占时会顺延；用户可能同时开多个 CLI 实例，
        // 默认段 6000-6020 共 21 个端口覆盖这一场景。
        // （旧断言写「10 个 / +9」—— 段宽后来扩到 21，测试没跟上。）
        // 用常量而非字面量：默认起点会随服务端默认值调整（曾由 5680 改为 6000）。
        val (s, e) = PortScanRange.normalize(
            PortScanRange.DEFAULT_START,
            PortScanRange.DEFAULT_END,
        )
        assertEquals(PortScanRange.DEFAULT_START, s)
        assertEquals(PortScanRange.DEFAULT_START + 20, e)
        assertEquals(21, PortScanRange.countOf(s, e))
    }

    @Test
    fun `默认起点与服务端默认起始端口一致 6000`() {
        // 两端默认值必须相同，否则新用户开箱即扫不到（服务起来了、
        // 手机找不到，两端各自看都正常，归因极难）。
        // 服务端常量：src/bridge/mobileBridge.ts 的 DEFAULT_MOBILE_PORT
        assertEquals(6000, PortScanRange.DEFAULT_START)
    }

    @Test
    fun `默认结束端口等于起始加 20`() {
        // 段宽 21（起止都含），与上方「覆盖 21 个端口」一致
        assertEquals(PortScanRange.DEFAULT_START + 20, PortScanRange.DEFAULT_END)
    }

    @Test
    fun `起止写反时纠正为可用区间而非空区间`() {
        // 关键：Kotlin 的 (6000..5680) 是**空**的，会一个都不扫
        val (s, e) = PortScanRange.normalize(6000, 5680)
        assertEquals(6000, s)
        assertEquals(6000, e)
        assertTrue("必须至少有一个端口", PortScanRange.countOf(6000, 5680) >= 1)
    }

    @Test
    fun `起始端口越界时回落默认`() {
        assertEquals(
            PortScanRange.DEFAULT_START to PortScanRange.DEFAULT_END,
            PortScanRange.normalize(0, 5700),
        )
        assertEquals(
            PortScanRange.DEFAULT_START to PortScanRange.DEFAULT_END,
            PortScanRange.normalize(70000, 70100),
        )
    }

    @Test
    fun `结束端口越界时回落默认`() {
        assertEquals(
            PortScanRange.DEFAULT_START to PortScanRange.DEFAULT_END,
            PortScanRange.normalize(5680, 99999),
        )
    }

    @Test
    fun `跨度过大时被截到上限`() {
        // 1024..65535 逐端口请求会卡几分钟。
        // 起始用 1024（合法下限）而非 1000 —— 1000 是特权端口，会被
        // 越界判据拦下并回落默认，测的就不是「截断」了
        val (s, e) = PortScanRange.normalize(PortScanRange.MIN_PORT, 65000)
        assertTrue("应被截断", e - s + 1 <= PortScanRange.MAX_SPAN)
        assertEquals(PortScanRange.MIN_PORT, s)
    }

    @Test
    fun `合法范围原样返回`() {
        assertEquals(6000 to 6010, PortScanRange.normalize(6000, 6010))
    }

    @Test
    fun `单个端口也合法`() {
        assertEquals(5680 to 5680, PortScanRange.normalize(5680, 5680))
        assertEquals(1, PortScanRange.countOf(5680, 5680))
    }

    @Test
    fun `portsOf 展开成连续列表`() {
        assertEquals(listOf(5680, 5681, 5682), PortScanRange.portsOf(5680, 5682))
    }

    @Test
    fun `portsOf 对非法输入回落到默认范围`() {
        val ports = PortScanRange.portsOf(0, 0)
        assertEquals(PortScanRange.DEFAULT_START, ports.first())
        assertEquals(PortScanRange.DEFAULT_END, ports.last())
    }

    @Test
    fun `端口数上限是 100 而不是不设限`() {
        // 不设限会让用户填 1..65535 时扫描卡死
        assertEquals(100, PortScanRange.MAX_SPAN)
    }

    @Test
    fun `默认范围在合法区间内`() {
        assertTrue(PortScanRange.DEFAULT_START >= PortScanRange.MIN_PORT)
        assertTrue(PortScanRange.DEFAULT_END <= PortScanRange.MAX_PORT)
    }
}
