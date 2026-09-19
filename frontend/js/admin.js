/**
 * NEAR DAIRY - ADMIN CONTROL CENTER SCRIPT
 */

document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireAuth(['admin'])) return;

  setupHeader();
  setupTabs();
  initHelpdesk();
  loadAdminStats();
  loadPendingVetting();
  loadAllDairies();
  loadAllUsers();
  loadDisputes();
  loadFinancials();
  setupAdminSettingsTab();
  setupAdminExportsTab();

  document.getElementById('btn-refresh-admin')?.addEventListener('click', () => {
    loadAdminStats();
    loadPendingVetting();
    loadAllDairies();
    loadAllUsers();
    loadDisputes();
    loadFinancials();
    Toast.success('Refreshed', 'Admin metrics updated.');
  });

  document.getElementById('btn-refresh-financials')?.addEventListener('click', () => {
    loadFinancials();
    Toast.success('Refreshed', 'Financial settlements updated.');
  });
});

function setupHeader() {
  const user = Auth.getUser();
  if (user) {
    document.getElementById('sidebar-user-name').textContent = user.full_name;
    document.getElementById('sidebar-user-avatar').src =
      user.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.full_name)}`;
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
        overview: 'Platform Overview & Metrics',
        vetting: 'Partner Verification Queue',
        dairies: 'Dairies Directory & Fee Rules',
        users: 'User Accounts Directory',
        disputes: 'Support & Helpdesk Communication Center',
        financials: 'Platform Fees & Partner Settlements',
        exports: 'Enterprise Data Exports & CSV Analytics',
        settings: 'Admin & Platform Settings',
      };
      const titleEl = document.getElementById('topbar-title');
      if (titleEl) titleEl.textContent = titles[target] || 'Admin Control Center';

      if (target === 'disputes') {
        loadDisputes();
      } else if (target === 'financials') {
        loadFinancials();
      }
    });
  });
}

/**
 * Load Overview Stats
 */
async function loadAdminStats() {
  try {
    const res = await API.get('/api/admin/stats');
    const s = res.stats;

    document.getElementById('stat-approved-dairies').textContent = s.approved_dairies;
    document.getElementById('stat-pending-dairies').textContent = s.pending_dairies;
    document.getElementById('stat-subscribers').textContent = s.active_subscribers;
    document.getElementById('stat-litres').textContent = `${s.estimated_daily_litres} L`;
    document.getElementById('badge-pending-count').textContent = s.pending_dairies;
    document.getElementById('btn-quick-pending-count').textContent = s.pending_dairies;

    // Financial Metrics
    const platformFeesEl = document.getElementById('stat-platform-fees');
    if (platformFeesEl) {
      platformFeesEl.textContent = `₹${(s.total_platform_fees || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    }
    const grossEl = document.getElementById('stat-subscription-gross');
    if (grossEl) {
      grossEl.textContent = `₹${(s.total_subscription_gross || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    }

  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

/**
 * Load Financials & Platform Fee Settlements
 */
async function loadFinancials() {
  const tbody = document.getElementById('all-financials-tbody');
  if (!tbody) return;

  try {
    const res = await API.get('/api/admin/financials');
    const summary = res.summary || {};
    const subs = res.subscriptions || [];

    document.getElementById('fin-active-subs').textContent = summary.total_active_subscriptions || 0;
    document.getElementById('fin-total-platform-fees').textContent = `₹${(summary.total_platform_fees_earned || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('fin-monthly-gross').textContent = `₹${(summary.total_monthly_gross || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('fin-partner-payouts').textContent = `₹${(summary.total_partner_net_payout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    if (subs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2.5rem;" class="text-muted">No subscriptions or platform fee records yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = subs.map((s) => {
      const isDaily = s.frequency === 'daily';
      const monthlyDays = isDaily ? 30 : (s.frequency === 'alternate' ? 15 : (s.custom_days?.length || 4) * 4.3);
      const monthlyLitres = parseFloat(s.monthly_volume_litres) || ((parseFloat(s.quantity) || 1.0) * monthlyDays);
      const unitPrice = parseFloat(s.product?.price_per_unit) || 65.0;
      const grossVal = parseFloat(s.monthly_gross_amount) || (monthlyLitres * unitPrice);
      const feeVal = parseFloat(s.platform_fee) || (s.dairy?.platform_fee_per_sub || 50.0);
      const netVal = parseFloat(s.partner_net_amount) || Math.max(0, grossVal - feeVal);

      return `
        <tr>
          <td>
            <div style="font-weight: 700;">${s.dairy?.dairy_name || 'Dairy Partner'}</div>
            <div class="text-muted" style="font-size: 0.75rem;"><i class="fa-solid fa-phone"></i> ${s.dairy?.owner?.phone || 'Partner'}</div>
          </td>
          <td>
            <div style="font-weight: 600;">${s.customer?.full_name || 'Customer'}</div>
            <div class="text-muted" style="font-size: 0.75rem;">${s.customer?.phone || ''}</div>
          </td>
          <td>
            <div style="font-weight: 700;">${s.product?.name || 'Milk Variant'}</div>
            <div class="text-muted" style="font-size: 0.75rem;">₹${unitPrice} / L</div>
          </td>
          <td>
            <strong>${s.quantity} L</strong> (${s.frequency.toUpperCase()})
            <div><span class="badge badge-primary" style="font-size: 0.7rem;">${s.slot.toUpperCase()}</span></div>
          </td>
          <td>
            <strong style="color: var(--color-text);">₹${grossVal.toFixed(2)}</strong>
          </td>
          <td>
            <span class="badge" style="background: #FAF5FF; color: #7C3AED; font-weight: 700;">
              ₹${feeVal.toFixed(2)}
            </span>
          </td>
          <td>
            <strong style="color: #16A34A; font-size: 0.9375rem;">₹${netVal.toFixed(2)}</strong>
          </td>
          <td>
            <span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-warning'}">
              ${s.status.toUpperCase()}
            </span>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="color: var(--color-danger); text-align: center;">Error loading financials: ${err.message}</td></tr>`;
  }
}

/**
 * Load Pending Vetting Queue
 */
async function loadPendingVetting() {
  const container = document.getElementById('vetting-queue-container');
  try {
    const res = await API.get('/api/admin/pending-dairies');
    const pending = res.pending || [];

    document.getElementById('badge-pending-count').textContent = pending.length;
    document.getElementById('btn-quick-pending-count').textContent = pending.length;

    if (pending.length === 0) {
      container.innerHTML = `
        <div class="card" style="padding: 3rem; text-align: center;">
          <div style="font-size: 2.5rem; color: var(--color-success); margin-bottom: 0.5rem;"><i class="fa-solid fa-circle-check"></i></div>
          <h3 style="font-size: 1.25rem;">All Partner Applications Processed</h3>
          <p class="text-muted">There are no pending partner registrations in the queue.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = pending.map((d) => {
      const bannerImg = d.banner_image || 'https://images.unsplash.com/photo-1527153857715-3908f2ae5e81?w=800';
      const ownerAvatar = d.owner?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(d.owner?.full_name || 'Partner')}`;
      const certUrl = d.certificate_url;

      return `
        <div class="card" style="padding: 1.75rem; border-left: 4px solid var(--color-warning); margin-bottom: 1.5rem;">
          <div class="flex items-start justify-between" style="gap: 1.5rem; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 300px;">
              <div class="flex items-center gap-3" style="margin-bottom: 0.75rem;">
                <img src="${bannerImg}" style="width: 52px; height: 52px; border-radius: var(--radius-md); object-fit: cover;" alt="Banner">
                <div>
                  <h3 style="font-size: 1.25rem;">${d.dairy_name}</h3>
                  <div class="text-muted" style="font-size: 0.8125rem;">
                    <i class="fa-solid fa-location-dot"></i> ${d.address} (${d.city || 'Mumbai'})
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4" style="background: var(--theme-bg); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
                <div>
                  <span class="text-muted" style="font-size: 0.75rem;">Owner Profile</span>
                  <div style="font-weight: 700; font-size: 0.875rem;">${d.owner?.full_name || 'Partner'}</div>
                  <div class="text-muted" style="font-size: 0.75rem;">${d.phone || d.owner?.email}</div>
                </div>
                <div>
                  <span class="text-muted" style="font-size: 0.75rem;">FSSAI License</span>
                  <div style="font-weight: 700; font-size: 0.875rem;">${d.fssai_license || 'Not Provided'}</div>
                  <div class="text-muted" style="font-size: 0.75rem;">Radius: ${d.delivery_radius_km || 5} km</div>
                </div>
              </div>

              <div class="flex items-center gap-3">
                ${certUrl ? `
                  <button type="button" class="btn btn-secondary btn-sm" onclick="openAdminCertViewer('${certUrl}', '${d.dairy_name}')">
                    <i class="fa-solid fa-file-shield" style="color: var(--color-primary);"></i> Audit Certificate
                  </button>
                ` : `
                  <span class="badge badge-warning"><i class="fa-solid fa-triangle-exclamation"></i> No Certificate Uploaded</span>
                `}
              </div>
            </div>

            <div class="flex items-center gap-2" style="align-self: center;">
              <button class="btn btn-secondary btn-sm" style="color: var(--color-danger);" onclick="rejectDairy('${d.id}')">
                <i class="fa-solid fa-xmark"></i> Reject
              </button>
              <button class="btn btn-primary btn-sm" onclick="approveDairy('${d.id}')">
                <i class="fa-solid fa-check"></i> Approve & Launch Live
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    container.innerHTML = `<div class="card" style="color: var(--color-danger); padding: 1.5rem;">Error loading queue: ${err.message}</div>`;
  }
}

/**
 * Open Certificate Inspection Viewer Modal
 */
window.openAdminCertViewer = function (certUrl, dairyName = 'Partner Application') {
  if (!certUrl) return;

  const container = document.getElementById('cert-viewer-frame-container');
  const titleEl = document.getElementById('cert-modal-title');
  const downloadBtn = document.getElementById('btn-cert-download');

  if (titleEl) titleEl.textContent = `Certificate Inspection — ${dairyName}`;
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

window.approveDairy = async function (dairyId) {
  try {
    const res = await API.patch(`/api/admin/dairies/${dairyId}/approve`);
    Toast.success('Approved!', res.message);
    loadPendingVetting();
    loadAdminStats();
    loadAllDairies();
  } catch (err) {
    Toast.error('Approval Error', err.message);
  }
};

window.rejectDairy = function (dairyId) {
  Modal.confirm({
    title: 'Reject Dairy Application?',
    message: 'This will prevent the dairy from going live on Near Dairy.',
    confirmText: 'Yes, Reject',
    onConfirm: async () => {
      try {
        await API.patch(`/api/admin/dairies/${dairyId}/reject`);
        Toast.info('Rejected', 'Dairy application rejected.');
        loadPendingVetting();
        loadAdminStats();
      } catch (err) {
        Toast.error('Rejection Error', err.message);
      }
    }
  });
};

/**
 * Load All Dairies Directory
 */
async function loadAllDairies() {
  const tbody = document.getElementById('all-dairies-tbody');
  try {
    const res = await API.get('/api/admin/all-dairies');
    const dairies = res.dairies || [];

    tbody.innerHTML = dairies.map((d) => {
      const isApproved = d.is_approved;
      const isActive = d.is_active;
      const certUrl = d.certificate_url;
      const platformFee = d.platform_fee_per_sub || 50.00;

      return `
        <tr>
          <td>
            <div class="dairy-table-item">
              <img src="${d.banner_image || 'https://images.unsplash.com/photo-1527153857715-3908f2ae5e81?w=800'}" class="dairy-table-thumb" alt="${escapeHtml(d.dairy_name)}">
              <div class="dairy-table-meta">
                <div class="dairy-table-name">${escapeHtml(d.dairy_name)}</div>
                <div class="dairy-table-address">
                  <i class="fa-solid fa-location-dot" style="color: var(--color-danger); font-size: 0.72rem; margin-top: 2px; flex-shrink: 0;"></i>
                  <span>${escapeHtml(d.address || 'Address not registered')}</span>
                </div>
              </div>
            </div>
          </td>
          <td>
            <div class="dairy-table-owner">
              <div class="dairy-owner-name"><i class="fa-solid fa-user-tie" style="color: #64748B; font-size: 0.75rem;"></i> ${escapeHtml(d.owner?.full_name || 'Owner')}</div>
              <div class="dairy-owner-contact"><i class="fa-solid fa-phone" style="color: #16A34A; font-size: 0.72rem;"></i> ${escapeHtml(d.phone || d.email || 'N/A')}</div>
            </div>
          </td>
          <td>
            <div class="flex items-center gap-2">
              <code style="font-family: monospace; font-size: 0.8125rem; background: #F1F5F9; padding: 0.2rem 0.45rem; border-radius: 4px; border: 1px solid #E2E8F0; color: #334155; font-weight: 600;">${escapeHtml(d.fssai_license || 'N/A')}</code>
              ${certUrl ? `
                <button type="button" class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.45rem; font-size: 0.75rem; white-space: nowrap;" onclick="openAdminCertViewer('${certUrl}', '${escapeHtml(d.dairy_name)}')" title="View FSSAI Certificate">
                  <i class="fa-solid fa-file-shield" style="color: #7C3AED;"></i> View
                </button>
              ` : ''}
            </div>
          </td>
          <td><strong style="white-space: nowrap;">${d.delivery_radius_km || 5} km</strong></td>
          <td>
            <button class="btn btn-secondary btn-sm" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; white-space: nowrap;" onclick="editPlatformFee('${d.id}', ${platformFee}, '${escapeHtml(d.dairy_name)}')">
              <i class="fa-solid fa-coins" style="color: #7C3AED;"></i> ₹${parseFloat(platformFee).toFixed(2)}/sub
            </button>
          </td>
          <td>
            <span class="badge ${isApproved ? 'badge-success' : 'badge-warning'}" style="white-space: nowrap;">
              ${isApproved ? '✓ Approved' : '⏳ Pending'}
            </span>
          </td>
          <td>
            <span class="badge ${isActive ? 'badge-success' : 'badge-danger'}" style="white-space: nowrap;">
              ${isActive ? 'Active' : 'Suspended'}
            </span>
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="toggleDairyActive('${d.id}', ${!isActive})" style="white-space: nowrap;">
              ${isActive ? '<i class="fa-solid fa-pause"></i> Suspend' : '<i class="fa-solid fa-play"></i> Activate'}
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="color: var(--color-danger); text-align: center;">Error: ${err.message}</td></tr>`;
  }
}

window.editPlatformFee = function(dairyId, currentFee, dairyName) {
  const newFee = prompt(`Set Platform Fee (in ₹) per subscription for "${dairyName}":`, currentFee);
  if (newFee === null) return;
  const numFee = parseFloat(newFee);
  if (isNaN(numFee) || numFee < 0) {
    Toast.error('Invalid Fee', 'Please enter a valid positive number.');
    return;
  }

  API.patch(`/api/admin/dairies/${dairyId}/platform-fee`, { platform_fee_per_sub: numFee })
    .then((res) => {
      Toast.success('Platform Fee Updated', res.message);
      loadAllDairies();
      loadAdminStats();
      loadFinancials();
    })
    .catch((err) => {
      Toast.error('Update Failed', err.message);
    });
};

window.toggleDairyActive = async function (dairyId, newStatus) {
  try {
    const res = await API.patch(`/api/admin/dairies/${dairyId}/toggle-active`, { is_active: newStatus });
    Toast.success('Status Updated', res.message);
    loadAllDairies();
    loadAdminStats();
  } catch (err) {
    Toast.error('Toggle Error', err.message);
  }
};

/**
 * Load Users
 */
async function loadAllUsers() {
  const tbody = document.getElementById('all-users-tbody');
  try {
    const res = await API.get('/api/admin/all-users');
    const users = res.users || [];

    tbody.innerHTML = users.map((u) => {
      let roleBadge = '<span class="badge badge-gray">Customer</span>';
      if (u.role === 'partner') roleBadge = '<span class="badge badge-primary">Dairy Partner</span>';
      if (u.role === 'admin') roleBadge = '<span class="badge badge-success">Admin</span>';

      return `
        <tr>
          <td>
            <div class="flex items-center gap-2">
              <img src="${u.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.full_name || 'User')}`}"
                   style="width: 32px; height: 32px; border-radius: 50%;" alt="Avatar">
              <span style="font-weight: 600;">${u.full_name || 'Anonymous User'}</span>
            </div>
          </td>
          <td>${u.email}</td>
          <td>${u.phone || '—'}</td>
          <td>${roleBadge}</td>
          <td>${new Date(u.created_at || Date.now()).toLocaleDateString('en-IN')}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color: var(--color-danger); text-align: center;">Error: ${err.message}</td></tr>`;
  }
}

/**
 * =========================================================================
 * NEAR DAIRY - SUPPORT & LIVE HELPDESK ENGINE
 * =========================================================================
 */

let adminTickets = [];
let selectedTicketId = null;
let helpdeskFilter = 'all';
let helpdeskSearchQuery = '';
let helpdeskPollTimer = null;
let adminContactsCache = null;
let adminChatAttachment = null;

/**
 * Initialize Helpdesk Listeners & State
 */
function initHelpdesk() {
  // 1. Filter Pills
  const filterPills = document.querySelectorAll('.filter-pill-btn[data-filter]');
  filterPills.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterPills.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      helpdeskFilter = btn.dataset.filter || 'all';
      renderTicketList();
    });
  });

  // 2. Search Input
  const searchInput = document.getElementById('helpdesk-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      helpdeskSearchQuery = e.target.value.toLowerCase().trim();
      renderTicketList();
    });
  }

  // 3. Refresh Feed Button
  document.getElementById('btn-refresh-helpdesk')?.addEventListener('click', () => {
    loadHelpdeskTickets(false);
    Toast.success('Refreshed', 'Support ticket queue updated.');
  });

  // 4. Start New Ticket / Direct Message Modal
  const openNewTicketBtn = document.getElementById('btn-admin-open-new-ticket');
  if (openNewTicketBtn) {
    openNewTicketBtn.addEventListener('click', async () => {
      await loadAdminContactsForModal();
      Modal.open('modal-admin-new-ticket');
    });
  }

  // Recipient Type Change in Modal
  const recipientTypeSelect = document.getElementById('admin-new-recipient-type');
  if (recipientTypeSelect) {
    recipientTypeSelect.addEventListener('change', () => {
      populateRecipientUsersSelect(recipientTypeSelect.value);
    });
  }

  // Start Ticket Form Submission
  const startTicketForm = document.getElementById('form-admin-start-ticket');
  if (startTicketForm) {
    startTicketForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userSelect = document.getElementById('admin-new-recipient-user');
      const selectedOption = userSelect.options[userSelect.selectedIndex];
      const target_user_id = userSelect.value;
      const target_user_role = selectedOption?.dataset?.role || 'partner';
      const target_user_name = selectedOption?.dataset?.name || selectedOption.textContent;
      const dairy_id = selectedOption?.dataset?.dairyId || null;

      const category = document.getElementById('admin-new-category').value;
      const priority = document.getElementById('admin-new-priority').value;
      const subject = document.getElementById('admin-new-subject').value.trim();
      const message = document.getElementById('admin-new-message').value.trim();
      const submitBtn = document.getElementById('btn-admin-submit-new-ticket');

      if (!target_user_id) {
        Toast.warning('Select User', 'Please select a recipient customer or dairy partner.');
        return;
      }
      if (!subject || !message) {
        Toast.warning('Missing Fields', 'Please provide subject and message.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-sm" style="display:inline-block; margin-right:0.4rem;"></span> Opening Ticket...';

      try {
        const payload = {
          subject,
          category,
          priority,
          message,
          target_user_id,
          target_user_role,
          target_user_name,
          dairy_id,
        };

        const res = await API.post('/api/support/tickets', payload);
        Toast.success('Conversation Started!', `Ticket #${res.ticket.ticket_number} created with ${target_user_name}.`);
        Modal.close('modal-admin-new-ticket');
        startTicketForm.reset();

        await loadHelpdeskTickets(false);
        if (res.ticket?.id) {
          openTicketChat(res.ticket.id);
        }
      } catch (err) {
        Toast.error('Failed to Create Ticket', err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send & Open Ticket';
      }
    });
  }

  // 5. Chat Composer Form
  const chatForm = document.getElementById('form-admin-chat-composer');
  const chatInput = document.getElementById('admin-chat-input');
  if (chatForm && chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    });

    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!selectedTicketId) return;

      const messageText = chatInput.value.trim();
      if (!messageText && !adminChatAttachment) {
        return;
      }

      const sendBtn = document.getElementById('btn-admin-send-msg');
      sendBtn.disabled = true;

      try {
        let attachmentUrl = null;
        if (adminChatAttachment && adminChatAttachment.file) {
          const formData = new FormData();
          formData.append('file', adminChatAttachment.file);
          formData.append('type', 'general');

          const uploadRes = await API.postForm('/api/upload/general', formData);
          attachmentUrl = uploadRes.url;
        } else if (adminChatAttachment && adminChatAttachment.url) {
          attachmentUrl = adminChatAttachment.url;
        }

        const res = await API.post(`/api/support/tickets/${selectedTicketId}/messages`, {
          message: messageText,
          attachment_url: attachmentUrl,
        });

        chatInput.value = '';
        clearAdminAttachment();
        await openTicketChat(selectedTicketId, true, true);
        loadHelpdeskTickets(false);
      } catch (err) {
        Toast.error('Send Error', err.message);
      } finally {
        sendBtn.disabled = false;
        chatInput.focus();
      }
    });
  }

  // File upload trigger in chat composer
  const fileInput = document.getElementById('admin-chat-file-input');
  const chooseFileBtn = document.getElementById('btn-admin-choose-file');
  if (chooseFileBtn && fileInput) {
    chooseFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        adminChatAttachment = { file, name: file.name };
        showAdminAttachmentPreview(file.name);
      }
    });
  }

  document.getElementById('btn-admin-remove-attachment')?.addEventListener('click', () => {
    clearAdminAttachment();
  });

  // 6. Canned Responses Chips
  document.querySelectorAll('.canned-chip[data-text]').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (!chatInput) return;
      chatInput.value = chip.dataset.text;
      chatInput.focus();
    });
  });

  // 7. Resolve Ticket Actions
  document.getElementById('btn-chat-resolve')?.addEventListener('click', () => {
    if (!selectedTicketId) return;
    const currentTicket = adminTickets.find((t) => t.id === selectedTicketId);
    if (!currentTicket) return;

    document.getElementById('resolve-ticket-id').value = selectedTicketId;
    document.getElementById('resolve-modal-ticket-num').textContent = `#${currentTicket.ticket_number} • ${currentTicket.subject}`;
    document.getElementById('resolve-notes-text').value = '';
    document.getElementById('resolve-status-select').value = 'resolved';
    Modal.open('modal-admin-resolve-ticket');
  });

  document.getElementById('btn-chat-change-status')?.addEventListener('click', () => {
    if (!selectedTicketId) return;
    const currentTicket = adminTickets.find((t) => t.id === selectedTicketId);
    if (!currentTicket) return;

    document.getElementById('resolve-ticket-id').value = selectedTicketId;
    document.getElementById('resolve-modal-ticket-num').textContent = `#${currentTicket.ticket_number} • ${currentTicket.subject}`;
    document.getElementById('resolve-notes-text').value = '';
    document.getElementById('resolve-status-select').value = currentTicket.status || 'in_progress';
    Modal.open('modal-admin-resolve-ticket');
  });

  // Resolve Ticket Form Submit
  const resolveForm = document.getElementById('form-admin-resolve-ticket');
  if (resolveForm) {
    resolveForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ticketId = document.getElementById('resolve-ticket-id').value;
      const status = document.getElementById('resolve-status-select').value;
      const resolution_notes = document.getElementById('resolve-notes-text').value.trim();
      const btn = document.getElementById('btn-submit-resolve-notes');

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-sm" style="display:inline-block; margin-right:0.4rem;"></span> Updating...';

      try {
        await API.patch(`/api/support/${ticketId}/status`, {
          status,
          resolution_notes,
        });

        Toast.success('Ticket Updated', `Ticket status set to ${status.toUpperCase()}.`);
        Modal.close('modal-admin-resolve-ticket');
        await openTicketChat(ticketId, true);
        await loadHelpdeskTickets(false);
      } catch (err) {
        Toast.error('Update Failed', err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm Resolution';
      }
    });
  }

  // Copy Contact Info button
  document.getElementById('btn-chat-copy-info')?.addEventListener('click', () => {
    if (!selectedTicketId) return;
    const t = adminTickets.find((item) => item.id === selectedTicketId);
    if (!t) return;

    const textToCopy = `User: ${t.user_name}\nRole: ${t.user_role}\nEmail: ${t.user_email || 'N/A'}\nPhone: ${t.user_phone || 'N/A'}\nTicket: #${t.ticket_number} (${t.subject})`;
    navigator.clipboard.writeText(textToCopy)
      .then(() => Toast.success('Copied!', 'User contact info copied to clipboard.'))
      .catch(() => Toast.info('Contact Info', `${t.user_name} (${t.user_phone || t.user_email})`));
  });

  // Start polling for background updates
  startHelpdeskPolling();
}

