package com.dogecode.mobile

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 落库记录的「字符串 null」清洗测试。
 *
 * ## 背景（真机踩过）
 *
 * `JSONObject.optString(key)` 在字段值是 JSON `null` 时**返回字符串 "null"**
 * 而非空串 —— 于是 `takeIf { it.isNotBlank() }` 放行，会话列表里出现
 * `addresses: ["null"]` 这种**点不动的僵尸条目**（实测见手机端
 * `doge_known_sessions.xml`）。本测试锁定清洗行为（新写入 + 旧记录自愈）。
 */
class KnownSessionNullTest {

    private fun json(mode: String, addresses: JSONArray, label: String = "x"): JSONObject =
        JSONObject().apply {
            put("mode", mode)
            put("label", label)
            put("cwd", "")
            put("port", 6000)
            put("resumeSessionId", JSONObject.NULL)
            put("addresses", addresses)
            put("lastSeen", 1L)
        }

    @Test
    fun `addresses 只有字符串 null 时该条被丢弃`() {
        val arr = JSONArray().apply { put("null") }
        assertNull(
            "全是 \"null\" 地址的记录应被丢弃（僵尸条目）",
            KnownSessionStore.parseOnePure(json("LAN", arr)),
        )
    }

    @Test
    fun `addresses 混合 null 与真实地址时只保留真实地址`() {
        val arr = JSONArray().apply {
            put("null")
            put("http://192.168.0.5:6000")
        }
        val s = KnownSessionStore.parseOnePure(json("LAN", arr))!!
        assertEquals(listOf("http://192.168.0.5:6000"), s.addresses)
    }

    @Test
    fun `resumeSessionId 为 JSON null 时解析为 Kotlin null（不是字符串 null）`() {
        val arr = JSONArray().apply { put("http://a:1") }
        val s = KnownSessionStore.parseOnePure(json("LAN", arr))!!
        assertNull(s.resumeSessionId)
    }

    @Test
    fun `label 为字符串 null 时回落空串而非字面量 null`() {
        val arr = JSONArray().apply { put("http://a:1") }
        val o = json("LAN", arr).apply { put("label", "null") }
        assertEquals("", KnownSessionStore.parseOnePure(o)!!.label)
    }

    @Test
    fun `正常记录不受影响`() {
        val arr = JSONArray().apply { put("http://a:1"); put("http://b:2") }
        val s = KnownSessionStore.parseOnePure(json("LAN", arr, "正常"))!!
        assertEquals(listOf("http://a:1", "http://b:2"), s.addresses)
        assertTrue(s.label == "正常")
    }

    /**
     * 记录一个**环境差异**（不依赖具体实现，故只断言「不是真实值」）：
     *
     * `JSONObject.optString` 对 JSON `null` 的返回值**因实现而异**：
     * - JVM（单元测试）：返回空串 `""`
     * - Android 运行时：返回**字符串 `"null"`** ← 真机脏数据的实际来源
     *
     * 所以清洗逻辑必须同时挡 `""`（isBlank）**和** `"null"`（字面量），
     * 且**不能**用「JVM 上 optString 返回什么」来推断真机行为 ——
     * 这正是本类各用例都断言**清洗后结果**而非 optString 原始输出的原因。
     */
    @Test
    fun `环境差异：optString 对 JSON null 的返回值不可依赖`() {
        val o = JSONObject().apply { put("k", JSONObject.NULL) }
        val v = o.optString("k")
        // 无论实现返回 "" 还是 "null"，都必须被清洗逻辑判为「无效」
        val treatedInvalid = v.isBlank() || v == "null"
        assertTrue("JSON null 的 optString 结果必须被视作无效，实际='$v'", treatedInvalid)
    }
}
