/**
 * NEAR DAIRY - CUSTOMER PORTAL LOGIC
 */

let mySubscriptions = [];
let myOrders = [];
let myComplaints = [];

document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireAuth(['customer', 'admin'])) return;

  setupProfileHeader();
  setupTabNavigation();
  loadSubscriptions();
  loadOrders();
  loadComplaints();
  setupComplaintModal();
  setupProfileForm();
  setupSettingsTab();
});

let customerMapInstance = null;
let customerMapMarker = null;

/**
 * Setup Sidebar Profile Info & Load User Profile Details
 */
async function setupProfileHeader() {
  let user = Auth.getUser();
  try {
    const res = await API.get('/api/auth/me');
    if (res && res.user) {
      user = res.user;
      Auth.saveSession(Auth.getToken(), user, Auth.getDairy());
    }
  } catch (e) {
    console.warn('Using cached user profile:', e.message);
  }

  if (user) {
    document.getElementById('sidebar-user-name').textContent = user.full_name;
    const avatarUrl = user.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.full_name)}`;
    document.getElementById('sidebar-user-avatar').src = avatarUrl;
    
    const profileAvatarImg = document.getElementById('customer-profile-avatar-img');
    if (profileAvatarImg) profileAvatarImg.src = avatarUrl;

    const nameInput = document.getElementById('profile-full-name');
    if (nameInput) nameInput.value = user.full_name || '';

    const settingsNameInput = document.getElementById('settings-customer-fullname');
    if (settingsNameInput) settingsNameInput.value = user.full_name || '';

    const emailInput = document.getElementById('profile-email');
    if (emailInput) emailInput.value = user.email || '';

    const phoneInput = document.getElementById('profile-phone');
    if (phoneInput) phoneInput.value = user.phone || '';

    const settingsPhoneInput = document.getElementById('settings-customer-phone');
    if (settingsPhoneInput) settingsPhoneInput.value = user.phone || '';

    const altPhoneInput = document.getElementById('profile-alt-phone');
    if (altPhoneInput) altPhoneInput.value = user.alternate_phone || '';

    const flatInput = document.getElementById('profile-flat-building');
    if (flatInput) flatInput.value = user.flat_building || '';

    const streetInput = document.getElementById('profile-street-area');
    if (streetInput) streetInput.value = user.street_area || '';

    const landmarkInput = document.getElementById('profile-landmark');
    if (landmarkInput) landmarkInput.value = user.landmark || '';

    const cityInput = document.getElementById('profile-city');
    if (cityInput) cityInput.value = user.city || '';

    const stateInput = document.getElementById('profile-state');
    if (stateInput) stateInput.value = user.state || '';

    const pincodeInput = document.getElementById('profile-pincode');
    if (pincodeInput) pincodeInput.value = user.pincode || '';

    const instructionsInput = document.getElementById('profile-delivery-instructions');
    if (instructionsInput) instructionsInput.value = user.delivery_instructions || '';

    const deleteBtn = document.getElementById('btn-customer-delete-avatar');
    if (deleteBtn) {
      deleteBtn.style.display = user.avatar_url ? 'inline-flex' : 'none';
    }

    updateFormattedAddress();

    // Initialize delivery map with user coordinates or default
    const lat = user.latitude ? parseFloat(user.latitude) : 18.5204;
    const lng = user.longitude ? parseFloat(user.longitude) : 73.8567;
    initCustomerDeliveryMap(lat, lng);
  }
}

/**
 * Update Formatted Address String from constituent fields
 */
function updateFormattedAddress() {
  const flat = document.getElementById('profile-flat-building')?.value.trim() || '';
  const street = document.getElementById('profile-street-area')?.value.trim() || '';
  const landmark = document.getElementById('profile-landmark')?.value.trim() || '';
  const city = document.getElementById('profile-city')?.value.trim() || '';
  const state = document.getElementById('profile-state')?.value.trim() || '';
  const pin = document.getElementById('profile-pincode')?.value.trim() || '';

  const parts = [];
  if (flat) parts.push(flat);
  if (street) parts.push(street);
  if (landmark) parts.push(`Near ${landmark}`);
  if (city) parts.push(city);
  if (state) parts.push(state);
  if (pin) parts.push(pin);

  const formatted = parts.join(', ');
  const addrInput = document.getElementById('profile-address');
  if (addrInput) addrInput.value = formatted || 'Please fill in your flat and street details above';
}

/**
 * Initialize Interactive Delivery Location Map
 */
function initCustomerDeliveryMap(lat, lng) {
  const mapElem = document.getElementById('customer-delivery-map');
  if (!mapElem || typeof L === 'undefined') return;

  if (customerMapInstance) {
    customerMapInstance.setView([lat, lng], 15);
    if (customerMapMarker) customerMapMarker.setLatLng([lat, lng]);
    updateCoordsUI(lat, lng);
    return;
  }

  customerMapInstance = L.map('customer-delivery-map', {
    center: [lat, lng],
    zoom: 15,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(customerMapInstance);

  const markerIcon = L.divIcon({
    className: 'custom-user-marker',
    html: `<div style="background: #2563EB; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(37,99,235,0.4); border: 2.5px solid white; font-size: 16px;"><i class="fa-solid fa-house-chimney"></i></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

  customerMapMarker = L.marker([lat, lng], {
    icon: markerIcon,
    draggable: true,
    title: 'Your Delivery Location',
  }).addTo(customerMapInstance);

  customerMapMarker.bindPopup('<b>📍 Your Delivery Location</b><br>Drag pin or click map to adjust.').openPopup();

  customerMapMarker.on('dragend', async (e) => {
    const pos = e.target.getLatLng();
    updateCoordsUI(pos.lat, pos.lng);
    await tryReverseGeocode(pos.lat, pos.lng);
  });

  customerMapInstance.on('click', async (e) => {
    customerMapMarker.setLatLng(e.latlng);
    updateCoordsUI(e.latlng.lat, e.latlng.lng);
    await tryReverseGeocode(e.latlng.lat, e.latlng.lng);
  });

  updateCoordsUI(lat, lng);
}

function updateCoordsUI(lat, lng) {
  const latVal = parseFloat(lat).toFixed(5);
  const lngVal = parseFloat(lng).toFixed(5);

  const dispLat = document.getElementById('disp-lat');
  const dispLng = document.getElementById('disp-lng');
  const inpLat = document.getElementById('profile-lat');
  const inpLng = document.getElementById('profile-lng');

  if (dispLat) dispLat.textContent = latVal;
  if (dispLng) dispLng.textContent = lngVal;
  if (inpLat) inpLat.value = latVal;
  if (inpLng) inpLng.value = lngVal;
}