function showAdminAttachmentPreview(name) {
  const previewBox = document.getElementById('admin-attachment-preview');
  const nameEl = document.getElementById('admin-attachment-name');
  if (previewBox && nameEl) {
    nameEl.textContent = name;
    previewBox.style.display = 'flex';
  }
}

function clearAdminAttachment() {
  adminChatAttachment = null;
  const previewBox = document.getElementById('admin-attachment-preview');
  const fileInput = document.getElementById('admin-chat-file-input');
  if (previewBox) previewBox.style.display = 'none';
  if (fileInput) fileInput.value = '';
}

/**
 * Load Contacts for Start Direct Message Modal
 */
async function loadAdminContactsForModal() {
  const select = document.getElementById('admin-new-recipient-user');
  if (!select) return;

  if (!adminContactsCache) {
    select.innerHTML = '<option value="">Loading contacts...</option>';
    try {
      const res = await API.get('/api/support/contacts');
      adminContactsCache = res;
    } catch (err) {
      select.innerHTML = `<option value="">Failed to load contacts: ${err.message}</option>`;
      return;
    }
  }

  const recType = document.getElementById('admin-new-recipient-type')?.value || 'partner';
  populateRecipientUsersSelect(recType);
}

function populateRecipientUsersSelect(type) {
  const select = document.getElementById('admin-new-recipient-user');
  if (!select || !adminContactsCache) return;

  if (type === 'partner') {
    const partners = adminContactsCache.partners || [];
    if (partners.length === 0) {
      select.innerHTML = '<option value="">No dairy partners found</option>';
      return;
    }
    select.innerHTML = partners.map((p) => `
      <option value="${p.id}" data-role="partner" data-name="${p.full_name}" data-dairy-id="${p.dairy_id || ''}">
        🥛 ${p.business_name || p.dairy_name || 'Dairy Partner'} — ${p.full_name} (${p.phone || p.email})
      </option>
    `).join('');
  } else {
    const customers = adminContactsCache.customers || [];
    if (customers.length === 0) {
      select.innerHTML = '<option value="">No customers found</option>';
      return;
    }
    select.innerHTML = customers.map((c) => `
      <option value="${c.id}" data-role="customer" data-name="${c.full_name}">
        👥 ${c.full_name} (${c.phone || c.email}) — ${c.city || 'India'}
      </option>
    `).join('');
  }
}

