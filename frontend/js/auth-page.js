/**
 * NEAR DAIRY - AUTHENTICATION PAGE SCRIPT
 */

let activeRole = 'customer';
let activeMode = 'login';
let partnerPickerMap = null;
let partnerPickerMarker = null;

document.addEventListener('DOMContentLoaded', () => {
  // Check URL params for initial role & mode
  const params = new URLSearchParams(window.location.search);
  if (params.get('role') && ['customer', 'partner'].includes(params.get('role'))) {
    activeRole = params.get('role');
  }
  if (params.get('mode') && ['login', 'register'].includes(params.get('mode'))) {
    activeMode = params.get('mode');
  }

  setupRoleTabs();
  setupSubTabs();
  setupPasswordToggle();
  setupPartnerMap();
  setupUploadHandlers();
  setupAuthForm();
  setupForgotPasswordHandlers();
  updateUI();
});

/**
 * Setup All File Upload Handlers (Avatar, Banner, Certificate)
 */
function setupUploadHandlers() {
  setupAvatarUpload();
  setupBannerUpload();
  setupCertificateUpload();
}

/**
 * 1. User Profile Picture (Avatar) Upload
 */
function setupAvatarUpload() {
  const fileInput = document.getElementById('input-avatar-file');
  const trigger = document.getElementById('avatar-preview-trigger');
  const chooseBtn = document.getElementById('btn-choose-avatar');
  const previewImg = document.getElementById('avatar-preview-img');
  const urlInput = document.getElementById('input-avatar-url');

  if (trigger && fileInput) {
    trigger.addEventListener('click', () => fileInput.click());
  }
  if (chooseBtn && fileInput) {
    chooseBtn.addEventListener('click', () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Show instant client preview
      const reader = new FileReader();
      reader.onload = (re) => {
        if (previewImg) previewImg.src = re.target.result;
      };
      reader.readAsDataURL(file);

      // Upload to server
      try {
        if (typeof Toast !== 'undefined') Toast.info('Uploading photo...', 'Saving your profile avatar');
        const res = await API.upload(file, 'avatar');
        if (urlInput) urlInput.value = res.url;
        if (typeof Toast !== 'undefined') Toast.success('Photo Uploaded', 'Profile picture ready');
      } catch (err) {
        console.warn('Avatar server upload notice, fallback to preview:', err.message);
        if (urlInput) urlInput.value = previewImg.src;
      }
    });
  }

  // Update default dicebear avatar on name typing if no custom photo uploaded
  const nameInput = document.getElementById('input-name');
  if (nameInput) {
    nameInput.addEventListener('input', (e) => {
      if (!urlInput || !urlInput.value) {
        const val = e.target.value.trim() || 'User';
        if (previewImg) {
          previewImg.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(val)}`;
        }
      }
    });
  }
}

/**
 * 2. Dairy Banner Image Upload
 */
function setupBannerUpload() {
  const dropzone = document.getElementById('banner-dropzone');
  const fileInput = document.getElementById('input-banner-file');
  const previewBox = document.getElementById('banner-preview-box');
  const previewImg = document.getElementById('banner-preview-img');
  const urlInput = document.getElementById('input-banner-url');
  const removeBtn = document.getElementById('btn-remove-banner');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  // Drag & drop support
  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    if (file) handleBannerFile(file);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleBannerFile(file);
  });

  async function handleBannerFile(file) {
    if (!file.type.startsWith('image/')) {
      if (typeof Toast !== 'undefined') Toast.warning('Invalid File', 'Please select an image file (JPG, PNG, WEBP).');
      return;
    }

    // Instant local preview
    const reader = new FileReader();
    reader.onload = (re) => {
      if (previewImg) previewImg.src = re.target.result;
      if (previewBox) previewBox.style.display = 'block';
      if (dropzone) dropzone.style.display = 'none';
    };
    reader.readAsDataURL(file);

    try {
      if (typeof Toast !== 'undefined') Toast.info('Uploading Banner...', 'Uploading farm hero banner image');
      const res = await API.upload(file, 'banner');
      if (urlInput) urlInput.value = res.url;
      if (typeof Toast !== 'undefined') Toast.success('Banner Uploaded!', 'Dairy storefront cover is ready');
    } catch (err) {
      console.warn('Banner server upload fallback:', err.message);
      if (urlInput) urlInput.value = previewImg?.src || '';
    }
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const uploadedUrl = urlInput ? urlInput.value : '';
      if (uploadedUrl) {
        try {
          await API.deleteUpload(uploadedUrl);
        } catch (delErr) {
          console.warn('Banner deletion notice:', delErr.message);
        }
      }
      if (fileInput) fileInput.value = '';
      if (urlInput) urlInput.value = '';
      if (previewBox) previewBox.style.display = 'none';
      if (dropzone) dropzone.style.display = 'block';
    });
  }
}

/**
 * 3. Dairy Certificate File Upload (PDF/Image)
 */
function setupCertificateUpload() {
  const dropzone = document.getElementById('cert-dropzone');
  const fileInput = document.getElementById('input-cert-file');
  const certCard = document.getElementById('cert-file-card');
  const certIcon = document.getElementById('cert-file-icon');
  const certName = document.getElementById('cert-file-name');
  const certMeta = document.getElementById('cert-file-meta');
  const urlInput = document.getElementById('input-cert-url');
  const removeBtn = document.getElementById('btn-remove-cert');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  // Drag & drop support
  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    if (file) handleCertFile(file);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleCertFile(file);
  });

  async function handleCertFile(file) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImg = file.type.startsWith('image/');

    if (!isPdf && !isImg) {
      if (typeof Toast !== 'undefined') Toast.warning('Invalid Format', 'Please upload a PDF document or an image file (JPG, PNG).');
      return;
    }

    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    if (certName) certName.textContent = file.name;
    if (certMeta) certMeta.innerHTML = `${isPdf ? 'PDF Document' : 'Image Certificate'} • ${sizeMb} MB • <span class="spinner" style="width:12px;height:12px;"></span> Uploading to Supabase...`;

    if (certIcon) {
      if (isPdf) {
        certIcon.className = 'cert-file-icon';
        certIcon.innerHTML = '<i class="fa-solid fa-file-pdf"></i>';
      } else {
        certIcon.className = 'cert-file-icon is-image';
        certIcon.innerHTML = '<i class="fa-solid fa-file-image"></i>';
      }
    }

    if (certCard) certCard.style.display = 'flex';
    if (dropzone) dropzone.style.display = 'none';

    try {
      if (typeof Toast !== 'undefined') Toast.info('Uploading Certificate...', 'Saving document to Supabase Bucket');
      const res = await API.upload(file, 'certificate');
      if (urlInput) urlInput.value = res.url;
      if (certMeta) certMeta.innerHTML = `${isPdf ? 'PDF Document' : 'Image Certificate'} • ${sizeMb} MB • <span style="color: var(--color-success); font-weight: 700;">✓ Stored in Supabase</span>`;
      if (typeof Toast !== 'undefined') Toast.success('Certificate Uploaded!', 'FSSAI compliance document attached to registration');
    } catch (err) {
      console.warn('Certificate upload error:', err.message);
      if (certMeta) certMeta.innerHTML = `${isPdf ? 'PDF Document' : 'Image Certificate'} • ${sizeMb} MB • <span style="color: var(--color-warning);">Upload pending submit</span>`;
    }
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const uploadedUrl = urlInput ? urlInput.value : '';
      if (uploadedUrl) {
        try {
          await API.deleteUpload(uploadedUrl);
        } catch (delErr) {
          console.warn('Certificate deletion notice:', delErr.message);
        }
      }
      if (fileInput) fileInput.value = '';
      if (urlInput) urlInput.value = '';
      if (certCard) certCard.style.display = 'none';
      if (dropzone) dropzone.style.display = 'flex';
    });
  }
}

/**
 * Display inline alert inside the auth card
 */
function showAuthAlert(type, message) {
  const alertEl = document.getElementById('auth-alert');
  if (!alertEl) return;

  alertEl.style.display = 'flex';
  alertEl.style.alignItems = 'center';
  alertEl.style.gap = '0.65rem';

  if (type === 'error') {
    alertEl.style.background = '#FEF2F2';
    alertEl.style.color = '#991B1B';
    alertEl.style.border = '1px solid #FECACA';
    alertEl.innerHTML = `<i class="fa-solid fa-circle-exclamation" style="font-size: 1.1rem; flex-shrink: 0;"></i> <span>${message}</span>`;
  } else if (type === 'success') {
    alertEl.style.background = '#F0FDF4';
    alertEl.style.color = '#166534';
    alertEl.style.border = '1px solid #BBF7D0';
    alertEl.innerHTML = `<i class="fa-solid fa-circle-check" style="font-size: 1.1rem; flex-shrink: 0;"></i> <span>${message}</span>`;
  } else {
    alertEl.style.background = '#EFF6FF';
    alertEl.style.color = '#1E40AF';
    alertEl.style.border = '1px solid #BFDBFE';
    alertEl.innerHTML = `<i class="fa-solid fa-circle-info" style="font-size: 1.1rem; flex-shrink: 0;"></i> <span>${message}</span>`;
  }
}

function clearAuthAlert() {
  const alertEl = document.getElementById('auth-alert');
  if (alertEl) alertEl.style.display = 'none';
}

/**
 * Role Tabs Switcher (Customer / Dairy Partner / Admin)
 */
function setupRoleTabs() {
  const roleButtons = document.querySelectorAll('.role-tab-btn');
  roleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeRole = btn.dataset.role;
      clearAuthAlert();
      updateUI();
    });
  });
}

/**
 * Sub-Tabs Switcher (Sign In vs Create Account)
 */
function setupSubTabs() {
  const subButtons = document.querySelectorAll('.subtab-btn');
  subButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeMode = btn.dataset.mode;
      clearAuthAlert();
      updateUI();
    });
  });
}

/**
 * Password visibility toggling (Handled globally by components.js)
 */
function setupPasswordToggle() {
  // Handled by global delegation in components.js
}

/**
 * Switch mode programmatically (e.g. from footer link)
 */
window.switchAuthMode = function(mode) {
  activeMode = mode;
  clearAuthAlert();
  updateUI();
};

/**
 * Update UI State based on Role & Mode
 */
function updateUI() {
  // 1. Set theme and active tab states
  document.body.setAttribute('data-role', activeRole);

  document.querySelectorAll('.role-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.role === activeRole);
  });

  document.querySelectorAll('.subtab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === activeMode);
  });

  // Admin cannot register publicly
  const registerSubtab = document.getElementById('subtab-register');
  if (activeRole === 'admin') {
    if (registerSubtab) registerSubtab.style.display = 'none';
    if (activeMode === 'register') activeMode = 'login';
  } else {
    if (registerSubtab) registerSubtab.style.display = 'block';
  }

  // 2. Toggle visible form fields & required attributes
  const isRegister = activeMode === 'register';

  const groupAvatar = document.getElementById('group-avatar');
  const groupName = document.getElementById('group-name');
  const groupPhone = document.getElementById('group-phone');
  const inputName = document.getElementById('input-name');
  const partnerFields = document.getElementById('partner-registration-fields');
  const dairyNameInput = document.getElementById('input-dairy-name');
  const dairyAddressInput = document.getElementById('input-dairy-address');

  if (groupAvatar) groupAvatar.style.display = isRegister ? 'block' : 'none';
  if (groupName) groupName.style.display = isRegister ? 'flex' : 'none';
  if (groupPhone) groupPhone.style.display = isRegister ? 'flex' : 'none';
  if (inputName) inputName.required = isRegister;

  const isPartnerRegister = isRegister && activeRole === 'partner';
  if (partnerFields) partnerFields.style.display = isPartnerRegister ? 'block' : 'none';
  if (dairyNameInput) dairyNameInput.required = isPartnerRegister;
  if (dairyAddressInput) dairyAddressInput.required = isPartnerRegister;

  // 3. Update footer switch text
  const switchFooter = document.getElementById('auth-switch-footer');
  if (switchFooter) {
    if (isRegister) {
      switchFooter.innerHTML = `Already have an account? <a href="javascript:void(0)" onclick="switchAuthMode('login')" style="font-weight: 700; color: var(--theme-primary, #2563EB); text-decoration: underline;">Sign In here</a>`;
    } else {
      switchFooter.innerHTML = `Don't have an account yet? <a href="javascript:void(0)" onclick="switchAuthMode('register')" style="font-weight: 700; color: var(--theme-primary, #2563EB); text-decoration: underline;">Create an account</a>`;
    }
  }

  // 4. Update submit button text
  const submitBtn = document.getElementById('btn-auth-submit');
  if (submitBtn) {
    if (isRegister) {
      const roleText = activeRole === 'partner' ? 'Dairy Partner' : 'Customer';
      submitBtn.innerHTML = `<span><i class="fa-solid fa-user-plus"></i> Create ${roleText} Account</span>`;
    } else {
      const portalName = activeRole === 'partner' ? 'Dairy Partner Portal' : 'Customer Portal';
      submitBtn.innerHTML = `<span><i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In to ${portalName}</span>`;
    }
  }

  // If partner registration is active, trigger map resize
  if (isPartnerRegister && partnerPickerMap) {
    setTimeout(() => { partnerPickerMap.invalidateSize(); }, 250);
  }
}

/**
 * Setup Partner Farm Location Picker Map
 */
function setupPartnerMap() {
  const mapContainer = document.getElementById('partner-map-picker');
  if (!mapContainer || typeof L === 'undefined') return;

  const defaultLat = 19.0760;
  const defaultLng = 72.8777;

  try {
    partnerPickerMap = L.map('partner-map-picker').setView([defaultLat, defaultLng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(partnerPickerMap);

    partnerPickerMarker = L.marker([defaultLat, defaultLng], {
      draggable: true,
      icon: (typeof MapHelper !== 'undefined' && MapHelper.createDairyIcon)
        ? MapHelper.createDairyIcon()
        : new L.Icon.Default(),
    }).addTo(partnerPickerMap);

    partnerPickerMarker.on('dragend', async (e) => {
      const { lat, lng } = e.target.getLatLng();
      setPartnerCoords(lat, lng, true);
    });

    partnerPickerMap.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (partnerPickerMarker) partnerPickerMarker.setLatLng([lat, lng]);
      setPartnerCoords(lat, lng, true);
    });
  } catch (mErr) {
    console.warn('Leaflet map initialization notice:', mErr);
  }

  // Radius slider
  const radiusSlider = document.getElementById('input-radius');
  const radiusText = document.getElementById('radius-text');
  if (radiusSlider && radiusText) {
    radiusSlider.addEventListener('input', (e) => {
      radiusText.textContent = `${e.target.value} km`;
    });
  }

  // Live GPS Detect Button
  const gpsBtn = document.getElementById('btn-detect-auth-partner-gps');
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
          if (partnerPickerMap) partnerPickerMap.setView([liveLat, liveLng], 14);
          if (partnerPickerMarker) partnerPickerMarker.setLatLng([liveLat, liveLng]);
          await setPartnerCoords(liveLat, liveLng, true);
          gpsBtn.innerHTML = '<i class="fa-solid fa-check" style="color: var(--color-success);"></i> Location Found';
          setTimeout(() => {
            gpsBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Use Live GPS Location';
            gpsBtn.disabled = false;
          }, 2000);
          if (typeof Toast !== 'undefined') Toast.success('Location Detected', 'Farm coordinates, address, and city/state/pincode have been auto-filled.');
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
}

async function setPartnerCoords(lat, lng, forceOverwrite = false) {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const latInput = document.getElementById('partner-lat');
  const lngInput = document.getElementById('partner-lng');
  if (latInput) latInput.value = latNum;
  if (lngInput) lngInput.value = lngNum;

  const badge = document.getElementById('auth-partner-coords-display');
  if (badge) {
    const latDir = latNum >= 0 ? 'N' : 'S';
    const lngDir = lngNum >= 0 ? 'E' : 'W';
    badge.textContent = `${Math.abs(latNum).toFixed(4)}° ${latDir}, ${Math.abs(lngNum).toFixed(4)}° ${lngDir}`;
  }

  if (typeof MapHelper !== 'undefined' && MapHelper.reverseGeocodeDetails) {
    const details = await MapHelper.reverseGeocodeDetails(latNum, lngNum);
    const addrInput = document.getElementById('input-dairy-address');
    const cityInput = document.getElementById('input-dairy-city');
    const stateInput = document.getElementById('input-dairy-state');
    const pinInput = document.getElementById('input-dairy-pincode');

    if (addrInput && (forceOverwrite || !addrInput.value || addrInput.value.trim().length < 5)) {
      if (details.full_address) addrInput.value = details.full_address;
    }
    if (cityInput && (forceOverwrite || !cityInput.value)) {
      if (details.city) cityInput.value = details.city;
    }
    if (stateInput && (forceOverwrite || !stateInput.value)) {
      if (details.state) stateInput.value = details.state;
    }
    if (pinInput && (forceOverwrite || !pinInput.value)) {
      if (details.pincode) pinInput.value = details.pincode;
    }
  }
}

/**
 * Handle Form Submission
 */
function setupAuthForm() {
  const form = document.getElementById('auth-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthAlert();

    const email = document.getElementById('input-email').value.trim();
    const password = document.getElementById('input-password').value;
    const isRegister = activeMode === 'register';

    // Basic client validations
    if (!email) {
      showAuthAlert('error', 'Please enter your email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showAuthAlert('error', 'Please enter a valid email address (e.g. name@example.com).');
      return;
    }

    if (!password || password.length < 4) {
      showAuthAlert('error', 'Password must be at least 4 characters long.');
      return;
    }

    const submitBtn = document.getElementById('btn-auth-submit');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="spinner"></span> Processing...';
    submitBtn.disabled = true;

    try {
      if (isRegister) {
        const fullNameInput = document.getElementById('input-name');
        const full_name = fullNameInput ? fullNameInput.value.trim() : '';
        const phoneInput = document.getElementById('input-phone');
        const phone = phoneInput ? phoneInput.value.trim() : '';
        const avatarUrl = document.getElementById('input-avatar-url')?.value.trim() || undefined;

        if (!full_name) {
          throw new Error('Please enter your full name.');
        }

        const payload = {
          email,
          password,
          full_name,
          phone,
          role: activeRole,
          avatar_url: avatarUrl,
        };

        if (activeRole === 'partner') {
          const dairyName = document.getElementById('input-dairy-name')?.value.trim();
          const address = document.getElementById('input-dairy-address')?.value.trim();
          const bannerImage = document.getElementById('input-banner-url')?.value.trim() || undefined;
          const certUrl = document.getElementById('input-cert-url')?.value.trim() || undefined;

          if (!dairyName) {
            throw new Error('Please enter your dairy farm or business name.');
          }
          if (!address) {
            throw new Error('Please enter your farm / dairy location address.');
          }

          payload.dairy_name = dairyName;
          payload.fssai_license = document.getElementById('input-fssai')?.value.trim() || 'Pending';
          payload.delivery_radius_km = document.getElementById('input-radius')?.value || 5;
          payload.address = address;
          payload.city = document.getElementById('input-dairy-city')?.value.trim() || undefined;
          payload.state = document.getElementById('input-dairy-state')?.value.trim() || undefined;
          payload.pincode = document.getElementById('input-dairy-pincode')?.value.trim() || undefined;
          payload.latitude = document.getElementById('partner-lat')?.value || '19.0760';
          payload.longitude = document.getElementById('partner-lng')?.value || '72.8777';
          if (bannerImage) payload.banner_image = bannerImage;
          if (certUrl) payload.certificate_url = certUrl;
        }

        const res = await API.post('/api/auth/register', payload);
        Auth.saveSession(res.token, res.user, res.dairy);

        showAuthAlert('success', res.message || 'Account created successfully! Redirecting...');
        if (typeof Toast !== 'undefined') Toast.success('Account Created!', res.message);
        redirectToDashboard(res.user.role);

      } else {
        const res = await API.post('/api/auth/login', {
          email,
          password,
          role: activeRole,
        });

        Auth.saveSession(res.token, res.user, res.dairy);
        showAuthAlert('success', res.message || 'Signed in successfully! Redirecting...');
        if (typeof Toast !== 'undefined') Toast.success('Welcome!', res.message);
        redirectToDashboard(res.user.role);
      }

    } catch (err) {
      console.error('Auth submit error:', err);
      showAuthAlert('error', err.message || 'Authentication failed. Please check your credentials.');
      if (typeof Toast !== 'undefined') Toast.error('Authentication Error', err.message);
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  });
}

function redirectToDashboard(role) {
  setTimeout(() => {
    if (role === 'customer') window.location.href = 'customer-dashboard.html';
    else if (role === 'partner') window.location.href = 'partner-dashboard.html';
    else if (role === 'admin') window.location.href = 'admin-dashboard.html';
    else window.location.href = 'index.html';
  }, 900);
}

/**
 * Forgot Password & Credential Reset Handlers
 */
let resetOldEmail = '';

window.openForgotPasswordModal = function () {
  const mainEmail = document.getElementById('input-email')?.value.trim() || '';
  const forgotEmailInput = document.getElementById('forgot-input-email');
  if (forgotEmailInput && mainEmail) {
    forgotEmailInput.value = mainEmail;
  }

  document.getElementById('forgot-step-1').style.display = 'block';
  document.getElementById('forgot-step-2').style.display = 'none';
  if (typeof Modal !== 'undefined') {
    Modal.open('forgot-password-modal');
  } else {
    document.getElementById('forgot-password-modal')?.classList.add('active');
  }
};

window.closeForgotPasswordModal = function () {
  if (typeof Modal !== 'undefined') {
    Modal.close('forgot-password-modal');
  } else {
    document.getElementById('forgot-password-modal')?.classList.remove('active');
  }
};

function setupForgotPasswordHandlers() {
  // 1. Send OTP Button
  const sendOtpBtn = document.getElementById('btn-forgot-send-otp');
  if (sendOtpBtn) {
    sendOtpBtn.addEventListener('click', async () => {
      const email = document.getElementById('forgot-input-email')?.value.trim();
      if (!email || !email.includes('@')) {
        if (typeof Toast !== 'undefined') Toast.warning('Invalid Email', 'Please enter your registered email address.');
        return;
      }

      const origText = sendOtpBtn.innerHTML;
      sendOtpBtn.disabled = true;
      sendOtpBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;margin-right:0.4rem;"></span> Checking...';

      try {
        const res = await API.post('/api/auth/forgot-password', { email });
        resetOldEmail = email;

        document.getElementById('forgot-confirmed-email').textContent = email;
        document.getElementById('forgot-step-1').style.display = 'none';
        document.getElementById('forgot-step-2').style.display = 'block';

        if (res.demo_otp) {
          const otpInput = document.getElementById('forgot-input-otp');
          if (otpInput) otpInput.value = res.demo_otp;
        }

        if (typeof Toast !== 'undefined') {
          Toast.success('Verification Code Sent', res.message || '6-digit code has been dispatched.');
        }
      } catch (err) {
        if (typeof Toast !== 'undefined') {
          Toast.error('Email Not Found', err.message || 'No registered account found with this email.');
        }
      } finally {
        sendOtpBtn.disabled = false;
        sendOtpBtn.innerHTML = origText;
      }
    });
  }

  // 2. Strength meter for modal new password
  const modalNewPass = document.getElementById('forgot-new-password');
  const strengthFill = document.getElementById('forgot-pass-strength-fill');
  const strengthText = document.getElementById('forgot-pass-strength-text');

  if (modalNewPass && strengthFill && strengthText) {
    modalNewPass.addEventListener('input', () => {
      const val = modalNewPass.value;
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
        strengthText.textContent = 'Strength: Weak';
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

  // 3. Reset form submit
  const resetForm = document.getElementById('form-forgot-reset');
  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const otp = document.getElementById('forgot-input-otp')?.value.trim();
      const newPass = document.getElementById('forgot-new-password')?.value;
      const confirmPass = document.getElementById('forgot-confirm-password')?.value;
      const newEmail = document.getElementById('forgot-change-email-input')?.value.trim();
      const submitBtn = document.getElementById('btn-forgot-submit-reset');

      if (!otp || otp.length < 4) {
        if (typeof Toast !== 'undefined') Toast.warning('Invalid Code', 'Please enter the verification code.');
        return;
      }

      if (!newPass || newPass.length < 6) {
        if (typeof Toast !== 'undefined') Toast.warning('Weak Password', 'New password must be at least 6 characters.');
        return;
      }

      if (newPass !== confirmPass) {
        if (typeof Toast !== 'undefined') Toast.warning('Password Mismatch', 'New password and confirmation do not match.');
        return;
      }

      const origText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;margin-right:0.4rem;"></span> Updating...';

      try {
        const res = await API.post('/api/auth/reset-credentials', {
          old_email: resetOldEmail,
          otp,
          new_password: newPass,
          new_email: newEmail || undefined,
        });

        closeForgotPasswordModal();

        // Update main login email field
        const mainEmailInput = document.getElementById('input-email');
        if (mainEmailInput) {
          mainEmailInput.value = res.email || resetOldEmail;
        }

        const mainPassInput = document.getElementById('input-password');
        if (mainPassInput) {
          mainPassInput.value = newPass;
        }

        if (typeof Toast !== 'undefined') {
          Toast.success('Password Updated!', res.message || 'Your credentials have been updated. You can now sign in.');
        }

        showAuthAlert('success', 'Password updated successfully! Click Sign In to continue.');
      } catch (err) {
        if (typeof Toast !== 'undefined') {
          Toast.error('Reset Failed', err.message);
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origText;
      }
    });
  }
}

