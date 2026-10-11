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
 * 会话详情页（新增）。
 *
 * 为什么需要：列表项只能显示一行摘要，而用户在切换前常需确认
 * 「这个是不是我要找的」—— 尤其在多窗口、多目录的情况下。
 *
 * 另一个价值：把「点一下就直接切走」改成「点进来看详情，再决定是否切换」。
 * 原来误点一下就切走了，想切回还得再扫一次端口段。
 */
class SessionDetailFragment : Fragment() {

    /** 由 Activity 提供动作。 */
    interface Host {
        fun detailSwitch(session: SessionScanner.Session)
        fun detailRename(session: SessionScanner.Session)

        /**
         * 返回该会话可用的连接地址。
         *
         * **为什么是返回值而非副作用式（void + 内部赋值）**：
         * 此前 Host 的方法是 `void detailCopyAddress(session)`，
         * 而 Fragment 自己也拼了一份地址塞进剪贴板 —— 两份实现不一致
         *（Fragment 那份用 `cwd` 当主机名，拼出 `http://D:\proj:5680`
         * 这种必然连不上的地址）。
         *
         * 改成返回值后，地址的构造**只有一处**（Activity 侧，它才拿得到
         * 当前主机名），Fragment 只负责写剪贴板。单一来源，不可能不一致。
         */
        fun detailAddress(session: SessionScanner.Session): String
    }

    private val host: Host?
        get() = activity as? Host

    private var session: SessionScanner.Session? = null
    private var isCurrent = false

    /** 由 Activity 在创建时传入。用 arguments 会涉及 Parcelable，这里直接 setter 更省。 */
    fun bind(session: SessionScanner.Session, isCurrent: Boolean) {
        this.session = session
        this.isCurrent = isCurrent
        if (isAdded) render()
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = inflater.inflate(R.layout.fragment_session_detail, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        view.findViewById<Button>(R.id.detail_switch).setOnClickListener {
            session?.let { host?.detailSwitch(it) }
        }
        view.findViewById<Button>(R.id.detail_rename).setOnClickListener {
            session?.let { host?.detailRename(it) }
        }
        view.findViewById<Button>(R.id.detail_copy_resume).setOnClickListener {
            val cmd = currentResumeCommand() ?: return@setOnClickListener
            val cm = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("doge-code", cmd))
            Toast.makeText(requireContext(), R.string.detail_resume_copied, Toast.LENGTH_SHORT).show()
        }
        view.findViewById<Button>(R.id.detail_copy_addr).setOnClickListener {
            val s = session ?: return@setOnClickListener
            // 地址由 Activity 提供（只有它知道当前用哪个主机名）
            val addr = host?.detailAddress(s) ?: return@setOnClickListener
            val cm = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("doge-code", addr))
            Toast.makeText(requireContext(), R.string.detail_addr_copied, Toast.LENGTH_SHORT).show()
        }
        render()
    }

    /**
     * 拼出可用的恢复命令；服务端没给真实会话 ID 时返回 null。
     *
     * 用 --resume 而非 -r：长参数在给用户的命令里更不容易混淆
     *（-r 在别的工具里常是「递归」）。
     */
    private fun currentResumeCommand(): String? {
        val id = session?.resumeSessionId ?: return null
        return "doge.exe --resume $id"
    }

    private fun render() {
        val v = view ?: return
        val s = session ?: return

        v.findViewById<TextView>(R.id.detail_label).text = s.label

        val currentBadge = v.findViewById<View>(R.id.detail_current)
        currentBadge.visibility = if (isCurrent) View.VISIBLE else View.GONE

        // 详情逐行列出 —— 等宽字体下「键 值」对齐易读
        v.findViewById<TextView>(R.id.detail_info).text = buildString {
            append("端口        ").append(s.port).append('\n')
            append("会话 ID     ").append(s.sessionId).append('\n')
            append("工作目录    ").append(s.cwd.ifBlank { "（未知）" }).append('\n')
            append("交互模式    ")
            append(if (s.interactive) "是（消息会被处理）" else "否（消息只入队，不会被处理）")
            append('\n')
            append("已连设备    ").append(s.clients).append(" 台")
        }

        // 恢复命令：只在服务端提供了真实会话 ID 时才显示。
        // 不显示比显示一个错的更好 —— 后者会让用户以为功能坏了。
        val cmd = currentResumeCommand()
        val cmdView = v.findViewById<TextView>(R.id.detail_resume_cmd)
        val copyBtn = v.findViewById<Button>(R.id.detail_copy_resume)
        if (cmd == null) {
            cmdView.visibility = View.GONE
            copyBtn.visibility = View.GONE
        } else {
            cmdView.text = cmd
            cmdView.visibility = View.VISIBLE
            copyBtn.visibility = View.VISIBLE
        }

        // 非交互会话把切换按钮禁用 —— 切过去也没用，不如直接拦住
        val switchBtn = v.findViewById<Button>(R.id.detail_switch)
        switchBtn.isEnabled = !isCurrent && s.interactive
        switchBtn.text = when {
            isCurrent -> "已是当前会话"
            !s.interactive -> "非交互会话，无法使用"
            else -> getString(R.string.detail_switch)
        }
    }
}
