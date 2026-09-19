const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateUser, requireRole } = require('../middleware/auth.middleware');

/**
 * POST /api/complaints
 * Customer raises a complaint or issue
 */
router.post('/', authenticateUser, requireRole('customer', 'admin'), async (req, res, next) => {
  try {
    const { dairy_id, order_id, issue_type, description } = req.body;

    if (!dairy_id || !issue_type || !description) {
      return res.status(400).json({
        success: false,
        message: 'Dairy ID, Issue Type, and Description are required.',
      });
    }

    const { data: complaint, error } = await supabase
      .from('complaints')
      .insert({
        customer_id: req.user.id,
        dairy_id,
        order_id: order_id || null,
        issue_type,
        description,
        status: 'open',
      })
      .select('*, dairy:dairies(dairy_name)')
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully. Our support & the dairy partner will investigate promptly.',
      complaint,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/complaints/my
 * Customer lists their complaints
 */
router.get('/my', authenticateUser, async (req, res, next) => {
  try {
    const { data: complaints, error } = await supabase
      .from('complaints')
      .select('*, dairy:dairies(dairy_name, phone)')
      .eq('customer_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      complaints: complaints || [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/complaints/partner
 * Partner lists complaints filed against their dairy
 */
router.get('/partner', authenticateUser, requireRole('partner', 'admin'), async (req, res, next) => {
  try {
    const { data: dairy } = await supabase
      .from('dairies')
      .select('id')
      .eq('owner_id', req.user.id)
      .single();

    if (!dairy) {
      return res.status(404).json({ success: false, message: 'Dairy not found.' });
    }

    const { data: complaints, error } = await supabase
      .from('complaints')
      .select('*, customer:customer_profiles!complaints_customer_id_fkey(full_name, email, phone)')
      .eq('dairy_id', dairy.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      complaints: complaints || [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/complaints/all
 * Admin lists all platform complaints
 */
router.get('/all', authenticateUser, requireRole('admin'), async (req, res, next) => {
  try {
    const { data: complaints, error } = await supabase
      .from('complaints')
      .select('*, customer:customer_profiles!complaints_customer_id_fkey(full_name, email, phone), dairy:dairies(dairy_name, phone)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      complaints: complaints || [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/complaints/:id/resolve
 * Admin or Partner resolves a complaint
 */
router.patch('/:id/resolve', authenticateUser, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status = 'resolved', resolution_notes } = req.body;

    const { data: complaint, error } = await supabase
      .from('complaints')
      .update({
        status,
        resolution_notes: resolution_notes || 'Resolved by support team.',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Complaint marked as resolved.',
      complaint,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
