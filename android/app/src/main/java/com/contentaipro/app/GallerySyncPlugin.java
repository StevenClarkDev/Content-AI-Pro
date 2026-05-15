package com.contentaipro.app;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

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
    private static final int MAX_UPLOAD_BYTES = 850 * 1024;
    private static final int SYNC_ITEM_LIMIT = 10000;
    private static final int SYNC_PROGRESS_BATCH = 2000;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean running = false;
    private volatile String phase = "idle";
    private volatile int scanned = 0;
    private volatile int uploaded = 0;
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

        running = true;
        phase = "scanning";
        scanned = 0;
        uploaded = 0;
        failed = 0;
        total = 0;
        message = "";

        executor.execute(() -> syncGallery(apiBaseUrl, authToken));
        call.resolve(statusObject());
    }

    private boolean hasPhotoPermission() {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED;
        }
        return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject statusObject() {
        JSObject status = new JSObject();
        status.put("running", running);
        status.put("phase", phase);
        status.put("scanned", scanned);
        status.put("uploaded", uploaded);
        status.put("failed", failed);
        status.put("total", total);
        status.put("message", message);
        return status;
    }

    private void syncGallery(String apiBaseUrl, String authToken) {
        try {
            Uri collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            String[] projection = {
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.MIME_TYPE,
                MediaStore.Images.Media.SIZE
            };

            try (Cursor cursor = getContext().getContentResolver().query(
                collection,
                projection,
                null,
                null,
                MediaStore.Images.Media.DATE_ADDED + " DESC"
            )) {
                if (cursor == null) {
                    throw new IllegalStateException("Could not read gallery.");
                }

                total = Math.min(cursor.getCount(), SYNC_ITEM_LIMIT);
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
                int mimeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE);
                int sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE);

                while (cursor.moveToNext() && scanned < SYNC_ITEM_LIMIT) {
                    scanned++;
                    long id = cursor.getLong(idColumn);
                    String fileName = cursor.getString(nameColumn);
                    String originalMime = cursor.getString(mimeColumn);
                    int originalSize = cursor.getInt(sizeColumn);
                    Uri imageUri = ContentUris.withAppendedId(collection, id);

                    try {
                        byte[] imageBytes = optimizedJpegBytes(imageUri);
                        String uploadName = fileName == null || fileName.trim().isEmpty()
                            ? String.format(Locale.US, "gallery-%d.jpg", id)
                            : fileName.replaceAll("\\.[^.]+$", "") + ".jpg";
                        uploadImage(apiBaseUrl, authToken, uploadName, imageBytes, originalMime, originalSize);
                        uploaded++;
                    } catch (Exception imageError) {
                        failed++;
                        message = imageError.getMessage() == null ? "Image upload failed." : imageError.getMessage();
                    }

                    if (scanned % SYNC_PROGRESS_BATCH == 0) {
                        message = String.format(Locale.US, "Synced %d of %d gallery items.", scanned, total);
                    }
                }
            }

            phase = "done";
            message = "Gallery sync complete.";
        } catch (Exception error) {
            phase = "error";
            message = error.getMessage() == null ? "Gallery sync failed." : error.getMessage();
        } finally {
            running = false;
        }
    }

    private byte[] optimizedJpegBytes(Uri imageUri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream input = getContext().getContentResolver().openInputStream(imageUri)) {
            BitmapFactory.decodeStream(input, null, bounds);
        }

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, 1280);
        Bitmap bitmap;
        try (InputStream input = getContext().getContentResolver().openInputStream(imageUri)) {
            bitmap = BitmapFactory.decodeStream(input, null, options);
        }
        if (bitmap == null) {
            throw new IllegalStateException("Could not decode image.");
        }

        int quality = 78;
        byte[] output;
        do {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, buffer);
            output = buffer.toByteArray();
            quality -= 12;
        } while (output.length > MAX_UPLOAD_BYTES && quality >= 38);

        bitmap.recycle();
        if (output.length > MAX_UPLOAD_BYTES) {
            throw new IllegalStateException("Image is too large after compression.");
        }
        return output;
    }

    private int sampleSize(int width, int height, int maxDimension) {
        int sample = 1;
        while (width / sample > maxDimension || height / sample > maxDimension) {
            sample *= 2;
        }
        return sample;
    }

    private void uploadImage(String apiBaseUrl, String authToken, String fileName, byte[] imageBytes, String originalMime, int originalSize) throws Exception {
        String base = apiBaseUrl.endsWith("/") ? apiBaseUrl.substring(0, apiBaseUrl.length() - 1) : apiBaseUrl;
        URL url = new URL(base + "/api/gallery");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setConnectTimeout(30000);
        connection.setReadTimeout(60000);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("Authorization", "Bearer " + authToken);

        String dataUrl = "data:image/jpeg;base64," + Base64.encodeToString(imageBytes, Base64.NO_WRAP);
        JSONObject body = new JSONObject();
        body.put("fileName", fileName);
        body.put("mimeType", "image/jpeg");
        body.put("sizeBytes", imageBytes.length);
        body.put("dataUrl", dataUrl);
        body.put("source", "android-gallery-sync");
        body.put("originalMimeType", originalMime == null ? "" : originalMime);
        body.put("originalSizeBytes", originalSize);

        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(payload);
        }

        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            throw new IllegalStateException("Upload failed with status " + status + ": " + errorBody(connection));
        }
        connection.disconnect();
    }

    private String errorBody(HttpURLConnection connection) {
        try (InputStream input = connection.getErrorStream()) {
            if (input == null) {
                return "";
            }

            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[1024];
            int read;
            while ((read = input.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
            }
            return buffer.toString(StandardCharsets.UTF_8.name()).trim();
        } catch (Exception ignored) {
            return "";
        }
    }
}
