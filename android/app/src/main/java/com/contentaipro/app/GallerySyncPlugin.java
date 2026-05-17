package com.contentaipro.app;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(
    name = "GallerySync",
    permissions = {
        @Permission(
            alias = "photos",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.READ_MEDIA_IMAGES
            }
        )
    }
)
public class GallerySyncPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean running = false;
    private volatile String phase = "idle";
    private volatile int scanned = 0;
    private volatile int uploaded = 0;
    private volatile int skipped = 0;
    private volatile int failed = 0;
    private volatile int total = 0;
    private volatile String message = "";

    @PluginMethod
    public void startSync(PluginCall call) {
        if (!hasPhotoPermission()) {
            requestPermissionForAlias("photos", call, "photosPermissionCallback");
            return;
        }
        beginSync(call);
    }

    @PermissionCallback
    private void photosPermissionCallback(PluginCall call) {
        if (getPermissionState("photos") == PermissionState.GRANTED || hasPhotoPermission()) {
            beginSync(call);
            return;
        }
        call.reject("Gallery permission denied.");
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void scheduleBackgroundSync(PluginCall call) {
        String apiBaseUrl = call.getString("apiBaseUrl", "");
        String authToken = call.getString("authToken", "");
        if (apiBaseUrl.isEmpty() || authToken.isEmpty()) {
            call.reject("API URL and auth token are required.");
            return;
        }

        persistSyncCredentials(apiBaseUrl, authToken);
        scheduleBackgroundWork();
        call.resolve(statusObject());
    }

    @PluginMethod
    public void cancelBackgroundSync(PluginCall call) {
        WorkManager.getInstance(getContext()).cancelUniqueWork(GallerySyncWorker.UNIQUE_WORK_NAME);
        WorkManager.getInstance(getContext()).cancelUniqueWork(GallerySyncWorker.LEGACY_SCREENSHOT_WORK_NAME);
        getContext()
            .getSharedPreferences(GallerySyncWorker.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .apply();
        call.resolve(statusObject());
    }

    private void beginSync(PluginCall call) {
        if (running) {
            call.resolve(statusObject());
            return;
        }

        String apiBaseUrl = call.getString("apiBaseUrl", "");
        String authToken = call.getString("authToken", "");
        if (apiBaseUrl.isEmpty() || authToken.isEmpty()) {
            call.reject("API URL and auth token are required.");
            return;
        }

        persistSyncCredentials(apiBaseUrl, authToken);
        scheduleBackgroundWork();

        running = true;
        phase = "scanning";
        scanned = 0;
        uploaded = 0;
        skipped = 0;
        failed = 0;
        total = 0;
        message = "";

        executor.execute(() -> syncGallery(apiBaseUrl, authToken));
        call.resolve(statusObject());
    }

    private boolean hasPhotoPermission() {
        return GallerySyncEngine.hasPhotoPermission(getContext());
    }

    private JSObject statusObject() {
        JSObject status = new JSObject();
        status.put("running", running);
        status.put("phase", phase);
        status.put("scanned", scanned);
        status.put("uploaded", uploaded);
        status.put("skipped", skipped);
        status.put("failed", failed);
        status.put("total", total);
        status.put("message", message);
        return status;
    }

    private void syncGallery(String apiBaseUrl, String authToken) {
        try {
            GallerySyncEngine.syncGallery(getContext(), apiBaseUrl, authToken, this::applyResult);
        } catch (Exception error) {
            phase = "error";
            message = error.getMessage() == null ? "Gallery sync failed." : error.getMessage();
        } finally {
            running = false;
        }
    }

    private void applyResult(GallerySyncEngine.SyncResult result) {
        phase = result.phase;
        scanned = result.scanned;
        uploaded = result.uploaded;
        skipped = result.skipped;
        failed = result.failed;
        total = result.total;
        message = result.message;
    }

    private void persistSyncCredentials(String apiBaseUrl, String authToken) {
        SharedPreferences prefs = getContext().getSharedPreferences(GallerySyncWorker.PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putString(GallerySyncWorker.KEY_API_BASE_URL, apiBaseUrl)
            .putString(GallerySyncWorker.KEY_AUTH_TOKEN, authToken)
            .apply();
    }

    private void scheduleBackgroundWork() {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(GallerySyncWorker.class, 12, TimeUnit.HOURS)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(getContext()).cancelUniqueWork(GallerySyncWorker.LEGACY_SCREENSHOT_WORK_NAME);
        WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork(
            GallerySyncWorker.UNIQUE_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        );
    }
}
