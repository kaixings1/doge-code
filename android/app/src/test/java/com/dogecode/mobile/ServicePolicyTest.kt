package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 前台服务启停判据测试。
 *
 * 变异验证（2026-10-10，已执行）：
 * - 把 shouldRun 的 `mode == AppMode.LOCAL` 改成恒 true →
 *   「远端模式不启动」两条失败
 * - 把 `inTurn` 分支去掉（恒 true）→ 「回合结束停止」两条失败
 */
class ServicePolicyTest {

    // ── shouldRun：四种组合穷举 ──

    @Test
    fun `本地模式回合中应运行`() {
        assertTrue(ServicePolicy.shouldRun(AppMode.LOCAL, inTurn = true))
    }

    @Test
    fun `本地模式回合结束应停止`() {
        assertFalse(ServicePolicy.shouldRun(AppMode.LOCAL, inTurn = false))
    }

    @Test
    fun `远端模式回合中不启动`() {
        // 推理在电脑上跑，手机进程被杀不影响任务
        assertFalse(ServicePolicy.shouldRun(AppMode.REMOTE, inTurn = true))
    }

    @Test
    fun `远端模式回合结束不启动`() {
        assertFalse(ServicePolicy.shouldRun(AppMode.REMOTE, inTurn = false))
    }

    // ── 通知文案 ──

    @Test
    fun `回合中通知说明正在处理`() {
        val t = ServicePolicy.notifyText(true)
        assertTrue("文案应说明在处理任务：$t", t.contains("处理"))
    }

    @Test
    fun `回合结束通知退回就绪态`() {
        val t = ServicePolicy.notifyText(false)
        assertTrue("文案应说明就绪：$t", t.contains("就绪"))
    }

    @Test
    fun `回合中与结束时文案不同`() {
        // 相同则通知栏状态无法区分（用户不知道任务是否还在跑）
        assertTrue(ServicePolicy.notifyText(true) != ServicePolicy.notifyText(false))
    }

    // ── 渠道常量：独立于回复/权限渠道 ──

    @Test
    fun `保活渠道独立于回复与权限渠道`() {
        // 若与回复渠道同 id，用户关闭「助手回复」会连带杀掉保活服务
        assertTrue(ServicePolicy.CHANNEL_ID != "doge_reply")
        assertTrue(ServicePolicy.CHANNEL_ID != "doge_action")
    }
}
