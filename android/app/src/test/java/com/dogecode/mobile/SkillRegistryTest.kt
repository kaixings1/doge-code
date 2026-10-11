package com.dogecode.mobile

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 技能纯逻辑测试（无 Android 依赖，JVM 直跑）。
 *
 * 覆盖 [SkillParser] 的容错解析与 [SkillRegistry] 的注册 / 转换 / 桥接，
 * 这些是「坏技能拖垮整批」「工具名非法」「调用名解析」等关键路径。
 */
class SkillRegistryTest {

  @Test
  fun parseValidSkill() {
    val json = JSONObject().apply {
      put("id", "tdd")
      put("name", "测试驱动开发")
      put("description", "先写测试")
      put("prompt", "红-绿-重构")
      put("triggers", org.json.JSONArray(listOf("test", "测试")))
    }.toString()
    val s = SkillParser.parse(json)
    assertEquals("tdd", s?.id)
    assertEquals("测试驱动开发", s?.name)
    assertEquals(listOf("test", "测试"), s?.triggers)
  }

  @Test
  fun parseRejectsBadId() {
    // id 含连字符 → 不匹配合法模式 → 返回 null（防止拼出非法工具名）
    val json = JSONObject().apply {
      put("id", "bad-id")
      put("name", "x")
      put("description", "d")
      put("prompt", "p")
    }.toString()
    assertNull(SkillParser.parse(json))
  }

  @Test
  fun parseRejectsMissingPrompt() {
    val json = JSONObject().apply {
      put("id", "x1")
      put("name", "x")
      put("description", "d")
      // 缺 prompt
    }.toString()
    assertNull(SkillParser.parse(json))
  }

  @Test
  fun parseManifestSkipsBadEntries() {
    val manifest = """
      {"skills":[
        {"id":"good","name":"好","description":"d","prompt":"p"},
        {"id":"bad id","name":"坏","description":"d","prompt":"p"},
        {"id":"also","name":"也","description":"d","prompt":"p"}
      ]}
    """.trimIndent()
    val list = SkillParser.parseManifest(manifest)
    assertEquals(2, list.size)
    assertEquals("good", list[0].id)
    assertEquals("also", list[1].id)
  }

  @Test
  fun registryToToolSpecUsesPrefix() {
    val reg = SkillRegistry()
    reg.register(Skill("dbg", "调试", "描述", "prompt 内容"))
    val specs = reg.toToolSpecs()
    assertEquals(1, specs.size)
    assertEquals("use_skill_dbg", specs[0].name)
    assertTrue(specs[0].description.contains("调试"))
  }

  @Test
  fun resolveCallRoundTrips() {
    val reg = SkillRegistry()
    reg.register(Skill("plan", "写计划", "d", "p"))
    assertEquals("plan", reg.resolveCall("use_skill_plan")?.id)
    // 普通工具名不命中
    assertNull(reg.resolveCall("read_file"))
    // 未知技能 id 不命中
    assertNull(reg.resolveCall("use_skill_nope"))
  }

  @Test
  fun buildInjectionIncludesPromptAndArgs() {
    val reg = SkillRegistry()
    reg.register(Skill("dbg", "调试", "d", "系统性排查步骤"))
    val text = reg.buildInjection(reg.get("dbg")!!, "崩溃在启动期")
    assertTrue(text.contains("调试"))
    assertTrue(text.contains("系统性排查步骤"))
    assertTrue(text.contains("崩溃在启动期"))
  }

  @Test
  fun serializeThenParseRoundTrips() {
    val original = listOf(
      Skill("a", "甲", "da", "pa", listOf("t1")),
      Skill("b", "乙", "db", "pb"),
    )
    val back = SkillParser.parseManifest(SkillParser.serializeManifest(original))
    assertEquals(original, back)
  }

  @Test
  fun laterRegistrationOverridesSameId() {
    // 自定义技能覆盖同名预置（SkillStore.applyTo 依赖此语义）
    val reg = SkillRegistry()
    reg.register(Skill("dbg", "预置调试", "d1", "preset prompt"))
    reg.register(Skill("dbg", "自定义调试", "d2", "custom prompt"))
    assertEquals(1, reg.list().size)
    assertEquals("custom prompt", reg.get("dbg")?.prompt)
  }

  @Test
  fun enabledFilterKeepsOnlyEnabled() {
    val reg = SkillRegistry()
    reg.register(Skill("a", "甲", "d", "p"))
    reg.register(Skill("b", "乙", "d", "p"))
    reg.register(Skill("c", "丙", "d", "p"))
    // 空集合 = 不裁剪（默认全部启用，开箱即用）
    reg.applyEnabledFilter(emptySet())
    assertEquals(3, reg.list().size)
    // 指定部分 id → 仅保留这些
    reg.applyEnabledFilter(setOf("b", "c"))
    assertEquals(listOf("b", "c"), reg.list().map { it.id })
  }
}
