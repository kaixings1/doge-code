package com.dogecode.mobile

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * API key 的加密存储。
 *
 * ## 为什么手写而不用 androidx.security:security-crypto
 *
 * 那个库**已被 Google 弃用**（官方标注 deprecated，不再维护）。
 * 为一个弃用库引入依赖不划算，而 Android 平台自带的 KeyStore 正是
 * 它底层用的东西 —— 按 YAGNI 阶梯「原生平台特性优先」，
 * 直接用 KeyStore 只需约 60 行，且无额外依赖。
 *
 * ## 方案
 *
 * · 密钥存在 **AndroidKeyStore**（硬件支持的密钥库，密钥**不可导出**）
 * · 用 AES/GCM 加密（GCM 带认证，密文被篡改会解密失败而非返回垃圾）
 * · 密文与 IV 拼接后 Base64 存进普通 SharedPreferences
 *
 * ## 关键安全取舍：失败时**不落盘**
 *
 * 加密不可用（如设备不支持 KeyStore、系统损坏）时，[put] 返回 false
 * 且**不写任何东西**。绝不「降级存明文」—— 那是最糟的选择：
 * 用户以为 key 是安全的，实际是明文躺在 XML 里。
 */
class SecureStore(context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** GCM 推荐的 IV 长度（位）。 */
    private val ivLengthBits = 128

    /** 加密是否可用（设置页据此提示「key 不会被保存」）。 */
    val isAvailable: Boolean by lazy {
        runCatching { secretKey() }.isSuccess
    }

    /**
     * 保存加密值。
     *
     * @return 是否成功；false 表示**没有写入**（加密不可用）
     */
    fun put(key: String, value: String): Boolean {
        if (value.isEmpty()) {
            prefs.edit().remove(key).apply()
            return true
        }
        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, secretKey())
            val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
            // IV 每次加密都不同，必须与密文一起存（GCM 复用 IV 会
            // 彻底破坏安全性），用分隔符拼接后统一 Base64
            val combined = cipher.iv + encrypted
            prefs.edit().putString(key, Base64.encodeToString(combined, Base64.NO_WRAP)).apply()
            true
        }.getOrElse {
            Log.w(TAG, "加密失败，未保存该值：${it.message}")
            false
        }
    }

    /** 读取并解密；不存在或解密失败返回 null。 */
    fun get(key: String): String? {
        val raw = prefs.getString(key, null) ?: return null
        return runCatching {
            val combined = Base64.decode(raw, Base64.NO_WRAP)
            val ivLen = ivLengthBits / 8
            if (combined.size <= ivLen) return null
            val iv = combined.copyOfRange(0, ivLen)
            val cipherText = combined.copyOfRange(ivLen, combined.size)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(ivLengthBits, iv))
            String(cipher.doFinal(cipherText), Charsets.UTF_8)
        }.getOrElse {
            // 解密失败常见原因：用户清了应用数据（KeyStore 密钥被删）。
            // 此时返回 null 让用户重填，而不是崩或返回乱码
            Log.w(TAG, "解密失败（可能密钥已被清除），当作未设置：${it.message}")
            null
        }
    }

    fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }

    /**
     * 取（或首次创建）AES 密钥。
     *
     * 密钥**永不导出**：AndroidKeyStore 里的密钥无法读出字节，
     * 只能用句柄做加解密。即便设备被 root，密钥也在硬件/TEE 保护下。
     */
    private fun secretKey(): SecretKey {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (ks.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }

        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        gen.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                // 刻意**不**要求用户认证（setUserAuthenticationRequired(false)）：
                // 本地模式会在后台跑任务，要求每次解密都验证指纹会让
                // 「切后台回来继续」直接不可用
                .setUserAuthenticationRequired(false)
                .build(),
        )
        return gen.generateKey()
    }

    companion object {
        private const val TAG = "SecureStore"
        private const val PREFS = "doge_local_secure"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "doge_local_api_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
