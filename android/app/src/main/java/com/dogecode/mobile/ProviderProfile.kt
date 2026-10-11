package com.dogecode.mobile

/**
 * 一个命名服务商档案（Named Profile）。
 *
 * ## 形态
 *
 * 把「一套完整 URL+KEY+模型」打包成一个命名单元，可切换 / 新建 / 删除。
 * 与 [ProviderConfig] 的关系：档案是「带 id + 名字的 ProviderConfig 容器」，
 * 单个服务商配置仍是 [ProviderConfig]（保持旧概念不被颠覆）。
 *
 * ## id 的稳定性
 *
 * id 由 [ProviderProfiles.newId] 生成后**不可变** —— 它是 SecureStore 里
 * apiKey 的键名，改名/改配置都动 name/config 不动 id，否则旧 key 变孤儿。
 *
 * ## apiKey 的存储边界
 *
 * 本数据类只是内存态；落盘时 [ProviderProfiles.serialize] 会**剥离** apiKey，
 * 真实 key 由 [LocalPrefsStore] 按 [ProviderProfiles.secureKeyFor]（id）加密存。
 * 故这里的 `config.apiKey` 在读取后由 store 注入、保存前由 store 抽出。
 */
data class ProviderProfile(
    /** 唯一且不可变的档案标识（同时是 SecureStore 的 key 名）。 */
    val id: String,
    /** 显示名（用户可见，可重复、可改）。 */
    val name: String,
    /** 该档案的服务商配置（apiKey 仅内存态，落盘时被剥离）。 */
    val config: ProviderConfig,
)