async function tryReverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.address) {
        const a = data.address;
        const streetInput = document.getElementById('profile-street-area');
        const cityInput = document.getElementById('profile-city');
        const stateInput = document.getElementById('profile-state');
        const pincodeInput = document.getElementById('profile-pincode');

        if (streetInput && !streetInput.value) {
          streetInput.value = a.road || a.suburb || a.neighbourhood || '';
        }
        if (cityInput && !cityInput.value) {
          cityInput.value = a.city || a.town || a.village || a.county || '';
        }
        if (stateInput && !stateInput.value) {
          stateInput.value = a.state || '';
        }
        if (pincodeInput && !pincodeInput.value) {
          pincodeInput.value = a.postcode || '';
        }
        updateFormattedAddress();
      }
    }
  } catch (e) {
    console.log('Reverse geocoding skipped');
  }
}

/**
 * Tab Navigation Switcher
 */
function setupTabNavigation() {
  const allTabBtns = document.querySelectorAll('[data-tab]');
  allTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      if (!targetTab) return;

      allTabBtns.forEach((b) => {
        if (b.dataset.tab === targetTab) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });

      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      const activePanel = document.getElementById(`tab-${targetTab}`);
      if (activePanel) activePanel.classList.add('active');

      if (typeof Sidebar !== 'undefined' && Sidebar.close) {
        Sidebar.close();
      }

      if (targetTab === 'complaints') {
        loadComplaints();
      }

      if (targetTab === 'profile' && customerMapInstance) {
        setTimeout(() => {
          customerMapInstance.invalidateSize();
        }, 150);
      }

      // Update title
      const titles = {
        subscriptions: 'My Milk Subscriptions',
        orders: 'Daily Orders & Delivery Tracking',
        complaints: 'Customer Support & Live Helpdesk',
        profile: 'My Profile & Delivery Location',
        settings: 'Account & Security Settings',
      };
      const titleEl = document.getElementById('topbar-title');
      if (titleEl) titleEl.textContent = titles[targetTab] || 'Customer Portal';
    });
  });

  document.getElementById('btn-refresh-orders')?.addEventListener('click', loadOrders);
  setInterval(loadComplaints, 30000);
}

/**
 * Customer Profile, Photo & Delivery Location Management
 */
function setupProfileForm() {
  const avatarFile = document.getElementById('customer-avatar-file');
  const avatarTrigger = document.getElementById('customer-avatar-trigger');
  const chooseAvatarBtn = document.getElementById('btn-customer-choose-avatar');
  const deleteAvatarBtn = document.getElementById('btn-customer-delete-avatar');
  const avatarImg = document.getElementById('customer-profile-avatar-img');
  const avatarUrlInput = document.getElementById('customer-avatar-url');

  const triggerUpload = () => avatarFile?.click();
  avatarTrigger?.addEventListener('click', triggerUpload);
  chooseAvatarBtn?.addEventListener('click', triggerUpload);

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
      Toast.info('Uploading Photo...', 'Saving your profile picture to Supabase');
      const res = oldAvatarUrl
        ? await API.updateUpload(file, 'avatar', oldAvatarUrl)
        : await API.upload(file, 'avatar');

      if (avatarUrlInput) avatarUrlInput.value = res.url;
      
      // Persist to user profile
      await API.put('/api/auth/profile', { avatar_url: res.url });
      if (user) {
        user.avatar_url = res.url;
        Auth.saveSession(Auth.getToken(), user, Auth.getDairy());
      }
      setupProfileHeader();
      Toast.success('Photo Updated!', 'Profile photo saved to Supabase Storage.');
    } catch (err) {
      Toast.error('Photo Upload Failed', err.message);
    }
  });

  deleteAvatarBtn?.addEventListener('click', async () => {
    try {
      Toast.info('Deleting Photo...', 'Removing profile avatar');
      await API.deleteAvatar();
      const user = Auth.getUser();
      if (user) {
        user.avatar_url = null;
        Auth.saveSession(Auth.getToken(), user, Auth.getDairy());
      }
      if (avatarUrlInput) avatarUrlInput.value = '';
      setupProfileHeader();
      Toast.success('Photo Removed', 'Default avatar restored.');
    } catch (err) {
      Toast.error('Delete Failed', err.message);
    }
  });

  // Live Address Auto-formatting listeners
  ['profile-flat-building', 'profile-street-area', 'profile-landmark', 'profile-city', 'profile-state', 'profile-pincode'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateFormattedAddress);
  });

  // Instruction Chips Click
  const chips = document.querySelectorAll('.instruction-chip');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const text = chip.dataset.text;
      const textarea = document.getElementById('profile-delivery-instructions');
      if (textarea) {
        if (textarea.value.includes(text)) {
          textarea.value = textarea.value.replace(text, '').replace(/,\s*,/g, ',').trim();
          chip.classList.remove('selected');
        } else {
          textarea.value = textarea.value ? `${textarea.value.trim()}, ${text}` : text;
          chip.classList.add('selected');
        }
      }
    });
  });

  // GPS Location Button
  const btnGps = document.getElementById('btn-detect-customer-gps');
  if (btnGps) {
    btnGps.addEventListener('click', async () => {
      btnGps.innerHTML = '<span class="spinner" style="width:14px; height:14px;"></span> Pinning GPS...';
      try {
        const pos = await MapHelper.getCurrentPosition();
        if (customerMapInstance && customerMapMarker) {
          customerMapInstance.setView([pos.latitude, pos.longitude], 16);
          customerMapMarker.setLatLng([pos.latitude, pos.longitude]);
          updateCoordsUI(pos.latitude, pos.longitude);
          await tryReverseGeocode(pos.latitude, pos.longitude);
        }
        Toast.success('GPS Location Detected', 'Your precise delivery pin has been set.');
      } catch (err) {
        Toast.error('GPS Detection Error', err.message);
      } finally {
        btnGps.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i><span>Detect My Live GPS</span>';
      }
    });
  }

  // Profile Form Submission
  document.getElementById('customer-profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = document.getElementById('profile-full-name').value.trim();
    const phone = document.getElementById('profile-phone').value.trim();
    const altPhone = document.getElementById('profile-alt-phone').value.trim();
    const avatarUrl = document.getElementById('customer-avatar-url').value;

    const flatBuilding = document.getElementById('profile-flat-building').value.trim();
    const streetArea = document.getElementById('profile-street-area').value.trim();
    const landmark = document.getElementById('profile-landmark').value.trim();
    const city = document.getElementById('profile-city').value.trim();
    const state = document.getElementById('profile-state').value.trim();
    const pincode = document.getElementById('profile-pincode').value.trim();
    const address = document.getElementById('profile-address').value.trim();
    const lat = document.getElementById('profile-lat').value;
    const lng = document.getElementById('profile-lng').value;
    const deliveryInstructions = document.getElementById('profile-delivery-instructions').value.trim();

    if (!fullName || !phone) {
      Toast.warning('Missing Fields', 'Please provide your full name and primary phone number.');
      return;
    }

    if (!flatBuilding || !streetArea || !city || !pincode) {
      Toast.warning('Address Incomplete', 'Please fill in flat/house number, street/area, city, and pincode for accurate milk delivery.');
      return;
    }

    const saveBtn = document.getElementById('btn-save-customer-profile');
    if (saveBtn) {
      saveBtn.innerHTML = '<span class="spinner" style="width:14px; height:14px;"></span> Saving Profile & Location...';
      saveBtn.disabled = true;
    }

    try {
      const payload = {
        full_name: fullName,
        phone,
        alternate_phone: altPhone,
        flat_building: flatBuilding,
        street_area: streetArea,
        landmark,
        city,
        state,
        pincode,
        address,
        latitude: lat,
        longitude: lng,
        delivery_instructions: deliveryInstructions,
      };
      if (avatarUrl) payload.avatar_url = avatarUrl;

      const res = await API.put('/api/auth/profile', payload);
      
      const user = Auth.getUser() || {};
      Object.assign(user, payload);
      if (res.user) Object.assign(user, res.user);
      Auth.saveSession(Auth.getToken(), user, Auth.getDairy());

      setupProfileHeader();
      Toast.success('Profile & Delivery Address Saved!', 'Your accurate GPS location and delivery preferences are active for morning milk dispatches.');
    } catch (err) {
      Toast.error('Save Error', err.message);
    } finally {
      if (saveBtn) {
        saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Profile & Delivery Address';
        saveBtn.disabled = false;
      }
    }
  });
}

