package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * SSE 增量解析测试（本地模式最易错的一环）。
 *
 * 三类错误都**不抛异常、只表现为内容残缺**：
 * ① arguments 分片未拼接 → 工具调用拿到残缺 JSON，静默失败
 * ② `[DONE]` 处理错 → 挂住或漏最后一段
 * ③ reasoning_content 混入 content → 用户看到思维链混在回复里
 *
 * 变异验证：把 absorbToolCalls 的 `acc.args.append` 改成 `acc.args.clear()`
 * 后再 append（等价于替换），「arguments 分片累积」用例失败。
 */
class SseParserTest {

    /** 造一帧 OpenAI 兼容的增量。 */
    private fun frame(deltaJson: String, finish: String? = null): String {
        val fr = if (finish == null) "null" else "\"$finish\""
        return """data: {"choices":[{"index":0,"delta":$deltaJson,"finish_reason":$fr}]}"""
    }

    private fun contentFrame(text: String) = frame("""{"content":"$text"}""")

    // ── 基本流 ──

    @Test
    fun `单段正文被解析`() {
        val p = SseParser()
        p.feed(contentFrame("你好"))
        p.feed("data: [DONE]")
        assertEquals("你好", p.result().text)
    }

    @Test
    fun `多段正文被累积`() {
        val p = SseParser()
        p.feed(contentFrame("你"))
        p.feed(contentFrame("好"))
        p.feed(contentFrame("呀"))
        assertEquals("你好呀", p.result().text)
    }

    @Test
    fun `每段都触发增量回调`() {
        val got = mutableListOf<String>()
        val p = SseParser(ProviderClient.OnDelta { got.add(it) })
        p.feed(contentFrame("A"))
        p.feed(contentFrame("B"))
        assertEquals(listOf("A", "B"), got)
    }

    @Test
    fun `DONE 返回 true 表示结束`() {
        val p = SseParser()
        assertFalse(p.feed(contentFrame("x")))
        assertTrue("遇到 [DONE] 应告知调用方停止", p.feed("data: [DONE]"))
    }

    @Test
    fun `finish_reason 被记录`() {
        val p = SseParser()
        p.feed(frame("""{"content":"x"}""", finish = "stop"))
        assertEquals("stop", p.result().finishReason)
    }

    @Test
    fun `finish_reason 为 null 字符串时不记录`() {
        // 部分 provider 把 null 写成字符串 "null"，直接 optString 会得到 "null"
        val p = SseParser()
        p.feed(frame("""{"content":"x"}""", finish = null))
        assertEquals(null, p.result().finishReason)
    }

    // ── 边界与容错 ──

    @Test
    fun `非 data 行被忽略`() {
        val p = SseParser()
        p.feed(": keep-alive")
        p.feed("event: message")
        p.feed("")
        p.feed(contentFrame("正文"))
        assertEquals("正文", p.result().text)
    }

    @Test
    fun `data 后无空格也能解析`() {
        // 规范是 "data: "，但有网关写成 "data:{" 或 "data: {...}"
        val p = SseParser()
        p.feed("""data:{"choices":[{"delta":{"content":"x"}}]}""")
        assertEquals("x", p.result().text)
    }

    @Test
    fun `坏 JSON 帧被跳过而不中断流`() {
        // 有些网关插入非标准心跳帧，解析失败不该让整条流挂掉
        val p = SseParser()
        p.feed("data: {not json")
        p.feed(contentFrame("仍然可用"))
        assertEquals("仍然可用", p.result().text)
    }

    @Test
    fun `缺 choices 的帧被跳过`() {
        val p = SseParser()
        p.feed("""data: {"id":"x"}""")
        p.feed(contentFrame("正文"))
        assertEquals("正文", p.result().text)
    }

    @Test
    fun `空 content 不触发回调`() {
        val got = mutableListOf<String>()
        val p = SseParser(ProviderClient.OnDelta { got.add(it) })
        p.feed(frame("""{"content":""}"""))
        assertTrue("空段不该触发回调（会让界面闪一下）", got.isEmpty())
    }

