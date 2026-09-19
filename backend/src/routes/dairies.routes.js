const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const { authenticateUser, requireRole, optionalAuth } = require('../middleware/auth.middleware');
const DairyStore = require('../config/dairyStore');

const db = supabaseAdmin || supabase;

/**
 * GET /api/dairies/nearby
 * Real-time location-based dairy discovery using Leaflet / GPS coordinates
 */
router.get('/nearby', optionalAuth, async (req, res, next) => {
  try {
    const {
      lat,
      lng,
      radius = 25.0,
      milk_type,
      search,
      min_rating,
    } = req.query;

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const searchRadius = parseFloat(radius) || 25.0;

    let dairies = [];

    if (!isNaN(userLat) && !isNaN(userLng)) {
      // Call Supabase search_dairies RPC for geo-distance
      const { data, error } = await db.rpc('search_dairies', {
        user_lat: userLat,
        user_lng: userLng,
        search_radius_km: searchRadius,
      });

      if (error) {
        console.warn('RPC search_dairies fallback to manual query:', error.message);
        // Fallback to direct query
        const { data: directDairies, error: directError } = await db
          .from('dairies')
          .select('*')
          .eq('is_approved', true)
          .eq('is_active', true);

        if (directError) throw directError;

        // Compute client-side haversine distance
        dairies = (directDairies || []).map(d => {
          const R = 6371; // Earth radius in km
          const dLat = (d.latitude - userLat) * Math.PI / 180;
          const dLng = (d.longitude - userLng) * Math.PI / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(userLat * Math.PI / 180) * Math.cos(d.latitude * Math.PI / 180) *
                    Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distance_km = parseFloat((R * c).toFixed(2));
          return {
            ...d,
            distance_km,
            delivers_to_location: distance_km <= (d.delivery_radius_km || 5.0),
          };
        }).filter(d => d.distance_km <= searchRadius)
          .sort((a, b) => a.distance_km - b.distance_km);
      } else {
        dairies = data || [];
      }
    } else {
      // Return all active and approved dairies if no GPS is provided
      const { data, error } = await db
        .from('dairies')
        .select('*')
        .eq('is_approved', true)
        .eq('is_active', true)
        .order('rating', { ascending: false });

      if (error) throw error;
      dairies = (data || []).map(d => ({
        ...d,
        distance_km: null,
        delivers_to_location: true,
      }));
    }

    // Fetch product variants for each discovered dairy
    const dairyIds = dairies.map(d => d.id);
    let productsMap = {};

    if (dairyIds.length > 0) {
      const { data: products } = await db
        .from('products')
        .select('*')
        .in('dairy_id', dairyIds)
        .eq('is_available', true);

      (products || []).forEach(p => {
        if (!productsMap[p.dairy_id]) productsMap[p.dairy_id] = [];
        productsMap[p.dairy_id].push(p);
      });
    }

    // Attach products and enrich with certificates
    let results = dairies.map(d => DairyStore.enrichDairy({
      ...d,
      products: productsMap[d.id] || [],
    }));

    // Filter by milk_type if provided (e.g. 'Cow Milk', 'Buffalo Milk', 'A2 Milk')
    if (milk_type && milk_type !== 'all') {
      const targetType = milk_type.toLowerCase();
      results = results.filter(d =>
        d.products.some(p => p.milk_type.toLowerCase().includes(targetType) || p.name.toLowerCase().includes(targetType))
      );
    }

    // Filter by search keyword
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(d =>
        d.dairy_name.toLowerCase().includes(q) ||
        (d.description && d.description.toLowerCase().includes(q)) ||
        d.address.toLowerCase().includes(q)
      );
    }

    // Filter by minimum rating
    if (min_rating) {
      const minR = parseFloat(min_rating);
      if (!isNaN(minR)) {
        results = results.filter(d => parseFloat(d.rating) >= minR);
      }
    }

    res.json({
      success: true,
      count: results.length,
      user_location: (!isNaN(userLat) && !isNaN(userLng)) ? { latitude: userLat, longitude: userLng } : null,
      radius_km: searchRadius,
      dairies: results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dairies/partner/me
 * Get logged-in partner's dairy details
 */
router.get('/partner/me', authenticateUser, requireRole('partner', 'admin'), async (req, res, next) => {
  try {
    const { data: dairy, error } = await db
      .from('dairies')
      .select('*, products(*), reviews(*, customer:customer_profiles!reviews_customer_id_fkey(full_name, avatar_url))')
      .eq('owner_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // Also fetch partner profile to ensure city, state, pincode fallback
    const { data: profile } = await db
      .from('partner_profiles')
      .select('city, state, pincode, address, business_name')
      .eq('id', req.user.id)
      .maybeSingle();

    let enriched = dairy ? DairyStore.enrichDairy(dairy) : null;
    if (enriched && profile) {
      if (!enriched.city && profile.city) enriched.city = profile.city;
      if (!enriched.state && profile.state) enriched.state = profile.state;
      if (!enriched.pincode && profile.pincode) enriched.pincode = profile.pincode;
    }

    res.json({
      success: true,
      dairy: enriched,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/dairies/partner/me
 * Update partner's dairy settings, address, city, state, pincode and delivery radius
 */
router.put('/partner/me', authenticateUser, requireRole('partner', 'admin'), async (req, res, next) => {
  try {
    const {
      dairy_name,
      description,
      fssai_license,
      phone,
      email,
      address,
      city,
      state,
      pincode,
      latitude,
      longitude,
      delivery_radius_km,
      morning_slot_start,
      morning_slot_end,
      evening_slot_start,
      evening_slot_end,
      banner_image,
      certificate_url,
      is_active,
    } = req.body;

    const updates = {
      updated_at: new Date().toISOString(),
    };

    if (dairy_name) updates.dairy_name = dairy_name;
    if (description !== undefined) updates.description = description;
    if (fssai_license !== undefined) updates.fssai_license = fssai_license;
    if (phone) updates.phone = phone;
    if (email) updates.email = email;
    if (address) updates.address = address;
    if (city !== undefined) updates.city = city;
    if (state !== undefined) updates.state = state;
    if (pincode !== undefined) updates.pincode = pincode;
    if (latitude !== undefined) updates.latitude = parseFloat(latitude);
    if (longitude !== undefined) updates.longitude = parseFloat(longitude);
    if (delivery_radius_km !== undefined) updates.delivery_radius_km = parseFloat(delivery_radius_km);
    if (morning_slot_start) updates.morning_slot_start = morning_slot_start;
    if (morning_slot_end) updates.morning_slot_end = morning_slot_end;
    if (evening_slot_start) updates.evening_slot_start = evening_slot_start;
    if (evening_slot_end) updates.evening_slot_end = evening_slot_end;
    if (banner_image) updates.banner_image = banner_image;
    if (certificate_url !== undefined) updates.certificate_url = certificate_url;
    if (is_active !== undefined) updates.is_active = is_active;

    let updateRes = await db
      .from('dairies')
      .update(updates)
      .eq('owner_id', req.user.id)
      .select()
      .single();

    if (updateRes.error && updateRes.error.message.includes('certificate_url')) {
      delete updates.certificate_url;
      updateRes = await db
        .from('dairies')
        .update(updates)
        .eq('owner_id', req.user.id)
        .select()
        .single();
    }

    if (updateRes.error) throw updateRes.error;

    // Also synchronize partner_profiles address, city, state, pincode for the owner
    const profileUpdates = {
      updated_at: new Date().toISOString(),
    };
    if (address !== undefined) profileUpdates.address = address;
    if (city !== undefined) profileUpdates.city = city;
    if (state !== undefined) profileUpdates.state = state;
    if (pincode !== undefined) profileUpdates.pincode = pincode;
    if (dairy_name !== undefined) profileUpdates.business_name = dairy_name;

    await db
      .from('partner_profiles')
      .update(profileUpdates)
      .eq('id', req.user.id);

    const updatedDairy = updateRes.data;
    if (updatedDairy && certificate_url !== undefined) {
      DairyStore.setCertificate(updatedDairy.id, certificate_url);
    }

    res.json({
      success: true,
      message: 'Dairy details updated successfully.',
      dairy: DairyStore.enrichDairy(updatedDairy),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dairies/partner/customers
 * Get all customer details, addresses, active subscriptions, and distance from dairy
 */
router.get('/partner/customers', authenticateUser, requireRole('partner', 'admin'), async (req, res, next) => {
  try {
    const { data: dairy, error: dairyErr } = await db
      .from('dairies')
      .select('*')
      .eq('owner_id', req.user.id)
      .single();

    if (dairyErr || !dairy) {
      return res.status(404).json({
        success: false,
        message: 'No dairy found for this partner.',
      });
    }

    const [
      { data: subscriptions, error: subsErr },
      { data: orders, error: ordersErr },
    ] = await Promise.all([
      db
        .from('subscriptions')
        .select('*, product:products(*), customer:customer_profiles!subscriptions_customer_id_fkey(*)')
        .eq('dairy_id', dairy.id)
        .order('created_at', { ascending: false }),
      db
        .from('orders')
        .select('*, customer:customer_profiles!orders_customer_id_fkey(*)')
        .eq('dairy_id', dairy.id)
        .order('created_at', { ascending: false }),
    ]);

    if (subsErr) throw subsErr;
    if (ordersErr) throw ordersErr;

    function calculateDistance(lat1, lon1, lat2, lon2) {
      if (!lat1 || !lon1 || !lat2 || !lon2) return null;
      const R = 6371; // km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return parseFloat((R * c).toFixed(2));
    }

    const customerMap = new Map();

    (subscriptions || []).forEach((sub) => {
      const cust = sub.customer;
      if (!cust) return;

      if (!customerMap.has(cust.id)) {
        const custLat = cust.latitude || sub.delivery_lat || null;
        const custLng = cust.longitude || sub.delivery_lng || null;
        const dist = calculateDistance(dairy.latitude, dairy.longitude, custLat, custLng);

        customerMap.set(cust.id, {
          id: cust.id,
          full_name: cust.full_name,
          email: cust.email,
          phone: cust.phone,
          avatar_url: cust.avatar_url,
          address: cust.address || sub.delivery_address,
          flat_building: cust.flat_building || '',
          street_area: cust.street_area || '',
          landmark: cust.landmark || '',
          city: cust.city || 'Pune',
          state: cust.state || 'Maharashtra',
          pincode: cust.pincode || '',
          delivery_instructions: cust.delivery_instructions || 'Leave in milk bag on door handle/hook',
          alternate_phone: cust.alternate_phone || '',
          latitude: custLat,
          longitude: custLng,
          distance_km: dist,
          is_within_radius: dist !== null ? dist <= (dairy.delivery_radius_km || 15) : true,
          created_at: cust.created_at,
          subscriptions: [],
          orders: [],
          total_orders_count: 0,
          total_spent: 0,
          active_daily_litres: 0,
          monthly_gross_revenue: 0,
          net_partner_payout: 0,
        });
      }

      const entry = customerMap.get(cust.id);
      entry.subscriptions.push(sub);

      if (sub.status === 'active') {
        entry.active_daily_litres += parseFloat(sub.quantity) || 1.0;
        entry.monthly_gross_revenue += parseFloat(sub.monthly_gross_amount) || 0;
        entry.net_partner_payout += parseFloat(sub.partner_net_amount) || 0;
      }
    });

    (orders || []).forEach((order) => {
      const cust = order.customer;
      if (!cust) return;

      if (!customerMap.has(cust.id)) {
        const custLat = cust.latitude || order.delivery_lat || null;
        const custLng = cust.longitude || order.delivery_lng || null;
        const dist = calculateDistance(dairy.latitude, dairy.longitude, custLat, custLng);

        customerMap.set(cust.id, {
          id: cust.id,
          full_name: cust.full_name,
          email: cust.email,
          phone: cust.phone,
          avatar_url: cust.avatar_url,
          address: cust.address || order.delivery_address,
          flat_building: cust.flat_building || '',
          street_area: cust.street_area || '',
          landmark: cust.landmark || '',
          city: cust.city || 'Pune',
          state: cust.state || 'Maharashtra',
          pincode: cust.pincode || '',
          delivery_instructions: cust.delivery_instructions || 'Leave in milk bag on door handle/hook',
          alternate_phone: cust.alternate_phone || '',
          latitude: custLat,
          longitude: custLng,
          distance_km: dist,
          is_within_radius: dist !== null ? dist <= (dairy.delivery_radius_km || 15) : true,
          created_at: cust.created_at,
          subscriptions: [],
          orders: [],
          total_orders_count: 0,
          total_spent: 0,
          active_daily_litres: 0,
          monthly_gross_revenue: 0,
          net_partner_payout: 0,
        });
      }

      const entry = customerMap.get(cust.id);
      entry.orders.push(order);
      entry.total_orders_count += 1;
      entry.total_spent += parseFloat(order.total_amount) || 0;
    });

    const customersList = Array.from(customerMap.values());
    const activeSubsCount = customersList.filter(c => c.subscriptions.some(s => s.status === 'active')).length;
    const validDists = customersList.map(c => c.distance_km).filter(d => d !== null);
    const avgDistance = validDists.length > 0 ? (validDists.reduce((a, b) => a + b, 0) / validDists.length) : 0;
    const totalDailyLitres = customersList.reduce((sum, c) => sum + c.active_daily_litres, 0);

    res.json({
      success: true,
      dairy: {
        id: dairy.id,
        dairy_name: dairy.dairy_name,
        latitude: dairy.latitude,
        longitude: dairy.longitude,
        address: dairy.address,
        delivery_radius_km: dairy.delivery_radius_km || 15,
      },
      summary: {
        total_customers: customersList.length,
        active_subscribers: activeSubsCount,
        avg_distance_km: parseFloat(avgDistance.toFixed(2)),
        total_daily_litres: parseFloat(totalDailyLitres.toFixed(1)),
      },
      customers: customersList,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dairies/:id
 * Detailed dairy storefront profile with products, reviews, and delivery information
 */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: dairy, error } = await db
      .from('dairies')
      .select(`
        *,
        owner:partner_profiles!dairies_owner_id_fkey(id, full_name, phone, email, avatar_url),
        products(*),
        reviews(
          id,
          rating,
          comment,
          created_at,
          customer:customer_profiles!reviews_customer_id_fkey(id, full_name, avatar_url)
        )
      `)
      .eq('id', id)
      .single();

    if (error || !dairy) {
      return res.status(404).json({
        success: false,
        message: 'Dairy not found.',
      });
    }

    res.json({
      success: true,
      dairy: DairyStore.enrichDairy(dairy),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
