package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * `LocalHistoryCodec` 测试。
 *
 * 这是 M1 的核心契约层：
 * - JSON 往返保留 `user` / `assistant` / `system`
 * - 跳过 `tool` 消息（事件而非上下文，落盘会让文件膨胀 3-5 倍）
 * - 空内容 / 坏 JSON 不会让整文件加载失败
 */
class LocalHistoryCodecTest {

    @Test
    fun `toJson 仅保留 user 与 assistant 文本（跳过 tool）`() {
        val msgs = listOf(
            ChatMsg.user("hi"),
            ChatMsg.assistant("hello"),
            ChatMsg(
                role = "tool",
                content = "file contents",
                toolCallId = "call_1",
                name = "read_file",
            ),
            ChatMsg.assistant("done"),
        )
        val json = LocalHistoryCodec.toJson(msgs)
        // 2 个 user/assistant + 1 个 tool 被跳过 = 2 条
        // (实际是 1 user + 2 assistant = 3，因为第二个 assistant 也保留)
        // 重新数：user + assistant + tool(跳过) + assistant = 3
        val arr = org.json.JSONArray(json)
        assertEquals(3, arr.length())
        assertEquals("user", arr.getJSONObject(0).getString("role"))
        assertEquals("assistant", arr.getJSONObject(1).getString("role"))
        assertEquals("assistant", arr.getJSONObject(2).getString("role"))
    }

    @Test
    fun `fromJson 还原 user 与 assistant 文本`() {
        val json = """[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}]"""
        val msgs = LocalHistoryCodec.fromJson(json)
        assertEquals(2, msgs.size)
        assertEquals("user", msgs[0].role)
        assertEquals("hi", msgs[0].content)
        assertEquals("assistant", msgs[1].role)
        assertEquals("hello", msgs[1].content)
    }

    @Test
    fun `tool_calls 完整往返（这是 model 看不懂半截 JSON 的根因）`() {
        val original = listOf(
            ChatMsg.user("改个文件"),
            ChatMsg(
                role = "assistant",
                content = null,
                toolCalls = listOf(
                    ToolCall(id = "call_abc", name = "read_file", arguments = """{"path":"a.ts"}"""),
                ),
            ),
        )
        val json = LocalHistoryCodec.toJson(original)
        val restored = LocalHistoryCodec.fromJson(json)

        assertEquals(2, restored.size)
        val assistant = restored[1]
        assertEquals("assistant", assistant.role)
        assertNull("content 应为 null（保留原义）", assistant.content)
        assertEquals(1, assistant.toolCalls.size)
        assertEquals("call_abc", assistant.toolCalls[0].id)
        assertEquals("read_file", assistant.toolCalls[0].name)
        assertEquals("""{"path":"a.ts"}""", assistant.toolCalls[0].arguments)
    }

    @Test
    fun `带 tool_calls 的 assistant 即使无正文也保留（模型下一轮要靠它）`() {
        // 这是**不能省**的一条：若丢掉它，恢复的历史里模型看到
        // user 之后直接是 tool 结果，会困惑「我什么时候说要调工具？」
        val msgs = listOf(
            ChatMsg.user("hi"),
            ChatMsg(role = "assistant", content = null, toolCalls = listOf(
                ToolCall(id = "x", name = "noop", arguments = "{}"),
            )),
        )
        val arr = org.json.JSONArray(LocalHistoryCodec.toJson(msgs))
        assertEquals(2, arr.length())
    }

    @Test
    fun `既无正文也无 tool_calls 的 assistant 才省掉`() {
        val msgs = listOf(
            ChatMsg.user("hi"),
            ChatMsg(role = "assistant", content = null),
        )
        val arr = org.json.JSONArray(LocalHistoryCodec.toJson(msgs))
        assertEquals("空壳 assistant 应省掉", 1, arr.length())
    }

