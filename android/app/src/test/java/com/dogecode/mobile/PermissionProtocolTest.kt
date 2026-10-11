package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 权限请求/撤销事件的协议解析测试。
 *
 * 这组解析直接决定「手机能不能远程批准操作」—— 在本次改动前，整条远程
 * 权限链路只对云端桥接接线，移动桥接走的是另一条路径，手机端永远收不到
 * `permission_request`，用户远程时无法完成任何实际工作。
 *
 * 两个判定必须钉死：
 * 1. 缺 requestId 的请求必须丢弃 —— 否则渲染出一张点了没反应的卡片，
 *    用户以为批准了，实际服务端等不到响应，AI 永久挂起
 * 2. input 预览要取到最有信息量的字段（命令/路径），而不是整个 JSON 的截断
 */
class PermissionProtocolTest {

    private fun req(json: String) = BridgeProtocol.parse(json)

    @Test
    fun `完整权限请求正常解析`() {
        val json = """
            {"type":"permission_request","data":{
              "requestId":"req-1","toolName":"Bash",
              "input":{"command":"rm -rf build"},
              "toolUseId":"tu-1","description":"清理构建目录"}}
        """.trimIndent()
        val m = req(json) as BridgeProtocol.Msg.PermissionRequest
        assertEquals("req-1", m.requestId)
        assertEquals("Bash", m.toolName)
        assertEquals("清理构建目录", m.description)
        assertTrue("应含命令内容", m.inputPreview.contains("rm -rf build"))
    }

    @Test
    fun `缺 requestId 必须丢弃`() {
        // 关键：没有 requestId 就无法回传决定。渲染出卡片会让用户以为批了，
        // 实际服务端的 waiter 等不到响应，AI 永久卡住。
        val json = """{"type":"permission_request","data":{"toolName":"Bash"}}"""
        assertTrue(
            "缺 requestId 应判为 Unparsed 而非渲染卡片",
            BridgeProtocol.parse(json) is BridgeProtocol.Msg.Unparsed,
        )
    }

    @Test
    fun `requestId 为空串也丢弃`() {
        val json = """{"type":"permission_request","data":{"requestId":"","toolName":"Bash"}}"""
        assertTrue(BridgeProtocol.parse(json) is BridgeProtocol.Msg.Unparsed)
    }

    @Test
    fun `缺 data 丢弃`() {
        assertTrue(
            BridgeProtocol.parse("""{"type":"permission_request"}""")
                is BridgeProtocol.Msg.Unparsed,
        )
    }

    @Test
    fun `缺 toolName 时回落为「工具」而非空串`() {
        val json = """{"type":"permission_request","data":{"requestId":"r"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.PermissionRequest
        assertEquals("工具", m.toolName)
    }

    // ── input 预览的字段优先级 ──

    @Test
    fun `优先展示 command`() {
        val json = """
            {"type":"permission_request","data":{"requestId":"r",
             "input":{"command":"npm test","file_path":"a.ts"}}}
        """.trimIndent()
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.PermissionRequest
        assertTrue(m.inputPreview.startsWith("命令:"))
        assertTrue(m.inputPreview.contains("npm test"))
    }

    @Test
    fun `无 command 时展示 file_path`() {
        val json = """
            {"type":"permission_request","data":{"requestId":"r",
             "input":{"file_path":"src/a.ts","content":"x"}}}
        """.trimIndent()
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.PermissionRequest
        assertTrue(m.inputPreview.startsWith("路径:"))
        assertTrue(m.inputPreview.contains("src/a.ts"))
    }

    @Test
    fun `无已知字段时退化为 JSON 截断`() {
        val json = """{"type":"permission_request","data":{"requestId":"r","input":{"foo":"bar"}}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.PermissionRequest
        assertTrue(m.inputPreview.contains("foo"))
    }

    @Test
    fun `input 为字符串时直接展示`() {
        val json = """{"type":"permission_request","data":{"requestId":"r","input":"直接文本"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.PermissionRequest
        assertEquals("直接文本", m.inputPreview)
    }

    @Test
    fun `缺 input 时预览为空串而非崩`() {
        val json = """{"type":"permission_request","data":{"requestId":"r","toolName":"Bash"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.PermissionRequest
        assertEquals("", m.inputPreview)
    }

    @Test
    fun `超长 input 被截断到上限`() {
        // 权限请求走 WS，不该因为一个巨大 input（如整个文件内容）撑爆
        val huge = "a".repeat(50000)
        val json = """{"type":"permission_request","data":{"requestId":"r","input":{"command":"$huge"}}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.PermissionRequest
        assertTrue("预览应被截断", m.inputPreview.length <= 420)
    }

    // ── 撤销 ──

    @Test
    fun `权限撤销正常解析`() {
        val json = """{"type":"permission_cancel","data":{"requestId":"req-9"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.PermissionCancel
        assertEquals("req-9", m.requestId)
    }

    @Test
    fun `撤销缺 requestId 判为 Unparsed`() {
        assertTrue(
            BridgeProtocol.parse("""{"type":"permission_cancel","data":{}}""")
                is BridgeProtocol.Msg.Unparsed,
        )
    }

    @Test
    fun `权限事件不会被误判为消息`() {
        // 回归：permission_request 的 data 里有 description/toolName，
        // 若解析分支顺序写错，可能被当 assistant 消息渲染成聊天气泡
        val json = """{"type":"permission_request","data":{"requestId":"r","description":"d"}}"""
        val m = BridgeProtocol.parse(json)
        assertTrue(m is BridgeProtocol.Msg.PermissionRequest)
    }
}
