package com.dogecode.mobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 回合状态判据的测试。
 *
 * 两个判据各配一条「反向」用例：把条件取反后断言应失败，证明测试
 * 真实覆盖了该分支，而不是复刻生产逻辑恒真通过。
 */
class TurnStateTest {

    private fun local(vararg rows: Triple<String, String, String>) =
        rows.map { TurnState.EchoCandidate(it.first, it.second, it.third) }

    // ── startOnSend ──

    @Test
    fun `发送成功且交互模式则开启回合`() {
        assertTrue(TurnState.startOnSend(sendOk = true, interactive = true))
    }

    @Test
    fun `发送成功但非交互模式不开回合`() {
        // 非交互模式消息只入队不被消费，assistant 永不到来。
        // 若此处返回 true，中断按钮与进度条会永久停留。
        assertFalse(TurnState.startOnSend(sendOk = true, interactive = false))
    }

    @Test
    fun `发送失败不开回合`() {
        assertFalse(TurnState.startOnSend(sendOk = false, interactive = true))
    }

    @Test
    fun `发送失败且非交互模式不开回合`() {
        assertFalse(TurnState.startOnSend(sendOk = false, interactive = false))
    }

    // ── endOnIncoming ──

    @Test
    fun `助手回复结束回合`() {
        assertTrue(TurnState.endOnIncoming("assistant"))
    }

    @Test
    fun `系统消息不结束回合`() {
        // system 可能是回合中途的提示，过早收起会让用户以为已经完成
        assertFalse(TurnState.endOnIncoming("system"))
    }

    @Test
    fun `其它设备发来的用户消息不结束回合`() {
        assertFalse(TurnState.endOnIncoming("user"))
    }

    @Test
    fun `错误消息不结束回合`() {
        assertFalse(TurnState.endOnIncoming("error"))
    }

    // ── isOwnEcho ──

    @Test
    fun `同文本且仍 SENDING 的用户消息被判定为自己发的`() {
        assertTrue(
            TurnState.isOwnEcho(
                "user", "hello",
                local(Triple("user", "hello", "SENDING")),
            ),
        )
    }

    @Test
    fun `已 QUEUED 的不再判定为自己发的`() {
        // 关键判据：queued 回执到达后就不再匹配。
        // 若把 QUEUED 也算进来，之后别人发来相同文本会被误吞（对方的真实
        // 消息从界面上消失）。这是「宁可重复也不丢消息」的取舍。
        assertFalse(
            TurnState.isOwnEcho(
                "user", "hello",
                local(Triple("user", "hello", "QUEUED")),
            ),
        )
    }

    @Test
    fun `失败状态的消息不遮蔽他人同文本消息`() {
        assertFalse(
            TurnState.isOwnEcho(
                "user", "hello",
                local(Triple("user", "hello", "FAILED")),
            ),
        )
    }

    @Test
    fun `文本不同不判定为自己发的`() {
        assertFalse(
            TurnState.isOwnEcho(
                "user", "hello",
                local(Triple("user", "world", "SENDING")),
            ),
        )
    }

    @Test
    fun `助手消息即使文本相同的 SENDING 也不去重`() {
        // 只有 user 角色参与去重；assistant 的 SENDING 在语义上不存在，
        // 但判据必须显式挡住 role，避免将来误用。
        assertFalse(
            TurnState.isOwnEcho(
                "assistant", "hello",
                local(Triple("assistant", "hello", "SENDING")),
            ),
        )
    }

    @Test
    fun `入站角色为 assistant 时恒不去重`() {
        assertFalse(
            TurnState.isOwnEcho(
                "assistant", "hello",
                local(Triple("user", "hello", "SENDING")),
            ),
        )
    }

    @Test
    fun `本地为空列表时不去重`() {
        assertFalse(TurnState.isOwnEcho("user", "hello", emptyList()))
    }

    @Test
    fun `多条候选中命中任一条即去重`() {
        assertTrue(
            TurnState.isOwnEcho(
                "user", "b",
                local(
                    Triple("user", "a", "SENDING"),
                    Triple("user", "b", "SENDING"),
                ),
            ),
        )
    }
}
