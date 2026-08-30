/**
 * Site Data Crawler - Dashboard Controller & Crawling Engine
 */

import { SitemapParser } from './utils/sitemap-parser.js';
import { HtmlParser } from './utils/html-parser.js';
import { Exporter } from './utils/exporter.js';
import { getSettings, saveSettings, saveRecentSession, saveLastUrl, getLastUrl } from './utils/storage.js';
import {
  normalizeUrl,
  resolveUrl,
  getHostname,
  getOrigin,
  isAllowedDomain,
  isNonHtmlResource,
  matchesExcludePattern,
  isAllowedByRobots
} from './utils/url-utils.js';

class CrawlerDashboard {
  constructor() {
    // Crawl State
    this.state = 'IDLE'; // 'IDLE' | 'DISCOVERING_SITEMAP' | 'CRAWLING' | 'PAUSED' | 'STOPPED' | 'COMPLETED'
    this.targetUrl = '';
    this.origin = '';
    this.settings = {};
    
    // Queue & Collections
    this.urlQueue = []; // array of { url, depth, source }
    this.queuedUrlsSet = new Set();
    this.visitedUrlsSet = new Set();
    this.crawledPages = []; // array of crawled page objects
    this.activeFetches = 0;
    this.abortController = null;

    // Discovery & SEO
    this.sitemapsList = [];
    this.robotsInfo = { sitemaps: [], disallows: [], allows: [], crawlDelay: null };
    this.auditSummary = {};
    this.duplicateGroups = { titles: new Map(), descriptions: new Map(), canonicals: new Map() };

    // Timing & Metrics
    this.startTime = null;
    this.elapsedTimer = null;
    this.totalResponseTimeMs = 0;
    this.totalResponseCount = 0;

    // Table Pagination & Sorting
    this.currentPage = 1;
    this.pageSize = 50;
    this.sortField = 'id';
    this.sortAsc = true;
    this.searchTerm = '';
    this.statusFilter = 'all';
    this.httpCodeFilter = 'all';

    // Modal Inspection
    this.inspectedPage = null;

    this._bindElements();
    this._attachEventListeners();
  }

  /**
   * Initializes the dashboard.
   */
  async init() {
    this.settings = await getSettings();
    this._populateSettingsModal(this.settings);

    // Read query params from URL (e.g. crawler.html?targetUrl=...&autoStart=true)
    const urlParams = new URLSearchParams(window.location.search);
    const paramUrl = urlParams.get('targetUrl');
    const autoStart = urlParams.get('autoStart') === 'true';

    if (paramUrl) {
      this.dom.targetUrlInput.value = paramUrl;
      if (autoStart) {
        this.startCrawl();
      }
    } else {
      const lastUrl = await getLastUrl();
      if (lastUrl) {
        this.dom.targetUrlInput.value = lastUrl;
      }
    }

    this._updateUiState();
  }

