package com.dogecode.mobile

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ChatMessage 的序列化往返测试。
 *
 * 历史持久化依赖 toJson/fromJson 成对正确 —— 若字段名不一致，
 * 重启后消息会静默丢失或状态错乱，且不会有任何报错。
 */
class ChatMessageTest {

    @Test
    fun `序列化往返保留全部字段`() {
        val original = ChatMessage(
            id = "abc-123",
            role = "user",
            text = "含特殊字符：换行\n引号\"反斜杠\\ 与 emoji 🚀",
            timestamp = 1790942040394L,
            status = ChatMessage.Status.QUEUED,
        )
        val round = ChatMessage.fromJson(original.toJson())

        assertEquals(original.id, round.id)
        assertEquals(original.role, round.role)
        assertEquals(original.text, round.text)
        assertEquals(original.timestamp, round.timestamp)
        assertEquals(original.status, round.status)
    }

    @Test
    fun `未知 status 回落 NONE 而不抛异常`() {
        // 老版本写入的 status 若在新版本被删除，不应导致整个历史读取失败
        val o = JSONObject().apply {
            put("id", "x")
            put("role", "assistant")
            put("text", "hi")
            put("timestamp", 1L)
            put("status", "SOME_REMOVED_STATE")
        }
        assertEquals(ChatMessage.Status.NONE, ChatMessage.fromJson(o).status)
    }

    @Test
    fun `缺失可选字段不抛异常`() {
        // 只给最小字段集，其余走 opt 默认值
        val o = JSONObject().apply {
            put("role", "assistant")
            put("text", "hi")
        }
        val m = ChatMessage.fromJson(o)
        assertEquals("assistant", m.role)
        assertEquals("hi", m.text)
        assertEquals(0L, m.timestamp)
    }

    @Test
    fun `工厂方法产生唯一 id`() {
        val a = ChatMessage.user("x")
        val b = ChatMessage.user("x")
        assertNotEquals(a.id, b.id)
        assertEquals(ChatMessage.Status.SENDING, a.status)
        assertEquals("user", a.role)
    }

    @Test
    fun `newId 多次调用不重复`() {
        val ids = (1..200).map { ChatMessage.newId() }.toSet()
        assertEquals(200, ids.size)
    }

    @Test
    fun `JSON 特殊字符不会破坏结构`() {
        // 文本含引号与换行，若不正确转义会生成非法 JSON
        val m = ChatMessage.assistant("he said \"hi\"\nand left \\")
        val parsed = JSONObject(m.toJson().toString())
        assertEquals(m.text, parsed.getString("text"))
        assertTrue(parsed.getString("text").contains("\n"))
    }

    // ── 工具气泡（role="tool"）──

    @Test
    fun `工具气泡序列化往返保留全部工具字段`() {
        val original = ChatMessage.tool(
            title = "▸ Bash  ls",
            detail = "ls -la /tmp",
            result = "total 4\ndrwxr-xr-x",
            state = "done",
            toolUseId = "toolu_001",
            truncated = true,
            fullLength = 83214,
        )
        val round = ChatMessage.fromJson(original.toJson())
        assertTrue(round.isTool)
        assertEquals(original.toolDetail, round.toolDetail)
        assertEquals(original.toolResult, round.toolResult)
        assertEquals(original.toolState, round.toolState)
        assertEquals(original.toolUseId, round.toolUseId)
        assertEquals(original.toolTruncated, round.toolTruncated)
        assertEquals(original.toolFullLength, round.toolFullLength)
    }

    @Test
    fun `工具气泡折叠态随历史持久化（关键：列表重建后不丢）`() {
        val m = ChatMessage.tool("▸ Read", state = "done").copy(expanded = true)
        val round = ChatMessage.fromJson(m.toJson())
        assertTrue(round.expanded)
    }

    @Test
    fun `折叠态默认 false 且不写入 JSON（保持历史文件精简）`() {
        val m = ChatMessage.tool("▸ Read", state = "done")
        val json = m.toJson()
        assertFalse(json.has("expanded"))
        assertFalse(ChatMessage.fromJson(json).expanded)
    }

    @Test
    fun `findRunningToolCallId 按 toolUseId 匹配 running 气泡`() {
        val running = ChatMessage.tool("▸ Bash ls", state = "running", toolUseId = "toolu_001")
        val other = ChatMessage.tool("▸ Read a", state = "running", toolUseId = "toolu_002")
        val done = ChatMessage.tool("▸ Edit b", state = "done", toolUseId = "toolu_001")
        assertEquals(running.id, ChatMessage.findRunningToolCallId(listOf(running, other, done), "toolu_001"))
    }

