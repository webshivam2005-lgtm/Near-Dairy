/**
 * NEAR DAIRY - LEAFLET.JS & OPENSTREETMAP HELPER
 */

const MapHelper = {
  // Default coordinates (Pune Dairies Hub)
  DEFAULT_LAT: 18.4500,
  DEFAULT_LNG: 73.8567,

  // Well-known Indian city/area coordinates for instant fallback lookup
  KNOWN_LOCATIONS: {
    'pune': { lat: 18.5204, lng: 73.8567, name: 'Pune, Maharashtra' },
    'katraj': { lat: 18.4486, lng: 73.8753, name: 'Katraj, Pune' },
    'kondhwa': { lat: 18.4720, lng: 73.8965, name: 'Kondhwa, Pune' },
    'kothrud': { lat: 18.5074, lng: 73.8077, name: 'Kothrud, Pune' },
    'hadapsar': { lat: 18.5089, lng: 73.9259, name: 'Hadapsar, Pune' },
    'baner': { lat: 18.5590, lng: 73.7868, name: 'Baner, Pune' },
    'wakad': { lat: 18.5987, lng: 73.7688, name: 'Wakad, Pune' },
    'pcmc': { lat: 18.6279, lng: 73.8131, name: 'Pimpri-Chinchwad, Pune' },
    'mumbai': { lat: 19.0760, lng: 72.8777, name: 'Mumbai Central, Maharashtra' },
    'navi mumbai': { lat: 19.0330, lng: 73.0297, name: 'Navi Mumbai, Maharashtra' },
    'thane': { lat: 19.2183, lng: 72.9781, name: 'Thane, Maharashtra' },
  },

  /**
   * Get initial saved or default coordinates
   */
  getInitialCoordinates() {
    // 1. Check if user set location in LocalStorage
    const savedLat = localStorage.getItem('nearDairy_user_lat');
    const savedLng = localStorage.getItem('nearDairy_user_lng');
    if (savedLat && savedLng) {
      return {
        latitude: parseFloat(savedLat),
        longitude: parseFloat(savedLng),
        address: localStorage.getItem('nearDairy_user_addr') || 'Custom Location',
        isCustom: true,
      };
    }

    // 2. Check if logged-in customer has profile coordinates
    try {
      const userStr = localStorage.getItem('nearDairy_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.latitude && user.longitude) {
          return {
            latitude: parseFloat(user.latitude),
            longitude: parseFloat(user.longitude),
            address: user.address || user.city || 'Your Registered Home',
            isUserHome: true,
          };
        }
      }
    } catch (e) {}

    // 3. Fallback to Pune Hub
    return {
      latitude: MapHelper.DEFAULT_LAT,
      longitude: MapHelper.DEFAULT_LNG,
      address: 'Pune, Maharashtra',
      isDefault: true,
    };
  },

  /**
   * Save user selected coordinates to localStorage
   */
  saveUserCoordinates(lat, lng, address = '') {
    localStorage.setItem('nearDairy_user_lat', lat);
    localStorage.setItem('nearDairy_user_lng', lng);
    if (address) localStorage.setItem('nearDairy_user_addr', address);
  },

  /**
   * Request actual browser GPS coordinates
   */
  async getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            isFallback: false,
          });
        },
        (err) => {
          console.warn('Geolocation error or denied:', err.message);
          const initial = MapHelper.getInitialCoordinates();
          resolve({
            latitude: initial.latitude,
            longitude: initial.longitude,
            isFallback: true,
          });
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  },

  /**
   * Geocode a place/city/locality name to GPS coordinates using OpenStreetMap Nominatim
   */
  async geocode(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return null;

    // Check fast lookup in known locations
    for (const key of Object.keys(MapHelper.KNOWN_LOCATIONS)) {
      if (q.includes(key) || key.includes(q)) {
        const loc = MapHelper.KNOWN_LOCATIONS[key];
        return {
          latitude: loc.lat,
          longitude: loc.lng,
          displayName: loc.name,
        };
      }
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=in`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const data = await res.json();
      if (data && data.length > 0) {
        return {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
          displayName: data[0].display_name,
        };
      }
    } catch (err) {
      console.warn('Nominatim geocode failed:', err.message);
    }
    return null;
  },

  /**
   * Comprehensive Reverse Geocoding returning structured details (full address, city, state, pincode)
   */
  async reverseGeocodeDetails(lat, lng) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      return { full_address: '', city: '', state: '', pincode: '' };
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latNum}&lon=${lngNum}&zoom=18&addressdetails=1`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const data = await res.json();
      
      if (data && data.address) {
        const a = data.address;
        
        // City / District resolution
        const city = a.city || a.town || a.village || a.district || a.state_district || a.county || a.suburb || '';
        
        // State resolution
        const state = a.state || '';
        
        // Pincode resolution
        const pincode = a.postcode || '';
        
        // Full structured address
        const full_address = data.display_name || [
          a.house_number,
          a.building,
          a.road || a.street || a.pedestrian,
          a.neighbourhood || a.suburb || a.residential,
          city,
          state,
          pincode,
          a.country
        ].filter(Boolean).join(', ');

        return {
          full_address,
          city,
          state,
          pincode,
          lat: latNum,
          lng: lngNum,
          raw: data
        };
      }

      return {
        full_address: `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
        city: '',
        state: '',
        pincode: '',
        lat: latNum,
        lng: lngNum
      };
    } catch (err) {
      console.warn('reverseGeocodeDetails error:', err.message);
      return {
        full_address: `Farm Location (${latNum.toFixed(6)}, ${lngNum.toFixed(6)})`,
        city: '',
        state: '',
        pincode: '',
        lat: latNum,
        lng: lngNum
      };
    }
  },

  /**
   * Reverse Geocode coordinates to human-readable address using OSM Nominatim
   */
  async reverseGeocode(lat, lng) {
    try {
      const details = await this.reverseGeocodeDetails(lat, lng);
      return details.full_address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch (err) {
      console.warn('Nominatim reverse geocode failed:', err.message);
      return `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    }
  },

  /**
   * Create custom HTML / Leaflet marker icons
   */
  createDairyIcon(name = 'Dairy') {
    return L.divIcon({
      className: 'custom-map-marker dairy-marker',
      html: `
        <div style="
          background: #16A34A;
          color: white;
          width: 38px;
          height: 38px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
          border: 2.5px solid #FFFFFF;
        ">
          <i class="fa-solid fa-cow" style="transform: rotate(45deg); font-size: 16px;"></i>
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 38],
      popupAnchor: [0, -38],
    });
  },

  createUserIcon() {
    return L.divIcon({
      className: 'custom-map-marker user-marker',
      html: `
        <div style="
          background: #2563EB;
          color: white;
          width: 38px;
          height: 38px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(37,99,235,0.45);
          border: 2.5px solid #FFFFFF;
          cursor: grab;
        ">
          <i class="fa-solid fa-location-dot" style="transform: rotate(45deg); font-size: 17px;"></i>
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 38],
      popupAnchor: [0, -38],
    });
  }
};
