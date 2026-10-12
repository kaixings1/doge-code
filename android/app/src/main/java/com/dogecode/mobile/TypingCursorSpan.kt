package com.dogecode.mobile

import android.graphics.Canvas
import android.graphics.Paint
import android.text.style.ReplacementSpan

/**
 * 呼吸圆点打字光标。
 *
 * 在光标位置绘制一个小圆，半径在 [MIN_SCALE]..[MAX_SCALE] 间由 ValueAnimator
 * 平滑驱动，模拟「AI 正在输入」的呼吸效果。
 *
 * ## 来源
 *
 * 吸收自 KleanBot（`dev.pegasus.kleanbot.presentation.widget.TypingCursorSpan`，
 * 后者又吸收自 AskMe 的 ChatAdapter）。原实现用 `?attr/colorOnSurface` 取色，
 * 本项目无 Material 主题，故颜色与密度**全部由构造参数传入**（见 [ChatAdapter]）。
 *
 * ## 为什么密度要显式传
 *
 * 原实现曾用 `paint.textSize / 16f` 近似密度，只在「16sp @ density=3」时巧合正确；
 * 改字号或换屏幕就失效。故这里要求调用方传 `resources.displayMetrics.density`。
 */
class TypingCursorSpan(
    private val dotColor: Int,
    private val baseDotRadiusDp: Float = 3.5f,
    /** 显示密度。由调用方从 resources.displayMetrics.density 传入（默认 1.0 仅兜底）。 */
    private val density: Float = 1.0f,
) : ReplacementSpan() {

    /** 当前缩放（由 ValueAnimator 驱动，范围 MIN_SCALE..MAX_SCALE）。 */
    var scale: Float = 1f

    override fun getSize(
        paint: Paint,
        text: CharSequence?,
        start: Int,
        end: Int,
        fm: Paint.FontMetricsInt?,
    ): Int {
        // 行高沿用原字体度量：ReplacementSpan 若返回 0 高度会把行压扁
        fm?.let {
            val originalFm = paint.fontMetricsInt
            it.top = originalFm.top
            it.ascent = originalFm.ascent
            it.descent = originalFm.descent
            it.bottom = originalFm.bottom
        }
        // 预留宽度 = 圆点最大直径 + 左右留白
        return ((baseDotRadiusDp * MAX_SCALE * 2f + HORIZONTAL_PADDING_DP) * density).toInt()
    }

    override fun draw(
        canvas: Canvas,
        text: CharSequence?,
        start: Int,
        end: Int,
        x: Float,
        top: Int,
        y: Int,
        bottom: Int,
        paint: Paint,
    ) {
        val radius = baseDotRadiusDp * density * scale
        val padding = HORIZONTAL_PADDING_DP * density

        // 保存/恢复 paint 状态：ReplacementSpan 与外层共用同一个 Paint，
        // 改了不还原会污染后续文字（表现为整段变色/变粗）。
        val savedColor = paint.color
        val savedStyle = paint.style
        val savedAntiAlias = paint.isAntiAlias

        paint.color = dotColor
        paint.style = Paint.Style.FILL
        paint.isAntiAlias = true

        val fm = paint.fontMetricsInt
        val centerY = y.toFloat() + (fm.descent + fm.ascent) / 2f
        // centerX 用与 getSize 相同的密度口径，保证圆点落在预留宽度内
        val centerX = x + padding + baseDotRadiusDp * MAX_SCALE * density

        canvas.drawCircle(centerX, centerY, radius, paint)

        paint.color = savedColor
        paint.style = savedStyle
        paint.isAntiAlias = savedAntiAlias
    }

    companion object {
        const val MIN_SCALE = 0.5f
        const val MAX_SCALE = 1.2f
        private const val HORIZONTAL_PADDING_DP = 4f
    }
}
