/**
 * NEAR DAIRY - DAIRY PARTNER PORTAL SCRIPT
 */

let currentDairy = null;
let settingsMap = null;
let settingsMarker = null;
let partnerCustomersList = [];
let currentCustomerFilter = 'all';
let custRouteMap = null;
let partnerNotificationsList = [];
let currentNotifFilter = 'all';
let lastKnownUnreadCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth(['partner', 'admin'])) return;

  setupHeader();
  setupTabs();
  setupDatePicker();
  setupCustomerFilters();
  setupNotifications();
  initPartnerSupport();
  await loadPartnerDairy();
  loadDispatchRoster();
  loadCustomers();
  loadProducts();
  loadSubscribers();
  loadPartnerTickets();
  loadPartnerNotifications();
  setupSettingsForm();
  setupPartnerSettingsTab();

  // Periodic polling for live notifications & pause updates
  setInterval(loadPartnerNotifications, 25000);
  setInterval(loadPartnerTickets, 30000);
});

function setupHeader() {
  const user = Auth.getUser();
  if (user) {
    document.getElementById('sidebar-user-name').textContent = user.full_name;
    const avatarUrl = user.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.full_name)}`;
    document.getElementById('sidebar-user-avatar').src = avatarUrl;
    const settingAvatar = document.getElementById('partner-setting-avatar-img');
    if (settingAvatar) settingAvatar.src = avatarUrl;

    const deleteAvatarBtn = document.getElementById('btn-partner-delete-avatar');
    if (deleteAvatarBtn) {
      deleteAvatarBtn.style.display = user.avatar_url ? 'inline-flex' : 'none';
    }
  }
}

function setupTabs() {
  const allTabBtns = document.querySelectorAll('[data-tab]');
  allTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      if (!target) return;

      allTabBtns.forEach((b) => {
        if (b.dataset.tab === target) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });

      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      document.getElementById(`tab-${target}`)?.classList.add('active');

      if (typeof Sidebar !== 'undefined' && Sidebar.close) {
        Sidebar.close();
      }

      const titles = {
        roster: 'Daily Dispatch & Route Roster',
        customers: 'Customer Directory & GPS Delivery Locations',
        products: 'Milk Products Catalog',
        subscribers: 'Customer Subscriptions & Platform Fees',
        'dairy-profile': 'Dairy Storefront & Delivery Radius',
        support: 'Dairy Partner Helpdesk & Admin Support',
        settings: 'Account & Security Settings',
      };
      const titleEl = document.getElementById('topbar-title');
      if (titleEl) titleEl.textContent = titles[target] || 'Partner Dashboard';

      if (target === 'customers') {
        loadCustomers();
      }
      if (target === 'subscribers') {
        loadSubscribers();
      }
      if (target === 'products') {
        loadProducts();
      }
      if (target === 'support') {
        loadPartnerTickets();
      }
      if (target === 'dairy-profile' && settingsMap) {
        setTimeout(() => { settingsMap.invalidateSize(); }, 200);
      }
    });
  });

  document.getElementById('btn-add-product-quick')?.addEventListener('click', openAddProductModal);
}

function setupDatePicker() {
  const picker = document.getElementById('roster-date-picker');
  const today = new Date().toISOString().split('T')[0];
  picker.value = today;
  picker.addEventListener('change', () => {
    loadDispatchRoster();
  });
}

/**
 * Load Partner Dairy Profile
 */
async function loadPartnerDairy() {
  try {
    const res = await API.get('/api/dairies/partner/me');
    currentDairy = res.dairy;

    if (!currentDairy) {
      Toast.warning('No Dairy Found', 'Please set up your dairy farm profile under Settings.');
      return;
    }

    document.getElementById('sidebar-dairy-name').textContent = currentDairy.dairy_name;

    const approvalStatus = document.getElementById('partner-approval-status');
    if (currentDairy.is_approved) {
      approvalStatus.className = 'badge badge-success';
      approvalStatus.innerHTML = '<i class="fa-solid fa-check"></i> Approved & Live';
    } else {
      approvalStatus.className = 'badge badge-warning';
      approvalStatus.innerHTML = '<i class="fa-solid fa-hourglass-half"></i> Pending Admin Approval';
    }

    // Pre-populate settings form
    document.getElementById('setting-dairy-name').value = currentDairy.dairy_name || '';
    document.getElementById('setting-fssai').value = currentDairy.fssai_license || '';
    document.getElementById('setting-description').value = currentDairy.description || '';
    document.getElementById('setting-phone').value = currentDairy.phone || '';
    document.getElementById('setting-radius').value = currentDairy.delivery_radius_km || 10;
    document.getElementById('setting-radius-val').textContent = `${currentDairy.delivery_radius_km || 10} km`;
    document.getElementById('setting-address').value = currentDairy.address || '';
    document.getElementById('setting-city').value = currentDairy.city || '';
    document.getElementById('setting-state').value = currentDairy.state || '';
    document.getElementById('setting-pincode').value = currentDairy.pincode || '';
    document.getElementById('setting-lat').value = currentDairy.latitude || 19.0760;
    document.getElementById('setting-lng').value = currentDairy.longitude || 72.8777;

    // Pre-populate 12-Hour Schedule Delivery Windows
    const setSelectSlot = (elementId, rawVal, defaultVal) => {
      const el = document.getElementById(elementId);
      if (!el) return;
      const formatted = typeof formatTime12h === 'function' ? formatTime12h(rawVal || defaultVal) : (rawVal || defaultVal);
      for (let opt of el.options) {
        const optFormatted = typeof formatTime12h === 'function' ? formatTime12h(opt.value) : opt.value;
        if (opt.value === formatted || optFormatted === formatted) {
          el.value = opt.value;
          return;
        }
      }
      el.value = defaultVal;
    };

    setSelectSlot('setting-morning-start', currentDairy.morning_slot_start, '05:30 AM');
    setSelectSlot('setting-morning-end', currentDairy.morning_slot_end, '07:30 AM');
    setSelectSlot('setting-evening-start', currentDairy.evening_slot_start, '05:30 PM');
    setSelectSlot('setting-evening-end', currentDairy.evening_slot_end, '07:30 PM');

    // Pre-populate Banner
    const defaultBanner = 'https://images.unsplash.com/photo-1527153857715-3908f2ae5e81?w=800';
    const bannerUrl = currentDairy.banner_image || defaultBanner;
    document.getElementById('partner-banner-img').src = bannerUrl;
    document.getElementById('setting-banner-url').value = currentDairy.banner_image || '';

    const deleteBannerBtn = document.getElementById('btn-partner-delete-banner');
    if (deleteBannerBtn) {
      deleteBannerBtn.style.display = currentDairy.banner_image ? 'inline-flex' : 'none';
    }

    // Pre-populate Certificate
    renderPartnerCertificateCard(currentDairy.certificate_url);

    // Pre-populate Owner Profile Details
    const user = Auth.getUser();
    if (user) {
      const sidebarUserName = document.getElementById('sidebar-user-name');
      if (sidebarUserName && user.full_name) sidebarUserName.textContent = user.full_name;

      const ownerNameInput = document.getElementById('setting-partner-owner-name');
      if (ownerNameInput) ownerNameInput.value = user.full_name || '';

      const ownerPhoneInput = document.getElementById('setting-partner-owner-phone');
      if (ownerPhoneInput) ownerPhoneInput.value = user.phone || currentDairy.phone || '';

      const settingsFullName = document.getElementById('settings-partner-fullname');
      if (settingsFullName) settingsFullName.value = user.full_name || '';

      const settingsPhone = document.getElementById('settings-partner-phone');
      if (settingsPhone) settingsPhone.value = user.phone || currentDairy.phone || '';
    }

    initSettingsMap(currentDairy.latitude || 19.0760, currentDairy.longitude || 72.8777);

  } catch (error) {
    console.error('Error loading partner dairy:', error);
  }
}

function renderPartnerCertificateCard(certUrl) {
  const activeCard = document.getElementById('partner-cert-active-card');
  const emptyCard = document.getElementById('partner-cert-empty-card');
  const statusBadge = document.getElementById('partner-cert-status-badge');
  const certName = document.getElementById('partner-cert-name');
  const certMeta = document.getElementById('partner-cert-meta');
  const certIcon = document.getElementById('partner-cert-icon');
  const urlInput = document.getElementById('setting-cert-url');

  if (urlInput) urlInput.value = certUrl || '';

  if (certUrl) {
    if (activeCard) activeCard.style.display = 'flex';
    if (emptyCard) emptyCard.style.display = 'none';
    if (statusBadge) {
      statusBadge.className = 'badge badge-success';
      statusBadge.innerHTML = '<i class="fa-solid fa-check"></i> Certificate Active';
    }
    const isPdf = certUrl.toLowerCase().endsWith('.pdf');
    const filename = certUrl.split('/').pop() || 'FSSAI_Certificate';
    if (certName) certName.textContent = filename;
    if (certMeta) certMeta.textContent = isPdf ? 'PDF Document (Stored in Supabase)' : 'Image Document (Stored in Supabase)';
    if (certIcon) {
      certIcon.className = isPdf ? 'cert-file-icon' : 'cert-file-icon is-image';
      certIcon.innerHTML = `<i class="fa-solid ${isPdf ? 'fa-file-pdf' : 'fa-file-image'}"></i>`;
    }
  } else {
    if (activeCard) activeCard.style.display = 'none';
    if (emptyCard) emptyCard.style.display = 'block';
    if (statusBadge) {
      statusBadge.className = 'badge badge-warning';
      statusBadge.innerHTML = '<i class="fa-solid fa-hourglass-half"></i> Pending Upload';
    }
  }
}

/**
 * Load Dispatch Roster for Date
 */
async function loadDispatchRoster() {
  const date = document.getElementById('roster-date-picker').value;
  const morningContainer = document.getElementById('morning-roster-list');
  const eveningContainer = document.getElementById('evening-roster-list');
  const pausedContainer = document.getElementById('paused-roster-list');

  morningContainer.innerHTML = '<div class="spinner"></div>';
  eveningContainer.innerHTML = '<div class="spinner"></div>';
  if (pausedContainer) pausedContainer.innerHTML = '<div class="spinner"></div>';

  try {
    const res = await API.get('/api/orders/partner/roster', { date });

    document.getElementById('badge-roster-count').textContent = res.summary.total_deliveries;
    document.getElementById('stat-roster-total').textContent = res.summary.total_deliveries;
    document.getElementById('stat-roster-morning').textContent = res.summary.morning_count;
    document.getElementById('stat-roster-evening').textContent = res.summary.evening_count;

    const pausedStat = document.getElementById('stat-roster-paused');
    if (pausedStat) pausedStat.textContent = res.summary.paused_count || 0;

    document.getElementById('count-morning-slot').textContent = `${res.summary.morning_count} deliveries`;
    document.getElementById('count-evening-slot').textContent = `${res.summary.evening_count} deliveries`;

    const pausedCountSlot = document.getElementById('count-paused-slot');
    if (pausedCountSlot) pausedCountSlot.textContent = `${res.summary.paused_count || 0} customers`;

    renderRosterList(morningContainer, res.morning);
    renderRosterList(eveningContainer, res.evening);
    if (pausedContainer) renderPausedRosterList(pausedContainer, res.paused_today);

  } catch (err) {
    morningContainer.innerHTML = `<div class="card" style="padding: 1.5rem; color: var(--color-danger);">Error: ${err.message}</div>`;
    eveningContainer.innerHTML = '';
    if (pausedContainer) pausedContainer.innerHTML = '';
  }
}

function renderPausedRosterList(container, items) {
  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding: 1.5rem; text-align: center; color: var(--color-text-muted); font-size: 0.875rem;">
        <i class="fa-solid fa-check-circle" style="color: #16A34A; margin-right: 0.35rem;"></i> No customer deliveries on pause for today. All scheduled subscriptions are active for dispatch.
      </div>
    `;
    return;
  }

  container.innerHTML = items.map((item) => {
    const cleanPhone = (item.customer_phone || '').replace(/[^0-9]/g, '');
    const startStr = item.pause_start_date ? new Date(item.pause_start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Immediate';
    const endStr = item.pause_end_date ? new Date(item.pause_end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Indefinite';

    const whatsappUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=Hello%20${encodeURIComponent(item.customer_name)},%20confirming%20your%20milk%20delivery%20pause%20with%20${encodeURIComponent(currentDairy?.dairy_name || 'Near Dairy')}.`
      : '#';

    return `
      <div class="roster-paused-card" id="roster-paused-${item.id}">
        <div class="roster-paused-info">
          <div class="roster-paused-icon">
            <i class="fa-solid fa-pause"></i>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span style="font-weight: 700; font-size: 1rem; color: #92400E;">${item.customer_name}</span>
              <span class="badge" style="background:#FEF3C7; color:#92400E; font-size: 0.72rem; border: 1px solid #FDE68A;">
                ⏸ Paused: ${startStr} – ${endStr} (${item.paused_days_count}d)
              </span>
            </div>
            <div class="text-muted" style="font-size: 0.8125rem; margin-top: 0.2rem;">
              <span><i class="fa-solid fa-bottle-droplet" style="color: var(--theme-primary);"></i> <strong>${item.quantity}L</strong> ${item.product_name} (${(item.slot || 'morning').toUpperCase()})</span> •
              <span><i class="fa-solid fa-location-dot"></i> ${item.address}</span>
            </div>
            <div style="font-size: 0.8125rem; color: #78350F; margin-top: 0.25rem;">
              <strong>Reason:</strong> ${item.pause_reason || 'Personal / Vacation'}${item.pause_notes ? ` • Note: "${item.pause_notes}"` : ''}
              <span style="color: #166534; font-weight: 600; margin-left: 0.5rem;">(Adjusted Credit: ₹${(parseFloat(item.adjusted_credit_amount) || 0).toFixed(2)})</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          ${item.customer_phone && item.customer_phone !== 'N/A' ? `
            <a href="tel:${item.customer_phone}" class="btn btn-secondary btn-sm">
              <i class="fa-solid fa-phone"></i> Call
            </a>
            <a href="${whatsappUrl}" target="_blank" class="btn btn-secondary btn-sm" style="color: #16A34A; border-color: #BBF7D0;">
              <i class="fa-brands fa-whatsapp"></i> WhatsApp
            </a>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderRosterList(container, items) {
  if (!items || items.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding: 2rem; text-align: center; color: var(--color-text-muted);">
        No deliveries scheduled for this slot.
      </div>
    `;
    return;
  }

  container.innerHTML = items.map((item) => {
    const isDelivered = item.status === 'delivered';
    const itemsText = (item.items || []).map((i) => `${i.name} - ${i.quantity}x`).join(', ');

    return `
      <div class="roster-card ${isDelivered ? 'delivered' : ''}" id="roster-item-${item.id}">
        <div class="flex items-center gap-3">
          <div style="font-size: 1.5rem; color: ${isDelivered ? 'var(--color-success)' : 'var(--theme-primary)'};">
            <i class="fa-solid ${isDelivered ? 'fa-circle-check' : 'fa-bottle-droplet'}"></i>
          </div>
          <div>
            <div style="font-weight: 700; font-size: 1.0625rem;">${item.customer_name}</div>
            <div class="text-muted" style="font-size: 0.8125rem;">
              <i class="fa-solid fa-phone"></i> ${item.customer_phone} |
              <i class="fa-solid fa-location-dot"></i> ${item.address}
            </div>
            <div style="font-weight: 600; color: var(--color-text); font-size: 0.875rem; margin-top: 0.25rem;">
              ${itemsText}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          ${isDelivered ? `
            <span class="badge badge-success" style="font-size: 0.875rem; padding: 0.5rem 0.75rem;">
              ✓ Delivered
            </span>
          ` : `
            <button class="btn btn-primary btn-sm" onclick="markOrderDelivered('${item.id}')">
              <i class="fa-solid fa-check"></i> Mark Delivered
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');
}

window.markOrderDelivered = async function (orderId) {
  try {
    await API.patch(`/api/orders/${orderId}/delivery-status`, { delivery_status: 'delivered' });
    Toast.success('Delivered!', 'Delivery marked as completed in roster.');
    loadDispatchRoster();
  } catch (err) {
    Toast.error('Update Failed', err.message);
  }
};

/**
 * ==========================================================================
 * CUSTOMERS DIRECTORY, GPS DISTANCE & LIVE ROUTE MAP
 * ==========================================================================
 */

async function loadCustomers() {
  const container = document.getElementById('partner-customers-list');
  if (!container) return;

  try {
    const res = await API.get('/api/dairies/partner/customers');
    partnerCustomersList = res.customers || [];
    currentDairy = res.dairy || currentDairy;
    const summary = res.summary || {};

    // Update Metrics
    const totalEl = document.getElementById('stat-cust-total');
    if (totalEl) totalEl.textContent = summary.total_customers || 0;

    const activeEl = document.getElementById('stat-cust-active-subs');
    if (activeEl) activeEl.textContent = summary.active_subscribers || 0;

    const distEl = document.getElementById('stat-cust-avg-distance');
    if (distEl) distEl.textContent = `${summary.avg_distance_km || 0.0} km`;

    const litresEl = document.getElementById('stat-cust-total-litres');
    if (litresEl) litresEl.textContent = `${summary.total_daily_litres || 0.0} L`;

    const badgeEl = document.getElementById('badge-partner-cust-count');
    if (badgeEl) badgeEl.textContent = summary.total_customers || 0;

    renderCustomerCards();
  } catch (err) {
    container.innerHTML = `
      <div class="card" style="padding: 2rem; color: var(--color-danger); text-align: center;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
        <h3>Error Loading Customers</h3>
        <p class="text-muted">${err.message}</p>
      </div>
    `;
  }
}

function setupCustomerFilters() {
  const searchInput = document.getElementById('cust-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderCustomerCards();
    });
  }

  const filterBtns = document.querySelectorAll('.cust-filter-btn');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentCustomerFilter = btn.dataset.filter;
      renderCustomerCards();
    });
  });
}

