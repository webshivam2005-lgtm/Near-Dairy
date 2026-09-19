const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { authenticateUser, requireRole } = require('../middleware/auth.middleware');
const DairyStore = require('../config/dairyStore');

// Enforce admin role on all admin routes
router.use(authenticateUser, requireRole('admin'));

/**
 * GET /api/admin/stats
 * Platform-wide overview statistics including Platform Fees & Subscriptions Revenue
 */
router.get('/stats', async (req, res, next) => {
  try {
    // 1. Dairies counts
    const { data: dairies } = await supabase.from('dairies').select('id, is_approved, is_active, platform_fee_per_sub');
    const totalDairies = (dairies || []).length;
    const approvedDairies = (dairies || []).filter(d => d.is_approved).length;
    const pendingDairies = (dairies || []).filter(d => !d.is_approved).length;

    // 2. Users counts across separate profile tables
    const [
      { data: customers },
      { data: partners },
      { data: admins },
    ] = await Promise.all([
      supabase.from('customer_profiles').select('id'),
      supabase.from('partner_profiles').select('id'),
      supabase.from('admin_profiles').select('id'),
    ]);

    const customersCount = (customers || []).length;
    const partnersCount = (partners || []).length;
    const adminsCount = (admins || []).length;
    const totalUsers = customersCount + partnersCount + adminsCount;

    // 3. Subscriptions count & Platform Fees
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('id, quantity, status, platform_fee, monthly_gross_amount, partner_net_amount');
    
    const activeSubs = (subs || []).filter(s => s.status === 'active');
    const totalSubscribers = activeSubs.length;
    const estimatedDailyLitres = activeSubs.reduce((sum, s) => sum + (parseFloat(s.quantity) || 1.0), 0);

    const totalPlatformFees = activeSubs.reduce((sum, s) => sum + (parseFloat(s.platform_fee) || 50.0), 0);
    const totalMonthlySubscriptionGross = activeSubs.reduce((sum, s) => sum + (parseFloat(s.monthly_gross_amount) || 0), 0);
    const totalPartnerPayouts = activeSubs.reduce((sum, s) => sum + (parseFloat(s.partner_net_amount) || 0), 0);

    // 4. Total orders and GMV
    const { data: orders } = await supabase.from('orders').select('id, total_amount, payment_status');
    const totalOrders = (orders || []).length;
    const totalGMV = (orders || []).reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);

    // 5. Open complaints count
    const { data: complaints } = await supabase.from('complaints').select('id, status');
    const openComplaints = (complaints || []).filter(c => c.status === 'open').length;

    res.json({
      success: true,
      stats: {
        total_dairies: totalDairies,
        approved_dairies: approvedDairies,
        pending_dairies: pendingDairies,
        total_users: totalUsers,
        customers_count: customersCount,
        partners_count: partnersCount,
        admins_count: adminsCount,
        active_subscribers: totalSubscribers,
        estimated_daily_litres: parseFloat(estimatedDailyLitres.toFixed(1)),
        total_platform_fees: parseFloat(totalPlatformFees.toFixed(2)),
        total_subscription_gross: parseFloat(totalMonthlySubscriptionGross.toFixed(2)),
        total_partner_payouts: parseFloat(totalPartnerPayouts.toFixed(2)),
        total_orders: totalOrders,
        platform_gmv: parseFloat(totalGMV.toFixed(2)),
        open_complaints: openComplaints,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/financials
 * Full platform fee deductions & partner payout breakdown
 */
router.get('/financials', async (req, res, next) => {
  try {
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('*, dairy:dairies(id, dairy_name, platform_fee_per_sub, owner:partner_profiles(full_name, phone)), product:products(name, price_per_unit), customer:customer_profiles(full_name, phone)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const subs = subscriptions || [];
    const activeSubs = subs.filter(s => s.status === 'active');
    const totalFees = activeSubs.reduce((sum, s) => sum + (parseFloat(s.platform_fee) || 50.0), 0);
    const totalGross = activeSubs.reduce((sum, s) => sum + (parseFloat(s.monthly_gross_amount) || 0), 0);
    const totalPayouts = activeSubs.reduce((sum, s) => sum + (parseFloat(s.partner_net_amount) || 0), 0);

    res.json({
      success: true,
      summary: {
        total_active_subscriptions: activeSubs.length,
        total_platform_fees_earned: parseFloat(totalFees.toFixed(2)),
        total_monthly_gross: parseFloat(totalGross.toFixed(2)),
        total_partner_net_payout: parseFloat(totalPayouts.toFixed(2)),
      },
      subscriptions: subs,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/admin/dairies/:id/platform-fee
 * Set custom platform fee per subscription for a specific dairy
 */
router.patch('/dairies/:id/platform-fee', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { platform_fee_per_sub } = req.body;

    const feeVal = parseFloat(platform_fee_per_sub);
    if (isNaN(feeVal) || feeVal < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid platform fee amount.',
      });
    }

    const { data: dairy, error } = await supabase
      .from('dairies')
      .update({
        platform_fee_per_sub: feeVal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Platform fee updated to ₹${feeVal.toFixed(2)} per subscription for ${dairy.dairy_name}.`,
      dairy: DairyStore.enrichDairy(dairy),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/pending-dairies
 * Vetting queue for new dairy partners
 */
router.get('/pending-dairies', async (req, res, next) => {
  try {
    const { data: pending, error } = await supabase
      .from('dairies')
      .select('*, owner:partner_profiles!dairies_owner_id_fkey(full_name, email, phone, avatar_url)')
      .eq('is_approved', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const enriched = (pending || []).map(d => DairyStore.enrichDairy(d));

    res.json({
      success: true,
      pending: enriched,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/admin/dairies/:id/approve
 * Admin approves a dairy partner application
 */
router.patch('/dairies/:id/approve', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: dairy, error } = await supabase
      .from('dairies')
      .update({
        is_approved: true,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, owner:partner_profiles!dairies_owner_id_fkey(full_name, email)')
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Dairy "${dairy.dairy_name}" has been APPROVED and is now live on Near Dairy!`,
      dairy: DairyStore.enrichDairy(dairy),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/admin/dairies/:id/reject
 * Admin rejects or revokes approval of a dairy partner
 */
router.patch('/dairies/:id/reject', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: dairy, error } = await supabase
      .from('dairies')
      .update({
        is_approved: false,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Dairy "${dairy.dairy_name}" approval was rejected/revoked.`,
      dairy: DairyStore.enrichDairy(dairy),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/admin/dairies/:id/toggle-active
 * Admin suspends or activates a dairy partner
 */
router.patch('/dairies/:id/toggle-active', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const { data: dairy, error } = await supabase
      .from('dairies')
      .update({
        is_active: Boolean(is_active),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: `Dairy "${dairy.dairy_name}" is now ${is_active ? 'active' : 'suspended'}.`,
      dairy: DairyStore.enrichDairy(dairy),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/all-dairies
 * Comprehensive directory of all registered dairies
 */
router.get('/all-dairies', async (req, res, next) => {
  try {
    const { data: dairies, error } = await supabase
      .from('dairies')
      .select('*, owner:partner_profiles!dairies_owner_id_fkey(full_name, email, phone), products(count)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const enriched = (dairies || []).map(d => DairyStore.enrichDairy(d));

    res.json({
      success: true,
      dairies: enriched,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/all-users
 * List of all users in the system across customer, partner, and admin profile tables
 */
router.get('/all-users', async (req, res, next) => {
  try {
    const [
      { data: customers, error: cErr },
      { data: partners, error: pErr },
      { data: admins, error: aErr },
    ] = await Promise.all([
      supabase.from('customer_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('partner_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('admin_profiles').select('*').order('created_at', { ascending: false }),
    ]);

    if (cErr) throw cErr;
    if (pErr) throw pErr;
    if (aErr) throw aErr;

    const sanitizeUser = (u, role) => {
      const { password_hash, ...safe } = u;
      return { ...safe, role };
    };

    const allUsers = [
      ...(customers || []).map(c => sanitizeUser(c, 'customer')),
      ...(partners || []).map(p => sanitizeUser(p, 'partner')),
      ...(admins || []).map(a => sanitizeUser(a, 'admin')),
    ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    res.json({
      success: true,
      users: allUsers,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper to generate standards-compliant CSV (RFC 4180)
 */
function generateCSV(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const headerRow = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',');
  const dataRows = rows.map(row => {
    return headers.map(h => {
      let val = row[h];
      if (val === null || val === undefined) val = '';
      val = String(val).replace(/"/g, '""');
      return `"${val}"`;
    }).join(',');
  });
  return [headerRow, ...dataRows].join('\r\n');
}

/**
 * GET /api/admin/export/:dataset
 * Export live datasets formatted as RFC 4180 CSV with UTF-8 BOM
 */
router.get('/export/:dataset', async (req, res, next) => {
  try {
    const { dataset } = req.params;
    const { format = 'csv' } = req.query;

    let rows = [];
    let filename = `neardairy_${dataset}_${new Date().toISOString().slice(0, 10)}`;

    switch (dataset) {
      case 'users': {
        const [
          { data: customers },
          { data: partners },
          { data: admins },
        ] = await Promise.all([
          supabase.from('customer_profiles').select('*').order('created_at', { ascending: false }),
          supabase.from('partner_profiles').select('*').order('created_at', { ascending: false }),
          supabase.from('admin_profiles').select('*').order('created_at', { ascending: false }),
        ]);

        rows = [
          ...(customers || []).map(c => ({
            user_id: c.id,
            full_name: c.full_name,
            email: c.email,
            phone: c.phone || 'N/A',
            role: 'customer',
            status: 'Active',
            created_at: c.created_at || new Date().toISOString(),
          })),
          ...(partners || []).map(p => ({
            user_id: p.id,
            full_name: p.full_name,
            email: p.email,
            phone: p.phone || 'N/A',
            role: 'partner',
            status: 'Active',
            created_at: p.created_at || new Date().toISOString(),
          })),
          ...(admins || []).map(a => ({
            user_id: a.id,
            full_name: a.full_name,
            email: a.email,
            phone: a.phone || 'N/A',
            role: 'admin',
            status: 'Active (SuperAdmin)',
            created_at: a.created_at || new Date().toISOString(),
          })),
        ];
        break;
      }

      case 'dairies': {
        const { data: dairies } = await supabase
          .from('dairies')
          .select('*, owner:partner_profiles(full_name, email, phone)')
          .order('created_at', { ascending: false });

        const enriched = (dairies || []).map(d => DairyStore.enrichDairy(d));
        rows = enriched.map(d => ({
          dairy_id: d.id,
          farm_name: d.dairy_name,
          owner_name: d.owner?.full_name || d.owner_name || 'N/A',
          owner_email: d.owner?.email || 'N/A',
          owner_phone: d.owner?.phone || 'N/A',
          address: d.address,
          latitude: d.latitude,
          longitude: d.longitude,
          delivery_radius_km: d.delivery_radius_km,
          fssai_license: d.fssai_license || 'N/A',
          is_approved: d.is_approved ? 'Yes' : 'Pending',
          is_active: d.is_active ? 'Active' : 'Paused',
          rating: d.rating || 4.8,
          review_count: d.review_count || 0,
          created_at: d.created_at || new Date().toISOString(),
        }));
        break;
      }

      case 'products': {
        const { data: products } = await supabase
          .from('products')
          .select('*, dairy:dairies(dairy_name)')
          .order('created_at', { ascending: false });

        rows = (products || []).map(p => ({
          product_id: p.id,
          dairy_name: p.dairy?.dairy_name || 'Krishna Pure Dairy',
          product_name: p.name,
          category: p.category || 'Milk',
          price_per_unit_inr: p.price_per_unit,
          fat_percentage: p.fat_percentage || 'N/A',
          snf_percentage: p.snf_percentage || 'N/A',
          unit: p.unit || 'Litre',
          is_available: p.is_available ? 'Available' : 'Out of Stock',
          created_at: p.created_at || new Date().toISOString(),
        }));
        break;
      }

      case 'subscriptions': {
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('*, dairy:dairies(dairy_name), product:products(name, price_per_unit), customer:customer_profiles(full_name, email, phone)')
          .order('created_at', { ascending: false });

        rows = (subs || []).map(s => ({
          subscription_id: s.id,
          customer_name: s.customer?.full_name || 'Valued Customer',
          customer_email: s.customer?.email || 'N/A',
          customer_phone: s.customer?.phone || 'N/A',
          dairy_name: s.dairy?.dairy_name || 'Local Farm',
          product_name: s.product?.name || 'Fresh Milk',
          quantity_litres: s.quantity,
          delivery_slot: s.delivery_slot,
          frequency: s.frequency || 'Daily',
          start_date: s.start_date,
          status: s.status,
          monthly_gross_inr: s.monthly_gross_amount || 0,
          platform_fee_inr: s.platform_fee || 50,
          partner_net_inr: s.partner_net_amount || 0,
          created_at: s.created_at || new Date().toISOString(),
        }));
        break;
      }

      case 'orders': {
        const { data: orders } = await supabase
          .from('orders')
          .select('*, dairy:dairies(dairy_name), customer:customer_profiles(full_name, phone)')
          .order('delivery_date', { ascending: false });

        rows = (orders || []).map(o => ({
          order_id: o.id,
          delivery_date: o.delivery_date,
          customer_name: o.customer?.full_name || 'Customer',
          customer_phone: o.customer?.phone || 'N/A',
          dairy_name: o.dairy?.dairy_name || 'Dairy Farm',
          slot: o.slot || 'Morning',
          quantity_litres: o.quantity || 1,
          delivery_status: o.delivery_status || 'Delivered',
          payment_status: o.payment_status || 'Paid',
          otp_verified: o.otp_verified ? 'Yes' : 'No',
          created_at: o.created_at || new Date().toISOString(),
        }));
        break;
      }

      case 'financials': {
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('*, dairy:dairies(dairy_name), customer:customer_profiles(full_name)')
          .order('created_at', { ascending: false });

        rows = (subs || []).map((s, idx) => ({
          payout_batch_id: `SETTLE-${new Date().getFullYear()}-${1000 + idx}`,
          dairy_name: s.dairy?.dairy_name || 'Dairy Partner',
          subscription_id: s.id,
          customer_name: s.customer?.full_name || 'Customer',
          monthly_gross_volume_inr: s.monthly_gross_amount || 0,
          platform_fee_deducted_inr: s.platform_fee || 50,
          partner_net_payable_inr: s.partner_net_amount || 0,
          settlement_cycle: 'Monthly (Automated Razorpay Route)',
          status: s.status === 'active' ? 'Settled' : 'Pending Review',
          processed_at: s.created_at || new Date().toISOString(),
        }));
        break;
      }

      case 'disputes': {
        const { data: complaints } = await supabase
          .from('complaints')
          .select('*, customer:customer_profiles(full_name, email), dairy:dairies(dairy_name)')
          .order('created_at', { ascending: false });

        rows = (complaints || []).map(c => ({
          ticket_id: c.id,
          customer_name: c.customer?.full_name || 'Customer',
          customer_email: c.customer?.email || 'N/A',
          dairy_name: c.dairy?.dairy_name || 'Dairy Partner',
          issue_type: c.issue_type,
          status: c.status,
          description: c.description,
          resolution_notes: c.resolution_notes || 'Pending investigation',
          created_at: c.created_at || new Date().toISOString(),
        }));
        break;
      }

      default: {
        return res.status(400).json({
          success: false,
          message: `Unknown dataset identifier: "${dataset}". Available datasets: users, dairies, products, subscriptions, orders, financials, disputes.`,
        });
      }
    }

    if (format === 'json') {
      return res.json({
        success: true,
        dataset,
        record_count: rows.length,
        data: rows,
      });
    }

    // Convert rows to CSV string
    const csvContent = generateCSV(rows);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.status(200).send('\uFEFF' + csvContent); // UTF-8 BOM for Excel compatibility

  } catch (error) {
    next(error);
  }
});

module.exports = router;

