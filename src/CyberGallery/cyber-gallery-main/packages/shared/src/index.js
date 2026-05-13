"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRESIGN_BATCH_LIMIT = exports.MAX_IMAGE_BYTES = exports.QUOTA_BYTES_PER_USER = exports.ALLOWED_IMAGE_MIME = void 0;
exports.ALLOWED_IMAGE_MIME = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
];
exports.QUOTA_BYTES_PER_USER = 5 * 1024 * 1024 * 1024; // 5 GB
exports.MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB / image
exports.PRESIGN_BATCH_LIMIT = 50;
