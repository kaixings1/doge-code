package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 图片缩略图解码的采样率计算测试（纯数学部分）。
 *
 * 为什么必须测：采样率算错的两个方向都不会报错 ——
 *   ① 算太小（n 偏大）→ 图糊得看不清，用户以为图坏了
 *   ② 算太大（n 偏小）→ 内存暴涨，几张图就 OOM 闪退
 * 而这段是纯数学，最该被钉死。
 *
 * 变异验证：把 while 条件里的 `minOf` 改成 `maxOf`，
 * 「很宽的图不被过度缩小」用例失败。
 */
class ImagePreviewTest {

    @Test
    fun `小于目标时不需要降采样`() {
        assertEquals(1, ImagePreview.sampleSize(300, 200, 640))
    }

    @Test
    fun `恰好等于目标时不降采样`() {
        // 边界：等于目标说明刚好够用，再降就糊了
        assertEquals(1, ImagePreview.sampleSize(640, 640, 640))
    }

    @Test
    fun `两倍于目标时降到 1 2`() {
        assertEquals(2, ImagePreview.sampleSize(1280, 1280, 640))
    }

    @Test
    fun `四倍于目标时降到 1 4`() {
        assertEquals(4, ImagePreview.sampleSize(2560, 2560, 640))
    }

    @Test
    fun `返回的采样率是 2 的幂（Android 要求）`() {
        listOf(1200, 3000, 8000, 12000).forEach { size ->
            val n = ImagePreview.sampleSize(size, size, 640)
            assertTrue("$size 的采样率 $n 应是 2 的幂", n > 0 && (n and (n - 1)) == 0)
        }
    }

    @Test
    fun `很宽的图不被过度缩小（用较小边判断）`() {
        // 8000×1000：若按较大边（8000）判断会降到 1/8，
        // 结果高度只剩 125px，糊得没法看。
        // 按较小边（1000）判断应降到 1/2（高度 500，够用）。
        val n = ImagePreview.sampleSize(8000, 1000, 640)
        assertEquals("应按较小边判断", 2, n)
        assertTrue("高度不应被缩到低于目标的一半", 1000 / n >= 320)
    }

    @Test
    fun `很高的图同样不被过度缩小`() {
        val n = ImagePreview.sampleSize(1000, 8000, 640)
        assertEquals(2, n)
    }

    // ── 防御性边界（这些若不挡会死循环或除零）──

    @Test
    fun `宽为 0 时返回 1 而非死循环`() {
        assertEquals(1, ImagePreview.sampleSize(0, 1000, 640))
    }

    @Test
    fun `高为负数时返回 1`() {
        assertEquals(1, ImagePreview.sampleSize(1000, -5, 640))
    }

    @Test
    fun `目标为 0 时返回 1（不做降采样）`() {
        assertEquals(1, ImagePreview.sampleSize(1000, 1000, 0))
    }

    @Test
    fun `超大尺寸不会无限循环`() {
        // 8K 图：应快速收敛到有限值
        val n = ImagePreview.sampleSize(7680, 4320, 640)
        assertTrue("应有限且为 2 的幂", n in listOf(2, 4, 8))
    }

    @Test
    fun `缩略图目标尺寸是合理值`() {
        // 160dp 的显示宽度在 3x 屏上约 480px，640 留有余量；
        // 过大浪费内存，过小会糊
        assertTrue(
            "THUMB_TARGET_PX 应在 480..1024",
            ImagePreview.THUMB_TARGET_PX in 480..1024,
        )
    }
}
