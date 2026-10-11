package com.dogecode.mobile

import org.json.JSONArray
import org.json.JSONObject

/**
 * 技能 / 插件系统（纯逻辑层，不依赖 Android Context）。
 *
 * ## 技能是什么
 *
 * 技能本质上是一段「专家提示词 / 多步工作流」，由**预置 JSON**（来自
 * `res/raw`）或**用户自定义**（持久化到 SharedPreferences）提供。它不像
 * [LocalTools] 里的文件工具那样去读写磁盘，而是把 `prompt` 字段**注入到
 * 下一轮对话上下文**，让模型「按这套方法论」继续工作。
 *
 * ## 为什么复用 Tool 机制而不是另起一套
 *
 * AgentLoop 已经有一套成熟的「模型请求 tool → 执行 → 回填结果 → 再调」
 * 循环。把技能伪装成一个 `use_skill_<id>` 命名的 [ToolSpec]：
 * · 模型用与原生工具**完全相同**的 function-calling 方式「调用」技能；
 * · 后端识别到技能调用后，返回该技能的 `prompt` 作为 tool 结果；
 * · AgentLoop 自动把它回填进历史，模型下一轮即看到注入的指令。
 *
 * 这样**零侵入 AgentLoop 主流程**（只多传一份 extraSpecs），且 UI 的工具
 * 气泡、配对、流式等全部免费复用。
 *
 * ## 为什么核心逻辑抽成纯函数
 *
 * 解析 / 注册 / 匹配都是无副作用的纯逻辑，单独抽出来便于 JVM 单测
 * （不跑 Android 运行时）。Android 侧只有「读文件 / 读写 SharedPreferences」
 * 这一层（见 [SkillStore]）。
 */
object SkillConst {

  /**
   * 技能调用名前缀。
   *
   * OpenAI 工具名约束 `^[a-zA-Z0-9_-]{1,64}$`，故用 `use_skill_` + `id`
   *（id 本身也应仅含字母数字下划线，见 [SkillParser] 校验）。
   */
  const val TOOL_PREFIX = "use_skill_"
}

/**
 * 单个技能定义。
 *
 * @param id 稳定标识（同时是工具名后缀）。仅 `[a-zA-Z0-9_]`。
 * @param name 展示名（中文，给用户与模型看）。
 * @param description 模型决定是否调用该技能时的依据（写在 tool 的 description 里）。
 * @param prompt 注入给模型的专家指令 / 工作流本体。
 * @param triggers 触发词提示（暂供未来「自动推荐」用，当前不参与分发）。
 */
data class Skill(
  val id: String,
  val name: String,
  val description: String,
  val prompt: String,
  val triggers: List<String> = emptyList(),
)

/**
 * 技能注册表（纯逻辑，JVM 可单测）。
 *
 * 负责：注册 / 列举 / 按 id 取 / 加载预置 / 转成 ToolSpec / 把调用名解析回
 * Skill / 拼装注入文本。任何涉及「磁盘 / SharedPreferences」的动作都在
 * [SkillStore]，本类只认内存里的 [Skill] 集合。
 */
class SkillRegistry {

  /** 已注册技能（id -> Skill）；按注册顺序保留以便列表稳定展示。 */
  private val byId = LinkedHashMap<String, Skill>()

  /** 注册 / 覆盖一个技能。 */
  fun register(skill: Skill) {
    byId[skill.id] = skill
  }

  /** 批量加载预置技能（不清除用户已注册的自定义技能）。 */
  fun loadDefaults(items: List<Skill>) {
    items.forEach { byId[it.id] = it }
  }

  /** 是否存在某技能。 */
  fun contains(id: String): Boolean = byId.containsKey(id)

  /** 按 id 取技能。 */
  fun get(id: String): Skill? = byId[id]

  /** 全部技能（按注册顺序）。 */
  fun list(): List<Skill> = byId.values.toList()

  /** 移除一个技能（自定义技能关闭时调用）。 */
  fun remove(id: String) {
    byId.remove(id)
  }

  /**
   * 按「已启用 id 集合」裁剪。
   *
   * 规则（与 [SkillStore.applyTo] 约定一致）：
   * · [enabled] 为空 → 不裁剪（默认全部启用，开箱即用）；
   * · 非空 → 仅保留 id 落在 [enabled] 中的技能。
   *
   * 纯逻辑、无 Context，便于 JVM 单测覆盖「开关过滤」这条关键路径。
   */
  fun applyEnabledFilter(enabled: Set<String>) {
    if (enabled.isEmpty()) return
    byId.keys.retainAll(enabled)
  }

