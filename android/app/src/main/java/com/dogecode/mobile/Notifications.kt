package com.dogecode.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * 助手回复的系统通知。
 *
 * Android 13+ 需要 POST_NOTIFICATIONS 运行时权限；未授权时静默跳过
 * （消息本身在界面里能看到，通知只是「不在前台时的提醒」这一锦上添花）。
 * 每次通知用不同 id，避免互相覆盖。
 */
object Notifications {

    private const val CHANNEL_ID = "doge_reply"
    private const val MAX_TEXT = 300    // 通知栏过长会被截断且无意义

    /** 创建一个通知渠道（Android 8+ 必需）。应用启动时调一次即可，重复安全。 */
    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = context.getSystemService(NotificationManager::class.java) ?: return
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        val ch = NotificationChannel(
            CHANNEL_ID,
            "助手回复",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply { description = "doge-code 助手回复的提醒" }
        mgr.createNotificationChannel(ch)
    }

    /**
     * @param label 会话标签（如 DOGE_SESSION_LABEL 或目录名）。多会话并存时
     *   通知栏里必须能区分来源，否则用户不知道是哪条对话的回复。
     *   未知时传 null，标题退回为 "doge-code"。
     */
    fun notifyAssistant(context: Context, text: String, label: String? = null) {
        // 无权限时 hasPermission 返回 false（API 33+），此时直接跳过
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission("android.permission.POST_NOTIFICATIONS") !=
            android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        ensureChannel(context)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val body = if (text.length > MAX_TEXT) text.take(MAX_TEXT) + "…" else text
        val title = if (label.isNullOrBlank()) "doge-code" else "doge-code · $label"
        val n = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()

        // id 用时间戳，多条回复不会互相覆盖
        runCatching { NotificationManagerCompat.from(context).notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), n) }
    }
}