function renderCustomerCards() {
  const container = document.getElementById('partner-customers-list');
  if (!container) return;

  const searchKeyword = (document.getElementById('cust-search-input')?.value || '').toLowerCase().trim();

  const filtered = partnerCustomersList.filter((c) => {
    // 1. Text Search Filter
    if (searchKeyword) {
      const matchName = (c.full_name || '').toLowerCase().includes(searchKeyword);
      const matchPhone = (c.phone || '').toLowerCase().includes(searchKeyword);
      const matchEmail = (c.email || '').toLowerCase().includes(searchKeyword);
      const matchAddr = (c.address || '').toLowerCase().includes(searchKeyword);
      const matchFlat = (c.flat_building || '').toLowerCase().includes(searchKeyword);
      const matchArea = (c.street_area || '').toLowerCase().includes(searchKeyword);
      const matchLandmark = (c.landmark || '').toLowerCase().includes(searchKeyword);
      const matchPin = (c.pincode || '').toLowerCase().includes(searchKeyword);
      if (!matchName && !matchPhone && !matchEmail && !matchAddr && !matchFlat && !matchArea && !matchLandmark && !matchPin) {
        return false;
      }
    }

    // 2. Category Filter
    if (currentCustomerFilter === 'active') {
      return c.subscriptions && c.subscriptions.some((s) => s.status === 'active');
    }
    if (currentCustomerFilter === 'nearby') {
      return c.distance_km !== null && c.distance_km <= 3.0;
    }
    if (currentCustomerFilter === 'morning') {
      return c.subscriptions && c.subscriptions.some((s) => s.slot === 'morning');
    }
    if (currentCustomerFilter === 'evening') {
      return c.subscriptions && c.subscriptions.some((s) => s.slot === 'evening');
    }

    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding: 3rem; text-align: center;">
        <div style="font-size: 2.5rem; color: var(--color-text-muted); margin-bottom: 0.5rem;"><i class="fa-solid fa-users-slash"></i></div>
        <h3>No Matching Customers Found</h3>
        <p class="text-muted">Try adjusting your search keywords or filter buttons.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((c) => {
    const avatarUrl = c.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.full_name || 'Customer')}`;
    const cleanPhone = (c.phone || '').replace(/[^0-9]/g, '');
    const hasActiveSub = c.subscriptions && c.subscriptions.some((s) => s.status === 'active');
    const fullAddress = [c.flat_building, c.street_area, c.landmark ? 'Near ' + c.landmark : null, c.city, c.pincode].filter(Boolean).join(', ') || c.address || 'Address on record';
    const joinedDate = new Date(c.created_at || Date.now()).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

    // Subscriptions List
    let subsHtml = '';
    if (c.subscriptions && c.subscriptions.length > 0) {
      subsHtml = c.subscriptions.map((s) => `
        <div style="background: #FFFFFF; border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0.75rem; margin-bottom: 0.5rem;">
          <div class="flex items-center justify-between" style="margin-bottom: 0.25rem;">
            <div style="font-weight: 700; font-size: 0.875rem; color: var(--color-text);">
              <i class="fa-solid fa-bottle-droplet" style="color: var(--theme-primary);"></i> ${s.product?.name || 'Fresh Milk'}
            </div>
            <span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-warning'}" style="font-size: 0.7rem; padding: 0.15rem 0.4rem;">
              ${s.status.toUpperCase()}
            </span>
          </div>
          <div class="flex items-center justify-between text-muted" style="font-size: 0.75rem;">
            <span><strong>${s.quantity} L</strong>/day (${s.slot.toUpperCase()})</span>
            <span>Freq: ${s.frequency.toUpperCase()}</span>
            <strong style="color: #16A34A;">₹${(parseFloat(s.partner_net_amount) || parseFloat(s.monthly_gross_amount) || 0).toFixed(0)}/mo</strong>
          </div>
        </div>
      `).join('');
    } else {
      subsHtml = `<div class="text-muted" style="font-size: 0.8125rem;">No active recurring subscriptions. (Past one-time order customer)</div>`;
    }

    const directionsUrl = (currentDairy && currentDairy.latitude && c.latitude)
      ? `https://www.google.com/maps/dir/?api=1&origin=${currentDairy.latitude},${currentDairy.longitude}&destination=${c.latitude},${c.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

    const whatsappUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=Hello%20${encodeURIComponent(c.full_name)},%20this%20is%20${encodeURIComponent(currentDairy?.dairy_name || 'your local dairy partner')}%20regarding%20your%20fresh%20milk%20delivery.`
      : '#';

    return `
      <div class="partner-cust-card" id="cust-card-${c.id}">
        <div class="partner-cust-header">
          <div class="partner-cust-avatar-wrap">
            <img src="${avatarUrl}" class="partner-cust-avatar" alt="${c.full_name}">
            <div>
              <div class="flex items-center gap-2">
                <h3 style="font-size: 1.125rem; margin-bottom: 0;">${c.full_name}</h3>
                <span class="badge ${hasActiveSub ? 'badge-success' : 'badge-gray'}" style="font-size: 0.75rem;">
                  ${hasActiveSub ? '● Active Subscriber' : 'One-Time Customer'}
                </span>
              </div>
              <div class="text-muted" style="font-size: 0.8125rem;">
                <span><i class="fa-solid fa-phone"></i> ${c.phone || 'No Phone'}</span>
                ${c.email ? `<span style="margin-left: 0.75rem;"><i class="fa-solid fa-envelope"></i> ${c.email}</span>` : ''}
                <span style="margin-left: 0.75rem;"><i class="fa-solid fa-calendar-days"></i> Customer since ${joinedDate}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            ${c.distance_km !== null ? `
              <span class="badge badge-primary" style="font-size: 0.8125rem; font-weight: 700; padding: 0.4rem 0.75rem;">
                <i class="fa-solid fa-route"></i> ${c.distance_km} km away
              </span>
            ` : `
              <span class="badge badge-gray" style="font-size: 0.8125rem;"><i class="fa-solid fa-location-crosshairs"></i> Address Pinned</span>
            `}
            <span class="badge ${c.is_within_radius ? 'badge-success' : 'badge-warning'}" style="font-size: 0.8125rem;">
              <i class="fa-solid ${c.is_within_radius ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i>
              ${c.is_within_radius ? 'In Delivery Zone' : 'Outside Standard Zone'}
            </span>
          </div>
        </div>

        <div class="partner-cust-body-grid">
          <!-- 1. Detailed Address & Instructions -->
          <div class="partner-cust-section-box">
            <div>
              <div class="cust-section-title">
                <i class="fa-solid fa-location-dot" style="color: var(--color-danger);"></i> Doorstep Delivery Address
              </div>
              <div style="font-weight: 700; font-size: 0.9375rem; color: var(--color-text); line-height: 1.4;">
                ${c.flat_building || 'Apartment / House'}
              </div>
              <div class="text-muted" style="font-size: 0.8125rem; margin-top: 0.25rem; line-height: 1.4;">
                ${[c.street_area, c.landmark ? 'Near ' + c.landmark : null, c.city, c.pincode].filter(Boolean).join(', ')}
              </div>
            </div>

            <div class="cust-instruction-pill">
              <i class="fa-solid fa-bell-concierge" style="color: #D97706;"></i>
              <strong>Delivery Notes:</strong> "${c.delivery_instructions || 'Leave in milk bag on door handle/hook'}"
            </div>
          </div>

          <!-- 2. Location & Route Distance from Dairy -->
          <div class="partner-cust-section-box">
            <div>
              <div class="cust-section-title">
                <i class="fa-solid fa-map-location-dot" style="color: #2563EB;"></i> Distance from Dairy Gate
              </div>
              <div style="font-size: 1.5rem; font-weight: 800; color: var(--theme-primary); margin-bottom: 0.25rem;">
                ${c.distance_km !== null ? `${c.distance_km} km` : 'Local Area'}
              </div>
              <p class="text-muted" style="font-size: 0.75rem; line-height: 1.4; margin-bottom: 0.5rem;">
                Estimated dispatch transit time: <strong>~${Math.max(5, Math.round((c.distance_km || 1) * 3.5))} mins</strong> on morning delivery route.
              </p>
            </div>

            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-outline btn-sm w-full" onclick="openCustomerRouteMap('${c.id}')" style="font-size: 0.8125rem;">
                <i class="fa-solid fa-map-pin"></i> View Route & GPS Map
              </button>
            </div>
          </div>

          <!-- 3. Subscriptions & Milk Volume -->
          <div class="partner-cust-section-box">
            <div>
              <div class="cust-section-title">
                <i class="fa-solid fa-calendar-check" style="color: #16A34A;"></i> Milk Subscriptions (${c.subscriptions?.length || 0})
              </div>
              <div>${subsHtml}</div>
            </div>

            <div class="flex items-center justify-between" style="padding-top: 0.5rem; border-top: 1px solid var(--color-border); font-size: 0.75rem;">
              <span class="text-muted">Total Orders: <strong>${c.total_orders_count || 0}</strong></span>
              <span class="text-muted">Daily Volume: <strong style="color: var(--theme-primary);">${c.active_daily_litres.toFixed(1)} L/day</strong></span>
            </div>
          </div>
        </div>

        <!-- Action Footer -->
        <div class="partner-cust-actions">
          ${c.phone ? `
            <a href="tel:${c.phone}" class="btn btn-secondary btn-sm">
              <i class="fa-solid fa-phone"></i> Call Customer
            </a>
            <a href="${whatsappUrl}" target="_blank" class="btn btn-secondary btn-sm" style="color: #16A34A; border-color: #BBF7D0;">
              <i class="fa-brands fa-whatsapp" style="font-size: 1rem;"></i> WhatsApp
            </a>
          ` : ''}
          <a href="${directionsUrl}" target="_blank" class="btn btn-primary btn-sm">
            <i class="fa-solid fa-diamond-turn-right"></i> Live Google Navigation
          </a>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Open Customer Route & Map Inspector Modal
 */
window.openCustomerRouteMap = function (customerId) {
  const cust = partnerCustomersList.find((c) => c.id === customerId);
  if (!cust) return;

  const dairyName = currentDairy?.dairy_name || 'Your Dairy Farm';
  const dairyAddr = currentDairy?.address || 'Dairy Location';
  const dairyLat = currentDairy?.latitude || 18.44859;
  const dairyLng = currentDairy?.longitude || 73.87525;

  const custLat = cust.latitude || 18.44196;
  const custLng = cust.longitude || 73.88361;
  const custFullAddr = [cust.flat_building, cust.street_area, cust.landmark ? 'Near ' + cust.landmark : null, cust.city, cust.pincode].filter(Boolean).join(', ') || cust.address;

  document.getElementById('cust-modal-title').textContent = `${cust.full_name} — Delivery Location & Route`;
  document.getElementById('cust-modal-dairy-name').textContent = dairyName;
  document.getElementById('cust-modal-dairy-address').textContent = dairyAddr;
  document.getElementById('cust-modal-cust-name').textContent = cust.full_name;
  document.getElementById('cust-modal-cust-address').textContent = custFullAddr;
  document.getElementById('cust-modal-distance-badge').textContent = cust.distance_km !== null ? `${cust.distance_km} km` : '~1.2 km';
  document.getElementById('cust-modal-instructions').textContent = cust.delivery_instructions || 'Leave in milk bag on door handle/hook';

  const directionsBtn = document.getElementById('btn-cust-modal-directions');
  if (directionsBtn) {
    directionsBtn.href = `https://www.google.com/maps/dir/?api=1&origin=${dairyLat},${dairyLng}&destination=${custLat},${custLng}`;
  }

  Modal.open('customer-map-modal');

  setTimeout(() => {
    if (custRouteMap) {
      custRouteMap.remove();
      custRouteMap = null;
    }

    const mapContainer = document.getElementById('cust-route-map');
    if (!mapContainer) return;

    custRouteMap = L.map('cust-route-map').setView([(dairyLat + custLat) / 2, (dairyLng + custLng) / 2], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(custRouteMap);

    const dairyIcon = L.divIcon({
      className: 'custom-map-pin dairy-pin',
      html: '<div style="background:#2563EB; color:#FFF; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(37,99,235,0.4); border:2px solid #FFF;"><i class="fa-solid fa-cow" style="font-size:16px;"></i></div>',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    const custIcon = L.divIcon({
      className: 'custom-map-pin cust-pin',
      html: '<div style="background:#16A34A; color:#FFF; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(22,163,74,0.4); border:2px solid #FFF;"><i class="fa-solid fa-house-chimney" style="font-size:16px;"></i></div>',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    L.marker([dairyLat, dairyLng], { icon: dairyIcon })
      .addTo(custRouteMap)
      .bindPopup(`<strong>${dairyName} (Dispatch Origin)</strong><br><small>${dairyAddr}</small>`);

    L.marker([custLat, custLng], { icon: custIcon })
      .addTo(custRouteMap)
      .bindPopup(`<strong>${cust.full_name} (Delivery Destination)</strong><br><small>${custFullAddr}</small><br><strong>Distance: ${cust.distance_km || 1.2} km</strong>`)
      .openPopup();

    const polyline = L.polyline([[dairyLat, dairyLng], [custLat, custLng]], {
      color: '#2563EB',
      weight: 4,
      opacity: 0.85,
      dashArray: '8, 8',
    }).addTo(custRouteMap);

    custRouteMap.fitBounds(polyline.getBounds(), { padding: [50, 50] });
  }, 250);
};

let partnerProductsList = [];

/**
 * Products Catalog CRUD
 */
async function loadProducts() {
  const container = document.getElementById('partner-products-grid');
  if (!currentDairy) return;

  try {
    const res = await API.get(`/api/products/dairy/${currentDairy.id}`);
    const products = res.products || [];
    partnerProductsList = products;

    if (products.length === 0) {
      container.innerHTML = `
        <div class="empty-state card" style="grid-column: 1 / -1;">
          <div class="empty-icon"><i class="fa-solid fa-bottle-droplet"></i></div>
          <h3>No Milk Products Created</h3>
          <p class="text-muted">Add your fresh milk and dairy variants so customers can subscribe.</p>
          <button class="btn btn-primary" onclick="openAddProductModal()" style="margin-top: 1rem;">
            <i class="fa-solid fa-plus"></i> Add First Product
          </button>
        </div>
      `;
      return;
    }

    const fallbackImg = 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600';
    container.innerHTML = products.map((p) => {
      const prodImg = p.image_url || fallbackImg;
      const desc = p.description || 'Farm-fresh milk variant.';
      const isLong = desc.length > 70;
      return `
        <div class="product-item-card" id="partner-product-${p.id}">
          <div class="product-img-wrapper">
            <span class="badge badge-primary product-card-badge-left">
              <i class="fa-solid fa-bottle-droplet"></i> ${p.milk_type}
            </span>
            <img src="${prodImg}"
                 class="product-item-img"
                 alt="${p.name}"
                 onerror="this.src='${fallbackImg}'">
          </div>
          <div class="product-item-content">
            <div>
              <div class="flex items-center justify-between" style="margin-bottom: 0.5rem;">
                <h4 class="product-title" style="margin-bottom: 0; font-size: 1.125rem;">${p.name}</h4>
                <span style="font-size: 1.25rem; font-weight: 800; color: var(--theme-primary);">₹${p.price_per_unit} <span style="font-size: 0.75rem; color: var(--color-text-muted);">/ ${p.unit || 'Litre'}</span></span>
              </div>
              <p class="product-desc" id="partner-prod-desc-${p.id}" style="color: var(--color-text-muted); font-size: 0.8125rem; line-height: 1.4; margin-bottom: 0.5rem; cursor: pointer;" onclick="togglePartnerProductDesc('${p.id}')">${desc}</p>
              ${isLong ? `
                <button type="button" class="btn-toggle-desc" id="partner-toggle-${p.id}" onclick="togglePartnerProductDesc('${p.id}')">
                  <span class="toggle-label">Read More</span> <i class="fa-solid fa-chevron-down" style="font-size: 0.72rem;"></i>
                </button>
              ` : ''}
              <div class="product-specs-list flex items-center gap-2 flex-wrap">
                ${p.fat_content ? `<span class="spec-badge"><i class="fa-solid fa-droplet" style="color:#2563EB;"></i> Fat: ${p.fat_content}%</span>` : ''}
                ${p.snf_content ? `<span class="spec-badge"><i class="fa-solid fa-flask" style="color:#16A34A;"></i> SNF: ${p.snf_content}%</span>` : ''}
              </div>
            </div>
            <div class="flex items-center justify-between gap-2" style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--color-border);">
              <button class="btn btn-secondary btn-sm" style="color: var(--color-danger);" onclick="deleteProduct('${p.id}')">
                <i class="fa-solid fa-trash"></i> Delete
              </button>
              <button class="btn btn-secondary btn-sm" onclick="openEditProductModal('${p.id}')">
                <i class="fa-solid fa-pen-to-square"></i> Edit Details
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    window.togglePartnerProductDesc = function (prodId) {
      const descEl = document.getElementById(`partner-prod-desc-${prodId}`);
      const btnEl = document.getElementById(`partner-toggle-${prodId}`);
      if (!descEl) return;
      const isExp = descEl.classList.toggle('expanded');
      if (btnEl) {
        const label = btnEl.querySelector('.toggle-label');
        const icon = btnEl.querySelector('i');
        if (isExp) {
          if (label) label.textContent = 'Show Less';
          if (icon) icon.className = 'fa-solid fa-chevron-up';
        } else {
          if (label) label.textContent = 'Read More';
          if (icon) icon.className = 'fa-solid fa-chevron-down';
        }
      }
    };

  } catch (err) {
    container.innerHTML = `<div class="card" style="color: var(--color-danger); padding: 1.5rem;">Error: ${err.message}</div>`;
  }
}

window.openAddProductModal = function () {
  document.getElementById('product-form').reset();
  document.getElementById('prod-id').value = '';
  const previewWrap = document.getElementById('prod-image-preview-wrap');
  if (previewWrap) previewWrap.style.display = 'none';
  const statusEl = document.getElementById('prod-file-status');
  if (statusEl) statusEl.textContent = 'or enter image link below';
  document.getElementById('product-modal-title').textContent = 'Add Milk Product';
  document.getElementById('btn-save-product').textContent = 'Save Product';
  Modal.open('product-modal');
};

window.openEditProductModal = function (prodId) {
  const p = partnerProductsList.find((item) => item.id === prodId);
  if (!p) return;

  document.getElementById('product-form').reset();
  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-name').value = p.name || '';
  document.getElementById('prod-milk-type').value = p.milk_type || 'Cow Milk';
  if (document.getElementById('prod-unit')) document.getElementById('prod-unit').value = p.unit || 'Litre';
  document.getElementById('prod-price').value = p.price_per_unit || '';
  document.getElementById('prod-fat').value = p.fat_content !== null && p.fat_content !== undefined ? p.fat_content : '';
  document.getElementById('prod-snf').value = p.snf_content !== null && p.snf_content !== undefined ? p.snf_content : '';
  document.getElementById('prod-desc').value = p.description || '';
  document.getElementById('prod-image').value = p.image_url || '';

  const previewWrap = document.getElementById('prod-image-preview-wrap');
  const previewImg = document.getElementById('prod-image-preview');
  if (previewWrap && previewImg) {
    if (p.image_url) {
      previewImg.src = p.image_url;
      previewWrap.style.display = 'block';
    } else {
      previewWrap.style.display = 'none';
    }
  }

  const statusEl = document.getElementById('prod-file-status');
  if (statusEl) statusEl.textContent = 'or update image link below';

  document.getElementById('product-modal-title').textContent = 'Edit Product Details';
  document.getElementById('btn-save-product').textContent = 'Update Product';
  Modal.open('product-modal');
};

// Setup product image file upload and live preview
document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('prod-image-file');
  const urlInput = document.getElementById('prod-image');
  const previewWrap = document.getElementById('prod-image-preview-wrap');
  const previewImg = document.getElementById('prod-image-preview');
  const statusEl = document.getElementById('prod-file-status');

  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (statusEl) statusEl.textContent = 'Uploading photo...';

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'product');

        const data = await API.postForm('/api/upload/products', formData);
        if (!data || !data.success) {
          throw new Error(data?.message || 'Image upload failed');
        }

        if (urlInput) urlInput.value = data.url;
        if (previewImg) previewImg.src = data.url;
        if (previewWrap) previewWrap.style.display = 'block';
        if (statusEl) statusEl.textContent = '✓ Photo uploaded';
        Toast.success('Photo Uploaded', 'Product image ready to save.');
      } catch (err) {
        if (statusEl) statusEl.textContent = 'Upload failed';
        Toast.error('Upload Error', err.message);
      }
    });
  }

  if (urlInput) {
    urlInput.addEventListener('input', () => {
      const val = urlInput.value.trim();
      if (val && previewImg && previewWrap) {
        previewImg.src = val;
        previewWrap.style.display = 'block';
      } else if (previewWrap) {
        previewWrap.style.display = 'none';
      }
    });
  }
});

document.getElementById('btn-save-product')?.addEventListener('click', async () => {
  const prodId = document.getElementById('prod-id').value;
  const name = document.getElementById('prod-name').value.trim();
  const milk_type = document.getElementById('prod-milk-type').value;
  const price_per_unit = document.getElementById('prod-price').value;
  const unit = document.getElementById('prod-unit')?.value || 'Litre';
  const fat_content = document.getElementById('prod-fat').value;
  const snf_content = document.getElementById('prod-snf').value;
  const description = document.getElementById('prod-desc').value.trim();
  const image_url = document.getElementById('prod-image').value.trim();

  if (!name || !price_per_unit) {
    Toast.warning('Missing Fields', 'Please enter product name and price.');
    return;
  }

  const payload = {
    name,
    milk_type,
    unit,
    price_per_unit: parseFloat(price_per_unit),
    fat_content: fat_content ? parseFloat(fat_content) : null,
    snf_content: snf_content ? parseFloat(snf_content) : null,
    description,
    image_url,
    dairy_id: currentDairy.id,
  };

  try {
    if (prodId) {
      await API.put(`/api/products/${prodId}`, payload);
      Toast.success('Product Updated', 'Product details saved successfully.');
    } else {
      await API.post('/api/products', payload);
      Toast.success('Product Added', 'New milk variant published.');
    }

    Modal.close('product-modal');
    loadProducts();
  } catch (err) {
    Toast.error('Save Error', err.message);
  }
});

window.deleteProduct = function (prodId) {
  Modal.confirm({
    title: 'Delete Product?',
    message: 'Are you sure you want to remove this product variant from your catalog?',
    confirmText: 'Yes, Delete',
    onConfirm: async () => {
      try {
        await API.delete(`/api/products/${prodId}`);
        Toast.info('Product Deleted', 'Removed from catalog.');
        loadProducts();
      } catch (err) {
        Toast.error('Delete Error', err.message);
      }
    }
  });
};

/**
 * Load Subscribers & Platform Fee Financials
 */
async function loadSubscribers() {
  const tbody = document.getElementById('partner-subscribers-tbody');
  try {
    const res = await API.get('/api/subscriptions/partner/all');
    const subs = res.subscriptions || [];
    const fin = res.financials || {};

    // Update sidebar badges and financial cards
    document.getElementById('badge-partner-subs').textContent = fin.active_subscribers || subs.length;
    document.getElementById('stat-partner-sub-count').textContent = fin.active_subscribers || 0;
    document.getElementById('badge-active-subs-pill').textContent = `${fin.active_subscribers || 0} Active`;
    document.getElementById('partner-fee-rate-label').textContent = `₹${fin.platform_fee_per_sub || 50}/sub`;

    document.getElementById('stat-partner-gross').textContent = `₹${(fin.total_gross_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('stat-partner-platform-fee').textContent = `-₹${(fin.total_platform_fees || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('stat-partner-net-payout').textContent = `₹${(fin.net_partner_payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    if (subs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem;" class="text-muted">No customer subscribers yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = subs.map((s) => {
      const isDaily = s.frequency === 'daily';
      const monthlyDays = isDaily ? 30 : (s.frequency === 'alternate' ? 15 : (s.custom_days?.length || 4) * 4.3);
      const monthlyLitres = parseFloat(s.monthly_volume_litres) || ((parseFloat(s.quantity) || 1.0) * monthlyDays);
      const unitPrice = parseFloat(s.product?.price_per_unit) || 65.0;
      const grossVal = parseFloat(s.monthly_gross_amount) || (monthlyLitres * unitPrice);
      const feeVal = parseFloat(s.platform_fee) || (fin.platform_fee_per_sub || 50.0);
      const netVal = parseFloat(s.partner_net_amount) || Math.max(0, grossVal - feeVal);

      const isPaused = s.status === 'paused';
      const isActive = s.status === 'active';

      let statusBadgeHtml = '';
      if (isActive) {
        statusBadgeHtml = `<span class="badge badge-success">● ACTIVE</span>`;
      } else if (isPaused) {
        const startStr = s.pause_start_date ? new Date(s.pause_start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Now';
        const endStr = s.pause_end_date ? new Date(s.pause_end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Indefinite';
        statusBadgeHtml = `
          <span class="badge" style="background:#FEF3C7; color:#92400E; border:1px solid #FDE68A; font-weight:700;">
            ⏸ PAUSED
          </span>
          <div style="font-size: 0.7rem; color: #92400E; font-weight: 600; margin-top: 0.25rem;">
            ${startStr} – ${endStr} (${s.paused_days_count || 0}d)
          </div>
          <div style="font-size: 0.7rem; color: #166534; font-weight: 700;">
            Credit: ₹${(parseFloat(s.adjusted_credit_amount) || 0).toFixed(2)}
          </div>
        `;
      } else {
        statusBadgeHtml = `<span class="badge badge-gray">${(s.status || 'inactive').toUpperCase()}</span>`;
      }

      return `
        <tr>
          <td>
            <div style="font-weight: 700;">${s.customer?.full_name || 'Customer'}</div>
            <div class="text-muted" style="font-size: 0.75rem;"><i class="fa-solid fa-phone"></i> ${s.customer?.phone || s.customer?.email || 'N/A'}</div>
          </td>
          <td>
            <div style="font-weight: 700;">${s.product?.name || 'Fresh Milk'}</div>
            <div class="text-muted" style="font-size: 0.75rem;">₹${unitPrice} / ${s.product?.unit || 'L'}</div>
          </td>
          <td>
            <strong>${s.quantity} L</strong>
            <div><span class="badge badge-primary" style="font-size: 0.7rem; padding: 0.15rem 0.4rem;">${s.slot.toUpperCase()}</span></div>
          </td>
          <td>
            <span style="font-weight: 600;">${s.frequency.toUpperCase()}</span>
            <div class="text-muted" style="font-size: 0.75rem;">~${monthlyLitres.toFixed(0)} L/mo</div>
          </td>
          <td>
            <strong style="color: var(--color-text);">₹${grossVal.toFixed(2)}</strong>
            ${isPaused && s.adjusted_credit_amount > 0 ? `<div style="font-size: 0.7rem; color: #DC2626;">(-₹${parseFloat(s.adjusted_credit_amount).toFixed(2)} pause adj)</div>` : ''}
          </td>
          <td>
            <span class="badge" style="background: #FEF2F2; color: #DC2626; font-weight: 700;">
              -₹${feeVal.toFixed(2)}
            </span>
          </td>
          <td>
            <strong style="color: #16A34A; font-size: 0.9375rem;">₹${netVal.toFixed(2)}</strong>
          </td>
          <td>
            ${statusBadgeHtml}
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="color: var(--color-danger); text-align: center;">Error: ${err.message}</td></tr>`;
  }
}

/**
 * Dairy Settings & Map Radius Setup
 */
function initSettingsMap(lat, lng) {
  const initialLat = parseFloat(lat) || 19.0760;
  const initialLng = parseFloat(lng) || 72.8777;

  const updateCoordsBadge = (cLat, cLng) => {
    const badge = document.getElementById('partner-coords-display');
    if (badge) {
      const latDir = cLat >= 0 ? 'N' : 'S';
      const lngDir = cLng >= 0 ? 'E' : 'W';
      badge.textContent = `${Math.abs(cLat).toFixed(4)}° ${latDir}, ${Math.abs(cLng).toFixed(4)}° ${lngDir}`;
    }
  };

  const updateSettingsLocation = async (cLat, cLng, forceOverwrite = false) => {
    const latNum = parseFloat(cLat);
    const lngNum = parseFloat(cLng);
    document.getElementById('setting-lat').value = latNum;
    document.getElementById('setting-lng').value = lngNum;
    updateCoordsBadge(latNum, lngNum);

    if (settingsMarker) settingsMarker.setLatLng([latNum, lngNum]);
    if (settingsMap) settingsMap.panTo([latNum, lngNum]);

    if (typeof MapHelper !== 'undefined' && MapHelper.reverseGeocodeDetails) {
      const details = await MapHelper.reverseGeocodeDetails(latNum, lngNum);
      const addrField = document.getElementById('setting-address');
      const cityField = document.getElementById('setting-city');
      const stateField = document.getElementById('setting-state');
      const pinField = document.getElementById('setting-pincode');

      if (addrField && (forceOverwrite || !addrField.value || addrField.value.trim().length < 5)) {
        if (details.full_address) addrField.value = details.full_address;
      }
      if (cityField && (forceOverwrite || !cityField.value)) {
        if (details.city) cityField.value = details.city;
      }
      if (stateField && (forceOverwrite || !stateField.value)) {
        if (details.state) stateField.value = details.state;
      }
      if (pinField && (forceOverwrite || !pinField.value)) {
        if (details.pincode) pinField.value = details.pincode;
      }
    }
  };

  if (!settingsMap) {
    settingsMap = L.map('settings-map').setView([initialLat, initialLng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(settingsMap);

    settingsMarker = L.marker([initialLat, initialLng], {
      draggable: true,
      icon: (typeof MapHelper !== 'undefined' && MapHelper.createDairyIcon)
        ? MapHelper.createDairyIcon()
        : new L.Icon.Default(),
    }).addTo(settingsMap);

    settingsMarker.on('dragend', async (e) => {
      const coords = e.target.getLatLng();
      await updateSettingsLocation(coords.lat, coords.lng, true);
    });

    settingsMap.on('click', async (e) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      await updateSettingsLocation(clickLat, clickLng, true);
    });

    const radiusRange = document.getElementById('setting-radius');
    if (radiusRange) {
      radiusRange.addEventListener('input', (e) => {
        document.getElementById('setting-radius-val').textContent = `${e.target.value} km`;
      });
    }

    // Live GPS Button
    const gpsBtn = document.getElementById('btn-detect-partner-gps');
    if (gpsBtn) {
      gpsBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
          if (typeof Toast !== 'undefined') Toast.warning('Geolocation Unavailable', 'Your browser does not support GPS location.');
          return;
        }
        gpsBtn.innerHTML = '<span class="spinner"></span> Locating...';
        gpsBtn.disabled = true;

        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const liveLat = pos.coords.latitude;
            const liveLng = pos.coords.longitude;
            await updateSettingsLocation(liveLat, liveLng, true);
            gpsBtn.innerHTML = '<i class="fa-solid fa-check" style="color: var(--color-success);"></i> Location Found';
            setTimeout(() => {
              gpsBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Use Live GPS Location';
              gpsBtn.disabled = false;
            }, 2000);
            if (typeof Toast !== 'undefined') Toast.success('Location Detected', 'Your farm exact GPS coordinates, address, and city/state/pincode have been auto-filled.');
          },
          (err) => {
            console.warn('Geolocation error:', err.message);
            gpsBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Use Live GPS Location';
            gpsBtn.disabled = false;
            if (typeof Toast !== 'undefined') Toast.warning('GPS Notice', 'Could not retrieve exact GPS. Please click or drag pin on the map.');
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });
    }
  } else {
    settingsMap.setView([initialLat, initialLng], 14);
    if (settingsMarker) settingsMarker.setLatLng([initialLat, initialLng]);
  }

  updateCoordsBadge(initialLat, initialLng);
}

function setupSettingsForm() {
  // 1. Partner Profile Avatar Upload, Update & Delete
  const avatarFile = document.getElementById('partner-avatar-file');
  const avatarTrigger = document.getElementById('partner-avatar-trigger');
  const chooseAvatarBtn = document.getElementById('btn-partner-choose-avatar');
  const deleteAvatarBtn = document.getElementById('btn-partner-delete-avatar');
  const avatarImg = document.getElementById('partner-setting-avatar-img');

  const triggerAvatarUpload = () => avatarFile?.click();
  avatarTrigger?.addEventListener('click', triggerAvatarUpload);
  chooseAvatarBtn?.addEventListener('click', triggerAvatarUpload);

  avatarFile?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const user = Auth.getUser();
    const oldAvatarUrl = user?.avatar_url || '';

    // Instant local preview
    const reader = new FileReader();
    reader.onload = (re) => {
      if (avatarImg) avatarImg.src = re.target.result;
      const sidebarAvatar = document.getElementById('sidebar-user-avatar');
      if (sidebarAvatar) sidebarAvatar.src = re.target.result;
    };
    reader.readAsDataURL(file);

    try {
      Toast.info('Uploading Photo...', 'Saving partner avatar to Supabase');
      const res = oldAvatarUrl
        ? await API.updateUpload(file, 'avatar', oldAvatarUrl)
        : await API.upload(file, 'avatar');

      // Update profile in backend
      await API.put('/api/auth/profile', { avatar_url: res.url });
      if (user) {
        user.avatar_url = res.url;
        Auth.saveSession(Auth.getToken(), user, currentDairy);
      }
      setupHeader();
      Toast.success('Avatar Updated!', 'Your profile photo is saved to Supabase.');
    } catch (err) {
      Toast.error('Avatar Upload Failed', err.message);
    }
  });

  deleteAvatarBtn?.addEventListener('click', async () => {
    try {
      Toast.info('Deleting Photo...', 'Removing profile avatar');
      await API.deleteAvatar();
      const user = Auth.getUser();
      if (user) {
        user.avatar_url = null;
        Auth.saveSession(Auth.getToken(), user, currentDairy);
      }
      setupHeader();
      Toast.success('Photo Removed', 'Default avatar restored.');
    } catch (err) {
      Toast.error('Delete Failed', err.message);
    }
  });

  // 2. Dairy Storefront Banner Upload, Update & Delete
  const bannerFile = document.getElementById('partner-banner-file');
  const bannerUploadBtn = document.getElementById('btn-partner-upload-banner');
  const deleteBannerBtn = document.getElementById('btn-partner-delete-banner');
  const bannerImg = document.getElementById('partner-banner-img');
  const bannerUrlInput = document.getElementById('setting-banner-url');

  bannerUploadBtn?.addEventListener('click', () => bannerFile?.click());

  bannerFile?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const oldBanner = bannerUrlInput?.value || '';

    const reader = new FileReader();
    reader.onload = (re) => {
      if (bannerImg) bannerImg.src = re.target.result;
    };
    reader.readAsDataURL(file);

    try {
      Toast.info('Uploading Banner...', 'Saving farm banner to Supabase');
      const res = oldBanner
        ? await API.updateUpload(file, 'banner', oldBanner)
        : await API.upload(file, 'banner');

      if (bannerUrlInput) bannerUrlInput.value = res.url;
      if (deleteBannerBtn) deleteBannerBtn.style.display = 'inline-flex';
      Toast.success('Banner Uploaded!', 'Click "Save Dairy Profile" to save your new cover.');
    } catch (err) {
      Toast.error('Banner Upload Failed', err.message);
    }
  });

  deleteBannerBtn?.addEventListener('click', async () => {
    try {
      Toast.info('Removing Banner...', 'Deleting banner image');
      await API.deleteBanner();
      if (bannerUrlInput) bannerUrlInput.value = '';
      const defaultBanner = 'https://images.unsplash.com/photo-1527153857715-3908f2ae5e81?w=800';
      if (bannerImg) bannerImg.src = defaultBanner;
      if (deleteBannerBtn) deleteBannerBtn.style.display = 'none';
      Toast.success('Banner Removed', 'Default cover restored.');
    } catch (err) {
      Toast.error('Banner Delete Failed', err.message);
    }
  });

  // 3. Dairy Certificate File Upload, Update & Delete
  const certFile = document.getElementById('partner-cert-file');
  const replaceCertBtn = document.getElementById('btn-partner-replace-cert');
  const uploadCertBtn = document.getElementById('btn-partner-upload-cert');
  const deleteCertBtn = document.getElementById('btn-partner-delete-cert');
  const viewCertBtn = document.getElementById('btn-partner-view-cert');
  const certUrlInput = document.getElementById('setting-cert-url');

  const triggerCertUpload = () => certFile?.click();
  replaceCertBtn?.addEventListener('click', triggerCertUpload);
  uploadCertBtn?.addEventListener('click', triggerCertUpload);

  certFile?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const oldCert = certUrlInput?.value || currentDairy?.certificate_url || '';

    try {
      Toast.info('Uploading Certificate...', 'Saving compliance document to Supabase Bucket');
      const res = oldCert
        ? await API.updateUpload(file, 'certificate', oldCert)
        : await API.upload(file, 'certificate');

      if (certUrlInput) certUrlInput.value = res.url;
      renderPartnerCertificateCard(res.url);
      Toast.success('Certificate Saved!', 'Click "Save Dairy Profile" to publish changes.');
    } catch (err) {
      Toast.error('Certificate Upload Failed', err.message);
    }
  });

  deleteCertBtn?.addEventListener('click', () => {
    Modal.confirm({
      title: 'Delete Dairy Certificate?',
      message: 'This will remove your compliance file from Supabase. Are you sure?',
      confirmText: 'Yes, Delete Certificate',
      onConfirm: async () => {
        try {
          Toast.info('Deleting Certificate...', 'Removing compliance document');
          await API.deleteCertificate();
          if (certUrlInput) certUrlInput.value = '';
          if (currentDairy) currentDairy.certificate_url = null;
          renderPartnerCertificateCard(null);
          Toast.success('Certificate Deleted', 'Your compliance file has been removed.');
        } catch (err) {
          Toast.error('Delete Failed', err.message);
        }
      }
    });
  });

  viewCertBtn?.addEventListener('click', () => {
    const certUrl = certUrlInput?.value || currentDairy?.certificate_url;
    if (!certUrl) {
      Toast.warning('No Certificate', 'Please upload a certificate document first.');
      return;
    }
    openCertificateViewer(certUrl, `${currentDairy?.dairy_name || 'Dairy'} - Compliance Document`);
  });

  // 4. Save Settings Form
  document.getElementById('partner-settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const city = document.getElementById('setting-city')?.value.trim() || '';
    const state = document.getElementById('setting-state')?.value.trim() || '';
    const pincode = document.getElementById('setting-pincode')?.value.trim() || '';

    const payload = {
      dairy_name: document.getElementById('setting-dairy-name').value.trim(),
      fssai_license: document.getElementById('setting-fssai').value.trim(),
      description: document.getElementById('setting-description').value.trim(),
      phone: document.getElementById('setting-phone').value.trim(),
      delivery_radius_km: document.getElementById('setting-radius').value,
      address: document.getElementById('setting-address').value.trim(),
      city,
      state,
      pincode,
      latitude: document.getElementById('setting-lat').value,
      longitude: document.getElementById('setting-lng').value,
      morning_slot_start: document.getElementById('setting-morning-start').value,
      morning_slot_end: document.getElementById('setting-morning-end').value,
      evening_slot_start: document.getElementById('setting-evening-start').value,
      evening_slot_end: document.getElementById('setting-evening-end').value,
      banner_image: document.getElementById('setting-banner-url').value || undefined,
      certificate_url: document.getElementById('setting-cert-url').value || undefined,
    };

    const ownerFullName = document.getElementById('setting-partner-owner-name')?.value.trim();
    const ownerPhone = document.getElementById('setting-partner-owner-phone')?.value.trim();

    try {
      await API.put('/api/dairies/partner/me', payload);

      if (ownerFullName || city || state || pincode) {
        try {
          const profilePayload = {
            full_name: ownerFullName || undefined,
            phone: ownerPhone || undefined,
            city,
            state,
            pincode,
            address: payload.address,
          };
          const profRes = await API.put('/api/auth/profile', profilePayload);
          const currentUser = Auth.getUser() || {};
          Object.assign(currentUser, profilePayload);
          if (profRes.user) Object.assign(currentUser, profRes.user);
          Auth.saveSession(Auth.getToken(), currentUser, currentDairy);
        } catch (pErr) {
          console.warn('Owner profile update notice:', pErr.message);
        }
      }

      Toast.success('Profile Saved', 'Your dairy details, city, state, pincode, banner, and certificates have been updated.');
      loadPartnerDairy();
    } catch (err) {
      Toast.error('Save Error', err.message);
    }
  });
}

/**
 * Global Certificate Inspection / Viewer Modal
 */
window.openCertificateViewer = function (certUrl, title = 'Dairy Certificate & FSSAI Verification') {
  if (!certUrl) {
    Toast.warning('No Certificate Found', 'This partner has not attached a certificate file.');
    return;
  }

  const container = document.getElementById('cert-viewer-frame-container');
  const titleEl = document.getElementById('cert-modal-title');
  const downloadBtn = document.getElementById('btn-cert-download');

  if (titleEl) titleEl.textContent = title;
  if (downloadBtn) {
    downloadBtn.href = certUrl;
    downloadBtn.setAttribute('download', certUrl.split('/').pop() || 'certificate');
  }

  const isPdf = certUrl.toLowerCase().endsWith('.pdf');

  if (container) {
    if (isPdf) {
      container.innerHTML = `<iframe src="${certUrl}#toolbar=1" type="application/pdf" style="width:100%; height:100%; border:none;"></iframe>`;
    } else {
      container.innerHTML = `<img src="${certUrl}" alt="Certificate Document" style="max-width:100%; max-height:100%; object-fit:contain;">`;
    }
  }

  Modal.open('cert-viewer-modal');
};

/**
 * Setup Partner Account & Security Settings Tab
 */
function setupPartnerSettingsTab() {
  const user = Auth.getUser();

  // Populate current fields
  const curNameInput = document.getElementById('settings-partner-fullname');
  if (curNameInput && user) curNameInput.value = user.full_name || '';

  const curPhoneInput = document.getElementById('settings-partner-phone');
  if (curPhoneInput && user) curPhoneInput.value = user.phone || currentDairy?.phone || '';

  const curEmailInput = document.getElementById('settings-partner-current-email');
  if (curEmailInput && user) {
    curEmailInput.value = user.email || '';
  }

  // 1. Change Owner Full Name Form
  const changeNameForm = document.getElementById('form-partner-change-name');
  if (changeNameForm) {
    changeNameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newFullName = document.getElementById('settings-partner-fullname').value.trim();
      const newPhone = document.getElementById('settings-partner-phone')?.value.trim();
      const btn = document.getElementById('btn-partner-update-name');

      if (!newFullName) {
        Toast.warning('Missing Name', 'Please enter your owner / partner full name.');
        return;
      }

      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-sm" style="display:inline-block; margin-right:0.4rem;"></span> Updating...';

      try {
        const payload = { full_name: newFullName };
        if (newPhone) payload.phone = newPhone;

        const res = await API.put('/api/auth/profile', payload);

        const currentUser = Auth.getUser() || {};
        Object.assign(currentUser, payload);
        if (res.user) Object.assign(currentUser, res.user);
        Auth.saveSession(Auth.getToken(), currentUser, currentDairy);

        const sidebarUserName = document.getElementById('sidebar-user-name');
        if (sidebarUserName) sidebarUserName.textContent = newFullName;

        const ownerNameSetting = document.getElementById('setting-partner-owner-name');
        if (ownerNameSetting) ownerNameSetting.value = newFullName;

        Toast.success('Owner Name Updated!', `Partner account owner name has been updated to "${newFullName}".`);
      } catch (err) {
        Toast.error('Update Failed', err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  // 2. Change Email Form
  const changeEmailForm = document.getElementById('form-partner-change-email');
  if (changeEmailForm) {
    changeEmailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newEmail = document.getElementById('settings-partner-new-email').value.trim();
      const btn = document.getElementById('btn-partner-update-email');

      if (!newEmail || !newEmail.includes('@')) {
        Toast.warning('Invalid Email', 'Please enter a valid email address.');
        return;
      }

      if (user && newEmail.toLowerCase() === (user.email || '').toLowerCase()) {
        Toast.warning('Same Email', 'Please enter a different email address.');
        return;
      }

      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-sm" style="display:inline-block; margin-right:0.4rem;"></span> Updating...';

      try {
        const res = await API.put('/api/auth/change-email', {
          new_email: newEmail,
        });

        if (res.token) {
          Auth.saveSession(res.token, res.user || { ...user, email: newEmail }, Auth.getDairy());
        }

        if (curEmailInput) curEmailInput.value = newEmail;
        document.getElementById('settings-partner-new-email').value = '';

        Toast.success('Email Updated', res.message || 'Partner login email has been updated successfully.');
      } catch (err) {
        Toast.error('Email Update Failed', err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  // 2. Change Password & Strength Meter
  const newPassInput = document.getElementById('settings-partner-new-password');
  const strengthFill = document.getElementById('partner-password-strength-fill');
  const strengthText = document.getElementById('partner-password-strength-text');

  if (newPassInput && strengthFill && strengthText) {
    newPassInput.addEventListener('input', () => {
      const val = newPassInput.value;
      if (!val) {
        strengthFill.style.width = '0%';
        strengthFill.style.background = '#E2E8F0';
        strengthText.textContent = 'Strength: None';
        strengthText.style.color = 'var(--color-text-muted)';
        return;
      }

      let score = 0;
      if (val.length >= 6) score += 1;
      if (val.length >= 10) score += 1;
      if (/[A-Z]/.test(val)) score += 1;
      if (/[0-9]/.test(val)) score += 1;
      if (/[^A-Za-z0-9]/.test(val)) score += 1;

      if (score <= 2) {
        strengthFill.style.width = '33%';
        strengthFill.style.background = '#EF4444';
        strengthText.textContent = 'Strength: Weak (Add numbers / symbols)';
        strengthText.style.color = '#DC2626';
      } else if (score <= 4) {
        strengthFill.style.width = '66%';
        strengthFill.style.background = '#F59E0B';
        strengthText.textContent = 'Strength: Good';
        strengthText.style.color = '#D97706';
      } else {
        strengthFill.style.width = '100%';
        strengthFill.style.background = '#10B981';
        strengthText.textContent = 'Strength: Strong & Secure 🔒';
        strengthText.style.color = '#059669';
      }
    });
  }

  const changePassForm = document.getElementById('form-partner-change-password');
  if (changePassForm) {
    changePassForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPass = document.getElementById('settings-partner-current-password').value;
      const newPass = document.getElementById('settings-partner-new-password').value;
      const confirmPass = document.getElementById('settings-partner-confirm-password').value;
      const btn = document.getElementById('btn-partner-update-password');

      if (newPass.length < 6) {
        Toast.warning('Weak Password', 'New password must be at least 6 characters.');
        return;
      }

      if (newPass !== confirmPass) {
        Toast.warning('Password Mismatch', 'New password and confirmation do not match.');
        return;
      }

      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-sm" style="display:inline-block; margin-right:0.4rem;"></span> Updating...';

      try {
        const res = await API.put('/api/auth/change-password', {
          current_password: currentPass,
          new_password: newPass,
        });

        document.getElementById('settings-partner-current-password').value = '';
        document.getElementById('settings-partner-new-password').value = '';
        document.getElementById('settings-partner-confirm-password').value = '';
        if (strengthFill) strengthFill.style.width = '0%';
        if (strengthText) strengthText.textContent = 'Strength: None';

        Toast.success('Password Changed', res.message || 'Your partner password has been updated securely.');
      } catch (err) {
        Toast.error('Password Change Failed', err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  // 3. Forgot Password Link
  const forgotBtn = document.getElementById('btn-partner-forgot-password');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', async () => {
      const email = user?.email || (curEmailInput ? curEmailInput.value : '');
      if (!email) {
        Toast.warning('Missing Email', 'Could not detect partner email.');
        return;
      }

      forgotBtn.disabled = true;
      forgotBtn.innerHTML = '<span class="spinner-sm"></span> Sending...';

      try {
        const res = await API.post('/api/auth/forgot-password', { email });
        Toast.success('Reset Link Dispatched', res.message || 'Password reset link sent to your registered partner email.');
      } catch (err) {
        Toast.error('Request Failed', err.message);
      } finally {
        forgotBtn.disabled = false;
        forgotBtn.innerHTML = '<i class="fa-solid fa-key"></i> Send Reset Link';
      }
    });
  }

  // 4. Notification Preferences
  const prefsForm = document.getElementById('form-partner-notification-prefs');
  if (prefsForm) {
    prefsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn-partner-save-prefs');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-sm"></span> Saving...';

      try {
        const payload = {
          whatsapp_alerts: document.getElementById('partner-pref-whatsapp')?.checked || false,
          morning_alert: document.getElementById('partner-pref-morning')?.checked || false,
          payout_notices: document.getElementById('partner-pref-payouts')?.checked || false,
        };

        const res = await API.put('/api/auth/notification-preferences', payload);
        Toast.success('Preferences Saved', res.message || 'Your alert settings have been updated.');
      } catch (err) {
        Toast.error('Save Failed', err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  // 5. Logout All Devices
  const logoutAllBtn = document.getElementById('btn-partner-logout-all');
  if (logoutAllBtn) {
    logoutAllBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to log out of all other active sessions?')) return;
      try {
        const res = await API.post('/api/auth/logout-all');
        Toast.success('Sessions Terminated', res.message || 'All other active sessions have been logged out.');
      } catch (err) {
        Toast.error('Action Failed', err.message);
      }
    });
  }

  // 6. Pause Dairy Operations
  const pauseBtn = document.getElementById('btn-partner-pause-dairy');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      if (confirm('Temporarily pause storefront? Customers won\'t be able to find or subscribe until unpaused.')) {
        Toast.info('Storefront Paused', 'Your dairy listing is temporarily hidden from customer discovery.');
      }
    });
  }
}

/**
 * ==========================================================================
 * NOTIFICATION CENTER (PARTNER PORTAL)
 * ==========================================================================
 */
function setupNotifications() {
  const bellBtn = document.getElementById('btn-partner-notif-bell');
  const dropdown = document.getElementById('partner-notif-dropdown');
  const markAllBtn = document.getElementById('btn-mark-all-read');
  const closeBtn = document.getElementById('btn-close-notif-dropdown');

  if (bellBtn && dropdown) {
    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('active');
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.remove('active');
      });
    }

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
        dropdown.classList.remove('active');
      }
    });
  }

  // Filter tabs
  const tabBtns = document.querySelectorAll('.notif-tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentNotifFilter = btn.dataset.filter || 'all';
      renderNotifications();
    });
  });

  // Mark all as read
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      try {
        await API.patch('/api/notifications/read-all');
        partnerNotificationsList.forEach((n) => { n.is_read = true; });
        updateNotificationBadges(0);
        renderNotifications();
        Toast.info('Notifications Updated', 'All alerts marked as read.');
      } catch (err) {
        console.error('Mark all read error:', err);
      }
    });
  }
}

