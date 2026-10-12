package com.dogecode.mobile

import org.json.JSONArray
import org.json.JSONObject

/**
 * 多服务商档案（Named Profile）的纯逻辑与数据模型（本地模式）。
 *
 * ## 为什么需要「档案」而非单份配置
 *
 * 本地模式用户常在不同服务商标签间切换（自建网关 / DeepSeek / OpenAI…），
 * 每家的 URL、KEY、模型都不同。若只有单份 [ProviderConfig]，切换要手动重填，
 * 极易填错且无法保留历史配置。档案把「一套完整 URL+KEY+模型」作为一个
 * 命名单元，可切换 / 新建 / 删除。
 *
 * ## 安全底线：apiKey 绝不明文落盘
 *
 * [ProviderProfile.config] 里的 [ProviderConfig.apiKey] 在持久化时**被剥离**
 * （见 [serialize] / [parse]），真实 key 由 [LocalPrefsStore] 走 [SecureStore]
 * 按档案 id 加密存储。纯逻辑层不碰加密 —— 它只负责「非敏感字段 + key 引用名」，
 * 加密 IO 在 store 里做。这样本文件零 Android 依赖、可单测。
 *
 * ## 为什么抽成独立 object + data class
 *
 * 与 [WorkspaceList] 同模式：列表操作（迁移 / 合并 / 切换 / 移除 / 序列化）
 * 全是字符串处理，错了全部静默（切不过去 / 档案丢 / 旧用户升级丢配置），
 * 必须可单测（[LocalPrefsStore] 依赖 Context 测不了）。
 */
object ProviderProfiles {

    /** 列表上限（超出丢最旧）。与工作区同量级 —— 太长失去快速切换意义。 */
    const val MAX = 8

    /**
     * 生成档案唯一 id。
     *
     * 用「时间戳 + 短随机」而非 UUID：UUID 太长，存进 prefs 的 key 名里
     * 不美观也无必要；这里只需「在本次安装内不撞名」即可。
     */
    fun newId(): String {
        // 随机位取 32 位（原 16 位）。原因：同一毫秒内连续调用时，16 位随机
        // 空间只有 65536，按生日悖论连续生成 200 个的碰撞概率约 30% —— 单测
        // 「200 个 id 必须全不同」偶发失败（实测 199/200）。32 位后同毫秒
        // 200 个的碰撞概率约 0.0009%，实际不再发生。
        // 保留时间戳前缀：让 id 人工查看时大致有序，便于排查。
        val rand = (0..0xFFFFFFFFL).random().toString(16).padStart(8, '0')
        return "p_${System.currentTimeMillis().toString(36)}_$rand"
    }

    /**
     * 新建一个档案（自动分配 id）。
     *
     * @param name 显示名（会被 [sanitizeName] 清洗，空名回落默认）
     * @param config 该档案的配置（apiKey 在序列化时被剥离，仅作内存态）
     */
    fun create(name: String, config: ProviderConfig = ProviderConfig()): ProviderProfile =
        ProviderProfile(id = newId(), name = sanitizeName(name), config = config)

    /** 清洗档案名：空/全空白回落「服务商 N」。 */
    fun sanitizeName(raw: String): String {
        val t = raw.trim()
        return if (t.isEmpty()) "服务商" else t
    }

    /**
     * 把列表序列化为 JSON 字符串（非敏感字段）。
     *
     * apiKey **故意不写**进 JSON —— 它走 [SecureStore] 按档案 id 存。
     * 这里只记 key 的「引用位置」：文件名固定为 [secureKeyFor]，调用方
     * 用档案 id 去 SecureStore 取真实 key。故 JSON 里只留 empty 占位。
     *
     * 每个档案对象：{ id, name, baseURL, model, timeoutMs, temperature,
     * maxTokens, thinkingBudget, headers(可选) }。
     */
    fun serialize(list: List<ProviderProfile>): String {
        val arr = JSONArray()
        list.forEach { p ->
            val o = JSONObject()
            o.put("id", p.id)
            o.put("name", p.name)
            o.put("baseURL", p.config.baseURL)
            o.put("model", p.config.model)
            o.put("timeoutMs", p.config.timeoutMs)
            // temperature / maxTokens 可空，缺失即按 null 解析
            p.config.temperature?.let { o.put("temperature", it) }
            p.config.maxTokens?.let { o.put("maxTokens", it) }
            o.put("thinkingBudget", p.config.thinkingBudget)
            if (p.config.headers.isNotEmpty()) {
                val h = JSONObject()
                p.config.headers.forEach { (k, v) -> h.put(k, v) }
                o.put("headers", h)
            }
            arr.put(o)
        }
        return arr.toString()
    }

