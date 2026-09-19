const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateUser, requireRole } = require('../middleware/auth.middleware');

/**
 * POST /api/orders
 * Customer places a one-time or on-demand order
 */
router.post('/', authenticateUser, requireRole('customer', 'admin'), async (req, res, next) => {
  try {
    const {
      dairy_id,
      items,
      total_amount,
      delivery_address,
      delivery_lat,
      delivery_lng,
      delivery_date,
      delivery_slot = 'morning',
      payment_status = 'paid',
      payment_id,
    } = req.body;

    if (!dairy_id || !items || !items.length || !delivery_address || total_amount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Dairy ID, order items, delivery address, and total amount are required.',
      });
    }

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        customer_id: req.user.id,
        dairy_id,
        order_type: 'one_time',
        items,
        total_amount: parseFloat(total_amount),
        payment_status,
        payment_id: payment_id || null,
        delivery_status: 'pending',
        delivery_date: delivery_date || new Date().toISOString().split('T')[0],
        delivery_slot,
        delivery_address,
        delivery_lat: delivery_lat ? parseFloat(delivery_lat) : null,
        delivery_lng: delivery_lng ? parseFloat(delivery_lng) : null,
      })
      .select('*, dairy:dairies(*)')
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Order placed successfully! The dairy partner has received your delivery request.',
      order,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/orders/my
 * Customer lists their order history and live delivery statuses
 */
