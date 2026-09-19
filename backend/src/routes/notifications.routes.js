const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateUser } = require('../middleware/auth.middleware');

/**
 * GET /api/notifications
 * Fetch notifications for authenticated user (partner or customer)
 * Supports ?unread_only=true, ?type=..., ?limit=50
 */
router.get('/', authenticateUser, async (req, res, next) => {
  try {
    const { unread_only, type, limit = 50 } = req.query;

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit) || 50);

    if (unread_only === 'true') {
      query = query.eq('is_read', false);
    }

    if (type) {
      query = query.eq('type', type);
    }

    const { data: notifications, error } = await query;
    if (error) throw error;

    // Count unread notifications
    const { count: unreadCount, error: countErr } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', req.user.id)
      .eq('is_read', false);

    if (countErr) throw countErr;

    res.json({
      success: true,
      unread_count: unreadCount || 0,
      notifications: notifications || [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read
 */
router.patch('/:id/read', authenticateUser, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: notification, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('recipient_id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Notification marked as read.',
      notification,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read for current user
 */
router.patch('/read-all', authenticateUser, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', req.user.id)
      .eq('is_read', false);

    if (error) throw error;

    res.json({
      success: true,
      message: 'All notifications marked as read.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
router.delete('/:id', authenticateUser, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('recipient_id', req.user.id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Notification removed.',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
