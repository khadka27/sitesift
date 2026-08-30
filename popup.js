/**
 * Site Data Crawler - Popup Controller
 */

import { getSettings, saveSettings, getLastUrl, saveLastUrl, clearCrawlData } from './utils/storage.js';
import { normalizeUrl } from './utils/url-utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const inputUrl = document.getElementById('inputUrl');
  const btnCurrentTab = document.getElementById('btnCurrentTab');
  const btnStartCrawl = document.getElementById('btnStartCrawl');
  const btnOpenDashboard = document.getElementById('btnOpenDashboard');
  const btnOptions = document.getElementById('btnOptions');
  const btnClearCache = document.getElementById('btnClearCache');
  const statusBanner = document.getElementById('statusBanner');
  const settingsSummaryBadge = document.getElementById('settingsSummaryBadge');

  const selectCrawlMode = document.getElementById('selectCrawlMode');
  const selectMaxPages = document.getElementById('selectMaxPages');
  const inputCustomPages = document.getElementById('inputCustomPages');
  const selectCrawlDelay = document.getElementById('selectCrawlDelay');
  const inputCustomDelay = document.getElementById('inputCustomDelay');

  const chkSameDomain = document.getElementById('chkSameDomain');
  const chkIncludeSubdomains = document.getElementById('chkIncludeSubdomains');
  const chkFollowLinks = document.getElementById('chkFollowLinks');
  const chkExtractMetadata = document.getElementById('chkExtractMetadata');
  const chkExtractHeadings = document.getElementById('chkExtractHeadings');
  const chkExtractLinks = document.getElementById('chkExtractLinks');
  const chkExtractImages = document.getElementById('chkExtractImages');
  const chkExtractStructuredData = document.getElementById('chkExtractStructuredData');

  const activeTabIndicator = document.getElementById('activeTabIndicator');
  const activeTabLabel = document.getElementById('activeTabLabel');

  // Load Settings & Last URL
  const settings = await getSettings();
  const lastUrl = await getLastUrl();

  // Populate Form from settings
  populateForm(settings);

  // Auto-fetch and display current active tab URL
  await fetchAndDisplayActiveTab(lastUrl);

  async function fetchAndDisplayActiveTab(fallbackUrl = '') {
    try {
      // Query active tab in current or last focused window
      let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0 || !tabs[0].url || !/^https?:\/\//i.test(tabs[0].url)) {
        tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      }

      if (tabs && tabs[0] && tabs[0].url && /^https?:\/\//i.test(tabs[0].url)) {
        const activeUrl = tabs[0].url;
        inputUrl.value = activeUrl;
        
        const titleSnippet = tabs[0].title ? ` (${tabs[0].title.slice(0, 28)}...)` : '';
        if (activeTabLabel && activeTabIndicator) {
          activeTabLabel.textContent = `Auto-detected active tab${titleSnippet}`;
          activeTabIndicator.classList.remove('hidden');
        }
        await saveLastUrl(activeUrl);
        return true;
      }
    } catch (err) {
      console.warn('[Site Data Crawler] Could not auto-detect active tab:', err);
    }

    // Fallback to last visited URL if active tab is not a website
    if (fallbackUrl) {
      inputUrl.value = fallbackUrl;
      if (activeTabIndicator) activeTabIndicator.classList.add('hidden');
    }
    return false;
  }

  // Event Listeners
  btnCurrentTab.addEventListener('click', async () => {
    const success = await fetchAndDisplayActiveTab();
    if (success) {
      showStatus('Loaded current tab URL', 'success');
    } else {
      showStatus('Active tab is not a valid HTTP/HTTPS web page', 'error');
    }
  });

  selectMaxPages.addEventListener('change', () => {
    if (selectMaxPages.value === 'custom') {
      inputCustomPages.classList.remove('hidden');
      inputCustomPages.focus();
    } else {
      inputCustomPages.classList.add('hidden');
    }
    updateSummaryBadge();
    persistCurrentSettings();
  });

  inputCustomPages.addEventListener('input', () => {
    updateSummaryBadge();
    persistCurrentSettings();
  });

  selectCrawlDelay.addEventListener('change', () => {
    if (selectCrawlDelay.value === 'custom') {
      inputCustomDelay.classList.remove('hidden');
      inputCustomDelay.focus();
    } else {
      inputCustomDelay.classList.add('hidden');
    }
    updateSummaryBadge();
    persistCurrentSettings();
  });

  inputCustomDelay.addEventListener('input', () => {
    updateSummaryBadge();
    persistCurrentSettings();
  });

  // Checkbox & Select listeners for instant persistence
  const allInputs = [
    selectCrawlMode, chkSameDomain, chkIncludeSubdomains, chkFollowLinks,
    chkExtractMetadata, chkExtractHeadings, chkExtractLinks, chkExtractImages, chkExtractStructuredData
  ];
  allInputs.forEach(input => {
    input.addEventListener('change', () => {
      persistCurrentSettings();
    });
  });

  // Start Crawl Button
  btnStartCrawl.addEventListener('click', async () => {
    const rawUrl = inputUrl.value.trim();
    if (!rawUrl) {
      showStatus('Please enter a website URL', 'error');
      inputUrl.focus();
      return;
    }

    const normalized = normalizeUrl(rawUrl);
    if (!normalized) {
      showStatus('Invalid URL. Please include http:// or https://', 'error');
      inputUrl.focus();
      return;
    }

    await saveLastUrl(normalized);
    await persistCurrentSettings();

    // Open crawler dashboard with autoStart
    chrome.runtime.sendMessage({
      action: 'OPEN_DASHBOARD',
      params: {
        url: normalized,
        autoStart: true,
        mode: selectCrawlMode.value
      }
    }, () => {
      window.close();
    });
  });

  // Open Dashboard Button
  btnOpenDashboard.addEventListener('click', async () => {
    const rawUrl = inputUrl.value.trim();
    const normalized = rawUrl ? normalizeUrl(rawUrl) : '';
    if (normalized) {
      await saveLastUrl(normalized);
    }
    await persistCurrentSettings();

    chrome.runtime.sendMessage({
      action: 'OPEN_DASHBOARD',
      params: {
        url: normalized,
        autoStart: false
      }
    }, () => {
      window.close();
    });
  });

  // Open Options Page
  btnOptions.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  });

  // Clear Cached Data
  btnClearCache.addEventListener('click', async () => {
    await clearCrawlData();
    showStatus('Crawl cache cleared successfully', 'success');
  });

  // Helper Functions
  function populateForm(s) {
    selectCrawlMode.value = s.crawlMode || 'sitemap_and_links';

    // Max Pages
    if ([10, 50, 100, 500].includes(s.maxPages)) {
      selectMaxPages.value = String(s.maxPages);
      inputCustomPages.classList.add('hidden');
    } else {
      selectMaxPages.value = 'custom';
      inputCustomPages.value = s.maxPages;
      inputCustomPages.classList.remove('hidden');
    }

    // Crawl Delay
    if ([0, 250, 500, 1000].includes(s.crawlDelay)) {
      selectCrawlDelay.value = String(s.crawlDelay);
      inputCustomDelay.classList.add('hidden');
    } else {
      selectCrawlDelay.value = 'custom';
      inputCustomDelay.value = s.crawlDelay;
      inputCustomDelay.classList.remove('hidden');
    }

    // Checkboxes
    chkSameDomain.checked = s.sameDomainOnly !== false;
    chkIncludeSubdomains.checked = !!s.includeSubdomains;
    chkFollowLinks.checked = s.followDiscoveredLinks !== false;
    chkExtractMetadata.checked = s.extractMetadata !== false;
    chkExtractHeadings.checked = s.extractHeadings !== false;
    chkExtractLinks.checked = s.extractLinks !== false;
    chkExtractImages.checked = s.extractImages !== false;
    chkExtractStructuredData.checked = s.extractStructuredData !== false;

    updateSummaryBadge();
  }

  function getEffectiveMaxPages() {
    if (selectMaxPages.value === 'custom') {
      const val = parseInt(inputCustomPages.value, 10);
      return (!isNaN(val) && val > 0) ? val : 100;
    }
    return parseInt(selectMaxPages.value, 10) || 100;
  }

  function getEffectiveCrawlDelay() {
    if (selectCrawlDelay.value === 'custom') {
      const val = parseInt(inputCustomDelay.value, 10);
      return (!isNaN(val) && val >= 0) ? val : 500;
    }
    return parseInt(selectCrawlDelay.value, 10) || 0;
  }

  function updateSummaryBadge() {
    const pages = getEffectiveMaxPages();
    const delay = getEffectiveCrawlDelay();
    settingsSummaryBadge.textContent = `${pages} pgs • ${delay}ms`;
  }

  async function persistCurrentSettings() {
    const updated = {
      crawlMode: selectCrawlMode.value,
      maxPages: getEffectiveMaxPages(),
      crawlDelay: getEffectiveCrawlDelay(),
      sameDomainOnly: chkSameDomain.checked,
      includeSubdomains: chkIncludeSubdomains.checked,
      followDiscoveredLinks: chkFollowLinks.checked,
      extractMetadata: chkExtractMetadata.checked,
      extractHeadings: chkExtractHeadings.checked,
      extractLinks: chkExtractLinks.checked,
      extractImages: chkExtractImages.checked,
      extractStructuredData: chkExtractStructuredData.checked
    };
    await saveSettings(updated);
  }

  function showStatus(message, type = 'info') {
    statusBanner.className = `status-banner ${type}`;
    statusBanner.textContent = message;
    statusBanner.classList.remove('hidden');
    setTimeout(() => {
      statusBanner.classList.add('hidden');
    }, 4000);
  }
});