router.get('/my', authenticateUser, async (req, res, next) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*, dairy:dairies(id, dairy_name, phone, address, banner_image)')
      .eq('customer_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      orders: orders || [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/orders/partner/roster
 * Partner gets daily dispatch sheet / delivery roster for a given date
 */
router.get('/partner/roster', authenticateUser, requireRole('partner', 'admin'), async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    // Find dairy owned by partner
    const { data: dairy } = await supabase
      .from('dairies')
      .select('id, dairy_name')
      .eq('owner_id', req.user.id)
      .single();

    if (!dairy) {
      return res.status(404).json({
        success: false,
        message: 'No dairy profile found for your account.',
      });
    }

    // 1. Fetch one-time orders for this date
    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('*, customer:customer_profiles!orders_customer_id_fkey(full_name, phone, email, avatar_url)')
      .eq('dairy_id', dairy.id)
      .eq('delivery_date', date)
      .order('created_at', { ascending: true });

    if (ordersErr) throw ordersErr;

    // 2. Fetch subscriptions (active and paused) for this dairy
    const { data: subscriptions, error: subsErr } = await supabase
      .from('subscriptions')
      .select('*, product:products(*), customer:customer_profiles!subscriptions_customer_id_fkey(full_name, phone, email, avatar_url)')
      .eq('dairy_id', dairy.id)
      .in('status', ['active', 'paused']);

    if (subsErr) throw subsErr;

    // Merge & format roster
    const morningRoster = [];
    const eveningRoster = [];
    const pausedRoster = [];

    // Process one-time orders
    (orders || []).forEach(o => {
      const item = {
        id: o.id,
        type: o.order_type,
        customer_name: o.customer?.full_name || 'Customer',
        customer_phone: o.customer?.phone || 'N/A',
        address: o.delivery_address,
        lat: o.delivery_lat,
        lng: o.delivery_lng,
        slot: o.delivery_slot,
        items: o.items,
        total_amount: o.total_amount,
        status: o.delivery_status,
        payment_status: o.payment_status,
      };

      if (o.delivery_slot === 'evening') {
        eveningRoster.push(item);
      } else {
        morningRoster.push(item);
      }
    });

    // Process recurring subscriptions
    (subscriptions || []).forEach(s => {
      // Check if paused on this specific date
      let isPausedToday = false;
      if (s.status === 'paused') {
        if (s.pause_start_date) {
          if (s.pause_end_date) {
            isPausedToday = (date >= s.pause_start_date && date <= s.pause_end_date);
          } else {
            isPausedToday = (date >= s.pause_start_date);
          }
        } else {
          isPausedToday = true;
        }
      }

      if (isPausedToday) {
        pausedRoster.push({
          id: `paused-sub-${s.id}`,
          subscription_id: s.id,
          customer_name: s.customer?.full_name || 'Subscriber',
          customer_phone: s.customer?.phone || 'N/A',
          address: s.delivery_address,
          lat: s.delivery_lat,
          lng: s.delivery_lng,
          slot: s.slot,
          quantity: s.quantity,
          product_name: s.product?.name || 'Milk',
          pause_start_date: s.pause_start_date,
          pause_end_date: s.pause_end_date,
          pause_reason: s.pause_reason || 'Personal / Vacation',
          pause_notes: s.pause_notes || '',
          paused_days_count: s.paused_days_count || 0,
          adjusted_credit_amount: s.adjusted_credit_amount || 0,
        });
        return;
      }

      // Check if already generated in orders for today
      const alreadyInOrders = (orders || []).some(o => o.subscription_id === s.id);
      if (!alreadyInOrders) {
        const item = {
          id: `sub-${s.id}`,
          subscription_id: s.id,
          type: 'subscription_daily',
          customer_name: s.customer?.full_name || 'Subscriber',
          customer_phone: s.customer?.phone || 'N/A',
          address: s.delivery_address,
          lat: s.delivery_lat,
          lng: s.delivery_lng,
          slot: s.slot,
          items: [{
            product_id: s.product?.id,
            name: s.product?.name || 'Milk',
            milk_type: s.product?.milk_type || 'Fresh Milk',
            quantity: s.quantity,
            unit_price: s.product?.price_per_unit || 0,
            total_price: (s.quantity || 1) * (s.product?.price_per_unit || 0),
          }],
          total_amount: (s.quantity || 1) * (s.product?.price_per_unit || 0),
          status: 'pending',
          payment_status: 'paid',
        };

        if (s.slot === 'evening') {
          eveningRoster.push(item);
        } else if (s.slot === 'both') {
          morningRoster.push({ ...item, slot: 'morning' });
          eveningRoster.push({ ...item, slot: 'evening' });
        } else {
          morningRoster.push(item);
        }
      }
    });

    res.json({
      success: true,
      date,
      dairy_name: dairy.dairy_name,
      summary: {
        total_deliveries: morningRoster.length + eveningRoster.length,
        morning_count: morningRoster.length,
        evening_count: eveningRoster.length,
        paused_count: pausedRoster.length,
      },
      morning: morningRoster,
      evening: eveningRoster,
      paused_today: pausedRoster,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/orders/:id/delivery-status
 * Partner updates delivery status (out_for_delivery, delivered)
 */
router.patch('/:id/delivery-status', authenticateUser, requireRole('partner', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { delivery_status } = req.body;

    if (!['pending', 'out_for_delivery', 'delivered', 'cancelled'].includes(delivery_status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid delivery status.',
      });
    }

    // If it's a dynamic subscription item prefixed with 'sub-', create concrete order record
    if (id.startsWith('sub-')) {
      const subId = id.replace('sub-', '');
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('*, product:products(*)')
        .eq('id', subId)
        .single();

      if (!sub) {
        return res.status(404).json({ success: false, message: 'Subscription not found.' });
      }

      const totalAmount = (sub.quantity || 1) * (sub.product?.price_per_unit || 0);
      const { data: newOrder, error } = await supabase
        .from('orders')
        .insert({
          customer_id: sub.customer_id,
          dairy_id: sub.dairy_id,
          subscription_id: sub.id,
          order_type: 'subscription_daily',
          items: [{
            product_id: sub.product?.id,
            name: sub.product?.name,
            quantity: sub.quantity,
            unit_price: sub.product?.price_per_unit,
            total_price: totalAmount,
          }],
          total_amount: totalAmount,
          payment_status: 'paid',
          delivery_status,
          delivery_date: new Date().toISOString().split('T')[0],
          delivery_slot: sub.slot === 'both' ? 'morning' : sub.slot,
          delivery_address: sub.delivery_address,
          delivery_lat: sub.delivery_lat,
          delivery_lng: sub.delivery_lng,
        })
        .select()
        .single();

      if (error) throw error;

      return res.json({
        success: true,
        message: `Delivery status updated to '${delivery_status}'.`,
        order: newOrder,
      });
    }

    const { data: order, error } = await supabase
      .from('orders')
      .update({ delivery_status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Delivery status updated to '${delivery_status}'.`,
      order,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
