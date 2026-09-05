package com.veyrnox.app

// BugReportRecorderService — foreground service required by Android 14+
// (API 34) to hold a MediaProjection session for the opt-in bug-report
// screen recording feature.
//
// Since Android 14, MediaProjectionManager.getMediaProjection() throws
// SecurityException unless the caller has a running foreground service
// of type mediaProjection at the moment of the call. This service is
// deliberately minimal: it exists solely to make the MediaProjection
// system happy, holds no media state itself (the plugin owns the
// MediaRecorder + VirtualDisplay), and stops as soon as the plugin
// tells it to.
//
// Notification: Android also requires a visible notification while a
// foreground service is active. We use a low-importance channel with
// user-visible copy that describes the actual thing happening ("Bug
// report screen recording") — Play policy treats a misleading
// foreground-service notification as a rejection reason. See
// docs/bug-report-recording-plan.md store-disclosure schedule; the
// notification text lands with the flag flip in Slice 3.

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class BugReportRecorderService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notif = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notif,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
            )
        } else {
            startForeground(NOTIFICATION_ID, notif)
        }
        // The plugin binds MediaProjection AFTER seeing the service is
        // up. If the system kills us mid-recording, don't auto-restart
        // — the plugin will get an onStop callback via MediaProjection
        // and can rebuild if it needs to (it won't; we treat a killed
        // service as an abort).
        return START_NOT_STICKY
    }

    private fun buildNotification(): Notification {
        val mgr = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Bug report recording",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Shown while a bug-report screen recording is active."
                setShowBadge(false)
            }
            mgr.createNotificationChannel(channel)
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Recording screen")
            .setContentText("Bug report — recording will stop when you tap Stop in the app.")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val CHANNEL_ID = "bug-report-recording"
        const val NOTIFICATION_ID = 4711
    }
}
