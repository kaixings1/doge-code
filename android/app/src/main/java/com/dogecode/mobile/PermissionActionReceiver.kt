package com.dogecode.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * 通知栏「批准 / 拒绝」按钮的接收器。
 *
 * 存在理由：AI 请求权限时用户可能没盯着 App。若通知里只能「点开进 App 再批准」，
 * 那么用户在锁屏或做别的事时，要么被打断去开 App，要么干脆漏掉 ——
 * AI 就一直卡着。直接在通知栏操作是关键路径上的省事设计。
 *
 * 设计要点：
 *
 * 1. **不在 Receiver 里直接发 WebSocket**。Receiver 是短生命周期组件，
 *    Activity 可能已被系统回收重建（此时 `client` 是新建的空连接）。
 *    正确做法是把决定交给 Activity（通过静态 pending 缓冲），
 *    连接就绪后由 Activity 发出。
 *
 * 2. **决定必须先落盘**。用 [PermissionDecisionStore] 持久化，
 *    这样即使用户在通知栏点了批准、App 随后被杀死，下次启动连接后
 *    仍能把决定补发出去 —— 否则那个权限请求会永久悬挂在服务端。
 *
 * 3. **点按钮即撤销通知**。`setAutoCancel` 对 Action 按钮不完全生效，
 *    需显式 cancel，否则通知栏残留一条已处理的请求，用户会重复点击。
 */
class PermissionActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val requestId = intent.getStringExtra(EXTRA_REQUEST_ID)
        val behavior = intent.getStringExtra(EXTRA_BEHAVIOR)
        if (requestId.isNullOrBlank() || behavior.isNullOrBlank()) {
            Log.w(TAG, "收到缺参数的权限操作广播，忽略")
            return
        }

        Log.i(TAG, "通知栏决定: $behavior requestId=$requestId")

        // 1) 落盘，保证 App 被杀也不丢决定
        PermissionDecisionStore.enqueue(context, requestId, behavior, "通知栏操作")

        // 2) 撤销通知（避免残留 + 重复点击）
        val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, -1)
        if (notificationId != -1) {
            runCatching {
                androidx.core.app.NotificationManagerCompat.from(context).cancel(notificationId)
            }
        }

        // 3) 尝试唤醒 Activity 立即发送（已在运行则走 onNewIntent）
        runCatching {
            val i = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_NEW_TASK
                action = ACTION_FLUSH_PERMISSION
            }
            context.startActivity(i)
        }.onFailure {
            // 后台启动 Activity 在 Android 10+ 受限，失败是正常的 ——
            // 决定已落盘，用户下次打开 App 时会自动补发
            Log.i(TAG, "无法自动拉起界面（后台限制），决定已排队待补发")
        }
    }

    companion object {
        private const val TAG = "PermActionReceiver"

        const val ACTION_PERMISSION_DECISION = "com.dogecode.mobile.PERMISSION_DECISION"
        /** 通知点击后携带的动作：让 Activity 立刻冲刷待发决定。 */
        const val ACTION_FLUSH_PERMISSION = "com.dogecode.mobile.FLUSH_PERMISSION"

        const val EXTRA_REQUEST_ID = "requestId"
        const val EXTRA_BEHAVIOR = "behavior"
        const val EXTRA_NOTIFICATION_ID = "notificationId"
    }
}