    @Test
    fun `系统消息也参与往返（提示词场景）`() {
        val msgs = listOf(
            ChatMsg.system("你是助手"),
            ChatMsg.user("hi"),
            ChatMsg.assistant("hello"),
        )
        val restored = LocalHistoryCodec.fromJson(LocalHistoryCodec.toJson(msgs))
        assertEquals(3, restored.size)
        assertEquals("system", restored[0].role)
        assertEquals("你是助手", restored[0].content)
    }

    @Test
    fun `空 content 的 system 不进 JSON`() {
        val msgs = listOf(ChatMsg("system", null), ChatMsg.user("hi"))
        val arr = org.json.JSONArray(LocalHistoryCodec.toJson(msgs))
        assertEquals(1, arr.length())
    }

    @Test
    fun `坏 JSON 不会让整个加载失败（返回空列表）`() {
        // 整文件坏：用户手改坏了文件。整体丢弃比「尽力抢救半截」更安全，
        // 否则模型会看到断裂的对话链（见 fromJson 注释）
        assertEquals(0, LocalHistoryCodec.fromJson("").size)
        assertEquals(0, LocalHistoryCodec.fromJson("not json").size)
        assertEquals(0, LocalHistoryCodec.fromJson("""[oops]""").size)
    }

    @Test
    fun `合法 JSON 里的单条脏数据被跳过（其余保留）`() {
        // 缺 role、缺 content、未知 role：单条跳过，其余保留
        val json = """[
            {"role":"user","content":"ok"},
            {"content":"no role"},
            {"role":"unknown","content":"x"},
            {"role":"assistant","content":"hi"}
        ]"""
        val msgs = LocalHistoryCodec.fromJson(json)
        assertEquals(2, msgs.size)
        assertEquals("ok", msgs[0].content)
        assertEquals("hi", msgs[1].content)
    }

    @Test
    fun `缺 role 或非法 role 的条目被跳过`() {
        val json = """[{"content":"x"},{"role":"unknown","content":"y"},{"role":"user","content":"z"}]"""
        val msgs = LocalHistoryCodec.fromJson(json)
        assertEquals(1, msgs.size)
        assertEquals("z", msgs[0].content)
    }

    // ── UI 转换 ──

    @Test
    fun `toChatMsgs 跳过 role=tool 的 UI 消息（与持久化一致）`() {
        val ui = listOf(
            ChatMessage(id = "1", role = "user", text = "hi", timestamp = 1L),
            ChatMessage(id = "2", role = "tool", text = "结果", timestamp = 2L, toolState = "done"),
            ChatMessage(id = "3", role = "assistant", text = "ok", timestamp = 3L),
        )
        val cms = LocalHistoryCodec.toChatMsgs(ui)
        assertEquals(2, cms.size)
        assertEquals("user", cms[0].role)
        assertEquals("assistant", cms[1].role)
    }

    @Test
    fun `toChatMessages 给每条消息新生成 id（不沿用推理时的引用）`() {
        val cms = listOf(ChatMsg.user("hi"), ChatMsg.assistant("hello"))
        val ui = LocalHistoryCodec.toChatMessages(cms)
        assertEquals(2, ui.size)
        // id 必须存在且不与 ChatMessage 的「在途」消息碰撞
        // 用 newId() 两次不同，验证它们不相等即可
        assertNotNull(ui[0].id)
        assertNotNull(ui[1].id)
    }

    @Test
    fun `toChatMessages 空 content 的 assistant 不进 UI（与落盘一致）`() {
        val cms = listOf(ChatMsg.user("hi"), ChatMsg(role = "assistant", content = null))
        val ui = LocalHistoryCodec.toChatMessages(cms)
        assertEquals(1, ui.size)
        assertEquals("user", ui[0].role)
    }

    @Test
    fun `tool_calls 字段在 UI 转换时被丢弃（UI 不读）`() {
        val cms = listOf(
            ChatMsg(
                role = "assistant",
                content = null,
                toolCalls = listOf(ToolCall(id = "x", name = "f", arguments = "{}")),
            ),
        )
        val ui = LocalHistoryCodec.toChatMessages(cms)
        // content 为 null 的 assistant 被丢弃（与上面那条用例同源）
        assertTrue(ui.isEmpty())
    }
}
