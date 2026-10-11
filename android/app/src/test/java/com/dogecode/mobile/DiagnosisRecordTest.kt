package com.dogecode.mobile

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 失败记录的序列化测试（纯逻辑部分）。
 *
 * DiagnosisLog 本身需要 Context（SharedPreferences），
 * 但其 Record 的 JSON 往返是纯逻辑且**必须正确**：
 * 记录读写错会让诊断页显示错误的失败原因或地址 ——
 * 而用户看它就是为了排障，错误信息比没有信息更糟。
 *
 * 变异验证：把 fromJson 的 httpCode 判断改成直接 optInt，
 * 「httpCode 缺失时保持 null」用例失败。
 */
class DiagnosisRecordTest {

    private fun record(
        reason: String = "ECONNREFUSED",
        httpCode: Int? = null,
        address: String = "http://127.0.0.1:5680",
        at: Long = 1700000000000L,
    ) = DiagnosisLog.Record(reason, httpCode, address, at)

    @Test
    fun `JSON 往返保持一致（无 httpCode）`() {
        val r = record()
        val back = DiagnosisLog.Record.fromJson(r.toJson())
        assertEquals(r.reason, back.reason)
        assertEquals(r.address, back.address)
        assertEquals(r.at, back.at)
        assertNull("无 httpCode 时应保持 null", back.httpCode)
    }

    @Test
    fun `JSON 往返保持一致（有 httpCode）`() {
        val r = record(httpCode = 403)
        val back = DiagnosisLog.Record.fromJson(r.toJson())
        assertEquals(403, back.httpCode)
    }

    @Test
    fun `httpCode 缺失时保持 null 而非 0`() {
        // 显示 [HTTP 0] 会让用户以为收到了 HTTP 0 响应；null 才是「无此信息」
        val o = JSONObject().apply {
            put("reason", "x")
            put("address", "a")
            put("at", 1L)
        }
        assertNull(DiagnosisLog.Record.fromJson(o).httpCode)
    }

    @Test
    fun `含特殊字符的原因与地址正确往返`() {
        val r = record(reason = "原因：\"引号\" 与 \\ 反斜杠", address = "http://[::1]:5680/?a=1&b=2")
        val back = DiagnosisLog.Record.fromJson(r.toJson())
        assertEquals(r.reason, back.reason)
        assertEquals(r.address, back.address)
    }

    @Test
    fun `缺字段的 JSON 安全解析为空值`() {
        // 老版本数据或损坏数据不该让整页打不开
        val back = DiagnosisLog.Record.fromJson(JSONObject())
        assertEquals("", back.reason)
        assertEquals("", back.address)
        assertEquals(0L, back.at)
        assertNull(back.httpCode)
    }

    @Test
    fun `记录上限为 20`() {
        // 20 条足以看出「是否每隔几分钟就断」的模式，再多会让页面变成长列表
        assertEquals(20, DiagnosisLog.MAX_RECORDS)
    }

    @Test
    fun `超长原因不被截断（与 ChatExporter 不同）`() {
        // 诊断信息需要完整 —— 截断可能切掉关键的异常类名
        val long = "x".repeat(2000)
        val back = DiagnosisLog.Record.fromJson(record(reason = long).toJson())
        assertEquals(2000, back.reason.length)
    }

    // ── prepend：**直接调用生产代码**（不是复刻）──

    @Test
    fun `新记录插到队首`() {
        // 用户打开诊断页应先看到最近的问题。若实现改成追加到末尾，
        // 最近的问题会沉到底部，用户以为没发生过。
        val out = DiagnosisLog.prepend(
            listOf(record(reason = "旧")),
            record(reason = "新"),
        )
        assertEquals("新", out.first().reason)
        assertEquals("旧", out.last().reason)
    }

    @Test
    fun `超上限时丢弃最旧的，保留最新的`() {
        // 丢弃方向必须是「丢最旧」—— 若丢最新，等于永远看不到
        // 刚发生的问题，那就失去了记录的意义
        var list = emptyList<DiagnosisLog.Record>()
        (1..25).forEach { i -> list = DiagnosisLog.prepend(list, record(reason = "第 $i 次"), 20) }

        assertEquals(20, list.size)
        assertEquals("最近的在最前", "第 25 次", list.first().reason)
        assertEquals("最旧的被丢弃", "第 6 次", list.last().reason)
    }

    @Test
    fun `恰好等于上限时不丢弃`() {
        var list = emptyList<DiagnosisLog.Record>()
        (1..20).forEach { i -> list = DiagnosisLog.prepend(list, record(reason = "第 $i 次"), 20) }
        assertEquals(20, list.size)
        assertEquals("第 1 次", list.last().reason)
    }

    @Test
    fun `prepend 不修改入参`() {
        // 纯函数契约：调用方可能持有原列表引用
        val original = listOf(record(reason = "旧"))
        val copy = ArrayList(original)
        DiagnosisLog.prepend(original, record(reason = "新"))
        assertEquals("不应修改入参", copy, original)
    }

    @Test
    fun `空历史时插入为单元素列表`() {
        val out = DiagnosisLog.prepend(emptyList(), record(reason = "首次"))
        assertEquals(1, out.size)
        assertEquals("首次", out.first().reason)
    }
}
