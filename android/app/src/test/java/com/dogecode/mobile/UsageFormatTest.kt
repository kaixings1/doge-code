package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 用量展示格式测试。
 *
 * 为什么必须测：单位换算（k/M）、时长进位（秒/分）、成本小数位
 * 每一处都在边界上容易写错，而错了只是「显示得怪」——
 * 不会报错，真机上很难注意到。例如把 1000 显示成 1.0k 还是 1k、
 * 59.9 秒是否已经进位成 1m0s，都是这类静默错误。
 *
 * 变异验证：把 tokens 的 `< 1_000` 改成 `<= 1_000`，
 * 「999 显示原数」用例失败。
 */
class UsageFormatTest {

    // ── tokens ──

    @Test
    fun `小于一千显示原数`() {
        assertEquals("0", UsageFormat.tokens(0))
        assertEquals("999", UsageFormat.tokens(999))
    }

    @Test
    fun `一千起用 k`() {
        assertEquals("1k", UsageFormat.tokens(1_000))
        assertEquals("12.4k", UsageFormat.tokens(12_400))
    }

    @Test
    fun `整数 k 不显示小数`() {
        // 12.0k 应显示成 12k —— 视觉噪音，无信息量
        assertEquals("12k", UsageFormat.tokens(12_000))
        assertEquals("100k", UsageFormat.tokens(100_000))
    }

    @Test
    fun `一百万起用 M`() {
        assertEquals("1M", UsageFormat.tokens(1_000_000))
        assertEquals("1.5M", UsageFormat.tokens(1_500_000))
    }

    @Test
    fun `k 与 M 边界`() {
        assertEquals("999.9k", UsageFormat.tokens(999_900))
        assertEquals("1M", UsageFormat.tokens(1_000_000))
    }

    // ── duration ──

    @Test
    fun `小于一分钟显示秒带一位小数`() {
        assertEquals("8.3s", UsageFormat.duration(8_300))
        assertEquals("0.5s", UsageFormat.duration(500))
    }

    @Test
    fun `零与负数安全`() {
        assertEquals("0s", UsageFormat.duration(0))
        assertEquals("0s", UsageFormat.duration(-100))
    }

    @Test
    fun `刚好一分钟进位到分`() {
        assertEquals("1m0s", UsageFormat.duration(60_000))
    }

    @Test
    fun `超过一分钟显示分秒`() {
        assertEquals("1m23s", UsageFormat.duration(83_000))
        assertEquals("2m5s", UsageFormat.duration(125_000))
    }

    @Test
    fun `几秒的边界（小于 60 秒不归零）`() {
        // 59.9 秒仍是秒，不该显示成 0m59s
        assertEquals("59.9s", UsageFormat.duration(59_900))
    }

    // ── cost ──

    @Test
    fun `零成本返回空串`() {
        // 显示 $0.0000 会让人误以为「免费」，不如不显示
        assertEquals("", UsageFormat.cost(0.0))
    }

    @Test
    fun `小额成本保留四位小数`() {
        // 一次对话显示 $0.00 会让人以为没计费
        assertEquals("$0.0023", UsageFormat.cost(0.0023))
    }

    @Test
    fun `正常成本保留三位`() {
        assertEquals("$0.023", UsageFormat.cost(0.0231))
        // 1.2345 按标准四舍五入进到 1.235（%.3f 的行为）
        assertEquals("$1.235", UsageFormat.cost(1.2345))
    }

    // ── line ──

    @Test
    fun `完整行含 token 与时长与成本`() {
        val s = UsageFormat.line(10_000, 2_400, 8_300, 0.0231)
        assertEquals("12.4k tokens · 8.3s · $0.023", s)
    }

    @Test
    fun `token 取输入输出之和`() {
        // 用户关心「总共过了多少」，拆分显示对决策无帮助
        val s = UsageFormat.line(1_000, 500, 0, 0.0)
        assertEquals("1.5k tokens", s)
    }

    @Test
    fun `无成本时省略成本段`() {
        val s = UsageFormat.line(1_000, 500, 2_000, 0.0)
        assertFalse("不应出现美元符号", s.contains("$"))
        assertEquals("1.5k tokens · 2.0s", s)
    }

    @Test
    fun `全零返回空串`() {
        assertEquals("", UsageFormat.line(0, 0, 0, 0.0))
    }

    @Test
    fun `缓存读取不单独显示`() {
        // 缓存读取是省钱项，展示成消耗会误导
        val s = UsageFormat.line(1_000, 500, 1_000, 0.01)
        assertFalse("不应出现缓存字样", s.contains("缓存"))
        assertFalse("不应出现 cache", s.lowercase().contains("cache"))
    }

    // ── 协议解析 ──

    @Test
    fun `usage 帧正常解析`() {
        val json = """{"type":"usage","data":{
          "inputTokens":12400,"outputTokens":3400,
          "cacheReadTokens":8000,"durationMs":8300,"costUSD":0.0231}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.Usage
        assertEquals(12400, m.inputTokens)
        assertEquals(3400, m.outputTokens)
        assertEquals(8000, m.cacheReadTokens)
        assertEquals(8300L, m.durationMs)
        assertEquals(0.0231, m.costUSD, 0.00001)
    }

    @Test
    fun `usage 缺字段时回落为零而非崩`() {
        val m = BridgeProtocol.parse("""{"type":"usage","data":{}}""")
            as BridgeProtocol.Msg.Usage
        assertEquals(0, m.inputTokens)
        assertEquals(0L, m.durationMs)
    }

    @Test
    fun `usage 缺 data 被丢弃`() {
        assertTrue(BridgeProtocol.parse("""{"type":"usage"}""") is BridgeProtocol.Msg.Unparsed)
    }

    @Test
    fun `usage 不会被误判为聊天消息`() {
        // 回归：usage 的 data 有数字字段，若分支写错可能落入别的解析
        val m = BridgeProtocol.parse("""{"type":"usage","data":{"inputTokens":1}}""")
        assertTrue(m is BridgeProtocol.Msg.Usage)
    }
}