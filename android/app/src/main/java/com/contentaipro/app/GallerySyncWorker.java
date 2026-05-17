package com.contentaipro.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class GallerySyncWorker extends Worker {
    public static final String PREFS_NAME = "content_ai_gallery_sync";
    public static final String KEY_API_BASE_URL = "api_base_url";
    public static final String KEY_AUTH_TOKEN = "auth_token";
    public static final String UNIQUE_WORK_NAME = "content-ai-gallery-sync";
    public static final String LEGACY_SCREENSHOT_WORK_NAME = "content-ai-gallery-screenshot-sync";
    private static final String TAG = "GallerySyncWorker";

    public GallerySyncWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String apiBaseUrl = prefs.getString(KEY_API_BASE_URL, "");
        String authToken = prefs.getString(KEY_AUTH_TOKEN, "");

        if (apiBaseUrl == null || apiBaseUrl.isEmpty() || authToken == null || authToken.isEmpty()) {
            Log.i(TAG, "Skipping background sync because credentials are missing.");
            return Result.success();
        }

        if (!GallerySyncEngine.hasPhotoPermission(context)) {
            Log.i(TAG, "Skipping background sync because photo permission is missing.");
            return Result.success();
        }

        try {
            GallerySyncEngine.SyncResult result = GallerySyncEngine.syncGallery(context, apiBaseUrl, authToken, null);
            Log.i(
                TAG,
                "Background gallery sync complete. scanned=" + result.scanned
                    + " uploaded=" + result.uploaded
                    + " skipped=" + result.skipped
                    + " failed=" + result.failed
            );
            return Result.success();
        } catch (Exception error) {
            Log.w(TAG, "Background gallery sync failed.", error);
            return Result.retry();
        }
    }
}
