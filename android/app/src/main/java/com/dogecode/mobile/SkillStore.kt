package com.dogecode.mobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * 技能的 Android 持久化 / 加载层。
 *
 * ## 职责边界（与纯逻辑层 [SkillRegistry] / [SkillParser] 的关系）
 *
 * · [SkillRegistry] 只管内存里的 [Skill] 集合与「id ↔ ToolSpec ↔ 注入文本」
 *   的转换 —— **不碰任何 Android 对象**，因此可被 JVM 单测直接驱动。
 * · 本类负责**唯一的 Android 依赖**：读 `res/raw` 预置技能、读写
 *   SharedPreferences 里的用户自定义技能、以及把「已启用」状态落盘。
 *
 * 这样分层后，纯逻辑回归测试无需 Context，本类只做 IO 包装。
 *
 * ## 预置来自 res/raw 而非 assets
 *
 * 预置技能是编译期确定、随包发布、只读的，放 `res/raw` 最合适：R 自动生成
 * id、自带类型安全、无路径字符串。自定义技能才需要自由读写，走
 * SharedPreferences 的文本字段（manifest JSON）。
 *
 * ## 为什么不引入新依赖
 *
 * 解析用项目已有的 `org.json`（与 [LocalTools] / [LocalPrefsStore] 同源），
 * 持久化用普通 SharedPreferences（非敏感，无需加密）。
 */
class SkillStore(context: Context) {

  private val ctx = context.applicationContext
  private val plain = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** 预置技能 manifest 的资源 id（res/raw/skills_manifest.json）。 */
  private val presetResId: Int by lazy {
    ctx.resources.getIdentifier("skills_manifest", "raw", ctx.packageName)
  }

  /**
   * 读取并解析预置技能（来自 res/raw）。
   *
   * 任何解析失败都**回落到空列表**而非抛异常 —— 预置资源坏掉不该让 App
   * 启动失败；最坏情况是「技能入口为空」，可后续修复。
   */
  fun loadPreset(): List<Skill> {
    val id = presetResId
    if (id == 0) return emptyList()
    return runCatching {
      ctx.resources.openRawResource(id).bufferedReader().use { SkillParser.parseManifest(it.readText()) }
    }.getOrDefault(emptyList())
  }

  /**
   * 读取用户自定义技能（manifest JSON 文本）。
   *
   * 自定义技能默认**启用**（这里只返回定义；启用与否由 [enabledIds] 控制）。
   */
  fun loadCustom(): List<Skill> {
    val raw = plain.getString(KEY_CUSTOM, null) ?: return emptyList()
    return SkillParser.parseManifest(raw)
  }

  /** 保存用户自定义技能集合（整体覆盖）。 */
  fun saveCustom(list: List<Skill>) {
    plain.edit().putString(KEY_CUSTOM, SkillParser.serializeManifest(list)).apply()
  }

  /** 已启用技能的 id 集合（预置 + 自定义都受此开关约束）。 */
  fun enabledIds(): Set<String> {
    val raw = plain.getString(KEY_ENABLED, null) ?: return emptySet()
    return runCatching {
      JSONObject(raw).optJSONArray("ids")
        ?.let { arr -> (0 until arr.length()).mapNotNull { arr.optString(it).takeIf { s -> s.isNotBlank() } } }
        .orEmpty()
        .toSet()
    }.getOrDefault(emptySet())
  }

  /** 保存已启用技能 id 集合。 */
  fun saveEnabledIds(ids: Set<String>) {
    plain.edit().putString(
      KEY_ENABLED,
      JSONObject().apply { put("ids", org.json.JSONArray(ids.toList())) }.toString(),
    ).apply()
  }

  /**
   * 组装「当前应注册的全部技能」到 [SkillRegistry]。
   *
   * 规则：
   * · 预置 + 自定义都先注册（自定义可覆盖同名预置——优先级更高）；
   * · 若 [enabledIds] 非空，则只保留其中的 id（用户显式管理过开关）；
   *   若为空（首次使用），则**全部启用**（开箱即用，不用先去设置页开开关）。
   */
  fun applyTo(registry: SkillRegistry) {
    val presets = loadPreset()
    val customs = loadCustom()
    registry.loadDefaults(presets)
    customs.forEach { registry.register(it) } // 自定义覆盖同名预置

    // 按已启用集合裁剪（空集合 = 全部启用，开箱即用）。
    // 逻辑集中在 [SkillRegistry.applyEnabledFilter]，避免重复实现。
    registry.applyEnabledFilter(enabledIds())
  }

  companion object {
    private const val PREFS = "doge_skills"
    private const val KEY_CUSTOM = "custom_skills"
    private const val KEY_ENABLED = "enabled_ids"
  }
}
