package com.dogecode.mobile

import android.app.AlertDialog
import android.content.Context
import android.graphics.Typeface
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import kotlin.concurrent.thread

/**
 * 会话选择对话框：扫描端口段，列出发现的会话供切换。
 *
 * 用 AlertDialog 而非独立 Activity —— 列表是临时选择，不需要独立页面、
 * 不涉及返回栈管理，独立 Activity 反而是多余的复杂度。
 */
object SessionPickerDialog {

    /**
     * 弹出选择框。[host] 用当前地址栏的主机名（USB 模式即 127.0.0.1）。
     * 选中后回调，由调用方负责切换连接。
     */
    fun show(
        context: Context,
        host: String,
        currentPort: Int?,
        onPick: (SessionScanner.Session) -> Unit,
    ) {
        val density = context.resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        val container = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(12), dp(20), dp(8))
        }
        val loading = ProgressBar(context).apply {
            visibility = android.view.View.VISIBLE
        }
        val statusText = TextView(context).apply {
            text = "正在扫描 $host:5680-5690 …"
            setTextColor(0xFF888888.toInt())
            textSize = 13f
        }
        container.addView(statusText)
        container.addView(loading)

        val dialog = AlertDialog.Builder(context)
            .setTitle("选择会话")
            .setView(ScrollView(context).apply { addView(container) })
            .setNegativeButton("取消", null)
            .create()

        dialog.show()

        thread {
            val sessions = SessionScanner.scan(host)
            (context as? android.app.Activity)?.runOnUiThread {
                loading.visibility = android.view.View.GONE
                if (sessions.isEmpty()) {
                    statusText.text =
                        "未发现会话。\n\n请确认电脑上 CLI 正在运行，且已设 " +
                            "CLAUDE_CODE_MOBILE_BRIDGE=1。\n若走局域网请检查 IP 与防火墙。"
                    return@runOnUiThread
                }
                statusText.text = "发现 ${sessions.size} 个会话："
                sessions.forEach { s ->
                    container.addView(buildRow(context, s, s.port == currentPort) {
                        dialog.dismiss()
                        onPick(s)
                    })
                }
            }
        }
    }

    private fun buildRow(
        context: Context,
        s: SessionScanner.Session,
        isCurrent: Boolean,
        onClick: () -> Unit,
    ): LinearLayout {
        val d = context.resources.displayMetrics.density
        fun dp(v: Int) = (v * d).toInt()

        return LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(4), dp(12), dp(4), dp(12))
            isClickable = true
            setOnClickListener { onClick() }
            // 点击反馈
            val tv = android.util.TypedValue()
            context.theme.resolveAttribute(
                android.R.attr.selectableItemBackground, tv, true,
            )
            setBackgroundResource(tv.resourceId)

            addView(TextView(context).apply {
                text = if (isCurrent) "${s.label}（当前）" else s.label
                setTextColor(0xFF4ADE80.toInt())
                textSize = 16f
                setTypeface(typeface, Typeface.BOLD)
            })
            addView(TextView(context).apply {
                text = "端口 ${s.port}   " +
                    (if (s.interactive) "交互模式" else "⚠ 非交互，消息不会被处理") +
                    if (s.clients > 0) "   已连 ${s.clients} 台" else ""
                setTextColor(if (s.interactive) 0xFF999999.toInt() else 0xFFF87171.toInt())
                textSize = 12f
                setPadding(0, dp(4), 0, 0)
            })
            addView(TextView(context).apply {
                text = s.cwd
                setTextColor(0xFF666666.toInt())
                textSize = 11f
                setPadding(0, dp(2), 0, 0)
            })
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            )
        }
    }
}
