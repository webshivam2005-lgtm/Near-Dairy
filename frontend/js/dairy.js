/**
 * NEAR DAIRY - DAIRY STOREFRONT & SUBSCRIPTION LOGIC
 */

let dairyId = null;
let currentDairyData = null;
let selectedProduct = null;
let detectedLocation = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Extract dairy ID from URL query
  const urlParams = new URLSearchParams(window.location.search);
  dairyId = urlParams.get('id');

  if (!dairyId) {
    // If no ID passed, try to fetch first approved dairy or redirect
    try {
      const res = await API.get('/api/dairies/nearby');
      if (res.dairies && res.dairies.length > 0) {
        dairyId = res.dairies[0].id;
      }
    } catch {
      window.location.href = '/';
      return;
    }
  }

  setupSubscriptionModal();
  setupReviewModal();
  loadDairyDetails();
});

/**
 * Load Dairy Data & Products
 */
async function loadDairyDetails() {
  const loadingEl = document.getElementById('dairy-profile-loading');
  const contentEl = document.getElementById('dairy-profile-content');

  try {
    const res = await API.get(`/api/dairies/${dairyId}`);
    currentDairyData = res.dairy;

    // Populate header & meta
    document.title = `${currentDairyData.dairy_name} — Near Dairy`;
    document.getElementById('dairy-name').textContent = currentDairyData.dairy_name;
    document.getElementById('dairy-address').textContent = currentDairyData.address;
    document.getElementById('dairy-phone').textContent = currentDairyData.phone || 'Verified Direct Phone';
    document.getElementById('dairy-fssai').textContent = currentDairyData.fssai_license || 'FSSAI Verified';
    document.getElementById('dairy-description').textContent = currentDairyData.description || 'Farm-fresh pure milk.';
    document.getElementById('dairy-rating-badge').innerHTML = `<i class="fa-solid fa-star"></i> ${currentDairyData.rating || '4.9'} (${currentDairyData.rating_count || 0} reviews)`;
    document.getElementById('dairy-radius-badge').innerHTML = `<i class="fa-solid fa-route"></i> Delivers up to ${currentDairyData.delivery_radius_km || 5} km`;

    const mStart = typeof formatTime12h === 'function' ? formatTime12h(currentDairyData.morning_slot_start || '05:30') : '05:30 AM';
    const mEnd = typeof formatTime12h === 'function' ? formatTime12h(currentDairyData.morning_slot_end || '07:30') : '07:30 AM';
    const eStart = typeof formatTime12h === 'function' ? formatTime12h(currentDairyData.evening_slot_start || '17:30') : '05:30 PM';
    const eEnd = typeof formatTime12h === 'function' ? formatTime12h(currentDairyData.evening_slot_end || '19:30') : '07:30 PM';

    document.getElementById('dairy-morning-slot').textContent = `${mStart} - ${mEnd}`;
    document.getElementById('dairy-evening-slot').textContent = `${eStart} - ${eEnd}`;

    const subSlotSelect = document.getElementById('sub-slot');
    if (subSlotSelect) {
      subSlotSelect.innerHTML = `
        <option value="morning" selected>Morning (${mStart} - ${mEnd})</option>
        <option value="evening">Evening (${eStart} - ${eEnd})</option>
      `;
    }

    const bannerImg = currentDairyData.banner_image || 'https://images.unsplash.com/photo-1527153857715-3908f2ae5e81?w=800';
    const bannerImgEl = document.getElementById('dairy-banner-img');
    if (bannerImgEl) {
      bannerImgEl.src = bannerImg;
    }

    // Handle Certificate & Trust Badge
    const certBox = document.getElementById('dairy-cert-trust-box');
    const viewCertBtn = document.getElementById('btn-view-dairy-cert');
    if (currentDairyData.certificate_url) {
      if (certBox) certBox.style.display = 'block';
      if (viewCertBtn) {
        viewCertBtn.onclick = () => {
          openDairyCertViewer(currentDairyData.certificate_url, `${currentDairyData.dairy_name} — Compliance & FSSAI Certificate`);
        };
      }
    } else {
      if (certBox) certBox.style.display = 'none';
    }

    // Render Products Catalog
    renderProducts(currentDairyData.products || []);

    // Render Reviews
    renderReviews(currentDairyData.reviews || []);

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';

  } catch (error) {
    loadingEl.innerHTML = `
      <div class="card" style="padding: 2rem; color: var(--color-danger); text-align: center;">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
        <h3>Dairy Not Found</h3>
        <p class="text-muted">${error.message}</p>
        <a href="/" class="btn btn-secondary btn-sm" style="margin-top: 1rem;">Back to Directory</a>
      </div>
    `;
  }
}

