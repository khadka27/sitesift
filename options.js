/**
 * Site Data Crawler - Options Page Controller
 */

import { getSettings, saveSettings, clearCrawlData, getStorageBytesUsed, DEFAULT_SETTINGS } from './utils/storage.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const optCrawlMode = document.getElementById('optCrawlMode');
  const optDefaultExportFormat = document.getElementById('optDefaultExportFormat');
  const optMaxPages = document.getElementById('optMaxPages');
  const optCrawlDelay = document.getElementById('optCrawlDelay');
  const optConcurrency = document.getElementById('optConcurrency');
  const optTimeout = document.getElementById('optTimeout');

  const optSameDomain = document.getElementById('optSameDomain');
  const optIncludeSubdomains = document.getElementById('optIncludeSubdomains');
  const optFollowLinks = document.getElementById('optFollowLinks');
  const optPrioritizeLegal = document.getElementById('optPrioritizeLegal');
  const optPrioritizeContact = document.getElementById('optPrioritizeContact');
  const optIgnoreQueryParams = document.getElementById('optIgnoreQueryParams');
  const optExcludePatterns = document.getElementById('optExcludePatterns');

  const optExtractContact = document.getElementById('optExtractContact');
  const optExtractLegal = document.getElementById('optExtractLegal');
  const optClassifyPageTypes = document.getElementById('optClassifyPageTypes');
  const optExtractMetadata = document.getElementById('optExtractMetadata');
  const optExtractHeadings = document.getElementById('optExtractHeadings');
  const optExtractLinks = document.getElementById('optExtractLinks');
  const optExtractImages = document.getElementById('optExtractImages');
  const optExtractStructuredData = document.getElementById('optExtractStructuredData');

  const storageUsageVal = document.getElementById('storageUsageVal');
  const btnClearCache = document.getElementById('btnClearCache');
  const btnResetDefaults = document.getElementById('btnResetDefaults');
  const btnSaveTop = document.getElementById('btnSaveTop');
  const btnSaveBottom = document.getElementById('btnSaveBottom');
  const statusAlert = document.getElementById('statusAlert');

  // Load and populate
  const currentSettings = await getSettings();
  populateForm(currentSettings);
  updateStorageUsage();

  // Save Event Handlers
  btnSaveTop.addEventListener('click', handleSave);
  btnSaveBottom.addEventListener('click', handleSave);

  // Clear Cache
  btnClearCache.addEventListener('click', async () => {
    if (confirm('Clear all cached crawl data and recent sessions?')) {
      await clearCrawlData();
      await updateStorageUsage();
      showAlert('Crawl cache cleared successfully.', 'success');
    }
  });

  // Reset Defaults
  btnResetDefaults.addEventListener('click', async () => {
    if (confirm('Reset all settings to default configuration?')) {
      await saveSettings(DEFAULT_SETTINGS);
      populateForm(DEFAULT_SETTINGS);
      showAlert('Settings reset to defaults.', 'success');
    }
  });

  function populateForm(s) {
    optCrawlMode.value = s.crawlMode || 'single_page';
    if (optDefaultExportFormat) {
      optDefaultExportFormat.value = s.defaultExportFormat || 'markdown';
    }
    optMaxPages.value = s.maxPages || 100;
    optCrawlDelay.value = s.crawlDelay ?? 500;
    optConcurrency.value = s.concurrency || 3;
    optTimeout.value = s.timeoutMs || 15000;

    optSameDomain.checked = s.sameDomainOnly !== false;
    optIncludeSubdomains.checked = !!s.includeSubdomains;
    optFollowLinks.checked = s.followDiscoveredLinks !== false;
    optPrioritizeLegal.checked = s.prioritizeLegalPages !== false;
    optPrioritizeContact.checked = s.prioritizeContactPages !== false;
    optIgnoreQueryParams.checked = s.ignoreQueryParams !== false;

    const patterns = Array.isArray(s.excludePatterns) ? s.excludePatterns.join('\n') : '';
    optExcludePatterns.value = patterns;

    optExtractContact.checked = s.extractContactInfo !== false;
    optExtractLegal.checked = s.extractLegalInfo !== false;
    optClassifyPageTypes.checked = s.classifyPageTypes !== false;
    optExtractMetadata.checked = s.extractMetadata !== false;
    optExtractHeadings.checked = s.extractHeadings !== false;
    optExtractLinks.checked = s.extractLinks !== false;
    optExtractImages.checked = s.extractImages !== false;
    optExtractStructuredData.checked = s.extractStructuredData !== false;
  }

  async function handleSave() {
    const rawPatterns = optExcludePatterns.value.split(/\r?\n/).map(p => p.trim()).filter(Boolean);

    const updated = {
      crawlMode: optCrawlMode.value,
      defaultExportFormat: optDefaultExportFormat ? optDefaultExportFormat.value : 'markdown',
      maxPages: parseInt(optMaxPages.value, 10) || 100,
      crawlDelay: parseInt(optCrawlDelay.value, 10) || 0,
      concurrency: parseInt(optConcurrency.value, 10) || 3,
      timeoutMs: parseInt(optTimeout.value, 10) || 15000,
      sameDomainOnly: optSameDomain.checked,
      includeSubdomains: optIncludeSubdomains.checked,
      followDiscoveredLinks: optFollowLinks.checked,
      prioritizeLegalPages: optPrioritizeLegal.checked,
      prioritizeContactPages: optPrioritizeContact.checked,
      ignoreQueryParams: optIgnoreQueryParams.checked,
      excludePatterns: rawPatterns,
      extractContactInfo: optExtractContact.checked,
      extractLegalInfo: optExtractLegal.checked,
      classifyPageTypes: optClassifyPageTypes.checked,
      extractMetadata: optExtractMetadata.checked,
      extractHeadings: optExtractHeadings.checked,
      extractLinks: optExtractLinks.checked,
      extractImages: optExtractImages.checked,
      extractStructuredData: optExtractStructuredData.checked
    };

    const success = await saveSettings(updated);
    if (success) {
      showAlert('Settings saved successfully.', 'success');
      await updateStorageUsage();
    } else {
      showAlert('Failed to save settings.', 'error');
    }
  }

  async function updateStorageUsage() {
    const bytes = await getStorageBytesUsed();
    if (bytes > 1024 * 1024) {
      storageUsageVal.textContent = `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    } else if (bytes > 1024) {
      storageUsageVal.textContent = `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      storageUsageVal.textContent = `${bytes} Bytes`;
    }
  }

  function showAlert(msg, type = 'success') {
    statusAlert.className = `alert-banner ${type}`;
    statusAlert.textContent = msg;
    statusAlert.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      statusAlert.classList.add('hidden');
    }, 4000);
  }
});