/**
 * Fetch Partner Notifications
 */
async function loadPartnerNotifications() {
  try {
    const res = await API.get('/api/notifications');
    const notifs = res.notifications || [];
    const unreadCount = res.unread_count || 0;

    // Trigger toast if a new unread pause/resume alert arrived
    if (unreadCount > lastKnownUnreadCount && lastKnownUnreadCount !== 0) {
      const latestUnread = notifs.find((n) => !n.is_read);
      if (latestUnread) {
        if (latestUnread.type === 'delivery_paused') {
          Toast.warning(latestUnread.title, latestUnread.message);
        } else if (latestUnread.type === 'delivery_resumed') {
          Toast.success(latestUnread.title, latestUnread.message);
        } else {
          Toast.info(latestUnread.title, latestUnread.message);
        }
        // Auto refresh dispatch roster and subscribers list
        loadDispatchRoster();
        loadSubscribers();
      }
    }
    lastKnownUnreadCount = unreadCount;

    partnerNotificationsList = notifs;
    updateNotificationBadges(unreadCount);
    renderNotifications();

  } catch (err) {
    console.error('Error loading partner notifications:', err);
  }
}

function updateNotificationBadges(unreadCount) {
  const badge = document.getElementById('partner-notif-badge');
  const countPill = document.getElementById('partner-notif-count-pill');

  if (badge) {
    if (unreadCount > 0) {
      badge.style.display = 'flex';
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    } else {
      badge.style.display = 'none';
    }
  }

  if (countPill) {
    countPill.textContent = `${unreadCount} unread`;
  }
}

