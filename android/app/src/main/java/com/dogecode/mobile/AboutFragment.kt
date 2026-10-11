package com.dogecode.mobile

import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment

/**
 * 关于页。
 *
 * 为什么值得有：用户报问题时第一句总是「你用的哪个版本」。
 * 没有这页，用户只能去安装包或应用商店猜。
 *
 * 更重要的一段是「架构说明」—— 它解释了一个最容易被误解为 bug 的现象：
 * 手机端功能少于桌面端。原因是本 App 只是客户端，对话与工具执行
 * 全部在电脑的 CLI 进程里。写清楚能省掉大量来回沟通。
 */
class AboutFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = inflater.inflate(R.layout.fragment_about, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val ctx = requireContext()

        // 版本从 PackageManager 读，避免硬编码后期忘改
        val version = runCatching {
            val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
            pi.versionName ?: "?"
        }.getOrDefault("?")

        view.findViewById<TextView>(R.id.about_version).text = "版本 $version"

        view.findViewById<TextView>(R.id.about_build).text = buildString {
            append("应用 ID     ").append(ctx.packageName).append('\n')
            append("版本号      ").append(version).append('\n')
            append("Android     ").append(Build.VERSION.RELEASE)
            append("（API ").append(Build.VERSION.SDK_INT).append("）\n")
            append("设备        ").append(Build.MANUFACTURER).append(' ').append(Build.MODEL).append('\n')
            append("构建类型    Debug（本地构建）")
        }
    }
}