    @Test
    fun `findRunningToolCallId 不匹配已完成的同 id 气泡`() {
        // 只有 running 气泡是结果配对的合并目标；done 气泡已定稿，不再合并
        val done = ChatMessage.tool("▸ Bash ls", state = "done", toolUseId = "toolu_001")
        assertEquals(null, ChatMessage.findRunningToolCallId(listOf(done), "toolu_001"))
    }

    @Test
    fun `findRunningToolCallId 空 toolUseId 或空列表返回 null`() {
        assertEquals(null, ChatMessage.findRunningToolCallId(emptyList(), "toolu_001"))
        assertEquals(null, ChatMessage.findRunningToolCallId(emptyList(), ""))
    }

    // ── 回合分组的两个独立展开态（易混点）──

    @Test
    fun `气泡展开态与组展开态是独立字段`() {
        // 关键契约：expanded 是「这条气泡是否展开显示原文/结果」，
        // turnGroupExpanded 是「它所在的组是否展开」。二者若共用一个
        // 字段，用户点开单条气泡会导致整个组被判定为已展开 ——
        // 刷新后组内其他气泡突然全冒出来。
        val m = ChatMessage.tool("▸ Bash", state = "done").copy(
            expanded = true,
            turnGroupExpanded = false,
        )
        assertTrue("气泡应已展开", m.expanded)
        assertFalse("组应仍未展开", m.turnGroupExpanded)
    }

    @Test
    fun `组展开态随历史持久化`() {
        val m = ChatMessage.tool("▸ Bash", state = "done").copy(
            turnGroupKey = "g:x",
            turnGroupExpanded = true,
        )
        val round = ChatMessage.fromJson(m.toJson())
        assertEquals("g:x", round.turnGroupKey)
        assertTrue(round.turnGroupExpanded)
    }

    @Test
    fun `组折叠态默认 false 且不写入 JSON`() {
        val m = ChatMessage.tool("▸ Bash", state = "done").copy(turnGroupKey = "g:x")
        assertFalse(m.turnGroupExpanded)
        assertFalse("默认值不该写进历史文件", m.toJson().has("turnGroupExpanded"))
    }

    @Test
    fun `turnGroupKey 为空时不写入 JSON`() {
        // 非组首成员不该带这个字段，否则历史文件里全是空串噪音
        val m = ChatMessage.tool("▸ Bash", state = "done")
        assertFalse(m.toJson().has("turnGroupKey"))
    }

    // ── 用户消息附带的图片 ──

    @Test
    fun `带图片的消息序列化往返保留图片`() {
        val m = ChatMessage.userWithImages(
            text = "看看这个",
            images = listOf("AAAA", "BBBB"),
            mediaType = "image/jpeg",
        )
        val round = ChatMessage.fromJson(m.toJson())
        assertEquals(listOf("AAAA", "BBBB"), round.images)
        assertEquals("image/jpeg", round.imageMediaType)
        assertEquals("看看这个", round.text)
    }

    @Test
    fun `无图片的消息不写入 images 字段`() {
        // 历史文件里绝大多数消息没有图片，不该给它们加空数组噪音
        val m = ChatMessage.user("纯文本")
        assertFalse(m.toJson().has("images"))
        assertTrue(m.images.isEmpty())
    }

    @Test
    fun `图片条数超限时被截断（防历史文件被撑爆）`() {
        // 单条消息最多 4 张：不限制的话几十张图会让 history.json 涨到几 MB，
        // 每次冷启动都要解析，界面会明显卡顿
        val many = (1..10).map { "img$it" }
        val m = ChatMessage.userWithImages("多图", many, "image/png")
        assertEquals(ChatMessage.MAX_IMAGES_PER_MSG, m.images.size)
        assertEquals(listOf("img1", "img2", "img3", "img4"), m.images)
    }

    @Test
    fun `从 JSON 读取时也限制条数（防手工构造的坏数据）`() {
        // 历史文件可能被手工编辑或来自旧版本，读取端同样要设限
        val o = org.json.JSONObject().apply {
            put("id", "x")
            put("role", "user")
            put("text", "t")
            put("timestamp", 1L)
            put(
                "images",
                org.json.JSONArray((1..20).map { "i$it" }),
            )
        }
        assertEquals(ChatMessage.MAX_IMAGES_PER_MSG, ChatMessage.fromJson(o).images.size)
    }

    @Test
    fun `JSON 里的空字符串图片被过滤`() {
        val o = org.json.JSONObject().apply {
            put("id", "x")
            put("role", "user")
            put("text", "t")
            put("timestamp", 1L)
            put("images", org.json.JSONArray(listOf("ok", "", "ok2")))
        }
        assertEquals(listOf("ok", "ok2"), ChatMessage.fromJson(o).images)
    }

    @Test
    fun `缺 images 字段时为空列表而非崩`() {
        val o = org.json.JSONObject().apply {
            put("role", "user")
            put("text", "t")
        }
        assertTrue(ChatMessage.fromJson(o).images.isEmpty())
    }
}
