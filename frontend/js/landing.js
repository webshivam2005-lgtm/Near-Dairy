/**
 * NEAR DAIRY - LANDING PAGE & REAL-TIME DISCOVERY LOGIC
 */

let mapInstance = null;
let userMarker = null;
let radiusCircle = null;
let dairyMarkersLayer = null;
let dairyMarkersMap = {};

const initialLoc = MapHelper.getInitialCoordinates();
let currentCoordinates = {
  latitude: initialLoc.latitude,
  longitude: initialLoc.longitude,
};
let currentLocationName = initialLoc.address || 'Pune Dairies Hub, Maharashtra';

let currentRadius = 10;
let currentCategory = 'all';
let currentSearch = '';
let currentViewMode = 'dairies'; // 'dairies' | 'map' | 'split'

document.addEventListener('DOMContentLoaded', async () => {
  initLeafletMap();
  setupEventListeners();
  setupManualLocationControls();
  setupMobileDrawer();
  setupFaqAccordion();
  setupViewModeSwitcher();

  const manualInput = document.getElementById('manual-location-input');
  if (manualInput) manualInput.value = currentLocationName;

  const locText = document.getElementById('user-location-text');
  if (locText) locText.textContent = `Showing approved local dairies near ${currentLocationName}`;

  updateUserMapLocation();
  loadDairies();
});

/**
 * Initialize Leaflet Map
 */
