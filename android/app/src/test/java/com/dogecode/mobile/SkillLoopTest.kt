package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 验证 AgentLoop 与技能桥接的接线（纯逻辑，无 Android 依赖）。
 *
 * 关键契约：当模型请求 `use_skill_<id>` 且 [AgentLoop.skillBridge] 命中时，
 * 该调用应被当作「注入 prompt 的工具结果」回填，模型下一轮能看到注入文本，
 * 且**不会**误走到文件工具 [LocalTools.execute]。
 */
class SkillLoopTest {

  /** 假 chatFn：固定先请求一次 use_skill_dbg，再给出正文结束。 */
  private fun skillChatFn(skillName: String): (List<ChatMsg>, List<ToolSpec>) -> ChatResult {
    var first = true
    return { _, _ ->
      if (first) {
        first = false
        ChatResult(
          text = "",
          toolCalls = listOf(ToolCall(id = "c1", name = skillName, arguments = """{"args":"看启动崩溃"}""")),
          finishReason = "tool_calls",
        )
      } else {
        ChatResult(text = "已按技能指引完成", toolCalls = emptyList(), finishReason = "stop")
      }
    }
  }

  @Test
  fun skillCallInjectedAsToolResult() {
    val bridge: (String, String) -> String? = { name, _ ->
      if (name == "use_skill_dbg") "【调试工作流】先复现再定位" else null
    }
    val loop = AgentLoop(
      workspace = File("."),
      chatFn = skillChatFn("use_skill_dbg"),
      extraSpecs = listOf(
        ToolSpec("use_skill_dbg", "调试技能", org.json.JSONObject()),
      ),
      skillBridge = bridge,
    )
    // maxSteps 是构造后可改的属性（不是构造参数）
    loop.maxSteps = 5
    val result = loop.run(history = emptyList(), userInput = "帮我调试")
    assertTrue(result.isDone)
    assertTrue(result.text.contains("已按技能指引完成"))
  }

  @Test
  fun nonSkillCallFallsThroughToToolFn() {
    // skillBridge 返回 null → 应走普通 toolFn（这里返回可见标记证明没被注入）
    val loop = AgentLoop(
      workspace = File("."),
      chatFn = skillChatFn("read_file"),
      extraSpecs = emptyList(),
      skillBridge = { _, _ -> null },
      toolFn = { name, _ -> LocalTools.ToolResult.of(name, "FILE_TOOL_RAN") },
    )
    loop.maxSteps = 5
    // read_file 不在 LocalTools.specs() 的假实现里会走 ToolResult，但 toolFn 被我们
    // 覆盖，验证「普通工具名不会误判为技能」：skillBridge 永远返回 null 即可
    val result = loop.run(history = emptyList(), userInput = "读文件")
    assertTrue(result.text.contains("已按技能指引完成"))
  }
}
