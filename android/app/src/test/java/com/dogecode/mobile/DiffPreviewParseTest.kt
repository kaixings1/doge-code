package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 权限请求中 diff 预览的协议解析测试。
 *
 * 关键判据：**diff 解析失败不得导致整条权限请求被丢弃**。
 * diff 只是辅助信息，而权限请求本身是关键路径 —— 若因为 diff 格式
 * 异常就把整条请求判为 Unparsed，用户会完全看不到请求，
 * AI 永久挂起。宁可不显示 diff，也要让批准流程走得通。
 *
 * 变异验证：把 diffLinesOf 的 null 处理改成抛异常 → 「diff 畸形时
 * 请求仍可解析」用例失败。
 */
class DiffPreviewParseTest {

    private fun req(json: String) = BridgeProtocol.parse(json) as BridgeProtocol.Msg.PermissionRequest

    @Test
    fun `正常解析 diff 行`() {
        val json = """
            {"type":"permission_request","data":{
              "requestId":"r1","toolName":"Edit",
              "diff":{"kind":"edit","filePath":"a.ts","lines":["-old","+new"],"truncatedLines":0}}}
        """.trimIndent()
        val m = req(json)
        assertEquals(listOf("-old", "+new"), m.diffLines)
    }

    @Test
    fun `无 diff 字段时为空列表`() {
        val json = """{"type":"permission_request","data":{"requestId":"r","toolName":"Bash"}}"""
        assertTrue(req(json).diffLines.isEmpty())
    }

    @Test
    fun `diff 畸形时请求仍可解析（关键取舍）`() {
        // diff 是辅助信息，格式异常不该拖垮整条权限请求 ——
        // 那样用户完全看不到请求，AI 永久挂起
        val json = """
            {"type":"permission_request","data":{
              "requestId":"r","toolName":"Edit","diff":"not-an-object"}}
        """.trimIndent()
        val m = req(json)
        assertEquals("r", m.requestId)
        assertTrue(m.diffLines.isEmpty())
    }

    @Test
    fun `diff 缺 lines 字段时为空列表`() {
        val json = """
            {"type":"permission_request","data":{
              "requestId":"r","toolName":"Edit",
              "diff":{"kind":"edit","filePath":"a.ts"}}}
        """.trimIndent()
        assertTrue(req(json).diffLines.isEmpty())
    }

    @Test
    fun `lines 含空串时被滤掉`() {
        val json = """
            {"type":"permission_request","data":{
              "requestId":"r","toolName":"Edit",
              "diff":{"lines":["-a","","+b"]}}}
        """.trimIndent()
        assertEquals(listOf("-a", "+b"), req(json).diffLines)
    }

    @Test
    fun `diff 行原样保留（含缩进与特殊字符）`() {
        // diff 行的前导空格是真实内容（code block 的缩进），不能被 trim
        val json = """
            {"type":"permission_request","data":{
              "requestId":"r","toolName":"Edit",
              "diff":{"lines":["-    indented","+  two spaces"]}}}
        """.trimIndent()
        assertEquals(listOf("-    indented", "+  two spaces"), req(json).diffLines)
    }

    @Test
    fun `大量 diff 行完整解析（截断是服务端的职责）`() {
        val lines = (1..60).joinToString(",") { "\"+line$it\"" }
        val json = """
            {"type":"permission_request","data":{
              "requestId":"r","toolName":"Write","diff":{"lines":[$lines]}}}
        """.trimIndent()
        assertEquals(60, req(json).diffLines.size)
    }

    @Test
    fun `diff 与 inputPreview 可共存`() {
        val json = """
            {"type":"permission_request","data":{
              "requestId":"r","toolName":"Edit",
              "input":{"file_path":"a.ts"},
              "diff":{"lines":["-x","+y"]}}}
        """.trimIndent()
        val m = req(json)
        assertTrue("diff 应存在", m.diffLines.isNotEmpty())
        assertTrue("inputPreview 也应存在", m.inputPreview.isNotBlank())
    }

    @Test
    fun `diff 不影响 requestId 与工具名解析`() {
        val json = """
            {"type":"permission_request","data":{
              "requestId":"req-abc","toolName":"Write","description":"新建文件",
              "diff":{"lines":["+a"]}}}
        """.trimIndent()
        val m = req(json)
        assertEquals("req-abc", m.requestId)
        assertEquals("Write", m.toolName)
        assertEquals("新建文件", m.description)
    }
}