function initLeafletMap() {
  const mapElem = document.getElementById('discovery-map');
  if (!mapElem) return;

  mapInstance = L.map('discovery-map', {
    center: [currentCoordinates.latitude, currentCoordinates.longitude],
    zoom: 13,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(mapInstance);

  dairyMarkersLayer = L.layerGroup().addTo(mapInstance);

  // Allow clicking anywhere on the map to set location manually
  mapInstance.on('click', async (e) => {
    currentCoordinates.latitude = e.latlng.lat;
    currentCoordinates.longitude = e.latlng.lng;
    
    updateUserMapLocation(false);

    const addr = await MapHelper.reverseGeocode(e.latlng.lat, e.latlng.lng);
    currentLocationName = addr;
    MapHelper.saveUserCoordinates(e.latlng.lat, e.latlng.lng, addr);

    const locText = document.getElementById('user-location-text');
    if (locText) locText.textContent = `Showing approved local dairies near ${addr}`;

    const manualInput = document.getElementById('manual-location-input');
    if (manualInput) manualInput.value = addr;

    document.querySelectorAll('.city-shortcut-btn').forEach((b) => b.classList.remove('active'));

    Toast.info('Location Selected', `Updated to ${addr}`);
    loadDairies();
  });
}

/**
 * Update User Pin & Search Circle on Map
 */
function updateUserMapLocation(centerMap = true) {
  if (!mapInstance) return;

  const lat = currentCoordinates.latitude;
  const lng = currentCoordinates.longitude;

  if (userMarker) userMarker.remove();
  if (radiusCircle) radiusCircle.remove();

  userMarker = L.marker([lat, lng], {
    icon: MapHelper.createUserIcon(),
    draggable: true,
    title: 'Drag marker to set delivery location',
  }).addTo(mapInstance);

  userMarker.bindPopup(`
    <div style="font-family: var(--font-sans); text-align: left; padding: 2px;">
      <div style="font-weight: 800; color: #2563EB; font-size: 0.9375rem; margin-bottom: 2px;">
        <i class="fa-solid fa-location-dot"></i> Your Delivery Location
      </div>
      <div style="font-size: 0.8125rem; color: #475569; margin-bottom: 4px;">${currentLocationName}</div>
      <div style="font-size: 0.75rem; font-weight: 700; color: #16A34A; background: #DCFCE7; padding: 2px 6px; border-radius: 4px; display: inline-block;">
        <i class="fa-solid fa-hand-pointer"></i> Drag pin or click map to move
      </div>
    </div>
  `);

  // Listen to drag event on user marker
  userMarker.on('dragend', async (e) => {
    const pos = e.target.getLatLng();
    currentCoordinates.latitude = pos.lat;
    currentCoordinates.longitude = pos.lng;

    if (radiusCircle) radiusCircle.setLatLng(pos);

    const addr = await MapHelper.reverseGeocode(pos.lat, pos.lng);
    currentLocationName = addr;
    MapHelper.saveUserCoordinates(pos.lat, pos.lng, addr);

    userMarker.getPopup().setContent(`
      <div style="font-family: var(--font-sans); text-align: left; padding: 2px;">
        <div style="font-weight: 800; color: #2563EB; font-size: 0.9375rem; margin-bottom: 2px;">
          <i class="fa-solid fa-location-dot"></i> Your Delivery Location
        </div>
        <div style="font-size: 0.8125rem; color: #475569; margin-bottom: 4px;">${addr}</div>
        <div style="font-size: 0.75rem; font-weight: 700; color: #16A34A; background: #DCFCE7; padding: 2px 6px; border-radius: 4px; display: inline-block;">
          <i class="fa-solid fa-hand-pointer"></i> Drag pin or click map to move
        </div>
      </div>
    `);

    const locText = document.getElementById('user-location-text');
    if (locText) locText.textContent = `Showing approved local dairies near ${addr}`;

    const manualInput = document.getElementById('manual-location-input');
    if (manualInput) manualInput.value = addr;

    document.querySelectorAll('.city-shortcut-btn').forEach((b) => b.classList.remove('active'));

    Toast.info('Location Pinned', `Updated to ${addr}`);
    loadDairies();
  });

  radiusCircle = L.circle([lat, lng], {
    radius: currentRadius * 1000,
    color: '#2563EB',
    fillColor: '#3B82F6',
    fillOpacity: 0.08,
    weight: 2,
    dashArray: '6, 6',
  }).addTo(mapInstance);

  if (centerMap) {
    mapInstance.setView([lat, lng], getZoomForRadius(currentRadius));
  }
}

function getZoomForRadius(radiusKm) {
  if (radiusKm <= 3) return 14;
  if (radiusKm <= 8) return 13;
  if (radiusKm <= 15) return 12;
  if (radiusKm <= 30) return 11;
  return 10;
}

/**
 * Setup Manual Location Search & Quick Area Buttons
 */
function setupManualLocationControls() {
  const manualInput = document.getElementById('manual-location-input');
  const manualBtn = document.getElementById('btn-manual-search');

  async function executeLocationSearch() {
    const query = (manualInput?.value || '').trim();
    if (!query) {
      Toast.warning('Empty Location', 'Please enter a locality or city name.');
      return;
    }

    if (manualBtn) manualBtn.innerHTML = '<span class="spinner" style="width:14px; height:14px;"></span> Searching...';

    try {
      const loc = await MapHelper.geocode(query);
      if (loc) {
        currentCoordinates.latitude = loc.latitude;
        currentCoordinates.longitude = loc.longitude;
        currentLocationName = loc.displayName;
        MapHelper.saveUserCoordinates(loc.latitude, loc.longitude, loc.displayName);

        updateUserMapLocation(true);

        const locText = document.getElementById('user-location-text');
        if (locText) locText.textContent = `Showing approved local dairies near ${loc.displayName}`;

        document.querySelectorAll('.city-shortcut-btn').forEach((b) => b.classList.remove('active'));

        Toast.success('Location Set', `Found and updated to: ${loc.displayName}`);
        loadDairies();
      } else {
        Toast.warning('Location Not Found', 'Could not locate that address. Try searching a major area or city like Pune, Katraj, Mumbai.');
      }
    } catch (err) {
      Toast.error('Search Error', err.message);
    } finally {
      if (manualBtn) manualBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Set Location';
    }
  }

  if (manualBtn) {
    manualBtn.addEventListener('click', executeLocationSearch);
  }
  if (manualInput) {
    manualInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeLocationSearch();
    });
  }

  // Quick Area / City buttons
  const cityBtns = document.querySelectorAll('.city-shortcut-btn');
  cityBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      cityBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const lat = parseFloat(btn.dataset.lat);
      const lng = parseFloat(btn.dataset.lng);
      const name = btn.dataset.name;

      currentCoordinates.latitude = lat;
      currentCoordinates.longitude = lng;
      currentLocationName = name;
      MapHelper.saveUserCoordinates(lat, lng, name);

      if (manualInput) manualInput.value = name;

      const locText = document.getElementById('user-location-text');
      if (locText) locText.textContent = `Showing approved local dairies near ${name}`;

      updateUserMapLocation(true);
      Toast.info('Location Selected', `Set to ${name}`);
      loadDairies();
    });
  });

  // GPS Buttons
  const mapGpsBtn = document.getElementById('btn-map-use-gps');
  if (mapGpsBtn) {
    mapGpsBtn.addEventListener('click', triggerGpsLocation);
  }
}

