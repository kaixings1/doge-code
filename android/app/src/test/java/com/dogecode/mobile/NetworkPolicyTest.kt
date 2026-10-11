package com.dogecode.mobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 通知网络策略的单元测试（纯逻辑，可单测）。
 *
 * 这条规则错了是**静默**的：开了「仅 WiFi」却在流量下照推（费流量 + 明文
 * 摘要经运营商），或反过来开了却不推（漏掉重要回复）。必须可单测覆盖。
 */
class NetworkPolicyTest {

    @Test
    fun `未开偏好时不限网络`() {
        assertTrue(NetworkPolicy.allowNotification(wifiOnlyPref = false, isWifi = true))
        assertTrue(NetworkPolicy.allowNotification(wifiOnlyPref = false, isWifi = false))
    }

    @Test
    fun `开了偏好仅 WiFi 允许推送`() {
        assertTrue(NetworkPolicy.allowNotification(wifiOnlyPref = true, isWifi = true))
    }

    @Test
    fun `开了偏好但非 WiFi 禁止推送`() {
        assertFalse(NetworkPolicy.allowNotification(wifiOnlyPref = true, isWifi = false))
    }

    /**
     * 变异验证：把判定改成「总是允许」（忽略 wifiOnlyPref），
     * 本条应失败（确认仅 WiFi 偏好真的会拦截移动数据）。
     */
    @Test
    fun `变异：仅 WiFi 偏好必须拦截非 WiFi`() {
        val result = NetworkPolicy.allowNotification(wifiOnlyPref = true, isWifi = false)
        assert(!result) { "开了仅 WiFi 且非 WiFi 时不应允许推送" }
    }
}
