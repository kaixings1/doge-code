package com.dogecode.mobile

/**
 * Provider 连接配置（本地模式的核心）。
 *
 * ## 配置形态照搬服务端
 *
 * 与服务端 `src/services/api/openaiCompat.ts` 的配置保持一致：
 * `apiKey` + `baseURL` + 可选 `headers` + 超时。
 * 这样用户从远端切到本地时，已有的 API 配置心智可以直接迁移，
 * 不必学第二套概念。
 *
 * ## 为什么 baseURL 必填而不仅是「预设几个 provider」
 *
 * 只给预设（OpenAI / DeepSeek / 通义…）会让**自建网关/中转/本地推理**
 * 的用户无法使用 —— 而这些恰恰是手机本地模式最常见的用法
 *（很多人用 one-api 之类的网关统一管理 key）。故预设只是**快捷填充**，
 * baseURL 始终可手改。
 */
data class ProviderConfig(
    /** API 密钥。空 = 未配置。 */
    val apiKey: String = "",

    /**
     * API 基地址（不含具体路径，如 `https://api.deepseek.com/v1`）。
     *
     * 必须是 http(s) 开头的完整 URL —— 校验在 [isUsable] 里做。
     */
    val baseURL: String = "",

    /** 模型名（如 `deepseek-chat`）。空 = 用 provider 的默认值。 */
    val model: String = "",

    /** 额外请求头（部分网关需要，如 `X-Api-Version`）。 */
    val headers: Map<String, String> = emptyMap(),

    /** 单次请求超时（毫秒）。手机网络波动大，默认比桌面端宽松。 */
    val timeoutMs: Int = DEFAULT_TIMEOUT_MS,

    /** 生成温度（0..2）。null = 用服务端默认，不发送该参数。 */
    val temperature: Double? = null,

    /** 单次回复最大 token。null = 不限制（由服务端决定）。 */
    val maxTokens: Int? = null,

    /**
     * 思考强度（reasoning/思考 token 预算）。
     *
     * 0 = 关闭思考（默认，兼容所有模型）；>0 = 开启思考并把预算设为该值。
     * 注入到请求体时按 provider 类型选择字段名（见 ProviderClient.buildBody）：
     * · OpenAI o 系列 / 兼容网关用 `reasoning_effort`（值为 "low"/"medium"/"high"
     *   或数字，取决于网关；此处用数字预算）
     * · DeepSeek 等用 `thinking: { type: "enabled" }`
     * 不支持该字段的模型会因多余参数报 400 —— 但本地模式用户自选模型，
     * 应在 ProviderConfig 里显式设值，误设导致的 400 是其可控后果。
     */
    val thinkingBudget: Int = 0,
) {
    /**
     * 是否可用于发起请求。
     *
     * 判据刻意**只有「有 key + 有合法 URL」**，不含 model：
     * 多数 provider 在 model 留空时有合理默认，而缺 key 或 URL
     * 一定失败。把 model 也算进来会让「填了 key 和地址但还没选模型」
     * 的用户看到「未配置」，误以为前两项没生效。
     */
    val isUsable: Boolean
        get() = apiKey.isNotBlank() && isUrlLike(baseURL)

    /**
     * 规范化后的 baseURL（去掉末尾斜杠）。
     *
     * 拼接路径时必须先去掉尾斜杠，否则会出现 `.../v1//chat/completions`
     * 这种双斜杠 —— 部分网关会 404，且错误信息完全不提示是这里的问题。
     */
    val normalizedBaseURL: String
        get() = baseURL.trim().trimEnd('/')

    companion object {
        /**
         * 默认超时 60 秒。
         *
         * 比桌面端宽松：手机常在弱网/移动数据下使用，且首字延迟
         * （尤其是长系统提示词）本身就慢。设太短会让用户以为「连不上」，
         * 而实际只是慢。
         */
        const val DEFAULT_TIMEOUT_MS = 60_000

        /** 允许的超时范围（防止用户填 0 或极大值）。 */
        const val MIN_TIMEOUT_MS = 5_000
        const val MAX_TIMEOUT_MS = 600_000

        /**
         * 判断字符串是否像一个可用的 URL。
         *
         * 只做**形状校验**（协议 + 有主机名），不做严格 URL 解析：
         * 严格解析会拒掉一些网关的特殊写法，也不是本层的职责 ——
         * 真正的失败会在请求时以明确错误返回。
         */
        fun isUrlLike(raw: String): Boolean {
            val s = raw.trim()
            if (s.isEmpty()) return false
            val lower = s.lowercase()
            if (!lower.startsWith("http://") && !lower.startsWith("https://")) return false
            // 协议后必须还有内容（主机名），否则是 "https://" 这种半截输入
            val afterScheme =
                lower.removePrefix("https://").removePrefix("http://")
            return afterPrefixIsHost(afterScheme)
        }

        private fun afterPrefixIsHost(s: String): Boolean =
            s.isNotEmpty() && !s.startsWith('/')

        /** 把超时夹到合法区间。 */
        fun clampTimeout(ms: Int): Int = ms.coerceIn(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
    }
}

/**
 * 内置 provider 预设（仅用于**快捷填充**，用户可改任意字段）。
 *
 * 选这些的判据：国内用户**实际能直连且常用**的。不含需要额外
 * SDK 的（如 Bedrock/Vertex，它们用 IAM 而非 API key，
 * 与「填个 key 就能用」的本地模式定位不符）。
 */
object ProviderPresets {

    data class Preset(
        val id: String,
        val label: String,
        val baseURL: String,
        /** 推荐的默认模型（可改）。 */
        val defaultModel: String,
        /** 说明「去哪拿 key」，手机上无处查文档时尤其重要。 */
        val hint: String,
    )

    val ALL: List<Preset> = listOf(
        Preset(
            id = "openai",
            label = "OpenAI / 兼容",
            baseURL = "https://api.openai.com/v1",
            defaultModel = "gpt-4o",
            hint = "多数中转/自建网关也选这项，把地址改成自己的即可。",
        ),
        Preset(
            id = "deepseek",
            label = "DeepSeek",
            baseURL = "https://api.deepseek.com/v1",
            defaultModel = "deepseek-chat",
            hint = "key 在 platform.deepseek.com 获取。",
        ),
        Preset(
            id = "dashscope",
            label = "通义千问",
            baseURL = "https://dashscope.aliyuncs.com/compatible-mode/v1",
            defaultModel = "qwen-plus",
            hint = "key 在阿里云百炼控制台获取。",
        ),
        Preset(
            id = "moonshot",
            label = "Kimi",
            baseURL = "https://api.moonshot.cn/v1",
            defaultModel = "moonshot-v1-32k",
            hint = "key 在 platform.moonshot.cn 获取。",
        ),
        Preset(
            id = "custom",
            label = "自定义",
            baseURL = "",
            defaultModel = "",
            hint = "填任意 OpenAI 兼容端点（本地推理服务也选这项）。",
        ),
    )

    fun byId(id: String): Preset? = ALL.firstOrNull { it.id == id }

    /** 默认预设（首个 - 最常见）。 */
    val DEFAULT: Preset get() = ALL.first()
}
