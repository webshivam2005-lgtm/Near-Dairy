const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateUser, requireRole } = require('../middleware/auth.middleware');

/**
 * POST /api/subscriptions
 * Customer subscribes to daily/alternate milk delivery
 * Computes platform fee per subscription charged to dairy partner
 */
router.post('/', authenticateUser, requireRole('customer', 'admin'), async (req, res, next) => {
  try {
    const {
      dairy_id,
      product_id,
      frequency = 'daily',
      custom_days,
      quantity = 1.0,
      slot = 'morning',
      delivery_address,
      delivery_lat,
      delivery_lng,
      start_date,
      end_date,
      notes,
    } = req.body;

    if (!dairy_id || !product_id || !delivery_address) {
      return res.status(400).json({
        success: false,
        message: 'Dairy, product, and delivery address are required to create a subscription.',
      });
    }

    // Verify product belongs to dairy
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .eq('id', product_id)
      .eq('dairy_id', dairy_id)
      .single();

    if (prodErr || !product) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product or product does not belong to the selected dairy.',
      });
    }

    // Fetch dairy details & platform fee per subscription
    const { data: dairy } = await supabase
      .from('dairies')
      .select('id, platform_fee_per_sub')
      .eq('id', dairy_id)
      .single();

    const qty = parseFloat(quantity) || 1.0;
    let monthlyDays = 30;
    if (frequency === 'alternate') monthlyDays = 15;
    else if (frequency === 'custom' && Array.isArray(custom_days)) monthlyDays = Math.max(1, custom_days.length * 4.3);

    const monthlyVolume = parseFloat((qty * monthlyDays).toFixed(1));
    const unitPrice = parseFloat(product.price_per_unit) || 65.0;
    const monthlyGross = parseFloat((monthlyVolume * unitPrice).toFixed(2));
    const platformFee = parseFloat(dairy?.platform_fee_per_sub) || 50.00;
    const partnerNet = parseFloat(Math.max(0, monthlyGross - platformFee).toFixed(2));

    const subPayload = {
      customer_id: req.user.id,
      dairy_id,
      product_id,
      frequency,
      custom_days: custom_days || null,
      quantity: qty,
      slot,
      delivery_address,
      delivery_lat: delivery_lat ? parseFloat(delivery_lat) : null,
      delivery_lng: delivery_lng ? parseFloat(delivery_lng) : null,
      start_date: start_date || new Date().toISOString().split('T')[0],
      end_date: end_date || null,
      status: 'active',
      notes: notes || null,
      platform_fee: platformFee,
      monthly_volume_litres: monthlyVolume,
      monthly_gross_amount: monthlyGross,
      partner_net_amount: partnerNet,
      platform_fee_status: 'deducted',
    };

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .insert(subPayload)
      .select('*, product:products(*), dairy:dairies(*)')
      .single();

    if (error) throw error;

    // Also generate an initial order record for today/tomorrow
    const initialAmount = qty * unitPrice;
    await supabase.from('orders').insert({
      customer_id: req.user.id,
      dairy_id,
      subscription_id: subscription.id,
      order_type: 'subscription_daily',
      items: [{
        product_id: product.id,
        name: product.name,
        milk_type: product.milk_type,
        quantity: qty,
        unit_price: unitPrice,
        total_price: initialAmount,
      }],
      total_amount: initialAmount,
      payment_status: 'paid',
      delivery_status: 'pending',
      delivery_date: start_date || new Date().toISOString().split('T')[0],
      delivery_slot: slot,
      delivery_address,
      delivery_lat: delivery_lat ? parseFloat(delivery_lat) : null,
      delivery_lng: delivery_lng ? parseFloat(delivery_lng) : null,
    });

    res.status(201).json({
      success: true,
      message: 'Milk delivery subscription created successfully! Your deliveries will begin as scheduled.',
      subscription,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscriptions/my
 * Customer lists their subscriptions
 */
router.get('/my', authenticateUser, async (req, res, next) => {
  try {
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('*, product:products(*), dairy:dairies(*)')
      .eq('customer_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      subscriptions: subscriptions || [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper to format date for human display (e.g. 24 Aug 2026)
 */
function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * PATCH /api/subscriptions/:id/status
 * Customer pauses, resumes, or cancels a subscription
 * Handles date ranges, automatic billing credit calculations, and partner notifications
 */
router.patch('/:id/status', authenticateUser, async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      status,
      pause_start_date,
      pause_end_date,
      pause_reason,
      pause_notes,
    } = req.body;

    if (!['active', 'paused', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be active, paused, or cancelled.',
      });
    }

    // 1. Fetch current subscription details with product & dairy
    const { data: existingSub, error: fetchErr } = await supabase
      .from('subscriptions')
      .select('*, product:products(*), dairy:dairies(*)')
      .eq('id', id)
      .single();

    if (fetchErr || !existingSub) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found.',
      });
    }

    // Verify user owns subscription or is partner/admin
    if (req.user.role === 'customer' && existingSub.customer_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to modify this subscription.',
      });
    }

    // Fetch customer profile details
    const { data: customerProfile } = await supabase
      .from('customer_profiles')
      .select('*')
      .eq('id', existingSub.customer_id)
      .single();

    const customerName = customerProfile?.full_name || req.user.full_name || 'Customer';
    const customerPhone = customerProfile?.phone || req.user.phone || 'N/A';
    const customerAddress = customerProfile?.address || existingSub.delivery_address || 'Address on record';
    const productName = existingSub.product?.name || 'Fresh Milk';
    const unitPrice = parseFloat(existingSub.product?.price_per_unit) || 65.0;
    const qty = parseFloat(existingSub.quantity) || 1.0;
    const dailyCost = qty * unitPrice;
    const platformFee = parseFloat(existingSub.platform_fee || existingSub.dairy?.platform_fee_per_sub) || 50.00;

    let updatePayload = {
      status,
      updated_at: new Date().toISOString(),
    };

    let responseMessage = `Subscription status updated to '${status}'.`;

    // 2. Handle PAUSE state
    if (status === 'paused') {
      const startDate = pause_start_date || new Date().toISOString().split('T')[0];
      const endDate = pause_end_date || null;
      let pausedDays = 0;

      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = end.getTime() - start.getTime();
        pausedDays = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1);
      }

      // Calculate credit amount adjusted
      const creditAmount = parseFloat((pausedDays * dailyCost).toFixed(2));
      
      // Calculate adjusted monthly billing
      let standardDays = 30;
      if (existingSub.frequency === 'alternate') standardDays = 15;
      const activeDays = Math.max(0, standardDays - pausedDays);
      const adjustedVolume = parseFloat((activeDays * qty).toFixed(1));
      const adjustedGross = parseFloat((activeDays * dailyCost).toFixed(2));
      const adjustedPartnerNet = parseFloat(Math.max(0, adjustedGross - platformFee).toFixed(2));

      updatePayload = {
        ...updatePayload,
        pause_start_date: startDate,
        pause_end_date: endDate,
        pause_reason: pause_reason || 'Personal / Vacation',
        pause_notes: pause_notes || null,
        paused_days_count: pausedDays,
        adjusted_credit_amount: creditAmount,
        monthly_volume_litres: adjustedVolume,
        monthly_gross_amount: adjustedGross,
        partner_net_amount: adjustedPartnerNet,
      };

      const startLabel = formatDateLabel(startDate);
      const endLabel = endDate ? formatDateLabel(endDate) : 'Until Manually Resumed';
      const rangeText = `${startLabel} to ${endLabel}`;
      const daysText = pausedDays > 0 ? ` (${pausedDays} days)` : '';

      responseMessage = `Delivery paused from ${rangeText}. ₹${creditAmount.toFixed(2)} has been credited to your billing amount.`;

      // Notify Partner (Dairy Owner)
      if (existingSub.dairy?.owner_id) {
        await supabase.from('notifications').insert({
          recipient_id: existingSub.dairy.owner_id,
          dairy_id: existingSub.dairy_id,
          subscription_id: existingSub.id,
          type: 'delivery_paused',
          title: `⏸ Delivery Paused: ${customerName}`,
          message: `${customerName} paused ${qty}L ${productName} (${existingSub.slot.toUpperCase()}) from ${rangeText}${daysText}. Reason: ${pause_reason || 'Personal / Vacation'}. Adjusted Credit: ₹${creditAmount.toFixed(2)}.`,
          data: {
            subscription_id: existingSub.id,
            customer_id: existingSub.customer_id,
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_address: customerAddress,
            product_name: productName,
            quantity: qty,
            slot: existingSub.slot,
            pause_start_date: startDate,
            pause_end_date: endDate,
            paused_days: pausedDays,
            adjusted_credit_amount: creditAmount,
            reason: pause_reason || 'Personal / Vacation',
            notes: pause_notes || '',
          },
          is_read: false,
        });
      }

      // Notify Customer Confirmation
      await supabase.from('notifications').insert({
        recipient_id: existingSub.customer_id,
        dairy_id: existingSub.dairy_id,
        subscription_id: existingSub.id,
        type: 'delivery_paused_confirm',
        title: '⏸ Milk Delivery Paused',
        message: `Your ${qty}L ${productName} delivery is paused from ${rangeText}. Total ₹${creditAmount.toFixed(2)} adjusted as billing credit.`,
        data: {
          subscription_id: existingSub.id,
          product_name: productName,
          quantity: qty,
          pause_start_date: startDate,
          pause_end_date: endDate,
          paused_days: pausedDays,
          adjusted_credit_amount: creditAmount,
        },
        is_read: false,
      });
    }

    // 3. Handle RESUME state
    else if (status === 'active') {
      let monthlyDays = 30;
      if (existingSub.frequency === 'alternate') monthlyDays = 15;
      else if (existingSub.frequency === 'custom' && Array.isArray(existingSub.custom_days)) {
        monthlyDays = Math.max(1, existingSub.custom_days.length * 4.3);
      }

      const monthlyVolume = parseFloat((qty * monthlyDays).toFixed(1));
      const monthlyGross = parseFloat((monthlyVolume * unitPrice).toFixed(2));
      const partnerNet = parseFloat(Math.max(0, monthlyGross - platformFee).toFixed(2));

      updatePayload = {
        ...updatePayload,
        pause_start_date: null,
        pause_end_date: null,
        pause_reason: null,
        pause_notes: null,
        paused_days_count: 0,
        adjusted_credit_amount: 0.00,
        monthly_volume_litres: monthlyVolume,
        monthly_gross_amount: monthlyGross,
        partner_net_amount: partnerNet,
      };

      responseMessage = `Subscription resumed! Deliveries will begin with the next scheduled ${existingSub.slot} dispatch.`;

      // Notify Partner
      if (existingSub.dairy?.owner_id) {
        await supabase.from('notifications').insert({
          recipient_id: existingSub.dairy.owner_id,
          dairy_id: existingSub.dairy_id,
          subscription_id: existingSub.id,
          type: 'delivery_resumed',
          title: `▶ Delivery Resumed: ${customerName}`,
          message: `${customerName} has resumed their ${qty}L ${productName} (${existingSub.slot.toUpperCase()}) daily delivery starting from next dispatch.`,
          data: {
            subscription_id: existingSub.id,
            customer_id: existingSub.customer_id,
            customer_name: customerName,
            customer_phone: customerPhone,
            customer_address: customerAddress,
            product_name: productName,
            quantity: qty,
            slot: existingSub.slot,
          },
          is_read: false,
        });
      }

      // Notify Customer Confirmation
      await supabase.from('notifications').insert({
        recipient_id: existingSub.customer_id,
        dairy_id: existingSub.dairy_id,
        subscription_id: existingSub.id,
        type: 'delivery_resumed_confirm',
        title: '▶ Milk Delivery Resumed',
        message: `Your ${qty}L ${productName} recurring delivery has been resumed. Deliveries will arrive at your scheduled ${existingSub.slot} slot.`,
        data: {
          subscription_id: existingSub.id,
          product_name: productName,
          quantity: qty,
          slot: existingSub.slot,
        },
        is_read: false,
      });
    }

    // 4. Handle CANCELLED state
    else if (status === 'cancelled') {
      updatePayload = {
        ...updatePayload,
        end_date: new Date().toISOString().split('T')[0],
      };

      responseMessage = 'Subscription has been cancelled. Recurring deliveries stopped.';

      // Notify Partner
      if (existingSub.dairy?.owner_id) {
        await supabase.from('notifications').insert({
          recipient_id: existingSub.dairy.owner_id,
          dairy_id: existingSub.dairy_id,
          subscription_id: existingSub.id,
          type: 'subscription_cancelled',
          title: `🚫 Subscription Cancelled: ${customerName}`,
          message: `${customerName} cancelled their ${qty}L ${productName} subscription.`,
          data: {
            subscription_id: existingSub.id,
            customer_id: existingSub.customer_id,
            customer_name: customerName,
            customer_phone: customerPhone,
            product_name: productName,
          },
          is_read: false,
        });
      }
    }

    // 5. Update in database
    const { data: updatedSub, error: updateErr } = await supabase
      .from('subscriptions')
      .update(updatePayload)
      .eq('id', id)
      .select('*, product:products(*), dairy:dairies(*)')
      .single();

    if (updateErr) throw updateErr;

    res.json({
      success: true,
      message: responseMessage,
      subscription: updatedSub,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/subscriptions/:id
 * Customer updates subscription parameters (quantity, frequency, slot, address)
 */
router.put('/:id', authenticateUser, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quantity, frequency, slot, delivery_address, delivery_lat, delivery_lng, notes } = req.body;

    const updates = {
      updated_at: new Date().toISOString(),
    };
    if (quantity !== undefined) updates.quantity = parseFloat(quantity);
    if (frequency) updates.frequency = frequency;
    if (slot) updates.slot = slot;
    if (delivery_address) updates.delivery_address = delivery_address;
    if (delivery_lat !== undefined) updates.delivery_lat = parseFloat(delivery_lat);
    if (delivery_lng !== undefined) updates.delivery_lng = parseFloat(delivery_lng);
    if (notes !== undefined) updates.notes = notes;

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .update(updates)
      .eq('id', id)
      .select('*, product:products(*), dairy:dairies(*)')
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Subscription updated successfully.',
      subscription,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscriptions/partner/all
 * Partner fetches all active & paused subscriptions with Platform Fee & Payout calculations
 */
router.get('/partner/all', authenticateUser, requireRole('partner', 'admin'), async (req, res, next) => {
  try {
    // Find dairy
    const { data: dairy } = await supabase
      .from('dairies')
      .select('id, platform_fee_per_sub')
      .eq('owner_id', req.user.id)
      .single();

    if (!dairy) {
      return res.status(404).json({
        success: false,
        message: 'No dairy found for this partner.',
      });
    }

    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('*, product:products(*), customer:customer_profiles!subscriptions_customer_id_fkey(*)')
      .eq('dairy_id', dairy.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const subs = subscriptions || [];
    const activeSubs = subs.filter(s => s.status === 'active');
    const pausedSubs = subs.filter(s => s.status === 'paused');
    const platformFeeRate = parseFloat(dairy.platform_fee_per_sub) || 50.00;

    const totalGrossRevenue = activeSubs.reduce((sum, s) => {
      const gross = parseFloat(s.monthly_gross_amount);
      if (!isNaN(gross) && gross > 0) return sum + gross;
      const vol = (parseFloat(s.quantity) || 1.0) * 30;
      const price = parseFloat(s.product?.price_per_unit) || 65.0;
      return sum + (vol * price);
    }, 0);

    const totalPlatformFees = activeSubs.length * platformFeeRate;
    const netPartnerPayout = Math.max(0, totalGrossRevenue - totalPlatformFees);

    const totalAdjustedCredits = pausedSubs.reduce((sum, s) => {
      return sum + (parseFloat(s.adjusted_credit_amount) || 0);
    }, 0);

    res.json({
      success: true,
      financials: {
        total_subscribers: subs.length,
        active_subscribers: activeSubs.length,
        paused_subscribers: pausedSubs.length,
        platform_fee_per_sub: platformFeeRate,
        total_gross_revenue: parseFloat(totalGrossRevenue.toFixed(2)),
        total_platform_fees: parseFloat(totalPlatformFees.toFixed(2)),
        net_partner_payout: parseFloat(netPartnerPayout.toFixed(2)),
        total_paused_credits: parseFloat(totalAdjustedCredits.toFixed(2)),
      },
      subscriptions: subs,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
