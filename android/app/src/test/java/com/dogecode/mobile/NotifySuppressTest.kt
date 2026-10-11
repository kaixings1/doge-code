package com.dogecode.mobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 通知抑制标志的协议解析测试。
 *
 * 对应服务端 src/bridge/mobileBridge.ts 的 shouldSuppressMobileNotification()：
 * 用户在电脑终端前时，手机端只渲染消息、不弹系统通知。
 *
 * **默认值方向是这段逻辑唯一的风险点**：缺字段时必须默认 false（不抑制）。
 * 若默认 true，任何不带该字段的服务端（旧版本）都会让用户**完全收不到通知**
 * —— 静默失效，用户只会觉得「手机不提醒了」，无从排查。
 * 而默认 false 的代价只是偶尔多提醒一次。
 *
 * 变异验证：把 suppressFlagOf 的默认值改成 true，
 * 「缺字段时默认不抑制」用例必然失败。
 */
class NotifySuppressTest {

    private fun incoming(json: String) = BridgeProtocol.parse(json) as BridgeProtocol.Msg.Incoming

    @Test
    fun `suppressNotify 为 true 时正确解析`() {
        val m = incoming("""{"type":"assistant","data":{"text":"回复","suppressNotify":true}}""")
        assertTrue(m.suppressNotify)
    }

    @Test
    fun `suppressNotify 为 false 时正确解析`() {
        val m = incoming("""{"type":"assistant","data":{"text":"回复","suppressNotify":false}}""")
        assertFalse(m.suppressNotify)
    }

    @Test
    fun `缺字段时默认不抑制（关键取舍）`() {
        // 旧服务端不带此字段。默认 true 会让这些用户完全收不到通知 ——
        // 静默失效且无从排查；默认 false 只是偶尔多提醒一次。
        val m = incoming("""{"type":"assistant","data":{"text":"回复"}}""")
        assertFalse("缺字段必须默认 false，否则旧服务端用户静默失联", m.suppressNotify)
    }

    @Test
    fun `user 消息也解析该标志`() {
        // 多设备同步场景：别的设备发的消息也带这个标志
        val m = incoming("""{"type":"user","data":{"text":"来自终端","suppressNotify":true}}""")
        assertTrue(m.suppressNotify)
    }

    @Test
    fun `suppressNotify 不影响文本提取`() {
        val m = incoming("""{"type":"assistant","data":{"text":"完整内容","suppressNotify":true}}""")
        assertTrue("抑制通知不等于抑制内容", m.text == "完整内容")
    }

    @Test
    fun `字段类型异常时回落为不抑制`() {
        // 服务端若误传字符串 "true"，optBoolean 会返回默认值 false —— 安全方向
        val m = incoming("""{"type":"assistant","data":{"text":"x","suppressNotify":"true"}}""")
        assertFalse(m.suppressNotify)
    }

    @Test
    fun `缺 data 时判为 Unparsed 而非构造空消息`() {
        assertTrue(
            BridgeProtocol.parse("""{"type":"assistant"}""") is BridgeProtocol.Msg.Unparsed,
        )
    }
}
