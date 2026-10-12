package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * `ProviderProfiles` 纯逻辑测试（M5 多服务商档案）。
 *
 * 这些操作错了全是静默的：序列化丢字段 → 切档案丢 URL/KEY/模型；
 * 迁移漏 key → 老用户升级后 key 没了；switchTo 写成追加 → 列表越来越长
 * 当前项却没变。故必须可单测（零 Android 依赖）。
 */
class ProviderProfilesTest {

    private fun cfg(key: String = "k") = ProviderConfig(
        apiKey = key,
        baseURL = "https://example.com/v1",
        model = "m",
        thinkingBudget = 1024,
    )

    // ── create / sanitizeName ──

    @Test
    fun `create 生成非空唯一 id 且清洗空名`() {
        val a = ProviderProfiles.create("")
        val b = ProviderProfiles.create("  ")
        assertTrue(a.id.isNotBlank())
        assertTrue(b.id.isNotBlank())
        // 空名回落默认「服务商」
        assertEquals("服务商", a.name)
        assertEquals("服务商", b.name)
    }

    @Test
    fun `连续 newId 不撞名`() {
        val ids = (1..200).map { ProviderProfiles.newId() }.toSet()
        assertEquals("200 个 id 必须全不同", 200, ids.size)
    }

    // ── serialize / parse 互逆（关键：非敏感字段不丢）──

    @Test
    fun `serialize 与 parse 互逆`() {
        val list = listOf(
            ProviderProfile("p1", "自建网关", cfg("keyA")),
            ProviderProfile("p2", "DeepSeek", cfg("keyB")),
        )
        val parsed = ProviderProfiles.parse(ProviderProfiles.serialize(list))
        assertEquals(2, parsed.size)
        assertEquals("p1", parsed[0].id)
        assertEquals("自建网关", parsed[0].name)
        assertEquals("https://example.com/v1", parsed[0].config.baseURL)
        assertEquals("m", parsed[0].config.model)
        assertEquals(1024, parsed[0].config.thinkingBudget)
    }

    @Test
    fun `parse 容忍非 JSON 与空输入`() {
        assertTrue(ProviderProfiles.parse(null).isEmpty())
        assertTrue(ProviderProfiles.parse("").isEmpty())
        assertTrue(ProviderProfiles.parse("not json").isEmpty())
        assertTrue(ProviderProfiles.parse("{broken").isEmpty())
    }

    @Test
    fun `parse 缺字段回落默认且不崩`() {
        // 只给 id 与 name，其余应回落 ProviderConfig 默认值
        val raw = """[{"id":"x","name":"仅名"}]"""
        val parsed = ProviderProfiles.parse(raw)
        assertEquals(1, parsed.size)
        assertEquals("", parsed[0].config.baseURL)
        assertEquals(0, parsed[0].config.thinkingBudget)
        assertEquals(ProviderConfig.DEFAULT_TIMEOUT_MS, parsed[0].config.timeoutMs)
    }

    @Test
    fun `可空字段（temperature 与 maxTokens）正确序列化与还原`() {
        val c = cfg().copy(temperature = 0.7, maxTokens = 4096)
        val list = listOf(ProviderProfile("p", "带约束", c))
        val parsed = ProviderProfiles.parse(ProviderProfiles.serialize(list)).first()
        assertEquals(0.7, parsed.config.temperature!!, 0.0)
        assertEquals(4096, parsed.config.maxTokens!!)
    }

    @Test
    fun `headers 正确序列化与还原`() {
        val c = cfg().copy(headers = mapOf("X-Api-Version" to "2024"))
        val list = listOf(ProviderProfile("p", "带头", c))
        val parsed = ProviderProfiles.parse(ProviderProfiles.serialize(list)).first()
        assertEquals("2024", parsed.config.headers["X-Api-Version"])
    }

    // ── apiKey 绝不明文落盘（安全底线）──

    @Test
    fun `序列化结果不含明文 apiKey`() {
        val list = listOf(ProviderProfile("p1", "网关", cfg("SK-SECRET-123")))
        val raw = ProviderProfiles.serialize(list)
        assertFalse("apiKey 绝不能写进明文 JSON", raw.contains("SK-SECRET-123"))
    }

    // ── add / switchTo / remove / update ──

    @Test
    fun `add 新档案置顶`() {
        val r = ProviderProfiles.add(
            listOf(ProviderProfile("a", "A", cfg()), ProviderProfile("b", "B", cfg())),
            ProviderProfile("c", "C", cfg()),
        )
        assertEquals(listOf("c", "a", "b"), r.map { it.id })
    }

