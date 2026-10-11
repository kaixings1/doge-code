package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 双指缩放字号的纯逻辑测试。
 *
 * 为什么必须测：换算错了的表现都很糟且难查：
 * · 未夹上下限 → 捏几下字号变到极大/极小，用户以为界面坏了
 * · NaN 未拦 → 一旦存进倍率，后续计算全是 NaN，字号变 0（整屏空白）
 * · 预设与捏合相乘后未再夹 → large 档 × 大倍率 = 一行两个字
 *
 * 变异验证：把 applyScale 的 coerceIn 去掉，「超过上限被夹住」用例失败。
 */
class PinchZoomTest {

    // ── applyScale ──

    @Test
    fun `放大时倍率增加`() {
        assertEquals(1.5f, PinchZoom.applyScale(1.0f, 1.5f), 0.001f)
    }

    @Test
    fun `缩小时倍率减少`() {
        assertEquals(0.8f, PinchZoom.applyScale(1.0f, 0.8f), 0.001f)
    }

    @Test
    fun `多次捏合累积`() {
        var f = 1.0f
        f = PinchZoom.applyScale(f, 1.2f)
        f = PinchZoom.applyScale(f, 1.2f)
        assertEquals(1.44f, f, 0.001f)
    }

    @Test
    fun `超过上限被夹住`() {
        // 不夹的话用户捏几下会到 10 倍，一行两个字
        assertEquals(PinchZoom.MAX_FACTOR, PinchZoom.applyScale(2.4f, 2.0f), 0.001f)
    }

    @Test
    fun `低于下限被夹住`() {
        assertEquals(PinchZoom.MIN_FACTOR, PinchZoom.applyScale(0.8f, 0.5f), 0.001f)
    }

    @Test
    fun `scaleFactor 为 1 时不变`() {
        assertEquals(1.3f, PinchZoom.applyScale(1.3f, 1.0f), 0.001f)
    }

    // ── 非法值防御（关键：NaN 会让字号变 0）──

    @Test
    fun `NaN 的 scaleFactor 不破坏倍率`() {
        // 某些设备异常时会给出 NaN；一旦存进倍率，
        // 后续所有乘法都是 NaN，字号变成 0 → 整屏空白
        assertEquals(1.2f, PinchZoom.applyScale(1.2f, Float.NaN), 0.001f)
    }

    @Test
    fun `Infinity 的 scaleFactor 不破坏倍率`() {
        assertEquals(1.2f, PinchZoom.applyScale(1.2f, Float.POSITIVE_INFINITY), 0.001f)
        assertEquals(1.2f, PinchZoom.applyScale(1.2f, Float.NEGATIVE_INFINITY), 0.001f)
    }

    @Test
    fun `零或负的 scaleFactor 不破坏倍率`() {
        // 为 0 会让倍率变 0（字号消失），为负会让字号反向
        assertEquals(1.2f, PinchZoom.applyScale(1.2f, 0f), 0.001f)
        assertEquals(1.2f, PinchZoom.applyScale(1.2f, -1f), 0.001f)
    }

    @Test
    fun `current 为 NaN 时回落到默认`() {
        assertEquals(PinchZoom.DEFAULT_FACTOR, PinchZoom.applyScale(Float.NaN, 1.2f), 0.001f)
    }

    // ── finalScale（预设 × 捏合）──

    @Test
    fun `预设与捏合相乘`() {
        // large 档 1.2 × 捏合 1.5
        assertEquals(1.8f, PinchZoom.finalScale(1.2f, 1.5f), 0.001f)
    }

    @Test
    fun `默认档与默认捏合等于 1`() {
        assertEquals(1.0f, PinchZoom.finalScale(1.0f, 1.0f), 0.001f)
    }

    @Test
    fun `相乘后超出绝对上限被夹住`() {
        // large 1.2 × max 2.5 = 3.0 → 夹到 2.5
        assertEquals(PinchZoom.ABSOLUTE_MAX, PinchZoom.finalScale(1.2f, 2.5f), 0.001f)
    }

    @Test
    fun `相乘后低于绝对下限被夹住`() {
        // small 0.85 × min 0.7 = 0.595 → 夹到 0.5
        val r = PinchZoom.finalScale(0.85f, 0.7f)
        assertTrue("不应低于绝对下限", r >= PinchZoom.ABSOLUTE_MIN)
    }

    @Test
    fun `非法预设值回落到 1`() {
        assertEquals(1.0f, PinchZoom.finalScale(Float.NaN, 1.0f), 0.001f)
        assertEquals(1.0f, PinchZoom.finalScale(0f, 1.0f), 0.001f)
    }

    @Test
    fun `非法捏合值回落到默认`() {
        assertEquals(1.2f, PinchZoom.finalScale(1.2f, Float.NaN), 0.001f)
    }

    @Test
    fun `最终倍率始终在绝对范围内`() {
        // 穷举极端组合，保证不会出现 0 或超大值
        val presets = listOf(0.85f, 1.0f, 1.2f)
        val pinches = listOf(0.7f, 1.0f, 2.5f)
        for (p in presets) {
            for (z in pinches) {
                val r = PinchZoom.finalScale(p, z)
                assertTrue("$p × $z = $r 应在范围内", r in PinchZoom.ABSOLUTE_MIN..PinchZoom.ABSOLUTE_MAX)
            }
        }
    }

    // ── presetFactor ──

    @Test
    fun `三档预设映射正确`() {
        assertEquals(0.85f, PinchZoom.presetFactor("small"), 0.001f)
        assertEquals(1.0f, PinchZoom.presetFactor("medium"), 0.001f)
        assertEquals(1.2f, PinchZoom.presetFactor("large"), 0.001f)
    }

    @Test
    fun `未知预设回落 1`() {
        assertEquals(1.0f, PinchZoom.presetFactor("weird"), 0.001f)
        assertEquals(1.0f, PinchZoom.presetFactor(""), 0.001f)
    }

    // ── isDefault ──

    @Test
    fun `接近默认值视为默认`() {
        assertTrue(PinchZoom.isDefault(1.0f))
        assertTrue(PinchZoom.isDefault(1.005f))
        assertFalse(PinchZoom.isDefault(1.1f))
        assertFalse(PinchZoom.isDefault(0.9f))
    }

    @Test
    fun `上下限常量合理`() {
        assertTrue(PinchZoom.MIN_FACTOR < 1f)
        assertTrue(PinchZoom.MAX_FACTOR > 1f)
        assertTrue(PinchZoom.ABSOLUTE_MIN <= PinchZoom.MIN_FACTOR)
        assertTrue(PinchZoom.ABSOLUTE_MAX >= PinchZoom.MAX_FACTOR)
    }
}
