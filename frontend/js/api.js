/**
 * NEAR DAIRY - CENTRALIZED API CLIENT
 */

const API = {
  /**
   * Automatically determine API backend URL based on config, host, and port
   */
  getBaseUrl() {
    // 1. Check explicit backend configuration from config.js or localStorage override
    const configuredUrl = (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || 
                          window.API_BASE_URL || 
                          localStorage.getItem('ND_BACKEND_URL') || 
                          '';

    const cleanConfigured = configuredUrl ? configuredUrl.trim().replace(/\/+$/, '') : '';

    // If opened via file:// protocol
    if (window.location.protocol === 'file:') {
      return cleanConfigured || 'http://localhost:3000';
    }

    // If running on localhost or 127.0.0.1
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      if (window.location.port === '3000') {
        return '';
      }
      // Any other local dev server (Live Server 5500, Vite, etc.)
      return cleanConfigured || 'http://localhost:3000';
    }

    // If running on Vercel or production domain
    if (cleanConfigured) {
      return cleanConfigured;
    }

    // Fallback: relative path (for reverse proxy/rewrites or same-origin)
    return '';
  },

  get baseUrl() {
    return this.getBaseUrl();
  },

  /**
   * Resolve an asset/image URL to the appropriate host
   * Ensures local /uploads paths route to Render backend if frontend is hosted on Vercel
   */
  resolveUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
      return url;
    }
    const base = this.getBaseUrl();
    if (base && url.startsWith('/')) {
      return `${base}${url}`;
    }
    return url;
  },

  /**
   * Helper to get stored auth token
   */
  getToken() {
    return localStorage.getItem('nd_token') || sessionStorage.getItem('nd_token');
  },

  /**
   * Universal Request Handler
   */
  async request(endpoint, options = {}) {
    const base = this.getBaseUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    const url = `${base}${cleanEndpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      let response;
      try {
        response = await fetch(url, {
          ...options,
          headers,
        });
      } catch (networkErr) {
        console.error(`Network Connection Failed [${url}]:`, networkErr);
        const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        const helpMsg = isProduction && !base
          ? 'Unable to connect to Near Dairy backend. Please set your Render backend URL in `frontend/js/config.js`.'
          : 'Unable to connect to the Near Dairy server. Please make sure the backend server is running.';
        throw new Error(helpMsg);
      }

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { message: text || `Server returned status ${response.status}` };
      }

      if (!response.ok) {
        if (response.status === 401 && !endpoint.includes('/auth/login')) {
          console.warn('Session expired or unauthorized.');
        }
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error.message);
      throw error;
    }
  },

  // Convenience methods
  get(endpoint, params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        query.append(key, val);
      }
    });
    const qs = query.toString();
    return this.request(qs ? `${endpoint}?${qs}` : endpoint, { method: 'GET' });
  },

  post(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  put(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  patch(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  /**
   * Submit FormData (multipart/form-data) via POST to an endpoint
   * Automatically handles Authorization headers and base URL
   * Omits Content-Type header so the browser sets multipart/form-data boundary automatically
   * @param {string} endpoint - API endpoint e.g. '/api/upload/complaint'
   * @param {FormData} formData - FormData object containing files and fields
   */
  async postForm(endpoint, formData) {
    const base = this.getBaseUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    const url = `${base}${cleanEndpoint}`;

    const headers = {};
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: formData,
        });
      } catch (networkErr) {
        console.error(`Network Connection Failed [${url}]:`, networkErr);
        throw new Error(
          'Unable to connect to the Near Dairy server. Please make sure the backend server is running on port 3000.'
        );
      }

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { message: text || `Server returned status ${response.status}` };
      }

      if (!response.ok) {
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API postForm Error [${endpoint}]:`, error.message);
      throw error;
    }
  },

  /**
   * Submit FormData (multipart/form-data) via PUT to an endpoint
   * @param {string} endpoint
   * @param {FormData} formData
   */
  async putForm(endpoint, formData) {
    const base = this.getBaseUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    const url = `${base}${cleanEndpoint}`;

    const headers = {};
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      let response;
      try {
        response = await fetch(url, {
          method: 'PUT',
          headers,
          body: formData,
        });
      } catch (networkErr) {
        console.error(`Network Connection Failed [${url}]:`, networkErr);
        throw new Error(
          'Unable to connect to the Near Dairy server. Please make sure the backend server is running on port 3000.'
        );
      }

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { message: text || `Server returned status ${response.status}` };
      }

      if (!response.ok) {
        throw new Error(data.message || `Update failed with status ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API putForm Error [${endpoint}]:`, error.message);
      throw error;
    }
  },

  /**
   * Upload a file (Banner, Avatar, Certificate, Product, Complaint, etc.) to Supabase Storage
   * @param {File|Blob} file - The file object to upload
   * @param {string} type - 'banner' | 'avatar' | 'certificate' | 'product' | 'complaint' | 'general'
   */
  async upload(file, type = 'general') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    return this.postForm(`/api/upload/${type}`, formData);
  },

  /**
   * Update / Replace an existing file in Supabase Storage
   * @param {File|Blob} file - The new file
   * @param {string} type - 'banner' | 'avatar' | 'certificate' | 'product' | 'general'
   * @param {string} oldUrl - URL of file being replaced
   */
  async updateUpload(file, type = 'general', oldUrl = '') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    if (oldUrl) formData.append('old_url', oldUrl);
    return this.putForm(`/api/upload/${type}`, formData);
  },

  /**
   * Delete a file from Supabase Storage by URL
   * @param {string} fileUrl
   */
  async deleteUpload(fileUrl) {
    return this.request('/api/upload', {
      method: 'DELETE',
      body: JSON.stringify({ file_url: fileUrl }),
    });
  },

  /**
   * Delete authenticated user's avatar
   */
  async deleteAvatar() {
    return this.request('/api/upload/avatar', { method: 'DELETE' });
  },

  /**
   * Delete partner dairy banner
   */
  async deleteBanner() {
    return this.request('/api/upload/banner', { method: 'DELETE' });
  },

  /**
   * Delete partner dairy certificate
   */
  async deleteCertificate() {
    return this.request('/api/upload/certificate', { method: 'DELETE' });
  }
};

if (typeof window !== 'undefined') {
  window.API = API;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}

