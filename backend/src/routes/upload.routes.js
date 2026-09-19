const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { StorageService } = require('../services/storage.service');
const { authenticateUser } = require('../middleware/auth.middleware');
const { supabase } = require('../config/supabase');
const { DairyStore } = require('../config/dairyStore');

// Configure Multer with Memory Storage for direct Cloud streaming
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max
  },
  fileFilter: (req, file, cb) => {
    const type = req.params.type || req.body.type || 'general';
    const allowedImageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (type === 'certificate' || type === 'certificates') {
      const allowedCertExts = [...allowedImageExts, '.pdf'];
      if (allowedCertExts.includes(ext)) {
        return cb(null, true);
      }
      return cb(new Error('Invalid certificate file type. Allowed formats: PDF, JPG, PNG, WEBP.'));
    }

    if (allowedImageExts.includes(ext)) {
      return cb(null, true);
    }
    return cb(new Error(`Invalid image file type (${ext}). Allowed formats: JPG, PNG, WEBP, GIF.`));
  },
});

const folderMap = {
  banner: 'banners',
  banners: 'banners',
  avatar: 'avatars',
  avatars: 'avatars',
  certificate: 'certificates',
  certificates: 'certificates',
  product: 'products',
  products: 'products',
  complaint: 'complaints',
  complaints: 'complaints',
  general: 'general',
};

/**
 * POST /api/upload/:type or /api/upload
 * Upload a new file to Supabase Bucket
 */
router.post(['/', '/:type'], (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File is too large. Maximum allowed size is 15MB.' });
      }
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file was uploaded.' });
    }

    const type = req.params.type || req.body.type || 'general';
    const folder = folderMap[type] || 'general';

    try {
      const result = await StorageService.uploadFile({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
        folder,
      });

      const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');

      res.status(201).json({
        success: true,
        message: 'File uploaded successfully to Supabase Storage.',
        url: result.url,
        path: result.path,
        filename: result.filename,
        originalname: result.originalname,
        mimetype: result.mimetype,
        size: result.size,
        is_pdf: isPdf,
        storage_type: result.storage_type,
        bucket: result.bucket,
        type: folder,
      });
    } catch (uploadErr) {
      next(uploadErr);
    }
  });
});

/**
 * PUT /api/upload/:type or /api/upload
 * Update / Replace an existing file in Supabase Bucket
 */
router.put(['/', '/:type'], (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File is too large. Maximum allowed size is 15MB.' });
      }
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No replacement file was uploaded.' });
    }

    const type = req.params.type || req.body.type || 'general';
    const folder = folderMap[type] || 'general';
    const oldUrl = req.body.old_url || req.query.old_url;

    try {
      const result = await StorageService.updateFile({
        oldUrl,
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
        folder,
      });

      const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');

      res.json({
        success: true,
        message: 'File updated successfully in Supabase Storage.',
        url: result.url,
        path: result.path,
        filename: result.filename,
        originalname: result.originalname,
        mimetype: result.mimetype,
        size: result.size,
        is_pdf: isPdf,
        storage_type: result.storage_type,
        bucket: result.bucket,
        type: folder,
      });
    } catch (updateErr) {
      next(updateErr);
    }
  });
});

/**
 * DELETE /api/upload
 * Delete any file from Supabase Storage by URL / path
 */
router.delete('/', async (req, res, next) => {
  try {
    const fileUrl = req.body.file_url || req.query.file_url || req.body.path || req.query.path;
    if (!fileUrl) {
      return res.status(400).json({ success: false, message: 'file_url parameter is required to delete.' });
    }

    const result = await StorageService.deleteFile(fileUrl);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/upload/avatar
 * Delete user profile avatar from Supabase Storage and reset profile avatar_url
 */
router.delete('/avatar', authenticateUser, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role || 'customer';
    const targetTable = role === 'partner' ? 'partner_profiles' : (role === 'admin' ? 'admin_profiles' : 'customer_profiles');

    const { data: profile } = await supabase
      .from(targetTable)
      .select('avatar_url')
      .eq('id', userId)
      .single();

    if (profile && profile.avatar_url) {
      await StorageService.deleteFile(profile.avatar_url);
      await supabase
        .from(targetTable)
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq('id', userId);
    }

    res.json({
      success: true,
      message: 'Profile photo deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/upload/banner
 * Delete partner dairy storefront banner from Supabase Storage and reset banner_image
 */
router.delete('/banner', authenticateUser, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { data: dairy } = await supabase
      .from('dairies')
      .select('id, banner_image')
      .eq('owner_id', userId)
      .single();

    if (dairy && dairy.banner_image) {
      await StorageService.deleteFile(dairy.banner_image);
      await supabase
        .from('dairies')
        .update({ banner_image: null, updated_at: new Date().toISOString() })
        .eq('id', dairy.id);
    }

    res.json({
      success: true,
      message: 'Dairy storefront banner deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/upload/certificate
 * Delete partner dairy certificate from Supabase Storage and reset certificate_url
 */
router.delete('/certificate', authenticateUser, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { data: dairy } = await supabase
      .from('dairies')
      .select('id, certificate_url')
      .eq('owner_id', userId)
      .single();

    if (dairy) {
      const enriched = DairyStore.enrichDairy(dairy);
      if (enriched.certificate_url) {
        await StorageService.deleteFile(enriched.certificate_url);
      }

      DairyStore.removeCertificate(dairy.id);

      try {
        await supabase
          .from('dairies')
          .update({ certificate_url: null, updated_at: new Date().toISOString() })
          .eq('id', dairy.id);
      } catch (colErr) {
        // Fallback store already cleared
      }
    }

    res.json({
      success: true,
      message: 'Dairy certificate deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
