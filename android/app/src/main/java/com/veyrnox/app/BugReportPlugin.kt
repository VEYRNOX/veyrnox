package com.veyrnox.app

// BugReportPlugin — Android MediaProjection-backed screen recorder for
// the opt-in bug-report feature.
//
// See docs/bug-report-recording-plan.md for the full contract.
//
// JS-side name: "BugReport" (matches iOS BugReportPluginBridge.m in
// slice 2a). Slice 2c's captureBridge.js dispatches to
// Capacitor.Plugins.BugReport.
//
// Permission dance: MediaProjection requires runtime user consent via
// the system's own dialog. The plugin's requestPermission() calls
// startActivityForResult with createScreenCaptureIntent and returns
// the resulting Intent as base64-serialised bytes so the caller does
// not have to hold Android state across a permission callback. The
// caller then passes those bytes back to startRecording, which
// deserialises and binds the MediaProjection.
//
// STORE DISCLOSURE:
//   AndroidManifest.xml adds:
//     - FOREGROUND_SERVICE (already-present in most Capacitor apps)
//     - FOREGROUND_SERVICE_MEDIA_PROJECTION (API 34+ requirement)
//     - <service android:name=".BugReportRecorderService"
//                android:foregroundServiceType="mediaProjection" />
//   Play sensitive-permissions form asks about screen capture — must be
//   answered as part of Slice 3 store-disclosure amend. Camera / mic
//   permissions are NOT used here; they are already in the manifest
//   for unrelated features and this plugin does not touch either
//   surface (recordAudio flag never set on MediaRecorder; camera path
//   never opened).
//
// RASP INTERACTION: RaspIntegrityPlugin treats an active MediaProjection
// as a tamper signal (screen mirroring). Slice 2c/2d must coordinate —
// this plugin will notify RASP of a legitimate recording window so RASP
// does not raise its own indicator. Not wired in slice 2b.
//
// FLAG_SECURE INTERACTION (blocks capture — MUST be cleared to record):
//   MainActivity.java sets WindowManager.LayoutParams.FLAG_SECURE
//   window-wide (M13, device-verified 2026-07-14). MediaProjection
//   captures BLACK where our app is when FLAG_SECURE is on. The
//   plugin exposes setSecureFlag(enabled) so slice 2c can coordinate:
//     - start recording: setSecureFlag(false)
//     - route kill switch fires (nav into denied route): setSecureFlag(true) THEN abort
//     - stop/abort: setSecureFlag(true) BEFORE releasing recorder
//   Never leave FLAG_SECURE cleared after a recording ends — it is the
//   window-wide guarantee against seized-device screenshotting. Slice 2c
//   MUST restore it in every terminal state (stop, abort, close, kill
//   switches) and MUST also restore it on JS-side unmount so a crash in
//   the flow does not leave the window unprotected.

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.util.Base64
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.util.UUID

@CapacitorPlugin(name = "BugReport")
class BugReportPlugin : Plugin() {

    private var projection: MediaProjection? = null
    private var recorder: MediaRecorder? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var outputFile: File? = null
    private var recordingStartedAtMs: Long = 0L

    @PluginMethod
    fun setSecureFlag(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: run {
            call.reject("enabled required")
            return
        }
        val activity = activity ?: run {
            call.reject("no activity")
            return
        }
        // Main-thread only — Window flags are UI-thread state.
        activity.runOnUiThread {
            val flag = android.view.WindowManager.LayoutParams.FLAG_SECURE
            if (enabled) {
                activity.window.setFlags(flag, flag)
            } else {
                activity.window.clearFlags(flag)
            }
            call.resolve()
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        // MediaProjection API is available since API 21. The app's
        // minSdk is 24, so this is effectively always true. Kept as a
        // symmetric method with iOS for slice 2c's platform dispatch.
        val ret = JSObject().apply { put("available", true) }
        call.resolve(ret)
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        val mgr = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE)
                as MediaProjectionManager
        val intent = mgr.createScreenCaptureIntent()
        startActivityForResult(call, intent, "handlePermissionResult")
    }

    @ActivityCallback
    private fun handlePermissionResult(call: PluginCall, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            call.reject("User denied screen capture")
            return
        }
        // Serialise the result Intent so JS can round-trip it back to
        // startRecording. Callers must NOT interpret the bytes — they
        // are an opaque token this plugin re-parses on start.
        val parcel = android.os.Parcel.obtain()
        try {
            result.data!!.writeToParcel(parcel, 0)
            val bytes = parcel.marshall()
            call.resolve(JSObject().apply {
                put("resultCode", result.resultCode)
                put("dataBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
            })
        } finally {
            parcel.recycle()
        }
    }