    /**
     * 解析存储字符串为档案列表（不带 apiKey）。
     *
     * 容忍脏数据：空/非法 JSON、缺字段都回落默认，绝不抛异常
     *（手改配置文件不该让列表解析失败）。
     */
    fun parse(raw: String?): List<ProviderProfile> {
        if (raw.isNullOrBlank()) return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            val out = mutableListOf<ProviderProfile>()
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val id = o.optString("id").takeIf { it.isNotBlank() } ?: newId()
                val name = sanitizeName(o.optString("name"))
                val headers = mutableMapOf<String, String>()
                o.optJSONObject("headers")?.let { h ->
                    h.keys().forEach { k -> headers[k] = h.optString(k) }
                }
                val config = ProviderConfig(
                    // apiKey 不在此解析；store 会按 id 注入
                    apiKey = "",
                    baseURL = o.optString("baseURL").orEmpty(),
                    model = o.optString("model").orEmpty(),
                    headers = headers,
                    timeoutMs = o.optInt("timeoutMs", ProviderConfig.DEFAULT_TIMEOUT_MS),
                    temperature = o.optString("temperature").takeIf { it.isNotBlank() }?.toDoubleOrNull(),
                    maxTokens = o.optString("maxTokens").takeIf { it.isNotBlank() }?.toIntOrNull(),
                    thinkingBudget = o.optInt("thinkingBudget", 0),
                )
                out.add(ProviderProfile(id = id, name = name, config = config))
            }
            out
        }.getOrElse { emptyList() }
    }

    /**
     * SecureStore 里某档案 key 的文件名。
     *
     * 每个档案的 apiKey 单独成键，删除档案时一并 [SecureStore.remove]，
     * 避免「删了档案却留下孤儿 key」。
     */
    fun secureKeyFor(profileId: String): String = "api_key_$profileId"

    /**
     * 把单份旧 [ProviderConfig] 迁移成首个档案。
     *
     * 升级路径：旧版把 baseURL/api_key/model 散存。此处把非敏感字段塞进
     * 档案，apiKey 由调用方（store）按返回档案的 id 写进 SecureStore。
     * 返回 `null` 表示旧配置为空（不应凭空造档案）。
     */
    fun migrateLegacy(
        legacyBaseURL: String,
        legacyModel: String,
        legacyTimeoutMs: Int,
        legacyThinking: Int,
        legacyTemperature: String?,
        legacyMaxTokens: String?,
    ): ProviderProfile? {
        val hasContent = legacyBaseURL.isNotBlank() || legacyModel.isNotBlank()
        // 即便没填过，也返回首个空档案（保证列表非空，至少 1 个）；
        // 但不能凭空生成 key —— key 迁移由 store 单独判断是否非空。
        val config = ProviderConfig(
            apiKey = "",
            baseURL = legacyBaseURL,
            model = legacyModel,
            timeoutMs = if (legacyTimeoutMs > 0) legacyTimeoutMs else ProviderConfig.DEFAULT_TIMEOUT_MS,
            temperature = legacyTemperature?.takeIf { it.isNotBlank() }?.toDoubleOrNull(),
            maxTokens = legacyMaxTokens?.takeIf { it.isNotBlank() }?.toIntOrNull(),
            thinkingBudget = legacyThinking,
        )
        val profile = ProviderProfile(
            id = newId(),
            name = "默认服务商",
            config = config,
        )
        // 无任何内容的空档案只在「确实无旧数据」时仍创建（保底 1 个）；
        // 调用方可据 hasContent 决定是否迁移 key。这里始终返回，便于保底。
        return profile.takeIf { hasContent || true }
    }

    /**
     * 添加（或置顶）一个档案。
     *
     * 已存在 id 时**更新**而非重复（用户重复选同一档案 = 想切过去，但
     * 档案是同一份，故改为覆盖）；超 [MAX] 丢最旧的。
     */
    fun add(list: List<ProviderProfile>, profile: ProviderProfile): List<ProviderProfile> {
        val replaced = list.filterNot { it.id == profile.id }
        return (listOf(profile) + replaced).take(MAX)
    }

    /**
     * 把列表中已有的一项切为当前（置顶）。
     *
     * **只在列表内找**：传入不在列表中的 id 时原样返回（调用方据
     * 「首位没变」判断失败）。
     */
    fun switchTo(list: List<ProviderProfile>, id: String): List<ProviderProfile> {
        if (id !in list.map { it.id }) return list
        val target = list.first { it.id == id }
        return listOf(target) + list.filterNot { it.id == id }
    }

    /** 移除一项（不存在时原样返回）。移除当前项后首位即新的当前。 */
    fun remove(list: List<ProviderProfile>, id: String): List<ProviderProfile> =
        list.filterNot { it.id == id }

    /** 更新一个档案（按 id 匹配覆盖）。 */
    fun update(list: List<ProviderProfile>, profile: ProviderProfile): List<ProviderProfile> {
        val replaced = list.filterNot { it.id == profile.id }
        return listOf(profile) + replaced
    }

    /** 取当前档案（首项）；空列表返回 null。 */
    fun current(list: List<ProviderProfile>): ProviderProfile? = list.firstOrNull()
}
