package com.aiphone.agent

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.aiphone.agent.accessibility.AccessibilityController
import com.aiphone.agent.root.RootGateway
import com.aiphone.agent.storage.AgentStore
import com.aiphone.agent.update.AppUpdater
import com.aiphone.agent.update.InteractiveInstallResult
import com.aiphone.agent.update.UpdateCheckResult
import kotlin.concurrent.thread

class MainActivity : Activity() {
    private lateinit var preferences: AgentPreferences
    private lateinit var serviceValue: TextView
    private lateinit var rootValue: TextView
    private lateinit var accessibilityValue: TextView
    private lateinit var serviceButton: Button
    private lateinit var stableButton: Button
    private lateinit var nightlyButton: Button
    private lateinit var updateButton: Button
    private lateinit var updateStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        preferences = AgentPreferences(this)
        window.statusBarColor = INK
        window.navigationBarColor = INK
        setContentView(buildContent())
        requestNotificationPermission()
        if (preferences.serviceEnabled) startAgentService()
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    private fun buildContent(): View {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(30), dp(20), dp(34))
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(INK, Color.rgb(13, 27, 23), Color.rgb(8, 14, 13)))
        }

        content.addView(label("AIPHONE / DEVICE AGENT", ACID, 11f, true).apply { letterSpacing = .18f })
        content.addView(label("Automation that stays\non the phone.", Color.WHITE, 34f, true).apply {
            setPadding(0, dp(8), 0, dp(8))
            typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
        })
        content.addView(label("${Build.MODEL}  •  Android ${Build.VERSION.RELEASE}  •  ${BuildConfig.VERSION_NAME}", MUTED, 12f, false).apply {
            setPadding(0, 0, 0, dp(22))
        })

        content.addView(card().apply {
            addView(sectionHeader("AGENT SERVICE", "Loopback API · port 8765"))
            serviceValue = statusValue("Đang kiểm tra...")
            addView(serviceValue)
            serviceButton = actionButton("Tắt Agent service", primary = true) { toggleService() }
            addView(serviceButton)
        })

        content.addView(sectionTitle("CAPABILITIES"))
        content.addView(card().apply {
            addView(statusLine("ROOT / KERNELSU").also { rootValue = it })
            addView(divider())
            addView(statusLine("UI INSPECTOR / ACCESSIBILITY").also { accessibilityValue = it })
            addView(actionButton("Mở cài đặt Trợ năng", primary = false) {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            })
            addView(actionButton("Kiểm tra lại quyền root", primary = false) { checkRoot() })
        })

        val pairingToken = AgentStore(this).accessToken()
        content.addView(sectionTitle("PAIRING"))
        content.addView(card().apply {
            addView(label("TOKEN CỦA THIẾT BỊ", MUTED, 10f, true).apply { letterSpacing = .12f })
            addView(label(pairingToken.chunked(4).joinToString("  "), SKY, 17f, true).apply {
                setPadding(0, dp(12), 0, dp(4))
                typeface = Typeface.MONOSPACE
                setTextIsSelectable(true)
            })
            addView(label("Token chỉ dùng cho thiết bị này và không được đưa vào workflow.", MUTED, 11f, false))
            addView(actionButton("Sao chép pairing token", primary = false) {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("AIPhone pairing token", pairingToken))
            })
        })

        content.addView(sectionTitle("RELEASE CHANNEL"))
        content.addView(card().apply {
            addView(label("Stable dành cho vận hành. Nightly nhận bản mới nhất để test trước.", MUTED, 12f, false))
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(12), 0, 0)
                stableButton = actionButton("Stable", primary = false) { setUpdateChannel(UpdateChannel.STABLE) }
                nightlyButton = actionButton("Nightly", primary = false) { setUpdateChannel(UpdateChannel.NIGHTLY) }
                addView(stableButton, LinearLayout.LayoutParams(0, dp(46), 1f).apply { marginEnd = dp(6) })
                addView(nightlyButton, LinearLayout.LayoutParams(0, dp(46), 1f).apply { marginStart = dp(6) })
            })
            updateStatus = label("Chưa kiểm tra bản cập nhật.", MUTED, 11f, false).apply { setPadding(0, dp(12), 0, 0) }
            addView(updateStatus)
            updateButton = actionButton("Kiểm tra bản cập nhật", primary = true, action = ::checkForUpdate)
            addView(updateButton)
        })

        content.addView(actionButton("Mở Studio trên điện thoại", primary = true) {
            if (!AutomationService.isRunning) startAgentService()
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("http://127.0.0.1:8765")))
        }.apply { setPadding(dp(16), 0, dp(16), 0) })

        return ScrollView(this).apply {
            isFillViewport = true
            addView(content, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
    }

    private fun refreshStatus() {
        val running = AutomationService.isRunning
        serviceValue.text = if (running) "ONLINE · API sẵn sàng" else "OFFLINE · workflow không nhận lệnh"
        serviceValue.setTextColor(if (running) ACID else DANGER)
        serviceButton.text = if (running) "Tắt Agent service" else "Bật Agent service"
        serviceButton.background = buttonBackground(if (running) DANGER else ACID, if (running) Color.WHITE else INK)

        val rooted = RootGateway.isRootGranted()
        rootValue.text = if (rooted) "ĐÃ CẤP · image + XSpace + silent update" else "KHÔNG ROOT · chế độ Accessibility giới hạn"
        rootValue.setTextColor(if (rooted) ACID else AMBER)
        val accessibilityEnabled = AccessibilityController.isEnabled(this)
        accessibilityValue.text = when {
            AccessibilityController.isReady() -> "READY · text/tap/swipe khả dụng"
            accessibilityEnabled -> "ĐÃ BẬT · đang chờ service kết nối"
            else -> "CHƯA BẬT · cần mở Trợ năng"
        }
        accessibilityValue.setTextColor(if (accessibilityEnabled) SKY else AMBER)
        refreshChannelButtons()
    }

    private fun toggleService() {
        if (AutomationService.isRunning) {
            preferences.serviceEnabled = false
            stopService(Intent(this, AutomationService::class.java))
        } else {
            preferences.serviceEnabled = true
            startAgentService()
        }
        serviceButton.postDelayed(::refreshStatus, 250)
    }

    private fun startAgentService() {
        ContextCompat.startForegroundService(this, Intent(this, AutomationService::class.java))
    }

    private fun checkRoot() {
        rootValue.text = "Đang yêu cầu KernelSU..."
        rootValue.setTextColor(AMBER)
        thread {
            RootGateway.invalidateRootState()
            RootGateway.isRootGranted()
            runOnUiThread(::refreshStatus)
        }
    }

    private fun setUpdateChannel(channel: UpdateChannel) {
        preferences.updateChannel = channel
        updateStatus.text = "Đã chọn kênh ${channel.name.lowercase()}."
        updateStatus.setTextColor(MUTED)
        refreshChannelButtons()
    }

    private fun checkForUpdate() {
        updateButton.isEnabled = false
        setUpdateStatus("Đang kết nối GitHub Releases...", SKY)
        val updater = AppUpdater(applicationContext)
        val channel = preferences.updateChannel
        thread(name = "AIPhone-Update-Check") {
            val result = runCatching {
                updater.check(channel, BuildConfig.VERSION_CODE.toLong()) { message -> postUi { setUpdateStatus(message, SKY) } }
            }
            postUi {
                result.fold(
                    onSuccess = { handleUpdateResult(updater, it) },
                    onFailure = {
                        setUpdateStatus("Không thể cập nhật: ${it.message ?: it.javaClass.simpleName}", DANGER)
                        updateButton.isEnabled = true
                    },
                )
            }
        }
    }

    private fun handleUpdateResult(updater: AppUpdater, result: UpdateCheckResult) {
        when (result) {
            is UpdateCheckResult.Current -> {
                setUpdateStatus(result.message, ACID)
                updateButton.isEnabled = true
            }
            is UpdateCheckResult.Ready -> {
                setUpdateStatus("Đã xác minh ${result.candidate.displayName} · vc${result.candidate.versionCode}. Đang mở trình cài đặt...", ACID)
                if (RootGateway.isRootGranted()) {
                    thread(name = "AIPhone-Root-Install") {
                        val install = runCatching { updater.installWithRoot(result.apkFile) }
                        postUi {
                            install.fold(
                                onSuccess = { setUpdateStatus("Cài đặt thành công. Agent sẽ khởi động lại.", ACID) },
                                onFailure = {
                                    setUpdateStatus("Cài đặt root thất bại: ${it.message ?: it.javaClass.simpleName}", DANGER)
                                    updateButton.isEnabled = true
                                },
                            )
                        }
                    }
                } else {
                    when (updater.launchInteractiveInstall(this, result.apkFile)) {
                        InteractiveInstallResult.Launched -> setUpdateStatus("Xác nhận cập nhật trong trình cài đặt Android.", AMBER)
                        InteractiveInstallResult.PermissionRequired -> setUpdateStatus("Hãy bật quyền cài ứng dụng không rõ nguồn, rồi bấm kiểm tra lại.", AMBER)
                    }
                    updateButton.isEnabled = true
                }
            }
        }
    }

    private fun setUpdateStatus(message: String, color: Int) {
        updateStatus.text = message
        updateStatus.setTextColor(color)
    }

    private fun postUi(action: () -> Unit) {
        if (!isDestroyed) runOnUiThread { if (!isDestroyed) action() }
    }

    private fun refreshChannelButtons() {
        val channel = preferences.updateChannel
        stableButton.background = buttonBackground(if (channel == UpdateChannel.STABLE) ACID else PANEL_LIGHT, if (channel == UpdateChannel.STABLE) INK else Color.WHITE)
        nightlyButton.background = buttonBackground(if (channel == UpdateChannel.NIGHTLY) SKY else PANEL_LIGHT, if (channel == UpdateChannel.NIGHTLY) INK else Color.WHITE)
    }

    private fun card() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(18), dp(18), dp(18), dp(18))
        background = rounded(PANEL, 18f, Color.rgb(48, 65, 59))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(12) }
    }

    private fun sectionHeader(title: String, subtitle: String) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        addView(label(title, Color.WHITE, 13f, true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addView(label(subtitle, MUTED, 10f, false))
    }

    private fun sectionTitle(title: String) = label(title, MUTED, 10f, true).apply {
        letterSpacing = .16f
        setPadding(dp(2), dp(14), 0, dp(9))
    }

    private fun statusValue(initial: String) = label(initial, ACID, 20f, true).apply { setPadding(0, dp(12), 0, dp(12)) }

    private fun statusLine(title: String) = label("$title\nĐang kiểm tra...", Color.WHITE, 12f, true).apply {
        setLineSpacing(dp(4).toFloat(), 1f)
        setPadding(0, dp(4), 0, dp(4))
    }

    private fun divider() = View(this).apply {
        setBackgroundColor(Color.rgb(49, 64, 59))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1).apply { setMargins(0, dp(12), 0, dp(12)) }
    }

    private fun label(value: String, color: Int, size: Float, bold: Boolean) = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(color)
        typeface = Typeface.create("sans-serif", if (bold) Typeface.BOLD else Typeface.NORMAL)
    }

    private fun actionButton(label: String, primary: Boolean, action: () -> Unit) = Button(this).apply {
        text = label
        textSize = 13f
        isAllCaps = false
        setTextColor(if (primary) INK else Color.WHITE)
        typeface = Typeface.create("sans-serif", Typeface.BOLD)
        background = buttonBackground(if (primary) ACID else PANEL_LIGHT, if (primary) INK else Color.WHITE)
        stateListAnimator = null
        setOnClickListener { action() }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)).apply { topMargin = dp(12) }
    }

    private fun buttonBackground(color: Int, @Suppress("UNUSED_PARAMETER") textColor: Int) = rounded(color, 13f, Color.TRANSPARENT)

    private fun rounded(fill: Int, radius: Float, stroke: Int) = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(fill)
        cornerRadius = dp(radius.toInt()).toFloat()
        if (stroke != Color.TRANSPARENT) setStroke(dp(1), stroke)
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 100)
        }
    }

    companion object {
        private val INK = Color.rgb(7, 13, 12)
        private val PANEL = Color.rgb(17, 29, 26)
        private val PANEL_LIGHT = Color.rgb(30, 45, 40)
        private val ACID = Color.rgb(220, 247, 99)
        private val SKY = Color.rgb(115, 215, 255)
        private val AMBER = Color.rgb(255, 211, 138)
        private val DANGER = Color.rgb(221, 89, 70)
        private val MUTED = Color.rgb(135, 154, 147)
    }
}
