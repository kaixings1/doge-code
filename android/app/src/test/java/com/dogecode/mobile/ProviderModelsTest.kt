package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 本地模式「获取模型 / 测试会话」的解析逻辑测试。
 *
 * ## 为什么测解析而非 HTTP
 *
 * HTTP 层要造假 server（慢且脆），而真正决定「用户看不看得到模型」的是**解析**：
 * 各家网关的 `/models` 响应形状并不统一（实测差异见 `ProviderClient.parseModels`
 * 注释），解析错的表现是「点了获取模型却列表为空」，用户会以为没配好。
 *
 * 同理 `chat/completions` 的 content 也有形状差异（字符串 vs 数组），
 * 取错会得到 "[]" 这种无意义文本，被当成「测试成功但模型什么都没说」。
 */
class ProviderModelsTest {

    private val client = ProviderClient()

    // ── parseModels ──

    @Test
    fun `标准 OpenAI 形状（data 数组含 id）`() {
        val body = """{"object":"list","data":[{"id":"gpt-4o"},{"id":"gpt-4o-mini"}]}"""
        assertEquals(listOf("gpt-4o", "gpt-4o-mini"), client.parseModels(body))
    }

    @Test
    fun `部分网关用 models 字段而非 data`() {
        val body = """{"models":[{"id":"qwen-plus"},{"id":"qwen-turbo"}]}"""
        assertEquals(listOf("qwen-plus", "qwen-turbo"), client.parseModels(body))
    }

    @Test
    fun `data 元素可能是裸 id 字符串`() {
        val body = """{"data":["deepseek-chat","deepseek-reasoner"]}"""
        assertEquals(listOf("deepseek-chat", "deepseek-reasoner"), client.parseModels(body))
    }

    @Test
    fun `去重并排序（网关常返回重名条目）`() {
        val body = """{"data":[{"id":"b"},{"id":"a"},{"id":"b"}]}"""
        assertEquals(listOf("a", "b"), client.parseModels(body))
    }

    @Test
    fun `空列表与缺字段都返回空列表（不抛异常）`() {
        assertTrue(client.parseModels("""{"data":[]}""").isEmpty())
        assertTrue(client.parseModels("""{"foo":1}""").isEmpty())
        // 非法 JSON：调用方据此提示「不支持列模型」，不该崩
        assertTrue(client.parseModels("not json").isEmpty())
        assertTrue(client.parseModels("").isEmpty())
    }

    @Test
    fun `跳过缺 id 或空 id 的条目`() {
        val body = """{"data":[{"id":""},{"name":"x"},{"id":"ok"}]}"""
        assertEquals(listOf("ok"), client.parseModels(body))
    }

    // ── extractContent ──

    @Test
    fun `标准 content 字符串`() {
        val body = """{"choices":[{"message":{"role":"assistant","content":"你好"}}]}"""
        assertEquals("你好", client.extractContent(body))
    }

    @Test
    fun `content 为数组时不返回无意义文本`() {
        // 部分网关返回 [{"type":"text","text":"..."}]；直接 optString 会得到 "[]"
        val body = """{"choices":[{"message":{"content":[{"type":"text","text":"hi"}]}}]}"""
        assertEquals("数组形态的 content 不应产出 \"[]\" 之类文本", "", client.extractContent(body))
    }

    @Test
    fun `缺 choices 或 content 返回空串（算连通成功，非失败）`() {
        assertTrue(client.extractContent("{}").isEmpty())
        assertTrue(client.extractContent("""{"choices":[]}""").isEmpty())
        assertTrue(client.extractContent("not json").isEmpty())
    }

    @Test
    fun `空 content 返回空串而非抛异常`() {
        val body = """{"choices":[{"message":{"content":""}}]}"""
        assertTrue(client.extractContent(body).isEmpty())
    }

    // ── 测试会话的参数（不消耗额度、不误报 400）──

    @Test
    fun `测试用 max_tokens 足够大以免被网关拒`() {
        // 实测：max_tokens=1 被部分网关判为非法并返回 400，
        // 用户会误以为「key 错了」。必须留余量。
        assertTrue(ProviderClient.TEST_MAX_TOKENS >= 8)
        assertTrue(ProviderClient.TEST_MAX_TOKENS <= 64)
    }

    @Test
    fun `探测超时短于默认超时（不让用户干等一分钟）`() {
        assertTrue(
            "探测超时应短于默认 ${ProviderConfig.DEFAULT_TIMEOUT_MS}",
            ProviderClient.PROBE_TIMEOUT_MS < ProviderConfig.DEFAULT_TIMEOUT_MS,
        )
    }
}