  /**
   * Caches all DOM elements.
   */
  _bindElements() {
    this.dom = {
      // Top Controls
      targetUrlInput: document.getElementById('targetUrlInput'),
      btnFetchCurrentTab: document.getElementById('btnFetchCurrentTab'),
      btnStart: document.getElementById('btnStart'),
      btnStartText: document.getElementById('btnStartText'),
      btnPause: document.getElementById('btnPause'),
      btnPauseText: document.getElementById('btnPauseText'),
      btnStop: document.getElementById('btnStop'),
      btnClear: document.getElementById('btnClear'),
      btnSettingsModal: document.getElementById('btnSettingsModal'),

      // Live Progress
      liveStatusDot: document.getElementById('liveStatusDot'),
      liveStatusText: document.getElementById('liveStatusText'),
      crawlModeBadge: document.getElementById('crawlModeBadge'),
      statElapsed: document.getElementById('statElapsed'),
      statAvgResponse: document.getElementById('statAvgResponse'),
      statQueueCount: document.getElementById('statQueueCount'),
      progressBarFill: document.getElementById('progressBarFill'),
      progressPercentText: document.getElementById('progressPercentText'),
      currentUrlDisplay: document.getElementById('currentUrlDisplay'),
      cntPages: document.getElementById('cntPages'),
      cntSuccess: document.getElementById('cntSuccess'),
      cntFailed: document.getElementById('cntFailed'),
      cntSkipped: document.getElementById('cntSkipped'),

      // Sitemap Discovery
      sitemapStatusBadge: document.getElementById('sitemapStatusBadge'),
      btnToggleSitemapDetails: document.getElementById('btnToggleSitemapDetails'),
      sitemapsFoundCount: document.getElementById('sitemapsFoundCount'),
      sitemapUrlsFoundCount: document.getElementById('sitemapUrlsFoundCount'),
      robotsSitemapsCount: document.getElementById('robotsSitemapsCount'),
      robotsDisallowCount: document.getElementById('robotsDisallowCount'),
      sitemapListWrapper: document.getElementById('sitemapListWrapper'),
      sitemapList: document.getElementById('sitemapList'),

      // Tab Navigation
      tabButtons: document.querySelectorAll('.tab-btn'),
      tabContents: document.querySelectorAll('.tab-content'),
      tabCountUrls: document.getElementById('tabCountUrls'),
      tabCountDuplicates: document.getElementById('tabCountDuplicates'),

      // Table & Toolbar
      tableSearchInput: document.getElementById('tableSearchInput'),
      filterStatus: document.getElementById('filterStatus'),
      filterHttpCode: document.getElementById('filterHttpCode'),
      pageSizeSelect: document.getElementById('pageSizeSelect'),
      urlsTable: document.getElementById('urlsTable'),
      urlsTableBody: document.getElementById('urlsTableBody'),
      paginationInfo: document.getElementById('paginationInfo'),
      btnPrevPage: document.getElementById('btnPrevPage'),
      btnNextPage: document.getElementById('btnNextPage'),
      currentPageNum: document.getElementById('currentPageNum'),

      // SEO Audit Elements
      seoTotalDiscovered: document.getElementById('seoTotalDiscovered'),
      seoCrawledCount: document.getElementById('seoCrawledCount'),
      seoSuccessCount: document.getElementById('seoSuccessCount'),
      seoFailedCount: document.getElementById('seoFailedCount'),
      seoSkippedCount: document.getElementById('seoSkippedCount'),
      seoAvgWords: document.getElementById('seoAvgWords'),
      seoMissingTitle: document.getElementById('seoMissingTitle'),
      seoMissingDesc: document.getElementById('seoMissingDesc'),
      seoDupTitles: document.getElementById('seoDupTitles'),
      seoDupDesc: document.getElementById('seoDupDesc'),
      seoMissingCanonical: document.getElementById('seoMissingCanonical'),
      seoNoindexCount: document.getElementById('seoNoindexCount'),
      seoMissingH1: document.getElementById('seoMissingH1'),
      seoMultipleH1: document.getElementById('seoMultipleH1'),
      seoThinContent: document.getElementById('seoThinContent'),
      seoMissingAlt: document.getElementById('seoMissingAlt'),
      seoTotalImages: document.getElementById('seoTotalImages'),
      seoInternalLinks: document.getElementById('seoInternalLinks'),
      seoExternalLinks: document.getElementById('seoExternalLinks'),
      seoBrokenLinks: document.getElementById('seoBrokenLinks'),
      seoSchemaPages: document.getElementById('seoSchemaPages'),
      seoSchemaTypesList: document.getElementById('seoSchemaTypesList'),

      // Duplicates Container
      duplicateTitlesContainer: document.getElementById('duplicateTitlesContainer'),
      duplicateDescContainer: document.getElementById('duplicateDescContainer'),
      duplicateCanonicalContainer: document.getElementById('duplicateCanonicalContainer'),

      // Export Buttons
      btnExportTxt: document.getElementById('btnExportTxt'),
      btnExportCsv: document.getElementById('btnExportCsv'),
      btnExportJson: document.getElementById('btnExportJson'),
      btnExportXml: document.getElementById('btnExportXml'),

      // Rendered Extraction Tool
      btnExtractActiveTabDom: document.getElementById('btnExtractActiveTabDom'),
      renderedExtractionStatus: document.getElementById('renderedExtractionStatus'),
      renderedResultContainer: document.getElementById('renderedResultContainer'),
      renderedMetaSummary: document.getElementById('renderedMetaSummary'),
      renderedDomPreview: document.getElementById('renderedDomPreview'),

      // Inspection Modal
      inspectModal: document.getElementById('inspectModal'),
      modalUrlTitle: document.getElementById('modalUrlTitle'),
      modalUrlLink: document.getElementById('modalUrlLink'),
      btnCloseModal: document.getElementById('btnCloseModal'),
      btnCloseModalBottom: document.getElementById('btnCloseModalBottom'),
      modalTabBtns: document.querySelectorAll('.modal-tab-btn'),
      modalTabContents: document.querySelectorAll('.modal-tab-content'),
      modalHeadingsCount: document.getElementById('modalHeadingsCount'),
      modalLinksCount: document.getElementById('modalLinksCount'),
      modalImagesCount: document.getElementById('modalImagesCount'),
      modalMetaTitle: document.getElementById('modalMetaTitle'),
      modalMetaDesc: document.getElementById('modalMetaDesc'),
      modalMetaCanonical: document.getElementById('modalMetaCanonical'),
      modalMetaRobots: document.getElementById('modalMetaRobots'),
      modalMetaOgTitle: document.getElementById('modalMetaOgTitle'),
      modalMetaOgDesc: document.getElementById('modalMetaOgDesc'),
      modalMetaStatus: document.getElementById('modalMetaStatus'),
      modalMetaLatency: document.getElementById('modalMetaLatency'),
      modalHeadingsList: document.getElementById('modalHeadingsList'),
      modalWordCount: document.getElementById('modalWordCount'),
      modalCharCount: document.getElementById('modalCharCount'),
      modalParaCount: document.getElementById('modalParaCount'),
      modalContentText: document.getElementById('modalContentText'),
      modalInternalLinksCount: document.getElementById('modalInternalLinksCount'),
      modalInternalLinksList: document.getElementById('modalInternalLinksList'),
      modalExternalLinksCount: document.getElementById('modalExternalLinksCount'),
      modalExternalLinksList: document.getElementById('modalExternalLinksList'),
      modalImagesGrid: document.getElementById('modalImagesGrid'),
      modalJsonLdPre: document.getElementById('modalJsonLdPre'),

      // Settings Modal
      settingsModal: document.getElementById('settingsModal'),
      btnCloseSettingsModal: document.getElementById('btnCloseSettingsModal'),
      btnSaveSettingsModal: document.getElementById('btnSaveSettingsModal'),
      dlgCrawlMode: document.getElementById('dlgCrawlMode'),
      dlgMaxPages: document.getElementById('dlgMaxPages'),
      dlgCrawlDelay: document.getElementById('dlgCrawlDelay'),
      dlgConcurrency: document.getElementById('dlgConcurrency'),
      dlgTimeout: document.getElementById('dlgTimeout'),
      dlgSameDomain: document.getElementById('dlgSameDomain'),
      dlgIncludeSubdomains: document.getElementById('dlgIncludeSubdomains'),
      dlgFollowLinks: document.getElementById('dlgFollowLinks')
    };
  }

