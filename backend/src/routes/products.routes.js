const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateUser, requireRole } = require('../middleware/auth.middleware');

/**
 * GET /api/products/dairy/:dairyId
 * Public endpoint to list products for a specific dairy
 */
router.get('/dairy/:dairyId', async (req, res, next) => {
  try {
    const { dairyId } = req.params;
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('dairy_id', dairyId)
      .eq('is_available', true)
      .order('price_per_unit', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      products: products || [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/products
 * Partner creates a new product for their dairy
 */
router.post('/', authenticateUser, requireRole('partner', 'admin'), async (req, res, next) => {
  try {
    const {
      name,
      milk_type,
      description,
      fat_content,
      snf_content,
      unit = 'Litre',
      price_per_unit,
      is_available = true,
      image_url,
      dairy_id,
    } = req.body;

    if (!name || !milk_type || price_per_unit === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Product name, milk type, and price are required.',
      });
    }

    let targetDairyId = dairy_id;

    if (!targetDairyId) {
      // Find dairy belonging to current partner
      const { data: dairy, error: dairyErr } = await supabase
        .from('dairies')
        .select('id')
        .eq('owner_id', req.user.id)
        .single();

      if (dairyErr || !dairy) {
        return res.status(404).json({
          success: false,
          message: 'No dairy profile found for your partner account.',
        });
      }
      targetDairyId = dairy.id;
    }

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        dairy_id: targetDairyId,
        name,
        milk_type,
        description,
        fat_content: fat_content ? parseFloat(fat_content) : null,
        snf_content: snf_content ? parseFloat(snf_content) : null,
        unit,
        price_per_unit: parseFloat(price_per_unit),
        is_available,
        image_url: image_url || 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400',
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Product added successfully.',
      product,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/products/:id
 * Partner updates a product
 */
router.put('/:id', authenticateUser, requireRole('partner', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      milk_type,
      description,
      fat_content,
      snf_content,
      unit,
      price_per_unit,
      is_available,
      image_url,
    } = req.body;

    const updates = {};
    if (name) updates.name = name;
    if (milk_type) updates.milk_type = milk_type;
    if (description !== undefined) updates.description = description;
    if (fat_content !== undefined) updates.fat_content = (fat_content === '' || fat_content === null) ? null : parseFloat(fat_content);
    if (snf_content !== undefined) updates.snf_content = (snf_content === '' || snf_content === null) ? null : parseFloat(snf_content);
    if (unit) updates.unit = unit;
    if (price_per_unit !== undefined && price_per_unit !== '') updates.price_per_unit = parseFloat(price_per_unit);
    if (is_available !== undefined) updates.is_available = is_available;
    if (image_url !== undefined) updates.image_url = image_url;

    const { data: product, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Product updated successfully.',
      product,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/products/:id
 * Partner deletes a product
 */
router.delete('/:id', authenticateUser, requireRole('partner', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Product deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