/**
 * Load Customer Subscriptions
 */
async function loadSubscriptions() {
  const container = document.getElementById('subscriptions-container');
  try {
    const res = await API.get('/api/subscriptions/my');
    mySubscriptions = res.subscriptions || [];

    document.getElementById('badge-subs-count').textContent = mySubscriptions.length;

    // Calculate stats
    const activeSubs = mySubscriptions.filter((s) => s.status === 'active');
    const totalDailyLitres = activeSubs.reduce((sum, s) => sum + (parseFloat(s.quantity) || 1.0), 0);

    document.getElementById('stat-active-subs').textContent = activeSubs.length;
    document.getElementById('stat-daily-litres').textContent = `${totalDailyLitres.toFixed(1)} L`;

    if (mySubscriptions.length === 0) {
      container.innerHTML = `
        <div class="empty-state card" style="grid-column: 1 / -1;">
          <div class="empty-icon"><i class="fa-solid fa-bottle-droplet"></i></div>
          <h3 style="margin-bottom: 0.5rem;">No Active Subscriptions Yet</h3>
          <p class="text-muted" style="max-width: 420px; margin-bottom: 1.5rem;">
            You haven't subscribed to any local dairy yet. Explore certified dairy farms nearby to get fresh morning milk delivered.
          </p>
          <a href="index.html" class="btn btn-primary">
            <i class="fa-solid fa-map-location-dot"></i> Explore Nearby Dairies
          </a>
        </div>
      `;
      return;
    }

    container.innerHTML = mySubscriptions.map((sub) => {
      const isActive = sub.status === 'active';
      const isPaused = sub.status === 'paused';
      
      let statusBadge = '<span class="badge badge-gray">Cancelled</span>';
      if (isActive) {
        statusBadge = '<span class="badge badge-success">● Active Delivery</span>';
      } else if (isPaused) {
        const startStr = sub.pause_start_date ? new Date(sub.pause_start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Now';
        const endStr = sub.pause_end_date ? new Date(sub.pause_end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Indefinite';
        statusBadge = `<span class="badge badge-warning" style="background:#FEF3C7; color:#92400E; border: 1px solid #FDE68A;"><i class="fa-solid fa-pause"></i> Paused (${startStr} - ${endStr})</span>`;
      }

      const dailyRate = (sub.quantity * (sub.product?.price_per_unit || 68)).toFixed(2);
      const creditAmt = (parseFloat(sub.adjusted_credit_amount) || 0).toFixed(2);

      return `
        <div class="sub-card ${isPaused ? 'sub-card-paused' : ''}" id="sub-card-${sub.id}">
          <div>
            <div class="sub-card-header">
              <div class="sub-product-info">
                <img src="${sub.product?.image_url || 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400'}"
                     alt="${sub.product?.name}" class="sub-product-img" onerror="this.src='https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400'">
                <div>
                  <h4 style="font-size: 1.125rem; font-weight: 700;">${sub.product?.name || 'Fresh Milk'}</h4>
                  <div style="font-size: 0.8125rem; color: var(--theme-primary); font-weight: 600;">
                    <i class="fa-solid fa-cow"></i> ${sub.dairy?.dairy_name || 'Partner Dairy'}
                  </div>
                </div>
              </div>
              ${statusBadge}
            </div>

            <div class="sub-meta-grid" style="margin-top: 1.25rem;">
              <div class="sub-meta-item">
                <span class="sub-meta-label">Quantity per Delivery</span>
                <span class="sub-meta-value">${sub.quantity} Litre (${sub.slot.toUpperCase()})</span>
              </div>
              <div class="sub-meta-item">
                <span class="sub-meta-label">Frequency</span>
                <span class="sub-meta-value">${sub.frequency.toUpperCase()}</span>
              </div>
              <div class="sub-meta-item" style="grid-column: span 2;">
                <span class="sub-meta-label">Delivery Address</span>
                <span style="font-size: 0.8125rem; color: var(--color-text);">${sub.delivery_address}</span>
              </div>
            </div>

            ${isPaused ? `
              <div class="sub-paused-box">
                <div class="sub-paused-title">
                  <i class="fa-solid fa-circle-pause" style="color: #D97706;"></i>
                  <span>Delivery Paused by You</span>
                </div>
                <div class="sub-paused-detail">
                  <div><strong>Dates:</strong> ${sub.pause_start_date ? new Date(sub.pause_start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Immediate'} to ${sub.pause_end_date ? new Date(sub.pause_end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Until Manually Resumed'}${sub.paused_days_count ? ` (${sub.paused_days_count} days)` : ''}</div>
                  <div><strong>Reason:</strong> ${sub.pause_reason || 'Personal / Vacation'}</div>
                  <div style="margin-top: 0.25rem; color: #166534; font-weight: 700;">
                    <i class="fa-solid fa-wallet"></i> ₹${creditAmt} adjusted as billing credit
                  </div>
                </div>
              </div>
            ` : ''}
          </div>

          <div class="flex items-center justify-between" style="padding-top: 1rem; border-top: 1px solid var(--color-border); gap: 0.5rem; flex-wrap: wrap;">
            <div style="font-size: 0.875rem;">
              Rate: <strong>₹${dailyRate}</strong> / day
            </div>

            <div class="flex items-center gap-2">
              ${isActive ? `
                <button class="btn btn-secondary btn-sm" onclick="openPauseDeliveryModal('${sub.id}')">
                  <i class="fa-solid fa-pause"></i> Pause Delivery
                </button>
              ` : (isPaused ? `
                <button class="btn btn-primary btn-sm" onclick="resumeSubscription('${sub.id}')" style="background:#16A34A; border-color:#16A34A;">
                  <i class="fa-solid fa-play"></i> Resume Delivery
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openPauseDeliveryModal('${sub.id}')" title="Modify Pause Dates">
                  <i class="fa-solid fa-calendar-days"></i> Change Dates
                </button>
              ` : '')}

              <button class="btn btn-secondary btn-sm" style="color: var(--color-danger);" onclick="cancelSubscription('${sub.id}')" title="Cancel Subscription">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    container.innerHTML = `<div class="card" style="padding: 2rem; color: var(--color-danger); text-align: center;">Error loading subscriptions: ${error.message}</div>`;
  }
}

/**
 * Open Pause Delivery Modal with Live Date & Amount Calculations
 */
window.openPauseDeliveryModal = function (subId) {
  const sub = mySubscriptions.find((s) => s.id === subId);
  if (!sub) return;

  const now = new Date();
  // Cutoff rule: If past 9 PM (21:00), default start date is day after tomorrow, otherwise tomorrow
  const startOffset = now.getHours() >= 21 ? 2 : 1;
  const defaultStartDate = new Date(now);
  defaultStartDate.setDate(now.getDate() + startOffset);
  const defaultStartDateStr = defaultStartDate.toISOString().split('T')[0];

  const defaultEndDate = new Date(defaultStartDate);
  defaultEndDate.setDate(defaultStartDate.getDate() + 6); // 7 days total
  const defaultEndDateStr = defaultEndDate.toISOString().split('T')[0];

  const unitPrice = parseFloat(sub.product?.price_per_unit) || 68.0;
  const qty = parseFloat(sub.quantity) || 1.0;

  // Set hidden inputs
  document.getElementById('pause-sub-id').value = sub.id;
  document.getElementById('pause-sub-unit-price').value = unitPrice;
  document.getElementById('pause-sub-qty').value = qty;

  // Set header info
  document.getElementById('pause-modal-sub-info').textContent = `${qty}L ${sub.product?.name || 'Milk'} • ${sub.dairy?.dairy_name || 'Dairy Partner'} (${sub.slot.toUpperCase()})`;

  // Set date pickers
  const startPicker = document.getElementById('pause-start-date');
  const endPicker = document.getElementById('pause-end-date');
  const todayStr = now.toISOString().split('T')[0];

  startPicker.min = todayStr;
  startPicker.value = sub.pause_start_date || defaultStartDateStr;

  endPicker.min = startPicker.value;
  endPicker.value = sub.pause_end_date || defaultEndDateStr;

  if (sub.pause_reason) {
    document.getElementById('pause-reason-select').value = sub.pause_reason;
  }
  if (sub.pause_notes) {
    document.getElementById('pause-notes-input').value = sub.pause_notes;
  }

  // Update preset buttons state
  document.querySelectorAll('.pause-preset-btn').forEach((b) => b.classList.remove('active'));
  const defaultPreset = document.querySelector('.pause-preset-btn[data-days="7"]');
  if (defaultPreset) defaultPreset.classList.add('active');

  const wrapEnd = document.getElementById('wrap-pause-end-date');
  if (wrapEnd) wrapEnd.style.display = 'block';

  updatePauseCalculations();
  Modal.open('pause-delivery-modal');
};

/**
 * Preset Buttons (3 Days, 7 Days, 14 Days, Indefinite)
 */
window.applyPausePreset = function (days, btn) {
  document.querySelectorAll('.pause-preset-btn').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const startPicker = document.getElementById('pause-start-date');
  const endPicker = document.getElementById('pause-end-date');
  const wrapEnd = document.getElementById('wrap-pause-end-date');

  const startDate = new Date(startPicker.value || new Date());

  if (days === 'indefinite') {
    endPicker.value = '';
    if (wrapEnd) wrapEnd.style.display = 'none';
  } else {
    if (wrapEnd) wrapEnd.style.display = 'block';
    const numDays = parseInt(days, 10) || 7;
    const targetEnd = new Date(startDate);
    targetEnd.setDate(startDate.getDate() + numDays - 1);
    endPicker.value = targetEnd.toISOString().split('T')[0];
  }

  updatePauseCalculations();
};

/**
 * Recalculate Live Paused Days, Litres, and ₹ Credit in Modal
 */
function updatePauseCalculations() {
  const startVal = document.getElementById('pause-start-date').value;
  const endVal = document.getElementById('pause-end-date').value;
  const unitPrice = parseFloat(document.getElementById('pause-sub-unit-price').value) || 68.0;
  const qty = parseFloat(document.getElementById('pause-sub-qty').value) || 1.0;

  let days = 0;
  if (startVal && endVal) {
    const s = new Date(startVal);
    const e = new Date(endVal);
    const diff = e.getTime() - s.getTime();
    days = Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1);
  } else if (startVal && !endVal) {
    days = 30; // Estimated 1 month for indefinite
  }

  const heldLitres = (days * qty).toFixed(1);
  const creditAmount = (days * qty * unitPrice).toFixed(2);

  const daysLabel = endVal ? `${days} Days` : 'Indefinite';
  document.getElementById('calc-paused-days').textContent = daysLabel;
  document.getElementById('calc-paused-litres').textContent = `${heldLitres} L`;
  document.getElementById('calc-credit-amount').textContent = `₹${creditAmount}`;
  document.getElementById('calc-credit-note-amount').textContent = `₹${creditAmount}`;
}

// Setup live recalculation on date change
document.addEventListener('DOMContentLoaded', () => {
  const startPicker = document.getElementById('pause-start-date');
  const endPicker = document.getElementById('pause-end-date');

  if (startPicker) {
    startPicker.addEventListener('change', () => {
      if (endPicker) endPicker.min = startPicker.value;
      updatePauseCalculations();
    });
  }

  if (endPicker) {
    endPicker.addEventListener('change', () => {
      updatePauseCalculations();
    });
  }

  // Setup Confirm Pause Delivery Button
  const confirmPauseBtn = document.getElementById('btn-confirm-pause-delivery');
  if (confirmPauseBtn) {
    confirmPauseBtn.addEventListener('click', async () => {
      const subId = document.getElementById('pause-sub-id').value;
      const pause_start_date = document.getElementById('pause-start-date').value;
      const pause_end_date = document.getElementById('pause-end-date').value || null;
      const pause_reason = document.getElementById('pause-reason-select').value;
      const pause_notes = document.getElementById('pause-notes-input').value.trim();

      if (!subId || !pause_start_date) {
        Toast.warning('Missing Date', 'Please select a pause start date.');
        return;
      }

      confirmPauseBtn.disabled = true;
      confirmPauseBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

      try {
        const payload = {
          status: 'paused',
          pause_start_date,
          pause_end_date,
          pause_reason,
          pause_notes,
        };

        const res = await API.patch(`/api/subscriptions/${subId}/status`, payload);
        Toast.success('Delivery Paused', res.message || 'Your delivery has been paused and partner notified.');
        Modal.close('pause-delivery-modal');
        loadSubscriptions();
      } catch (err) {
        Toast.error('Pause Request Failed', err.message);
      } finally {
        confirmPauseBtn.disabled = false;
        confirmPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Confirm Pause Delivery';
      }
    });
  }
});

/**
 * Resume Subscription Early
 */
window.resumeSubscription = function (subId) {
  Modal.confirm({
    title: 'Resume Milk Deliveries?',
    message: 'Deliveries will resume starting with your next scheduled dispatch slot. Your partner will receive an instant notification.',
    confirmText: 'Yes, Resume Deliveries',
    onConfirm: async () => {
      try {
        const res = await API.patch(`/api/subscriptions/${subId}/status`, { status: 'active' });
        Toast.success('Deliveries Resumed!', res.message || 'Your recurring milk delivery is now active.');
        loadSubscriptions();
      } catch (err) {
        Toast.error('Resume Failed', err.message);
      }
    }
  });
};

/**
 * Cancel Subscription
 */
window.cancelSubscription = function (subId) {
  Modal.confirm({
    title: 'Cancel Subscription?',
    message: 'Are you sure you want to stop this recurring milk delivery?',
    confirmText: 'Yes, Cancel',
    onConfirm: async () => {
      try {
        await API.patch(`/api/subscriptions/${subId}/status`, { status: 'cancelled' });
        Toast.info('Subscription Cancelled', 'Recurring deliveries stopped.');
        loadSubscriptions();
      } catch (err) {
        Toast.error('Cancel Error', err.message);
      }
    }
  });
};

/**
 * Load Customer Orders
 */
async function loadOrders() {
  const tbody = document.getElementById('orders-table-body');
  try {
    const res = await API.get('/api/orders/my');
    myOrders = res.orders || [];

    document.getElementById('badge-orders-count').textContent = myOrders.length;

    if (myOrders.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2.5rem;" class="text-muted">
            No delivery orders recorded yet.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = myOrders.map((o) => {
      let statusBadge = '<span class="badge badge-warning">⏳ Scheduled</span>';
      if (o.delivery_status === 'out_for_delivery') {
        statusBadge = '<span class="badge badge-primary">🚚 Out for Delivery</span>';
      } else if (o.delivery_status === 'delivered') {
        statusBadge = '<span class="badge badge-success">✓ Delivered</span>';
      } else if (o.delivery_status === 'cancelled') {
        statusBadge = '<span class="badge badge-danger">✕ Cancelled</span>';
      }

      const itemsSummary = (o.items || []).map((i) => `${i.name} (${i.quantity}x)`).join(', ');

      return `
        <tr>
          <td>
            <div style="font-weight: 700;">${o.dairy?.dairy_name || 'Dairy Partner'}</div>
            <div class="text-muted" style="font-size: 0.75rem;">Ph: ${o.dairy?.phone || 'Direct'}</div>
          </td>
          <td>
            <div style="font-weight: 600;">${itemsSummary || 'Fresh Milk'}</div>
            <div class="text-muted" style="font-size: 0.75rem;">${o.order_type === 'subscription_daily' ? 'Daily Subscription Roster' : 'One-Time Order'}</div>
          </td>
          <td>
            <div style="font-weight: 600;">${o.delivery_date}</div>
            <div class="text-muted" style="font-size: 0.75rem; text-transform: capitalize;">Slot: ${o.delivery_slot || 'Morning'}</div>
          </td>
          <td>${statusBadge}</td>
          <td>
            <div style="font-weight: 700;">₹${parseFloat(o.total_amount).toFixed(2)}</div>
            <div style="font-size: 0.75rem; color: var(--color-success);">Paid via Razorpay</div>
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="reportIssueForOrder('${o.dairy_id}', '${o.id}')">
              <i class="fa-solid fa-flag"></i> Issue
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--color-danger); text-align: center;">Error loading orders: ${error.message}</td></tr>`;
  }
}

/**
 * =========================================================================
 * CUSTOMER SUPPORT & LIVE HELPDESK ENGINE
 * =========================================================================
 */

let customerTicketsList = [];
let activeCustomerChatTicketId = null;
let customerChatPollTimer = null;
let customerChatAttachment = null;

/**
 * Load Customer Support Tickets & Complaints
 */
async function loadComplaints() {
  const container = document.getElementById('complaints-list');
  try {
    const res = await API.get('/api/support/tickets');
    customerTicketsList = res.tickets || [];

    // Calculate unread
    const totalUnread = customerTicketsList.reduce((sum, t) => sum + (t.unread_count || 0), 0);
    const badge = document.getElementById('badge-customer-support');
    if (badge) {
      if (totalUnread > 0) {
        badge.textContent = totalUnread;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (!container) return;

    const currentSig = JSON.stringify(customerTicketsList.map(t => ({ id: t.id, status: t.status, unread: t.unread_count, updated: t.updated_at })));
    if (container.dataset.renderedSig === currentSig) {
      return;
    }
    container.dataset.renderedSig = currentSig;

    if (customerTicketsList.length === 0) {
      container.innerHTML = `
        <div class="empty-state card" style="grid-column: 1 / -1; padding: 2.5rem; text-align: center;">
          <div class="empty-icon" style="background:#EEF2FF; color:var(--theme-primary); width:64px; height:64px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:1.75rem; margin-bottom:1rem;">
            <i class="fa-solid fa-headset"></i>
          </div>
          <h3 style="margin-bottom: 0.35rem; font-size: 1.125rem;">No Open Delivery Issues</h3>
          <p class="text-muted" style="max-width: 440px; margin: 0 auto 1.25rem; font-size: 0.875rem;">
            All your daily morning milk deliveries are operating smoothly. If you experience late arrivals, broken bottles, or billing questions, contact our support team.
          </p>
          <button type="button" class="btn btn-danger btn-sm" onclick="document.getElementById('btn-open-complaint-modal').click()">
            <i class="fa-solid fa-triangle-exclamation"></i> Raise Support Ticket
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = customerTicketsList.map((t) => {
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
              ${hasUnread ? '<span class="ticket-unread-dot" title="New message from support"></span>' : ''}
            </h4>

            <div style="font-size: 0.8125rem; color: var(--color-text-muted); margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              ${t.dairy?.dairy_name ? `<span class="badge" style="font-size: 0.7rem;"><i class="fa-solid fa-cow"></i> ${t.dairy.dairy_name}</span>` : ''}
              <span class="badge" style="font-size: 0.7rem; text-transform: capitalize;"><i class="fa-solid fa-tag"></i> ${t.category}</span>
            </div>

            <p style="font-size: 0.84rem; color: var(--color-text); line-height: 1.45; margin-bottom: 0.75rem; background: #F8FAFC; padding: 0.6rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border);">
              <strong style="color: var(--color-text-muted); font-size: 0.75rem; display: block; margin-bottom: 0.2rem;">Latest Message:</strong>
              ${escapeHtml(lastMsgText)}
            </p>

            ${t.resolution_notes ? `
              <div style="background: #F0FDF4; border: 1px solid #BBF7D0; padding: 0.6rem 0.85rem; border-radius: var(--radius-sm); font-size: 0.8125rem; color: #166534; margin-bottom: 0.75rem;">
                <strong><i class="fa-solid fa-circle-check"></i> Resolution:</strong> ${escapeHtml(t.resolution_notes)}
              </div>
            ` : ''}
          </div>

          <div class="flex items-center justify-between gap-2 flex-wrap" style="border-top: 1px solid var(--color-border); padding-top: 0.75rem; margin-top: 0.5rem;">
            <span class="text-muted" style="font-size: 0.78rem;">
              <i class="fa-solid fa-comments" style="color: var(--theme-primary);"></i> ${t.total_messages || 1} messages
            </span>
            <button type="button" class="btn btn-primary btn-sm" onclick="openCustomerTicketChat('${t.id}')" style="white-space: nowrap;">
              <i class="fa-solid fa-comments"></i> Open Live Chat
            </button>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    if (container) {
      container.innerHTML = `<div class="card" style="color: var(--color-danger); padding: 1.5rem;">Error: ${error.message}</div>`;
    }
  }
}

/**
 * Setup Complaint Modal & Live Chat Handlers
 */
function setupComplaintModal() {
  document.getElementById('btn-open-complaint-modal')?.addEventListener('click', () => {
    populateDairySelect();
    document.getElementById('form-customer-raise-ticket')?.reset();
    Modal.open('complaint-modal');
  });

  document.getElementById('btn-customer-refresh-support')?.addEventListener('click', () => {
    loadComplaints();
    Toast.success('Refreshed', 'Support tickets updated.');
  });

  // Raise Ticket Form Submit
  const raiseForm = document.getElementById('form-customer-raise-ticket');
  if (raiseForm) {
    raiseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dairy_id = document.getElementById('complaint-dairy-select').value;
      const category = document.getElementById('complaint-type-select').value;
      const subject = document.getElementById('complaint-subject').value.trim();
      const message = document.getElementById('complaint-description').value.trim();
      const fileInput = document.getElementById('complaint-attachment-file');
      const submitBtn = document.getElementById('btn-submit-complaint');

      if (!dairy_id) {
        Toast.warning('Select Dairy', 'Please choose the dairy partner.');
        return;
      }
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
          formData.append('type', 'complaint');

          const uploadRes = await API.postForm('/api/upload/complaint', formData);
          attachment_url = uploadRes.url;
        }

        const payload = {
          dairy_id,
          category,
          subject,
          message,
          priority: 'medium',
          attachment_url,
        };

        const res = await API.post('/api/support/tickets', payload);
        Modal.close('complaint-modal');
        Toast.success('Ticket Submitted!', `Ticket #${res.ticket.ticket_number} created. Support team will respond shortly.`);
        raiseForm.reset();

        await loadComplaints();
        if (res.ticket?.id) {
          openCustomerTicketChat(res.ticket.id);
        }
      } catch (err) {
        Toast.error('Submission Error', err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Ticket & Start Chat';
      }
    });
  }

  // Customer Chat Composer Form
  const chatForm = document.getElementById('form-customer-chat-composer');
  const chatInput = document.getElementById('customer-chat-input');
  if (chatForm && chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    });

    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!activeCustomerChatTicketId) return;

      const messageText = chatInput.value.trim();
      if (!messageText && !customerChatAttachment) return;

      const sendBtn = document.getElementById('btn-customer-send-msg');
      sendBtn.disabled = true;

      try {
        let attachment_url = null;
        if (customerChatAttachment && customerChatAttachment.file) {
          const formData = new FormData();
          formData.append('file', customerChatAttachment.file);
          formData.append('type', 'general');

          const uploadRes = await API.postForm('/api/upload/general', formData);
          attachment_url = uploadRes.url;
        }

        await API.post(`/api/support/tickets/${activeCustomerChatTicketId}/messages`, {
          message: messageText,
          attachment_url,
        });

        chatInput.value = '';
        clearCustomerAttachment();
        await openCustomerTicketChat(activeCustomerChatTicketId, true, true);
        loadComplaints();
      } catch (err) {
        Toast.error('Send Error', err.message);
      } finally {
        sendBtn.disabled = false;
        chatInput.focus();
      }
    });
  }

  // File Picker Trigger in Customer Chat
  const fileInput = document.getElementById('customer-chat-file-input');
  const chooseFileBtn = document.getElementById('btn-customer-choose-file');
  if (chooseFileBtn && fileInput) {
    chooseFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        customerChatAttachment = { file, name: file.name };
        const preview = document.getElementById('customer-attachment-preview');
        const nameEl = document.getElementById('customer-attachment-name');
        if (preview && nameEl) {
          nameEl.textContent = file.name;
          preview.style.display = 'flex';
        }
      }
    });
  }

  document.getElementById('btn-customer-remove-attachment')?.addEventListener('click', () => {
    clearCustomerAttachment();
  });

  // Canned replies
  document.querySelectorAll('.canned-chip[data-target="customer-chat-input"]').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (!chatInput) return;
      chatInput.value = chip.dataset.text;
      chatInput.focus();
    });
  });
}

