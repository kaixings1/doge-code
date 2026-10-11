package com.dogecode.mobile

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import android.util.Log
import java.io.ByteArrayOutputStream
import kotlin.math.max

/**
 * 把相册/相机来的图片压成可发送的 base64。
 *
 * 为什么必须压缩：手机拍的原图常达 5-10MB，base64 后按 4/3 膨胀到
 * 7-13MB 字符串 —— 一次 WebSocket 帧发这么大既慢（弱网下几十秒）
 * 又可能触发服务端或运行时的帧上限。而 AI 看清一张代码截图只需
 * 长边约 1600px、JPEG 质量 80，此时通常 100-300KB，压缩比 20-50 倍。
 *
 * 为什么用两步（inSampleSize + 质量递减）而不是一步到位：
 * - inSampleSize 是解码期降采样，省内存（避免先解出 4000x3000 的位图）
 * - 质量递减只在必要时触发，保证绝大多数图片一次就达标
 *
 * 不引入第三方图片库：系统 API 足够，不增加依赖体积。
 */
object ImageCompressor {

    private const val TAG = "ImageCompressor"

    /** 长边上限。更大对"看清截图内容"没有边际收益，只是浪费带宽。 */
    private const val MAX_DIMENSION = 1600

    /** 目标字节上限。base64 前的大小；超过则继续降质量。 */
    private const val MAX_BYTES = 900 * 1024

    private const val START_QUALITY = 82
    private const val MIN_QUALITY = 40

    /**
     * 读取并压缩。
     *
     * @return (mediaType, base64) ；失败返回 null（调用方需给出用户可见提示，
     *   静默失败会让用户以为图片已发出）
     */
    fun compress(context: Context, uri: Uri): Pair<String, String>? {
        var bitmap: Bitmap? = null
        return try {
            // 第一步：只读边界，算出需要的降采样倍数，避免先把大图解进内存
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            context.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, bounds)
            }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
                Log.w(TAG, "无法读取图片尺寸: $uri")
                return null
            }

            val opts = BitmapFactory.Options().apply {
                inSampleSize = computeSampleSize(bounds.outWidth, bounds.outHeight)
            }
            context.contentResolver.openInputStream(uri)?.use {
                bitmap = BitmapFactory.decodeStream(it, null, opts)
            }
            val src = bitmap ?: run {
                Log.w(TAG, "解码图片失败: $uri")
                return null
            }

            // 第二步：若仍超长边限制，等比缩放到上限
            val scaled = scaleToLimit(src)

            val bytes = encodeWithQualityLimit(scaled)
            if (bytes == null) {
                Log.w(TAG, "编码图片失败: $uri")
                return null
            }
            "image/jpeg" to Base64.encodeToString(bytes, Base64.NO_WRAP)
        } catch (e: Exception) {
            // 外部存储异常、URI 失效、OOM 等都可能发生 —— 一律当作读取失败返回
            Log.w(TAG, "处理图片异常: ${e.message}")
            null
        } finally {
            bitmap?.recycle()
        }
    }

    /** 计算解码降采样倍数（2 的幂），使解码后的尺寸不小于上限。 */
    private fun computeSampleSize(width: Int, height: Int): Int {
        var sample = 1
        var w = width
        var h = height
        while (max(w, h) / 2 >= MAX_DIMENSION) {
            w /= 2
            h /= 2
            sample *= 2
        }
        return sample
    }

    /** 等比缩放使长边不超过 MAX_DIMENSION。已达标则原样返回。 */
    private fun scaleToLimit(src: Bitmap): Bitmap {
        val longSide = max(src.width, src.height)
        if (longSide <= MAX_DIMENSION) return src
        val ratio = MAX_DIMENSION.toFloat() / longSide
        val w = (src.width * ratio).toInt().coerceAtLeast(1)
        val h = (src.height * ratio).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(src, w, h, true)
    }

    /**
     * 按质量递减编码，直到体积达标或触底。
     *
     * 触底（MIN_QUALITY）仍超标时返回当前结果而非失败：
     * 一张质量 40 的大图也好过完全发不出去，且此时用户至少有反馈。
     */
    private fun encodeWithQualityLimit(src: Bitmap): ByteArray? {
        var quality = START_QUALITY
        var out = ByteArrayOutputStream()
        src.compress(Bitmap.CompressFormat.JPEG, quality, out)
        while (out.size() > MAX_BYTES && quality > MIN_QUALITY) {
            quality -= 10
            out = ByteArrayOutputStream()
            src.compress(Bitmap.CompressFormat.JPEG, quality, out)
        }
        return out.toByteArray()
    }
}
