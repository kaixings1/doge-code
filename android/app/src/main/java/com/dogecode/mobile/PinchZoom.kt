package com.dogecode.mobile

import android.content.Context
import kotlin.math.abs

/**
 * 双指缩放字号的纯逻辑（可单测）。
 *
 * ## 为什么不直接改「字号」偏好
 *
 * 那个偏好是**三档枚举**（小/中/大 → 0.85 / 1.0 / 1.2）。
 * 用户双指捏出一个 1.08 的倍率时，它**没有对应的档位** ——
 * 强行归到最近档会让捏合「跳档」（手一松字就跳变），
 * 体验比不缩放还差。故：
 *
 * · 预设档位仍是「基准」（用户可在设置里选）
 * · 捏合倍率是**乘数**，叠加在基准上，可连续变化
 * · 两者相乘得到最终 fontScale
 *
 * 这样捏合与预设互不干扰：改预设不影响已捏的倍率，
 * 捏合也不会覆盖用户选的档位。
 *
 * ## 为什么要抽成纯逻辑
 *
 * 缩放比例→倍率的换算涉及多个易错边界（上下限、突变、无效值），
 * 且错了表现为「字突然变得极大/极小」或「捏了没反应」，
 * 在真机上要反复试才发现。
 */
object PinchZoom {

    /**
     * 捏合倍率的上下限。
     *
     * 与预设档位相乘后的**总倍率**应在可读范围内：
     * · 下限 0.7：再小就看不清了（配合 small 档 → 0.6，已是极限）
     * · 上限 2.5：再大一个汉字占半屏，毫无意义
     */
    const val MIN_FACTOR = 0.7f
    const val MAX_FACTOR = 2.5f

    /** 默认倍率（未捏过时）。 */
    const val DEFAULT_FACTOR = 1.0f

    /**
     * 把 ScaleGestureDetector 给出的 scaleFactor 累积到当前倍率。
     *
     * @param current 当前倍率
     * @param scaleFactor 本次事件的缩放比例（>1 放大，<1 缩小）
     * @return 新的倍率（已夹到 [MIN_FACTOR, MAX_FACTOR]）
     *
     * 边界：`scaleFactor` 为 1 时（手指没动但触发了事件）返回原值；
     * 非有限值（NaN/Infinity，某些设备异常时会出现）同样返回原值 ——
     * 一旦把 NaN 存进倍率，后续所有计算都会是 NaN，字号会变成 0。
     */
    fun applyScale(current: Float, scaleFactor: Float): Float {
        if (!isSane(scaleFactor) || !isSane(current)) return safe(current)
        val next = current * scaleFactor
        return next.coerceIn(MIN_FACTOR, MAX_FACTOR)
    }

    /**
     * 计算最终字号倍率。
     *
     * @param presetFactor 设置里的档位倍率（0.85 / 1.0 / 1.2）
     * @param pinchFactor 捏合倍率
     * @return 两者相乘，并夹到**最终可用范围**
     *
     * 为什么还要夹一次：相乘后可能超出可读范围（如 large 档 1.2 ×
     * 2.5 = 3.0），那时字会大到一行两个字。
     */
    fun finalScale(presetFactor: Float, pinchFactor: Float): Float {
        val p = if (isSane(presetFactor)) presetFactor else 1.0f
        val z = if (isSane(pinchFactor)) pinchFactor else DEFAULT_FACTOR
        return (p * z).coerceIn(ABSOLUTE_MIN, ABSOLUTE_MAX)
    }

    /** 设置里三档对应的倍率（**单一来源**，避免多处硬编码不一致）。 */
    fun presetFactor(prefValue: String): Float = when (prefValue) {
        "small" -> 0.85f
        "large" -> 1.2f
        else -> 1.0f
    }

    /**
     * 捏合倍率是否「接近默认值」——用于决定是否值得持久化。
     *
     * 捏到 1.00x 与 1.001x 没有区别，存下来只会让偏好文件多一个
     * 无意义的键。接近时按默认值处理（不存）。
     */
    fun isDefault(factor: Float): Boolean = abs(factor - DEFAULT_FACTOR) < 0.01f

    /**
     * 最终倍率的绝对范围。
     *
     * 比「预设 × 捏合」的各自范围更严：它约束的是**用户实际看到的大小**。
     * 0.5 倍已经是「贴脸看」的极限，2.5 倍已是「一行两个字」。
     */
    const val ABSOLUTE_MIN = 0.5f
    const val ABSOLUTE_MAX = 2.5f

    private fun isSane(v: Float): Boolean = v.isFinite() && v > 0f

    private fun safe(v: Float): Float =
        if (isSane(v)) v.coerceIn(MIN_FACTOR, MAX_FACTOR) else DEFAULT_FACTOR
}

/**
 * 捏合倍率的持久化。
 *
 * 与 [ScanPortPrefs] 同构（自由数值型，不适合放进枚举型的 LocalPrefs）。
 * 用**整百倍**存（如 1.08 → 108）而非 float：SharedPreferences 的
 * float 有精度问题，且存整数便于将来做迁移。
 */
class PinchZoomPrefs(context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** 读取捏合倍率（非法值回落默认）。 */
    fun factor(): Float {
        val raw = prefs.getInt(KEY_FACTOR, (PinchZoom.DEFAULT_FACTOR * 100).toInt())
        val f = raw / 100f
        // 防御：手工改坏的 prefs 不该让字号变成 NaN/0
        return if (f.isFinite() && f in PinchZoom.MIN_FACTOR..PinchZoom.MAX_FACTOR) {
            f
        } else {
            PinchZoom.DEFAULT_FACTOR
        }
    }

    /** 保存捏合倍率（接近默认值时**删除键**，不留无意义的值）。 */
    fun setFactor(f: Float) {
        if (!f.isFinite() || PinchZoom.isDefault(f)) {
            prefs.edit().remove(KEY_FACTOR).apply()
            return
        }
        val clamped = f.coerceIn(PinchZoom.MIN_FACTOR, PinchZoom.MAX_FACTOR)
        prefs.edit().putInt(KEY_FACTOR, Math.round(clamped * 100)).apply()
    }

    fun reset() {
        prefs.edit().remove(KEY_FACTOR).apply()
    }

    companion object {
        private const val PREFS = "doge_mobile_zoom"
        private const val KEY_FACTOR = "pinch_factor"
    }
}
