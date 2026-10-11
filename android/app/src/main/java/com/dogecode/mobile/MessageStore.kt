package com.dogecode.mobile

import android.content.Context
import android.util.Log
import org.json.JSONArray
import java.io.File

/**
 * 消息历史的本地持久化。
 *
 * 用应用私有目录下的 JSON 文件而非 SharedPreferences：消息量大时
 * SharedPreferences 会整表读写、性能差，且没有合适的大小上限。
 *
 * 保留上限 MAX_MESSAGES 条，超出时丢弃最旧的，避免文件无限增长。
 *
 * 写盘由内部单线程 executor 串行化（见 [saveAsync]）：调用方可以放心地
 * 每次消息变更都提交一次保存，不会产生并发写盘。
 */
class MessageStore(private val context: Context, sessionKey: String = "default") {

    /**
     * 历史按会话分文件。
     *
     * 多会话切换时若共用一条时间线，用户会把 A 会话的回复误认成 B 的 ——
     * 这比单纯的「体验不好」更严重。sessionKey 由连接时的主机:端口构成，
     * 正好区分不同 CLI 实例。
     */
    private var file = File(context.filesDir, "history-$sessionKey.json")

    /**
     * 写盘串行化器。
     *
     * 为什么必需：MainActivity 此前每次消息变更都 `thread { store.save(...) }`，
     * 流式回复期间 N 条消息会产生 N 个并发线程写同一个文件。即便 save() 用了
     * 「先写 .tmp 再 rename」，两个线程也会争抢同一个 .tmp 文件名：
     * A 写入一半、B 覆盖、A rename —— 落盘内容可能是被截断的半个 JSON。
     * 表现是「重启后历史少了一截」或「历史读不出来」，且只因时序偶发。
     *
     * 单线程 executor 让写入天然排队；submit 的 lambda 捕获的是快照引用，
     * 后一次提交覆盖前一次的结果，等价于「只落盘最新状态」，不会积压。
     */
    private val writer = java.util.concurrent.Executors.newSingleThreadExecutor { r ->
        Thread(r, "MessageStore-writer").apply { isDaemon = true }
    }

    /** 切换会话：改指另一个历史文件。调用方无需重建实例。 */
    fun useSession(sessionKey: String) {
        file = File(context.filesDir, "history-$sessionKey.json")
    }

    fun load(): MutableList<ChatMessage> {
        if (!file.exists()) return mutableListOf()
        return try {
            val arr = JSONArray(file.readText())
            MutableList(arr.length()) { ChatMessage.fromJson(arr.getJSONObject(it)) }
        } catch (e: Exception) {
            // 文件损坏不应导致 App 打不开：记日志后从空历史开始
            Log.w(TAG, "读取历史失败，忽略：${e.message}")
            mutableListOf()
        }
    }

    /**
     * 异步保存：排队到单线程，调用方无需自己开线程，也不会并发踩踏。
     *
     * [messages] 必须传不可变快照（adapter.snapshot() 已返回 toList()）——
     * 若传可变列表，排队期间它可能已被后续 append 修改，落盘内容会错。
     */
    fun saveAsync(messages: List<ChatMessage>) {
        val snapshot = messages.toList()
        val target = file
        try {
            writer.execute { writeTo(target, snapshot) }
        } catch (e: Exception) {
            // executor 已关闭（进程退出中）时静默放弃：此时落盘已无意义，
            // 且不应因此崩溃
            Log.w(TAG, "提交保存失败（executor 已关闭）：${e.message}")
        }
    }

    /**
     * 同步保存。仅在 onCreate 冷启动兜底路径（需要保证写完再继续）使用；
     * 常规路径请用 [saveAsync]，避免阻塞调用线程。
     */
    fun save(messages: List<ChatMessage>) {
        writeTo(file, messages)
    }

    private fun writeTo(target: File, messages: List<ChatMessage>) {
        try {
            val trimmed = trimToLimit(messages)
            val arr = JSONArray()
            trimmed.forEach { arr.put(it.toJson()) }
            // 先写临时文件再改名，避免写入中断留下半个文件。
            // 临时文件名跟随目标文件：多会话（多实例）同时写时不互相踩踏。
            // 同一会话内的并发已由单线程 executor 排除。
            val tmp = File(target.parentFile, target.name + ".tmp")
            tmp.writeText(arr.toString())
            if (!tmp.renameTo(target)) {
                target.writeText(arr.toString())
                tmp.delete()
            }
        } catch (e: Exception) {
            Log.w(TAG, "保存历史失败：${e.message}")
        }
    }

    fun clear() {
        runCatching { file.delete() }
    }

