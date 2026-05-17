package com.contentaipro.app;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class GallerySyncEngine {
    public static final int MAX_UPLOAD_BYTES = 850 * 1024;
    public static final int SYNC_ITEM_LIMIT = 10000;
    public static final int SYNC_PROGRESS_BATCH = 2000;
    private static final String ACCEPTED_IDS_KEY = "accepted_device_asset_ids";

    public interface ProgressListener {
        void onProgress(SyncResult result);
    }

    public static final class SyncResult {
        public String phase = "idle";
        public int scanned = 0;
        public int uploaded = 0;
        public int skipped = 0;
        public int failed = 0;
        public int total = 0;
        public String message = "";

        public SyncResult copy() {
            SyncResult next = new SyncResult();
            next.phase = phase;
            next.scanned = scanned;
            next.uploaded = uploaded;
            next.skipped = skipped;
            next.failed = failed;
            next.total = total;
            next.message = message;
            return next;
        }
    }

    private GallerySyncEngine() {}

    public static boolean hasPhotoPermission(Context context) {
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED;
        }
        return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    public static SyncResult syncGallery(Context context, String apiBaseUrl, String authToken, ProgressListener listener) throws Exception {
        SyncResult result = new SyncResult();
        result.phase = "scanning";
        notifyProgress(listener, result);

        Uri collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        String[] projection = {
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.MIME_TYPE,
            MediaStore.Images.Media.SIZE
        };
        String selection = null;
        String[] selectionArgs = null;
        // Screenshot-only query:
        // StringBuilder selectionBuilder = new StringBuilder();
        // List<String> selectionArgsList = new ArrayList<>();
        // selectionBuilder
        //     .append("(")
        //     .append("LOWER(")
        //     .append(MediaStore.Images.Media.DISPLAY_NAME)
        //     .append(") LIKE ? OR LOWER(")
        //     .append(MediaStore.Images.Media.BUCKET_DISPLAY_NAME)
        //     .append(") LIKE ?");
        // selectionArgsList.add("%screenshot%");
        // selectionArgsList.add("%screenshot%");
        // if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        //     selectionBuilder
        //         .append(" OR LOWER(")
        //         .append(MediaStore.Images.Media.RELATIVE_PATH)
        //         .append(") LIKE ?");
        //     selectionArgsList.add("%screenshot%");
        // }
        // selectionBuilder.append(")");
        // selection = selectionBuilder.toString();
        // selectionArgs = selectionArgsList.toArray(new String[0]);

        try (Cursor cursor = context.getContentResolver().query(
            collection,
            projection,
            selection,
            selectionArgs,
            MediaStore.Images.Media.DATE_ADDED + " DESC"
        )) {
            if (cursor == null) {
                throw new IllegalStateException("Could not read gallery.");
            }

            result.total = Math.min(cursor.getCount(), SYNC_ITEM_LIMIT);
            int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
            int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
            int mimeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE);
            int sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE);
            notifyProgress(listener, result);

            while (cursor.moveToNext() && result.scanned < SYNC_ITEM_LIMIT) {
                result.scanned++;
                long id = cursor.getLong(idColumn);
                String deviceAssetId = String.format(Locale.US, "android-media-%d", id);
                if (isAcceptedDeviceAsset(context, deviceAssetId)) {
                    result.skipped++;
                    continue;
                }

                String fileName = cursor.getString(nameColumn);
                String originalMime = cursor.getString(mimeColumn);
                int originalSize = cursor.getInt(sizeColumn);
                Uri imageUri = ContentUris.withAppendedId(collection, id);

                try {
                    byte[] imageBytes = optimizedJpegBytes(context, imageUri);
                    String uploadName = fileName == null || fileName.trim().isEmpty()
                        ? String.format(Locale.US, "gallery-%d.jpg", id)
                        : fileName.replaceAll("\\.[^.]+$", "") + ".jpg";
                    boolean stored = uploadImage(
                        apiBaseUrl,
                        authToken,
                        deviceAssetId,
                        uploadName,
                        imageBytes,
                        originalMime,
                        originalSize
                    );
                    rememberAcceptedDeviceAsset(context, deviceAssetId);
                    if (stored) {
                        result.uploaded++;
                    } else {
                        result.skipped++;
                    }
                } catch (Exception imageError) {
                    result.failed++;
                    result.message = imageError.getMessage() == null ? "Image upload failed." : imageError.getMessage();
                }

                if (result.scanned % SYNC_PROGRESS_BATCH == 0) {
                    result.message = String.format(Locale.US, "Synced %d of %d gallery items.", result.scanned, result.total);
                    notifyProgress(listener, result);
                }
            }
        }

        result.phase = "done";
        result.message = "Gallery sync complete.";
        notifyProgress(listener, result);
        return result;
    }

    private static boolean isAcceptedDeviceAsset(Context context, String deviceAssetId) {
        SharedPreferences prefs = context.getSharedPreferences(GallerySyncWorker.PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getStringSet(ACCEPTED_IDS_KEY, java.util.Collections.emptySet()).contains(deviceAssetId);
    }

    private static void rememberAcceptedDeviceAsset(Context context, String deviceAssetId) {
        SharedPreferences prefs = context.getSharedPreferences(GallerySyncWorker.PREFS_NAME, Context.MODE_PRIVATE);
        java.util.Set<String> acceptedIds = new java.util.HashSet<>(
            prefs.getStringSet(ACCEPTED_IDS_KEY, java.util.Collections.emptySet())
        );
        if (acceptedIds.add(deviceAssetId)) {
            prefs.edit().putStringSet(ACCEPTED_IDS_KEY, acceptedIds).apply();
        }
    }

    private static void notifyProgress(ProgressListener listener, SyncResult result) {
        if (listener != null) {
            listener.onProgress(result.copy());
        }
    }

    private static byte[] optimizedJpegBytes(Context context, Uri imageUri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream input = context.getContentResolver().openInputStream(imageUri)) {
            BitmapFactory.decodeStream(input, null, bounds);
        }

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, 1280);
        Bitmap bitmap;
        try (InputStream input = context.getContentResolver().openInputStream(imageUri)) {
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

    private static int sampleSize(int width, int height, int maxDimension) {
        int sample = 1;
        while (width / sample > maxDimension || height / sample > maxDimension) {
            sample *= 2;
        }
        return sample;
    }

    private static boolean uploadImage(String apiBaseUrl, String authToken, String deviceAssetId, String fileName, byte[] imageBytes, String originalMime, int originalSize) throws Exception {
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
        body.put("deviceAssetId", deviceAssetId);
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
        return status == HttpURLConnection.HTTP_CREATED;
    }

    private static String errorBody(HttpURLConnection connection) {
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
