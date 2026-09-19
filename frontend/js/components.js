/**
 * NEAR DAIRY - REUSABLE UI HELPERS (TOASTS, MODALS, ALERTS)
 */

const Toast = {
  getContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  },

  show(title, message = '', type = 'info', duration = 4000) {
    const container = this.getContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-exclamation';
    if (type === 'warning') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `
      <i class="fa-solid ${icon} toast-icon"></i>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 200);
      }
    }, duration);
  },

  success(title, message) { this.show(title, message, 'success'); },
  error(title, message) { this.show(title, message, 'error'); },
  info(title, message) { this.show(title, message, 'info'); },
  warning(title, message) { this.show(title, message, 'warning'); }
};

const Modal = {
  open(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  },

  close(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  },

  /**
   * Confirmation Dialog Helper
   */
  confirm({ title = 'Are you sure?', message = 'Do you want to proceed?', confirmText = 'Confirm', cancelText = 'Cancel', onConfirm }) {
    let confirmModal = document.getElementById('global-confirm-modal');
    if (!confirmModal) {
      confirmModal = document.createElement('div');
      confirmModal.id = 'global-confirm-modal';
      confirmModal.className = 'modal-overlay';
      document.body.appendChild(confirmModal);
    }

    confirmModal.innerHTML = `
      <div class="modal-container" style="max-width: 440px;">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close-btn" onclick="Modal.close('global-confirm-modal')">&times;</button>
        </div>
        <div class="modal-body">
          <p style="color: var(--color-text-muted); font-size: 0.9375rem;">${message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="Modal.close('global-confirm-modal')">${cancelText}</button>
          <button class="btn btn-primary" id="confirm-modal-ok-btn">${confirmText}</button>
        </div>
      </div>
    `;

    Modal.open('global-confirm-modal');

    document.getElementById('confirm-modal-ok-btn').onclick = () => {
      Modal.close('global-confirm-modal');
      if (typeof onConfirm === 'function') onConfirm();
    };
  }
};

/**
 * Universal Password Visibility Toggle Helper
 */
window.togglePasswordVisibility = function (inputId, btn) {
  const input = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;
  if (!input) return;
  const isPwd = input.type === 'password';
  input.type = isPwd ? 'text' : 'password';

  if (btn) {
    btn.setAttribute('aria-label', isPwd ? 'Hide password' : 'Show password');
    btn.setAttribute('title', isPwd ? 'Hide password' : 'Show password');
    const icon = btn.querySelector('i');
    if (icon) {
      if (icon.classList.contains('fa-solid')) {
        icon.className = isPwd ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      } else {
        icon.className = isPwd ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
      }
    }
  }
};

// Global delegation for any password toggle button
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.password-toggle-btn, .btn-pwd-toggle');
  if (!btn) return;
  // If button already has an inline onclick handler, let it execute or handle it if no onclick
  if (!btn.getAttribute('onclick')) {
    const wrap = btn.closest('.pwd-wrapper, .password-input-wrap') || btn.parentElement;
    const input = wrap ? wrap.querySelector('input[type="password"], input[type="text"]') : null;
    if (input) {
      e.preventDefault();
      e.stopPropagation();
      window.togglePasswordVisibility(input, btn);
    }
  }
});

/**
 * Universal HTML escape helper to prevent XSS and rendering breakages
 */
window.escapeHtml = function (text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
};

/**
 * Universal 12-Hour Time Formatter for delivery schedules & slots
 * Converts '05:30' -> '5:30 AM', '17:30' -> '5:30 PM', and handles existing 12h strings
 */
window.formatTime12h = function (timeStr) {
  if (!timeStr) return '';
  timeStr = String(timeStr).trim();
  if (/(am|pm)$/i.test(timeStr)) {
    return timeStr.toUpperCase();
  }
  const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return timeStr;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = hours >= 12 ? 'PM' : 'AM';

  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${hours}:${minutes} ${period}`;
};

/**
 * Universal Mobile Sidebar / Drawer Manager
 */
const Sidebar = {
  getOverlay() {
    let overlay = document.querySelector('.sidebar-backdrop-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'sidebar-backdrop-overlay';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', () => Sidebar.close());
    }
    return overlay;
  },

  open() {
    const sidebar = document.querySelector('.dashboard-sidebar');
    const overlay = this.getOverlay();
    if (sidebar) {
      sidebar.classList.add('mobile-open');
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  },

  close() {
    const sidebar = document.querySelector('.dashboard-sidebar');
    const overlay = document.querySelector('.sidebar-backdrop-overlay');
    if (sidebar) {
      sidebar.classList.remove('mobile-open');
    }
    if (overlay) {
      overlay.classList.remove('active');
    }
    document.body.style.overflow = '';
  },

  toggle() {
    const sidebar = document.querySelector('.dashboard-sidebar');
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      this.close();
    } else {
      this.open();
    }
  },

  init() {
    this.getOverlay();

    document.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.mobile-sidebar-toggle-btn, [data-action="toggle-sidebar"]');
      if (toggleBtn) {
        e.preventDefault();
        Sidebar.toggle();
        return;
      }

      const closeBtn = e.target.closest('.sidebar-close-btn, [data-action="close-sidebar"]');
      if (closeBtn) {
        e.preventDefault();
        Sidebar.close();
        return;
      }

      if (window.innerWidth <= 1024) {
        const navItem = e.target.closest('.sidebar-item, .sidebar-nav button, .sidebar-nav a');
        if (navItem && !navItem.classList.contains('sidebar-close-btn')) {
          Sidebar.close();
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        Sidebar.close();
      }
    });
  }
};

window.Sidebar = Sidebar;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Sidebar.init());
} else {
  Sidebar.init();
}