async function triggerGpsLocation() {
  Toast.info('Detecting GPS...', 'Fetching your device coordinates.');
  try {
    const pos = await MapHelper.getCurrentPosition();
    currentCoordinates.latitude = pos.latitude;
    currentCoordinates.longitude = pos.longitude;

    const addr = await MapHelper.reverseGeocode(pos.latitude, pos.longitude);
    currentLocationName = addr;
    MapHelper.saveUserCoordinates(pos.latitude, pos.longitude, addr);

    const manualInput = document.getElementById('manual-location-input');
    if (manualInput) manualInput.value = addr;

    const locText = document.getElementById('user-location-text');
    if (locText) locText.textContent = `Showing approved local dairies near your live GPS (${addr})`;

    document.querySelectorAll('.city-shortcut-btn').forEach((b) => b.classList.remove('active'));

    updateUserMapLocation(true);
    Toast.success('GPS Location Detected', `Updated to ${addr}`);
    loadDairies();
  } catch (err) {
    Toast.error('GPS Error', err.message);
  }
}

/**
 * Setup UI Event Listeners
 */
function setupEventListeners() {
  // 1. Radius Slider
  const radiusSlider = document.getElementById('radius-range');
  const radiusVal = document.getElementById('radius-val');

  if (radiusSlider) {
    radiusSlider.addEventListener('input', (e) => {
      currentRadius = parseInt(e.target.value, 10);
      if (radiusVal) radiusVal.textContent = `${currentRadius} km`;
      if (radiusCircle && mapInstance) {
        radiusCircle.setRadius(currentRadius * 1000);
        mapInstance.setView([currentCoordinates.latitude, currentCoordinates.longitude], getZoomForRadius(currentRadius));
      }
    });

    radiusSlider.addEventListener('change', () => {
      loadDairies();
    });
  }

  // 2. Hero GPS Location Button
  const btnLocate = document.getElementById('btn-hero-locate');
  if (btnLocate) {
    btnLocate.addEventListener('click', triggerGpsLocation);
  }

  // 3. Search Bar Button & Enter Key
  const searchInput = document.getElementById('landing-search-input');
  const searchBtn = document.getElementById('btn-hero-search');
  if (searchBtn && searchInput) {
    const handleHeroSearch = async () => {
      const term = searchInput.value.trim();
      if (!term) {
        currentSearch = '';
        loadDairies();
        return;
      }

      // Check if term is a recognized city or area name
      const loc = await MapHelper.geocode(term);
      if (loc) {
        currentCoordinates.latitude = loc.latitude;
        currentCoordinates.longitude = loc.longitude;
        currentLocationName = loc.displayName;
        MapHelper.saveUserCoordinates(loc.latitude, loc.longitude, loc.displayName);

        updateUserMapLocation(true);

        const manualInput = document.getElementById('manual-location-input');
        if (manualInput) manualInput.value = loc.displayName;

        const locText = document.getElementById('user-location-text');
        if (locText) locText.textContent = `Showing approved local dairies near ${loc.displayName}`;

        currentSearch = '';
      } else {
        currentSearch = term;
      }

      loadDairies();
      const disc = document.getElementById('discovery');
      if (disc) disc.scrollIntoView({ behavior: 'smooth' });
    };

    searchBtn.addEventListener('click', handleHeroSearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleHeroSearch();
    });
  }

  // 4. Refresh Button
  const refreshBtn = document.getElementById('btn-refresh-nearby');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadDairies();
    });
  }

  // 5. Category Pills
  const pills = document.querySelectorAll('.category-pill');
  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      currentCategory = pill.dataset.category;
      loadDairies();
    });
  });

  // 6. Scroll state on navbar
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('topNavbar');
    if (nav) {
      if (window.scrollY > 20) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    }
  });
}

/**
 * View Mode Switcher: Dairies Grid vs Interactive Map vs Split View
 */
function setupViewModeSwitcher() {
  const container = document.getElementById('discoveryLayoutContainer');
  const buttons = document.querySelectorAll('.view-mode-btn');

  if (!container || !buttons.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.view;
      setViewMode(mode);
    });
  });
}

