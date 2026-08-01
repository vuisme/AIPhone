package com.aiphone.agent

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.aiphone.agent.server.AgentHttpServer
import com.aiphone.agent.storage.AgentStore
import com.aiphone.agent.workflow.WorkflowExecutor
import com.aiphone.agent.accessibility.AccessibilityController
import com.aiphone.agent.root.CommandResult
import com.aiphone.agent.callback.CloudCallbackClient

class AutomationService : Service() {
    private var server: AgentHttpServer? = null
    private var callbackClient: CloudCallbackClient? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        createNotificationChannel()
        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("AIPhone Agent đang chạy")
            .setContentText("Studio cục bộ tại cổng 8765")
            .setOngoing(true)
            .setContentIntent(openIntent)
            .build()
        startForeground(NOTIFICATION_ID, notification)

        val store = AgentStore(this)
        val executor = WorkflowExecutor(
            store = store,
            ensureAccessibility = { AccessibilityController.ensureEnabled(this) },
            launchMainApp = ::launchMainPackage,
        )
        server = AgentHttpServer(this, store, executor).also { it.start() }
        callbackClient = CloudCallbackClient(this, store).also { it.start() }
    }

    fun acquireRunWakeLock() {
        if (wakeLock?.isHeld == true) return
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AIPhone:WorkflowRun").apply {
            acquire(6 * 60 * 60 * 1000L)
        }
    }

    fun releaseRunWakeLock() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
    }

    override fun onDestroy() {
        isRunning = false
        server?.stop()
        callbackClient?.stop()
        releaseRunWakeLock()
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_RESTART_CALLBACK) {
            callbackClient?.stop()
            callbackClient = CloudCallbackClient(this, AgentStore(this)).also { it.start() }
        }
        return START_STICKY
    }
    override fun onBind(intent: Intent?): IBinder? = null

    private fun launchMainPackage(packageName: String): CommandResult = runCatching {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            ?: return CommandResult(-1, "No launcher activity for $packageName".toByteArray())
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(launchIntent)
        CommandResult(0, "Launched $packageName as main user".toByteArray())
    }.getOrElse { CommandResult(-1, (it.message ?: it.javaClass.simpleName).toByteArray()) }

    private fun createNotificationChannel() {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "AIPhone automation", NotificationManager.IMPORTANCE_LOW),
        )
    }

    companion object {
        @Volatile var isRunning: Boolean = false
            private set
        private const val CHANNEL_ID = "aiphone_agent"
        private const val NOTIFICATION_ID = 1201
        const val ACTION_RESTART_CALLBACK = "com.aiphone.agent.RESTART_CALLBACK"
    }
}