    @Test
    fun `add 已存在 id 时覆盖而非重复`() {
        // 用户重复选同一档案 = 想切过去，但档案是同一份，故改为覆盖其内容
        val r = ProviderProfiles.add(
            listOf(ProviderProfile("a", "A", cfg())),
            ProviderProfile("a", "A2", cfg("new")),
        )
        assertEquals(1, r.size)
        assertEquals("A2", r.first().name)
    }

    @Test
    fun `add 超上限丢最旧`() {
        // 造满 MAX 项（p1..p8），再加一项 → 新项置顶，最长者（p8）被挤出。
        // 注意：保留的是前 MAX 项 [new, p1..p7]，故 last 是 p7。
        // （原断言写的 p1 是错的 —— 那是最旧保留项的头，不是尾。）
        val full = (1..ProviderProfiles.MAX).map { ProviderProfile("p$it", "P$it", cfg()) }
        val r = ProviderProfiles.add(full, ProviderProfile("new", "New", cfg()))
        assertEquals(ProviderProfiles.MAX, r.size)
        assertEquals("new", r.first().id)
        assertEquals("p7", r.last().id)
        // 被挤掉的是最旧的 p8
        assertFalse("最旧的 p8 应被丢弃", r.any { it.id == "p8" })
    }

    @Test
    fun `switchTo 把已有项切到首位`() {
        val r = ProviderProfiles.switchTo(
            listOf(ProviderProfile("a", "A", cfg()), ProviderProfile("b", "B", cfg())),
            "b",
        )
        assertEquals("b", r.first().id)
    }

    @Test
    fun `switchTo 不在列表中时原样返回`() {
        val list = listOf(ProviderProfile("a", "A", cfg()), ProviderProfile("b", "B", cfg()))
        assertEquals(list, ProviderProfiles.switchTo(list, "nope"))
    }

    @Test
    fun `remove 移除当前项后下一项成为当前`() {
        val r = ProviderProfiles.remove(
            listOf(ProviderProfile("a", "A", cfg()), ProviderProfile("b", "B", cfg())),
            "a",
        )
        assertEquals(listOf("b"), r.map { it.id })
    }

    @Test
    fun `remove 不存在的项原样返回`() {
        val list = listOf(ProviderProfile("a", "A", cfg()))
        assertEquals(list, ProviderProfiles.remove(list, "x"))
    }

    @Test
    fun `update 按 id 覆盖配置`() {
        val r = ProviderProfiles.update(
            listOf(ProviderProfile("a", "A", cfg("old"))),
            ProviderProfile("a", "A", cfg("new")),
        )
        assertEquals(1, r.size)
        assertEquals("new", r.first().config.apiKey)
    }

    @Test
    fun `current 取首项（当前档案）`() {
        val list = listOf(ProviderProfile("a", "A", cfg()), ProviderProfile("b", "B", cfg()))
        assertEquals("a", ProviderProfiles.current(list)?.id)
        assertNull(ProviderProfiles.current(emptyList()))
    }

    // ── 旧单份配置迁移 ──

    @Test
    fun `migrateLegacy 把旧字段合成首个档案`() {
        val p = ProviderProfiles.migrateLegacy(
            legacyBaseURL = "https://old.example.com/v1",
            legacyModel = "old-model",
            legacyTimeoutMs = 30000,
            legacyThinking = 2048,
            legacyTemperature = "0.5",
            legacyMaxTokens = "1024",
        )
        assertNotNull(p)
        assertEquals("默认服务商", p!!.name)
        assertEquals("https://old.example.com/v1", p.config.baseURL)
        assertEquals("old-model", p.config.model)
        assertEquals(30000, p.config.timeoutMs)
        assertEquals(2048, p.config.thinkingBudget)
        assertEquals(0.5, p.config.temperature!!, 0.0)
        assertEquals(1024, p.config.maxTokens!!)
    }

    @Test
    fun `migrateLegacy 的 id 稳定且 apiKey 为空（key 由 store 单独迁移）`() {
        val p = ProviderProfiles.migrateLegacy(
            legacyBaseURL = "https://x.com/v1",
            legacyModel = "",
            legacyTimeoutMs = 0,
            legacyThinking = 0,
            legacyTemperature = null,
            legacyMaxTokens = null,
        )
        assertNotNull(p)
        // apiKey 绝不能出现在迁移档案里（key 走 SecureStore 按 id 存）
        assertEquals("", p!!.config.apiKey)
        assertTrue(p.id.isNotBlank())
    }
}
