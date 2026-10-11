package com.dogecode.mobile

import android.content.Context

/**
 * 本地模式的持久化：工作区目录 + Provider 配置。
 *
 * ## API key 必须加密存储
 *
 * 用 [EncryptedSharedPreferences] 而非普通 SharedPreferences：
 * Android 上普通 prefs 是**明文 XML**，root 设备或备份提取即可读到。
 * API key 是**可计费的凭证**，泄露的后果是别人用你的额度。
 *
 * 加密初始化失败时**降级为不存储**而非回落明文：
 * 宁可让用户每次重填，也不能把 key 明文落盘。
 * （降级成「明文」是最糟的选择 —— 用户以为它是安全的。）
 *
 * ## 为什么工作区用字符串路径而非 SAF URI
 *
 * SAF（`content://`）能访问任意目录，但**只能用 DocumentFile API**
 * 读写，与 [LocalTools] 里的 `java.io.File` 是两套体系。
 * 改造整个工具层去适配 SAF 的收益，抵不上复杂度 —— 且 SAF 的
 * 性能在小文件频繁读写（agent 的典型行为）下明显更差。
 *
 * 故：工作区用**应用可访问的真实路径**（如 `/sdcard/Documents/proj`
 * 或应用私有目录）。这需要用户在设置里**手输或从推荐项选择**，
 * 而不是走 SAF 选择器。代价是可选范围受限（Android 11+ 对
 * `/sdcard` 根之外的访问有限制），收益是工具层保持简单可靠。
 */
class LocalPrefsStore(context: Context) {

    private val ctx = context.applicationContext

    /**
     * 敏感值存储（API key）。
     *
     * 用自实现的 [SecureStore]（AndroidKeyStore + AES/GCM）而非
     * `androidx.security:security-crypto` —— 后者已被 Google 弃用。
     * 见 SecureStore 的说明。
     */
    private val secure = SecureStore(ctx)

    /** 普通存储（工作区路径、模型名等非敏感项）。 */
    private val plain = ctx.getSharedPreferences(PLAIN_PREFS, Context.MODE_PRIVATE)

    /** 加密存储是否可用（设置页据此提示用户「key 不会被保存」）。 */
    val secureAvailable: Boolean get() = secure.isAvailable

    // ── 工作区（多工作区，M4）──

    /**
     * 已保存的工作区列表；首项为**当前**工作区。
     *
     * 纯逻辑（解析/合并/切换/移除/序列化）抽在 [WorkspaceList]，
     * 这里只做 IO。为什么：列表操作错了的表现是「切不过去/丢目录」，
     * 都是静默的 —— 必须可单测（无 Context）。
     */
    fun workspaceList(): List<String> {
        val raw = plain.getString(KEY_WORKSPACES, null)
        val list = WorkspaceList.parse(raw)
        if (list.isNotEmpty()) return list
        // 迁移旧单值：作为列表首项。读到旧键而新键为空 = 老用户升级，
        // 他原来选的目录必须原样出现在列表里，否则体感是「设置丢了」
        val legacy = plain.getString(KEY_WORKSPACE, null)?.takeIf { it.isNotBlank() }
        if (legacy != null) {
            saveWorkspaceList(listOf(legacy))
            plain.edit().remove(KEY_WORKSPACE).apply()
            return listOf(legacy)
        }
        return emptyList()
    }

    private fun saveWorkspaceList(list: List<String>) {
        plain.edit().putString(KEY_WORKSPACES, WorkspaceList.serialize(list)).apply()
    }

    /**
     * 当前工作区路径；未设置返回 null。
     *
     * 兼容旧调用方：等价于 `workspaceList().firstOrNull()`。
     */
    fun workspacePath(): String? = workspaceList().firstOrNull()

    /**
     * 添加一个工作区并置为当前。
     *
     * 已存在的路径**置顶**而非重复添加（用户重复选同一目录 = 想切过去）。
     *
     * @return 是否成功（目录不存在或不可写时拒绝）
     */
    fun addWorkspace(path: String): Boolean {
        val f = java.io.File(path)
        if (!f.exists() || !f.isDirectory) return false
        if (!f.canWrite()) return false
        saveWorkspaceList(WorkspaceList.add(workspaceList(), f.absolutePath))
        return true
    }