  /**
   * Sets up event listeners.
   */
  _attachEventListeners() {
    // Start / Pause / Stop / Clear
    this.dom.btnStart.addEventListener('click', () => this.startCrawl());
    this.dom.btnPause.addEventListener('click', () => this.togglePause());
    this.dom.btnStop.addEventListener('click', () => this.stopCrawl());
    this.dom.btnClear.addEventListener('click', () => this.clearAllData());

    // Use active tab
    this.dom.btnFetchCurrentTab.addEventListener('click', async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tabs && tabs[0] && tabs[0].url && /^https?:\/\//i.test(tabs[0].url)) {
          this.dom.targetUrlInput.value = tabs[0].url;
        }
      } catch {}
    });

    // Toggle sitemap panel
    this.dom.btnToggleSitemapDetails.addEventListener('click', () => {
      const isHidden = this.dom.sitemapListWrapper.style.display === 'none';
      this.dom.sitemapListWrapper.style.display = isHidden ? 'block' : 'none';
    });

    // Tab Navigation
    this.dom.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.dom.tabButtons.forEach(b => b.classList.remove('active'));
        this.dom.tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const targetTab = document.getElementById(btn.dataset.tab);
        if (targetTab) targetTab.classList.add('active');
      });
    });

    // Table Filters & Search
    this.dom.tableSearchInput.addEventListener('input', (e) => {
      this.searchTerm = e.target.value.toLowerCase().trim();
      this.currentPage = 1;
      this._renderTable();
    });

    this.dom.filterStatus.addEventListener('change', (e) => {
      this.statusFilter = e.target.value;
      this.currentPage = 1;
      this._renderTable();
    });

    this.dom.filterHttpCode.addEventListener('change', (e) => {
      this.httpCodeFilter = e.target.value;
      this.currentPage = 1;
      this._renderTable();
    });

    this.dom.pageSizeSelect.addEventListener('change', (e) => {
      this.pageSize = parseInt(e.target.value, 10);
      this.currentPage = 1;
      this._renderTable();
    });

    // Table Sorting
    this.dom.urlsTable.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (this.sortField === field) {
          this.sortAsc = !this.sortAsc;
        } else {
          this.sortField = field;
          this.sortAsc = true;
        }
        this._renderTable();
      });
    });

    // Pagination buttons
    this.dom.btnPrevPage.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this._renderTable();
      }
    });

    this.dom.btnNextPage.addEventListener('click', () => {
      const filtered = this._getFilteredPages();
      const maxPages = Math.ceil(filtered.length / this.pageSize) || 1;
      if (this.currentPage < maxPages) {
        this.currentPage++;
        this._renderTable();
      }
    });

    // Exports
    this.dom.btnExportTxt.addEventListener('click', () => this._handleExport('txt'));
    this.dom.btnExportCsv.addEventListener('click', () => this._handleExport('csv'));
    this.dom.btnExportJson.addEventListener('click', () => this._handleExport('json'));
    this.dom.btnExportXml.addEventListener('click', () => this._handleExport('xml'));

    // Rendered Tab Tool
    this.dom.btnExtractActiveTabDom.addEventListener('click', () => this._handleActiveTabRenderedExtraction());

    // Inspection Modal
    this.dom.btnCloseModal.addEventListener('click', () => this._closeModal());
    this.dom.btnCloseModalBottom.addEventListener('click', () => this._closeModal());
    this.dom.inspectModal.addEventListener('click', (e) => {
      if (e.target === this.dom.inspectModal) this._closeModal();
    });

    this.dom.modalTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.dom.modalTabBtns.forEach(b => b.classList.remove('active'));
        this.dom.modalTabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.modaltab);
        if (target) target.classList.add('active');
      });
    });

    // Settings Modal
    this.dom.btnSettingsModal.addEventListener('click', () => {
      this.dom.settingsModal.classList.remove('hidden');
    });
    this.dom.btnCloseSettingsModal.addEventListener('click', () => {
      this.dom.settingsModal.classList.add('hidden');
    });
    this.dom.btnSaveSettingsModal.addEventListener('click', async () => {
      this.settings = {
        ...this.settings,
        crawlMode: this.dom.dlgCrawlMode.value,
        maxPages: parseInt(this.dom.dlgMaxPages.value, 10) || 100,
        crawlDelay: parseInt(this.dom.dlgCrawlDelay.value, 10) || 0,
        concurrency: parseInt(this.dom.dlgConcurrency.value, 10) || 3,
        timeoutMs: parseInt(this.dom.dlgTimeout.value, 10) || 15000,
        sameDomainOnly: this.dom.dlgSameDomain.checked,
        includeSubdomains: this.dom.dlgIncludeSubdomains.checked,
        followDiscoveredLinks: this.dom.dlgFollowLinks.checked
      };
      await saveSettings(this.settings);
      this.dom.settingsModal.classList.add('hidden');
      this._updateUiState();
    });
  }

  /**
   * Starts or restarts the crawl process.
   */
  async startCrawl() {
    const rawUrl = this.dom.targetUrlInput.value.trim();
    if (!rawUrl) {
      alert('Please enter a valid website URL.');
      this.dom.targetUrlInput.focus();
      return;
    }

    const normalized = normalizeUrl(rawUrl, {
      removeQueryParams: this.settings.ignoreQueryParams
    });

    if (!normalized) {
      alert('Invalid URL format. Please include http:// or https://');
      this.dom.targetUrlInput.focus();
      return;
    }

    this.targetUrl = normalized;
    this.origin = getOrigin(this.targetUrl);
    await saveLastUrl(this.targetUrl);

    // Reset crawl state
    this.state = 'DISCOVERING_SITEMAP';
    this.urlQueue = [];
    this.queuedUrlsSet = new Set();
    this.visitedUrlsSet = new Set();
    this.crawledPages = [];
    this.sitemapsList = [];
    this.activeFetches = 0;
    this.totalResponseTimeMs = 0;
    this.totalResponseCount = 0;
    this.duplicateGroups = { titles: new Map(), descriptions: new Map(), canonicals: new Map() };
    this.abortController = new AbortController();

    this.startTime = Date.now();
    this._startElapsedTimer();
    this._updateUiState();

    try {
      // 1. Discovery Phase (Sitemap & Robots.txt)
      if (this.settings.crawlMode !== 'links_only') {
        this.dom.liveStatusText.textContent = 'Discovering sitemaps & robots.txt...';
        this.dom.sitemapStatusBadge.className = 'badge badge-warning';
        this.dom.sitemapStatusBadge.textContent = 'Checking...';

        const sitemapParser = new SitemapParser({
          timeoutMs: this.settings.timeoutMs,
          onProgress: (p) => {
            this.dom.currentUrlDisplay.textContent = p.message || '';
            this.dom.sitemapsFoundCount.textContent = p.sitemapsCount;
            this.dom.sitemapUrlsFoundCount.textContent = p.urlsCount;
          }
        });

        const discovery = await sitemapParser.discoverAndParse(this.targetUrl);
        this.sitemapsList = discovery.sitemaps;
        this.robotsInfo = discovery.robotsTxt;

        // Render discovered sitemaps
        this._renderSitemapList();

        // Enqueue URLs found from sitemaps
        for (const item of discovery.allUrls) {
          this._enqueueUrl(item.url, 0, item.sourceSitemap);
        }

        this.dom.sitemapStatusBadge.className = discovery.sitemaps.length > 0 ? 'badge badge-success' : 'badge badge-neutral';
        this.dom.sitemapStatusBadge.textContent = discovery.sitemaps.length > 0 ? `${discovery.sitemaps.length} Sitemaps Found` : 'No Sitemap Found';
      }

      // Always ensure the target seed URL is in the queue
      this._enqueueUrl(this.targetUrl, 0, 'seed_input');

      // 2. Transition to Crawling Phase
      this.state = 'CRAWLING';
      this.dom.liveStatusText.textContent = 'Crawling pages...';
      this._updateUiState();

      // Launch concurrent crawler workers
      const concurrency = Math.min(this.settings.concurrency || 3, 10);
      const workers = [];
      for (let i = 0; i < concurrency; i++) {
        workers.push(this._runWorker(i));
      }

      await Promise.all(workers);

      // 3. Completed Phase
      if (this.state !== 'STOPPED') {
        this.state = 'COMPLETED';
        this.dom.liveStatusText.textContent = 'Crawl completed successfully.';
      }
    } catch (err) {
      this.state = 'ERROR';
      this.dom.liveStatusText.textContent = `Crawl failed: ${err.message}`;
    } finally {
      this._stopElapsedTimer();
      this._updateUiState();
      this._recalculateAuditAndDuplicates();
      this._renderTable();
      saveRecentSession({
        siteUrl: this.targetUrl,
        pages: this.crawledPages.slice(0, 100),
        stats: this.auditSummary
      });
    }
  }

  /**
   * Concurrent worker loop.
   */
  async _runWorker(workerId) {
    while (this.state === 'CRAWLING' || this.state === 'PAUSED') {
      if (this.state === 'PAUSED') {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Check max pages limit
      const effectiveMaxPages = this.settings.maxPages || 100;
      if (this.crawledPages.length >= effectiveMaxPages) {
        break;
      }

      // Dequeue next URL
      const item = this.urlQueue.shift();
      if (!item) {
        // If queue is currently empty but other workers are fetching, wait briefly
        if (this.activeFetches > 0) {
          await new Promise(r => setTimeout(r, 200));
          continue;
        } else {
          // All workers idle and queue empty -> done
          break;
        }
      }

      if (this.visitedUrlsSet.has(item.url)) {
        continue;
      }

      this.visitedUrlsSet.add(item.url);
      this.activeFetches++;
      this._updateUiState();

      // Respect robots.txt
      if (!isAllowedByRobots(item.url, this.robotsInfo.disallows, this.robotsInfo.allows)) {
        this._recordPageResult({
          url: item.url,
          status: 'skipped',
          httpStatus: null,
          httpStatusText: 'Disallowed by robots.txt',
          error: 'Blocked by robots.txt disallow rule',
          responseTimeMs: 0
        });
        this.activeFetches--;
        this._updateUiState();
        continue;
      }

      // Respect crawl delay
      const delay = Math.max(this.robotsInfo.crawlDelay || this.settings.crawlDelay || 0, 0);
      if (delay > 0) {
        await new Promise(r => setTimeout(r, delay));
      }

      await this._fetchAndProcessPage(item.url, item.depth);
      this.activeFetches--;
      this._updateUiState();
      this._renderTable();
    }
  }

  /**
   * Fetches and parses a single page URL.
   */
  async _fetchAndProcessPage(url, depth) {
    this.dom.currentUrlDisplay.textContent = url;
    const startTime = performance.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.settings.timeoutMs || 15000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      clearTimeout(timeoutId);

      const latency = Math.round(performance.now() - startTime);
      this.totalResponseTimeMs += latency;
      this.totalResponseCount++;

      const contentType = response.headers.get('content-type') || '';
      const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml+xml');

      if (!response.ok) {
        this._recordPageResult({
          url,
          finalUrl: response.url || url,
          status: 'failed',
          httpStatus: response.status,
          httpStatusText: response.statusText,
          contentType,
          responseTimeMs: latency,
          error: `HTTP error ${response.status} ${response.statusText}`
        });
        return;
      }

      if (!isHtml) {
        this._recordPageResult({
          url,
          finalUrl: response.url || url,
          status: 'skipped',
          httpStatus: response.status,
          httpStatusText: response.statusText,
          contentType,
          responseTimeMs: latency,
          error: `Non-HTML content type (${contentType})`
        });
        return;
      }

      const html = await response.text();
      const parsedData = HtmlParser.parse(html, url, {
        extractImages: this.settings.extractImages,
        extractLinks: this.settings.extractLinks,
        extractMetadata: this.settings.extractMetadata,
        extractHeadings: this.settings.extractHeadings,
        extractStructuredData: this.settings.extractStructuredData,
        includeSubdomains: this.settings.includeSubdomains,
        sameDomainOnly: this.settings.sameDomainOnly
      });

      const pageRecord = {
        ...parsedData,
        finalUrl: response.url || url,
        status: 'success',
        httpStatus: response.status,
        httpStatusText: response.statusText,
        contentType,
        responseTimeMs: latency,
        crawlTimestamp: new Date().toISOString()
      };

      this._recordPageResult(pageRecord);

      // Follow discovered internal links if enabled
      if (this.settings.followDiscoveredLinks && this.settings.crawlMode !== 'sitemap') {
        const internalLinks = parsedData.links?.internal || [];
        const effectiveMax = this.settings.maxPages || 100;

        for (const link of internalLinks) {
          if (this.queuedUrlsSet.size >= effectiveMax * 3) break;
          this._enqueueUrl(link.url, depth + 1, url);
        }
      }
    } catch (err) {
      const latency = Math.round(performance.now() - startTime);
      const isAbort = err.name === 'AbortError';
      this._recordPageResult({
        url,
        status: 'failed',
        httpStatus: null,
        httpStatusText: isAbort ? 'Timeout' : 'Network Error',
        error: isAbort ? 'Request timed out' : (err.message || 'Fetch failed'),
        responseTimeMs: latency
      });
    }
  }

  /**
   * Adds a candidate URL to the crawl queue if valid and unique.
   */
  _enqueueUrl(urlString, depth, source) {
    if (!urlString) return;

    const normalized = normalizeUrl(urlString, {
      removeQueryParams: this.settings.ignoreQueryParams
    });

    if (!normalized) return;
    if (this.queuedUrlsSet.has(normalized) || this.visitedUrlsSet.has(normalized)) return;

    // Filter non-HTML resources (.pdf, .zip, .jpg, etc.)
    if (isNonHtmlResource(normalized)) return;

    // Filter exclude patterns
    if (matchesExcludePattern(normalized, this.settings.excludePatterns)) return;

    // Filter domain scope
    if (!isAllowedDomain(normalized, this.targetUrl, {
      includeSubdomains: this.settings.includeSubdomains,
      sameDomainOnly: this.settings.sameDomainOnly
    })) {
      return;
    }

    this.queuedUrlsSet.add(normalized);
    this.urlQueue.push({ url: normalized, depth, source });
  }

  /**
   * Records a page crawl result and updates running stats.
   */
  _recordPageResult(pageRecord) {
    pageRecord.id = this.crawledPages.length + 1;
    this.crawledPages.push(pageRecord);

    // Track duplicates
    if (pageRecord.title) {
      const list = this.duplicateGroups.titles.get(pageRecord.title) || [];
      list.push(pageRecord.url);
      this.duplicateGroups.titles.set(pageRecord.title, list);
    }
    if (pageRecord.metadata?.description) {
      const list = this.duplicateGroups.descriptions.get(pageRecord.metadata.description) || [];
      list.push(pageRecord.url);
      this.duplicateGroups.descriptions.set(pageRecord.metadata.description, list);
    }
    if (pageRecord.metadata?.canonical) {
      const list = this.duplicateGroups.canonicals.get(pageRecord.metadata.canonical) || [];
      list.push(pageRecord.url);
      this.duplicateGroups.canonicals.set(pageRecord.metadata.canonical, list);
    }

    this._recalculateAuditAndDuplicates();
  }

  /**
   * Toggles pause/resume state.
   */
  togglePause() {
    if (this.state === 'CRAWLING') {
      this.state = 'PAUSED';
      this.dom.btnPauseText.textContent = 'Resume';
      this.dom.liveStatusText.textContent = 'Crawl paused.';
    } else if (this.state === 'PAUSED') {
      this.state = 'CRAWLING';
      this.dom.btnPauseText.textContent = 'Pause';
      this.dom.liveStatusText.textContent = 'Resuming crawl...';
    }
    this._updateUiState();
  }

  /**
   * Stops the crawl immediately.
   */
  stopCrawl() {
    this.state = 'STOPPED';
    this.urlQueue = [];
    if (this.abortController) {
      this.abortController.abort();
    }
    this.dom.liveStatusText.textContent = 'Crawl stopped by user.';
    this._stopElapsedTimer();
    this._updateUiState();
  }

  /**
   * Clears all session data.
   */
  clearAllData() {
    if (this.state === 'CRAWLING') {
      this.stopCrawl();
    }
    this.state = 'IDLE';
    this.urlQueue = [];
    this.queuedUrlsSet.clear();
    this.visitedUrlsSet.clear();
    this.crawledPages = [];
    this.sitemapsList = [];
    this.duplicateGroups = { titles: new Map(), descriptions: new Map(), canonicals: new Map() };
    this.totalResponseTimeMs = 0;
    this.totalResponseCount = 0;

    this.dom.sitemapList.innerHTML = '<li class="sitemap-list-empty">No sitemaps discovered yet. Enter a website URL above and click Start Crawl.</li>';
    this.dom.currentUrlDisplay.textContent = 'Waiting for input...';
    this.dom.progressBarFill.style.width = '0%';
    this.dom.progressPercentText.textContent = '0%';

    this._updateUiState();
    this._recalculateAuditAndDuplicates();
    this._renderTable();
  }

  /**
   * Updates progress bar, counters, and action button states.
   */
  _updateUiState() {
    const isRunning = this.state === 'CRAWLING' || this.state === 'DISCOVERING_SITEMAP';
    const isPaused = this.state === 'PAUSED';

    this.dom.btnStart.disabled = isRunning || isPaused;
    this.dom.btnPause.disabled = !isRunning && !isPaused;
    this.dom.btnStop.disabled = !isRunning && !isPaused;

    // Dot indicator
    this.dom.liveStatusDot.className = 'status-indicator-dot';
    if (isRunning) this.dom.liveStatusDot.classList.add('active');
    else if (isPaused) this.dom.liveStatusDot.classList.add('paused');
    else if (this.state === 'STOPPED' || this.state === 'ERROR') this.dom.liveStatusDot.classList.add('stopped');

    // Counts
    const effectiveMax = this.settings.maxPages || 100;
    const totalDiscovered = this.queuedUrlsSet.size;
    const totalCrawled = this.crawledPages.length;
    const successCount = this.crawledPages.filter(p => p.status === 'success').length;
    const failedCount = this.crawledPages.filter(p => p.status === 'failed').length;
    const skippedCount = this.crawledPages.filter(p => p.status === 'skipped').length;

    this.dom.cntPages.textContent = `${totalCrawled} / ${Math.min(totalDiscovered || effectiveMax, effectiveMax)}`;
    this.dom.cntSuccess.textContent = successCount;
    this.dom.cntFailed.textContent = failedCount;
    this.dom.cntSkipped.textContent = skippedCount;
    this.dom.statQueueCount.textContent = this.urlQueue.length;

    // Progress Bar
    const targetCount = Math.min(totalDiscovered || effectiveMax, effectiveMax);
    const percent = targetCount > 0 ? Math.min(Math.round((totalCrawled / targetCount) * 100), 100) : 0;
    this.dom.progressBarFill.style.width = `${percent}%`;
    this.dom.progressPercentText.textContent = `${percent}%`;

    // Average Response
    const avgLatency = this.totalResponseCount > 0 ? Math.round(this.totalResponseTimeMs / this.totalResponseCount) : 0;
    this.dom.statAvgResponse.textContent = `${avgLatency} ms`;

    // Badges & Tabs
    this.dom.tabCountUrls.textContent = totalCrawled;
    this.dom.crawlModeBadge.textContent = this._formatCrawlMode(this.settings.crawlMode);
  }

  _formatCrawlMode(mode) {
    if (mode === 'sitemap') return 'Sitemap Only';
    if (mode === 'links_only') return 'Links Only';
    return 'Sitemap + Links';
  }

  /**
   * Starts the elapsed timer.
   */
  _startElapsedTimer() {
    this._stopElapsedTimer();
    this.elapsedTimer = setInterval(() => {
      if (!this.startTime) return;
      const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
      const hrs = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
      const mins = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
      const secs = String(elapsedSec % 60).padStart(2, '0');
      this.dom.statElapsed.textContent = `${hrs}:${mins}:${secs}`;
    }, 1000);
  }

  _stopElapsedTimer() {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  /**
   * Renders discovered sitemaps into the discovery panel.
   */
  _renderSitemapList() {
    this.dom.sitemapsFoundCount.textContent = this.sitemapsList.length;
    this.dom.robotsSitemapsCount.textContent = this.robotsInfo.sitemaps.length;
    this.dom.robotsDisallowCount.textContent = this.robotsInfo.disallows.length;

    if (this.sitemapsList.length === 0) {
      this.dom.sitemapList.innerHTML = '<li class="sitemap-list-empty">No sitemaps found. Crawling links directly.</li>';
      return;
    }

    this.dom.sitemapList.innerHTML = this.sitemapsList.map(sm => `
      <li class="sitemap-list-item">
        <span>${sm.url}</span>
        <span class="badge badge-neutral">${sm.urlsCount} URLs (${sm.type})</span>
      </li>
    `).join('');
  }

  /**
   * Filters and sorts crawled pages for the data table.
   */
  _getFilteredPages() {
    let list = [...this.crawledPages];

    // Search filter
    if (this.searchTerm) {
      list = list.filter(p => 
        (p.url && p.url.toLowerCase().includes(this.searchTerm)) ||
        (p.title && p.title.toLowerCase().includes(this.searchTerm))
      );
    }

    // Status filter
    if (this.statusFilter !== 'all') {
      list = list.filter(p => p.status === this.statusFilter);
    }

    // HTTP code filter
    if (this.httpCodeFilter !== 'all') {
      if (this.httpCodeFilter === '200') list = list.filter(p => p.httpStatus === 200);
      else if (this.httpCodeFilter === '3xx') list = list.filter(p => p.httpStatus >= 300 && p.httpStatus < 400);
      else if (this.httpCodeFilter === '404') list = list.filter(p => p.httpStatus === 404);
      else if (this.httpCodeFilter === '4xx') list = list.filter(p => p.httpStatus >= 400 && p.httpStatus < 500);
      else if (this.httpCodeFilter === '5xx') list = list.filter(p => p.httpStatus >= 500);
    }

    // Sort
    list.sort((a, b) => {
      let valA = a[this.sortField];
      let valB = b[this.sortField];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (typeof valA === 'string') {
        return this.sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return this.sortAsc ? (valA - valB) : (valB - valA);
    });

    return list;
  }

  /**
   * Renders the live URL table with pagination.
   */
  _renderTable() {
    const filtered = this._getFilteredPages();
    const totalCount = filtered.length;

    if (totalCount === 0) {
      this.dom.urlsTableBody.innerHTML = `
        <tr class="empty-table-row">
          <td colspan="8">${this.crawledPages.length === 0 ? 'No crawled pages yet.' : 'No pages match current filters.'}</td>
        </tr>
      `;
      this.dom.paginationInfo.textContent = 'Showing 0-0 of 0 URLs';
      this.dom.btnPrevPage.disabled = true;
      this.dom.btnNextPage.disabled = true;
      return;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, totalCount);
    const visiblePages = filtered.slice(startIndex, endIndex);

    this.dom.urlsTableBody.innerHTML = visiblePages.map((page, idx) => {
      const rowNum = startIndex + idx + 1;
      const statusBadge = this._getStatusBadge(page);
      const httpCodeBadge = page.httpStatus ? `<span class="badge ${page.httpStatus === 200 ? 'badge-success' : 'badge-danger'}">${page.httpStatus}</span>` : '<span class="text-subtle">-</span>';

      return `
        <tr>
          <td>${rowNum}</td>
          <td>${statusBadge}</td>
          <td>${httpCodeBadge}</td>
          <td class="table-url-cell" title="${page.url}">
            <a href="${page.url}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: none;">
              ${page.url}
            </a>
          </td>
          <td class="table-title-cell" title="${page.title || ''}">${page.title || '<span class="text-subtle">(None)</span>'}</td>
          <td>${page.wordCount ?? '-'}</td>
          <td>${page.responseTimeMs ? `${page.responseTimeMs} ms` : '-'}</td>
          <td style="text-align: center;">
            <button class="btn-xs btn-outline btn-inspect-row" data-url="${page.url}">
              Inspect
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row inspection handlers
    this.dom.urlsTableBody.querySelectorAll('.btn-inspect-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        const page = this.crawledPages.find(p => p.url === url);
        if (page) this._openModal(page);
      });
    });

    // Update pagination controls
    this.dom.paginationInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${totalCount} URLs`;
    this.dom.currentPageNum.textContent = this.currentPage;
    this.dom.btnPrevPage.disabled = this.currentPage <= 1;
    this.dom.btnNextPage.disabled = endIndex >= totalCount;
  }

  _getStatusBadge(page) {
    if (page.status === 'success') return '<span class="badge badge-success">Success</span>';
    if (page.status === 'failed') return '<span class="badge badge-danger">Failed</span>';
    if (page.status === 'skipped') return '<span class="badge badge-warning">Skipped</span>';
    return '<span class="badge badge-neutral">Queued</span>';
  }

  /**
   * Recalculates SEO Audit metrics and duplicate lists.
   */
  _recalculateAuditAndDuplicates() {
    const pages = this.crawledPages;
    const totalDiscovered = this.queuedUrlsSet.size;
    const crawledCount = pages.length;
    const successPages = pages.filter(p => p.status === 'success' || p.httpStatus === 200);
    const failedPages = pages.filter(p => p.status === 'failed');
    const skippedPages = pages.filter(p => p.status === 'skipped');

    let totalWords = 0;
    let missingTitle = 0;
    let missingDesc = 0;
    let missingCanonical = 0;
    let noindexCount = 0;
    let missingH1 = 0;
    let multipleH1 = 0;
    let thinContent = 0;
    let missingAlt = 0;
    let totalImages = 0;
    let internalLinks = 0;
    let externalLinks = 0;
    let brokenLinks = failedPages.length;
    let schemaPages = 0;
    const allSchemaTypes = new Set();

    for (const page of pages) {
      if (page.wordCount) totalWords += page.wordCount;
      if (!page.title) missingTitle++;
      if (!page.metadata?.description) missingDesc++;
      if (!page.metadata?.canonical) missingCanonical++;
      if (page.metadata?.robots && page.metadata.robots.toLowerCase().includes('noindex')) noindexCount++;

      const h1Count = page.headings?.h1Count || page.headings?.byLevel?.h1?.length || 0;
      if (h1Count === 0) missingH1++;
      else if (h1Count > 1) multipleH1++;

      if (page.wordCount && page.wordCount < 200) thinContent++;

      const imgs = page.images || [];
      totalImages += imgs.length;
      missingAlt += imgs.filter(i => !i.hasAlt).length;

      internalLinks += page.links?.internal?.length || 0;
      externalLinks += page.links?.external?.length || 0;

      if (page.structuredData?.hasStructuredData) {
        schemaPages++;
        (page.structuredData.schemaTypes || []).forEach(t => allSchemaTypes.add(t));
      }
    }

    const avgWords = successPages.length > 0 ? Math.round(totalWords / successPages.length) : 0;

    // Count duplicates
    let dupTitlesCount = 0;
    this.duplicateGroups.titles.forEach(urls => {
      if (urls.length > 1) dupTitlesCount += (urls.length - 1);
    });

    let dupDescCount = 0;
    this.duplicateGroups.descriptions.forEach(urls => {
      if (urls.length > 1) dupDescCount += (urls.length - 1);
    });

    let dupCanonicalCount = 0;
    this.duplicateGroups.canonicals.forEach(urls => {
      if (urls.length > 1) dupCanonicalCount += (urls.length - 1);
    });

    // Populate SEO DOM
    this.dom.seoTotalDiscovered.textContent = totalDiscovered;
    this.dom.seoCrawledCount.textContent = crawledCount;
    this.dom.seoSuccessCount.textContent = successPages.length;
    this.dom.seoFailedCount.textContent = failedPages.length;
    this.dom.seoSkippedCount.textContent = skippedPages.length;
    this.dom.seoAvgWords.textContent = avgWords;

    this.dom.seoMissingTitle.textContent = missingTitle;
    this.dom.seoMissingDesc.textContent = missingDesc;
    this.dom.seoDupTitles.textContent = dupTitlesCount;
    this.dom.seoDupDesc.textContent = dupDescCount;
    this.dom.seoMissingCanonical.textContent = missingCanonical;
    this.dom.seoNoindexCount.textContent = noindexCount;

    this.dom.seoMissingH1.textContent = missingH1;
    this.dom.seoMultipleH1.textContent = multipleH1;
    this.dom.seoThinContent.textContent = thinContent;
    this.dom.seoMissingAlt.textContent = missingAlt;
    this.dom.seoTotalImages.textContent = totalImages;

    this.dom.seoInternalLinks.textContent = internalLinks;
    this.dom.seoExternalLinks.textContent = externalLinks;
    this.dom.seoBrokenLinks.textContent = brokenLinks;
    this.dom.seoSchemaPages.textContent = schemaPages;
    this.dom.seoSchemaTypesList.textContent = allSchemaTypes.size > 0 ? Array.from(allSchemaTypes).join(', ') : 'None';

    this.dom.tabCountDuplicates.textContent = dupTitlesCount + dupDescCount;

    // Render Duplicates Tab
    this._renderDuplicateGroups();

    this.auditSummary = {
      totalDiscovered, crawledCount, successful: successPages.length, failed: failedPages.length,
      skipped: skippedPages.length, avgWordCount: avgWords, missingTitle, missingDesc,
      dupTitlesCount, dupDescCount, missingH1, multipleH1, totalImages, missingAlt,
      schemaPages, internalLinks, externalLinks
    };
  }

  /**
   * Renders duplicate group cards.
   */
  _renderDuplicateGroups() {
    this._renderDupContainer(this.dom.duplicateTitlesContainer, this.duplicateGroups.titles, 'Title');
    this._renderDupContainer(this.dom.duplicateDescContainer, this.duplicateGroups.descriptions, 'Description');
    this._renderDupContainer(this.dom.duplicateCanonicalContainer, this.duplicateGroups.canonicals, 'Canonical URL');
  }

  _renderDupContainer(container, groupMap, label) {
    const duplicates = [];
    groupMap.forEach((urls, key) => {
      if (urls.length > 1 && key.trim()) {
        duplicates.push({ key, urls });
      }
    });

    if (duplicates.length === 0) {
      container.innerHTML = `<p class="text-muted">No duplicate ${label.toLowerCase()}s detected.</p>`;
      return;
    }

    container.innerHTML = duplicates.map(item => `
      <div class="dup-group-box">
        <div class="dup-group-title">${label}: "${item.key}" (${item.urls.length} pages)</div>
        <ul class="dup-url-list">
          ${item.urls.map(u => `<li>${u}</li>`).join('')}
        </ul>
      </div>
    `).join('');
  }

  /**
   * Opens the inspection modal for a page record.
   */
  _openModal(page) {
    this.inspectedPage = page;

    this.dom.modalUrlTitle.textContent = page.title || 'Page Details';
    this.dom.modalUrlLink.textContent = page.url;
    this.dom.modalUrlLink.href = page.url;

    // Overview Tab
    this.dom.modalMetaTitle.textContent = page.title || '(None)';
    this.dom.modalMetaDesc.textContent = page.metadata?.description || '(None)';
    this.dom.modalMetaCanonical.textContent = page.metadata?.canonical || '(None)';
    this.dom.modalMetaRobots.textContent = page.metadata?.robots || '(None)';
    this.dom.modalMetaOgTitle.textContent = page.metadata?.openGraph?.title || '(None)';
    this.dom.modalMetaOgDesc.textContent = page.metadata?.openGraph?.description || '(None)';
    this.dom.modalMetaStatus.textContent = `${page.httpStatus || page.status} (${page.httpStatusText || ''})`;
    this.dom.modalMetaLatency.textContent = page.responseTimeMs ? `${page.responseTimeMs} ms` : 'N/A';

    // Headings Tab
    const headings = page.headings?.list || [];
    this.dom.modalHeadingsCount.textContent = headings.length;
    if (headings.length === 0) {
      this.dom.modalHeadingsList.innerHTML = '<li class="text-muted">No H1-H6 headings found on this page.</li>';
    } else {
      this.dom.modalHeadingsList.innerHTML = headings.map(h => `
        <li class="heading-item" style="padding-left: ${(parseInt(h.level.slice(1), 10) - 1) * 12}px;">
          <span class="heading-tag">${h.level.toUpperCase()}</span>
          <span>${h.text}</span>
        </li>
      `).join('');
    }

    // Content Tab
    this.dom.modalWordCount.textContent = page.wordCount ?? 0;
    this.dom.modalCharCount.textContent = page.characterCount ?? 0;
    this.dom.modalParaCount.textContent = page.paragraphCount ?? 0;
    this.dom.modalContentText.textContent = page.content?.cleanText || '(No text content extracted)';

    // Links Tab
    const internal = page.links?.internal || [];
    const external = page.links?.external || [];
    this.dom.modalLinksCount.textContent = internal.length + external.length;
    this.dom.modalInternalLinksCount.textContent = internal.length;
    this.dom.modalExternalLinksCount.textContent = external.length;

    this.dom.modalInternalLinksList.innerHTML = internal.length > 0
      ? internal.map(l => `<li><a href="${l.url}" target="_blank">${l.url}</a> ${l.anchorText ? `["${l.anchorText}"]` : ''}</li>`).join('')
      : '<li class="text-muted">No internal links.</li>';

    this.dom.modalExternalLinksList.innerHTML = external.length > 0
      ? external.map(l => `<li><a href="${l.url}" target="_blank">${l.url}</a> ${l.anchorText ? `["${l.anchorText}"]` : ''}</li>`).join('')
      : '<li class="text-muted">No external links.</li>';

    // Images Tab
    const images = page.images || [];
    this.dom.modalImagesCount.textContent = images.length;
    if (images.length === 0) {
      this.dom.modalImagesGrid.innerHTML = '<p class="text-muted">No images extracted.</p>';
    } else {
      this.dom.modalImagesGrid.innerHTML = images.map(img => `
        <div class="modal-image-card">
          <img src="${img.url}" class="modal-image-thumb" loading="lazy" onerror="this.src='icons/icon48.png'">
          <div><strong>Alt:</strong> ${img.alt || '<span class="text-danger">MISSING</span>'}</div>
          <div><strong>Dimensions:</strong> ${img.width && img.height ? `${img.width}x${img.height}` : 'N/A'}</div>
          <div style="word-break: break-all;"><a href="${img.url}" target="_blank">${img.url}</a></div>
        </div>
      `).join('');
    }

    // Schema Tab
    const jsonLd = page.structuredData?.jsonLd || [];
    if (jsonLd.length > 0) {
      this.dom.modalJsonLdPre.textContent = JSON.stringify(jsonLd, null, 2);
    } else {
      this.dom.modalJsonLdPre.textContent = '// No JSON-LD structured data detected on this page.';
    }

    this.dom.inspectModal.classList.remove('hidden');
  }

  _closeModal() {
    this.dom.inspectModal.classList.add('hidden');
    this.inspectedPage = null;
  }

  /**
   * Handles multi-format export triggers.
   */
  _handleExport(format) {
    if (this.crawledPages.length === 0) {
      alert('No crawl data available to export. Please run a crawl first.');
      return;
    }

    const host = getHostname(this.targetUrl) || 'crawl-report';
    const dateStr = new Date().toISOString().slice(0, 10);
    const baseFilename = `${host}_${dateStr}`;

    const crawlExportData = {
      siteUrl: this.targetUrl,
      timestamp: new Date().toISOString(),
      duration: this.dom.statElapsed.textContent,
      stats: this.auditSummary,
      pages: this.crawledPages
    };

    if (format === 'txt') {
      const content = Exporter.generateTxtReport(crawlExportData);
      Exporter.download(`${baseFilename}_report.txt`, content, 'text/plain');
    } else if (format === 'csv') {
      const content = Exporter.generateCsvReport(this.crawledPages);
      Exporter.download(`${baseFilename}_pages.csv`, content, 'text/csv');
    } else if (format === 'json') {
      const content = Exporter.generateJsonReport(crawlExportData);
      Exporter.download(`${baseFilename}_data.json`, content, 'application/json');
    } else if (format === 'xml') {
      const content = Exporter.generateSitemapXml(this.crawledPages);
      Exporter.download(`${baseFilename}_sitemap.xml`, content, 'application/xml');
    }
  }

  /**
   * Executes active tab rendered extraction via background script.
   */
  async _handleActiveTabRenderedExtraction() {
    this.dom.renderedExtractionStatus.textContent = 'Querying active tab...';
    this.dom.btnExtractActiveTabDom.disabled = true;

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || !tabs[0] || !tabs[0].id) {
        throw new Error('No active browser tab detected.');
      }

      const activeTab = tabs[0];
      this.dom.renderedExtractionStatus.textContent = `Extracting rendered DOM from ${activeTab.url}...`;

      chrome.runtime.sendMessage({
        action: 'FETCH_RENDERED_DOM',
        tabId: activeTab.id
      }, (response) => {
        this.dom.btnExtractActiveTabDom.disabled = false;
        if (!response || !response.success) {
          this.dom.renderedExtractionStatus.textContent = `Failed: ${response?.error || 'Unknown error'}`;
          return;
        }

        const html = response.html;
        const parsed = HtmlParser.parse(html, activeTab.url);

        this.dom.renderedExtractionStatus.textContent = `Extracted successfully (${parsed.wordCount} words, ${parsed.headings.list.length} headings)`;
        this.dom.renderedResultContainer.classList.remove('hidden');

        this.dom.renderedMetaSummary.innerHTML = `
          <div class="card" style="margin-bottom: 8px;">
            <div><strong>Page Title:</strong> ${parsed.title || '(None)'}</div>
            <div><strong>Word Count:</strong> ${parsed.wordCount} words</div>
            <div><strong>Headings:</strong> H1 (${parsed.headings.byLevel.h1?.length || 0}), H2 (${parsed.headings.byLevel.h2?.length || 0})</div>
            <div><strong>Internal Links:</strong> ${parsed.links.internal.length} | <strong>Images:</strong> ${parsed.images.length}</div>
          </div>
        `;
        this.dom.renderedDomPreview.value = html.slice(0, 10000) + (html.length > 10000 ? '\n\n...[Truncated preview]...' : '');
      });
    } catch (err) {
      this.dom.btnExtractActiveTabDom.disabled = false;
      this.dom.renderedExtractionStatus.textContent = `Error: ${err.message}`;
    }
  }

  /**
   * Helper to populate settings modal fields.
   */
  _populateSettingsModal(s) {
    this.dom.dlgCrawlMode.value = s.crawlMode || 'sitemap_and_links';
    this.dom.dlgMaxPages.value = s.maxPages || 100;
    this.dom.dlgCrawlDelay.value = s.crawlDelay ?? 500;
    this.dom.dlgConcurrency.value = s.concurrency || 3;
    this.dom.dlgTimeout.value = s.timeoutMs || 15000;
    this.dom.dlgSameDomain.checked = s.sameDomainOnly !== false;
    this.dom.dlgIncludeSubdomains.checked = !!s.includeSubdomains;
    this.dom.dlgFollowLinks.checked = s.followDiscoveredLinks !== false;
  }
}

// Instantiate dashboard on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new CrawlerDashboard();
  app.init();
});
