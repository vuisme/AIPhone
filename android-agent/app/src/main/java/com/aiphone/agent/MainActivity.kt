package com.aiphone.agent

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.aiphone.agent.accessibility.AccessibilityController
import com.aiphone.agent.callback.CallbackEndpoint
import com.aiphone.agent.callback.CallbackState
import com.aiphone.agent.callback.CloudCallbackClient
import com.aiphone.agent.root.RootGateway
import com.aiphone.agent.storage.AgentStore
import com.aiphone.agent.update.AppUpdater
import com.aiphone.agent.update.InteractiveInstallResult
import com.aiphone.agent.update.UpdateCheckResult
import com.aiphone.agent.workflow.AndroidRuntimeCapabilityGateway
import com.aiphone.agent.workflow.AndroidTtsGateway
import org.json.JSONObject
import java.util.Locale
import kotlin.concurrent.thread

class MainActivity : Activity() {
    private enum class AppTab { DASHBOARD, WORKFLOWS, SETTINGS }

    private lateinit var preferences: AgentPreferences
    private lateinit var store: AgentStore
    private lateinit var rootView: LinearLayout
    private lateinit var contentHost: FrameLayout
    private val tabButtons = linkedMapOf<AppTab, Button>()
    private val refreshHandler = Handler(Looper.getMainLooper())
    private var secretRevealGeneration = 0

    private var dashboardServiceValue: TextView? = null
    private var dashboardConnectionValue: TextView? = null
    private var dashboardRootValue: TextView? = null
    private var dashboardAccessibilityValue: TextView? = null
    private var dashboardWorkflowValue: TextView? = null
    private var dashboardAiValue: TextView? = null
    private var workflowList: LinearLayout? = null
    private var workflowCountValue: TextView? = null
    private var settingsServiceValue: TextView? = null
    private var settingsRootValue: TextView? = null
    private var settingsAccessibilityValue: TextView? = null
    private var serviceButton: Button? = null
    private var connectionModeValue: TextView? = null
    private var cloudModeButton: Button? = null
    private var adbModeButton: Button? = null
    private var cloudModeContainer: LinearLayout? = null
    private var adbModeContainer: LinearLayout? = null
    private var callbackAccountValue: TextView? = null
    private var callbackStatusValue: TextView? = null
    private var cloudReconnectButton: Button? = null
    private var callbackConfigToggle: Button? = null
    private var callbackConfigContainer: LinearLayout? = null
    private var callbackUrlInput: EditText? = null
    private var callbackPairingCard: LinearLayout? = null
    private var callbackPairingHintValue: TextView? = null
    private var callbackPairingButton: Button? = null
    private var callbackCodeValue: TextView? = null
    private var callbackCodeCopyButton: Button? = null
    private var pairingTokenValue: TextView? = null
    private var pairingTokenCopyButton: Button? = null
    private var stableButton: Button? = null
    private var nightlyButton: Button? = null
    private var updateButton: Button? = null
    private var updateStatus: TextView? = null
    private var connectionNotice: Pair<String, Int>? = null
    private var connectionNoticeGeneration = 0
    private var runtimeCapabilityGeneration = 0
    private val runtimeCapabilityGateway by lazy { AndroidRuntimeCapabilityGateway(this, AndroidTtsGateway(this)) }