    @Test
    fun `reasoning_content 不混入正文`() {
        // DeepSeek 等用该字段返回思考内容；混进去用户会看到思维链
        val p = SseParser()
        p.feed("""data: {"choices":[{"delta":{"reasoning_content":"我在想..."}}]}""")
        p.feed(contentFrame("答案"))
        assertEquals("答案", p.result().text)
    }

    // ── 工具调用（最关键）──

    @Test
    fun `工具调用被解析出名称与完整参数`() {
        val p = SseParser()
        p.feed(
            """data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\"path\":"}}]}}]}""",
        )
        p.feed(
            """data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"a.ts\"}"}}]}}]}""",
        )
        val tc = p.result().toolCalls
        assertEquals(1, tc.size)
        assertEquals("read_file", tc[0].name)
        assertEquals("call_1", tc[0].id)
    }

    @Test
    fun `arguments 分片累积而非替换（关键）`() {
        // 分片是逐字符段到达的；整体替换会只剩最后一片 → 残缺 JSON
        val p = SseParser()
        p.feed("""data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"f","arguments":"{\"a\":"}}]}}]}""")
        p.feed("""data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}""")
        assertEquals("""{"a":1}""", p.result().toolCalls[0].arguments)
    }

    @Test
    fun `多工具调用的 arguments 按 index 归位`() {
        // 两个工具的参数交替到达时，不能串到对方身上
        val p = SseParser()
        p.feed("""data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"a","arguments":"{\"x\":"}},{"index":1,"function":{"name":"b","arguments":"{\"y\":"}}]}}]}""")
        p.feed("""data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}},{"index":1,"function":{"arguments":"2}"}}]}}]}""")
        val tc = p.result().toolCalls
        assertEquals(2, tc.size)
        assertEquals("""{"x":1}""", tc[0].arguments)
        assertEquals("""{"y":2}""", tc[1].arguments)
    }

    @Test
    fun `缺 name 的工具调用被过滤`() {
        // 只到达了参数却没到达名称 → 这一路增量不完整，带着它调用工具
        // 只会失败并让模型困惑
        val p = SseParser()
        p.feed("""data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]}}]}""")
        assertTrue(p.result().toolCalls.isEmpty())
    }

    @Test
    fun `缺 id 时补一个稳定的兜底值`() {
        // 少数 provider 不返回 id；没有 id 就无法把 tool 结果回填给模型
        val p = SseParser()
        p.feed("""data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"f","arguments":"{}"}}]}}]}""")
        val id = p.result().toolCalls[0].id
        assertTrue("应有非空 id", id.isNotBlank())
        assertTrue("id 应含工具名便于排查", id.contains("f"))
    }

    @Test
    fun `两个无 id 的工具调用兜底 id 不同`() {
        val p = SseParser()
        p.feed("""data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"f","arguments":"{}"}},{"index":1,"function":{"name":"f","arguments":"{}"}}]}}]}""")
        val ids = p.result().toolCalls.map { it.id }
        assertEquals("兜底 id 不能重复", ids.size, ids.toSet().size)
    }

    @Test
    fun `正文与工具调用可同时存在`() {
        val p = SseParser()
        p.feed(contentFrame("我先看看"))
        p.feed("""data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"read_file","arguments":"{}"}}]}}]}""")
        val r = p.result()
        assertEquals("我先看看", r.text)
        assertEquals(1, r.toolCalls.size)
    }

    @Test
    fun `空流返回空结果而非崩`() {
        val r = SseParser().result()
        assertEquals("", r.text)
        assertTrue(r.toolCalls.isEmpty())
        assertEquals(null, r.finishReason)
    }

    @Test
    fun `常量与 OpenAI 规范一致`() {
        assertEquals("data:", SseParser.PREFIX)
        assertEquals("[DONE]", SseParser.DONE)
    }
}
