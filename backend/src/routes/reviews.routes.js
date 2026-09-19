const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateUser, requireRole } = require('../middleware/auth.middleware');

/**
 * POST /api/reviews
 * Customer posts a review for a dairy
 */
router.post('/', authenticateUser, requireRole('customer', 'admin'), async (req, res, next) => {
  try {
    const { dairy_id, rating, comment } = req.body;

    if (!dairy_id || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Valid dairy ID and a rating between 1 and 5 stars are required.',
      });
    }

    // Insert review
    const { data: review, error } = await supabase
      .from('reviews')
      .insert({
        customer_id: req.user.id,
        dairy_id,
        rating: parseInt(rating, 10),
        comment: comment || '',
      })
      .select('*, customer:customer_profiles!reviews_customer_id_fkey(full_name, avatar_url)')
      .single();

    if (error) throw error;

    // Recalculate average rating for the dairy
    const { data: allReviews } = await supabase
      .from('reviews')
      .select('rating')
      .eq('dairy_id', dairy_id);

    if (allReviews && allReviews.length > 0) {
      const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
      await supabase
        .from('dairies')
        .update({
          rating: parseFloat(avg.toFixed(2)),
          rating_count: allReviews.length,
        })
        .eq('id', dairy_id);
    }

    res.status(201).json({
      success: true,
      message: 'Thank you! Your review has been published.',
      review,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reviews/dairy/:dairyId
 * Public endpoint to list reviews for a dairy
 */
router.get('/dairy/:dairyId', async (req, res, next) => {
  try {
    const { dairyId } = req.params;
    const { data: reviews, error } = await supabase
      .from('reviews')
      .select('*, customer:customer_profiles!reviews_customer_id_fkey(full_name, avatar_url)')
      .eq('dairy_id', dairyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      reviews: reviews || [],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
