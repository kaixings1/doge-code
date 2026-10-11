package com.dogecode.mobile

import android.content.Context
import android.util.Log
import org.json.JSONArray
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 会话历史的清单与统计。
 *
 * 与 [MessageStore] 的分工：后者管**单个会话**的读写（当前会话）；
 * 本类管**所有会话历史文件**的清单、统计与删除。
 *
 * 为什么需要：历史按 `history-<host>_<port>.json` 分文件后，
 * 用户没有任何途径知道「一共存了多少、占多大、哪个会话的历史最占地方」——
 * 只能整体清空。手机上存储是稀缺资源，需要可管理。
 */
class HistoryStore(private val context: Context) {

    /** 一个会话的历史文件摘要。 */
    data class Entry(
        /** 文件名（如 history-127.0.0.1_5680.json）——用于删除。 */
        val fileName: String,
        /** 从文件名还原的会话标识（host_port）。 */
        val sessionKey: String,
        val messageCount: Int,
        val sizeBytes: Long,
        /** 最后修改时间（毫秒）。 */
        val lastModified: Long,
    ) {
        /** 人类可读的大小。 */
        fun sizeLabel(): String = when {
            sizeBytes < 1024 -> "$sizeBytes B"
            sizeBytes < 1024 * 1024 -> "${sizeBytes / 1024} KB"
            else -> String.format(Locale.US, "%.1f MB", sizeBytes / 1024.0 / 1024.0)
        }

        /** 人类可读的时间。 */
        fun timeLabel(): String =
            SimpleDateFormat("MM-dd HH:mm", Locale.getDefault()).format(Date(lastModified))
    }

    /**
     * 列出所有会话历史。
     *
     * @return 按最后修改时间**降序**（最近用过的在前）—— 用户最可能
     *   关心最近那个。空目录返回空列表。
     */
    fun list(): List<Entry> {
        val dir = context.filesDir ?: return emptyList()
        val files = dir.listFiles { f ->
            f.isFile && f.name.startsWith(PREFIX) && f.name.endsWith(SUFFIX)
        } ?: return emptyList()

        return files.mapNotNull { f -> toEntry(f) }.sortedByDescending { it.lastModified }
    }

    /**
     * 统计总数与总占用。
     *
     * 全部失败时返回 (0, 0) 而非抛异常 —— 统计是展示用的，
     * 失败不该让界面打不开。
     */
    fun summary(): Pair<Int, Long> {
        val entries = list()
        return entries.size to entries.sumOf { it.sizeBytes }
    }

    /**
     * 删除某个会话的历史。
     *
     * @return 是否删除成功（文件本就不存在时返回 false，调用方据此提示）
     */
    fun delete(fileName: String): Boolean {
        // 只允许删本目录下、符合命名模式的普通文件 ——
        // 防止将来某处传入 "../../xxx" 之类的路径删到别处
        if (!isSafeName(fileName)) return false
        val dir = context.filesDir ?: return false
        val f = File(dir, fileName)
        return runCatching { f.exists() && f.delete() }.getOrDefault(false)
    }

    /** 删除所有会话历史。 */
    fun clearAll(): Int {
        val entries = list()
        var n = 0
        entries.forEach { if (delete(it.fileName)) n++ }
        return n
    }

    /**
     * 读取某个历史文件的条数（用于列表展示）。
     *
     * 解析失败返回 0 —— 损坏的文件仍应出现在列表里（用户要能删它），
     * 只是条数显示为 0。
     */
    private fun countOf(f: File): Int = runCatching {
        JSONArray(f.readText()).length()
    }.getOrElse {
        Log.w(TAG, "历史文件解析失败（仍列出以便删除）：${f.name} - ${it.message}")
        0
    }

    private fun toEntry(f: File): Entry? = runCatching {
        Entry(
            fileName = f.name,
            sessionKey = f.name.removePrefix(PREFIX).removeSuffix(SUFFIX),
            messageCount = countOf(f),
            sizeBytes = f.length(),
            lastModified = f.lastModified(),
        )
    }.getOrNull()

    companion object {
        private const val TAG = "HistoryStore"

        /** 与 MessageStore 的文件命名保持一致 —— 改了这里必须同步改那边。 */
        const val PREFIX = "history-"
        const val SUFFIX = ".json"

        /**
         * 文件名白名单校验。
         *
         * 只允许字母数字与 `_.-`，且不含 `..` —— 与 MessageStore.keyFor
         * 的产物一致。这是删除操作前的**必要守卫**：删除是不可逆操作，
         * 一个路径穿越的入参就能删掉任意文件。
         */
        fun isSafeName(name: String): Boolean {
            if (!name.startsWith(PREFIX) || !name.endsWith(SUFFIX)) return false
            val body = name.removePrefix(PREFIX).removeSuffix(SUFFIX)
            if (body.isEmpty()) return false
            if (body.contains("..")) return false
            return body.all { it.isLetterOrDigit() || it == '_' || it == '.' || it == '-' }
        }
    }
}