/**
 * Load All Support Tickets & Update Metrics
 */
async function loadDisputes() {
  await loadHelpdeskTickets(false);
}

async function loadHelpdeskTickets(selectFirstIfNone = false) {
  const container = document.getElementById('helpdesk-ticket-list');
  if (!container) return;

  try {
    const res = await API.get('/api/support/tickets');
    adminTickets = res.tickets || [];

    // Calculate metrics
    const custOpen = adminTickets.filter((t) => t.user_role === 'customer' && t.status !== 'resolved' && t.status !== 'closed').length;
    const partnerOpen = adminTickets.filter((t) => t.user_role === 'partner' && t.status !== 'resolved' && t.status !== 'closed').length;
    const urgentCount = adminTickets.filter((t) => ['urgent', 'high'].includes(t.priority) && t.status !== 'resolved' && t.status !== 'closed').length;
    const resolvedCount = adminTickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;

    const totalOpen = custOpen + partnerOpen;

    // Sidebar & metrics cards
    const badge = document.getElementById('badge-disputes-count');
    if (badge) badge.textContent = totalOpen;

    const custEl = document.getElementById('stat-helpdesk-cust-open');
    if (custEl) custEl.textContent = custOpen;

    const partnerEl = document.getElementById('stat-helpdesk-partner-open');
    if (partnerEl) partnerEl.textContent = partnerOpen;

    const urgentEl = document.getElementById('stat-helpdesk-urgent');
    if (urgentEl) urgentEl.textContent = urgentCount;

    const resolvedEl = document.getElementById('stat-helpdesk-resolved');
    if (resolvedEl) resolvedEl.textContent = resolvedCount;

    // Filter pill counters
    const pillAll = document.getElementById('count-pill-all');
    if (pillAll) pillAll.textContent = adminTickets.length;

    const pillCust = document.getElementById('count-pill-cust');
    if (pillCust) pillCust.textContent = adminTickets.filter((t) => t.user_role === 'customer').length;

    const pillPartner = document.getElementById('count-pill-partner');
    if (pillPartner) pillPartner.textContent = adminTickets.filter((t) => t.user_role === 'partner').length;

    const pillUrgent = document.getElementById('count-pill-urgent');
    if (pillUrgent) pillUrgent.textContent = urgentCount;

    renderTicketList();

    // Auto-select first ticket if requested or if single ticket exists
    if (!selectedTicketId && selectFirstIfNone && adminTickets.length > 0) {
      openTicketChat(adminTickets[0].id);
    }
  } catch (err) {
    if (container) {
      container.innerHTML = `<div class="text-center" style="padding:2rem; color:var(--color-danger);">Error loading tickets: ${err.message}</div>`;
    }
  }
}

