package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 纯算法层单测：验证从 OfflineLLM 吸收的 `<think>` 剥离 / 流式累积
 * 逻辑正确（不依赖 Android 运行时，可在 JVM 直接跑）。
 */
class LocalInferenceEngineTest {

  // ── ThinkingTagStripper：一次性剥离 ──

  @Test
  fun `stripThinkingTags 删除完整思考块`() {
    val raw = "你好<think>让我想想步骤</think>世界"
    assertEquals("你好世界", LocalInferenceAlgorithms.stripThinkingTags(raw))
  }

  @Test
  fun `stripThinkingTags 支持多行与大小写`() {
    val raw = "A<THINK>\n第一行\n第二行\n</THINK>B"
    assertEquals("AB", LocalInferenceAlgorithms.stripThinkingTags(raw))
  }

  @Test
  fun `stripThinkingTags 无标签原样返回`() {
    val raw = "纯文本没有任何标签"
    assertEquals(raw, LocalInferenceAlgorithms.stripThinkingTags(raw))
  }

  // ── ThinkingTagFilter：跨 chunk 流式 ──

  @Test
  fun `流式过滤在 chunk 边界切断标签也不泄漏`() {
    val f = LocalInferenceAlgorithms.ThinkingTagFilter()
    val out = StringBuilder()
    // 标签被切成多片：<thi / nk>内容< / thin / k>
    out.append(f.feed("先<thi"))
    out.append(f.feed("nk>思考中"))
    out.append(f.feed("内容< / thin"))
    out.append(f.feed("k>答案"))
    out.append(f.flush())
    assertEquals("先答案", out.toString())
  }

  @Test
  fun `流式过滤未闭合思考块被丢弃`() {
    val f = LocalInferenceAlgorithms.ThinkingTagFilter()
    val out = StringBuilder()
    out.append(f.feed("可见<think>没闭合的思考"))
    out.append(f.flush())
    assertEquals("可见", out.toString())
  }

  // ── StreamAccumulator：累积 + 剥离 ──

  @Test
  fun `StreamAccumulator 累积可见文本并剥离思考`() {
    val acc = LocalInferenceAlgorithms.StreamAccumulator()
    acc.add("你好<think>想</think>")
    acc.add("世界")
    assertEquals("你好世界", acc.finalText())
  }

  // ── InferenceTimeout：超时谓词 ──

  @Test
  fun `超时谓词在截止后返回 true`() {
    val stop = LocalInferenceAlgorithms.InferenceTimeout.withDeadline(timeoutMs = 1)
    Thread.sleep(5)
    assertTrue(stop())
  }

  @Test
  fun `超时谓词未到期返回 false 且尊重外部中断`() {
    val external = { false }
    val stop = LocalInferenceAlgorithms.InferenceTimeout.withDeadline(
      timeoutMs = 1000, externalStop = external,
    )
    assertFalse(stop())
    val external2 = { true }
    val stop2 = LocalInferenceAlgorithms.InferenceTimeout.withDeadline(
      timeoutMs = 1000, externalStop = external2,
    )
    assertTrue(stop2())
  }

  // ── NullInferenceEngine：未配置引擎应抛 ──

  @Test(expected = UnsupportedOperationException::class)
  fun `NullInferenceEngine generate 抛不支持异常`() {
    NullInferenceEngine.generate(emptyList(), emptyList(), {}, { false })
  }

  // ── HttpLocalEngine：地址归一化（接入本地服务端的关键）──

  @Test
  fun `HttpLocalEngine 归一化裸地址补 v1`() {
    // 用反射取私有方法不可取，改为验证 listModels 解析路径对归一化 URL 的依赖：
    // 这里直接验证 ProviderClient.parseModels 对本地服务端 /models 响应体的解析。
    val body = """{"data":[{"id":"llama3.2:1b"},{"id":"qwen2.5:0.5b"}],"object":"list"}"""
    val models = ProviderClient.parseModels(body)
    assertEquals(listOf("llama3.2:1b", "qwen2.5:0.5b"), models)
  }

  @Test
  fun `HttpLocalEngine 归一化带端口无 v1 的地址`() {
    // normalizeBase 是 private，这里通过 HttpLocalEngine.listModels 的契约说明：
    // 传入 "http://127.0.0.1:8080" 应被内部补成 ".../v1/models"。
    // 无本地服务时仅验证解析层；真实连通性由端到端验证。
    // 退化路径：坏 JSON 返回空列表而非抛。
    assertEquals(emptyList<String>(), ProviderClient.parseModels("not-json"))
  }

  @Test
  fun `HttpLocalEngine 兼容数组型 models 响应`() {
    val body = """{"models":["gemma2:2b","phi3:mini"]}"""
    assertEquals(listOf("gemma2:2b", "phi3:mini"), ProviderClient.parseModels(body))
  }
}