  /**
   * 把已启用技能转成模型可见的 [ToolSpec]。
   *
   * 每个技能对应一个 `use_skill_<id>` 工具；调用后该技能的 `prompt`
   * 会被注入上下文（桥接逻辑见 [resolveCall] / [buildInjection]）。
   */
  fun toToolSpecs(): List<ToolSpec> = byId.values.map { s ->
    ToolSpec(
      name = SkillConst.TOOL_PREFIX + s.id,
      description = "启用技能「${s.name}」：${s.description} " +
        "调用后该技能的专家工作流会被注入上下文，作为后续工作的指引。",
      parameters = JSONObject().apply {
        put("type", "object")
        put(
          "properties",
          JSONObject().apply {
            put(
              "args",
              JSONObject().apply {
                put("type", "string")
                put("description", "对本技能任务的补充说明（可选，可留空）")
              },
            )
          },
        )
        put("required", JSONArray(emptyList<String>()))
      },
    )
  }

  /**
   * 把模型生成的工具名解析回 [Skill]。
   *
   * 仅当以 [SkillConst.TOOL_PREFIX] 开头且后缀是已知 id 时命中；否则返回 null
   *（调用方据 null 走 [LocalTools.execute] 的普通工具路径）。
   */
  fun resolveCall(toolName: String): Skill? {
    if (!toolName.startsWith(SkillConst.TOOL_PREFIX)) return null
    val id = toolName.removePrefix(SkillConst.TOOL_PREFIX)
    return byId[id]
  }

  /**
   * 拼装注入给模型的技能正文。
   *
   * @param skill 已命中的技能
   * @param userArgs 模型调用时传的 `args`（可空 / 空）
   * @return 下一轮回填给模型的工具结果文本（= 技能 prompt + 用户补充）
   */
  fun buildInjection(skill: Skill, userArgs: String?): String = buildString {
    append("【已启用技能：${skill.name}】\n")
    append(skill.prompt)
    if (!userArgs.isNullOrBlank()) {
      append("\n\n用户补充要求：$userArgs")
    }
  }
}

/**
 * 技能 JSON 解析（internal：仅供本模块与单测使用，避免成为公开 API 噪音）。
 *
 * 单技能格式：
 * ```json
 * {
 *   "id": "systematic_debugging",
 *   "name": "系统性调试",
 *   "description": "…",
 *   "prompt": "…",
 *   "triggers": ["debug", "调试"]
 * }
 * ```
 *
 * manifest 格式：
 * ```json
 * { "skills": [ {…}, {…} ] }
 * ```
 * 也兼容「直接是数组」的写法。
 */
internal object SkillParser {

  /** 合法 id：仅字母数字下划线（保证能拼成合法工具名）。 */
  private val ID_RE = Regex("^[A-Za-z0-9_]{1,40}$")

  /**
   * 解析单个技能 JSON（字符串）。
   *
   * @return 解析成功且 id 合法返回 [Skill]；否则 null（调用方跳过坏数据，
   *   不让一条坏技能拖垮整批加载）。
   */
  fun parse(json: String): Skill? = runCatching { parse(JSONObject(json)) }.getOrNull()

  /** 解析单个技能 JSON 对象。 */
  fun parse(o: JSONObject): Skill? {
    val id = o.optString("id").trim()
    val name = o.optString("name").trim()
    val description = o.optString("description").trim()
    val prompt = o.optString("prompt").trim()
    if (id.isEmpty() || name.isEmpty() || prompt.isEmpty()) return null
    if (!ID_RE.matches(id)) return null
    val triggers = o.optJSONArray("triggers")
      ?.let { arr ->
        (0 until arr.length()).mapNotNull { arr.optString(it).takeIf { s -> s.isNotBlank() } }
      }
      .orEmpty()
    return Skill(id = id, name = name, description = description, prompt = prompt, triggers = triggers)
  }

  /** 解析 manifest（可能是 `{ "skills": [...] }` 或直接是数组）。跳过坏条目。 */
  fun parseManifest(json: String): List<Skill> {
    if (json.isBlank()) return emptyList()
    val root = runCatching { JSONObject(json) }.getOrNull() ?: return emptyList()
    val arr = if (root.has("skills")) root.optJSONArray("skills") else null
    if (arr != null) return collect(arr)
    // 容错：根本身就是数组
    return runCatching { root.getJSONArray("skills") }.getOrNull()?.let { collect(it) }
      ?: emptyList()
  }

  /** 把技能列表序列化成 manifest JSON（用于自定义技能持久化）。 */
  fun serializeManifest(list: List<Skill>): String = JSONObject().apply {
    put(
      "skills",
      JSONArray().apply {
        list.forEach { s ->
          put(
            JSONObject().apply {
              put("id", s.id)
              put("name", s.name)
              put("description", s.description)
              put("prompt", s.prompt)
              if (s.triggers.isNotEmpty()) {
                put("triggers", JSONArray(s.triggers))
              }
            },
          )
        }
      },
    )
  }.toString()

  private fun collect(arr: JSONArray): List<Skill> {
    val out = mutableListOf<Skill>()
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      parse(o)?.let { out.add(it) }
    }
    return out
  }
}
