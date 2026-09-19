/**
 * NEAR DAIRY - AUTHENTICATION & SESSION MANAGER
 */

const Auth = {
  TOKEN_KEY: 'nd_token',
  USER_KEY: 'nd_user',
  DAIRY_KEY: 'nd_dairy',

  getUser() {
    try {
      const data = localStorage.getItem(this.USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  getDairy() {
    try {
      const data = localStorage.getItem(this.DAIRY_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  isLoggedIn() {
    return Boolean(this.getToken() && this.getUser());
  },

  getRole() {
    const user = this.getUser();
    return user ? user.role : null;
  },

  saveSession(token, user, dairy = null) {
    if (token) localStorage.setItem(this.TOKEN_KEY, token);
    if (user) {
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      document.body.setAttribute('data-role', user.role);
    }
    if (dairy) localStorage.setItem(this.DAIRY_KEY, JSON.stringify(dairy));
    else if (dairy === null) localStorage.removeItem(this.DAIRY_KEY);
  },

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.DAIRY_KEY);
    document.body.removeAttribute('data-role');
    window.location.href = 'index.html';
  },

  /**
   * Route Guard: Protects dashboard pages by role
   */
  requireAuth(allowedRoles = [], redirectUrl = 'auth.html') {
    if (!this.isLoggedIn()) {
      window.location.href = redirectUrl;
      return false;
    }

    const currentRole = this.getRole();
    if (allowedRoles.length > 0 && !allowedRoles.includes(currentRole)) {
      if (currentRole === 'customer') window.location.href = 'customer-dashboard.html';
      else if (currentRole === 'partner') window.location.href = 'partner-dashboard.html';
      else if (currentRole === 'admin') window.location.href = 'admin-dashboard.html';
      else window.location.href = 'index.html';
      return false;
    }

    document.body.setAttribute('data-role', currentRole);
    return true;
  },

  /**
   * Updates standard top navbar with user profile / login buttons
   */
  initNavbar() {
    const user = this.getUser();
    const navAuthContainer = document.getElementById('nav-auth-section');
    const mobileDrawerAuth = document.getElementById('mobile-drawer-auth-section');

    if (user) {
      let dashboardHref = 'customer-dashboard.html';
      let dashboardLabel = 'Customer Portal';
      let roleBadgeColor = '#2563EB';
      let roleIcon = 'fa-user';

      if (user.role === 'partner') {
        dashboardHref = 'partner-dashboard.html';
        dashboardLabel = 'Partner Portal';
        roleBadgeColor = '#16A34A';
        roleIcon = 'fa-cow';
      } else if (user.role === 'admin') {
        dashboardHref = 'admin-dashboard.html';
        dashboardLabel = 'Admin Portal';
        roleBadgeColor = '#7C3AED';
        roleIcon = 'fa-shield-halved';
      }

      if (navAuthContainer) {
        navAuthContainer.innerHTML = `
          <a href="${dashboardHref}" class="user-nav-profile-pill" title="Open ${dashboardLabel}">
            <img src="${user.avatar_url || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(user.full_name)}" class="user-nav-avatar" alt="${user.full_name}">
            <div class="user-nav-meta">
              <span class="user-nav-name">${user.full_name}</span>
              <span class="user-nav-role" style="color: ${roleBadgeColor};">
                <i class="fa-solid ${roleIcon}"></i> ${user.role ? user.role.toUpperCase() : 'PORTAL'}
              </span>
            </div>
            <i class="fa-solid fa-chevron-right user-nav-arrow"></i>
          </a>
        `;
      }

      if (mobileDrawerAuth) {
        mobileDrawerAuth.innerHTML = `
          <a href="${dashboardHref}" class="btn btn-primary w-full flex items-center justify-center gap-2">
            <i class="fa-solid ${roleIcon}"></i>
            <span>Open ${dashboardLabel}</span>
          </a>
        `;
      }
    } else {
      if (navAuthContainer) {
        navAuthContainer.innerHTML = `
          <div class="flex items-center gap-2">
            <a href="auth.html" class="btn btn-sm btn-secondary">Sign In</a>
            <a href="auth.html?mode=register&role=customer" class="btn btn-sm btn-primary">Join Near Dairy</a>
          </div>
        `;
      }
      if (mobileDrawerAuth) {
        mobileDrawerAuth.innerHTML = `
          <a href="auth.html?role=partner" class="btn btn-outline w-full"><i class="fa-solid fa-cow"></i> Dairy Partner Login</a>
          <a href="auth.html?role=customer" class="btn btn-primary w-full"><i class="fa-solid fa-user"></i> Customer Sign In</a>
        `;
      }
    }
  }
};

// Auto-initialize navbar on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  Auth.initNavbar();
});