    private val statusRefresh = object : Runnable {
        override fun run() {
            refreshStatus()
            refreshHandler.postDelayed(this, 1_000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        preferences = AgentPreferences(this)
        store = AgentStore(this)
        window.setDecorFitsSystemWindows(false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        rootView = buildAppShell()
        rootView.setOnApplyWindowInsetsListener { view, insets ->
            val systemBars = insets.getInsets(WindowInsets.Type.systemBars())
            val keyboard = insets.getInsets(WindowInsets.Type.ime())
            view.setPadding(
                systemBars.left,
                systemBars.top,
                systemBars.right,
                maxOf(systemBars.bottom, keyboard.bottom),
            )
            insets
        }
        setContentView(rootView)
        rootView.requestApplyInsets()
        showTab(AppTab.DASHBOARD)
        requestNotificationPermission()
        if (preferences.serviceEnabled) startAgentService()
    }

    override fun onResume() {
        super.onResume()
        refreshHandler.removeCallbacks(statusRefresh)
        refreshStatus()
        refreshHandler.postDelayed(statusRefresh, 1_000)
    }

    override fun onPause() {
        refreshHandler.removeCallbacks(statusRefresh)
        hideSecrets()
        super.onPause()
    }

    private fun buildAppShell(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(INK, Color.rgb(13, 27, 23), Color.rgb(8, 14, 13)))
        addView(buildHeader())
        addView(buildTabBar())
        contentHost = FrameLayout(context).apply { id = View.generateViewId() }
        addView(contentHost, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    }

    private fun buildHeader(): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(18), dp(12), dp(18), dp(10))
        addView(ImageView(context).apply {
            setImageResource(R.drawable.ic_brand_mark)
            setPadding(dp(9), dp(9), dp(9), dp(9))
            contentDescription = "AI Phone"
            background = rounded(PANEL_LIGHT, 13f, Color.rgb(61, 83, 75))
        }, LinearLayout.LayoutParams(dp(44), dp(44)))
        addView(LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), 0, 0, 0)
            addView(label("AI PHONE", ACID, 10f, true).apply { letterSpacing = .18f })
            addView(label("Device Agent", Color.WHITE, 21f, true).apply { typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD) })
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addView(label("vc${BuildConfig.VERSION_CODE}", MUTED, 10f, true).apply {
            setPadding(dp(9), dp(6), dp(9), dp(6))
            background = rounded(PANEL_LIGHT, 10f, Color.rgb(51, 70, 64))
        })
    }

    private fun buildTabBar(): View = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(dp(14), dp(4), dp(14), dp(10))
        addTabButton("Dashboard", AppTab.DASHBOARD)
        addTabButton("Workflows", AppTab.WORKFLOWS)
        addTabButton("Cài đặt", AppTab.SETTINGS)
    }

    private fun LinearLayout.addTabButton(title: String, tab: AppTab) {
        val button = Button(context).apply {
            text = title
            isAllCaps = false
            textSize = 11f
            typeface = Typeface.create("sans-serif", Typeface.BOLD)
            stateListAnimator = null
            setPadding(dp(5), 0, dp(5), 0)
            setOnClickListener { showTab(tab) }
        }
        tabButtons[tab] = button
        addView(button, LinearLayout.LayoutParams(0, dp(42), 1f).apply {
            marginStart = dp(3)
            marginEnd = dp(3)
        })
    }

    private fun showTab(tab: AppTab) {
        hideSecrets()
        clearPageReferences()
        tabButtons.forEach { (candidate, button) ->
            val active = candidate == tab
            button.setTextColor(if (active) INK else MUTED)
            button.background = rounded(if (active) ACID else PANEL, 12f, if (active) Color.TRANSPARENT else Color.rgb(42, 58, 53))
        }
        val page = when (tab) {
            AppTab.DASHBOARD -> buildDashboardPage()
            AppTab.WORKFLOWS -> buildWorkflowsPage()
            AppTab.SETTINGS -> buildSettingsPage()
        }
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            addView(page, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        contentHost.removeAllViews()
        contentHost.addView(scroll, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        refreshStatus()
    }

    private fun buildDashboardPage(): View = scrollPage().apply {
        addView(pageHeading("DASHBOARD", "Trạng thái tổng hợp", "Agent, kết nối Studio và khả năng thao tác trên máy."))
        addView(card().apply {
            addView(sectionHeader("AI PHONE AGENT", Build.MODEL))
            dashboardServiceValue = statusValue("Đang kiểm tra...")
            addView(dashboardServiceValue)
            addView(divider())
            dashboardConnectionValue = statusRow("KẾT NỐI STUDIO")
            addView(dashboardConnectionValue)
            dashboardWorkflowValue = statusRow("WORKFLOWS ĐÃ ĐỒNG BỘ")
            addView(dashboardWorkflowValue)
        })
        addView(sectionTitle("DEVICE READINESS"))
        addView(card().apply {
            dashboardRootValue = statusRow("ROOT / KERNELSU")
            addView(dashboardRootValue)
            addView(divider())
            dashboardAccessibilityValue = statusRow("UI INSPECTOR")
            addView(dashboardAccessibilityValue)
        })
        addView(sectionTitle("VOICE & AI RUNTIME"))
        addView(card().apply {
            dashboardAiValue = statusRow("VOICE / AI RUNTIME")
            addView(dashboardAiValue)
            addView(actionButton("Quét lại Voice / AI", primary = false, action = ::refreshRuntimeCapabilities))
        })
        addView(label("AI PHONE AUTOMATION SYSTEM", MUTED, 9f, true).apply {
            gravity = Gravity.CENTER
            letterSpacing = .16f
            setPadding(0, dp(16), 0, dp(8))
        })
        addView(label("Device Runtime · vc${BuildConfig.VERSION_CODE}", Color.rgb(78, 101, 93), 9f, false).apply {
            gravity = Gravity.CENTER
        })
        refreshRuntimeCapabilities()
    }

    private fun refreshRuntimeCapabilities() {
        val generation = ++runtimeCapabilityGeneration
        dashboardAiValue?.apply {
            text = "VOICE / AI RUNTIME\nĐang quét TTS engines, voice models và AI services..."
            setTextColor(SKY)
        }
        thread(name = "AIPhone-CapabilityScan", isDaemon = true) {
            val result = runCatching { runtimeCapabilityGateway.capabilities(forceRefresh = true) }
            runOnUiThread {
                if (generation != runtimeCapabilityGeneration) return@runOnUiThread
                result.onSuccess { capabilities ->
                    val engines = capabilities.tts.engines
                    val voices = engines.sumOf { it.voices.size }
                    val languages = engines.flatMap { engine -> engine.voices.map { it.languageTag } }.distinct().sorted()
                    val serviceSummary = capabilities.aiServices.groupingBy { it.type }.eachCount()
                    val details = buildList {
                        add("${engines.size} TTS engine · $voices voice model · ${languages.size} ngôn ngữ")
                        if (engines.isNotEmpty()) add(engines.joinToString(" · ") { "${it.label} (${it.voices.size})" })
                        if (languages.isNotEmpty()) add("LANG · ${languages.take(8).joinToString(", ") { tag -> "${Locale.forLanguageTag(tag).getDisplayName(Locale.getDefault())} ($tag)" }}${if (languages.size > 8) "…" else ""}")
                        add("Speech recognition · ${serviceSummary["SPEECH_RECOGNITION"] ?: 0} service")
                        add("Text classifier · ${serviceSummary["TEXT_CLASSIFIER"] ?: 0} service")
                        if (capabilities.aiServices.isNotEmpty()) add("SERVICES · ${capabilities.aiServices.joinToString(" · ") { it.label }}")
                        if (capabilities.warnings.isNotEmpty()) add("WARN · ${capabilities.warnings.joinToString(" · ")}")
                    }
                    dashboardAiValue?.apply { text = "VOICE / AI RUNTIME\n${details.joinToString("\n")}"; setTextColor(if (capabilities.tts.available) ACID else AMBER) }
                }.onFailure { error ->
                    dashboardAiValue?.apply {
                        text = "VOICE / AI RUNTIME\nKhông thể đọc capability\n${error.message ?: error.javaClass.simpleName}"
                        setTextColor(DANGER)
                    }
                }
            }
        }
    }

    private fun buildWorkflowsPage(): View = scrollPage().apply {
        addView(pageHeading("WORKFLOWS", "Kịch bản trên thiết bị", "Danh sách phiên bản đã được Studio đồng bộ xuống máy."))
        workflowCountValue = label("Đang đọc kho workflow...", MUTED, 11f, false).apply { setPadding(dp(2), 0, 0, dp(10)) }
        addView(workflowCountValue)
        workflowList = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        addView(workflowList)
        addView(actionButton("Làm mới danh sách", primary = false) { refreshWorkflowList() })
        refreshWorkflowList()
    }

    private fun buildSettingsPage(): View = scrollPage().apply {
        addView(pageHeading("SETTINGS", "Cài đặt thông minh", "Thông tin nhạy cảm được ẩn và chỉ hiện tạm thời khi bạn yêu cầu."))

        addView(card().apply {
            addView(sectionHeader("AGENT SERVICE", "Chạy nền trên thiết bị"))
            settingsServiceValue = statusValue("Đang kiểm tra...")
            addView(settingsServiceValue)
            serviceButton = actionButton("Bật Agent service", primary = true, action = ::toggleService)
            addView(serviceButton)
        })

        addView(sectionTitle("CONNECTION MODE"))
        addView(card().apply {
            addView(label("TRANSPORT", MUTED, 9f, true).apply { letterSpacing = .13f })
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(10), 0, 0)
                cloudModeButton = actionButton("Cloud", primary = false) { setConnectionMode(ConnectionMode.CLOUD) }
                adbModeButton = actionButton("ADB / USB", primary = false) { setConnectionMode(ConnectionMode.ADB) }
                addView(cloudModeButton, LinearLayout.LayoutParams(0, dp(46), 1f).apply { marginEnd = dp(6) })
                addView(adbModeButton, LinearLayout.LayoutParams(0, dp(46), 1f).apply { marginStart = dp(6) })
            })
            connectionModeValue = label("Đang kiểm tra transport...", MUTED, 11f, false).apply { setPadding(0, dp(12), 0, 0) }
            addView(connectionModeValue)

            cloudModeContainer = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(0, dp(15), 0, 0)
                addView(divider())
                addView(label("TÀI KHOẢN STUDIO", MUTED, 9f, true).apply { letterSpacing = .13f })
                callbackAccountValue = label("Chưa liên kết", Color.WHITE, 18f, true).apply { setPadding(0, dp(8), 0, 0) }
                addView(callbackAccountValue)
                callbackStatusValue = label("Đang kiểm tra Cloud...", MUTED, 11f, false).apply { setPadding(0, dp(7), 0, 0) }
                addView(callbackStatusValue)
                callbackPairingCard = buildCallbackPairingCard()
                addView(callbackPairingCard)
                callbackConfigContainer = LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    visibility = View.GONE
                    setPadding(0, dp(12), 0, 0)
                    addView(label("ĐỊA CHỈ STUDIO", MUTED, 9f, true).apply { letterSpacing = .12f })
                    callbackUrlInput = EditText(context).apply {
                        hint = "https://studio.example.com"
                        setText(preferences.callbackUrl)
                        setTextColor(Color.WHITE)
                        setHintTextColor(MUTED)
                        textSize = 13f
                        isSingleLine = true
                        setPadding(dp(13), 0, dp(13), 0)
                        background = rounded(PANEL_LIGHT, 12f, Color.rgb(48, 65, 59))
                    }
                    addView(callbackUrlInput, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)).apply { topMargin = dp(8) })
                }
                addView(callbackConfigContainer)
                callbackConfigToggle = actionButton("Cấu hình Cloud", primary = false, action = ::toggleCallbackConfiguration)
                addView(callbackConfigToggle)
                cloudReconnectButton = actionButton("Kết nối lại Cloud", primary = true, action = ::reconnectCloud)
                addView(cloudReconnectButton)
            }
            addView(cloudModeContainer)
        })

        adbModeContainer = card().apply {
            addView(label("USB / LOCAL TOKEN", MUTED, 9f, true).apply { letterSpacing = .13f })
            addView(label("Dùng token này khi ghép máy với Studio qua ADB/USB. Token luôn được ẩn ngoài chế độ ADB.", MUTED, 11f, false).apply { setPadding(0, dp(7), 0, 0) })
            pairingTokenValue = secretValue()
            addView(pairingTokenValue)
            addView(actionButton("Lấy token", primary = false, action = ::revealPairingToken))
            pairingTokenCopyButton = actionButton("Sao chép token", primary = false, action = ::copyPairingToken).apply { visibility = View.GONE }
            addView(pairingTokenCopyButton)
        }
        addView(adbModeContainer)

        addView(sectionTitle("DEVICE PERMISSIONS"))
        addView(card().apply {
            settingsRootValue = statusRow("ROOT / KERNELSU")
            addView(settingsRootValue)
            addView(divider())
            settingsAccessibilityValue = statusRow("UI INSPECTOR / ACCESSIBILITY")
            addView(settingsAccessibilityValue)
            addView(actionButton("Mở cài đặt Trợ năng", primary = false) { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) })
            addView(actionButton("Kiểm tra lại quyền root", primary = false, action = ::checkRoot))
        })

        addView(sectionTitle("APP UPDATE"))
        addView(card().apply {
            addView(label("Stable dành cho vận hành. Nightly nhận bản mới nhất để kiểm tra trước.", MUTED, 11f, false))
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
    }

    private fun refreshStatus() {
        val running = AutomationService.isRunning
        val serviceText = if (running) "ONLINE · Agent sẵn sàng" else "OFFLINE · Agent đang dừng"
        dashboardServiceValue?.apply { text = serviceText; setTextColor(if (running) ACID else DANGER) }
        settingsServiceValue?.apply { text = serviceText; setTextColor(if (running) ACID else DANGER) }
        serviceButton?.apply {
            text = if (running) "Tắt Agent service" else "Bật Agent service"
            setTextColor(if (running) Color.WHITE else INK)
            background = buttonBackground(if (running) DANGER else ACID)
        }

        val callback = CloudCallbackClient.status
        val connectionMode = preferences.connectionMode
        val accountName = callback.accountName?.takeIf(String::isNotBlank) ?: preferences.callbackAccountName.takeIf(String::isNotBlank)
        val callbackError = callback.message.trim().take(160).ifBlank { "Mất kết nối, Agent sẽ tự thử lại" }
        val cloudConnectionText = when (callback.state) {
            CallbackState.ONLINE -> "ONLINE · Studio đã kết nối"
            CallbackState.CONNECTING -> "CONNECTING · Đang kết nối Studio"
            CallbackState.WAITING_PAIRING -> "WAITING · Chờ xác thực trên Studio"
            CallbackState.ERROR -> "OFFLINE · $callbackError"
            CallbackState.DISABLED -> "OFFLINE · Cloud chưa khởi động"
        }
        val cloudConnectionColor = when (callback.state) {
            CallbackState.ONLINE -> ACID
            CallbackState.CONNECTING -> SKY
            CallbackState.WAITING_PAIRING -> AMBER
            CallbackState.ERROR -> DANGER
            CallbackState.DISABLED -> MUTED
        }
        val dashboardConnectionText = if (connectionMode == ConnectionMode.CLOUD) {
            "TRANSPORT · CLOUD\n$cloudConnectionText"
        } else {
            "TRANSPORT · ADB / USB\n${if (running) "READY · Sẵn sàng nhận lệnh local" else "OFFLINE · Agent service đang dừng"}"
        }
        val dashboardConnectionColor = if (connectionMode == ConnectionMode.CLOUD) cloudConnectionColor else if (running) SKY else DANGER
        dashboardConnectionValue?.apply { text = dashboardConnectionText; setTextColor(dashboardConnectionColor) }
        callbackAccountValue?.apply {
            text = accountName ?: "Chưa liên kết tài khoản"
            setTextColor(if (accountName != null) Color.WHITE else MUTED)
        }
        callbackStatusValue?.apply { text = cloudConnectionText; setTextColor(cloudConnectionColor) }
        connectionModeValue?.apply {
            val notice = connectionNotice
            text = notice?.first ?: if (connectionMode == ConnectionMode.CLOUD) "Cloud Callback · kết nối outbound bảo mật" else "ADB / USB · Studio điều khiển qua bridge local"
            setTextColor(notice?.second ?: if (connectionMode == ConnectionMode.CLOUD) SKY else ACID)
        }
        cloudModeContainer?.visibility = if (connectionMode == ConnectionMode.CLOUD) View.VISIBLE else View.GONE
        adbModeContainer?.visibility = if (connectionMode == ConnectionMode.ADB) View.VISIBLE else View.GONE
        val pairingPresentation = CallbackPairingPresentation.from(connectionMode, callback.state, preferences.callbackPairingRequested)
        callbackPairingCard?.visibility = if (pairingPresentation.visible) View.VISIBLE else View.GONE
        callbackPairingHintValue?.text = pairingPresentation.description
        callbackPairingButton?.apply {
            text = pairingPresentation.buttonLabel
            val active = pairingPresentation.action == CallbackPairingAction.REVEAL_CODE
            setTextColor(if (active) INK else Color.WHITE)
            background = buttonBackground(if (active) AMBER else PANEL_LIGHT)
        }
        val cloudCanReconnect = callback.state == CallbackState.ERROR || callback.state == CallbackState.DISABLED
        cloudReconnectButton?.visibility = if (connectionMode == ConnectionMode.CLOUD && cloudCanReconnect) View.VISIBLE else View.GONE
        callbackConfigToggle?.visibility = if (connectionMode == ConnectionMode.CLOUD) View.VISIBLE else View.GONE
        refreshConnectionModeButtons(connectionMode)

        val rooted = RootGateway.isRootGranted()
        val rootText = if (rooted) "ĐÃ CẤP · image + XSpace + silent update" else "KHÔNG ROOT · chế độ Accessibility giới hạn"
        dashboardRootValue?.apply { text = "ROOT / KERNELSU\n$rootText"; setTextColor(if (rooted) ACID else AMBER) }
        settingsRootValue?.apply { text = "ROOT / KERNELSU\n$rootText"; setTextColor(if (rooted) ACID else AMBER) }
        val accessibilityEnabled = AccessibilityController.isEnabled(this)
        val accessibilityText = when {
            AccessibilityController.isReady() -> "READY · text/tap/swipe khả dụng"
            accessibilityEnabled -> "ĐÃ BẬT · đang chờ service kết nối"
            else -> "CHƯA BẬT · cần mở Trợ năng"
        }
        dashboardAccessibilityValue?.apply { text = "UI INSPECTOR\n$accessibilityText"; setTextColor(if (accessibilityEnabled) SKY else AMBER) }
        settingsAccessibilityValue?.apply { text = "UI INSPECTOR / ACCESSIBILITY\n$accessibilityText"; setTextColor(if (accessibilityEnabled) SKY else AMBER) }

        val workflowSummary = workflowSummary()
        dashboardWorkflowValue?.apply { text = "WORKFLOWS ĐÃ ĐỒNG BỘ\n${workflowSummary.first} workflow · revision mới nhất r${workflowSummary.second}"; setTextColor(SKY) }
        refreshChannelButtons()
    }

    private fun buildCallbackPairingCard() = card().apply {
        visibility = View.GONE
        background = rounded(PANEL_LIGHT, 14f, Color.rgb(55, 74, 67))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(14)
            bottomMargin = dp(10)
        }
        addView(label("PAIRING CLOUD", MUTED, 9f, true).apply { letterSpacing = .13f })
        callbackPairingHintValue = label("Đang kiểm tra trạng thái pairing...", MUTED, 11f, false).apply { setPadding(0, dp(7), 0, 0) }
        addView(callbackPairingHintValue)
        callbackCodeValue = secretValue()
        addView(callbackCodeValue)
        callbackPairingButton = actionButton("Lấy mã pairing", primary = false, action = ::handleCallbackPairing)
        addView(callbackPairingButton)
        callbackCodeCopyButton = actionButton("Sao chép mã", primary = false, action = ::copyCallbackCode).apply { visibility = View.GONE }
        addView(callbackCodeCopyButton)
    }

    private fun refreshWorkflowList() {
        val list = workflowList ?: return
        val workflows = JSONObject(store.listWorkflows()).getJSONArray("workflows")
        workflowCountValue?.text = "${workflows.length()} workflow đang lưu cục bộ trên thiết bị"
        list.removeAllViews()
        if (workflows.length() == 0) {
            list.addView(card().apply { addView(label("Chưa có workflow được đồng bộ.", MUTED, 12f, false)) })
            return
        }
        for (index in 0 until workflows.length()) {
            val workflow = workflows.getJSONObject(index)
            list.addView(card().apply {
                addView(LinearLayout(context).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    addView(label(workflow.optString("name", workflow.getString("id")), Color.WHITE, 16f, true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                    addView(label("SYNCED", ACID, 9f, true).apply {
                        letterSpacing = .12f
                        setPadding(dp(8), dp(5), dp(8), dp(5))
                        background = rounded(Color.rgb(31, 54, 42), 9f, Color.rgb(75, 102, 72))
                    })
                })
                addView(label("r${workflow.optInt("revision", 1)} · ${workflow.optInt("nodeCount")} nodes · ${workflow.optInt("assetCount")} Assets", MUTED, 11f, false).apply { setPadding(0, dp(9), 0, 0) })
                addView(label(workflow.getString("id"), Color.rgb(91, 111, 104), 9f, false).apply { setPadding(0, dp(5), 0, 0); typeface = Typeface.MONOSPACE })
            })
        }
    }

    private fun workflowSummary(): Pair<Int, Int> {
        val workflows = JSONObject(store.listWorkflows()).getJSONArray("workflows")
        var latestRevision = 0
        for (index in 0 until workflows.length()) latestRevision = maxOf(latestRevision, workflows.getJSONObject(index).optInt("revision", 1))
        return workflows.length() to latestRevision
    }

    private fun toggleCallbackConfiguration() {
        val container = callbackConfigContainer ?: return
        container.visibility = if (container.visibility == View.VISIBLE) View.GONE else View.VISIBLE
        if (container.visibility == View.VISIBLE) callbackUrlInput?.requestFocus()
    }

    private fun setConnectionMode(mode: ConnectionMode) {
        hideSecrets()
        preferences.connectionMode = mode
        if (!AutomationService.isRunning && !startAgentService()) return
        if (!restartCallback()) return
        showConnectionNotice(
            if (mode == ConnectionMode.CLOUD) "Đã chuyển sang Cloud · đang kết nối Studio" else "Đã chuyển sang ADB / USB · local bridge sẵn sàng",
            if (mode == ConnectionMode.CLOUD) SKY else ACID,
        )
        if (mode == ConnectionMode.CLOUD && preferences.callbackUrl.isBlank()) callbackConfigContainer?.visibility = View.VISIBLE
        refreshStatus()
    }

    private fun reconnectCloud() {
        val configured = callbackUrlInput?.text?.toString()?.trim().orEmpty().ifBlank { preferences.callbackUrl }
        val error = runCatching { CallbackEndpoint.websocketUrl(configured) }.exceptionOrNull()
        if (error != null) {
            callbackConfigContainer?.visibility = View.VISIBLE
            showConnectionNotice(error.message ?: "Địa chỉ Studio không hợp lệ", DANGER)
            return
        }
        preferences.callbackUrl = configured
        preferences.connectionMode = ConnectionMode.CLOUD
        if (!AutomationService.isRunning && !startAgentService()) return
        if (!restartCallback()) return
        callbackConfigContainer?.visibility = View.GONE
        showConnectionNotice("Đang kết nối lại Cloud...", SKY)
        cloudReconnectButton?.postDelayed(::refreshStatus, 350)
    }

    private fun revealCallbackCode() {
        val value = preferences.callbackIdentity().pairingCode.chunked(5).joinToString("  ")
        revealSecret(callbackCodeValue, callbackCodeCopyButton, value)
    }

    private fun handleCallbackPairing() {
        val presentation = CallbackPairingPresentation.from(
            preferences.connectionMode,
            CloudCallbackClient.status.state,
            preferences.callbackPairingRequested,
        )
        if (presentation.action == CallbackPairingAction.REVEAL_CODE) {
            revealCallbackCode()
            return
        }
        AlertDialog.Builder(this)
            .setTitle("Kết nối lại bằng mã pairing?")
            .setMessage("Agent sẽ tạm ngắt phiên Cloud hiện tại và tạo mã mới. Nếu liên kết sang tài khoản khác, các quyền thiết bị đã cấp trước đó sẽ bị thu hồi.")
            .setNegativeButton("Hủy", null)
            .setPositiveButton("Tạo mã mới") { _, _ -> startNewCallbackPairing() }
            .show()
    }

    private fun startNewCallbackPairing() {
        hideSecrets()
        preferences.requestCallbackPairing()
        preferences.connectionMode = ConnectionMode.CLOUD
        if (!AutomationService.isRunning && !startAgentService()) return
        if (!restartCallback()) return
        showConnectionNotice("Đã tạo phiên pairing mới · nhập mã trên Studio", AMBER)
        refreshStatus()
        refreshHandler.postDelayed({
            if (!isFinishing && preferences.connectionMode == ConnectionMode.CLOUD) revealCallbackCode()
        }, 300)
    }

    private fun revealPairingToken() {
        val value = store.accessToken().chunked(4).joinToString("  ")
        revealSecret(pairingTokenValue, pairingTokenCopyButton, value)
    }

    private fun revealSecret(valueView: TextView?, copyButton: Button?, value: String) {
        val generation = ++secretRevealGeneration
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        valueView?.apply { text = value; setTextColor(SKY); setTextIsSelectable(true) }
        copyButton?.visibility = View.VISIBLE
        refreshHandler.postDelayed({ if (generation == secretRevealGeneration) hideSecrets() }, 20_000)
    }

    private fun copyCallbackCode() {
        copySecret("AIPhone callback pairing code", preferences.callbackIdentity().pairingCode)
    }

    private fun copyPairingToken() {
        copySecret("AIPhone pairing token", store.accessToken())
    }

    private fun copySecret(label: String, value: String) {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText(label, value))
        refreshHandler.postDelayed({
            val current = if (clipboard.hasPrimaryClip()) clipboard.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString() else null
            if (current == value) clipboard.setPrimaryClip(ClipData.newPlainText("AIPhone", ""))
        }, 60_000)
        hideSecrets()
    }

    private fun hideSecrets() {
        secretRevealGeneration++
        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        callbackCodeValue?.apply { text = HIDDEN_SECRET; setTextColor(MUTED); setTextIsSelectable(false) }
        callbackCodeCopyButton?.visibility = View.GONE
        pairingTokenValue?.apply { text = HIDDEN_SECRET; setTextColor(MUTED); setTextIsSelectable(false) }
        pairingTokenCopyButton?.visibility = View.GONE
    }

    private fun restartCallback(): Boolean = runCatching {
        ContextCompat.startForegroundService(this, Intent(this, AutomationService::class.java).setAction(AutomationService.ACTION_RESTART_CALLBACK))
    }.fold(
        onSuccess = { true },
        onFailure = {
            showConnectionNotice("Không thể đổi kết nối: ${it.message ?: it.javaClass.simpleName}", DANGER)
            false
        },
    )

    private fun showConnectionNotice(message: String, color: Int) {
        val generation = ++connectionNoticeGeneration
        connectionNotice = message to color
        refreshStatus()
        refreshHandler.postDelayed({
            if (generation == connectionNoticeGeneration) {
                connectionNotice = null
                refreshStatus()
            }
        }, 5_000)
    }

    private fun toggleService() {
        if (AutomationService.isRunning) {
            preferences.serviceEnabled = false
            runCatching { stopService(Intent(this, AutomationService::class.java)) }
                .onFailure { showConnectionNotice("Không thể dừng Agent: ${it.message ?: it.javaClass.simpleName}", DANGER) }
        } else {
            preferences.serviceEnabled = true
            startAgentService()
        }
        serviceButton?.postDelayed(::refreshStatus, 250)
    }

    private fun startAgentService(): Boolean = runCatching {
        ContextCompat.startForegroundService(this, Intent(this, AutomationService::class.java))
    }.fold(
        onSuccess = { true },
        onFailure = {
            preferences.serviceEnabled = false
            showConnectionNotice("Không thể khởi động Agent: ${it.message ?: it.javaClass.simpleName}", DANGER)
            false
        },
    )

    private fun checkRoot() {
        settingsRootValue?.apply { text = "ROOT / KERNELSU\nĐang yêu cầu KernelSU..."; setTextColor(AMBER) }
        thread {
            RootGateway.invalidateRootState()
            RootGateway.isRootGranted()
            runOnUiThread(::refreshStatus)
        }
    }

    private fun setUpdateChannel(channel: UpdateChannel) {
        preferences.updateChannel = channel
        setUpdateStatus("Đã chọn kênh ${channel.name.lowercase()}.", MUTED)
        refreshChannelButtons()
    }

    private fun checkForUpdate() {
        updateButton?.isEnabled = false
        setUpdateStatus("Đang kết nối GitHub Releases...", SKY)
        val updater = AppUpdater(applicationContext)
        val channel = preferences.updateChannel
        thread(name = "AIPhone-Update-Check") {
            val result = runCatching { updater.check(channel, BuildConfig.VERSION_CODE.toLong()) { message -> postUi { setUpdateStatus(message, SKY) } } }
            postUi {
                result.fold(
                    onSuccess = { handleUpdateResult(updater, it) },
                    onFailure = {
                        setUpdateStatus("Không thể cập nhật: ${it.message ?: it.javaClass.simpleName}", DANGER)
                        updateButton?.isEnabled = true
                    },
                )
            }
        }
    }

    private fun handleUpdateResult(updater: AppUpdater, result: UpdateCheckResult) {
        when (result) {
            is UpdateCheckResult.Current -> {
                setUpdateStatus(result.message, ACID)
                updateButton?.isEnabled = true
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
                                    updateButton?.isEnabled = true
                                },
                            )
                        }
                    }
                } else {
                    when (updater.launchInteractiveInstall(this, result.apkFile)) {
                        InteractiveInstallResult.Launched -> setUpdateStatus("Xác nhận cập nhật trong trình cài đặt Android.", AMBER)
                        InteractiveInstallResult.PermissionRequired -> setUpdateStatus("Hãy bật quyền cài ứng dụng không rõ nguồn, rồi kiểm tra lại.", AMBER)
                    }
                    updateButton?.isEnabled = true
                }
            }
        }
    }

    private fun setUpdateStatus(message: String, color: Int) {
        updateStatus?.apply { text = message; setTextColor(color) }
    }

    private fun postUi(action: () -> Unit) {
        if (!isDestroyed) runOnUiThread { if (!isDestroyed) action() }
    }

    private fun refreshChannelButtons() {
        val channel = preferences.updateChannel
        stableButton?.apply {
            setTextColor(if (channel == UpdateChannel.STABLE) INK else Color.WHITE)
            background = buttonBackground(if (channel == UpdateChannel.STABLE) ACID else PANEL_LIGHT)
        }
        nightlyButton?.apply {
            setTextColor(if (channel == UpdateChannel.NIGHTLY) INK else Color.WHITE)
            background = buttonBackground(if (channel == UpdateChannel.NIGHTLY) SKY else PANEL_LIGHT)
        }
    }

    private fun refreshConnectionModeButtons(mode: ConnectionMode) {
        cloudModeButton?.apply {
            setTextColor(if (mode == ConnectionMode.CLOUD) INK else Color.WHITE)
            background = buttonBackground(if (mode == ConnectionMode.CLOUD) SKY else PANEL_LIGHT)
        }
        adbModeButton?.apply {
            setTextColor(if (mode == ConnectionMode.ADB) INK else Color.WHITE)
            background = buttonBackground(if (mode == ConnectionMode.ADB) ACID else PANEL_LIGHT)
        }
    }

    private fun clearPageReferences() {
        dashboardServiceValue = null
        dashboardConnectionValue = null
        dashboardRootValue = null
        dashboardAccessibilityValue = null
        dashboardWorkflowValue = null
        dashboardAiValue = null
        workflowList = null
        workflowCountValue = null
        settingsServiceValue = null
        settingsRootValue = null
        settingsAccessibilityValue = null
        serviceButton = null
        connectionModeValue = null
        cloudModeButton = null
        adbModeButton = null
        cloudModeContainer = null
        adbModeContainer = null
        callbackAccountValue = null
        callbackStatusValue = null
        cloudReconnectButton = null
        callbackConfigToggle = null
        callbackConfigContainer = null
        callbackUrlInput = null
        callbackPairingCard = null
        callbackPairingHintValue = null
        callbackPairingButton = null
        callbackCodeValue = null
        callbackCodeCopyButton = null
        pairingTokenValue = null
        pairingTokenCopyButton = null
        stableButton = null
        nightlyButton = null
        updateButton = null
        updateStatus = null
    }

    private fun scrollPage() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(18), dp(10), dp(18), dp(32))
    }

    private fun pageHeading(kicker: String, title: String, description: String) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(2), dp(4), dp(2), dp(18))
        addView(label(kicker, ACID, 9f, true).apply { letterSpacing = .18f })
        addView(label(title, Color.WHITE, 28f, true).apply {
            setPadding(0, dp(7), 0, dp(6))
            typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
        })
        addView(label(description, MUTED, 12f, false).apply { setLineSpacing(dp(3).toFloat(), 1f) })
    }

    private fun card() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(17), dp(17), dp(17), dp(17))
        background = rounded(PANEL, 18f, Color.rgb(48, 65, 59))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(12) }
    }

    private fun sectionHeader(title: String, subtitle: String) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        addView(label(title, Color.WHITE, 12f, true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addView(label(subtitle, MUTED, 9f, false))
    }

    private fun sectionTitle(title: String) = label(title, MUTED, 9f, true).apply {
        letterSpacing = .16f
        setPadding(dp(2), dp(12), 0, dp(8))
    }

    private fun statusValue(initial: String) = label(initial, ACID, 19f, true).apply { setPadding(0, dp(12), 0, dp(4)) }

    private fun statusRow(title: String) = label("$title\nĐang kiểm tra...", Color.WHITE, 11f, true).apply {
        setLineSpacing(dp(4).toFloat(), 1f)
        setPadding(0, dp(7), 0, dp(7))
    }

    private fun secretValue() = label(HIDDEN_SECRET, MUTED, 17f, true).apply {
        setPadding(0, dp(12), 0, 0)
        typeface = Typeface.MONOSPACE
    }

    private fun divider() = View(this).apply {
        setBackgroundColor(Color.rgb(49, 64, 59))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1).apply { setMargins(0, dp(10), 0, dp(10)) }
    }

    private fun label(value: String, color: Int, size: Float, bold: Boolean) = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(color)
        typeface = Typeface.create("sans-serif", if (bold) Typeface.BOLD else Typeface.NORMAL)
    }

    private fun actionButton(label: String, primary: Boolean, action: () -> Unit) = Button(this).apply {
        text = label
        textSize = 12f
        isAllCaps = false
        setTextColor(if (primary) INK else Color.WHITE)
        typeface = Typeface.create("sans-serif", Typeface.BOLD)
        background = buttonBackground(if (primary) ACID else PANEL_LIGHT)
        stateListAnimator = null
        setOnClickListener { action() }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(47)).apply { topMargin = dp(11) }
    }

    private fun buttonBackground(color: Int) = rounded(color, 13f, Color.TRANSPARENT)

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
        private const val HIDDEN_SECRET = "••••  ••••  ••••  ••••"
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