function setViewMode(mode) {
  currentViewMode = mode;
  const container = document.getElementById('discoveryLayoutContainer');
  const buttons = document.querySelectorAll('.view-mode-btn');

  if (!container) return;

  // Update container class
  container.className = `discovery-layout-container view-mode-${mode}`;

  // Update buttons active class
  buttons.forEach((b) => {
    if (b.dataset.view === mode) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  // Trigger leaflet recalculation when showing map
  if (mode === 'map' || mode === 'split') {
    if (mapInstance) {
      setTimeout(() => {
        mapInstance.invalidateSize();
      }, 150);
    }
  }
}

/**
 * Locate a specific dairy on the map and open its popup
 */
window.locateDairyOnMap = function (lat, lng, dairyId) {
  if (!lat || !lng) {
    Toast.info('Location Not Available', 'Exact GPS coordinates not registered for this dairy.');
    return;
  }

  // Switch to Map or Split mode
  setViewMode('map');

  const disc = document.getElementById('discovery');
  if (disc) disc.scrollIntoView({ behavior: 'smooth' });

  setTimeout(() => {
    if (mapInstance) {
      mapInstance.invalidateSize();
      mapInstance.flyTo([lat, lng], 15, { duration: 1.2 });

      if (dairyMarkersMap[dairyId]) {
        dairyMarkersMap[dairyId].openPopup();
      }
    }
  }, 250);
};

/**
 * Mobile Navigation Drawer
 */
function setupMobileDrawer() {
  const toggleBtn = document.getElementById('mobileNavToggle') || document.getElementById('mobileMenuBtn');
  const drawer = document.getElementById('mobileDrawer');
  const closeBtn = document.getElementById('mobileDrawerClose');

  if (toggleBtn && drawer) {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      drawer.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  }

  if (closeBtn && drawer) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeMobileDrawer();
    });
  }

  if (drawer) {
    drawer.addEventListener('click', (e) => {
      // Close only if clicking the backdrop overlay outside drawer-content
      if (e.target === drawer) {
        closeMobileDrawer();
      }
    });
  }
}

window.closeMobileDrawer = function () {
  const drawer = document.getElementById('mobileDrawer');
  if (drawer) {
    drawer.classList.remove('active');
    document.body.style.overflow = '';
  }
};

/**
 * FAQ Accordion Handlers
 */
function setupFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach((item) => {
    const question = item.querySelector('.faq-question');
    if (question) {
      question.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        faqItems.forEach((i) => i.classList.remove('active'));
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });
}

/**
 * Fetch and Render Dairies
 */