    @PluginMethod
    fun startRecording(call: PluginCall) {
        val resultCode = call.getInt("resultCode") ?: run {
            call.reject("resultCode required")
            return
        }
        val dataB64 = call.getString("dataBase64") ?: run {
            call.reject("dataBase64 required")
            return
        }
        if (projection != null) {
            call.reject("A recording is already in progress")
            return
        }

        // Reconstruct the Intent from the round-tripped bytes.
        val bytes = try { Base64.decode(dataB64, Base64.NO_WRAP) } catch (e: Exception) {
            call.reject("dataBase64 malformed"); return
        }
        val parcel = android.os.Parcel.obtain()
        val permissionIntent: Intent = try {
            parcel.unmarshall(bytes, 0, bytes.size)
            parcel.setDataPosition(0)
            Intent.CREATOR.createFromParcel(parcel)
        } catch (e: Exception) {
            parcel.recycle()
            call.reject("dataBase64 malformed")
            return
        } finally {
            parcel.recycle()
        }

        // Start the foreground service BEFORE getMediaProjection — API
        // 34+ throws SecurityException otherwise.
        val serviceIntent = Intent(context, BugReportRecorderService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }

        val mgr = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE)
                as MediaProjectionManager
        projection = try {
            mgr.getMediaProjection(resultCode, permissionIntent)
        } catch (e: SecurityException) {
            context.stopService(serviceIntent)
            call.reject("MediaProjection denied: ${e.message}")
            return
        }

        if (projection == null) {
            context.stopService(serviceIntent)
            call.reject("MediaProjection returned null")
            return
        }

        // Configure the recorder. Mic + camera EXPLICITLY off — the
        // bug-report contract in docs/bug-report-recording-plan.md
        // §Non-goals commits to "No microphone or camera capture".
        val (width, height, dpi) = displayMetrics()
        val out = File(context.cacheDir, "bug-report-${UUID.randomUUID()}.mp4")
        outputFile = out

        recorder = MediaRecorder().apply {
            setVideoSource(MediaRecorder.VideoSource.SURFACE)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setVideoEncoder(MediaRecorder.VideoEncoder.H264)
            setVideoSize(width, height)
            setVideoFrameRate(30)
            setVideoEncodingBitRate(4_000_000)
            setOutputFile(out.absolutePath)
            prepare()
        }

        virtualDisplay = projection!!.createVirtualDisplay(
            "veyrnox-bug-report",
            width, height, dpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            recorder!!.surface,
            null, null,
        )

        recorder!!.start()
        recordingStartedAtMs = System.currentTimeMillis()
        call.resolve()
    }

    @PluginMethod
    fun stopRecording(call: PluginCall) {
        val out = outputFile
        if (recorder == null || out == null) {
            call.reject("No recording in progress")
            return
        }
        val durationMs = System.currentTimeMillis() - recordingStartedAtMs
        try {
            // Order matters: stop recorder, release virtual display,
            // stop projection, then stop the foreground service. If
            // any step throws, still release the rest.
            try { recorder!!.stop() } catch (_: Exception) {}
            try { recorder!!.release() } catch (_: Exception) {}
            try { virtualDisplay?.release() } catch (_: Exception) {}
            try { projection?.stop() } catch (_: Exception) {}
        } finally {
            recorder = null
            virtualDisplay = null
            projection = null
            context.stopService(Intent(context, BugReportRecorderService::class.java))
        }

        val size = if (out.exists()) out.length() else 0L
        val ret = JSObject().apply {
            put("path", out.absolutePath)
            put("size", size)
            put("duration_ms", durationMs)
        }
        outputFile = null
        recordingStartedAtMs = 0L
        call.resolve(ret)
    }

    @PluginMethod
    fun abortRecording(call: PluginCall) {
        if (recorder == null) { call.resolve(); return }
        try { recorder!!.stop() } catch (_: Exception) {}
        try { recorder!!.release() } catch (_: Exception) {}
        try { virtualDisplay?.release() } catch (_: Exception) {}
        try { projection?.stop() } catch (_: Exception) {}
        recorder = null
        virtualDisplay = null
        projection = null
        context.stopService(Intent(context, BugReportRecorderService::class.java))
        // Discard the file — abort means no buffer survives.
        outputFile?.let { if (it.exists()) it.delete() }
        outputFile = null
        recordingStartedAtMs = 0L
        call.resolve()
    }

    @PluginMethod
    fun readRecording(call: PluginCall) {
        val path = call.getString("path") ?: run { call.reject("path required"); return }
        val f = File(path)
        // Path-safety: only allow files under our cacheDir. The JS
        // caller only ever supplies a path we returned from
        // stopRecording, but this guard means a compromised JS
        // context cannot turn readRecording into a file-read
        // primitive.
        if (!f.canonicalPath.startsWith(context.cacheDir.canonicalPath)) {
            call.reject("path outside cache dir")
            return
        }
        if (!f.exists()) { call.reject("no such file"); return }
        val bytes = f.readBytes()
        call.resolve(JSObject().apply {
            put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
        })
    }

    @PluginMethod
    fun deleteRecording(call: PluginCall) {
        val path = call.getString("path") ?: run { call.reject("path required"); return }
        val f = File(path)
        if (!f.canonicalPath.startsWith(context.cacheDir.canonicalPath)) {
            call.reject("path outside cache dir")
            return
        }
        if (f.exists()) f.delete()
        call.resolve()
    }

    private fun displayMetrics(): Triple<Int, Int, Int> {
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)
        return Triple(metrics.widthPixels, metrics.heightPixels, metrics.densityDpi)
    }
}
