package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 流式增量与工具活动的协议解析测试。
 *
 * 两个判定直接决定「看不见过程」这个体验缺口是否真的被补上：
 * 1. 增量必须与定稿消息**区分**开（前者可丢、是预览；后者权威、会替换预览）。
 *    若解析时混为一谈，客户端会把增量当正式消息追加，定稿再追加一次 → 内容重复。
 * 2. 工具活动缺 name 时必须丢弃 —— 否则活动区出现一行只有图标没有内容的空白条目。
 */
class StreamProtocolTest {

    // ── 流式增量 ──

    @Test
    fun `增量正常解析`() {
        val json = """{"type":"assistant_delta","data":{"text":"你好","seq":7}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.Delta
        assertEquals("你好", m.text)
        assertEquals(7, m.seq)
    }

    @Test
    fun `增量与定稿是不同类型`() {
        // 关键：两者必须可区分。客户端靠这个区分「预览」与「正式」——
        // 混同会导致文本重复显示（增量一次 + 定稿一次）
        val delta = BridgeProtocol.parse("""{"type":"assistant_delta","data":{"text":"a","seq":1}}""")
        val incoming = BridgeProtocol.parse("""{"type":"assistant","data":{"text":"a"}}""")
        assertTrue(delta is BridgeProtocol.Msg.Delta)
        assertTrue(incoming is BridgeProtocol.Msg.Incoming)
        assertNotEquals(delta::class, incoming::class)
    }

    @Test
    fun `空文本增量被丢弃`() {
        // 空增量推进 seq 会让客户端的跳号检测误判
        assertTrue(
            BridgeProtocol.parse("""{"type":"assistant_delta","data":{"text":"","seq":1}}""")
                is BridgeProtocol.Msg.Unparsed,
        )
    }

    @Test
    fun `缺 data 的增量被丢弃`() {
        assertTrue(
            BridgeProtocol.parse("""{"type":"assistant_delta"}""")
                is BridgeProtocol.Msg.Unparsed,
        )
    }

    @Test
    fun `缺 seq 时回落为 0`() {
        val m = BridgeProtocol.parse("""{"type":"assistant_delta","data":{"text":"x"}}""")
            as BridgeProtocol.Msg.Delta
        assertEquals(0, m.seq)
    }

    @Test
    fun `增量文本不被截断`() {
        // 一次 delta 通常很短，但重连后的补推可能较长 —— 不能截断
        val long = "字".repeat(3000)
        val m = BridgeProtocol.parse("""{"type":"assistant_delta","data":{"text":"$long","seq":1}}""")
            as BridgeProtocol.Msg.Delta
        assertEquals(3000, m.text.length)
    }

    @Test
    fun `增量含换行与代码块标记时原样保留`() {
        val text = "```kotlin\\nfun main() {}\\n```"
        val json = """{"type":"assistant_delta","data":{"text":"$text","seq":1}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.Delta
        assertTrue(m.text.contains("```"))
    }

    // ── 工具活动 ──

    @Test
    fun `工具活动正常解析`() {
        val json = """{"type":"tool_activity","data":{
          "kind":"tool","name":"Read","target":"src/a.ts","state":"running"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.ToolActivity
        assertEquals("tool", m.kind)
        assertEquals("Read", m.name)
        assertEquals("src/a.ts", m.target)
        assertEquals("running", m.state)
    }

    @Test
    fun `子代理活动正常解析`() {
        val json = """{"type":"tool_activity","data":{
          "kind":"agent","name":"子代理","target":"重构模块","state":"running"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.ToolActivity
        assertEquals("agent", m.kind)
        assertEquals("重构模块", m.target)
    }

    @Test
    fun `缺 name 的活动被丢弃`() {
        // 缺 name 会让活动区出现一行只有图标没有内容的空白条目
        assertTrue(
            BridgeProtocol.parse("""{"type":"tool_activity","data":{"kind":"tool","target":"x"}}""")
                is BridgeProtocol.Msg.Unparsed,
        )
    }

    @Test
    fun `name 为空串也丢弃`() {
        assertTrue(
            BridgeProtocol.parse("""{"type":"tool_activity","data":{"name":""}}""")
                is BridgeProtocol.Msg.Unparsed,
        )
    }

    @Test
    fun `缺 kind 时回落为 tool`() {
        val m = BridgeProtocol.parse("""{"type":"tool_activity","data":{"name":"Bash"}}""")
            as BridgeProtocol.Msg.ToolActivity
        assertEquals("tool", m.kind)
    }

    @Test
    fun `缺 target 时为空串而非崩`() {
        val m = BridgeProtocol.parse("""{"type":"tool_activity","data":{"name":"Bash"}}""")
            as BridgeProtocol.Msg.ToolActivity
        assertEquals("", m.target)
    }

    @Test
    fun `缺 state 时回落为 running`() {
        val m = BridgeProtocol.parse("""{"type":"tool_activity","data":{"name":"Bash"}}""")
            as BridgeProtocol.Msg.ToolActivity
        assertEquals("running", m.state)
    }

    @Test
    fun `活动不会被误判为聊天消息`() {
        // 回归：tool_activity 的 data 里有 name/target，
        // 若解析顺序写错可能落到 assistant 分支被渲染成气泡
        val m = BridgeProtocol.parse("""{"type":"tool_activity","data":{"name":"Bash","target":"ls"}}""")
        assertTrue(m is BridgeProtocol.Msg.ToolActivity)
    }

    // ── 可折叠工具气泡的新字段（detail / result / toolUseId / truncated / fullLength）──

    @Test
    fun `工具活动解析原文与结果字段`() {
        val json = """{"type":"tool_activity","data":{
          "kind":"tool","name":"Bash","target":"ls","state":"running",
          "detail":"ls -la","result":"","toolUseId":"toolu_001",
          "truncated":false,"fullLength":0}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.ToolActivity
        assertEquals("ls -la", m.detail)
        assertEquals("", m.result)
        assertEquals("toolu_001", m.toolUseId)
        assertEquals(false, m.truncated)
        assertEquals(0, m.fullLength)
    }

    @Test
    fun `结果事件 name 留空但带 result 时不丢弃（关键：命令输出不能丢）`() {
        // 服务端 describeToolResultForMobile 的 name 恒为空（Anthropic 结果块
        // 只有 tool_use_id 没有工具名）。若按 name 空一律丢弃，命令输出全丢。
        val json = """{"type":"tool_activity","data":{
          "kind":"tool","name":"","state":"done",
          "result":"npm test 通过","toolUseId":"toolu_001"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.ToolActivity
        assertEquals("done", m.state)
        assertEquals("npm test 通过", m.result)
        assertEquals("toolu_001", m.toolUseId)
    }

    @Test
    fun `thinking 事件解析 detail 为思考内容`() {
        val json = """{"type":"tool_activity","data":{
          "kind":"thinking","name":"思考","state":"running","detail":"我先定位文件"}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.ToolActivity
        assertEquals("thinking", m.kind)
        assertEquals("我先定位文件", m.detail)
    }

    @Test
    fun `截断标志与原始长度解析`() {
        val json = """{"type":"tool_activity","data":{
          "name":"Read","state":"done","result":"abc","truncated":true,"fullLength":83214}}"""
        val m = BridgeProtocol.parse(json) as BridgeProtocol.Msg.ToolActivity
        assertEquals(true, m.truncated)
        assertEquals(83214, m.fullLength)
    }

    @Test
    fun `无名且非结果的活动仍丢弃（空白条目防线仍在）`() {
        // 运行中的活动 name 空、也没有 result → 仍是坏数据，应丢弃
        assertTrue(
            BridgeProtocol.parse("""{"type":"tool_activity","data":{"state":"running","target":"x"}}""")
                is BridgeProtocol.Msg.Unparsed,
        )
    }
}
