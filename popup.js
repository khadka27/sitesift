/**
 * Site Data Crawler - Popup Controller
 * Supports Single-Page In-Extension Extraction & Direct Downloads + Multi-Page Crawling
 */

import { getSettings, saveSettings, getLastUrl, saveLastUrl, clearCrawlData, saveRecentSession } from './utils/storage.js';
import { normalizeUrl, getHostname } from './utils/url-utils.js';
import { smartFetch } from './utils/fetcher.js';
import { HtmlParser } from './utils/html-parser.js';
import { Exporter } from './utils/exporter.js';

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const tabSinglePage = document.getElementById('tabSinglePage');
  const tabMultiPage = document.getElementById('tabMultiPage');

  const inputUrl = document.getElementById('inputUrl');
  const btnCurrentTab = document.getElementById('btnCurrentTab');
  const btnMainAction = document.getElementById('btnMainAction');
  const mainActionLabel = document.getElementById('mainActionLabel');
  const mainActionIcon = document.getElementById('mainActionIcon');
  const btnOpenDashboard = document.getElementById('btnOpenDashboard');
  const btnOptions = document.getElementById('btnOptions');
  const btnClearCache = document.getElementById('btnClearCache');
  const statusBanner = document.getElementById('statusBanner');
  const settingsSummaryBadge = document.getElementById('settingsSummaryBadge');

  const activeTabIndicator = document.getElementById('activeTabIndicator');
  const activeTabLabel = document.getElementById('activeTabLabel');

  const extractLoadingState = document.getElementById('extractLoadingState');
  const singlePageResultPanel = document.getElementById('singlePageResultPanel');
  const btnCloseResult = document.getElementById('btnCloseResult');

  // Result Elements
  const resStatusBadge = document.getElementById('resStatusBadge');
  const resLatencyBadge = document.getElementById('resLatencyBadge');
  const resPageTypeBadge = document.getElementById('resPageTypeBadge');
  const resPageTitle = document.getElementById('resPageTitle');
  const resPageUrl = document.getElementById('resPageUrl');
  const resWordCount = document.getElementById('resWordCount');
  const resHeadingsCount = document.getElementById('resHeadingsCount');
  const resLinksCount = document.getElementById('resLinksCount');
  const resImagesCount = document.getElementById('resImagesCount');
  const resContactsCount = document.getElementById('resContactsCount');
  const resLegalBadge = document.getElementById('resLegalBadge');
  const previewBody = document.getElementById('previewBody');
  const previewSummaryBadge = document.getElementById('previewSummaryBadge');

  // Direct Download Buttons
  const btnDlMarkdown = document.getElementById('btnDlMarkdown');
  const btnDlTxt = document.getElementById('btnDlTxt');
  const btnDlCsv = document.getElementById('btnDlCsv');
  const btnDlJson = document.getElementById('btnDlJson');
  const btnDlHtml = document.getElementById('btnDlHtml');
  const btnCopyContent = document.getElementById('btnCopyContent');
  const copyBtnLabel = document.getElementById('copyBtnLabel');

  // Settings Elements
  const selectCrawlMode = document.getElementById('selectCrawlMode');
  const multiPageControlsContainer = document.getElementById('multiPageControlsContainer');
  const selectMaxPages = document.getElementById('selectMaxPages');
  const inputCustomPages = document.getElementById('inputCustomPages');
  const selectCrawlDelay = document.getElementById('selectCrawlDelay');
  const inputCustomDelay = document.getElementById('inputCustomDelay');

  const chkExtractHeadings = document.getElementById('chkExtractHeadings');
  const chkExtractContact = document.getElementById('chkExtractContact');
  const chkExtractLegal = document.getElementById('chkExtractLegal');
  const chkClassifyPageTypes = document.getElementById('chkClassifyPageTypes');
  const chkExtractMetadata = document.getElementById('chkExtractMetadata');
  const chkExtractLinks = document.getElementById('chkExtractLinks');
  const chkExtractImages = document.getElementById('chkExtractImages');
  const chkExtractStructuredData = document.getElementById('chkExtractStructuredData');

  // State
  let currentActiveTab = null;
  let extractedSinglePage = null;
  let currentMode = 'single_page'; // 'single_page' | 'multi_page'

  // Load Settings & Last URL
  const settings = await getSettings();
  const lastUrl = await getLastUrl();

  // Populate Form from settings
  populateForm(settings);

  // Auto-fetch active tab
  await fetchAndDisplayActiveTab(lastUrl);

  // Mode Selection Tabs
  tabSinglePage.addEventListener('click', () => setMode('single_page'));
  tabMultiPage.addEventListener('click', () => setMode('multi_page'));

  function setMode(mode) {
    currentMode = mode;
    if (mode === 'single_page') {
      tabSinglePage.classList.add('active');
      tabSinglePage.setAttribute('aria-selected', 'true');
      tabMultiPage.classList.remove('active');
      tabMultiPage.setAttribute('aria-selected', 'false');
      selectCrawlMode.value = 'single_page';
      multiPageControlsContainer.classList.add('hidden');

      mainActionLabel.textContent = 'Extract Single Page';
      while (mainActionIcon.firstChild) mainActionIcon.removeChild(mainActionIcon.firstChild);
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '13 2 3 14 12 14 11 22 21 10 12 10 13 2');
      polygon.setAttribute('fill', 'currentColor');
      mainActionIcon.appendChild(polygon);
      settingsSummaryBadge.textContent = 'Single Page';
    } else {
      tabMultiPage.classList.add('active');
      tabMultiPage.setAttribute('aria-selected', 'true');
      tabSinglePage.classList.remove('active');
      tabSinglePage.setAttribute('aria-selected', 'false');
      if (selectCrawlMode.value === 'single_page') {
        selectCrawlMode.value = 'sitemap_and_links';
      }
      multiPageControlsContainer.classList.remove('hidden');

      mainActionLabel.textContent = 'Start Deep Crawl';
      while (mainActionIcon.firstChild) mainActionIcon.removeChild(mainActionIcon.firstChild);
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '5 3 19 12 5 21 5 3');
      polygon.setAttribute('fill', 'currentColor');
      mainActionIcon.appendChild(polygon);
      updateMultiPageSummaryBadge();
    }
    persistCurrentSettings();
  }

  async function fetchAndDisplayActiveTab(fallbackUrl = '') {
    try {
      let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0 || !tabs[0].url || !/^https?:\/\//i.test(tabs[0].url)) {
        tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      }

      if (tabs && tabs[0] && tabs[0].url && /^https?:\/\//i.test(tabs[0].url)) {
        currentActiveTab = tabs[0];
        const activeUrl = tabs[0].url;
        inputUrl.value = activeUrl;
        
        const titleSnippet = tabs[0].title ? ` (${tabs[0].title.slice(0, 26)}...)` : '';
        if (activeTabLabel && activeTabIndicator) {
          activeTabLabel.textContent = `Active tab: ${titleSnippet}`;
          activeTabIndicator.classList.remove('hidden');
        }
        await saveLastUrl(activeUrl);
        return true;
      }
    } catch (err) {
      console.warn('[Site Data Crawler] Auto active-tab detection:', err);
    }

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
      showStatus('Loaded active tab URL', 'success');
    } else {
      showStatus('Active tab is not a valid web page', 'error');
    }
  });

  selectCrawlMode.addEventListener('change', () => {
    if (selectCrawlMode.value === 'single_page') {
      setMode('single_page');
    } else {
      setMode('multi_page');
    }
  });

  selectMaxPages.addEventListener('change', () => {
    if (selectMaxPages.value === 'custom') {
      inputCustomPages.classList.remove('hidden');
      inputCustomPages.focus();
    } else {
      inputCustomPages.classList.add('hidden');
    }
    updateMultiPageSummaryBadge();
    persistCurrentSettings();
  });

  inputCustomPages.addEventListener('input', () => {
    updateMultiPageSummaryBadge();
    persistCurrentSettings();
  });

  selectCrawlDelay.addEventListener('change', () => {
    if (selectCrawlDelay.value === 'custom') {
      inputCustomDelay.classList.remove('hidden');
      inputCustomDelay.focus();
    } else {
      inputCustomDelay.classList.add('hidden');
    }
    updateMultiPageSummaryBadge();
    persistCurrentSettings();
  });

  inputCustomDelay.addEventListener('input', () => {
    updateMultiPageSummaryBadge();
    persistCurrentSettings();
  });

  // Extraction filters change
  const extractionFilters = [
    chkExtractHeadings, chkExtractContact, chkExtractLegal, chkClassifyPageTypes,
    chkExtractMetadata, chkExtractLinks, chkExtractImages, chkExtractStructuredData
  ];
  extractionFilters.forEach(input => {
    input.addEventListener('change', () => persistCurrentSettings());
  });

  // Primary Action Button (Extract Single Page OR Start Deep Crawl)
  btnMainAction.addEventListener('click', async () => {
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

    if (currentMode === 'single_page' || selectCrawlMode.value === 'single_page') {
      // Execute Single Page Extraction inside extension popup!
      await executeSinglePageExtraction(normalized);
    } else {
      // Launch full crawler dashboard
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
    }
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

  // Open Settings Page
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
    extractedSinglePage = null;
    singlePageResultPanel.classList.add('hidden');
    showStatus('Crawl cache cleared successfully', 'success');
  });

  // Close Result Panel
  btnCloseResult.addEventListener('click', () => {
    singlePageResultPanel.classList.add('hidden');
  });

  // ==========================================
  // SINGLE PAGE EXTRACTION & DIRECT DOWNLOADS
  // ==========================================

  async function executeSinglePageExtraction(targetUrl) {
    extractLoadingState.classList.remove('hidden');
    singlePageResultPanel.classList.add('hidden');
    btnMainAction.disabled = true;
    const startTime = performance.now();

    try {
      let htmlString = '';
      let isRenderedDom = false;

      // 1. If target matches active tab, try to extract live rendered DOM for SPA compatibility
      if (currentActiveTab && currentActiveTab.url && currentActiveTab.id) {
        const activeNormalized = normalizeUrl(currentActiveTab.url);
        if (activeNormalized === targetUrl) {
          try {
            const resp = await new Promise((resolve) => {
              chrome.runtime.sendMessage({
                action: 'FETCH_RENDERED_DOM',
                tabId: currentActiveTab.id
              }, resolve);
            });
            if (resp && resp.success && resp.html) {
              htmlString = resp.html;
              isRenderedDom = true;
            }
          } catch (err) {
            console.warn('[Site Data Crawler] Rendered extraction fallback:', err);
          }
        }
      }

      // 2. Otherwise direct smartFetch
      if (!htmlString) {
        const fetchRes = await smartFetch(targetUrl, { timeoutMs: 15000 });
        if (!fetchRes.ok && !fetchRes.text) {
          throw new Error(fetchRes.error || `HTTP ${fetchRes.status} ${fetchRes.statusText || 'Failed to fetch page'}`);
        }
        htmlString = fetchRes.text;
      }

      if (!htmlString) {
        throw new Error('Empty response received from web server.');
      }

      // 3. Parse HTML
      const parseOptions = {
        extractHeadings: chkExtractHeadings.checked,
        extractContactInfo: chkExtractContact.checked,
        extractLegalInfo: chkExtractLegal.checked,
        classifyPageTypes: chkClassifyPageTypes.checked,
        extractMetadata: chkExtractMetadata.checked,
        extractLinks: chkExtractLinks.checked,
        extractImages: chkExtractImages.checked,
        extractStructuredData: chkExtractStructuredData.checked
      };

      const parsed = HtmlParser.parse(htmlString, targetUrl, parseOptions);
      const latencyMs = Math.round(performance.now() - startTime);

      extractedSinglePage = {
        ...parsed,
        httpStatus: 200,
        httpStatusText: 'OK',
        status: 'success',
        responseTimeMs: latencyMs,
        isRenderedDom,
        timestamp: new Date().toISOString()
      };

      // Save lightweight session
      await saveRecentSession({
        siteUrl: targetUrl,
        pages: [extractedSinglePage],
        timestamp: new Date().toISOString(),
        stats: { totalDiscovered: 1, successful: 1, failed: 0 }
      });

      // Display in popup
      renderSinglePageResult(extractedSinglePage);
      showStatus(`Extracted single page in ${latencyMs}ms!`, 'success');
    } catch (err) {
      console.error('[Site Data Crawler] Extraction Error:', err);
      showStatus(`Extraction failed: ${err.message}`, 'error');
    } finally {
      extractLoadingState.classList.add('hidden');
      btnMainAction.disabled = false;
    }
  }

  function renderSinglePageResult(page) {
    resPageTitle.textContent = page.title || 'Untitled Page';
    resPageUrl.textContent = page.url;
    resLatencyBadge.textContent = `${page.responseTimeMs || 0} ms`;
    resPageTypeBadge.textContent = page.pageTypeLabel || 'Standard Page';

    resWordCount.textContent = (page.wordCount ?? 0).toLocaleString();
    
    const h1Count = page.headings?.byLevel?.h1?.length || 0;
    const h2Count = page.headings?.byLevel?.h2?.length || 0;
    const totalHeadings = page.headings?.list?.length || 0;
    resHeadingsCount.textContent = totalHeadings > 0 ? `${totalHeadings} (${h1Count} H1)` : '0';

    const intLinks = page.links?.internal?.length || 0;
    const extLinks = page.links?.external?.length || 0;
    resLinksCount.textContent = `${intLinks + extLinks} (${intLinks} int)`;

    const totalImgs = page.images?.length || 0;
    resImagesCount.textContent = totalImgs;

    const emails = page.contactInfo?.emails || [];
    const phones = page.contactInfo?.phones || [];
    const contactCount = emails.length + phones.length;
    resContactsCount.textContent = contactCount > 0 ? `${contactCount} found` : 'None';

    resLegalBadge.textContent = page.legalInfo?.hasLegalInfo ? 'Detected' : 'None';

    // Content preview body (Rendered safely via DOM nodes for AMO/CSP compliance)
    while (previewBody.firstChild) previewBody.removeChild(previewBody.firstChild);

    const appendTextWithCutPrices = (parent, rawText) => {
      if (!rawText) return;
      const parts = String(rawText).split(/(~~[^~]+~~)/g);
      parts.forEach(part => {
        if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4) {
          const del = document.createElement('del');
          del.className = 'cut-price-preview';
          del.textContent = part.slice(2, -2);
          parent.appendChild(del);
        } else if (part) {
          parent.appendChild(document.createTextNode(part));
        }
      });
    };

    const sections = page.content?.headingSections || [];
    if (sections.length > 0) {
      previewSummaryBadge.textContent = `${sections.length} Sections`;
      sections.forEach((sec, idx) => {
        const secWrap = document.createElement('div');
        secWrap.className = 'preview-sec-block';
        if (idx > 0) secWrap.style.marginTop = '8px';

        const headEl = document.createElement('strong');
        headEl.style.display = 'block';
        headEl.style.color = 'var(--text-primary)';
        headEl.appendChild(document.createTextNode(`[${(sec.level || 'H2').toUpperCase()}] `));
        appendTextWithCutPrices(headEl, sec.heading || '');
        secWrap.appendChild(headEl);

        if (sec.paragraphs && sec.paragraphs.length > 0) {
          sec.paragraphs.slice(0, 4).forEach(p => {
            const pEl = document.createElement('div');
            pEl.style.paddingLeft = '8px';
            pEl.style.color = 'var(--text-secondary)';
            appendTextWithCutPrices(pEl, p);
            secWrap.appendChild(pEl);
          });
          if (sec.paragraphs.length > 4) {
            const moreEl = document.createElement('div');
            moreEl.style.paddingLeft = '8px';
            moreEl.style.color = 'var(--text-muted)';
            moreEl.style.fontStyle = 'italic';
            moreEl.textContent = `... and ${sec.paragraphs.length - 4} more paragraphs`;
            secWrap.appendChild(moreEl);
          }
        }
        previewBody.appendChild(secWrap);
      });
    } else if (page.content?.cleanText) {
      previewSummaryBadge.textContent = 'Plain Content';
      const snippet = page.content.cleanText.slice(0, 800) + (page.content.cleanText.length > 800 ? '...' : '');
      const lines = snippet.split('\n');
      lines.forEach((line, i) => {
        if (i > 0) previewBody.appendChild(document.createElement('br'));
        appendTextWithCutPrices(previewBody, line);
      });
    } else {
      previewSummaryBadge.textContent = 'Empty';
      const emptyEl = document.createElement('span');
      emptyEl.style.color = 'var(--text-muted)';
      emptyEl.textContent = '(No text content extracted)';
      previewBody.appendChild(emptyEl);
    }

    singlePageResultPanel.classList.remove('hidden');
    singlePageResultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ==========================================
  // DIRECT DOWNLOAD ACTIONS (In-Extension)
  // ==========================================

  function getFileSlug(page) {
    const host = getHostname(page.url).replace(/[^a-zA-Z0-9.-]/g, '_') || 'page';
    const titleSlug = (page.title || 'content').toLowerCase().slice(0, 24).replace(/[^a-zA-Z0-9]/g, '_');
    return `${host}_${titleSlug}`;
  }

  // 1. Download Markdown (.md)
  btnDlMarkdown.addEventListener('click', () => {
    if (!extractedSinglePage) return;
    const md = Exporter.generateHeadingContentMarkdownReport({
      siteUrl: extractedSinglePage.url,
      pages: [extractedSinglePage]
    });
    const filename = `${getFileSlug(extractedSinglePage)}.md`;
    Exporter.download(filename, md, 'text/markdown');
    showStatus(`Downloaded ${filename}`, 'success');
  });

  // 2. Download Clean Text (.txt)
  btnDlTxt.addEventListener('click', () => {
    if (!extractedSinglePage) return;
    const txt = Exporter.generateHeadingContentTxtReport({
      siteUrl: extractedSinglePage.url,
      pages: [extractedSinglePage]
    });
    const filename = `${getFileSlug(extractedSinglePage)}.txt`;
    Exporter.download(filename, txt, 'text/plain');
    showStatus(`Downloaded ${filename}`, 'success');
  });

  // 3. Download CSV (.csv)
  btnDlCsv.addEventListener('click', () => {
    if (!extractedSinglePage) return;
    const csv = Exporter.generateCsvReport([extractedSinglePage]);
    const filename = `${getFileSlug(extractedSinglePage)}.csv`;
    Exporter.download(filename, csv, 'text/csv');
    showStatus(`Downloaded ${filename}`, 'success');
  });

  // 4. Download Full JSON (.json)
  btnDlJson.addEventListener('click', () => {
    if (!extractedSinglePage) return;
    const json = Exporter.generateJsonReport({
      siteUrl: extractedSinglePage.url,
      timestamp: extractedSinglePage.timestamp,
      pages: [extractedSinglePage],
      stats: { totalDiscovered: 1, successful: 1, failed: 0 }
    });
    const filename = `${getFileSlug(extractedSinglePage)}.json`;
    Exporter.download(filename, json, 'application/json');
    showStatus(`Downloaded ${filename}`, 'success');
  });

  // 5. Download Clean HTML (.html)
  btnDlHtml.addEventListener('click', () => {
    if (!extractedSinglePage) return;
    const html = Exporter.generateSinglePageHtml(extractedSinglePage);
    const filename = `${getFileSlug(extractedSinglePage)}.html`;
    Exporter.download(filename, html, 'text/html');
    showStatus(`Downloaded ${filename}`, 'success');
  });

  // 6. Copy to Clipboard
  btnCopyContent.addEventListener('click', async () => {
    if (!extractedSinglePage) return;
    const textToCopy = Exporter.generateHeadingContentMarkdownReport({
      siteUrl: extractedSinglePage.url,
      pages: [extractedSinglePage]
    });

    try {
      await navigator.clipboard.writeText(textToCopy);
      copyBtnLabel.textContent = 'Copied! ✓';
      showStatus('Content copied to clipboard!', 'success');
      setTimeout(() => {
        copyBtnLabel.textContent = 'Copy Text';
      }, 2500);
    } catch {
      showStatus('Failed to copy to clipboard', 'error');
    }
  });

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================

  function populateForm(s) {
    const mode = s.crawlMode || 'single_page';
    selectCrawlMode.value = mode;

    if (mode === 'single_page') {
      setMode('single_page');
    } else {
      setMode('multi_page');
    }

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
    chkExtractHeadings.checked = s.extractHeadings !== false;
    chkExtractContact.checked = s.extractContactInfo !== false;
    chkExtractLegal.checked = s.extractLegalInfo !== false;
    chkClassifyPageTypes.checked = s.classifyPageTypes !== false;
    chkExtractMetadata.checked = s.extractMetadata !== false;
    chkExtractLinks.checked = s.extractLinks !== false;
    chkExtractImages.checked = s.extractImages !== false;
    chkExtractStructuredData.checked = s.extractStructuredData !== false;
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

  function updateMultiPageSummaryBadge() {
    const pages = getEffectiveMaxPages();
    const delay = getEffectiveCrawlDelay();
    settingsSummaryBadge.textContent = `${pages} pgs • ${delay}ms`;
  }

  async function persistCurrentSettings() {
    const updated = {
      crawlMode: selectCrawlMode.value,
      maxPages: getEffectiveMaxPages(),
      crawlDelay: getEffectiveCrawlDelay(),
      extractContactInfo: chkExtractContact.checked,
      extractLegalInfo: chkExtractLegal.checked,
      classifyPageTypes: chkClassifyPageTypes.checked,
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
