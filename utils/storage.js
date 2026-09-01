/**
 * Storage Helper for Site Data Crawler
 * Provides async wrappers around chrome.storage.local with fallbacks and default values.
 */

export const DEFAULT_SETTINGS = {
  maxPages: 100,
  crawlDelay: 500,
  concurrency: 3,
  timeoutMs: 15000,
  crawlMode: 'single_page', // 'single_page' | 'page_links' | 'sitemap_and_links' | 'sitemap' | 'links_only'
  defaultExportFormat: 'txt', // 'txt' | 'markdown' | 'csv' | 'json' | 'html'
  sameDomainOnly: true,
  includeSubdomains: false,
  followDiscoveredLinks: true,
  extractImages: true,
  extractLinks: true,
  extractMetadata: true,
  extractHeadings: true,
  extractStructuredData: true,
  extractContactInfo: true,
  extractLegalInfo: true,
  classifyPageTypes: true,
  prioritizeLegalPages: true,
  prioritizeContactPages: true,
  ignoreQueryParams: true,
  excludePatterns: [
    '*.pdf', '*.zip', '*.jpg', '*.png', '*.gif',
    '/wp-admin/*', '/admin/*', '/cart/*', '/checkout/*', '/login', '/signup'
  ]
};

const STORAGE_KEYS = {
  SETTINGS: 'sdc_settings',
  LAST_URL: 'sdc_last_url',
  RECENT_SESSION: 'sdc_recent_session',
  HISTORY: 'sdc_history'
};

/**
 * Checks if Chrome extension storage API is available.
 */
function isChromeStorageAvailable() {
  return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
}

/**
 * Retrieves setting configuration.
 * 
 * @returns {Promise<Object>}
 */
export async function getSettings() {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (result) => {
        if (chrome.runtime.lastError || !result[STORAGE_KEYS.SETTINGS]) {
          resolve({ ...DEFAULT_SETTINGS });
        } else {
          resolve({ ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] });
        }
      });
    });
  } else {
    // Fallback to localStorage
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (raw) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {}
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Saves user settings.
 * 
 * @param {Object} newSettings 
 * @returns {Promise<boolean>}
 */
export async function saveSettings(newSettings) {
  const current = await getSettings();
  const merged = { ...current, ...newSettings };

  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged }, () => {
        resolve(!chrome.runtime.lastError);
      });
    });
  } else {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Saves the last entered URL for convenience.
 * 
 * @param {string} url 
 */
export async function saveLastUrl(url) {
  if (!url) return;
  if (isChromeStorageAvailable()) {
    chrome.storage.local.set({ [STORAGE_KEYS.LAST_URL]: url });
  } else {
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_URL, url);
    } catch {}
  }
}

/**
 * Gets the last entered URL.
 * 
 * @returns {Promise<string>}
 */
export async function getLastUrl() {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.LAST_URL], (result) => {
        resolve(result[STORAGE_KEYS.LAST_URL] || '');
      });
    });
  } else {
    return localStorage.getItem(STORAGE_KEYS.LAST_URL) || '';
  }
}

/**
 * Saves recent crawl session metadata and lightweight summary.
 * 
 * @param {Object} sessionData 
 */
export async function saveRecentSession(sessionData) {
  if (!sessionData) return;
  // Limit stored page count to keep storage lean
  const lightweightSession = {
    ...sessionData,
    pagesCount: sessionData.pages?.length || 0,
    timestamp: new Date().toISOString()
  };

  if (isChromeStorageAvailable()) {
    chrome.storage.local.set({ [STORAGE_KEYS.RECENT_SESSION]: lightweightSession });
  } else {
    try {
      localStorage.setItem(STORAGE_KEYS.RECENT_SESSION, JSON.stringify(lightweightSession));
    } catch {}
  }
}

/**
 * Clears all cached crawl data and session state.
 * 
 * @returns {Promise<boolean>}
 */
export async function clearCrawlData() {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.remove([STORAGE_KEYS.RECENT_SESSION, STORAGE_KEYS.HISTORY], () => {
        resolve(!chrome.runtime.lastError);
      });
    });
  } else {
    try {
      localStorage.removeItem(STORAGE_KEYS.RECENT_SESSION);
      localStorage.removeItem(STORAGE_KEYS.HISTORY);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Calculates current storage bytes in use.
 * 
 * @returns {Promise<number>} Bytes in use
 */
export async function getStorageBytesUsed() {
  if (isChromeStorageAvailable() && chrome.storage.local.getBytesInUse) {
    return new Promise((resolve) => {
      chrome.storage.local.getBytesInUse(null, (bytes) => {
        resolve(bytes || 0);
      });
    });
  }
  return 0;
}