function clearCustomerAttachment() {
  customerChatAttachment = null;
  const preview = document.getElementById('customer-attachment-preview');
  const fileInput = document.getElementById('customer-chat-file-input');
  if (preview) preview.style.display = 'none';
  if (fileInput) fileInput.value = '';
}

function populateDairySelect() {
  const select = document.getElementById('complaint-dairy-select');
  if (!select) return;
  const uniqueDairies = {};

  mySubscriptions.forEach((s) => {
    if (s.dairy) uniqueDairies[s.dairy.id] = s.dairy.dairy_name;
  });
  myOrders.forEach((o) => {
    if (o.dairy) uniqueDairies[o.dairy.id] = o.dairy.dairy_name;
  });

  if (Object.keys(uniqueDairies).length === 0) {
    select.innerHTML = '<option value="">No past dairy orders found</option>';
    return;
  }

  select.innerHTML = Object.entries(uniqueDairies).map(([id, name]) => `
    <option value="${id}">${name}</option>
  `).join('');
}

window.reportIssueForOrder = function (dairyId, orderId) {
  populateDairySelect();
  const select = document.getElementById('complaint-dairy-select');
  if (select) select.value = dairyId;

  const subjectInput = document.getElementById('complaint-subject');
  if (subjectInput) subjectInput.value = `Delivery Issue regarding Order #${orderId.slice(-6).toUpperCase()}`;

  Modal.open('complaint-modal');
};