/**
 * Open Certificate Inspection Viewer Modal for Customer
 */
window.openDairyCertViewer = function (certUrl, title = 'Verified Dairy Certificate & License') {
  if (!certUrl) return;

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
 * Render Product Catalog Cards (Full Image in Cards)
 */
function renderProducts(products) {
  const container = document.getElementById('dairy-products-list');
  if (!products || products.length === 0) {
    container.innerHTML = `
      <div class="empty-state card" style="grid-column: 1 / -1;">
        <div class="empty-icon"><i class="fa-solid fa-cow"></i></div>
        <h3>No Products Listed Yet</h3>
        <p class="text-muted">This dairy will publish fresh morning products shortly.</p>
      </div>
    `;
    return;
  }

  const fallbackImg = 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600';

  container.innerHTML = products.map((p) => {
    const prodImg = p.image_url || fallbackImg;
    const descText = p.description || 'Farm-fresh pure milk, chilled immediately after milking and delivered unadulterated to your doorstep.';
    const isLongDesc = descText.length > 70;

    return `
      <div class="product-item-card" id="product-card-${p.id}">
        <div class="product-img-wrapper">
          <span class="badge badge-primary product-card-badge-left">
            <i class="fa-solid fa-bottle-droplet"></i> ${escapeHtml(p.milk_type || 'Pure Milk')}
          </span>
          <span class="badge badge-success product-card-badge-right">
            <i class="fa-solid fa-shield-halved"></i> 100% Pure
          </span>
          <img src="${prodImg}"
               alt="${escapeHtml(p.name)}"
               class="product-item-img"
               loading="lazy"
               onerror="this.src='${fallbackImg}'">
        </div>

        <div class="product-item-content">
          <div>
            <div class="flex items-start justify-between gap-2" style="margin-bottom: 0.35rem;">
              <h3 class="product-title">${escapeHtml(p.name)}</h3>
              <button type="button" class="btn-product-learn" onclick="openProductDetailModal('${p.id}')" title="Learn full description & quality details">
                <i class="fa-solid fa-circle-info"></i> <span>Details</span>
              </button>
            </div>

            <p class="product-desc" id="prod-desc-${p.id}" title="Click to view full description" onclick="toggleProductDesc('${p.id}')" style="cursor: pointer;">
              ${escapeHtml(descText)}
            </p>
            ${isLongDesc ? `
              <button type="button" class="btn-toggle-desc" id="btn-toggle-${p.id}" onclick="toggleProductDesc('${p.id}')">
                <span class="toggle-label">Read More</span> <i class="fa-solid fa-chevron-down" style="font-size: 0.72rem;"></i>
              </button>
            ` : ''}

            <div class="product-specs-list">
              ${p.fat_content ? `<span class="spec-badge"><i class="fa-solid fa-droplet" style="color: #2563EB;"></i> Fat: ${p.fat_content}%</span>` : ''}
              ${p.snf_content ? `<span class="spec-badge"><i class="fa-solid fa-flask" style="color: #16A34A;"></i> SNF: ${p.snf_content}%</span>` : ''}
              <span class="spec-badge"><i class="fa-solid fa-temperature-arrow-down" style="color: #0284C7;"></i> 4°C Chilled</span>
            </div>
          </div>

          <div>
            <div class="product-pricing-box">
              <div>
                <span class="text-muted" style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; display: block;">Direct Farm Price</span>
                <span class="product-price-val">₹${p.price_per_unit}</span>
                <span class="product-unit-val">/ ${escapeHtml(p.unit || 'Litre')}</span>
              </div>
              <span class="badge" style="background: #F0FDF4; color: #166534; font-size: 0.75rem; font-weight: 700;">
                <i class="fa-solid fa-circle-check"></i> In Stock
              </span>
            </div>

            <div class="product-actions-grid">
              <button class="btn btn-secondary btn-sm" onclick="openOneTimeOrder('${p.id}')">
                <i class="fa-solid fa-bag-shopping"></i> Buy Once
              </button>
              <button class="btn btn-primary btn-sm" onclick="openSubscriptionBuilder('${p.id}')">
                <i class="fa-solid fa-calendar-check"></i> Subscribe
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Toggle Inline Product Description Expansion (Read More / Show Less)
 */
window.toggleProductDesc = function (productId) {
  const descEl = document.getElementById(`prod-desc-${productId}`);
  const btnEl = document.getElementById(`btn-toggle-${productId}`);
  if (!descEl) return;

  const isExpanded = descEl.classList.toggle('expanded');
  if (btnEl) {
    const labelSpan = btnEl.querySelector('.toggle-label');
    const icon = btnEl.querySelector('i');
    if (isExpanded) {
      if (labelSpan) labelSpan.textContent = 'Show Less';
      if (icon) icon.className = 'fa-solid fa-chevron-up';
    } else {
      if (labelSpan) labelSpan.textContent = 'Read More';
      if (icon) icon.className = 'fa-solid fa-chevron-down';
    }
  }
};

/**
 * Open Comprehensive Product Detail & Quality Modal
 */
window.openProductDetailModal = function (productId) {
  const p = (currentDairyData?.products || []).find((item) => String(item.id) === String(productId));
  if (!p) return;

  const modalTitle = document.getElementById('prod-detail-modal-title');
  const modalBody = document.getElementById('prod-detail-modal-body');
  const modalFooter = document.getElementById('prod-detail-modal-footer');
  const fallbackImg = 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600';
  const prodImg = p.image_url || fallbackImg;

  if (modalTitle) {
    modalTitle.textContent = `${p.name} — Details & Benefits`;
  }

  if (modalBody) {
    modalBody.innerHTML = `
      <div class="product-detail-hero">
        <img src="${prodImg}" alt="${escapeHtml(p.name)}" class="product-detail-img" onerror="this.src='${fallbackImg}'">
        <span class="badge badge-primary product-card-badge-left">
          <i class="fa-solid fa-bottle-droplet"></i> ${escapeHtml(p.milk_type || 'Fresh Milk')}
        </span>
        <span class="badge badge-success product-card-badge-right">
          <i class="fa-solid fa-shield-halved"></i> 100% Pure
        </span>
      </div>

      <div class="flex items-center justify-between flex-wrap gap-2" style="margin-bottom: 0.85rem;">
        <div>
          <h2 style="font-size: 1.35rem; font-weight: 800; margin-bottom: 0.2rem; color: var(--color-text);">${escapeHtml(p.name)}</h2>
          <span class="text-muted" style="font-size: 0.85rem;"><i class="fa-solid fa-cow" style="color: var(--theme-primary);"></i> Direct from ${escapeHtml(currentDairyData?.dairy_name || 'Dairy Farm')}</span>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 1.5rem; font-weight: 900; color: var(--theme-primary, #2563EB);">₹${p.price_per_unit}</span>
          <span style="font-size: 0.85rem; color: var(--color-text-muted); font-weight: 600;">/ ${escapeHtml(p.unit || 'Litre')}</span>
        </div>
      </div>

      <div style="background: #F8FAFC; border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.25rem;">
        <div class="flex items-center gap-2" style="margin-bottom: 0.5rem; font-weight: 700; color: var(--color-text); font-size: 0.95rem;">
          <i class="fa-solid fa-circle-info" style="color: var(--theme-primary);"></i>
          <span>Full Product Description</span>
        </div>
        <p style="font-size: 0.9375rem; color: var(--color-text); line-height: 1.65; white-space: pre-line; margin: 0;">
          ${escapeHtml(p.description || 'Farm-fresh pure milk, chilled immediately after milking and delivered unadulterated directly to your doorstep.')}
        </p>
      </div>

      <div class="product-detail-specs-grid">
        <div class="product-detail-spec-card">
          <div class="product-detail-spec-label"><i class="fa-solid fa-droplet" style="color: #2563EB;"></i> Fat Content</div>
          <div class="product-detail-spec-val">${p.fat_content ? `${p.fat_content}%` : 'Standard'}</div>
        </div>
        <div class="product-detail-spec-card">
          <div class="product-detail-spec-label"><i class="fa-solid fa-flask" style="color: #16A34A;"></i> SNF Content</div>
          <div class="product-detail-spec-val">${p.snf_content ? `${p.snf_content}%` : 'Standard'}</div>
        </div>
        <div class="product-detail-spec-card">
          <div class="product-detail-spec-label"><i class="fa-solid fa-temperature-arrow-down" style="color: #0284C7;"></i> Cold Chain</div>
          <div class="product-detail-spec-val">4°C Chilled</div>
        </div>
      </div>

      <div class="product-detail-benefits">
        <div style="font-weight: 700; font-size: 0.875rem; color: #166534; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.35rem;">
          <i class="fa-solid fa-shield-heart"></i> Quality & Purity Assurance
        </div>
        <ul>
          <li>100% Unadulterated fresh morning and evening milking.</li>
          <li>Direct farm chilling at 4°C preserving essential nutrients & natural taste.</li>
          <li>Zero synthetic chemicals, added starch, or preservatives.</li>
          <li>Sanitized packaging & punctual doorstep morning/evening delivery.</li>
        </ul>
      </div>
    `;
  }

  if (modalFooter) {
    modalFooter.innerHTML = `
      <button type="button" class="btn btn-secondary" onclick="Modal.close('product-detail-modal')">Close</button>
      <button type="button" class="btn btn-secondary" onclick="Modal.close('product-detail-modal'); openOneTimeOrder('${p.id}');">
        <i class="fa-solid fa-bag-shopping"></i> Buy Once (₹${p.price_per_unit})
      </button>
      <button type="button" class="btn btn-primary" onclick="Modal.close('product-detail-modal'); openSubscriptionBuilder('${p.id}');">
        <i class="fa-solid fa-calendar-check"></i> Subscribe Daily
      </button>
    `;
  }

  Modal.open('product-detail-modal');
};

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render Customer Reviews
 */
function renderReviews(reviews) {
  const summaryContainer = document.getElementById('dairy-reviews-summary');
  const container = document.getElementById('dairy-reviews-list');

  const totalReviews = reviews ? reviews.length : 0;
  let avgRating = currentDairyData?.rating ? parseFloat(currentDairyData.rating).toFixed(1) : '4.9';
  if (totalReviews > 0) {
    const sum = reviews.reduce((acc, r) => acc + (parseFloat(r.rating) || 5), 0);
    avgRating = (sum / totalReviews).toFixed(1);
  }

  // Calculate star counts
  const starCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  if (reviews && reviews.length > 0) {
    reviews.forEach(r => {
      const star = Math.min(5, Math.max(1, Math.round(r.rating || 5)));
      starCounts[star] = (starCounts[star] || 0) + 1;
    });
  }

  if (summaryContainer) {
    summaryContainer.innerHTML = `
      <div class="reviews-summary-card">
        <div class="rating-big-score-box">
          <div class="rating-big-num">${avgRating}</div>
          <div class="rating-stars-gold">
            <i class="fa-solid fa-star"></i>
            <i class="fa-solid fa-star"></i>
            <i class="fa-solid fa-star"></i>
            <i class="fa-solid fa-star"></i>
            <i class="fa-solid fa-star"></i>
          </div>
          <div class="rating-total-reviews">Based on ${totalReviews > 0 ? totalReviews : (currentDairyData?.rating_count || 1)} neighborhood review${totalReviews === 1 ? '' : 's'}</div>
          <div style="margin-top: 0.75rem;">
            <span class="review-verified-badge"><i class="fa-solid fa-circle-check"></i> 100% Verified Milk Orders</span>
          </div>
        </div>

        <div class="rating-bars-list">
          ${[5, 4, 3, 2, 1].map(stars => {
            const count = starCounts[stars] || (totalReviews === 0 && stars === 5 ? 1 : 0);
            const totalForPercent = totalReviews > 0 ? totalReviews : 1;
            const pct = Math.round((count / totalForPercent) * 100);
            return `
              <div class="rating-bar-row">
                <div class="rating-bar-label">${stars} <i class="fa-solid fa-star" style="color: #F59E0B; font-size: 0.7rem;"></i></div>
                <div class="rating-bar-track">
                  <div class="rating-bar-fill" style="width: ${pct}%;"></div>
                </div>
                <div class="rating-bar-count">${count}</div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="review-highlights-box">
          <div style="font-weight: 800; font-size: 0.875rem; color: var(--color-text); margin-bottom: 0.25rem;">Quality Guarantees</div>
          <div class="review-highlight-item"><i class="fa-solid fa-droplet" style="color:#2563EB;"></i> High Fat & Thick Cream</div>
          <div class="review-highlight-item"><i class="fa-solid fa-clock-rotate-left"></i> On-Time Morning Delivery</div>
          <div class="review-highlight-item"><i class="fa-solid fa-snowflake" style="color:#0284C7;"></i> 4°C Temperature Controlled</div>
        </div>
      </div>
    `;
  }

  if (!reviews || reviews.length === 0) {
    if (container) {
      container.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; padding: 2.5rem 1.5rem; text-align: center; border-radius: var(--radius-xl); background: #FAFBFD;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: #EFF6FF; color: var(--theme-primary, #2563EB); display: inline-flex; align-items: center; justify-content: center; font-size: 1.5rem; margin-bottom: 1rem;">
            <i class="fa-solid fa-pen-nib"></i>
          </div>
          <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 0.35rem;">No Reviews Yet</h3>
          <p class="text-muted" style="max-width: 420px; margin: 0 auto 1.25rem auto; font-size: 0.875rem;">Be the first neighborhood family to share your experience with fresh milk from ${escapeHtml(currentDairyData?.dairy_name || 'this dairy')}!</p>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('btn-open-review-modal').click()">
            <i class="fa-solid fa-star"></i> Write the First Review
          </button>
        </div>
      `;
    }
    return;
  }

  if (container) {
    container.innerHTML = reviews.map((r) => {
      const ratingNum = Math.min(5, Math.max(1, parseInt(r.rating, 10) || 5));
      const starIcons = Array.from({ length: 5 }, (_, i) =>
        i < ratingNum ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star" style="color: #CBD5E1;"></i>'
      ).join('');

      const dateStr = new Date(r.created_at || Date.now()).toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric'
      });

      const customerName = r.customer?.full_name || 'Verified Customer';
      const avatarUrl = r.customer?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(customerName)}`;

      return `
        <div class="review-card-item">
          <div>
            <div class="review-card-header">
              <div class="review-user-info">
                <img src="${avatarUrl}" class="review-customer-avatar" alt="${escapeHtml(customerName)}">
                <div class="review-user-meta">
                  <div class="review-customer-name">${escapeHtml(customerName)}</div>
                  <span class="review-verified-badge"><i class="fa-solid fa-circle-check"></i> Verified Subscriber</span>
                </div>
              </div>
              <div class="review-stars-pill">
                ${starIcons}
                <span style="margin-left: 0.15rem;">${ratingNum}.0</span>
              </div>
            </div>
            <p class="review-body-text">"${escapeHtml(r.comment)}"</p>
          </div>

          <div class="review-card-footer">
            <span><i class="fa-regular fa-clock"></i> ${dateStr}</span>
            <button type="button" class="review-helpful-btn" onclick="toggleReviewHelpful(this)">
              <i class="fa-regular fa-thumbs-up"></i> <span>Helpful</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
}

window.toggleReviewHelpful = function(btn) {
  btn.classList.toggle('liked');
  const icon = btn.querySelector('i');
  const span = btn.querySelector('span');
  if (btn.classList.contains('liked')) {
    icon.className = 'fa-solid fa-thumbs-up';
    span.textContent = 'Helpful (1)';
    Toast.success('Feedback noted', 'Thank you for your feedback!');
  } else {
    icon.className = 'fa-regular fa-thumbs-up';
    span.textContent = 'Helpful';
  }
};

/**
 * Open Subscription Builder Modal
 */
window.openSubscriptionBuilder = function (productId) {
  if (!Auth.isLoggedIn()) {
    Toast.info('Sign In Required', 'Please sign in to configure your daily milk subscription.');
    setTimeout(() => {
      window.location.href = `auth.html?redirect=${encodeURIComponent(window.location.href)}`;
    }, 1000);
    return;
  }

  selectedProduct = (currentDairyData.products || []).find((p) => p.id === productId);
  if (!selectedProduct) return;

  document.getElementById('sub-product-id').value = selectedProduct.id;
  document.getElementById('sub-dairy-id').value = currentDairyData.id;
  document.getElementById('sub-product-price').value = selectedProduct.price_per_unit;

  document.getElementById('sub-selected-product-name').textContent = selectedProduct.name;
  document.getElementById('sub-selected-product-specs').textContent = `Milk Type: ${selectedProduct.milk_type} | Fat: ${selectedProduct.fat_content || '4.2'}%`;
  document.getElementById('sub-selected-product-price').textContent = `₹${selectedProduct.price_per_unit} / ${selectedProduct.unit}`;

  // Default start date = tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('sub-start-date').value = tomorrow.toISOString().split('T')[0];

  // Pre-fill saved delivery address from customer profile if available
  const user = Auth.getUser();
  if (user) {
    const savedAddr = user.address || (user.flat_building ? `${user.flat_building}, ${user.street_area || ''}, ${user.city || ''}` : '');
    const addrInput = document.getElementById('sub-address');
    if (savedAddr && addrInput && !addrInput.value) {
      addrInput.value = savedAddr;
    }
    if (user.latitude && user.longitude) {
      detectedLocation = { latitude: parseFloat(user.latitude), longitude: parseFloat(user.longitude) };
    }
  }

  calculateSubscriptionCost();
  Modal.open('subscription-modal');
};

/**
 * Razorpay Standard Checkout Helper
 */
function launchRazorpayCheckout({ amount, description, notes, onSuccess, onCancel, onError }) {
  if (typeof Razorpay === 'undefined') {
    if (onError) onError(new Error('Razorpay Checkout script is still loading. Please try again.'));
    return;
  }

  const user = Auth.getUser();

  API.post('/api/payments/create-order', {
    amount,
    currency: 'INR',
    notes,
  }).then((orderData) => {
    if (!orderData.success || !orderData.order) {
      throw new Error(orderData.message || 'Failed to generate Razorpay order.');
    }

    const rzpOptions = {
      key: orderData.key_id,
      amount: orderData.order.amount,
      currency: orderData.order.currency || 'INR',
      name: currentDairyData?.dairy_name || 'Near Dairy',
      description: description || 'Milk Subscription & Order',
      image: currentDairyData?.banner_image || 'img/logo-icon.svg',
      order_id: orderData.order.id,
      handler: async function (response) {
        try {
          // Verify payment signature with backend
          await API.post('/api/payments/verify', {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });

          if (onSuccess) onSuccess(response);
        } catch (verErr) {
          if (onError) onError(verErr);
        }
      },
      prefill: {
        name: user?.full_name || '',
        email: user?.email || '',
        contact: user?.phone || '',
      },
      theme: {
        color: '#2563EB',
      },
      modal: {
        ondismiss: function () {
          if (onCancel) onCancel();
        },
      },
    };

    const rzp = new Razorpay(rzpOptions);
    rzp.on('payment.failed', function (resp) {
      if (onError) onError(new Error(resp.error?.description || 'Payment was declined.'));
    });
    rzp.open();

  }).catch((err) => {
    if (onError) onError(err);
  });
}

/**
 * Open One-Time Instant Order with Razorpay
 */
window.openOneTimeOrder = function (productId) {
  if (!Auth.isLoggedIn()) {
    Toast.info('Sign In Required', 'Please log in to place an order.');
    setTimeout(() => { window.location.href = `/auth.html?redirect=${encodeURIComponent(window.location.href)}`; }, 1000);
    return;
  }

  const prod = (currentDairyData.products || []).find((p) => p.id === productId);
  if (!prod) return;

  const unitPrice = parseFloat(prod.price_per_unit) || 60.0;

  Modal.confirm({
    title: `Order 1 Unit of ${prod.name}?`,
    message: `Price: ₹${unitPrice.toFixed(2)}. Complete payment via Razorpay Test Checkout to schedule next-slot doorstep dispatch.`,
    confirmText: `Pay ₹${unitPrice.toFixed(2)} via Razorpay`,
    onConfirm: async () => {
      Toast.info('Opening Razorpay...', 'Initializing secure checkout popup.');

      launchRazorpayCheckout({
        amount: unitPrice,
        description: `1x ${prod.name} (${currentDairyData.dairy_name})`,
        notes: {
          order_type: 'one_time_instant',
          product_name: prod.name,
          product_id: prod.id,
          dairy_id: currentDairyData.id,
        },
        onSuccess: async (rzpResp) => {
          try {
            const orderPayload = {
              dairy_id: currentDairyData.id,
              items: [{
                product_id: prod.id,
                name: prod.name,
                milk_type: prod.milk_type,
                quantity: 1,
                unit_price: prod.price_per_unit,
                total_price: prod.price_per_unit,
              }],
              total_amount: prod.price_per_unit,
              delivery_address: 'Home Delivery Address (Auto-Selected from Profile)',
              delivery_slot: 'morning',
              payment_status: 'paid',
              payment_id: rzpResp.razorpay_payment_id,
            };

            await API.post('/api/orders', orderPayload);
            Toast.success('Payment Verified & Order Confirmed!', 'The dairy partner has received your order.');
            setTimeout(() => { window.location.href = 'customer-dashboard.html'; }, 1500);
          } catch (err) {
            Toast.error('Order Saving Error', err.message);
          }
        },
        onCancel: () => {
          Toast.info('Checkout Closed', 'Order was not completed.');
        },
        onError: (err) => {
          Toast.error('Payment Error', err.message);
        },
      });
    }
  });
};

/**
 * Subscription Calculation & Modal Handlers
 */
function setupSubscriptionModal() {
  const qtySelect = document.getElementById('sub-quantity');
  const freqRadios = document.querySelectorAll('input[name="sub-frequency"]');
  const customDaysWrapper = document.getElementById('custom-days-wrapper');

  qtySelect.addEventListener('change', calculateSubscriptionCost);

  freqRadios.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        customDaysWrapper.style.display = 'block';
      } else {
        customDaysWrapper.style.display = 'none';
      }
      calculateSubscriptionCost();
    });
  });

  // Custom day selector buttons
  const dayButtons = document.querySelectorAll('.custom-day-btn');
  dayButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('selected');
      calculateSubscriptionCost();
    });
  });

  // Auto-detect GPS Pin button
  document.getElementById('btn-sub-detect-gps').addEventListener('click', async () => {
    const btn = document.getElementById('btn-sub-detect-gps');
    btn.innerHTML = '<span class="spinner" style="width:14px; height:14px;"></span> Pinning GPS...';
    try {
      const pos = await MapHelper.getCurrentPosition();
      detectedLocation = pos;
      const addr = await MapHelper.reverseGeocode(pos.latitude, pos.longitude);
      document.getElementById('sub-address').value = addr;
      Toast.success('GPS Pinned', 'Your exact address coordinates have been saved for the delivery boy.');
    } catch (e) {
      Toast.error('GPS Pin Error', e.message);
    } finally {
      btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use GPS Pin';
    }
  });

  // Pay & Start Subscription
  document.getElementById('btn-confirm-subscription').addEventListener('click', async () => {
    const form = document.getElementById('subscription-form');
    const address = document.getElementById('sub-address').value.trim();
    const startDate = document.getElementById('sub-start-date').value;
    const quantity = parseFloat(document.getElementById('sub-quantity').value);
    const slot = document.getElementById('sub-slot').value;
    const frequency = document.querySelector('input[name="sub-frequency"]:checked').value;

    if (!address) {
      Toast.warning('Delivery Address Required', 'Please enter your delivery flat/street address.');
      return;
    }

    if (!startDate) {
      Toast.warning('Start Date Required', 'Please pick a subscription start date.');
      return;
    }

    let customDays = [];
    if (frequency === 'custom') {
      document.querySelectorAll('.custom-day-btn.selected').forEach((b) => customDays.push(b.dataset.day));
      if (customDays.length === 0) {
        Toast.warning('Custom Days Required', 'Please select at least 1 day for delivery.');
        return;
      }
    }

    const price = parseFloat(selectedProduct.price_per_unit) || 68.0;
    const dailyCost = quantity * price;

    const btn = document.getElementById('btn-confirm-subscription');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Initializing Razorpay...';
    btn.disabled = true;

    launchRazorpayCheckout({
      amount: dailyCost,
      description: `${quantity}L ${selectedProduct.name} Daily Delivery`,
      notes: {
        subscription_type: frequency,
        product_id: selectedProduct.id,
        dairy_id: currentDairyData.id,
      },
      onSuccess: async (rzpResp) => {
        try {
          const subPayload = {
            dairy_id: currentDairyData.id,
            product_id: selectedProduct.id,
            frequency,
            custom_days: customDays.length ? customDays : null,
            quantity,
            slot,
            delivery_address: address,
            delivery_lat: detectedLocation ? detectedLocation.latitude : null,
            delivery_lng: detectedLocation ? detectedLocation.longitude : null,
            start_date: startDate,
            payment_id: rzpResp.razorpay_payment_id,
            payment_status: 'paid',
          };

          const res = await API.post('/api/subscriptions', subPayload);

          Modal.close('subscription-modal');
          Toast.success('Subscription Activated!', 'Payment verified via Razorpay. Your daily fresh milk deliveries have begun.');
          setTimeout(() => {
            window.location.href = 'customer-dashboard.html';
          }, 1500);

        } catch (err) {
          Toast.error('Subscription Error', err.message);
          btn.innerHTML = origHtml;
          btn.disabled = false;
        }
      },
      onCancel: () => {
        Toast.info('Payment Incomplete', 'Subscription was not activated.');
        btn.innerHTML = origHtml;
        btn.disabled = false;
      },
      onError: (err) => {
        Toast.error('Razorpay Error', err.message);
        btn.innerHTML = origHtml;
        btn.disabled = false;
      },
    });
  });
}

function calculateSubscriptionCost() {
  if (!selectedProduct) return;
  const qty = parseFloat(document.getElementById('sub-quantity').value) || 1.0;
  const price = parseFloat(selectedProduct.price_per_unit) || 68.0;
  const freq = document.querySelector('input[name="sub-frequency"]:checked')?.value || 'daily';

  const dailyCost = qty * price;
  let monthlyMultiplier = 30;

  if (freq === 'alternate') monthlyMultiplier = 15;
  else if (freq === 'custom') {
    const selectedDaysCount = document.querySelectorAll('.custom-day-btn.selected').length || 1;
    monthlyMultiplier = selectedDaysCount * 4.3;
  }

  const monthlyCost = dailyCost * monthlyMultiplier;

  document.getElementById('sub-daily-cost').textContent = `₹${dailyCost.toFixed(2)}`;
  document.getElementById('sub-monthly-cost').textContent = `₹${monthlyCost.toFixed(2)}`;
}

/**
 * Setup Review Modal & Interactive Rating
 */
function setupReviewModal() {
  const openBtn = document.getElementById('btn-open-review-modal');
  const ratingInput = document.getElementById('review-rating');
  const starsGroup = document.getElementById('starRatingGroup');
  const feedbackText = document.getElementById('starFeedbackText');
  const commentTextarea = document.getElementById('review-comment');
  const charCount = document.getElementById('reviewCharCount');
  const quickTagsContainer = document.getElementById('reviewQuickTags');

  const ratingFeedbackMap = {
    5: '🌟 5 Stars — Exceptional Quality & Timing',
    4: '😊 4 Stars — Very Good & Fresh',
    3: '👌 3 Stars — Average / Satisfactory',
    2: '⚠️ 2 Stars — Below Expectations',
    1: '❌ 1 Star — Poor Quality / Delayed',
  };

  function updateStarUI(val) {
    if (!starsGroup) return;
    const btns = starsGroup.querySelectorAll('.star-rating-btn');
    btns.forEach((btn) => {
      const btnVal = parseInt(btn.getAttribute('data-value'), 10);
      if (btnVal <= val) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      btn.classList.remove('hovered');
    });
    if (ratingInput) ratingInput.value = val;
    if (feedbackText) {
      feedbackText.textContent = ratingFeedbackMap[val] || `${val} Stars`;
    }
  }

  if (starsGroup) {
    const btns = starsGroup.querySelectorAll('.star-rating-btn');
    btns.forEach((btn) => {
      btn.addEventListener('mouseenter', () => {
        const hoverVal = parseInt(btn.getAttribute('data-value'), 10);
        btns.forEach((b) => {
          const bVal = parseInt(b.getAttribute('data-value'), 10);
          if (bVal <= hoverVal) {
            b.classList.add('hovered');
          } else {
            b.classList.remove('hovered');
          }
        });
      });

      btn.addEventListener('click', () => {
        const clickedVal = parseInt(btn.getAttribute('data-value'), 10);
        updateStarUI(clickedVal);
      });
    });

    starsGroup.addEventListener('mouseleave', () => {
      const currentVal = parseInt(ratingInput ? ratingInput.value : '5', 10) || 5;
      updateStarUI(currentVal);
    });
  }

  // Quick praise tags
  if (quickTagsContainer) {
    const chips = quickTagsContainer.querySelectorAll('.quick-tag-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('selected');
        const tagText = chip.getAttribute('data-tag');
        if (!commentTextarea) return;

        let currentVal = commentTextarea.value;
        if (chip.classList.contains('selected')) {
          if (currentVal.trim().length > 0) {
            commentTextarea.value = currentVal.trim() + ' • ' + tagText;
          } else {
            commentTextarea.value = tagText;
          }
        } else {
          // Remove tag
          currentVal = currentVal
            .replace(' • ' + tagText, '')
            .replace(tagText + ' • ', '')
            .replace(tagText, '')
            .trim();
          commentTextarea.value = currentVal;
        }

        if (charCount) {
          charCount.textContent = `${commentTextarea.value.length} / 500`;
        }
      });
    });
  }

  if (commentTextarea && charCount) {
    commentTextarea.addEventListener('input', () => {
      charCount.textContent = `${commentTextarea.value.length} / 500`;
    });
  }

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      if (!Auth.isLoggedIn()) {
        Toast.info('Sign In Required', 'Please log in to submit a rating.');
        setTimeout(() => {
          window.location.href = `auth.html?redirect=${encodeURIComponent(window.location.href)}`;
        }, 1000);
        return;
      }

      // Populate dairy name in modal header
      const modalDairyName = document.getElementById('review-modal-dairy-name');
      if (modalDairyName && currentDairyData) {
        modalDairyName.textContent = currentDairyData.dairy_name || 'Local Dairy Farm';
      }

      // Reset fields
      updateStarUI(5);
      if (commentTextarea) commentTextarea.value = '';
      if (charCount) charCount.textContent = '0 / 500';
      if (quickTagsContainer) {
        quickTagsContainer.querySelectorAll('.quick-tag-chip').forEach(c => c.classList.remove('selected'));
      }

      Modal.open('review-modal');
    });
  }

  const submitBtn = document.getElementById('btn-submit-review');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const rating = parseInt(document.getElementById('review-rating').value, 10) || 5;
      const comment = (document.getElementById('review-comment')?.value || '').trim();

      if (!comment) {
        Toast.warning('Feedback required', 'Please share a brief comment or pick from quick praise highlights.');
        return;
      }

      const origText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-sm" style="display:inline-block; margin-right:0.5rem;"></span> Submitting...';

      try {
        await API.post('/api/reviews', {
          dairy_id: dairyId,
          rating,
          comment,
        });

        Modal.close('review-modal');
        Toast.success('Review Published!', 'Thank you for supporting your local dairy.');
        await loadDairyDetails();
      } catch (err) {
        Toast.error('Review Error', err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origText;
      }
    });
  }
}
