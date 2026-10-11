package com.dogecode.mobile

/**
 * 应用锁（设备凭据解锁）的判定逻辑（纯函数，可单测，零 Android 依赖）。
 *
 * 为什么抽出来：App 锁只在「用户开了开关 **且** 设备设置了锁屏凭据」时才生效。
 * 这两条条件的**组合**有 3 种结果，且「开了开关但设备没设锁屏」必须**降级为
 * 不开锁**（不能让用户卡在一个永远弹不出解锁的界面上），而不是抛错或卡死。
 * 这个分支组合易错且错了是「开不了 App」级别的严重问题，必须可单测。
 *
 * 用「设备锁屏凭据」而非仅「生物识别」：
 * 通过 [android.app.KeyguardManager] 的 `createConfirmDeviceCredentialIntent`
 * 弹出系统解锁界面 —— 它涵盖**指纹 / 人脸 / PIN / 图案 / 密码**全部锁屏方式，
 * 且不依赖任何第三方库（纯 framework API，minSdk 24 即可）。
 * 没录入指纹的设备只要设了 PIN/密码照样能解锁 App，覆盖面比纯生物识别大得多。
 * 选型符合本工程的 YAGNI 阶梯：原生平台特性优先、不引依赖。
 *
 * 与 [SecureStore] 的关系（刻意分离）：
 * - SecureStore 里 API key 的密钥**不**绑定用户认证（setUserAuthenticationRequired(false)），
 *   因为本地模式后台要跑任务，每次解密都验指纹会让「切后台回来继续」直接废掉。
 * - 本类的 App 锁只保护「打开 App 后看到对话/历史/配置」这一层 —— 与银行 App
 *   「打开先看锁」同语义。它**不**参与密钥解密，只是启动门禁。
 *   这两层目标不同，混在一起会互相破坏（见上）。
 *
 * 安全边界：解锁只做「解锁查看」，失败/取消由调用方决定（本类不负责 UI）。
 * 判定结果见 [Status]。
 */
object AppLock {

    /**
     * 应用锁应处的状态。
     *
     * - [OFF]：开关关闭，不要求解锁（默认行为，升级用户无感）。
     * - [REQUIRED]：开关开 **且** 设备设置了锁屏凭据，启动时必须解锁。
     * - [UNSUPPORTED]：开关开但设备未设锁屏凭据 —— **必须降级为不开锁**，
     *   否则用户会卡在一个永远弹不出解锁的界面（比不开锁更糟）。
     */
    enum class Status { OFF, REQUIRED, UNSUPPORTED }

    /**
     * 计算应用锁状态。
     *
     * @param prefOn        用户是否开启「应用锁」开关。
     * @param hasCredential 设备是否设置了锁屏凭据（由调用方用
     *        [android.app.KeyguardManager.isKeyguardSecure] 判定后传入，
     *        便于在 JVM 单测中注入）。
     *
     * 组合表（覆盖全部 2×2）：
     * | prefOn | 有凭据 | 结果        |
     * |--------|--------|-------------|
     * | false  | 任何   | OFF         |
     * | true   | true   | REQUIRED   |
     * | true   | false  | UNSUPPORTED |
     */
    fun evaluate(prefOn: Boolean, hasCredential: Boolean): Status =
        if (!prefOn) {
            Status.OFF
        } else if (hasCredential) {
            Status.REQUIRED
        } else {
            Status.UNSUPPORTED
        }

    /** 是否应在启动时拦截（REQUIRED 才拦；UNSUPPORTED 不拦，避免卡死）。 */
    fun shouldLock(prefOn: Boolean, hasCredential: Boolean): Boolean =
        evaluate(prefOn, hasCredential) == Status.REQUIRED
}