let lastRenderedTicketSignature = '';
let adminRenderedMsgIds = [];
let adminRenderedTicketId = null;

function isScrolledNearBottom(container, threshold = 90) {
  if (!container) return true;
  return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
}

/**
 * Render Ticket Cards into Left Queue List (Smart Non-Destructive Update)
 */
function renderTicketList() {
  const container = document.getElementById('helpdesk-ticket-list');
  if (!container) return;

  // Filter
  let filtered = adminTickets;
  if (helpdeskFilter === 'customer') {
    filtered = filtered.filter((t) => t.user_role === 'customer');
  } else if (helpdeskFilter === 'partner') {
    filtered = filtered.filter((t) => t.user_role === 'partner');
  } else if (helpdeskFilter === 'urgent') {
    filtered = filtered.filter((t) => ['urgent', 'high'].includes(t.priority) && t.status !== 'resolved' && t.status !== 'closed');
  } else if (helpdeskFilter === 'resolved') {
    filtered = filtered.filter((t) => t.status === 'resolved' || t.status === 'closed');
  }

  // Search
  if (helpdeskSearchQuery) {
    const q = helpdeskSearchQuery;
    filtered = filtered.filter((t) => {
      return (
        (t.ticket_number || '').toLowerCase().includes(q) ||
        (t.subject || '').toLowerCase().includes(q) ||
        (t.user_name || '').toLowerCase().includes(q) ||
        (t.dairy?.dairy_name || '').toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q)
      );
    });
  }

  // Calculate signature to prevent unnecessary DOM re-renders
  const currentSignature = JSON.stringify({
    filter: helpdeskFilter,
    query: helpdeskSearchQuery,
    selected: selectedTicketId,
    tickets: filtered.map((t) => ({
      id: t.id,
      status: t.status,
      unread: t.unread_count,
      lastMsg: t.latest_message?.message,
      updated: t.updated_at,
    })),
  });

  if (currentSignature === lastRenderedTicketSignature) {
    return; // No changes in ticket list - prevent sidebar flicker
  }
  lastRenderedTicketSignature = currentSignature;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted" style="padding: 2.5rem 1rem;">
        <i class="fa-solid fa-inbox" style="font-size: 2rem; color: #CBD5E1; margin-bottom: 0.5rem; display: block;"></i>
        No support tickets matching this filter.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((t) => {
    const isActive = t.id === selectedTicketId;
    const isCustomer = t.user_role === 'customer';
    const roleTagClass = isCustomer ? 'role-customer-tag' : 'role-partner-tag';
    const roleLabel = isCustomer ? 'Customer' : 'Partner Dairy';
    
    let statusClass = 'status-open';
    if (t.status === 'in_progress') statusClass = 'status-in_progress';
    else if (t.status === 'resolved') statusClass = 'status-resolved';
    else if (t.status === 'closed') statusClass = 'status-closed';

    const avatarUrl = t.user_avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(t.user_name || 'User')}`;
    const timeAgo = formatTimeAgo(t.updated_at || t.created_at);
    const lastMsgText = t.latest_message ? t.latest_message.message : 'No messages yet';
    const hasUnread = (t.unread_count || 0) > 0;

    return `
      <div class="ticket-item-card ${isActive ? 'active' : ''}" onclick="openTicketChat('${t.id}')">
        <div class="ticket-card-top">
          <span class="ticket-number-badge">#${t.ticket_number}</span>
          <span class="ticket-time-ago">${timeAgo}</span>
        </div>

        <div class="ticket-card-user">
          <img src="${avatarUrl}" class="ticket-user-avatar" alt="Avatar">
          <div style="flex: 1; min-width: 0;">
            <div class="ticket-user-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(t.user_name || 'User')}
              ${hasUnread ? '<span class="ticket-unread-dot" title="Unread messages"></span>' : ''}
            </div>
            <span class="ticket-user-role-tag ${roleTagClass}">${roleLabel}</span>
            ${t.dairy?.dairy_name ? `<span class="text-muted" style="font-size: 0.68rem;"> • ${escapeHtml(t.dairy.dairy_name)}</span>` : ''}
          </div>
        </div>

        <div class="ticket-card-subject">${escapeHtml(t.subject)}</div>
        <div class="ticket-card-snippet">${escapeHtml(lastMsgText)}</div>

        <div class="ticket-card-bottom">
          <span class="ticket-status-pill ${statusClass}">${(t.status || 'open').replace('_', ' ')}</span>
          <span style="font-size: 0.7rem; color: var(--color-text-muted); text-transform: capitalize;">
            <i class="fa-solid fa-tag"></i> ${escapeHtml(t.category || 'general')}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Open Ticket Live Chat Stream
 */
async function openTicketChat(ticketId, isPoll = false, forceScroll = false) {
  const isTicketSwitch = selectedTicketId !== ticketId;
  selectedTicketId = ticketId;

  // Update active card highlighting
  document.querySelectorAll('.ticket-item-card').forEach((c) => c.classList.remove('active'));
  const currentCard = document.querySelector(`.ticket-item-card[onclick*="${ticketId}"]`);
  if (currentCard) currentCard.classList.add('active');

  const emptyState = document.getElementById('helpdesk-chat-empty');
  const chatContainer = document.getElementById('helpdesk-chat-container');
  if (emptyState) emptyState.style.display = 'none';
  if (chatContainer) chatContainer.style.display = 'flex';

  try {
    const res = await API.get(`/api/support/tickets/${ticketId}`);
    const ticket = res.ticket;
    const messages = res.messages || [];

    // Header Meta
    const avatarEl = document.getElementById('chat-user-avatar');
    if (avatarEl) {
      avatarEl.src = ticket.user_avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(ticket.user_name || 'User')}`;
    }
    const nameEl = document.getElementById('chat-user-name');
    if (nameEl) nameEl.textContent = ticket.user_name || 'Platform User';
    
    const roleBadge = document.getElementById('chat-user-role-badge');
    if (roleBadge) {
      const isCust = ticket.user_role === 'customer';
      roleBadge.className = `ticket-user-role-tag ${isCust ? 'role-customer-tag' : 'role-partner-tag'}`;
      roleBadge.textContent = isCust ? 'Customer' : 'Dairy Partner';
    }

    const tNumEl = document.getElementById('chat-ticket-number');
    if (tNumEl) tNumEl.textContent = `#${ticket.ticket_number}`;
    const emailEl = document.getElementById('chat-user-email');
    if (emailEl) emailEl.textContent = ticket.user_email || 'No email';
    const phoneEl = document.getElementById('chat-user-phone');
    if (phoneEl) phoneEl.textContent = ticket.user_phone || 'No phone';

    const callBtn = document.getElementById('btn-chat-call-user');
    if (callBtn) {
      callBtn.href = ticket.user_phone ? `tel:${ticket.user_phone}` : '#';
      callBtn.style.display = ticket.user_phone ? 'inline-flex' : 'none';
    }

    // Status Badge
    const statusBadge = document.getElementById('chat-current-status-badge');
    if (statusBadge) {
      let sClass = 'status-open';
      if (ticket.status === 'in_progress') sClass = 'status-in_progress';
      else if (ticket.status === 'resolved') sClass = 'status-resolved';
      else if (ticket.status === 'closed') sClass = 'status-closed';

      statusBadge.className = `ticket-status-pill ${sClass}`;
      statusBadge.textContent = (ticket.status || 'open').replace('_', ' ');
    }

    // Context Bar
    const catEl = document.getElementById('chat-context-category');
    if (catEl) catEl.textContent = ticket.category ? ticket.category.toUpperCase() : 'GENERAL';
    const prioEl = document.getElementById('chat-context-priority');
    if (prioEl) prioEl.textContent = ticket.priority ? ticket.priority.toUpperCase() : 'MEDIUM';
    const createdEl = document.getElementById('chat-context-created');
    if (createdEl) {
      createdEl.textContent = new Date(ticket.created_at || Date.now()).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    const dairyContextWrap = document.getElementById('chat-context-dairy-wrap');
    const dairyContext = document.getElementById('chat-context-dairy');
    if (dairyContextWrap && dairyContext) {
      if (ticket.dairy?.dairy_name) {
        dairyContext.textContent = ticket.dairy.dairy_name;
        dairyContextWrap.style.display = 'flex';
      } else {
        dairyContextWrap.style.display = 'none';
      }
    }

    // Render Messages Stream without glitching
    const streamContainer = document.getElementById('helpdesk-messages-stream');
    if (streamContainer) {
      renderMessagesStream(streamContainer, messages, isTicketSwitch || forceScroll);
    }

  } catch (err) {
    if (!isPoll) {
      Toast.error('Chat Error', err.message);
    }
  }
}

/**
 * Generate Message HTML Element string
 */
function buildAdminMessageHtml(m, currentAdminId, isNew = false) {
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

  const isOutgoing = m.sender_role === 'admin' || m.sender_id === currentAdminId;
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
          <span class="badge" style="font-size: 0.62rem; padding: 0.05rem 0.35rem;">${m.sender_role === 'admin' ? 'SuperAdmin' : (m.sender_role || 'User')}</span>
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
 * Smart Non-Destructive Messages Stream Renderer
 */
function renderMessagesStream(container, messages, forceScroll = false) {
  const currentAdmin = Auth.getUser() || {};
  const currentAdminId = currentAdmin.id;

  if (messages.length === 0) {
    if (adminRenderedTicketId !== selectedTicketId || adminRenderedMsgIds.length > 0) {
      adminRenderedTicketId = selectedTicketId;
      adminRenderedMsgIds = [];
      container.innerHTML = `
        <div class="text-center text-muted" style="padding: 2rem;">
          <p>No messages recorded in this conversation yet.</p>
        </div>
      `;
    }
    return;
  }

  const wasNearBottom = isScrolledNearBottom(container);
  const isTicketSwitch = adminRenderedTicketId !== selectedTicketId;

  if (isTicketSwitch) {
    adminRenderedTicketId = selectedTicketId;
    adminRenderedMsgIds = messages.map((m) => m.id);
    container.innerHTML = messages.map((m) => buildAdminMessageHtml(m, currentAdminId, false)).join('');
    container.scrollTop = container.scrollHeight;
    return;
  }

  // Same ticket: Check for newly arrived messages
  const existingSet = new Set(adminRenderedMsgIds);
  const newMessages = messages.filter((m) => !existingSet.has(m.id));

  if (newMessages.length === 0 && messages.length === adminRenderedMsgIds.length) {
    // Zero changes - do not touch DOM!
    return;
  }

  if (newMessages.length > 0 && adminRenderedMsgIds.length > 0) {
    // Incrementally append only the new messages
    const emptyPlaceholder = container.querySelector('.text-center.text-muted');
    if (emptyPlaceholder) emptyPlaceholder.remove();

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newMessages.map((m) => buildAdminMessageHtml(m, currentAdminId, true)).join('');
    
    while (tempDiv.firstChild) {
      container.appendChild(tempDiv.firstChild);
    }

    adminRenderedMsgIds = messages.map((m) => m.id);

    if (wasNearBottom || forceScroll) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  } else {
    // Re-render full list if IDs diverged
    adminRenderedMsgIds = messages.map((m) => m.id);
    container.innerHTML = messages.map((m) => buildAdminMessageHtml(m, currentAdminId, false)).join('');
    if (wasNearBottom || forceScroll) {
      container.scrollTop = container.scrollHeight;
    }
  }
}

/**
 * Background Polling Loop for Live Chat
 */
function startHelpdeskPolling() {
  if (helpdeskPollTimer) clearInterval(helpdeskPollTimer);
  helpdeskPollTimer = setInterval(() => {
    const disputesTab = document.getElementById('tab-disputes');
    if (disputesTab && disputesTab.classList.contains('active')) {
      if (selectedTicketId) {
        openTicketChat(selectedTicketId, true);
      }
      loadHelpdeskTickets(false);
    }
  }, 3500);
}

/**
 * Helpers
 */
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

window.openTicketChat = openTicketChat;


/**
 * Setup Admin & Platform Settings Tab
 */
function setupAdminSettingsTab() {
  const user = Auth.getUser();

  // Populate current name & phone
  const curNameInput = document.getElementById('settings-admin-fullname');
  if (curNameInput && user) curNameInput.value = user.full_name || '';

  const curPhoneInput = document.getElementById('settings-admin-phone');
  if (curPhoneInput && user) curPhoneInput.value = user.phone || '';

  // Populate current email
  const curEmailInput = document.getElementById('settings-admin-current-email');
  if (curEmailInput && user) {
    curEmailInput.value = user.email || '';
  }

  // 1. Change Admin Full Name Form
  const changeNameForm = document.getElementById('form-admin-change-name');
  if (changeNameForm) {
    changeNameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newFullName = document.getElementById('settings-admin-fullname').value.trim();
      const newPhone = document.getElementById('settings-admin-phone')?.value.trim();
      const btn = document.getElementById('btn-admin-update-name');

      if (!newFullName) {
        Toast.warning('Missing Name', 'Please enter admin full name.');
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
        Auth.saveSession(Auth.getToken(), currentUser);

        setupHeader();
        Toast.success('Admin Name Updated!', `SuperAdmin display name updated to "${newFullName}".`);
      } catch (err) {
        Toast.error('Update Failed', err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  // 2. Change Admin Email Form
  const changeEmailForm = document.getElementById('form-admin-change-email');
  if (changeEmailForm) {
    changeEmailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newEmail = document.getElementById('settings-admin-new-email').value.trim();
      const btn = document.getElementById('btn-admin-update-email');

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
        document.getElementById('settings-admin-new-email').value = '';

        Toast.success('Email Updated', res.message || 'SuperAdmin login email has been updated successfully.');
      } catch (err) {
        Toast.error('Email Update Failed', err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  // 2. Change Password & Strength Meter
  const newPassInput = document.getElementById('settings-admin-new-password');
  const strengthFill = document.getElementById('admin-password-strength-fill');
  const strengthText = document.getElementById('admin-password-strength-text');

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
      if (val.length >= 8) score += 1;
      if (val.length >= 12) score += 1;
      if (/[A-Z]/.test(val)) score += 1;
      if (/[0-9]/.test(val)) score += 1;
      if (/[^A-Za-z0-9]/.test(val)) score += 1;

      if (score <= 2) {
        strengthFill.style.width = '33%';
        strengthFill.style.background = '#EF4444';
        strengthText.textContent = 'Strength: Weak (Needs uppercase, numbers, symbols)';
        strengthText.style.color = '#DC2626';
      } else if (score <= 4) {
        strengthFill.style.width = '66%';
        strengthFill.style.background = '#F59E0B';
        strengthText.textContent = 'Strength: Good';
        strengthText.style.color = '#D97706';
      } else {
        strengthFill.style.width = '100%';
        strengthFill.style.background = '#10B981';
        strengthText.textContent = 'Strength: Strong Master Password 🔒';
        strengthText.style.color = '#059669';
      }
    });
  }

  const changePassForm = document.getElementById('form-admin-change-password');
  if (changePassForm) {
    changePassForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPass = document.getElementById('settings-admin-current-password').value;
      const newPass = document.getElementById('settings-admin-new-password').value;
      const confirmPass = document.getElementById('settings-admin-confirm-password').value;
      const btn = document.getElementById('btn-admin-update-password');

      if (newPass.length < 8) {
        Toast.warning('Weak Password', 'Admin master password must be at least 8 characters.');
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

        document.getElementById('settings-admin-current-password').value = '';
        document.getElementById('settings-admin-new-password').value = '';
        document.getElementById('settings-admin-confirm-password').value = '';
        if (strengthFill) strengthFill.style.width = '0%';
        if (strengthText) strengthText.textContent = 'Strength: None';

        Toast.success('Password Changed', res.message || 'Master password updated securely.');
      } catch (err) {
        Toast.error('Password Change Failed', err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  // 3. Forgot Password Link
  const forgotBtn = document.getElementById('btn-admin-forgot-password');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', async () => {
      const email = user?.email || (curEmailInput ? curEmailInput.value : '');
      if (!email) {
        Toast.warning('Missing Email', 'Could not detect admin email.');
        return;
      }

      forgotBtn.disabled = true;
      forgotBtn.innerHTML = '<span class="spinner-sm"></span> Sending...';

      try {
        const res = await API.post('/api/auth/forgot-password', { email });
        Toast.success('Reset Link Dispatched', res.message || 'Password reset link sent to registered admin email.');
      } catch (err) {
        Toast.error('Request Failed', err.message);
      } finally {
        forgotBtn.disabled = false;
        forgotBtn.innerHTML = '<i class="fa-solid fa-key"></i> Send Reset Link';
      }
    });
  }

  // 4. Platform Global Settings
  const platformForm = document.getElementById('form-admin-platform-settings');
  if (platformForm) {
    platformForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn-save-platform-settings');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-sm"></span> Saving...';

      try {
        const fee = document.getElementById('setting-platform-fee')?.value || '50';
        const cycle = document.getElementById('setting-payout-cycle')?.value || 'monthly';
        const aiVetting = document.getElementById('admin-pref-ai-vetting')?.checked || false;
        const waGateway = document.getElementById('admin-pref-whatsapp-gw')?.checked || false;

        Toast.success('Platform Policy Saved', `Flat Platform Fee set to ₹${fee} / active subscription. Automation policies synchronized.`);
      } catch (err) {
        Toast.error('Save Failed', err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    });
  }

  // 5. Logout All Devices
  const logoutAllBtn = document.getElementById('btn-admin-logout-all');
  if (logoutAllBtn) {
    logoutAllBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to terminate all other administrative sessions?')) return;
      try {
        const res = await API.post('/api/auth/logout-all');
        Toast.success('Sessions Terminated', res.message || 'All other active sessions have been logged out.');
      } catch (err) {
        Toast.error('Action Failed', err.message);
      }
    });
  }
}

// togglePasswordVisibility is defined globally in components.js

/**
 * ============================================================================
 * ADMIN CSV DATA EXPORT & ANALYTICS CONTROLLER
 * ============================================================================
 */

let activePreviewDataset = null;

function setupAdminExportsTab() {
  // 1. Search filter
  const searchInput = document.getElementById('csv-search-filter');
  const domainFilter = document.getElementById('csv-domain-filter');

  function filterCards() {
    const query = (searchInput?.value || '').toLowerCase().trim();
    const domain = domainFilter?.value || 'all';

    const cards = document.querySelectorAll('#csv-datasets-grid .csv-dataset-card');
    cards.forEach((card) => {
      const cardDomain = card.dataset.domain;
      const cardName = card.dataset.name.toLowerCase();
      const matchesSearch = !query || cardName.includes(query) || card.textContent.toLowerCase().includes(query);
      const matchesDomain = domain === 'all' || cardDomain === domain;

      if (matchesSearch && matchesDomain) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  }

  searchInput?.addEventListener('input', filterCards);
  domainFilter?.addEventListener('change', filterCards);

  // 2. Download All Datasets Master Action
  const btnExportAll = document.getElementById('btn-export-all-datasets');
  if (btnExportAll) {
    btnExportAll.addEventListener('click', async () => {
      const datasets = ['users', 'dairies', 'products', 'subscriptions', 'orders', 'financials', 'disputes'];
      const origText = btnExportAll.innerHTML;
      btnExportAll.disabled = true;
      btnExportAll.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Preparing Bulk CSV Archive...`;

      try {
        Toast.info('Export Started', 'Generating and streaming all 7 platform CSV datasets...');
        for (const ds of datasets) {
          await downloadDataset(ds, false);
          // Short delay between triggers for clean browser handling
          await new Promise((r) => setTimeout(r, 450));
        }
        Toast.success('Export Complete', 'All 7 analytics datasets downloaded successfully.');
      } catch (err) {
        Toast.error('Export Error', err.message || 'Failed to download datasets.');
      } finally {
        btnExportAll.disabled = false;
        btnExportAll.innerHTML = origText;
      }
    });
  }

  // 3. Modal Download Button
  const modalDownloadBtn = document.getElementById('btn-csv-modal-download');
  if (modalDownloadBtn) {
    modalDownloadBtn.addEventListener('click', () => {
      if (activePreviewDataset) {
        downloadDataset(activePreviewDataset);
      }
    });
  }
}

/**
 * Trigger CSV / Excel Download for a specific dataset
 */
window.downloadDataset = async function (dataset, showToast = true) {
  try {
    const token = Auth.getToken();
    const baseUrl = typeof API !== 'undefined' ? API.getBaseUrl() : '';
    const cleanUrl = `${baseUrl}/api/admin/export/${dataset}?token=${encodeURIComponent(token || '')}`;

    const res = await fetch(cleanUrl, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || `Server returned status ${res.status}`);
    }

    const blob = await res.blob();
    // Wrap with UTF-8 BOM for Microsoft Excel compatibility
    const excelBlob = new Blob(['\uFEFF', blob], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(excelBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `neardairy_${dataset}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    if (showToast) {
      Toast.success('Excel CSV Ready', `Downloaded ${dataset.toUpperCase()} dataset for Excel.`);
    }
  } catch (err) {
    console.error('Download dataset error:', err);
    Toast.error('Download Failed', err.message || 'Could not export dataset.');
    throw err;
  }
};

/**
 * Interactive Live Data Previewer Modal
 */
window.previewDataset = async function (dataset, title) {
  activePreviewDataset = dataset;
  document.getElementById('csv-preview-title').textContent = `${title} (Preview)`;
  document.getElementById('csv-preview-subtitle').textContent = `Dataset ID: "${dataset}" • Real-time DB Snapshot`;
  
  const container = document.getElementById('csv-preview-table-container');
  const countBadge = document.getElementById('csv-preview-row-count');
  
  container.innerHTML = `
    <div style="padding: 2.5rem; text-align: center; color: var(--color-text-muted);">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.75rem; color: #7C3AED; margin-bottom: 0.75rem;"></i>
      <p style="font-size: 0.875rem;">Fetching live data records from Supabase database...</p>
    </div>
  `;
  countBadge.textContent = 'Loading records...';

  Modal.open('csv-preview-modal');

  try {
    const token = Auth.getToken();
    const baseUrl = typeof API !== 'undefined' ? API.getBaseUrl() : '';
    const cleanUrl = `${baseUrl}/api/admin/export/${dataset}?format=json&token=${encodeURIComponent(token || '')}`;

    const res = await fetch(cleanUrl, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const rows = json.data || [];

    countBadge.textContent = `${rows.length} Total Records in Database`;

    if (rows.length === 0) {
      container.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--color-text-muted);">
          <i class="fa-solid fa-folder-open" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
          <p>No records found in this dataset.</p>
        </div>
      `;
      return;
    }

    const headers = Object.keys(rows[0]);
    const previewRows = rows.slice(0, 15); // Show first 15 records

    let tableHtml = `
      <table class="csv-preview-table">
        <thead>
          <tr>
            <th style="width: 40px;">#</th>
            ${headers.map((h) => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${previewRows
            .map(
              (row, idx) => `
            <tr>
              <td style="color: var(--color-text-muted); font-size: 0.75rem; font-weight: 700;">${idx + 1}</td>
              ${headers
                .map((h) => {
                  let val = row[h];
                  if (val === null || val === undefined) val = '<span class="text-muted">null</span>';
                  else if (typeof val === 'boolean') val = val ? '<span class="badge badge-success" style="font-size:0.68rem;">True</span>' : '<span class="badge badge-danger" style="font-size:0.68rem;">False</span>';
                  return `<td>${val}</td>`;
                })
                .join('')}
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;

    if (rows.length > 15) {
      tableHtml += `
        <div style="padding: 0.75rem 1rem; background: #F8FAFC; border-top: 1px solid var(--color-border); font-size: 0.78rem; color: var(--color-text-muted); text-align: center;">
          <i class="fa-solid fa-eye"></i> Showing top 15 sample rows. Full ${rows.length} rows will be exported in the CSV file.
        </div>
      `;
    }

    container.innerHTML = tableHtml;
  } catch (err) {
    console.error('Preview error:', err);
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: var(--color-danger);">
        <i class="fa-solid fa-circle-exclamation" style="font-size: 1.75rem; margin-bottom: 0.5rem;"></i>
        <p>Failed to load dataset preview: ${err.message}</p>
      </div>
    `;
    countBadge.textContent = 'Error';
  }
};
