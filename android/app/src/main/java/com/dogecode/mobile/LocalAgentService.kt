package com.dogecode.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * 本地模式的前台保活服务。
 *
 * ## 它做什么 / 不做什么
 *
 * 只做一件事：**持有一条常驻通知**，使进程优先级提升为前台，
 * 本地推理循环（跑在 LocalAgentBackend 的工作线程）不被系统回收。
 *
 * 刻意**不做**：
 * - 不自己跑推理（推理归 LocalAgentBackend，UI 归 Activity ——
 *   Service 若持有业务状态，Activity 重建后状态分叉）
 * - 不监听事件流（MainActivity 的 startTurn/endTurn 已是回合边界
 *   的权威信号，Service 再监听一遍会出现第二个真相源）
 *
 * ## 生命周期
 *
 * MainActivity 在 startTurn/endTurn 里调 [start]/[stop]（见 ServicePolicy
 * 的判据说明）。Service 本身无状态：启动即 startForeground，销毁即结束。
 *
 * ## 兼容性约束
 *
 * minSdk 24；startForeground 在 API 24-25 需在 onCreate 5 秒内调用，
 * API 26+ 无此限制但我们立刻调用，故两个版本段都安全。
 */
class LocalAgentService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val text = intent?.getStringExtra(EXTRA_TEXT) ?: ServicePolicy.notifyText(true)
        startForeground(NOTIFICATION_ID, buildNotification(text))
        return START_NOT_STICKY
    }

    private fun buildNotification(text: String): android.app.Notification {
        val pi = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, ServicePolicy.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("doge-code 云端模式")
            .setContentText(text)
            .setOngoing(true)
            .setContentIntent(pi)
            .setSilent(true)    // 保活通知不打扰：它的作用是「存在」，不是「提醒」
            .build()
    }

    companion object {
        private const val NOTIFICATION_ID = 0xD06E   // 固定 id：服务存活期间始终是同一条
        private const val EXTRA_TEXT = "text"

        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val mgr = context.getSystemService(NotificationManager::class.java) ?: return
            if (mgr.getNotificationChannel(ServicePolicy.CHANNEL_ID) != null) return
            val ch = NotificationChannel(
                ServicePolicy.CHANNEL_ID,
                "本地任务保活",
                NotificationManager.IMPORTANCE_MIN,   // 最低级别：不弹横幅不响铃，只占一栏
            ).apply { description = "云端模式处理任务期间的常驻通知（防止任务被系统中断）" }
            mgr.createNotificationChannel(ch)
        }

        fun start(context: Context, inTurn: Boolean) {
            ensureChannel(context)
            val intent = Intent(context, LocalAgentService::class.java).apply {
                putExtra(EXTRA_TEXT, ServicePolicy.notifyText(inTurn))
            }
            androidx.core.content.ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, LocalAgentService::class.java))
        }
    }
}