    /**
     * 把 OpenAI 格式的 [ChatMsg] 历史落盘为本地历史格式。
     *
     * 单独成方法而非直接用 `saveAsync`：`saveAsync` 接受 [ChatMessage]（UI 字段），
     * 本地模式用 [LocalHistoryCodec] 转成 [ChatMessage] 再存既绕又丢信息
     *（OpenAI 的 `tool_calls` 与 UI 字段的语义不完全对齐，见 [LocalHistoryCodec]）。
     *
     * 写盘格式：[LocalHistoryCodec.toJson] 的 JSON 数组 —— 仅 user/assistant，
     * 不含 tool 事件。文件比远端历史小（远端可能含图片 base64）。
     */
    fun saveLocalHistory(messages: List<ChatMsg>) {
        val json = LocalHistoryCodec.toJson(messages)
        // 走与 saveAsync 相同的临时文件 + rename 模式：避免写入中断留下半文件
        val tmp = File(file.parentFile, file.name + ".tmp")
        try {
            tmp.writeText(json)
            if (!tmp.renameTo(file)) {
                file.writeText(json)
                tmp.delete()
            }
        } catch (e: Exception) {
            Log.w(TAG, "保存本地历史失败：${e.message}")
        }
    }

    /**
     * 读取本地模式的历史。
     *
     * 缺字段或非 JSON → 空列表（与 [load] 行为一致）。
     */
    fun loadLocalHistory(): List<ChatMsg> {
        if (!file.exists()) return emptyList()
        val raw = runCatching { file.readText() }.getOrNull() ?: return emptyList()
        return LocalHistoryCodec.fromJson(raw)
    }

    companion object {
        private const val TAG = "MessageStore"
        private const val MAX_MESSAGES = 500

        /**
         * 会话标识：主机_端口，用作历史文件名。
         *
         * 两步过滤，缺一不可：
         * 1. 只保留 [A-Za-z0-9_.-]，其余替换为 _
         * 2. 再把连续的 "." 折叠为单个 —— 上面一步保留了 "."（为可读性），
         *    但 ".." 是路径穿越字符，仅靠字符白名单挡不住（"." 本身合法）。
         *    测试 `路径穿越字符被消除` 覆盖此点。
         */
        fun keyFor(host: String, port: Int): String =
            "${host}_$port"
                .replace(Regex("[^A-Za-z0-9_.-]"), "_")
                .replace(Regex("\\.{2,}"), "_")

        /**
         * 本地模式的会话标识：按**工作区目录**隔离。
         *
         * 形如 `local-<dirName>-<sha1前8位>`。
         *
         * ## 为什么用目录名 + 短哈希
         *
         * 用户切工作区后历史必须换一份。若用完整路径：`/sdcard/Documents/proj`
         * 跟 `Documents/proj` 会被认为是两份历史（路径形态变了但其实是同一项目），
         * 体感为「切回老目录历史没了」。故只取**目录名**（`proj`）。
         *
         * 但仅目录名会撞名（`/a/proj` 与 `/b/proj` 撞 `proj`）—— 短哈希用
         * 完整路径的 SHA1 前 8 位做后缀，碰撞概率极低（48 bit）。
         *
         * ## 为什么必须以 `local-` 开头
         *
         * 远端 key 形如 `192.168.0.106_5680`、本地 key 形如 `proj_a1b2c3d4`。
         * 若没有前缀，两类历史可能撞名（极端情况：用户在本地用了一个叫
         * `192.168.0.106_5680` 的目录）。前缀让两域**绝对不相交**，
         * 跨模式的历史查找永远不会串味。
         */
        fun keyForLocal(workspacePath: String): String {
            // 取目录名而非全路径：同项目搬迁后历史仍能复用
            val trimmed = workspacePath.trim().trimEnd('/')
            val dirName = trimmed.substringAfterLast('/').ifBlank { "root" }
            // 哈希必须用**已 trim** 的字符串，否则尾斜杠差异会让同一目录
            // 产生不同 key（同源测试 `尾斜杠不影响 key` 覆盖此点）
            val hash = sha1Prefix(trimmed, 8)
            val raw = "local-${dirName}-${hash}"
            return raw
                .replace(Regex("[^A-Za-z0-9_.-]"), "_")
                .replace(Regex("\\.{2,}"), "_")
        }

        /**
         * 取字符串的 SHA1 前 N 位十六进制。
         *
         * 用 JDK 自带 [java.security.MessageDigest] 而非引入 Guava：
         * 单文件、低频调用，加依赖的收益不抵复杂度。
         */
        private fun sha1Prefix(s: String, n: Int): String {
            if (n <= 0 || n > 32) return ""
            val bytes = java.security.MessageDigest.getInstance("SHA-1")
                .digest(s.toByteArray(Charsets.UTF_8))
            val hex = StringBuilder(bytes.size * 2)
            for (b in bytes) {
                val v = b.toInt() and 0xff
                hex.append(HEX_CHARS[v ushr 4]).append(HEX_CHARS[v and 0x0f])
            }
            return hex.substring(0, n)
        }

        private val HEX_CHARS = "0123456789abcdef".toCharArray()

        /**
         * 超出上限时保留最后 [MAX_MESSAGES] 条。
         *
         * 抽成纯函数以便单测 —— 边界（恰好等于上限、超出 1 条）是
         * `subList(size - MAX, size)` 最容易写错的地方：用 `subList(0, MAX)`
         * 会把最新的消息丢掉（用户看到「历史停在很久以前」）。
         */
        fun trimToLimit(messages: List<ChatMessage>): List<ChatMessage> =
            if (messages.size > MAX_MESSAGES) {
                messages.subList(messages.size - MAX_MESSAGES, messages.size)
            } else {
                messages
            }
    }
}