async function loadDairies() {
  const container = document.getElementById('dairy-cards-list');
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state" style="grid-column: 1 / -1; padding: 3rem 1rem;">
      <div class="spinner"></div>
      <p style="margin-top: 1rem; color: var(--color-text-muted);">Finding certified dairy partners near you...</p>
    </div>
  `;

  try {
    const params = {
      lat: currentCoordinates.latitude,
      lng: currentCoordinates.longitude,
      radius: currentRadius,
    };
    if (currentCategory && currentCategory !== 'all') params.milk_type = currentCategory;
    if (currentSearch) params.search = currentSearch;

    const res = await API.get('/api/dairies/nearby', params);
    const dairies = res.dairies || [];

    const liveBadge = document.getElementById('dairies-live-badge');
    if (liveBadge) liveBadge.textContent = `${dairies.length} ${dairies.length === 1 ? 'Dairy' : 'Dairies'} Found`;

    const mapCount = document.getElementById('map-dairy-count');
    if (mapCount) mapCount.textContent = `${dairies.length} ${dairies.length === 1 ? 'Dairy' : 'Dairies'} Live`;

    renderDairyMarkers(dairies);

    if (dairies.length === 0) {
      container.innerHTML = `
        <div class="empty-state card" style="grid-column: 1 / -1; padding: 3rem 1.5rem; text-align: center;">
          <div class="empty-icon"><i class="fa-solid fa-cow"></i></div>
          <h3 style="margin-bottom: 0.5rem; font-size: 1.35rem;">No Dairies Found in this Area (${currentRadius} km)</h3>
          <p class="text-muted" style="max-width: 480px; margin: 0 auto 1.5rem; line-height: 1.5;">
            There are currently no registered dairy partners within ${currentRadius} km of <strong>${currentLocationName}</strong>. You can switch to Pune where our verified dairy farms are active, or increase your search radius.
          </p>
          <div class="flex items-center justify-center gap-3 flex-wrap">
            <button type="button" class="btn btn-primary" onclick="switchToPuneHub()">
              <i class="fa-solid fa-location-dot"></i> View Pune Dairies (Active Hub)
            </button>
            <button type="button" class="btn btn-secondary" onclick="expandSearchRadius(35)">
              <i class="fa-solid fa-arrows-maximize"></i> Expand Radius to 35 km
            </button>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = dairies.map((dairy) => {
      const minPrice = dairy.products?.length
        ? Math.min(...dairy.products.map((p) => p.price_per_unit))
        : 65;

      const productChips = (dairy.products || []).slice(0, 3).map((p) => `
        <span class="prod-chip">${p.name} (₹${p.price_per_unit}/${p.unit})</span>
      `).join('');

      return `
        <div class="dairy-card" id="dairy-card-${dairy.id}">
          <div class="dairy-card-img-wrap">
            <img src="${dairy.banner_image || 'https://images.unsplash.com/photo-1527153857715-3908f2ae5e81?w=800'}"
                 alt="${dairy.dairy_name}" class="dairy-card-img" onerror="this.src='https://images.unsplash.com/photo-1527153857715-3908f2ae5e81?w=800'">
            
            <div class="distance-badge">
              <i class="fa-solid fa-location-arrow"></i>
              <span>${dairy.distance_km !== null ? `${dairy.distance_km} km away` : 'Active Partner'}</span>
            </div>

            <div class="delivery-pill-top ${dairy.delivers_to_location ? '' : 'outside'}">
              <i class="fa-solid fa-${dairy.delivers_to_location ? 'truck-fast' : 'clock'}"></i>
              <span>${dairy.delivers_to_location ? 'Delivers to You' : 'Outside Direct Zone'}</span>
            </div>
          </div>

          <div class="dairy-card-body">
            <div>
              <div class="dairy-card-top">
                <h3 class="dairy-name">${dairy.dairy_name}</h3>
                <div class="dairy-rating">
                  <i class="fa-solid fa-star"></i>
                  <span>${dairy.rating || '4.8'}</span>
                  <span style="font-size: 0.75rem; font-weight: normal; color: #92400E;">(${dairy.rating_count || 0})</span>
                </div>
              </div>

              <div class="dairy-address">
                <i class="fa-solid fa-map-pin" style="color: var(--theme-primary);"></i>
                <span>${dairy.address}</span>
              </div>

              <div class="dairy-badges-row">
                ${dairy.fssai_license ? `
                  <span class="fssai-tag">
                    <i class="fa-solid fa-circle-check"></i> FSSAI: ${dairy.fssai_license}
                  </span>
                ` : `
                  <span class="fssai-tag">
                    <i class="fa-solid fa-certificate"></i> Verified Farm
                  </span>
                `}
                ${dairy.certificate_url ? `
                  <a href="${dairy.certificate_url}" target="_blank" class="cert-doc-btn" title="View certified FSSAI / Quality license document">
                    <i class="fa-solid fa-file-circle-check"></i> View Certificate
                  </a>
                ` : ''}
              </div>

              <div class="dairy-slots-info">
                <span class="slot-tag"><i class="fa-regular fa-sun" style="color: #D97706;"></i> Morning: ${typeof formatTime12h === 'function' ? formatTime12h(dairy.morning_slot_start || '05:30') : (dairy.morning_slot_start || '05:30 AM')} - ${typeof formatTime12h === 'function' ? formatTime12h(dairy.morning_slot_end || '07:30') : (dairy.morning_slot_end || '07:30 AM')}</span>
                <span class="slot-tag"><i class="fa-regular fa-moon" style="color: #4F46E5;"></i> Evening: ${typeof formatTime12h === 'function' ? formatTime12h(dairy.evening_slot_start || '17:30') : (dairy.evening_slot_start || '05:30 PM')} - ${typeof formatTime12h === 'function' ? formatTime12h(dairy.evening_slot_end || '19:30') : (dairy.evening_slot_end || '07:30 PM')}</span>
              </div>

              ${productChips ? `
                <div class="products-chip-row">
                  ${productChips}
                </div>
              ` : ''}
            </div>

            <div class="dairy-card-footer">
              <div class="starting-price">
                From <strong>₹${minPrice}</strong> / Litre
              </div>
              <div class="dairy-card-actions">
                ${dairy.latitude && dairy.longitude ? `
                  <button type="button" class="btn btn-outline btn-sm" onclick="locateDairyOnMap(${dairy.latitude}, ${dairy.longitude}, '${dairy.id}')" title="Locate this dairy on the interactive map">
                    <i class="fa-solid fa-map-location-dot"></i> Map
                  </button>
                ` : ''}
                <a href="dairy.html?id=${dairy.id}" class="btn btn-primary btn-sm">
                  <span>View Dairy & Order</span>
                  <i class="fa-solid fa-arrow-right"></i>
                </a>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    container.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: var(--color-danger);">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
        <h3>Failed to load nearby dairies</h3>
        <p class="text-muted">${error.message}</p>
        <button class="btn btn-secondary btn-sm" style="margin-top: 1rem;" onclick="loadDairies()">Retry</button>
      </div>
    `;
  }
}

/**
 * Render Dairy Markers on Leaflet Map
 */
function renderDairyMarkers(dairies) {
  if (!dairyMarkersLayer) return;
  dairyMarkersLayer.clearLayers();
  dairyMarkersMap = {};

  dairies.forEach((d) => {
    if (!d.latitude || !d.longitude) return;

    const marker = L.marker([d.latitude, d.longitude], {
      icon: MapHelper.createDairyIcon(d.dairy_name),
      title: d.dairy_name,
    });

    const popupContent = `
      <div style="min-width: 210px; font-family: 'Plus Jakarta Sans', sans-serif; padding: 4px;">
        <h4 style="margin: 0 0 4px; font-size: 14px; font-weight: 800; color: #0F172A;">${d.dairy_name}</h4>
        <p style="margin: 0 0 8px; font-size: 12px; color: #64748B; line-height: 1.4;">${d.address}</p>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <span style="font-weight: 800; color: #D97706; font-size: 12px;">★ ${d.rating || '4.8'}</span>
          <span style="font-size: 11px; color: #2563EB; font-weight: 700;">${d.distance_km !== null ? `${d.distance_km} km away` : ''}</span>
        </div>
        <a href="dairy.html?id=${d.id}" style="display: block; text-align: center; background: #2563EB; color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; text-decoration: none; box-shadow: 0 2px 6px rgba(37,99,235,0.3);">
          View Dairy & Order →
        </a>
      </div>
    `;

    marker.bindPopup(popupContent);
    marker.on('click', () => {
      const card = document.getElementById(`dairy-card-${d.id}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.borderColor = 'var(--theme-primary)';
        card.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.25)';
        setTimeout(() => {
          card.style.borderColor = '';
          card.style.boxShadow = '';
        }, 2200);
      }
    });

    dairyMarkersLayer.addLayer(marker);
    dairyMarkersMap[d.id] = marker;
  });
}

window.switchToPuneHub = function () {
  currentCoordinates.latitude = 18.4500;
  currentCoordinates.longitude = 73.8567;
  currentLocationName = 'Pune (Katraj / Kondhwa Hub), Maharashtra';
  MapHelper.saveUserCoordinates(18.4500, 73.8567, currentLocationName);

  const manualInput = document.getElementById('manual-location-input');
  if (manualInput) manualInput.value = currentLocationName;

  const locText = document.getElementById('user-location-text');
  if (locText) locText.textContent = `Showing approved local dairies near ${currentLocationName}`;

  document.querySelectorAll('.city-shortcut-btn').forEach((b) => {
    if (b.dataset.lat === '18.4500') b.classList.add('active');
    else b.classList.remove('active');
  });

  updateUserMapLocation(true);
  Toast.success('Location Switched', 'Viewing verified Pune dairy farms.');
  loadDairies();
};

window.expandSearchRadius = function (newRadiusKm = 35) {
  currentRadius = newRadiusKm;
  const radiusSlider = document.getElementById('radius-range');
  const radiusVal = document.getElementById('radius-val');
  if (radiusSlider) radiusSlider.value = newRadiusKm;
  if (radiusVal) radiusVal.textContent = `${newRadiusKm} km`;

  if (radiusCircle && mapInstance) {
    radiusCircle.setRadius(newRadiusKm * 1000);
    mapInstance.setView([currentCoordinates.latitude, currentCoordinates.longitude], getZoomForRadius(newRadiusKm));
  }

  Toast.info('Radius Expanded', `Search zone expanded to ${newRadiusKm} km.`);
  loadDairies();
};
