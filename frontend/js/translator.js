/**
 * NEAR DAIRY - ONLINE CLOUD TRANSLATION SYSTEM (Powered by Google Translate Engine)
 * Fast, real-time automated translation for all dynamic dairy listings, text, reviews, and dashboards.
 */

(function () {
  const STORAGE_KEY = 'nd_preferred_lang';
  const DEFAULT_LANG = 'en';

  const POPULAR_LANGUAGES = [
    { code: 'en', name: 'English', native: 'English', flag: '🇬🇧' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳' },
    { code: 'mr', name: 'Marathi', native: 'मराठी', flag: '🚩' },
    { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', flag: '🌿' },
    { code: 'ta', name: 'Tamil', native: 'தமிழ்', flag: '🌴' },
    { code: 'te', name: 'Telugu', native: 'తెలుగు', flag: '🌾' },
    { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', flag: '🪔' },
    { code: 'bn', name: 'Bengali', native: 'বাংলা', flag: '🌸' },
    { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', flag: '🌾' },
    { code: 'ur', name: 'Urdu', native: 'اردو', flag: '🕌' }
  ];

  function getStoredLang() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
  }

  function setTranslateCookie(lang) {
    const val = lang === 'en' ? '' : `/en/${lang}`;
    document.cookie = `googtrans=${val}; path=/;`;
    document.cookie = `googtrans=${val}; path=/; domain=.${window.location.hostname};`;
  }

  // Initialize Google Translate Element callback
  window.googleTranslateElementInit = function () {
    const el = document.getElementById('google_translate_element');
    if (!el) {
      const container = document.createElement('div');
      container.id = 'google_translate_element';
      container.style.display = 'none';
      document.body.appendChild(container);
    }

    try {
      new google.translate.TranslateElement({
        pageLanguage: 'en',
        includedLanguages: 'en,hi,mr,gu,ta,te,kn,bn,pa,ur,es,fr,ar,de,ja,ru',
        autoDisplay: false
      }, 'google_translate_element');
    } catch (e) {
      console.warn('TranslateElement init notice:', e);
    }
  };

  // Change language dynamically
  window.setPlatformLanguage = function (langCode) {
    localStorage.setItem(STORAGE_KEY, langCode);
    setTranslateCookie(langCode);

    const selectEl = document.querySelector('.goog-te-combo');
    if (selectEl) {
      selectEl.value = langCode;
      selectEl.dispatchEvent(new Event('change'));
    }

    // Refresh UI pickers
    renderCustomLanguagePickers();

    // Reload page smoothly to apply Google Translate translation across all DOM elements
    window.location.reload();
  };

  // Render modern language dropdown picker
  function renderCustomLanguagePickers() {
    const currentCode = getStoredLang();
    const currentObj = POPULAR_LANGUAGES.find((l) => l.code === currentCode) || POPULAR_LANGUAGES[0];

    const slots = document.querySelectorAll('.translate-widget-slot');
    slots.forEach((slot) => {
      slot.innerHTML = `
        <div class="online-translator-dropdown">
          <button type="button" class="translator-btn" aria-label="Choose Language" title="Translate Website">
            <i class="fa-solid fa-language"></i>
            <span class="translator-label">
              <span class="translator-flag">${currentObj.flag}</span>
              <span class="translator-name-full">${currentObj.native}</span>
              <span class="translator-name-short">${currentObj.code.toUpperCase()}</span>
            </span>
            <i class="fa-solid fa-chevron-down translator-chevron"></i>
          </button>
          <div class="translator-menu">
            <div class="translator-menu-title">
              <span><i class="fa-solid fa-globe"></i> Language / भाषा</span>
              <span class="badge badge-primary" style="font-size: 0.65rem;">Auto AI</span>
            </div>
            <div class="translator-menu-list">
              ${POPULAR_LANGUAGES.map((lang) => `
                <button type="button" class="translator-menu-item ${lang.code === currentCode ? 'active' : ''}" onclick="setPlatformLanguage('${lang.code}')">
                  <span class="translator-item-flag">${lang.flag}</span>
                  <span class="translator-item-name">${lang.name}</span>
                  <span class="translator-item-native">${lang.native}</span>
                  ${lang.code === currentCode ? '<i class="fa-solid fa-check translator-item-check"></i>' : ''}
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      const btn = slot.querySelector('.translator-btn');
      const menu = slot.querySelector('.translator-menu');
      if (btn && menu) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          document.querySelectorAll('.translator-menu.active').forEach((m) => {
            if (m !== menu) m.classList.remove('active');
          });
          const willOpen = !menu.classList.contains('active');
          menu.classList.toggle('active', willOpen);

          if (willOpen) {
            // Auto boundary detection to guarantee menu is 100% on-screen
            const rect = btn.getBoundingClientRect();
            const menuWidth = 230;
            if (rect.left < menuWidth && rect.left < window.innerWidth / 2) {
              menu.style.left = '0';
              menu.style.right = 'auto';
            } else if (window.innerWidth - rect.right < menuWidth) {
              menu.style.right = '0';
              menu.style.left = 'auto';
            } else {
              menu.style.left = '0';
              menu.style.right = 'auto';
            }
          }
        });
      }
    });
  }

  // Load Google Translate script asynchronously
  function loadGoogleScript() {
    const existing = document.getElementById('google-translate-script');
    if (!existing) {
      const script = document.createElement('script');
      script.id = 'google-translate-script';
      script.type = 'text/javascript';
      script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      script.async = true;
      document.head.appendChild(script);
    }
  }

  // Document Ready Initialization
  document.addEventListener('DOMContentLoaded', () => {
    // Hidden google element
    if (!document.getElementById('google_translate_element')) {
      const container = document.createElement('div');
      container.id = 'google_translate_element';
      container.style.display = 'none';
      document.body.appendChild(container);
    }

    renderCustomLanguagePickers();
    loadGoogleScript();

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.online-translator-dropdown')) {
        document.querySelectorAll('.translator-menu.active').forEach((m) => {
          m.classList.remove('active');
        });
      }
    });
  });
})();
