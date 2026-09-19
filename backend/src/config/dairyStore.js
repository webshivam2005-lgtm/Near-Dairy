const fs = require('fs');
const path = require('path');

const CERT_STORE_FILE = path.join(__dirname, '..', '..', 'data', 'dairy_certificates.json');

// Ensure data directory exists
const dataDir = path.dirname(CERT_STORE_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// In-memory cache synced with disk
let certMap = {};
try {
  if (fs.existsSync(CERT_STORE_FILE)) {
    const raw = fs.readFileSync(CERT_STORE_FILE, 'utf8');
    certMap = JSON.parse(raw || '{}');
  }
} catch (e) {
  certMap = {};
}

function saveCertMap() {
  try {
    fs.writeFileSync(CERT_STORE_FILE, JSON.stringify(certMap, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not persist dairy certificates locally:', e.message);
  }
}

const DairyStore = {
  setCertificate(dairyId, certUrl) {
    if (!dairyId) return;
    if (certUrl) {
      certMap[dairyId] = certUrl;
    } else {
      delete certMap[dairyId];
    }
    saveCertMap();
  },

  getCertificate(dairyId) {
    return certMap[dairyId] || null;
  },

  /**
   * Enriches a single dairy object or an array of dairy objects with certificate_url
   */
  enrichDairy(dairy) {
    if (!dairy) return dairy;
    if (Array.isArray(dairy)) {
      return dairy.map((d) => this.enrichDairy(d));
    }
    return {
      ...dairy,
      certificate_url: dairy.certificate_url || certMap[dairy.id] || null,
    };
  }
};

module.exports = DairyStore;
