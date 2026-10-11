package com.dogecode.mobile

/**
 * 通知网络策略（纯逻辑，可单测）。
 *
 * 只回答一个问题：「当前是否允许推送通知」。
 *
 * 为什么抽成纯逻辑类而不是在 Notifications 里直接查 ConnectivityManager：
 * · 查网络需要 Context + 真机/模拟器，单测跑不了
 * · 判定规则本身（仅 WiFi 偏好 × 当前是否 WiFi）是容易被改错的逻辑，
 *   必须可单测，否则「开了开关却还在流量下推」这类 bug 是**静默**的
 *
 * [isWifi] 由调用方注入（Android 侧用 [android.net.ConnectivityManager]
 * 判断），本类只负责规则组合 —— 依赖倒置，单测时传布尔即可。
 */
object NetworkPolicy {

    /**
     * @param wifiOnlyPref 用户是否开了「仅 WiFi 推送」
     * @param isWifi 当前网络是否为 WiFi
     * @return 是否允许推送
     */
    fun allowNotification(wifiOnlyPref: Boolean, isWifi: Boolean): Boolean {
        // 没开偏好 → 不限网络（WiFi / 移动数据都允许）
        // 开了偏好 → 必须 WiFi（移动数据下直接禁止）
        return !wifiOnlyPref || isWifi
    }
}
