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
import com.aiphone.agent.workflow.AndroidTtsGateway
import com.aiphone.agent.accessibility.AccessibilityController
import com.aiphone.agent.root.CommandResult
import com.aiphone.agent.callback.CallbackStatus
import com.aiphone.agent.callback.CloudCallbackClient

class AutomationService : Service() {
    private var server: AgentHttpServer? = null
    private var callbackClient: CloudCallbackClient? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var preferences: AgentPreferences

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        preferences = AgentPreferences(this)
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification(CloudCallbackClient.status))

        val store = AgentStore(this)
        val ttsGateway = AndroidTtsGateway(this)
        val executor = WorkflowExecutor(
            store = store,
            ttsGateway = ttsGateway,
            ensureAccessibility = { AccessibilityController.ensureEnabled(this) },
            launchMainApp = ::launchMainPackage,
        )
        server = AgentHttpServer(this, store, executor, ttsGateway).also { it.start() }
        callbackClient = startCallbackClient(store)
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
        when (intent?.action) {
            ACTION_STOP_SERVICE -> {
                preferences.serviceEnabled = false
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_RESTART_CALLBACK -> {
                callbackClient?.stop()
                callbackClient = startCallbackClient(AgentStore(this))
            }
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

    private fun startCallbackClient(store: AgentStore): CloudCallbackClient? = runCatching {
        CloudCallbackClient(this, store, ::updateNotification).also { it.start() }
    }.getOrElse { error ->
        val status = CloudCallbackClient.reportServiceFailure(
            "Không thể khởi tạo Cloud: ${error.message ?: error.javaClass.simpleName}",
        )
        updateNotification(status)
        null
    }

    private fun updateNotification(callbackStatus: CallbackStatus) {
        runCatching {
            val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(NOTIFICATION_ID, buildNotification(callbackStatus))
        }
    }

    private fun buildNotification(callbackStatus: CallbackStatus): android.app.Notification {
        val presentation = AgentNotificationPresentation.from(preferences.connectionMode, callbackStatus)
        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stopIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, AutomationService::class.java).setAction(ACTION_STOP_SERVICE),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(presentation.title)
            .setContentText(presentation.text)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setSubText("AI Phone Automation System")
            .setContentIntent(openIntent)
            .addAction(R.drawable.ic_notification, "Dừng Agent", stopIntent)
            .build()
    }

    companion object {
        @Volatile var isRunning: Boolean = false
            private set
        private const val CHANNEL_ID = "aiphone_agent"
        private const val NOTIFICATION_ID = 1201
        const val ACTION_RESTART_CALLBACK = "com.aiphone.agent.RESTART_CALLBACK"
        const val ACTION_STOP_SERVICE = "com.aiphone.agent.STOP_SERVICE"
    }
}