    /**
     * 切换当前工作区（必须在已保存列表中）。
     *
     * @return 是否成功（不在列表中返回 false —— 不允许切到一个未验证的目录）
     */
    fun switchWorkspace(path: String): Boolean {
        val list = workspaceList()
        if (path !in list) return false
        saveWorkspaceList(WorkspaceList.switchTo(list, path))
        return true
    }

    /**
     * 移除一个已保存的工作区。
     *
     * 移除的是**列表项**而非磁盘目录。移除当前项时自动切到列表中下一个；
     * 列表清空则回落到应用私有目录（[resolvedWorkspace] 的兜底）。
     */
    fun removeWorkspace(path: String) {
        saveWorkspaceList(WorkspaceList.remove(workspaceList(), path))
    }

    /**
     * 设置工作区（旧接口，等价于 [addWorkspace]）。
     *
     * 保留它是因为既有调用点（[LocalConfigPanel] 的「选择目录」）语义
     * 就是「选定并设为当前」。
     */
    fun setWorkspace(path: String): Boolean = addWorkspace(path)

    /**
     * 实际使用的工作区目录。
     *
     * 未设置或设置的目录已不可用（被删/权限变更）时，**回落到应用私有
     * 目录**而非报错：
     * · 让本地模式「开箱可用」（用户没配也能读改私有目录里的文件）
     * · 回落位置一定可写，不会出现「配置了却写不进去」
     *
     * 调用方（设置页）应提示用户当前用的是哪个目录，
     * 否则他会困惑「我明明设了别处」。
     */
    fun resolvedWorkspace(): java.io.File {
        val configured = workspacePath()?.let { java.io.File(it) }
        if (configured != null && configured.exists() && configured.isDirectory) {
            return configured
        }
        val fallback = java.io.File(ctx.filesDir, "workspace")
        if (!fallback.exists()) fallback.mkdirs()
        return fallback
    }

    /** 当前工作区是否是回落值（未配置用户指定目录）。 */
    fun isUsingFallbackWorkspace(): Boolean {
        val configured = workspacePath()?.let { java.io.File(it) }
        return configured == null || !configured.exists() || !configured.isDirectory
    }

    /**
     * 推荐的工作区候选（手机上确实可写的位置）。
     *
     * 为什么要推荐：用户不知道 Android 上「哪里可写」，
     * 让他自己拼路径必然失败（如 `/sdcard` 根在 Android 11+ 不可写）。
     */
    fun workspaceCandidates(): List<Pair<String, String>> {
        val out = mutableListOf<Pair<String, String>>()
        // 应用私有目录：一定可写，但用户用文件管理器看不到
        out.add(ctx.filesDir.absolutePath to "应用私有目录（最可靠，外部不可见）")
        // 公共文档目录：用户可访问，多数设备可写
        val ext = ctx.getExternalFilesDir(null)
        if (ext != null) {
            out.add(ext.absolutePath to "应用外部目录（可用文件管理器查看）")
        }
        // 公共 Documents：部分设备/版本可写
        val pub = java.io.File("/sdcard/Documents")
        if (pub.exists() && pub.canWrite()) {
            out.add(pub.absolutePath to "公共文档目录（Documents）")
        }
        return out
    }

    // ── Provider 配置（多档案，M5）──

    /**
     * 读取**当前** Provider 配置（即当前档案的配置，含 apiKey）。
     *
     * 向后兼容：旧调用方（[MainActivity] 的状态刷新、`/model` 命令）语义不变，
     * 只是底层改读「当前档案」而非单份旧键。
     *
     * 敏感项（key）与普通项分开存：key 走 [secure]（按档案 id），
     * 其余走 [plain]。这样即使加密不可用，也只是 key 丢失，
     * 用户重填一次即可，不必重配地址与模型。
     */
    fun providerConfig(): ProviderConfig {
        val list = profiles()
        val current = list.firstOrNull() ?: return ProviderConfig()
        return profileConfig(current.id)
    }

    /**
     * 读取某个档案的完整配置（注入该档案在 [secure] 里的 apiKey）。
     */
    private fun profileConfig(profileId: String): ProviderConfig {
        val meta = profiles().firstOrNull { it.id == profileId } ?: return ProviderConfig()
        return meta.config.copy(
            apiKey = secure.get(ProviderProfiles.secureKeyFor(profileId)).orEmpty(),
        )
    }