/**
 * Render Notification List with Customer Details & Action Links
 */
function renderNotifications() {
  const container = document.getElementById('partner-notif-list');
  if (!container) return;

  let filtered = partnerNotificationsList;
  if (currentNotifFilter === 'pause') {
    filtered = partnerNotificationsList.filter((n) => (n.type || '').includes('pause') || (n.type || '').includes('resume'));
  } else if (currentNotifFilter === 'orders') {
    filtered = partnerNotificationsList.filter((n) => !(n.type || '').includes('pause') && !(n.type || '').includes('resume'));
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding: 2.5rem 1rem; text-align: center; color: var(--color-text-muted);">
        <i class="fa-solid fa-bell-slash" style="font-size: 1.75rem; margin-bottom: 0.5rem; display: block; opacity: 0.4;"></i>
        No notifications in this filter
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((n) => {
    const isUnread = !n.is_read;
    const type = n.type || 'general';
    const data = n.data || {};

    let iconClass = 'sub';
    let iconHtml = '<i class="fa-solid fa-receipt"></i>';

    if (type === 'delivery_paused') {
      iconClass = 'pause';
      iconHtml = '<i class="fa-solid fa-pause"></i>';
    } else if (type === 'delivery_resumed') {
      iconClass = 'resume';
      iconHtml = '<i class="fa-solid fa-play"></i>';
    } else if (type === 'subscription_cancelled') {
      iconClass = 'cancel';
      iconHtml = '<i class="fa-solid fa-ban"></i>';
    }

    const timeAgo = formatNotifTime(n.created_at);
    const cleanPhone = (data.customer_phone || '').replace(/[^0-9]/g, '');

    const whatsappUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=Hello%20${encodeURIComponent(data.customer_name || 'Customer')},%20this%20is%20${encodeURIComponent(currentDairy?.dairy_name || 'Near Dairy')}%20regarding%20your%20milk%20subscription.`
      : '#';

    return `
      <div class="notif-item ${isUnread ? 'unread' : ''}" id="notif-item-${n.id}">
        <div class="notif-icon ${iconClass}">
          ${iconHtml}
        </div>
        <div class="notif-body">
          <div class="notif-heading">
            <span>${n.title}</span>
            <span class="notif-time">${timeAgo}</span>
          </div>
          <div class="notif-msg">${n.message}</div>

          <!-- Rich Metadata Chips -->
          <div class="notif-chips">
            ${data.customer_name ? `<span class="notif-chip"><i class="fa-solid fa-user"></i> ${data.customer_name}</span>` : ''}
            ${data.quantity && data.product_name ? `<span class="notif-chip"><i class="fa-solid fa-bottle-droplet"></i> ${data.quantity}L ${data.product_name}</span>` : ''}
            ${data.pause_start_date ? `<span class="notif-chip highlight"><i class="fa-solid fa-calendar-days"></i> ${formatDateShort(data.pause_start_date)} – ${data.pause_end_date ? formatDateShort(data.pause_end_date) : 'Indefinite'}</span>` : ''}
            ${data.adjusted_credit_amount ? `<span class="notif-chip credit"><i class="fa-solid fa-wallet"></i> Credit: ₹${parseFloat(data.adjusted_credit_amount).toFixed(2)}</span>` : ''}
            ${data.reason ? `<span class="notif-chip"><i class="fa-solid fa-circle-info"></i> ${data.reason}</span>` : ''}
          </div>

          <!-- Quick Action Buttons -->
          <div class="notif-actions">
            ${cleanPhone ? `
              <a href="tel:${cleanPhone}" class="btn btn-secondary btn-sm" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;">
                <i class="fa-solid fa-phone"></i> Call
              </a>
              <a href="${whatsappUrl}" target="_blank" class="btn btn-secondary btn-sm" style="font-size: 0.72rem; padding: 0.2rem 0.5rem; color: #16A34A;">
                <i class="fa-brands fa-whatsapp"></i> WhatsApp
              </a>
            ` : ''}
            ${isUnread ? `
              <button type="button" class="btn btn-ghost btn-sm" style="font-size: 0.72rem; padding: 0.2rem 0.5rem; color: var(--theme-primary);" onclick="markNotificationRead('${n.id}')">
                <i class="fa-solid fa-check"></i> Mark read
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Mark single notification as read
 */
window.markNotificationRead = async function (notifId) {
  try {
    await API.patch(`/api/notifications/${notifId}/read`);
    const found = partnerNotificationsList.find((n) => n.id === notifId);
    if (found) found.is_read = true;
    const unreadCount = partnerNotificationsList.filter((n) => !n.is_read).length;
    lastKnownUnreadCount = unreadCount;
    updateNotificationBadges(unreadCount);
    renderNotifications();
  } catch (err) {
    console.error('Mark read error:', err);
  }
};

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatNotifTime(dateStr) {
  if (!dateStr) return 'Recently';
  const now = new Date();
  const d = new Date(dateStr);
  const diffSec = Math.floor((now - d) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * =========================================================================
 * DAIRY PARTNER SUPPORT & LIVE CHAT ENGINE
 * =========================================================================
 */

let partnerTicketsList = [];
let activePartnerChatTicketId = null;
let partnerChatPollTimer = null;
let partnerChatAttachment = null;

function initPartnerSupport() {
  // 1. Open New Ticket Modal
  document.getElementById('btn-partner-open-new-ticket')?.addEventListener('click', () => {
    document.getElementById('form-partner-new-ticket')?.reset();
    Modal.open('modal-partner-new-ticket');
  });

  // 2. Refresh Button
  document.getElementById('btn-partner-refresh-support')?.addEventListener('click', () => {
    loadPartnerTickets();
    Toast.success('Refreshed', 'Support conversations updated.');
  });

  // 3. New Ticket Submit
  const newTicketForm = document.getElementById('form-partner-new-ticket');
  if (newTicketForm) {
    newTicketForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const category = document.getElementById('partner-ticket-category').value;
      const priority = document.getElementById('partner-ticket-priority').value;
      const subject = document.getElementById('partner-ticket-subject').value.trim();
      const message = document.getElementById('partner-ticket-message').value.trim();
      const fileInput = document.getElementById('partner-ticket-attachment');
      const submitBtn = document.getElementById('btn-partner-submit-ticket');

      if (!subject || !message) {
        Toast.warning('Missing Information', 'Please provide a subject and detailed description.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-sm" style="display:inline-block; margin-right:0.4rem;"></span> Submitting...';

      try {
        let attachment_url = null;
        if (fileInput && fileInput.files && fileInput.files[0]) {
          const formData = new FormData();
          formData.append('file', fileInput.files[0]);
          formData.append('type', 'general');

          const uploadRes = await API.postForm('/api/upload/general', formData);
          attachment_url = uploadRes.url;
        }

        const payload = {
          subject,
          category,
          priority,
          message,
          dairy_id: currentDairy ? currentDairy.id : null,
          attachment_url,
        };

        const res = await API.post('/api/support/tickets', payload);
        Toast.success('Ticket Submitted!', `Ticket #${res.ticket.ticket_number} created. Platform Support will reply shortly.`);
        Modal.close('modal-partner-new-ticket');
        newTicketForm.reset();

        await loadPartnerTickets();
        if (res.ticket?.id) {
          openPartnerTicketChat(res.ticket.id);
        }
      } catch (err) {
        Toast.error('Submission Failed', err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Support Ticket';
      }
    });
  }

  // 4. Partner Chat Composer
  const chatForm = document.getElementById('form-partner-chat-composer');
  const chatInput = document.getElementById('partner-chat-input');
  if (chatForm && chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    });

    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!activePartnerChatTicketId) return;

      const messageText = chatInput.value.trim();
      if (!messageText && !partnerChatAttachment) return;

      const sendBtn = document.getElementById('btn-partner-send-msg');
      sendBtn.disabled = true;

      try {
        let attachment_url = null;
        if (partnerChatAttachment && partnerChatAttachment.file) {
          const formData = new FormData();
          formData.append('file', partnerChatAttachment.file);
          formData.append('type', 'general');

          const uploadRes = await API.postForm('/api/upload/general', formData);
          attachment_url = uploadRes.url;
        }

        await API.post(`/api/support/tickets/${activePartnerChatTicketId}/messages`, {
          message: messageText,
          attachment_url,
        });

        chatInput.value = '';
        clearPartnerAttachment();
        await openPartnerTicketChat(activePartnerChatTicketId, true, true);
        loadPartnerTickets();
      } catch (err) {
        Toast.error('Failed to Send', err.message);
      } finally {
        sendBtn.disabled = false;
        chatInput.focus();
      }
    });
  }

  // File Picker Trigger in Partner Chat
  const fileInput = document.getElementById('partner-chat-file-input');
  const chooseFileBtn = document.getElementById('btn-partner-choose-file');
  if (chooseFileBtn && fileInput) {
    chooseFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        partnerChatAttachment = { file, name: file.name };
        const preview = document.getElementById('partner-attachment-preview');
        const nameEl = document.getElementById('partner-attachment-name');
        if (preview && nameEl) {
          nameEl.textContent = file.name;
          preview.style.display = 'flex';
        }
      }
    });
  }

  document.getElementById('btn-partner-remove-attachment')?.addEventListener('click', () => {
    clearPartnerAttachment();
  });

  // Canned replies
  document.querySelectorAll('.canned-chip[data-target="partner-chat-input"]').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (!chatInput) return;
      chatInput.value = chip.dataset.text;
      chatInput.focus();
    });
  });
}

