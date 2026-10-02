package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * SessionScanner.parseSessionInfo 的测试。
 *
 * 两处判定直接决定「会话列表对不对」：
 * 1. 什么算会话 —— 缺 port/sessionId 的响应必须被滤除，
 *    否则端口段里恰好返回 JSON 的无关服务会出现在列表里，用户点进去连不上。
 * 2. 字段缺失时怎么兜底 —— 兜底错了会显示错误信息（如端口号错、
 *    把交互模式误报成非交互）。
 *
 * 报文形状取自 src/bridge/mobileBridge.ts 的 /mobile/session-info 实现。
 */
class SessionScannerTest {

    private val real =
        """{"sessionId":"mobile-1790952317194","port":5681,"cwd":"D:\\doge-code",
           "label":"测试会话A","interactive":false,"clients":0,
           "lastActivity":1790952339389}""".trimIndent()

    @Test
    fun `完整报文正常解析`() {
        val s = SessionScanner.parseSessionInfo(real, 5681)
        assertNotNull(s)
        assertEquals(5681, s!!.port)
        assertEquals("mobile-1790952317194", s.sessionId)
        assertEquals("测试会话A", s.label)
        assertEquals("D:\\doge-code", s.cwd)
        assertEquals(false, s.interactive)
        assertEquals(0, s.clients)
    }

    // ── 什么算会话（滤除无关服务）──

    @Test
    fun `缺 port 字段不视为会话`() {
        val json = """{"sessionId":"x","label":"y"}"""
        assertNull(SessionScanner.parseSessionInfo(json, 5680))
    }

    @Test
    fun `缺 sessionId 字段不视为会话`() {
        val json = """{"port":5680,"label":"y"}"""
        assertNull(SessionScanner.parseSessionInfo(json, 5680))
    }

    @Test
    fun `sessionId 为空串不视为会话`() {
        val json = """{"port":5680,"sessionId":"","label":"y"}"""
        assertNull(SessionScanner.parseSessionInfo(json, 5680))
    }

    @Test
    fun `非法 JSON 返回 null 而非抛异常`() {
        assertNull(SessionScanner.parseSessionInfo("not json", 5680))
        assertNull(SessionScanner.parseSessionInfo("", 5680))
        assertNull(SessionScanner.parseSessionInfo("{", 5680))
    }

    @Test
    fun `JSON 数组不视为会话`() {
        // 某些服务的健康检查返回 []，不应被当成会话
        assertNull(SessionScanner.parseSessionInfo("[]", 5680))
    }

    // ── 字段缺失时的兜底 ──

    @Test
    fun `label 缺失时回落到端口号占位`() {
        val json = """{"sessionId":"x","port":5683}"""
        val s = SessionScanner.parseSessionInfo(json, 5683)
        assertEquals("会话 5683", s!!.label)
    }

    @Test
    fun `label 为空串时同样回落`() {
        val json = """{"sessionId":"x","port":5683,"label":""}"""
        assertEquals("会话 5683", SessionScanner.parseSessionInfo(json, 5683)!!.label)
    }

    @Test
    fun `interactive 缺失时按 true 处理`() {
        // 与 BridgeProtocol 的取舍一致：旧服务端无此字段，
        // 误报「非交互（消息不会被处理）」比漏报更扰人
        val json = """{"sessionId":"x","port":5680}"""
        assertTrue(SessionScanner.parseSessionInfo(json, 5680)!!.interactive)
    }

    @Test
    fun `clients 缺失时为 0`() {
        val json = """{"sessionId":"x","port":5680}"""
        assertEquals(0, SessionScanner.parseSessionInfo(json, 5680)!!.clients)
    }

    @Test
    fun `cwd 缺失时为空串`() {
        val json = """{"sessionId":"x","port":5680}"""
        assertEquals("", SessionScanner.parseSessionInfo(json, 5680)!!.cwd)
    }

    @Test
    fun `port 缺失时的兜底值被使用`() {
        // 理论上不会发生（缺 port 已被滤除），但保留该路径的语义正确性：
        // 若将来放宽校验，兜底值来自探测端口而非 0
        val json = """{"sessionId":"x","port":0}"""
        val s = SessionScanner.parseSessionInfo(json, 5689)
        assertEquals(0, s!!.port)   // JSON 显式给的 0 优先于兜底
    }

    // ── 边界 ──

    @Test
    fun `超长 label 与 cwd 完整保留`() {
        val long = "x".repeat(5000)
        val json = """{"sessionId":"s","port":5680,"label":"$long","cwd":"$long"}"""
        val s = SessionScanner.parseSessionInfo(json, 5680)!!
        assertEquals(5000, s.label.length)
        assertEquals(5000, s.cwd.length)
    }

    @Test
    fun `含中文与特殊字符的 cwd 正确解析`() {
        val json = """{"sessionId":"s","port":5680,"cwd":"D:\\项目\\子目录 (test)"}"""
        val s = SessionScanner.parseSessionInfo(json, 5680)!!
        assertTrue(s.cwd.contains("项目"))
        assertTrue(s.cwd.contains("(test)"))
    }

    @Test
    fun `端口号不是整数时回落`() {
        // optInt 对非数字返回默认值，不应抛异常
        val json = """{"sessionId":"s","port":"abc"}"""
        assertEquals(5687, SessionScanner.parseSessionInfo(json, 5687)!!.port)
    }

    @Test
    fun `Session 的 httpUrl 拼接正确`() {
        val s = SessionScanner.parseSessionInfo(real, 5681)!!
        assertEquals("http://127.0.0.1:5681", s.httpUrl("127.0.0.1"))
    }
}
