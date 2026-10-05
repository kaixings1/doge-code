package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * BridgeProtocol 的测试。
 *
 * 协议解析是最该被覆盖的一环：字段名写错、分支漏写会表现为
 * 「消息莫名不见」或「一直没回复」，真机上极难定位（要抓包才看得出）。
 * 这里的用例直接引用 src/bridge/mobileBridge.ts 里的实际报文形状。
 */
class BridgeProtocolTest {

    // ── client_connected ──

    @Test
    fun `client_connected 带 interactive=false`() {
        val json = """{"type":"client_connected","data":{"sessionId":"mobile-1","deviceId":"x","deviceType":"android","interactive":false}}"""
        val m = BridgeProtocol.parse(json)
        assertTrue(m is BridgeProtocol.Msg.Connected)
        assertEquals(false, (m as BridgeProtocol.Msg.Connected).interactive)
    }

    @Test
    fun `client_connected 缺 interactive 字段时按 true 处理`() {
        // 服务端旧版本没有该字段；误报"非交互"比漏报更扰人
        val json = """{"type":"client_connected","data":{"sessionId":"mobile-1"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.Connected
        assertEquals(true, m.interactive)
    }

    // ── assistant / message ──

    @Test
    fun `assistant 文本取自 text 字段`() {
        val json = """{"type":"assistant","data":{"text":"你好"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.Incoming
        assertEquals("assistant", m.role)
        assertEquals("你好", m.text)
    }

    @Test
    fun `文本字段回落 message 与 content`() {
        // 服务端不同路径下字段名不一致，按优先级依次尝试
        val a = BridgeProtocol.parse("""{"type":"assistant","data":{"message":"A"}}""")
        assertEquals("A", (a as BridgeProtocol.Msg.Incoming).text)

        val b = BridgeProtocol.parse("""{"type":"assistant","data":{"content":"B"}}""")
        assertEquals("B", (b as BridgeProtocol.Msg.Incoming).text)
    }

    @Test
    fun `message 类型与 assistant 同样处理`() {
        val m = BridgeProtocol.parse("""{"type":"message","data":{"text":"x"}}""")
        assertEquals("x", (m as BridgeProtocol.Msg.Incoming).text)
    }

    // ── user（多设备同步）──

    @Test
    fun `user 消息被识别为 user 角色而非 assistant`() {
        // 服务端会广播其它设备键入的消息，角色必须原样保留 ——
        // 早期无此分支时被 Ignored 静默丢弃，导致多设备同步实际不工作。
        val json = """{"type":"user","data":{"text":"别人发的"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.Incoming
        assertEquals("user", m.role)
        assertEquals("别人发的", m.text)
    }

    @Test
    fun `user 消息缺 data 时不崩溃`() {
        assertTrue(BridgeProtocol.parse("""{"type":"user"}""") is BridgeProtocol.Msg.Unparsed)
    }

    @Test
    fun `user 消息空文本不产生空气泡`() {
        val m = BridgeProtocol.parse("""{"type":"user","data":{"text":"  "}}""")
        assertTrue(m is BridgeProtocol.Msg.Unparsed)
    }

    @Test
    fun `空文本视为未解析而不是产生空消息`() {
        // 产生空气泡会污染界面
        val m = BridgeProtocol.parse("""{"type":"assistant","data":{"text":"   "}}""")
        assertTrue(m is BridgeProtocol.Msg.Unparsed)
    }

    @Test
    fun `缺 data 字段不崩溃`() {
        val m = BridgeProtocol.parse("""{"type":"assistant"}""")
        assertTrue(m is BridgeProtocol.Msg.Unparsed)
    }

    // ── system ──

    @Test
    fun `system 消息被识别`() {
        val json = """{"type":"system","data":{"message":"会话已切换"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.Incoming
        assertEquals("system", m.role)
        assertEquals("会话已切换", m.text)
    }

    // ── result ──

    @Test
    fun `queued 回执带 requestId`() {
        val json = """{"type":"result","requestId":"r-1","data":{"status":"queued","message":"已提交"},"success":true}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.Queued
        assertEquals("r-1", m.requestId)
    }

    @Test
    fun `queued 不额外产生消息气泡`() {
        // 「已提交」由用户消息的状态行展示，不应再产生一条助手气泡
        val json = """{"type":"result","requestId":"r-1","data":{"status":"queued","message":"已提交"}}"""
        val m = BridgeProtocol.parse(json)
        assertTrue("queued 应解析为 Queued 而非 Incoming", m is BridgeProtocol.Msg.Queued)
    }

    @Test
    fun `非 queued 的 result 若带 message 则作为消息`() {
        val json = """{"type":"result","requestId":"r-2","data":{"status":"error","message":"执行失败"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.Incoming
        assertEquals("执行失败", m.text)
    }

    @Test
    fun `非 queued 且无 message 的 result 被忽略`() {
        val json = """{"type":"result","requestId":"r-3","data":{"status":"done"}}"""
        assertTrue(BridgeProtocol.parse(json) is BridgeProtocol.Msg.Ignored)
    }

    // ── error ──

    @Test
    fun `error 提取错误文本`() {
        val json = """{"type":"error","data":{"error":"认证失败"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.Error
        assertEquals("认证失败", m.message)
    }

    @Test
    fun `error 缺文本时给出兜底文案`() {
        val json = """{"type":"error","data":{}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.Error
        assertEquals("未知错误", m.message)
    }

    // ── 健壮性 ──

    @Test
    fun `非法 JSON 返回 Unparsed 而非抛异常`() {
        assertTrue(BridgeProtocol.parse("not json") is BridgeProtocol.Msg.Unparsed)
        assertTrue(BridgeProtocol.parse("") is BridgeProtocol.Msg.Unparsed)
        assertTrue(BridgeProtocol.parse("{") is BridgeProtocol.Msg.Unparsed)
    }

    @Test
    fun `未知类型被忽略`() {
        val json = """{"type":"client_disconnected","data":{"deviceId":"x"}}"""
        assertTrue(BridgeProtocol.parse(json) is BridgeProtocol.Msg.Ignored)
    }

    @Test
    fun `无 type 字段被忽略`() {
        assertTrue(BridgeProtocol.parse("""{"data":{"x":1}}""") is BridgeProtocol.Msg.Ignored)
    }

    @Test
    fun `超长文本完整保留`() {
        // 大段回复不应被截断
        val long = "字".repeat(20000)
        val json = """{"type":"assistant","data":{"text":"$long"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.Incoming
        assertEquals(20000, m.text.length)
    }
}
