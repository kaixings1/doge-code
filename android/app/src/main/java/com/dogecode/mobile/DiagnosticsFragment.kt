package com.dogecode.mobile

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment

/**
 * 连接诊断页（原为 AlertDialog）。
 *
 * 弹窗装不下这些内容：之前全部挤在一个 message 字符串里，字号小、
 * 不能选段复制、不能滚动查看。改独立页后分区展示，且**报告可整段复制** ——
 * 用户求助时最需要的就是把诊断信息贴给别人。
 *
 * 分区：当前状态 / 最近失败 / 常见原因对照 / 可执行操作。
 */
class DiagnosticsFragment : Fragment() {

    /** 由 Activity 提供诊断数据与动作。 */
    interface Host {
        fun diagStatusText(): String
        fun diagFailureText(): String
        fun diagReport(): String
        fun diagRetry()
        fun diagUseUsb()
        fun diagClearFailure()
        /** 失败历史（最近 N 条）。 */
        fun diagHistoryText(): String
        /** 失败历史汇总文案，如「共 3 次失败，最近 5 分钟前」。 */
        fun diagHistorySummary(): String
        fun diagClearHistory()
    }

    private val host: Host?
        get() = activity as? Host

    private var statusView: TextView? = null
    private var failureView: TextView? = null
    private var historyView: TextView? = null
    private var historySummary: TextView? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = inflater.inflate(R.layout.fragment_diagnostics, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        statusView = view.findViewById(R.id.diag_status)
        failureView = view.findViewById(R.id.diag_failure)
        historyView = view.findViewById(R.id.diag_history)
        historySummary = view.findViewById(R.id.diag_history_summary)

        // 常见原因对照：静态内容，一次填好
        view.findViewById<TextView>(R.id.diag_causes).text = CAUSES

        view.findViewById<Button>(R.id.diag_retry).setOnClickListener { host?.diagRetry() }
        view.findViewById<Button>(R.id.diag_use_usb).setOnClickListener { host?.diagUseUsb() }
        view.findViewById<Button>(R.id.diag_copy).setOnClickListener {
            val report = host?.diagReport() ?: return@setOnClickListener
            val cm = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("doge-code 诊断", report))
            Toast.makeText(requireContext(), R.string.diag_copied, Toast.LENGTH_SHORT).show()
        }
        view.findViewById<Button>(R.id.diag_clear).setOnClickListener {
            host?.diagClearFailure()
            refresh()
        }
        view.findViewById<Button>(R.id.diag_clear_history).setOnClickListener {
            host?.diagClearHistory()
            refresh()
        }

        refresh()
    }

    /** 刷新动态部分。连接状态会变，故暴露给 Activity 在事件后调用。 */
    fun refresh() {
        statusView?.text = host?.diagStatusText() ?: "—"
        failureView?.text = host?.diagFailureText() ?: "—"
        historySummary?.text = host?.diagHistorySummary().orEmpty()
        historyView?.text = host?.diagHistoryText() ?: "—"
    }

    private companion object {
        /**
         * 常见原因对照表。
         *
         * 放在客户端而非服务端：这些是**排查知识**，与具体服务端版本无关，
         * 且不需要联网就能看 —— 而用户看它的时刻恰恰是「连不上」的时候。
         */
        const val CAUSES = """ECONNREFUSED / 拒绝连接
  → 桥接进程没起，或端口不对
  → 确认 CLI 在运行且设了 CLAUDE_CODE_MOBILE_BRIDGE=1

SocketTimeout / 超时
  → 防火墙拦截，或 IP 不通
  → 局域网模式需放行防火墙（带 remoteip 限定）
  → 或改用 USB 反向转发（adb reverse）

Unable to resolve host
  → 地址写错（少了字母/数字）

code=4001
  → 密钥不匹配
  → 手机端密钥须与服务端 CLAUDE_CODE_MOBILE_SECRET 一致

code=4002
  → 该 CLI 的连接数已达上限（默认 5 台设备）

一直转圈 / 页面空白
  → 连到了 5678（本地桥接骨架），应连 5680

发消息无回复
  → CLI 非交互模式（-p 或 stdin 被重定向），队列不被消费"""
    }
}
