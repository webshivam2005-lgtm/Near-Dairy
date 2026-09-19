const { supabase, supabaseAdmin } = require('../config/supabase');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Use admin client if available (bypasses RLS for bucket management), otherwise fallback to public client
const storageClient = supabaseAdmin || supabase;

// Dedicated separate buckets for each domain
const BUCKET_MAP = {
  avatar: 'neardairy-avatars',
  avatars: 'neardairy-avatars',
  banner: 'neardairy-banners',
  banners: 'neardairy-banners',
  certificate: 'neardairy-certificates',
  certificates: 'neardairy-certificates',
  product: 'neardairy-products',
  products: 'neardairy-products',
  complaint: 'neardairy-complaints',
  complaints: 'neardairy-complaints',
  general: 'neardairy-general',
};

const ALL_BUCKETS = [
  'neardairy-avatars',
  'neardairy-banners',
  'neardairy-certificates',
  'neardairy-products',
  'neardairy-complaints',
  'neardairy-general',
  'neardairy-media',
];

const UPLOADS_BASE = path.join(__dirname, '..', '..', 'public', 'uploads');

// Ensure local fallback directories exist
['banners', 'avatars', 'certificates', 'products', 'complaints', 'general'].forEach((dir) => {
  const fullPath = path.join(UPLOADS_BASE, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

let bucketsInitialized = false;

/**
 * Ensure all separate Supabase Storage Buckets exist and are public
 */
async function ensureBuckets() {
  if (bucketsInitialized) return true;
  try {
    const { data: buckets, error } = await storageClient.storage.listBuckets();
    if (error) {
      console.warn('⚠️ Supabase listBuckets notice:', error.message);
      return false;
    }

    const existing = (buckets || []).map((b) => b.name);
    const targetBuckets = [
      { id: 'neardairy-avatars', size: 10 * 1024 * 1024, mime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
      { id: 'neardairy-banners', size: 15 * 1024 * 1024, mime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
      { id: 'neardairy-certificates', size: 20 * 1024 * 1024, mime: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
      { id: 'neardairy-products', size: 15 * 1024 * 1024, mime: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'] },
      { id: 'neardairy-complaints', size: 15 * 1024 * 1024, mime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
      { id: 'neardairy-general', size: 20 * 1024 * 1024, mime: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'application/pdf'] },
    ];

    for (const b of targetBuckets) {
      if (!existing.includes(b.id)) {
        await storageClient.storage.createBucket(b.id, {
          public: true,
          fileSizeLimit: b.size,
          allowedMimeTypes: b.mime,
        });
        console.log(`✅ Supabase Storage bucket "${b.id}" created with public access.`);
      }
    }

    bucketsInitialized = true;
    return true;
  } catch (err) {
    console.warn('⚠️ Supabase storage check notice:', err.message);
    return false;
  }
}

/**
 * Storage Service
 * Handles Upload, Update, Replace, and Delete operations for media files in separate Supabase Buckets.
 */
class StorageService {
  /**
   * Get the target bucket for a specific folder/type
   */
  static getBucketName(folder = 'general') {
    return BUCKET_MAP[folder.toLowerCase()] || 'neardairy-general';
  }

  /**
   * Upload file to separate Supabase Storage Bucket (with local disk fallback)
   */
  static async uploadFile({ buffer, mimetype, originalname, folder = 'general' }) {
    const bucketName = this.getBucketName(folder);
    const ext = path.extname(originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const filename = `${folder}-${uniqueSuffix}${ext}`;
    const filePath = `${filename}`;

    try {
      await ensureBuckets();

      // Attempt upload to dedicated Supabase Storage Bucket
      const { data, error } = await storageClient.storage
        .from(bucketName)
        .upload(filePath, buffer, {
          contentType: mimetype,
          cacheControl: '3600',
          upsert: true,
        });

      if (error) {
        throw error;
      }

      // Get public CDN URL
      const { data: publicUrlData } = storageClient.storage
        .from(bucketName)
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      return {
        success: true,
        url: publicUrl,
        path: filePath,
        filename,
        originalname,
        mimetype,
        size: buffer.length,
        storage_type: 'supabase',
        bucket: bucketName,
        folder,
      };
    } catch (supabaseError) {
      console.warn(`⚠️ Supabase upload notice for bucket ${bucketName} (${supabaseError.message}). Using local disk fallback...`);

      // Fallback: Save to public/uploads/[folder]/[filename]
      const localDestDir = path.join(UPLOADS_BASE, folder);
      if (!fs.existsSync(localDestDir)) {
        fs.mkdirSync(localDestDir, { recursive: true });
      }

      const localFilePath = path.join(localDestDir, filename);
      fs.writeFileSync(localFilePath, buffer);

      const localUrl = `/uploads/${folder}/${filename}`;

      return {
        success: true,
        url: localUrl,
        path: filePath,
        filename,
        originalname,
        mimetype,
        size: buffer.length,
        storage_type: 'local',
        bucket: null,
        folder,
      };
    }
  }

  /**
   * Delete file from any Supabase Storage bucket or local disk
   */
  static async deleteFile(fileUrlOrPath) {
    if (!fileUrlOrPath) {
      return { success: false, message: 'No file URL provided.' };
    }

    try {
      // 1. Check if it's a Supabase URL and identify which bucket it belongs to
      if (fileUrlOrPath.includes('supabase.co/storage/v1/object/public/')) {
        for (const bucket of ALL_BUCKETS) {
          const searchPattern = `/storage/v1/object/public/${bucket}/`;
          if (fileUrlOrPath.includes(searchPattern)) {
            const parts = fileUrlOrPath.split(searchPattern);
            if (parts.length > 1) {
              const storagePath = parts[1];
              const { error } = await storageClient.storage.from(bucket).remove([storagePath]);
              if (error) throw error;
              return { success: true, message: `File deleted from Supabase bucket "${bucket}".`, bucket, path: storagePath };
            }
          }
        }
      }

      // 2. Check if it's a local /uploads/ URL
      if (fileUrlOrPath.startsWith('/uploads/')) {
        const relativePath = fileUrlOrPath.replace('/uploads/', '');
        const localPath = path.join(UPLOADS_BASE, relativePath);
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
          return { success: true, message: 'File deleted from local disk.', path: relativePath };
        }
      }

      // 3. Fallback: try removing from general bucket
      if (!fileUrlOrPath.startsWith('http') && !fileUrlOrPath.startsWith('/')) {
        for (const bucket of ALL_BUCKETS) {
          try {
            await storageClient.storage.from(bucket).remove([fileUrlOrPath]);
          } catch {
            // continue
          }
        }
        return { success: true, message: 'File deleted from Supabase Storage.', path: fileUrlOrPath };
      }

      return { success: true, message: 'File reference removed.' };
    } catch (err) {
      console.warn('Delete file notice:', err.message);
      return { success: false, message: err.message };
    }
  }

  /**
   * Update / Replace an existing file in its dedicated bucket
   */
  static async updateFile({ oldUrl, buffer, mimetype, originalname, folder = 'general' }) {
    // 1. Upload new file first to target bucket
    const newUpload = await this.uploadFile({ buffer, mimetype, originalname, folder });

    // 2. If upload succeeded and oldUrl exists, delete the old file to replace it cleanly
    if (newUpload.success && oldUrl) {
      try {
        await this.deleteFile(oldUrl);
      } catch (delErr) {
        console.warn('Could not remove old file during update:', delErr.message);
      }
    }

    return newUpload;
  }
}

module.exports = { StorageService, BUCKET_MAP, ALL_BUCKETS };