let customerRenderedMsgIds = [];
let customerRenderedTicketId = null;

function isCustomerScrolledNearBottom(container, threshold = 90) {
  if (!container) return true;
  return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
}

/**
 * Generate Message HTML Element string for Customer chat
 */
function buildCustomerMessageHtml(m, currentUserId, isNew = false) {
  if (m.sender_role === 'system') {
    return `
      <div class="chat-bubble-wrap system-event ${isNew ? 'new-message-anim' : ''}" data-msg-id="${m.id}">
        <div class="chat-system-pill">
          <i class="fa-solid fa-circle-info" style="color: var(--theme-primary); margin-right: 4px;"></i>
          ${escapeHtml(m.message)}
        </div>
      </div>
    `;
  }

  const isOutgoing = m.sender_id === currentUserId || m.sender_role === 'customer';
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
          <span class="badge" style="font-size: 0.62rem; padding: 0.05rem 0.35rem;">${m.sender_role === 'admin' ? 'Support Desk' : 'You'}</span>
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
 * Open Customer Live Chat Modal with Support
 */
async function openCustomerTicketChat(ticketId, isPoll = false, forceScroll = false) {
  const isTicketSwitch = activeCustomerChatTicketId !== ticketId;
  activeCustomerChatTicketId = ticketId;

  if (!isPoll) {
    Modal.open('modal-customer-chat');
  }

  try {
    const res = await API.get(`/api/support/tickets/${ticketId}`);
    const ticket = res.ticket;
    const messages = res.messages || [];

    const titleEl = document.getElementById('customer-chat-ticket-title');
    if (titleEl) titleEl.textContent = ticket.subject;
    const numEl = document.getElementById('customer-chat-ticket-num');
    if (numEl) numEl.textContent = `#${ticket.ticket_number}`;

    const statusBadge = document.getElementById('customer-chat-status-badge');
    if (statusBadge) {
      let sClass = 'status-open';
      if (ticket.status === 'in_progress') sClass = 'status-in_progress';
      else if (ticket.status === 'resolved') sClass = 'status-resolved';
      else if (ticket.status === 'closed') sClass = 'status-closed';

      statusBadge.className = `ticket-status-pill ${sClass}`;
      statusBadge.textContent = (ticket.status || 'open').replace('_', ' ');
    }

    const catEl = document.getElementById('customer-chat-category');
    if (catEl) catEl.textContent = (ticket.category || 'general').toUpperCase();
    
    const dairyWrap = document.getElementById('customer-chat-dairy-wrap');
    const dairyText = document.getElementById('customer-chat-dairy');
    if (dairyWrap && dairyText) {
      if (ticket.dairy?.dairy_name) {
        dairyText.textContent = ticket.dairy.dairy_name;
        dairyWrap.style.display = 'flex';
      } else {
        dairyWrap.style.display = 'none';
      }
    }

    const createdEl = document.getElementById('customer-chat-created');
    if (createdEl) {
      createdEl.textContent = new Date(ticket.created_at || Date.now()).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    const streamContainer = document.getElementById('customer-chat-messages-stream');
    if (streamContainer) {
      renderCustomerChatMessages(streamContainer, messages, isTicketSwitch || forceScroll);
    }

    startCustomerChatPolling();

  } catch (err) {
    if (!isPoll) {
      Toast.error('Chat Error', err.message);
    }
  }
}

/**
 * Smart Non-Destructive Messages Stream Renderer for Customer
 */
function renderCustomerChatMessages(container, messages, forceScroll = false) {
  const currentUser = Auth.getUser() || {};
  const currentUserId = currentUser.id;

  if (messages.length === 0) {
    if (customerRenderedTicketId !== activeCustomerChatTicketId || customerRenderedMsgIds.length > 0) {
      customerRenderedTicketId = activeCustomerChatTicketId;
      customerRenderedMsgIds = [];
      container.innerHTML = `<div class="text-center text-muted" style="padding:2rem;">No messages in this ticket yet.</div>`;
    }
    return;
  }

  const wasNearBottom = isCustomerScrolledNearBottom(container);
  const isTicketSwitch = customerRenderedTicketId !== activeCustomerChatTicketId;

  if (isTicketSwitch) {
    customerRenderedTicketId = activeCustomerChatTicketId;
    customerRenderedMsgIds = messages.map((m) => m.id);
    container.innerHTML = messages.map((m) => buildCustomerMessageHtml(m, currentUserId, false)).join('');
    container.scrollTop = container.scrollHeight;
    return;
  }

  // Check for newly arrived messages
  const existingSet = new Set(customerRenderedMsgIds);
  const newMessages = messages.filter((m) => !existingSet.has(m.id));

  if (newMessages.length === 0 && messages.length === customerRenderedMsgIds.length) {
    // Zero changes - do nothing
    return;
  }

  if (newMessages.length > 0 && customerRenderedMsgIds.length > 0) {
    // Incrementally append ONLY the new messages
    const emptyPlaceholder = container.querySelector('.text-center.text-muted');
    if (emptyPlaceholder) emptyPlaceholder.remove();

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newMessages.map((m) => buildCustomerMessageHtml(m, currentUserId, true)).join('');

    while (tempDiv.firstChild) {
      container.appendChild(tempDiv.firstChild);
    }

    customerRenderedMsgIds = messages.map((m) => m.id);

    if (wasNearBottom || forceScroll) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  } else {
    // Re-render full list if IDs diverged
    customerRenderedMsgIds = messages.map((m) => m.id);
    container.innerHTML = messages.map((m) => buildCustomerMessageHtml(m, currentUserId, false)).join('');
    if (wasNearBottom || forceScroll) {
      container.scrollTop = container.scrollHeight;
    }
  }
}

function startCustomerChatPolling() {
  if (customerChatPollTimer) clearInterval(customerChatPollTimer);
  customerChatPollTimer = setInterval(() => {
    const modal = document.getElementById('modal-customer-chat');
    if (modal && modal.classList.contains('active') && activeCustomerChatTicketId) {
      openCustomerTicketChat(activeCustomerChatTicketId, true);
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

window.openCustomerTicketChat = openCustomerTicketChat;


/**
 * Setup Account & Security Settings Tab
 */
function setupSettingsTab() {
  const user = Auth.getUser();

  // Populate current fields
  const curNameInput = document.getElementById('settings-customer-fullname');
  if (curNameInput && user) curNameInput.value = user.full_name || '';

  const curPhoneInput = document.getElementById('settings-customer-phone');
  if (curPhoneInput && user) curPhoneInput.value = user.phone || '';

  const curEmailInput = document.getElementById('settings-current-email');
  if (curEmailInput && user) {
    curEmailInput.value = user.email || '';
  }

  // 1. Change Customer Full Name Form
  const changeNameForm = document.getElementById('form-change-customer-name');
  if (changeNameForm) {
    changeNameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newFullName = document.getElementById('settings-customer-fullname').value.trim();
      const newPhone = document.getElementById('settings-customer-phone')?.value.trim();
      const btn = document.getElementById('btn-update-customer-name');

      if (!newFullName) {
        Toast.warning('Missing Name', 'Please enter your full name.');
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
        Auth.saveSession(Auth.getToken(), currentUser, Auth.getDairy());

        setupProfileHeader();
        Toast.success('Full Name Updated!', `Your account name has been changed to "${newFullName}".`);
      } catch (err) {
        Toast.error('Update Failed', err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  // 2. Change Email Form
  const changeEmailForm = document.getElementById('form-change-email');
  if (changeEmailForm) {
    changeEmailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newEmail = document.getElementById('settings-new-email').value.trim();
      const btn = document.getElementById('btn-update-email');

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
          Auth.saveSession(res.token, res.user || { ...user, email: newEmail });
        }

        if (curEmailInput) curEmailInput.value = newEmail;
        const profileEmail = document.getElementById('profile-email');
        if (profileEmail) profileEmail.value = newEmail;
        document.getElementById('settings-new-email').value = '';

        Toast.success('Email Updated', res.message || 'Your login email has been updated successfully.');
      } catch (err) {
        Toast.error('Email Update Failed', err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  // 2. Change Password Form & Strength Meter
  const newPassInput = document.getElementById('settings-new-password');
  const strengthFill = document.getElementById('password-strength-fill');
  const strengthText = document.getElementById('password-strength-text');

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

  const changePassForm = document.getElementById('form-change-password');
  if (changePassForm) {
    changePassForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPass = document.getElementById('settings-current-password').value;
      const newPass = document.getElementById('settings-new-password').value;
      const confirmPass = document.getElementById('settings-confirm-password').value;
      const btn = document.getElementById('btn-update-password');

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

        document.getElementById('settings-current-password').value = '';
        document.getElementById('settings-new-password').value = '';
        document.getElementById('settings-confirm-password').value = '';
        if (strengthFill) strengthFill.style.width = '0%';
        if (strengthText) strengthText.textContent = 'Strength: None';

        Toast.success('Password Changed', res.message || 'Your password has been changed securely.');
      } catch (err) {
        Toast.error('Password Change Failed', err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  // 3. Forgot Password Link
  const forgotBtn = document.getElementById('btn-settings-forgot-password');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', async () => {
      const email = user?.email || (curEmailInput ? curEmailInput.value : '');
      if (!email) {
        Toast.warning('Missing Email', 'Could not detect account email.');
        return;
      }

      forgotBtn.disabled = true;
      forgotBtn.innerHTML = '<span class="spinner-sm"></span> Sending...';

      try {
        const res = await API.post('/api/auth/forgot-password', { email });
        Toast.success('Reset Link Dispatched', res.message || 'Password reset link sent to your registered email.');
      } catch (err) {
        Toast.error('Request Failed', err.message);
      } finally {
        forgotBtn.disabled = false;
        forgotBtn.innerHTML = '<i class="fa-solid fa-key"></i> Send Reset Link';
      }
    });
  }

  // 4. Notification Preferences
  const prefsForm = document.getElementById('form-notification-prefs');
  if (prefsForm) {
    prefsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn-save-prefs');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-sm"></span> Saving...';

      try {
        const payload = {
          whatsapp_alerts: document.getElementById('pref-whatsapp')?.checked || false,
          morning_alert: document.getElementById('pref-morning-alert')?.checked || false,
          invoices: document.getElementById('pref-invoices')?.checked || false,
          offers: document.getElementById('pref-offers')?.checked || false,
        };

        const res = await API.put('/api/auth/notification-preferences', payload);
        Toast.success('Preferences Saved', res.message || 'Your notification preferences have been updated.');
      } catch (err) {
        Toast.error('Save Failed', err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  // 5. Logout All Devices
  const logoutAllBtn = document.getElementById('btn-logout-all');
  if (logoutAllBtn) {
    logoutAllBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to log out of all active devices? You will remain signed in here.')) return;
      try {
        const res = await API.post('/api/auth/logout-all');
        Toast.success('Sessions Terminated', res.message || 'All other active sessions have been logged out.');
      } catch (err) {
        Toast.error('Action Failed', err.message);
      }
    });
  }

  // 6. Delete Account Handler
  const deleteAccBtn = document.getElementById('btn-delete-account');
  if (deleteAccBtn) {
    deleteAccBtn.addEventListener('click', () => {
      if (confirm('CAUTION: Are you sure you want to request account deactivation? All active milk subscriptions and delivery schedules will be stopped.')) {
        Toast.info('Request Received', 'Your account deactivation request has been sent to the Near Dairy support team.');
      }
    });
  }
}

// togglePasswordVisibility is defined globally in components.js


