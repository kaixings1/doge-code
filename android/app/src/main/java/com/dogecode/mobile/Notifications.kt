package com.dogecode.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
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
    /** 「需要介入」渠道：与回复通知分开，用户可单独静音回复但不漏掉阻塞等待。 */
    private const val ACTION_CHANNEL_ID = "doge_action"
    private const val MAX_TEXT = 300    // 通知栏过长会被截断且无意义

    /** PendingIntent requestCode 基线，避开与其它待处理意图冲突。 */
    private const val REQ_APPROVE = 0x1000
    private const val REQ_DENY = 0x2000

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
    fun notifyAssistant(
        context: Context,
        text: String,
        label: String? = null,
        /** 是否静音（由「通知声音」偏好决定）。 */
        silent: Boolean = false,
    ) {
        // 无权限时 hasPermission 返回 false（API 33+），此时直接跳过
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission("android.permission.POST_NOTIFICATIONS") !=
            android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        // 仅 WiFi 偏好开启且当前不在 WiFi 下 → 直接跳过（省流量 + 隐私）
        if (!NetworkPolicy.allowNotification(
                LocalPrefs(context).getBool(LocalPrefs.KEY_NOTIFY_WIFI_ONLY),
                isWifi(context),
            )
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
            .setSilent(silent)
            .build()

        // id 用时间戳，多条回复不会互相覆盖
        runCatching { NotificationManagerCompat.from(context).notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), n) }
    }

    /**
     * 「需要你介入」通知：AI 请求执行需授权的操作。
     *
     * 与 [notifyAssistant] 分开、且用高优先级渠道的原因：这条通知的性质
     * 完全不同 —— 助手回复是「结果」，用户晚点看没关系；权限请求是
     * 「**阻塞中的等待**」，AI 此刻正卡着不动，用户不处理就永远不推进。
     * 因此值得打断（IMPORTANCE_HIGH），也值得单独一个渠道让用户能区别对待。
     */
    fun notifyPermission(
        context: Context,
        requestId: String,
        toolName: String,
        description: String,
        label: String? = null,
        /** 是否静音（由「通知声音」偏好决定）。 */
        silent: Boolean = false,
    ) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission("android.permission.POST_NOTIFICATIONS") !=
            android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        // 仅 WiFi 偏好开启且当前不在 WiFi 下 → 直接跳过（省流量 + 隐私）
        if (!NetworkPolicy.allowNotification(
                LocalPrefs(context).getBool(LocalPrefs.KEY_NOTIFY_WIFI_ONLY),
                isWifi(context),
            )
        ) {
            return
        }

        ensureActionChannel(context)

        val notificationId = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            action = PermissionActionReceiver.ACTION_FLUSH_PERMISSION
        }
        val pi = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val body = if (description.isBlank()) toolName else "$toolName：$description"
        val title = if (label.isNullOrBlank()) "需要批准" else "需要批准 · $label"

        // 「批准 / 拒绝」直接放在通知栏：AI 此刻正**阻塞等待**，
        // 若只能点开 App 再操作，用户在做别的事时就容易漏掉。
        // PendingIntent 的 requestCode 必须按 requestId+行为区分，
        // 否则多条请求的按钮会互相覆盖（都指向同一个 Intent）。
        val approvePi = decisionIntent(context, requestId, "allow", notificationId, REQ_APPROVE)
        val denyPi = decisionIntent(context, requestId, "deny", notificationId, REQ_DENY)

        val n = NotificationCompat.Builder(context, ACTION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .addAction(0, "批准", approvePi)
            .addAction(0, "拒绝", denyPi)
            .setSilent(silent)
            .build()

        runCatching { NotificationManagerCompat.from(context).notify(notificationId, n) }
    }

    /**
     * 构造通知按钮的 PendingIntent。
     *
     * requestCode 用「requestId 的哈希 + 行为偏移」而不是常量：
     * 不同权限请求的通知会同时存在，若 requestCode 相同，
     * Android 会把后一个 PendingIntent 复用前一个的 extras ——
     * 点「批准」实际批准的是另一条请求，是危险的静默错配。
     */
    private fun decisionIntent(
        context: Context,
        requestId: String,
        behavior: String,
        notificationId: Int,
        base: Int,
    ): PendingIntent {
        val intent = Intent(context, PermissionActionReceiver::class.java).apply {
            action = PermissionActionReceiver.ACTION_PERMISSION_DECISION
            putExtra(PermissionActionReceiver.EXTRA_REQUEST_ID, requestId)
            putExtra(PermissionActionReceiver.EXTRA_BEHAVIOR, behavior)
            putExtra(PermissionActionReceiver.EXTRA_NOTIFICATION_ID, notificationId)
        }
        val requestCode = base + (requestId.hashCode() and 0x0FFF)
        return PendingIntent.getBroadcast(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /**
     * 高优先级渠道，专门用于「需要介入」类通知。
     *
     * 与 [ensureChannel] 分开是刻意的：用户可以单独把「助手回复」静音
     * 而不影响「需要批准」—— 前者是可选提醒，后者是阻塞等待的通知。
     * 合成一个渠道会让用户被迫二选一。
     */
    private fun ensureActionChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = context.getSystemService(NotificationManager::class.java) ?: return
        if (mgr.getNotificationChannel(ACTION_CHANNEL_ID) != null) return
        val ch = NotificationChannel(
            ACTION_CHANNEL_ID,
            "需要介入",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply { description = "AI 请求批准操作、或向你提问时提醒" }
        mgr.createNotificationChannel(ch)
    }

    /**
     * 当前是否处于 WiFi 网络。
     *
     * 用 [NetworkCapabilities.TRANSPORT_WIFI] 判断（API 21+ 通用写法）。
     * 无网络权限 / 旧 API / 拿不到管理器时回落为 **true**（不当作
     * 移动数据）—— 宁可多推一条也不因判定失败而漏推，避免「开了仅 WiFi
     * 结果一条都收不到」的静默故障。注意：本 App 已声明 ACCESS_NETWORK_STATE。
     */
    private fun isWifi(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return true
        val net = cm.activeNetwork ?: return true
        val caps = cm.getNetworkCapabilities(net) ?: return true
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
    }
}