    /**
     * 所有服务商档案（非敏感字段，不含明文 key）。
     *
     * 首次启动若 [KEY_PROFILES] 为空但有旧单份键（[KEY_BASE_URL] 等），
     * 则按 legacy 迁移成第 1 个档案（沿用 [workspaceList] 的迁移风格）。
     */
    fun profiles(): List<ProviderProfile> {
        val raw = plain.getString(KEY_PROFILES, null)
        val list = ProviderProfiles.parse(raw)
        if (list.isNotEmpty()) return list
        // 迁移旧单值：baseURL/模型/超时/思考等非敏感项进首档；
        // 旧 apiKey 若非空，按首档 id 写进 SecureStore（绝不存明文）
        val legacyBaseURL = plain.getString(KEY_BASE_URL, null)?.takeIf { it.isNotBlank() }
        if (legacyBaseURL != null) {
            val legacy = ProviderProfiles.migrateLegacy(
                legacyBaseURL = legacyBaseURL,
                legacyModel = plain.getString(KEY_MODEL, null).orEmpty(),
                legacyTimeoutMs = plain.getInt(KEY_TIMEOUT, 0),
                legacyThinking = plain.getInt(KEY_THINKING, 0),
                legacyTemperature = plain.getString(KEY_TEMPERATURE, null),
                legacyMaxTokens = plain.getString(KEY_MAX_TOKENS, null),
            )
            if (legacy != null) {
                // 旧单份 key 非空才迁移，避免写空键（SecureStore 对空值会 remove）
                val legacyKey = secure.get(KEY_API_KEY).orEmpty()
                if (legacyKey.isNotEmpty()) {
                    secure.put(ProviderProfiles.secureKeyFor(legacy.id), legacyKey)
                }
                saveProfiles(listOf(legacy))
                // 清理旧键（base_url/model 等），但保留 api_key 清理由 remove 处理
                plain.edit().remove(KEY_BASE_URL).remove(KEY_MODEL)
                    .remove(KEY_TIMEOUT).remove(KEY_TEMPERATURE)
                    .remove(KEY_MAX_TOKENS).remove(KEY_THINKING).apply()
                secure.remove(KEY_API_KEY)
                return listOf(legacy)
            }
        }
        // 完全没有旧数据：保底给一个空档案，保证「至少 1 个」不变量
        val first = ProviderProfiles.create("默认服务商")
        saveProfiles(listOf(first))
        return listOf(first)
    }

    /** 当前档案 id（首项）；无档案返回 null（理论不会发生，profiles() 保底 1 个）。 */
    fun currentProfileId(): String? = profiles().firstOrNull()?.id

    /** 持久化整个档案列表（非敏感字段）。apiKey 不在此写入（见 saveProfileConfig）。 */
    fun saveProfiles(list: List<ProviderProfile>) {
        plain.edit().putString(KEY_PROFILES, ProviderProfiles.serialize(list)).apply()
    }

    /** 设置一个档案为当前（置顶）。 */
    fun setCurrentProfile(id: String) {
        saveProfiles(ProviderProfiles.switchTo(profiles(), id))
    }

    /**
     * 新增一个档案并置为当前。
     *
     * 若 [profile.id] 已存在则覆盖（按 id 更新），否则追加。
     */
    fun addProfile(profile: ProviderProfile) {
        val list = ProviderProfiles.add(profiles(), profile)
        saveProfiles(list)
        // 新档案（或覆盖的档案）的 apiKey 立即落盘加密
        secure.put(ProviderProfiles.secureKeyFor(profile.id), profile.config.apiKey)
    }

    /**
     * 删除一个档案。
     *
     * 至少保留 1 个：删到空时不再执行（防用户把唯一档案删光后无配置可选）。
     * 删除同时清理该档案在 [secure] 里的 apiKey（不留孤儿 key）。
     */
    fun removeProfile(id: String) {
        val list = profiles()
        if (list.size <= 1) return
        val next = ProviderProfiles.remove(list, id)
        saveProfiles(next)
        secure.remove(ProviderProfiles.secureKeyFor(id))
    }

    /**
     * 更新一个档案的配置（按 id 覆盖）。
     *
     * apiKey 单独写 [secure]（按档案 id 加密）；其余非敏感字段随列表落盘。
     */
    fun updateProfile(profile: ProviderProfile) {
        saveProfiles(ProviderProfiles.update(profiles(), profile))
        secure.put(ProviderProfiles.secureKeyFor(profile.id), profile.config.apiKey)
    }

