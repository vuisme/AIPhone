package com.aiphone.agent

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.aiphone.agent.root.RootGateway
import kotlin.concurrent.thread

class MainActivity : Activity() {
    private lateinit var rootStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildContent())
        requestNotificationPermission()
        ContextCompat.startForegroundService(this, Intent(this, AutomationService::class.java))
    }

    private fun buildContent(): LinearLayout {
        val density = resources.displayMetrics.density
        fun dp(value: Int) = (value * density).toInt()

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(48), dp(24), dp(24))
            setBackgroundColor(Color.rgb(10, 16, 15))

            addView(TextView(context).apply {
                text = "AIPhone Agent"
                textSize = 30f
                setTextColor(Color.rgb(220, 247, 99))
                setTypeface(typeface, android.graphics.Typeface.BOLD)
            })
            addView(TextView(context).apply {
                text = "Studio: http://127.0.0.1:8765\nADB: adb forward tcp:8765 tcp:8765"
                textSize = 14f
                setTextColor(Color.rgb(190, 205, 199))
                gravity = Gravity.CENTER
                setPadding(0, dp(12), 0, dp(24))
            })

            rootStatus = TextView(context).apply {
                text = "KernelSU: chưa kiểm tra"
                textSize = 15f
                setTextColor(Color.rgb(255, 211, 138))
                setPadding(dp(14), dp(14), dp(14), dp(14))
                setBackgroundColor(Color.rgb(20, 32, 29))
            }
            addView(rootStatus, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

            addView(actionButton("Kiểm tra / cấp quyền root") {
                rootStatus.text = "KernelSU: đang yêu cầu quyền..."
                thread {
                    RootGateway.invalidateRootState()
                    val granted = RootGateway.isRootGranted()
                    runOnUiThread {
                        rootStatus.text = if (granted) "KernelSU: đã cấp quyền" else "KernelSU: chưa được cấp quyền"
                        rootStatus.setTextColor(if (granted) Color.rgb(220, 247, 99) else Color.rgb(255, 128, 109))
                    }
                }
            })
            addView(actionButton("Mở Studio trên điện thoại") {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("http://127.0.0.1:8765")))
            })
            addView(actionButton("Khởi động lại Agent") {
                stopService(Intent(context, AutomationService::class.java))
                ContextCompat.startForegroundService(context, Intent(context, AutomationService::class.java))
            })
        }
    }

    private fun actionButton(label: String, action: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        setOnClickListener { action() }
        val margin = (12 * resources.displayMetrics.density).toInt()
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = margin
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 100)
        }
    }
}