function clearPartnerAttachment() {
  partnerChatAttachment = null;
  const preview = document.getElementById('partner-attachment-preview');
  const fileInput = document.getElementById('partner-chat-file-input');
  if (preview) preview.style.display = 'none';
  if (fileInput) fileInput.value = '';
}

/**
 * Load Partner Support Tickets
 */
async function loadPartnerTickets() {
  const container = document.getElementById('partner-tickets-list');
  try {
    const res = await API.get('/api/support/tickets');
    partnerTicketsList = res.tickets || [];

    // Check unread count
    const totalUnread = partnerTicketsList.reduce((sum, t) => sum + (t.unread_count || 0), 0);
    const badge = document.getElementById('badge-partner-support');
    if (badge) {
      if (totalUnread > 0) {
        badge.textContent = totalUnread;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (!container) return;

    const currentSig = JSON.stringify(partnerTicketsList.map(t => ({ id: t.id, status: t.status, unread: t.unread_count, updated: t.updated_at })));
    if (container.dataset.renderedSig === currentSig) {
      return;
    }
    container.dataset.renderedSig = currentSig;

    if (partnerTicketsList.length === 0) {
      container.innerHTML = `
        <div class="empty-state card" style="grid-column: 1 / -1; padding: 2.5rem; text-align: center;">
          <div class="empty-icon" style="background:#F0FDF4; color:#16A34A; width:64px; height:64px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:1.75rem; margin-bottom:1rem;">
            <i class="fa-solid fa-headset"></i>
          </div>
          <h3 style="margin-bottom: 0.35rem; font-size: 1.125rem;">No Open Support Tickets</h3>
          <p class="text-muted" style="max-width: 440px; margin: 0 auto 1.25rem; font-size: 0.875rem;">
            Need help with your platform fee settlement, route zones, or customer disputes? Message the Near Dairy admin team directly.
          </p>
          <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('btn-partner-open-new-ticket').click()" style="background:#16A34A; border-color:#16A34A;">
            <i class="fa-solid fa-paper-plane"></i> Raise First Ticket
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = partnerTicketsList.map((t) => {
      let statusClass = 'status-open';
      if (t.status === 'in_progress') statusClass = 'status-in_progress';
      else if (t.status === 'resolved') statusClass = 'status-resolved';
      else if (t.status === 'closed') statusClass = 'status-closed';

      const timeAgo = formatTimeAgo(t.updated_at || t.created_at);
      const lastMsgText = t.latest_message ? t.latest_message.message : 'No messages yet';
      const hasUnread = (t.unread_count || 0) > 0;

      return `
        <div class="support-ticket-box">
          <div>
            <div class="support-ticket-box-header">
              <div class="flex items-center gap-2">
                <span class="ticket-number-badge">#${t.ticket_number}</span>
                <span class="ticket-status-pill ${statusClass}">${(t.status || 'open').replace('_', ' ')}</span>
              </div>
              <span class="ticket-time-ago">${timeAgo}</span>
            </div>

            <h4 style="font-size: 1rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--color-text);">
              ${escapeHtml(t.subject)}
              ${hasUnread ? '<span class="ticket-unread-dot" title="New message from admin"></span>' : ''}
            </h4>

            <div style="font-size: 0.8125rem; color: var(--color-text-muted); margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
              <span class="badge" style="font-size: 0.7rem; text-transform: capitalize;"><i class="fa-solid fa-tag"></i> ${t.category}</span>
              <span class="badge" style="font-size: 0.7rem; text-transform: capitalize;"><i class="fa-solid fa-flag"></i> ${t.priority}</span>
            </div>

            <p style="font-size: 0.84rem; color: var(--color-text); line-height: 1.45; margin-bottom: 1rem; background: #F8FAFC; padding: 0.6rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border);">
              <strong style="color: var(--color-text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Latest Message:</strong>
              ${escapeHtml(lastMsgText)}
            </p>
          </div>

          <div class="flex items-center justify-between gap-2 flex-wrap" style="border-top: 1px solid var(--color-border); padding-top: 0.75rem; margin-top: 0.5rem;">
            <span class="text-muted" style="font-size: 0.78rem;">
              <i class="fa-solid fa-comments" style="color: #16A34A;"></i> ${t.total_messages || 1} messages
            </span>
            <button type="button" class="btn btn-primary btn-sm" onclick="openPartnerTicketChat('${t.id}')" style="background: #16A34A; border-color: #16A34A; white-space: nowrap;">
              <i class="fa-solid fa-comments"></i> Open Live Chat
            </button>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    if (container) {
      container.innerHTML = `<div class="card" style="color:var(--color-danger); padding:1.5rem;">Error loading tickets: ${err.message}</div>`;
    }
  }
}

let partnerRenderedMsgIds = [];
let partnerRenderedTicketId = null;

function isPartnerScrolledNearBottom(container, threshold = 90) {
  if (!container) return true;
  return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
}

/**
 * Generate Message HTML Element string for Partner chat
 */
function buildPartnerMessageHtml(m, currentUserId, isNew = false) {
  if (m.sender_role === 'system') {
    return `
      <div class="chat-bubble-wrap system-event ${isNew ? 'new-message-anim' : ''}" data-msg-id="${m.id}">
        <div class="chat-system-pill">
          <i class="fa-solid fa-circle-info" style="color: #16A34A; margin-right: 4px;"></i>
          ${escapeHtml(m.message)}
        </div>
      </div>
    `;
  }

  const isOutgoing = m.sender_id === currentUserId || m.sender_role === 'partner';
  const wrapClass = isOutgoing ? 'outgoing' : 'incoming';
  const avatarUrl = m.sender_avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(m.sender_name || 'User')}`;
  const timeStr = new Date(m.created_at || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  let attachmentHtml = '';
  if (m.attachment_url) {
    const isImg = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(m.attachment_url);
    if (isImg) {
      attachmentHtml = `
        <div class="chat-attachment-card">
          <a href="${m.attachment_url}" target="_blank">
            <img src="${m.attachment_url}" class="chat-attachment-img" alt="Attachment" loading="lazy">
          </a>
        </div>
      `;
    } else {
      attachmentHtml = `
        <div class="chat-attachment-card">
          <a href="${m.attachment_url}" target="_blank" class="chat-attachment-doc">
            <i class="fa-solid fa-file-arrow-down"></i>
            <span>Download Attachment</span>
          </a>
        </div>
      `;
    }
  }

  return `
    <div class="chat-bubble-wrap ${wrapClass} ${isNew ? 'new-message-anim' : ''}" data-msg-id="${m.id}">
      <img src="${avatarUrl}" class="chat-bubble-avatar" alt="${escapeHtml(m.sender_name)}">
      <div class="chat-bubble-content">
        <div class="chat-bubble-sender-name">
          <span>${escapeHtml(m.sender_name)}</span>
          <span class="badge" style="font-size: 0.62rem; padding: 0.05rem 0.35rem;">${m.sender_role === 'admin' ? 'SuperAdmin' : 'You'}</span>
        </div>
        <div class="chat-bubble">
          ${escapeHtml(m.message)}
          ${attachmentHtml}
        </div>
        <div class="chat-bubble-time">${timeStr}</div>
      </div>
    </div>
  `;
}

/**
 * Open Partner Live Chat Modal with Admin
 */
async function openPartnerTicketChat(ticketId, isPoll = false, forceScroll = false) {
  const isTicketSwitch = activePartnerChatTicketId !== ticketId;
  activePartnerChatTicketId = ticketId;

  if (!isPoll) {
    Modal.open('modal-partner-chat');
  }

  try {
    const res = await API.get(`/api/support/tickets/${ticketId}`);
    const ticket = res.ticket;
    const messages = res.messages || [];

    const titleEl = document.getElementById('partner-chat-ticket-title');
    if (titleEl) titleEl.textContent = ticket.subject;
    const numEl = document.getElementById('partner-chat-ticket-num');
    if (numEl) numEl.textContent = `#${ticket.ticket_number}`;

    const statusBadge = document.getElementById('partner-chat-status-badge');
    if (statusBadge) {
      let sClass = 'status-open';
      if (ticket.status === 'in_progress') sClass = 'status-in_progress';
      else if (ticket.status === 'resolved') sClass = 'status-resolved';
      else if (ticket.status === 'closed') sClass = 'status-closed';

      statusBadge.className = `ticket-status-pill ${sClass}`;
      statusBadge.textContent = (ticket.status || 'open').replace('_', ' ');
    }

    const catEl = document.getElementById('partner-chat-category');
    if (catEl) catEl.textContent = (ticket.category || 'general').toUpperCase();
    const prioEl = document.getElementById('partner-chat-priority');
    if (prioEl) prioEl.textContent = (ticket.priority || 'medium').toUpperCase();
    const createdEl = document.getElementById('partner-chat-created');
    if (createdEl) {
      createdEl.textContent = new Date(ticket.created_at || Date.now()).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    const streamContainer = document.getElementById('partner-chat-messages-stream');
    if (streamContainer) {
      renderPartnerChatMessages(streamContainer, messages, isTicketSwitch || forceScroll);
    }

    // Start background chat polling if not already started
    startPartnerChatPolling();

  } catch (err) {
    if (!isPoll) {
      Toast.error('Chat Error', err.message);
    }
  }
}

/**
 * Smart Non-Destructive Messages Stream Renderer for Partner
 */
function renderPartnerChatMessages(container, messages, forceScroll = false) {
  const currentUser = Auth.getUser() || {};
  const currentUserId = currentUser.id;

  if (messages.length === 0) {
    if (partnerRenderedTicketId !== activePartnerChatTicketId || partnerRenderedMsgIds.length > 0) {
      partnerRenderedTicketId = activePartnerChatTicketId;
      partnerRenderedMsgIds = [];
      container.innerHTML = `<div class="text-center text-muted" style="padding:2rem;">No messages in this ticket yet.</div>`;
    }
    return;
  }

  const wasNearBottom = isPartnerScrolledNearBottom(container);
  const isTicketSwitch = partnerRenderedTicketId !== activePartnerChatTicketId;

  if (isTicketSwitch) {
    partnerRenderedTicketId = activePartnerChatTicketId;
    partnerRenderedMsgIds = messages.map((m) => m.id);
    container.innerHTML = messages.map((m) => buildPartnerMessageHtml(m, currentUserId, false)).join('');
    container.scrollTop = container.scrollHeight;
    return;
  }

  // Check for new messages
  const existingSet = new Set(partnerRenderedMsgIds);
  const newMessages = messages.filter((m) => !existingSet.has(m.id));

  if (newMessages.length === 0 && messages.length === partnerRenderedMsgIds.length) {
    // Exact same messages - do nothing
    return;
  }

  if (newMessages.length > 0 && partnerRenderedMsgIds.length > 0) {
    // Append ONLY the new messages
    const emptyPlaceholder = container.querySelector('.text-center.text-muted');
    if (emptyPlaceholder) emptyPlaceholder.remove();

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newMessages.map((m) => buildPartnerMessageHtml(m, currentUserId, true)).join('');

    while (tempDiv.firstChild) {
      container.appendChild(tempDiv.firstChild);
    }

    partnerRenderedMsgIds = messages.map((m) => m.id);

    if (wasNearBottom || forceScroll) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  } else {
    // Re-sync full list
    partnerRenderedMsgIds = messages.map((m) => m.id);
    container.innerHTML = messages.map((m) => buildPartnerMessageHtml(m, currentUserId, false)).join('');
    if (wasNearBottom || forceScroll) {
      container.scrollTop = container.scrollHeight;
    }
  }
}

function startPartnerChatPolling() {
  if (partnerChatPollTimer) clearInterval(partnerChatPollTimer);
  partnerChatPollTimer = setInterval(() => {
    const modal = document.getElementById('modal-partner-chat');
    if (modal && modal.classList.contains('active') && activePartnerChatTicketId) {
      openPartnerTicketChat(activePartnerChatTicketId, true);
    }
  }, 3500);
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return 'Just now';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.openPartnerTicketChat = openPartnerTicketChat;