    /**
     * 保存 Provider 配置（向后兼容旧调用方）。
     *
     * 语义改为「写回**当前档案**」而非全局单份 —— 这样 [LocalConfigPanel.save]
     * 等旧调用点不改也能正确落到当前档案。
     */
    fun saveProviderConfig(c: ProviderConfig) {
        val id = currentProfileId() ?: return
        updateProfile(ProviderProfile(id = id, name = profileName(id), config = c))
    }

    /** 读某档案的显示名（找不到回落默认）。 */
    private fun profileName(id: String): String =
        profiles().firstOrNull { it.id == id }?.name ?: "默认服务商"

    /** 记住上次选的预设 id（便于设置页回显）。 */
    fun presetId(): String = plain.getString(KEY_PRESET, null) ?: ProviderPresets.DEFAULT.id

    fun setPresetId(id: String) {
        plain.edit().putString(KEY_PRESET, id).apply()
    }

    // ── 离线推理引擎（本地 HTTP 服务端）──

    /**
     * 离线模式开关：是否用本地引擎替代远程 API。
     *
     * 默认 false（与升级前行为一致：本地模式本就指「本地 agent 循环调
     * 远程 API」；真·离线是新增能力，由开关显式开启）。
     */
    fun offlineEngineEnabled(): Boolean = plain.getBoolean(KEY_OFFLINE_ENGINE, false)
    fun setOfflineEngineEnabled(on: Boolean) {
        plain.edit().putBoolean(KEY_OFFLINE_ENGINE, on).apply()
    }

    /** 本地推理服务端地址（空 = 未配置）。 */
    fun engineUrl(): String = plain.getString(KEY_ENGINE_URL, null).orEmpty()
    fun setEngineUrl(url: String) {
        plain.edit().putString(KEY_ENGINE_URL, url.trim()).apply()
    }

    /** 本地引擎模型名（空 = 由服务端默认 / 列表首个）。 */
    fun engineModel(): String = plain.getString(KEY_ENGINE_MODEL, null).orEmpty()
    fun setEngineModel(model: String) {
        plain.edit().putString(KEY_ENGINE_MODEL, model.trim()).apply()
    }

    companion object {
        private const val TAG = "LocalPrefsStore"
        // 敏感值（API key）的存储名由 SecureStore 自己管理（见该类），
        // 此处只定义非敏感项的文件名
        private const val PLAIN_PREFS = "doge_local"
        /** 旧版单工作区键（M4 前的形态，读时迁移）。 */
        private const val KEY_WORKSPACE = "workspace_path"
        /** 多工作区列表（换行分隔，首项为当前）。 */
        private const val KEY_WORKSPACES = "workspace_list"
        private const val KEY_API_KEY = "api_key"
        /** 多档案列表（JSON，非敏感字段，见 [ProviderProfiles]）。 */
        private const val KEY_PROFILES = "provider_profiles"
        private const val KEY_BASE_URL = "base_url"
        private const val KEY_MODEL = "model"
        private const val KEY_TIMEOUT = "timeout_ms"
        private const val KEY_TEMPERATURE = "temperature"
        private const val KEY_MAX_TOKENS = "max_tokens"
        private const val KEY_THINKING = "thinking_budget"
        private const val KEY_PRESET = "preset_id"
        /**
         * 离线推理模式开关（on/off）：是否用本地引擎替代远程 API。
         *
         * 默认 off（与升级前「本地模式=连远程 API」行为一致；真·离线
         * 是新能力，不应悄悄改变现有用户的连接方式）。
         */
        private const val KEY_OFFLINE_ENGINE = "offline_engine_on"
        /**
         * 本地推理服务端 baseURL（如 `http://127.0.0.1:8080/v1`）。
         * 空 = 未配置（[LocalInferenceBackend] 回落 NullInferenceEngine）。
         */
        private const val KEY_ENGINE_URL = "engine_base_url"
        /** 本地引擎模型名（服务端 `GET /models` 列出的某个 id）。 */
        private const val KEY_ENGINE_MODEL = "engine_model"

        /** 工作区列表上限。与「推荐候选」数量同量级 —— 太长失去快速切换意义。 */
        private const val MAX_WORKSPACES = WorkspaceList.MAX
    }
}
