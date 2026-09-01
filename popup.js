/**
 * Site Data Crawler - Popup Controller
 * Supports Single-Page In-Extension Extraction & Direct Downloads + Multi-Page Crawling
 */

import { getSettings, saveSettings, getLastUrl, saveLastUrl, clearCrawlData, saveRecentSession } from './utils/storage.js';
import { normalizeUrl, getHostname, isAllowedDomain, isNonHtmlResource, matchesExcludePattern } from './utils/url-utils.js';
import { smartFetch } from './utils/fetcher.js';
import { HtmlParser } from './utils/html-parser.js';
import { Exporter } from './utils/exporter.js';

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const tabSinglePage = document.getElementById('tabSinglePage');
  const tabPageLinks = document.getElementById('tabPageLinks');
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
  let currentExtractedPages = [];
  let currentMode = 'single_page'; // 'single_page' | 'page_links' | 'multi_page'

  // Load Settings & Last URL
  const settings = await getSettings();
  const lastUrl = await getLastUrl();

  // Populate Form from settings
  populateForm(settings);

  // Auto-fetch active tab
  await fetchAndDisplayActiveTab(lastUrl);

  // Mode Selection Tabs
  tabSinglePage.addEventListener('click', () => setMode('single_page'));
  if (tabPageLinks) {
    tabPageLinks.addEventListener('click', () => setMode('page_links'));
  }
  tabMultiPage.addEventListener('click', () => setMode('multi_page'));

  function setMode(mode) {
    currentMode = mode;
    tabSinglePage.classList.toggle('active', mode === 'single_page');
    tabSinglePage.setAttribute('aria-selected', String(mode === 'single_page'));
    if (tabPageLinks) {
      tabPageLinks.classList.toggle('active', mode === 'page_links');
      tabPageLinks.setAttribute('aria-selected', String(mode === 'page_links'));
    }
    tabMultiPage.classList.toggle('active', mode === 'multi_page');
    tabMultiPage.setAttribute('aria-selected', String(mode === 'multi_page'));

    if (mode === 'single_page') {
      selectCrawlMode.value = 'single_page';
      multiPageControlsContainer.classList.add('hidden');

      mainActionLabel.textContent = 'Extract & Auto-Download (.TXT)';
      while (mainActionIcon.firstChild) mainActionIcon.removeChild(mainActionIcon.firstChild);
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '13 2 3 14 12 14 11 22 21 10 12 10 13 2');
      polygon.setAttribute('fill', 'currentColor');
      mainActionIcon.appendChild(polygon);
      settingsSummaryBadge.textContent = 'Single Page';
    } else if (mode === 'page_links') {
      selectCrawlMode.value = 'page_links';
      multiPageControlsContainer.classList.remove('hidden');

      mainActionLabel.textContent = 'Crawl Page Links & Auto-Download (.TXT)';
      while (mainActionIcon.firstChild) mainActionIcon.removeChild(mainActionIcon.firstChild);
      const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path1.setAttribute('d', 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71');
      path1.setAttribute('stroke', 'currentColor');
      path1.setAttribute('stroke-width', '2');
      path1.setAttribute('fill', 'none');
      const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path2.setAttribute('d', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71');
      path2.setAttribute('stroke', 'currentColor');
      path2.setAttribute('stroke-width', '2');
      path2.setAttribute('fill', 'none');
      mainActionIcon.appendChild(path1);
      mainActionIcon.appendChild(path2);
      updateMultiPageSummaryBadge();
    } else {
      if (selectCrawlMode.value === 'single_page' || selectCrawlMode.value === 'page_links') {
        selectCrawlMode.value = 'sitemap_and_links';
      }
      multiPageControlsContainer.classList.remove('hidden');

      mainActionLabel.textContent = 'Start Deep Site Crawl';
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
    } else if (selectCrawlMode.value === 'page_links') {
      setMode('page_links');
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

  // Primary Action Button (Single Page Extract OR Page Links Crawl OR Launch Dashboard)
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
      // Execute Single Page Extraction inside extension popup
      await executeSinglePageExtraction(normalized);
    } else if (currentMode === 'page_links' || selectCrawlMode.value === 'page_links') {
      // Execute Page & All Links Crawl inside extension popup
      await executePageAndLinksCrawl(normalized);
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
      currentExtractedPages = [extractedSinglePage];
      renderSinglePageResult(extractedSinglePage);

      // Auto-download clean text (.txt) without needing manual button click or prompt
      const txt = Exporter.generateHeadingContentTxtReport({
        siteUrl: extractedSinglePage.url,
        pages: [extractedSinglePage]
      });
      const filename = `${getFileSlug(extractedSinglePage)}.txt`;
      Exporter.download(filename, txt, 'text/plain', false);

      showStatus(`Extracted & Auto-Downloaded ${filename} (${latencyMs}ms)!`, 'success');
    } catch (err) {
      console.error('[Site Data Crawler] Extraction Error:', err);
      showStatus(`Extraction failed: ${err.message}`, 'error');
    } finally {
      extractLoadingState.classList.add('hidden');
      btnMainAction.disabled = false;
    }
  }

  // ==========================================
  // PAGE & DISCOVERED LINKS CRAWLER (In-Extension)
  // ==========================================

  async function executePageAndLinksCrawl(targetUrl) {
    extractLoadingState.classList.remove('hidden');
    singlePageResultPanel.classList.add('hidden');
    btnMainAction.disabled = true;

    const loadingTitle = extractLoadingState.querySelector('.loading-title');
    const loadingSubtitle = extractLoadingState.querySelector('.loading-subtitle');
    if (loadingTitle) loadingTitle.textContent = 'Crawling Page & Discovered Links...';
    if (loadingSubtitle) loadingSubtitle.textContent = 'Step 1/2: Extracting seed page & discovering internal links...';

    const startTime = performance.now();

    try {
      let seedHtml = '';
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
              seedHtml = resp.html;
              isRenderedDom = true;
            }
          } catch (err) {
            console.warn('[Site Data Crawler] Rendered extraction fallback:', err);
          }
        }
      }

      // 2. Direct fetch if rendered DOM wasn't obtained
      if (!seedHtml) {
        const fetchRes = await smartFetch(targetUrl, { timeoutMs: 15000 });
        if (!fetchRes.ok && !fetchRes.text) {
          throw new Error(fetchRes.error || `HTTP ${fetchRes.status} ${fetchRes.statusText || 'Failed to fetch seed page'}`);
        }
        seedHtml = fetchRes.text;
      }

      if (!seedHtml) {
        throw new Error('Empty response received from target URL.');
      }

      // 3. Parse seed HTML
      const parseOptions = {
        extractHeadings: chkExtractHeadings.checked,
        extractContactInfo: chkExtractContact.checked,
        extractLegalInfo: chkExtractLegal.checked,
        classifyPageTypes: chkClassifyPageTypes.checked,
        extractMetadata: chkExtractMetadata.checked,
        extractLinks: true, // Required to discover links on page
        extractImages: chkExtractImages.checked,
        extractStructuredData: chkExtractStructuredData.checked
      };

      const parsedSeed = HtmlParser.parse(seedHtml, targetUrl, parseOptions);
      const seedLatency = Math.round(performance.now() - startTime);

      const seedPageRecord = {
        ...parsedSeed,
        httpStatus: 200,
        httpStatusText: 'OK',
        status: 'success',
        responseTimeMs: seedLatency,
        isRenderedDom,
        timestamp: new Date().toISOString()
      };

      // 4. Discover and filter all internal links from the seed page
      const internalLinks = parsedSeed.links?.internal || [];
      const currentSettings = await getSettings();
      const excludePatterns = currentSettings.excludePatterns || [];
      const maxPages = getEffectiveMaxPages() || 50;
      const crawlDelay = getEffectiveCrawlDelay() || 100;

      const linkQueue = [];
      const visited = new Set([targetUrl]);

      for (const item of internalLinks) {
        const linkUrl = normalizeUrl(item.url, { removeQueryParams: currentSettings.ignoreQueryParams !== false });
        if (
          linkUrl &&
          !visited.has(linkUrl) &&
          !isNonHtmlResource(linkUrl) &&
          isAllowedDomain(linkUrl, targetUrl, { sameDomainOnly: currentSettings.sameDomainOnly !== false }) &&
          !matchesExcludePattern(linkUrl, excludePatterns)
        ) {
          visited.add(linkUrl);
          linkQueue.push(linkUrl);
          if (linkQueue.length >= maxPages) break;
        }
      }

      const allCrawledPages = [seedPageRecord];
      const totalToCrawl = linkQueue.length;

      // 5. Crawl discovered links from the seed page
      if (totalToCrawl > 0) {
        for (let i = 0; i < linkQueue.length; i++) {
          const nextUrl = linkQueue[i];
          const displayUrl = nextUrl.replace(/^https?:\/\//i, '').slice(0, 30);
          if (loadingSubtitle) {
            loadingSubtitle.textContent = `[${i + 1}/${totalToCrawl}] Crawling: ${displayUrl}...`;
          }

          if (crawlDelay > 0 && i > 0) {
            await new Promise(r => setTimeout(r, crawlDelay));
          }

          try {
            const pageStart = performance.now();
            const res = await smartFetch(nextUrl, { timeoutMs: 12000 });
            const pageLatency = Math.round(performance.now() - pageStart);

            if (res.ok && res.text) {
              const parsedPage = HtmlParser.parse(res.text, nextUrl, parseOptions);
              allCrawledPages.push({
                ...parsedPage,
                httpStatus: res.status || 200,
                httpStatusText: res.statusText || 'OK',
                status: 'success',
                responseTimeMs: pageLatency,
                timestamp: new Date().toISOString()
              });
            }
          } catch (fetchErr) {
            console.warn(`[Site Data Crawler] Skipped link ${nextUrl}:`, fetchErr);
          }
        }
      }

      const totalDurationMs = Math.round(performance.now() - startTime);

      // 6. Save Session
      await saveRecentSession({
        siteUrl: targetUrl,
        pages: allCrawledPages,
        timestamp: new Date().toISOString(),
        stats: { totalDiscovered: allCrawledPages.length, successful: allCrawledPages.length, failed: 0 }
      });

      // 7. Render combined results in Popup
      extractedSinglePage = seedPageRecord;
      currentExtractedPages = allCrawledPages;
      renderCrawledPagesResult(seedPageRecord, allCrawledPages, totalDurationMs);

      // 8. Auto-Download Combined Headings TXT Report for all crawled pages
      const txt = Exporter.generateHeadingContentTxtReport({
        siteUrl: targetUrl,
        pages: allCrawledPages
      });
      const filename = `${getFileSlug(seedPageRecord, true)}.txt`;
      Exporter.download(filename, txt, 'text/plain', false);

      showStatus(`Crawled ${allCrawledPages.length} pages & Auto-Downloaded ${filename} in ${(totalDurationMs / 1000).toFixed(1)}s!`, 'success');
    } catch (err) {
      console.error('[Site Data Crawler] Link Crawl Error:', err);
      showStatus(`Crawl failed: ${err.message}`, 'error');
    } finally {
      extractLoadingState.classList.add('hidden');
      if (loadingTitle) loadingTitle.textContent = 'Extracting Page Content...';
      if (loadingSubtitle) loadingSubtitle.textContent = 'Parsing DOM hierarchy, text & pricing';
      btnMainAction.disabled = false;
    }
  }

  function renderCrawledPagesResult(seedPage, allPages, totalDurationMs) {
    const isMulti = allPages.length > 1;
    resPageTitle.textContent = isMulti ? `${seedPage.title || 'Seed Page'} (+${allPages.length - 1} linked pages)` : (seedPage.title || 'Untitled Page');
    resPageUrl.textContent = seedPage.url;
    resStatusBadge.textContent = `${allPages.length} Pages OK`;
    resStatusBadge.className = 'badge badge-success';
    resLatencyBadge.textContent = `${(totalDurationMs / 1000).toFixed(1)} s`;
    resPageTypeBadge.textContent = isMulti ? `${allPages.length} Pages Crawled` : (seedPage.pageTypeLabel || 'Standard Page');

    // Aggregate metrics
    let totalWords = 0;
    let totalHeadings = 0;
    let totalLinks = 0;
    let totalImages = 0;
    let totalContacts = 0;

    allPages.forEach(p => {
      totalWords += p.wordCount || 0;
      totalHeadings += p.headings?.list?.length || 0;
      totalLinks += (p.links?.internal?.length || 0) + (p.links?.external?.length || 0);
      totalImages += p.images?.length || 0;
      totalContacts += (p.contactInfo?.emails?.length || 0) + (p.contactInfo?.phones?.length || 0);
    });

    resWordCount.textContent = totalWords.toLocaleString();
    resHeadingsCount.textContent = `${totalHeadings} total`;
    resLinksCount.textContent = `${totalLinks} total`;
    resImagesCount.textContent = totalImages.toLocaleString();
    resContactsCount.textContent = totalContacts > 0 ? `${totalContacts} found` : 'None';
    resLegalBadge.textContent = allPages.some(p => p.legalInfo?.hasLegalInfo) ? 'Detected' : 'None';

    // Content preview body (Rendered safely via DOM nodes for AMO/CSP compliance)
    while (previewBody.firstChild) previewBody.removeChild(previewBody.firstChild);

    previewSummaryBadge.textContent = `${allPages.length} Pages • ${totalWords.toLocaleString()} Words`;

    allPages.forEach((page, pageIdx) => {
      const pageHeader = document.createElement('div');
      pageHeader.style.padding = '6px 8px';
      pageHeader.style.margin = pageIdx > 0 ? '10px 0 4px' : '0 0 4px';
      pageHeader.style.backgroundColor = 'var(--bg-surface-hover)';
      pageHeader.style.borderRadius = 'var(--radius-xs)';
      pageHeader.style.borderLeft = '3px solid var(--accent-primary)';

      const pTitle = document.createElement('strong');
      pTitle.style.display = 'block';
      pTitle.style.fontSize = '11.5px';
      pTitle.style.color = 'var(--text-primary)';
      pTitle.textContent = `Page ${pageIdx + 1}: ${page.title || 'Untitled'} (${page.wordCount || 0} words)`;
      pageHeader.appendChild(pTitle);

      const pUrl = document.createElement('span');
      pUrl.style.display = 'block';
      pUrl.style.fontSize = '10px';
      pUrl.style.color = 'var(--text-muted)';
      pUrl.textContent = page.url;
      pageHeader.appendChild(pUrl);

      previewBody.appendChild(pageHeader);

      const sections = page.content?.headingSections || [];
      if (sections.length > 0) {
        sections.slice(0, 3).forEach((sec) => {
          const secWrap = document.createElement('div');
          secWrap.className = 'preview-sec-block';
          secWrap.style.marginTop = '4px';

          const headEl = document.createElement('strong');
          headEl.style.display = 'block';
          headEl.style.fontSize = '11px';
          headEl.style.color = 'var(--text-primary)';
          headEl.textContent = `[${(sec.level || 'H2').toUpperCase()}] ${sec.heading || ''}`;
          secWrap.appendChild(headEl);

          if (sec.paragraphs && sec.paragraphs.length > 0) {
            const pEl = document.createElement('div');
            pEl.style.paddingLeft = '8px';
            pEl.style.fontSize = '10.5px';
            pEl.style.color = 'var(--text-secondary)';
            pEl.textContent = sec.paragraphs[0];
            secWrap.appendChild(pEl);
          }
          previewBody.appendChild(secWrap);
        });
        if (sections.length > 3) {
          const moreEl = document.createElement('div');
          moreEl.style.paddingLeft = '8px';
          moreEl.style.fontSize = '10px';
          moreEl.style.color = 'var(--text-dim)';
          moreEl.style.fontStyle = 'italic';
          moreEl.textContent = `+ ${sections.length - 3} more heading sections in .TXT`;
          previewBody.appendChild(moreEl);
        }
      } else if (page.content?.cleanText) {
        const pEl = document.createElement('div');
        pEl.style.paddingLeft = '8px';
        pEl.style.fontSize = '10.5px';
        pEl.style.color = 'var(--text-secondary)';
        pEl.textContent = page.content.cleanText.slice(0, 180) + '...';
        previewBody.appendChild(pEl);
      }
    });

    singlePageResultPanel.classList.remove('hidden');
    singlePageResultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

  function getFileSlug(page, isMulti = false) {
    const host = getHostname(page.url).replace(/[^a-zA-Z0-9.-]/g, '_') || 'page';
    if (isMulti) {
      return `${host}_page_and_all_links`;
    }
    const titleSlug = (page.title || 'content').toLowerCase().slice(0, 24).replace(/[^a-zA-Z0-9]/g, '_');
    return `${host}_${titleSlug}`;
  }

  function getActiveExportPages() {
    if (currentExtractedPages && currentExtractedPages.length > 0) {
      return currentExtractedPages;
    }
    return extractedSinglePage ? [extractedSinglePage] : [];
  }

  // 1. Download Markdown (.md)
  btnDlMarkdown.addEventListener('click', () => {
    const pages = getActiveExportPages();
    if (pages.length === 0) return;
    const md = Exporter.generateHeadingContentMarkdownReport({
      siteUrl: pages[0].url,
      pages: pages
    });
    const filename = `${getFileSlug(pages[0], pages.length > 1)}.md`;
    Exporter.download(filename, md, 'text/markdown', false);
    showStatus(`Downloaded ${filename}`, 'success');
  });

  // 2. Download Clean Text (.txt)
  btnDlTxt.addEventListener('click', () => {
    const pages = getActiveExportPages();
    if (pages.length === 0) return;
    const txt = Exporter.generateHeadingContentTxtReport({
      siteUrl: pages[0].url,
      pages: pages
    });
    const filename = `${getFileSlug(pages[0], pages.length > 1)}.txt`;
    Exporter.download(filename, txt, 'text/plain', false);
    showStatus(`Downloaded ${filename}`, 'success');
  });

  // 3. Download CSV (.csv)
  btnDlCsv.addEventListener('click', () => {
    const pages = getActiveExportPages();
    if (pages.length === 0) return;
    const csv = Exporter.generateCsvReport(pages);
    const filename = `${getFileSlug(pages[0], pages.length > 1)}.csv`;
    Exporter.download(filename, csv, 'text/csv', false);
    showStatus(`Downloaded ${filename}`, 'success');
  });

  // 4. Download Full JSON (.json)
  btnDlJson.addEventListener('click', () => {
    const pages = getActiveExportPages();
    if (pages.length === 0) return;
    const json = Exporter.generateJsonReport({
      siteUrl: pages[0].url,
      timestamp: pages[0].timestamp || new Date().toISOString(),
      pages: pages,
      stats: { totalDiscovered: pages.length, successful: pages.length, failed: 0 }
    });
    const filename = `${getFileSlug(pages[0], pages.length > 1)}.json`;
    Exporter.download(filename, json, 'application/json', false);
    showStatus(`Downloaded ${filename}`, 'success');
  });

  // 5. Download Clean HTML (.html)
  btnDlHtml.addEventListener('click', () => {
    const pages = getActiveExportPages();
    if (pages.length === 0) return;
    const html = Exporter.generateSinglePageHtml(pages[0]);
    const filename = `${getFileSlug(pages[0], pages.length > 1)}.html`;
    Exporter.download(filename, html, 'text/html', false);
    showStatus(`Downloaded ${filename}`, 'success');
  });

  // 6. Copy to Clipboard
  btnCopyContent.addEventListener('click', async () => {
    const pages = getActiveExportPages();
    if (pages.length === 0) return;
    const textToCopy = Exporter.generateHeadingContentMarkdownReport({
      siteUrl: pages[0].url,
      pages: pages
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
    } else if (mode === 'page_links') {
      setMode('page_links');
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
