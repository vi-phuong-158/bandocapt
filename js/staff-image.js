(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.StaffImage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TARGET_BYTES = 2.5 * 1024 * 1024;
    const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
            reader.onerror = () => reject(new Error('IMAGE_READ_FAILED'));
            reader.readAsDataURL(blob);
        });
    }

    function canvasBlob(canvas, type, quality) {
        return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('IMAGE_COMPRESSION_FAILED')), type, quality));
    }

    async function compressImage(file, options = {}) {
        if (!file || !ACCEPTED_TYPES.has(file.type)) throw new Error('IMAGE_TYPE_NOT_ALLOWED');
        const targetBytes = options.targetBytes || TARGET_BYTES;
        if (file.size <= targetBytes) return { blob: file, mimeType: file.type, size: file.size, compressed: false };
        if (typeof Image === 'undefined' || typeof document === 'undefined') throw new Error('IMAGE_COMPRESSION_UNAVAILABLE');
        const url = URL.createObjectURL(file);
        try {
            const image = await new Promise((resolve, reject) => {
                const element = new Image();
                element.onload = () => resolve(element);
                element.onerror = () => reject(new Error('IMAGE_READ_FAILED'));
                element.src = url;
            });
            const maxDimension = options.maxDimension || 1800;
            const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            let quality = 0.86;
            let blob = await canvasBlob(canvas, 'image/jpeg', quality);
            while (blob.size > targetBytes && quality > 0.42) {
                quality -= 0.08;
                blob = await canvasBlob(canvas, 'image/jpeg', quality);
            }
            if (blob.size > targetBytes) throw new Error('STAFF_IMAGE_TOO_LARGE');
            return { blob, mimeType: 'image/jpeg', size: blob.size, compressed: true };
        } finally { URL.revokeObjectURL(url); }
    }

    async function prepareImage(file, options) {
        const result = await compressImage(file, options);
        return { base64: await blobToBase64(result.blob), mimeType: result.mimeType, size: result.size };
    }

    return { TARGET_BYTES, ACCEPTED_TYPES, blobToBase64, compressImage, prepareImage };
});
