package com.dogecode.mobile

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlin.concurrent.thread

/**
 * 历史管理页（线 C1）。
 *
 * 为什么需要：历史按会话分文件后，用户没有任何途径知道
 * 「一共存了多少、占多大、哪个最占地方」—— 只能整体清空。
 * 手机上存储是稀缺资源，需要可管理。
 *
 * 删除是**不可逆操作**，故：
 * · 单个删除直接执行（影响面小、可理解）
 * · 全部清空需二次确认（影响面大）
 */
class HistoryFragment : Fragment() {

    private lateinit var store: HistoryStore
    private lateinit var list: RecyclerView
    private lateinit var summary: TextView
    private lateinit var adapter: HistoryAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = inflater.inflate(R.layout.fragment_history, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        store = HistoryStore(requireContext())
        list = view.findViewById(R.id.history_list)
        summary = view.findViewById(R.id.history_summary)

        adapter = HistoryAdapter(
            onDelete = { entry -> confirmDelete(entry) },
        )
        list.layoutManager = LinearLayoutManager(requireContext())
        list.adapter = adapter

        view.findViewById<Button>(R.id.btn_clear_all_history).setOnClickListener {
            confirmClearAll()
        }

        refresh()
    }

    /** 重新读取清单。IO 在后台线程。 */
    fun refresh() {
        val ctx = context ?: return
        thread {
            val entries = store.list()
            val (count, total) = entries.size to entries.sumOf { it.sizeBytes }
            activity?.runOnUiThread {
                if (!isAdded) return@runOnUiThread
                adapter.submit(entries)
                summary.text = if (entries.isEmpty()) {
                    getString(R.string.history_empty)
                } else {
                    getString(R.string.history_summary, count, formatSize(total))
                }
            }
        }
    }

    private fun formatSize(bytes: Long): String = when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${bytes / 1024} KB"
        else -> String.format(java.util.Locale.US, "%.1f MB", bytes / 1024.0 / 1024.0)
    }

    /**
     * 单个删除。
     *
     * 仍要确认 —— 删历史不可逆，且用户可能只是想看看条数而误触了图标。
     * 确认文案带上会话名，避免删错对象。
     */
    private fun confirmDelete(entry: HistoryStore.Entry) {
        android.app.AlertDialog.Builder(requireContext())
            .setTitle(R.string.history_delete)
            .setMessage(
                getString(
                    R.string.history_delete_confirm,
                    entry.sessionKey,
                    entry.messageCount,
                ),
            )
            .setPositiveButton(R.string.history_delete) { _, _ ->
                thread {
                    val ok = store.delete(entry.fileName)
                    activity?.runOnUiThread {
                        if (!isAdded) return@runOnUiThread
                        if (ok) {
                            Toast.makeText(
                                requireContext(),
                                R.string.history_deleted,
                                Toast.LENGTH_SHORT,
                            ).show()
                            refresh()
                        } else {
                            Toast.makeText(
                                requireContext(),
                                R.string.history_delete_failed,
                                Toast.LENGTH_SHORT,
                            ).show()
                        }
                    }
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun confirmClearAll() {
        val (count, _) = store.summary()
        if (count == 0) {
            Toast.makeText(requireContext(), R.string.history_empty, Toast.LENGTH_SHORT).show()
            return
        }
        android.app.AlertDialog.Builder(requireContext())
            .setTitle(R.string.history_clear_all)
            .setMessage(getString(R.string.history_clear_all_confirm, count))
            .setPositiveButton(R.string.history_clear_all) { _, _ ->
                thread {
                    val n = store.clearAll()
                    activity?.runOnUiThread {
                        if (!isAdded) return@runOnUiThread
                        Toast.makeText(
                            requireContext(),
                            getString(R.string.history_cleared_n, n),
                            Toast.LENGTH_SHORT,
                        ).show()
                        refresh()
                    }
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }
}
