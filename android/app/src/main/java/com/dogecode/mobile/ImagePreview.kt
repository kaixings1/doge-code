package com.dogecode.mobile

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.BitmapDrawable
import android.util.Base64
import android.util.Log
import android.widget.ImageView

/**
 * 图片预览：把 base64 解成可显示的位图，并在大图查看时按需降采样。
 *
 * 为什么要独立一个对象：base64 解码 + 位图解码是**开销大且易 OOM** 的
 * 操作。相册原图（4000×3000）解成 ARGB_8888 需要约 48MB，连解几张就会
 * 被系统杀掉。故解码必须：
 *   1. 先读边界拿尺寸（inJustDecodeBounds），不真正分配像素
 *   2. 按目标显示尺寸算采样率（inSampleSize），把内存压到 1/4、1/16…
 *   3. 全程 try/catch —— 一张坏图不该让整个对话页崩掉
 *
 * 抽成对象而非散在 Adapter 里：这段逻辑（尤其采样率计算）是纯数学，
 * 可以单测；而它错了的表现是「图糊了」或「App 闪退」，都很难定位。
 */
object ImagePreview {

    private const val TAG = "ImagePreview"

    /**
     * 缩略图的目标像素尺寸上限。
     *
     * 缩略图显示宽度约 200dp，在 3x 屏上是 600px。取 640 留一点余量，
     * 再大就是浪费内存（显示时还要再缩）。
     */
    const val THUMB_TARGET_PX = 640

    /**
     * 计算采样率（inSampleSize）。
     *
     * 返回值是「每 n 个像素取 1 个」，故最终边长约为 原边长 / n，
     * 内存为原来的 1/(n²)。Android 要求该值是 2 的幂。
     *
     * 用「宽高**较小者**仍然够大」作为停止条件：只要任一边还超过目标，
     * 就继续降采样 —— 若用较大者，一张很宽的图会被过度缩小。
     *
     * @param srcW/srcH 原图宽高（必须为正，否则返回 1 避免死循环）
     * @param target 目标边长（px）
     */
    fun sampleSize(srcW: Int, srcH: Int, target: Int): Int {
        // 防御：非法尺寸直接返回 1。若不判，下面的 `min > target` 循环
        // 在 0/负数下行为未定义（0 会导致除零或死循环）
        if (srcW <= 0 || srcH <= 0 || target <= 0) return 1
        var n = 1
        // 用较小边判断：保证两边都不小于目标的一半
        while (minOf(srcW / n, srcH / n) > target) {
            n *= 2
        }
        return n
    }

    /**
     * 把 base64 解成位图。
     *
     * @param target 目标边长（px），用于降采样；传 0 表示不降采样
     * @return 位图；解码失败（坏数据、非图片）时返回 null
     */
    fun decode(base64: String, target: Int): Bitmap? {
        if (base64.isBlank()) return null
        return try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            if (bytes.isEmpty()) return null

            // 第一遍：只读尺寸，不分配像素内存
            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
            if (opts.outWidth <= 0 || opts.outHeight <= 0) return null

            // 第二遍：按采样率真正解码
            val opts2 = BitmapFactory.Options().apply {
                // 缩略图用 RGB_565 就够（省一半内存）；大图看细节保留 ARGB：
                // 但 ARGB_8888 在 4x 原图上极易 OOM，故大图也走降采样后
                // 用 8888。简化为：统一 8888 + 降采样，平衡质量与安全。
                inPreferredConfig = Bitmap.Config.ARGB_8888
                if (target > 0) {
                    inSampleSize = sampleSize(opts.outWidth, opts.outHeight, target)
                }
            }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts2)
        } catch (e: OutOfMemoryError) {
            // OOM 是 Error 不是 Exception，不单独捕会让 App 直接挂掉
            Log.w(TAG, "图片解码内存不足，跳过该图")
            null
        } catch (e: Exception) {
            Log.w(TAG, "图片解码失败：${e.message}")
            null
        }
    }

    /**
     * 把图片渲染进 ImageView（缩略图场景）。
     *
     * @return 是否成功；失败时 ImageView 保持原状（调用方据此决定是否
     *   隐藏该视图，避免留一个空白方块）
     */
    fun renderThumb(imageView: ImageView, base64: String): Boolean {
        val bmp = decode(base64, THUMB_TARGET_PX) ?: return false
        imageView.setImageDrawable(BitmapDrawable(imageView.resources, bmp))
        return true
    }

    /**
     * 判断一张图是否「值得点开看大图」。
     *
     * 判据是**原图比缩略图明显大**：若原图本身就只有 300px，点开也
     * 只是把它放大成模糊的一团，不如不给这个交互（点了没惊喜反而是失望）。
     */
    fun worthPreviewing(base64: String): Boolean {
        if (base64.isBlank()) return false
        return try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
            // 任一边超过缩略图目标的两倍，点开才有意义
            maxOf(opts.outWidth, opts.outHeight) > THUMB_TARGET_PX * 2
        } catch (e: Exception) {
            false
        }
    }
}
