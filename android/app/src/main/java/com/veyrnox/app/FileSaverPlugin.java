package com.veyrnox.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Two save strategies:
 *
 *  saveToDownloads — writes directly to the public Downloads folder via
 *    MediaStore (Android 10+). No picker, no gesture required. Returns the
 *    display path so the app can confirm to the user where the file landed.
 *
 *  saveFile — opens ACTION_CREATE_DOCUMENT picker for users who want to
 *    choose a specific location (Google Drive, Dropbox, subfolder, etc.).
 */
@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    private String pendingData;

    /** Write directly to public Downloads — no picker, no navigation needed. */
    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String base64Data = call.getString("data");
        String filename   = call.getString("filename", "veyrnox.enc");
        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("data is required");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            Uri uri;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+ — use MediaStore Downloads collection (no permission needed).
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/octet-stream");
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                uri = getContext().getContentResolver()
                        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            } else {
                call.reject("Android 10+ required for direct Downloads save");
                return;
            }

            if (uri == null) {
                call.reject("Could not create file in Downloads");
                return;
            }

            OutputStream out = getContext().getContentResolver().openOutputStream(uri);
            if (out != null) {
                out.write(bytes);
                out.flush();
                out.close();
            }

            JSObject ret = new JSObject();
            ret.put("path", Environment.DIRECTORY_DOWNLOADS + "/" + filename);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Save failed: " + e.getMessage());
        }
    }

    /** Open system file picker so the user can choose any destination. */
    @PluginMethod
    public void saveFile(PluginCall call) {
        String base64Data = call.getString("data");
        String filename   = call.getString("filename", "veyrnox.enc");
        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("data is required");
            return;
        }
        pendingData = base64Data;
        saveCall(call);

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/octet-stream");
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "handleSaveResult");
    }

    @ActivityCallback
    private void handleSaveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            Uri uri = result.getData().getData();
            try {
                byte[] bytes = Base64.decode(pendingData, Base64.DEFAULT);
                OutputStream out = getContext().getContentResolver().openOutputStream(uri);
                if (out != null) {
                    out.write(bytes);
                    out.flush();
                    out.close();
                }
                pendingData = null;
                JSObject ret = new JSObject();
                ret.put("uri", uri.toString());
                call.resolve(ret);
            } catch (Exception e) {
                pendingData = null;
                call.reject("Write failed: " + e.getMessage());
            }
        } else {
            pendingData = null;
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
        }
    }

    /**
     * Open the system document picker (ACTION_OPEN_DOCUMENT) so the user can
     * choose a backup file to restore. Routing the open through a native call
     * lets the JS side wrap it in withLockSuppressed, so the pause event the
     * picker Activity fires does not lock the wallet mid-restore.
     */
    @PluginMethod
    public void openFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        startActivityForResult(call, intent, "handleOpenResult");
    }

    @ActivityCallback
    private void handleOpenResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            Uri uri = result.getData().getData();
            try {
                InputStream in = getContext().getContentResolver().openInputStream(uri);
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int n;
                while (in != null && (n = in.read(chunk)) != -1) {
                    buffer.write(chunk, 0, n);
                }
                if (in != null) in.close();
                String base64 = Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);

                String displayName = null;
                Cursor cursor = getContext().getContentResolver()
                        .query(uri, null, null, null, null);
                if (cursor != null) {
                    try {
                        int nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (nameIdx >= 0 && cursor.moveToFirst()) {
                            displayName = cursor.getString(nameIdx);
                        }
                    } finally {
                        cursor.close();
                    }
                }

                JSObject ret = new JSObject();
                ret.put("data", base64);
                ret.put("filename", displayName);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Read failed: " + e.getMessage());
            }
        } else {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
        }
    }
}
