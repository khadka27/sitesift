/**
 * Site Data Crawler - Dashboard Controller & Crawling Engine
 */

import { SitemapParser } from './utils/sitemap-parser.js';
import { HtmlParser } from './utils/html-parser.js';
import { Exporter } from './utils/exporter.js';
import { smartFetch } from './utils/fetcher.js';
import { getSettings, saveSettings, saveRecentSession, saveLastUrl, getLastUrl } from './utils/storage.js';
import {
  normalizeUrl,
  resolveUrl,
  getHostname,
  getOrigin,
  isAllowedDomain,
  isNonHtmlResource,
  matchesExcludePattern,
  isAllowedByRobots,
  isLegalPageUrl,
  isContactPageUrl,
  classifyUrlType
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
    this.pageTypeFilter = 'all';
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

    // Read query params from URL (e.g. crawler.html?url=...&autoStart=true)
    const urlParams = new URLSearchParams(window.location.search);
    const paramUrl = urlParams.get('targetUrl') || urlParams.get('url') || urlParams.get('site');
    const autoStart = urlParams.get('autoStart') === 'true' || urlParams.get('start') === 'true';

    if (paramUrl) {
      this.dom.targetUrlInput.value = paramUrl;
      if (autoStart) {
        this.startCrawl();
      }
    } else {
      let detectedUrl = '';
      try {
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
          const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
          const webTab = tabs.find(t => t.url && /^https?:\/\//i.test(t.url) && !t.url.includes(chrome.runtime?.id || ''));
          if (webTab && webTab.url) {
            detectedUrl = webTab.url;
          }
        }
      } catch {}

      if (detectedUrl) {
        this.dom.targetUrlInput.value = detectedUrl;
      } else {
        const lastUrl = await getLastUrl();
        if (lastUrl) {
          this.dom.targetUrlInput.value = lastUrl;
        }
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
      filterPageType: document.getElementById('filterPageType'),
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
      auditTermsStatus: document.getElementById('auditTermsStatus'),
      auditPrivacyStatus: document.getElementById('auditPrivacyStatus'),
      auditContactStatus: document.getElementById('auditContactStatus'),
      auditEmailsCount: document.getElementById('auditEmailsCount'),
      auditPhonesCount: document.getElementById('auditPhonesCount'),
      auditSocialsCount: document.getElementById('auditSocialsCount'),

      // Duplicates Container
      duplicateTitlesContainer: document.getElementById('duplicateTitlesContainer'),
      duplicateDescContainer: document.getElementById('duplicateDescContainer'),
      duplicateCanonicalContainer: document.getElementById('duplicateCanonicalContainer'),

      // Export Buttons
      btnExportHeadingTxt: document.getElementById('btnExportHeadingTxt'),
      btnExportHeadingMd: document.getElementById('btnExportHeadingMd'),
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
      modalContactLegalCount: document.getElementById('modalContactLegalCount'),
      modalOverviewPageType: document.getElementById('modalOverviewPageType'),
      modalPageTypeBadge: document.getElementById('modalPageTypeBadge'),
      modalPageTypeDesc: document.getElementById('modalPageTypeDesc'),
      modalLegalLinksList: document.getElementById('modalLegalLinksList'),
      modalEmailsCount: document.getElementById('modalEmailsCount'),
      modalEmailsList: document.getElementById('modalEmailsList'),
      modalPhonesCount: document.getElementById('modalPhonesCount'),
      modalPhonesList: document.getElementById('modalPhonesList'),
      modalSocialsCount: document.getElementById('modalSocialsCount'),
      modalSocialsList: document.getElementById('modalSocialsList'),
      modalCopyrightText: document.getElementById('modalCopyrightText'),
      modalContactFormStatus: document.getElementById('modalContactFormStatus'),
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
      dlgFollowLinks: document.getElementById('dlgFollowLinks'),
      dlgPrioritizeLegal: document.getElementById('dlgPrioritizeLegal'),
      dlgPrioritizeContact: document.getElementById('dlgPrioritizeContact'),
      dlgExtractContact: document.getElementById('dlgExtractContact'),
      dlgExtractLegal: document.getElementById('dlgExtractLegal')
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
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
          const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (tabs && tabs[0] && tabs[0].url && /^https?:\/\//i.test(tabs[0].url)) {
            this.dom.targetUrlInput.value = tabs[0].url;
            return;
          }
        }
      } catch {}

      // Standalone web mode fallback prompt
      const entered = prompt('Enter a website URL to crawl:', this.dom.targetUrlInput.value || 'https://');
      if (entered) {
        this.dom.targetUrlInput.value = entered.trim();
      }
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

    if (this.dom.filterPageType) {
      this.dom.filterPageType.addEventListener('change', (e) => {
        this.pageTypeFilter = e.target.value;
        this.currentPage = 1;
        this._renderTable();
      });
    }

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
    if (this.dom.btnExportHeadingTxt) {
      this.dom.btnExportHeadingTxt.addEventListener('click', () => this._handleExport('heading-txt'));
    }
    if (this.dom.btnExportHeadingMd) {
      this.dom.btnExportHeadingMd.addEventListener('click', () => this._handleExport('heading-md'));
    }
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
        followDiscoveredLinks: this.dom.dlgFollowLinks.checked,
        prioritizeLegalPages: this.dom.dlgPrioritizeLegal ? this.dom.dlgPrioritizeLegal.checked : true,
        prioritizeContactPages: this.dom.dlgPrioritizeContact ? this.dom.dlgPrioritizeContact.checked : true,
        extractContactInfo: this.dom.dlgExtractContact ? this.dom.dlgExtractContact.checked : true,
        extractLegalInfo: this.dom.dlgExtractLegal ? this.dom.dlgExtractLegal.checked : true
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
      if (this.settings.crawlMode !== 'links_only' && this.settings.crawlMode !== 'page_links') {
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
        this.dom.liveStatusText.textContent = 'Crawl completed. Generating .TXT report...';

        // Auto-generate & download TXT report for all crawled pages
        try {
          if (this.crawledPages.length > 0) {
            const crawlExportData = {
              siteUrl: this.targetUrl,
              timestamp: new Date().toISOString(),
              duration: this.dom.statElapsed.textContent,
              stats: this.auditSummary,
              pages: this.crawledPages
            };
            const content = Exporter.generateHeadingContentTxtReport(crawlExportData);
            const host = getHostname(this.targetUrl).replace(/[^a-zA-Z0-9.-]/g, '_') || 'site_data';
            const filename = `${host}_all_${this.crawledPages.length}_pages_headings.txt`;
            Exporter.download(filename, content, 'text/plain', false);
            this.dom.liveStatusText.textContent = `Crawl completed! Auto-downloaded ${filename}`;
          } else {
            this.dom.liveStatusText.textContent = 'Crawl completed successfully.';
          }
        } catch (exportErr) {
          console.warn('[Site Data Crawler] Auto-export error:', exportErr);
          this.dom.liveStatusText.textContent = 'Crawl completed successfully.';
        }
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
      const response = await smartFetch(url, {
        timeoutMs: this.settings.timeoutMs || 15000,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      });

      const latency = Math.round(performance.now() - startTime);
      this.totalResponseTimeMs += latency;
      this.totalResponseCount++;

      const contentType = response.contentType || '';
      const isHtml = !contentType || contentType.includes('text/html') || contentType.includes('application/xhtml+xml') || !contentType.includes('image/');

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

      const html = response.text;
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
        if (this.settings.crawlMode !== 'page_links' || depth === 0) {
          const internalLinks = parsedData.links?.internal || [];
          const effectiveMax = this.settings.maxPages || 100;

          for (const link of internalLinks) {
            if (this.queuedUrlsSet.size >= effectiveMax * 3) break;
            this._enqueueUrl(link.url, depth + 1, url);
          }
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

    // Prioritize Legal and Contact pages at the front of the queue if enabled
    const isLegal = isLegalPageUrl(normalized);
    const isContact = isContactPageUrl(normalized);

    if ((this.settings.prioritizeLegalPages !== false && isLegal) || (this.settings.prioritizeContactPages !== false && isContact)) {
      this.urlQueue.unshift({ url: normalized, depth, source, isPriority: true });
    } else {
      this.urlQueue.push({ url: normalized, depth, source });
    }
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

    this._clearElement(this.dom.sitemapList);
    const emptyLi = document.createElement('li');
    emptyLi.className = 'sitemap-list-empty';
    emptyLi.textContent = 'No sitemaps discovered yet. Enter a website URL above and click Start Crawl.';
    this.dom.sitemapList.appendChild(emptyLi);

    this.dom.currentUrlDisplay.textContent = 'Waiting for input...';
    this.dom.progressBarFill.style.width = '0%';
    this.dom.progressPercentText.textContent = '0%';

    this._updateUiState();
    this._recalculateAuditAndDuplicates();
    this._renderTable();
  }

  _clearElement(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
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
    if (mode === 'single_page') return 'Single Page Only';
    if (mode === 'page_links') return 'Page + Discovered Links';
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
    this.dom.robotsSitemapsCount.textContent = this.robotsInfo?.sitemaps?.length || 0;
    this.dom.robotsDisallowCount.textContent = this.robotsInfo?.disallows?.length || this.robotsInfo?.disallow?.length || 0;

    this._clearElement(this.dom.sitemapList);
    if (this.sitemapsList.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'sitemap-list-empty';
      emptyLi.textContent = 'No sitemaps discovered on this domain. Crawling website directly via HTML links.';
      this.dom.sitemapList.appendChild(emptyLi);
      return;
    }

    this.sitemapsList.forEach(sm => {
      const li = document.createElement('li');
      li.className = 'sitemap-list-item';

      const spanUrl = document.createElement('span');
      spanUrl.textContent = sm.url;

      const spanBadge = document.createElement('span');
      spanBadge.className = 'badge badge-neutral';
      spanBadge.textContent = `${sm.urlsCount} URLs (${sm.type})`;

      li.append(spanUrl, spanBadge);
      this.dom.sitemapList.appendChild(li);
    });
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

    // Type filter
    if (this.typeFilter && this.typeFilter !== 'all') {
      list = list.filter(p => p.pageType === this.typeFilter);
    }

    // Status filter
    if (this.statusFilter && this.statusFilter !== 'all') {
      list = list.filter(p => p.status === this.statusFilter);
    }

    // Sorting
    list.sort((a, b) => {
      let valA = a[this.sortField];
      let valB = b[this.sortField];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = String(valB).toLowerCase();
        return this.sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      return this.sortDirection === 'asc' ? valA - valB : valB - valA;
    });

    return list;
  }

  /**
   * Renders the current page of crawled URLs in the data table.
   */
  _renderTable() {
    const filtered = this._getFilteredPages();
    const totalCount = filtered.length;

    this._clearElement(this.dom.urlsTableBody);

    if (totalCount === 0) {
      const tr = document.createElement('tr');
      tr.className = 'empty-table-row';
      const td = document.createElement('td');
      td.colSpan = 9;
      td.textContent = this.crawledPages.length === 0 ? 'No crawled pages yet.' : 'No pages match current filters.';
      tr.appendChild(td);
      this.dom.urlsTableBody.appendChild(tr);

      this.dom.paginationInfo.textContent = 'Showing 0-0 of 0 URLs';
      this.dom.btnPrevPage.disabled = true;
      this.dom.btnNextPage.disabled = true;
      return;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, totalCount);
    const visiblePages = filtered.slice(startIndex, endIndex);

    visiblePages.forEach((page, idx) => {
      const rowNum = startIndex + idx + 1;
      const tr = document.createElement('tr');

      // Col 1: Row #
      const td1 = document.createElement('td');
      td1.textContent = rowNum;

      // Col 2: Status Badge
      const td2 = document.createElement('td');
      const statusBadge = document.createElement('span');
      statusBadge.className = `badge ${page.status === 'success' ? 'badge-success' : (page.status === 'failed' ? 'badge-danger' : 'badge-neutral')}`;
      statusBadge.textContent = page.status ? page.status.toUpperCase() : 'OK';
      td2.appendChild(statusBadge);

      // Col 3: Page Type
      const td3 = document.createElement('td');
      const typeBadge = document.createElement('span');
      typeBadge.className = `badge ${page.pageTypeBadgeClass || 'badge-neutral'}`;
      typeBadge.textContent = page.pageTypeLabel || 'Standard';
      td3.appendChild(typeBadge);

      // Col 4: HTTP Status Code
      const td4 = document.createElement('td');
      if (page.httpStatus) {
        const httpBadge = document.createElement('span');
        httpBadge.className = `badge ${page.httpStatus === 200 ? 'badge-success' : 'badge-danger'}`;
        httpBadge.textContent = page.httpStatus;
        td4.appendChild(httpBadge);
      } else {
        const spanSubtle = document.createElement('span');
        spanSubtle.className = 'text-subtle';
        spanSubtle.textContent = '-';
        td4.appendChild(spanSubtle);
      }

      // Col 5: URL
      const td5 = document.createElement('td');
      td5.className = 'table-url-cell';
      td5.title = page.url || '';
      const aUrl = document.createElement('a');
      aUrl.href = page.url || '#';
      aUrl.target = '_blank';
      aUrl.rel = 'noopener noreferrer';
      aUrl.style.color = 'var(--primary)';
      aUrl.style.textDecoration = 'none';
      aUrl.textContent = page.url || '';
      td5.appendChild(aUrl);

      // Col 6: Title
      const td6 = document.createElement('td');
      td6.className = 'table-title-cell';
      td6.title = page.title || '';
      if (page.title) {
        td6.textContent = page.title;
      } else {
        const spanNone = document.createElement('span');
        spanNone.className = 'text-subtle';
        spanNone.textContent = '(None)';
        td6.appendChild(spanNone);
      }

      // Col 7: Word Count
      const td7 = document.createElement('td');
      td7.textContent = page.wordCount ?? '-';

      // Col 8: Latency
      const td8 = document.createElement('td');
      td8.textContent = page.responseTimeMs ? `${page.responseTimeMs} ms` : '-';

      // Col 9: Action
      const td9 = document.createElement('td');
      td9.style.textAlign = 'center';
      const btnInspect = document.createElement('button');
      btnInspect.className = 'btn-xs btn-outline btn-inspect-row';
      btnInspect.dataset.url = page.url;
      btnInspect.textContent = 'Inspect';
      td9.appendChild(btnInspect);

      tr.append(td1, td2, td3, td4, td5, td6, td7, td8, td9);
      this.dom.urlsTableBody.appendChild(tr);
    });

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
    let hasTermsPage = false;
    let hasPrivacyPage = false;
    let hasContactPage = false;
    const allEmails = new Set();
    const allPhones = new Set();
    const allSocials = new Set();

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

      // Legal & Contact compliance checks
      if (page.pageType === 'terms' || page.legalInfo?.hasTerms || page.legalInfo?.termsUrl) {
        hasTermsPage = true;
      }
      if (page.pageType === 'privacy' || page.legalInfo?.hasPrivacy || page.legalInfo?.privacyUrl) {
        hasPrivacyPage = true;
      }
      if (page.pageType === 'contact' || page.contactInfo?.hasContactForm || (page.contactInfo?.emails && page.contactInfo.emails.length > 0)) {
        hasContactPage = true;
      }

      (page.contactInfo?.emails || []).forEach(e => allEmails.add(e));
      (page.contactInfo?.phones || []).forEach(p => allPhones.add(p));
      (page.contactInfo?.socials || []).forEach(s => allSocials.add(s.url || s));
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

    // Populate Compliance Audit Cards
    if (this.dom.auditTermsStatus) {
      this.dom.auditTermsStatus.textContent = hasTermsPage ? 'Detected' : 'Not Found';
      this.dom.auditTermsStatus.className = hasTermsPage ? 'text-success' : 'badge-flag';
    }
    if (this.dom.auditPrivacyStatus) {
      this.dom.auditPrivacyStatus.textContent = hasPrivacyPage ? 'Detected' : 'Not Found';
      this.dom.auditPrivacyStatus.className = hasPrivacyPage ? 'text-success' : 'badge-flag';
    }
    if (this.dom.auditContactStatus) {
      this.dom.auditContactStatus.textContent = hasContactPage ? 'Detected' : 'Not Found';
      this.dom.auditContactStatus.className = hasContactPage ? 'text-success' : 'badge-flag';
    }
    if (this.dom.auditEmailsCount) {
      this.dom.auditEmailsCount.textContent = allEmails.size;
    }
    if (this.dom.auditPhonesCount) {
      this.dom.auditPhonesCount.textContent = allPhones.size;
    }
    if (this.dom.auditSocialsCount) {
      this.dom.auditSocialsCount.textContent = allSocials.size;
    }

    this.dom.tabCountDuplicates.textContent = dupTitlesCount + dupDescCount;

    // Render Duplicates Tab
    this._renderDuplicateGroups();

    this.auditSummary = {
      totalDiscovered, crawledCount, successful: successPages.length, failed: failedPages.length,
      skipped: skippedPages.length, avgWordCount: avgWords, missingTitle, missingDesc,
      dupTitlesCount, dupDescCount, missingH1, multipleH1, totalImages, missingAlt,
      schemaPages, internalLinks, externalLinks, hasTermsPage, hasPrivacyPage, hasContactPage,
      totalEmailsCount: allEmails.size, totalPhonesCount: allPhones.size, totalSocialsCount: allSocials.size
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
    this._clearElement(container);
    const duplicates = [];
    groupMap.forEach((urls, key) => {
      if (urls.length > 1 && key.trim()) {
        duplicates.push({ key, urls });
      }
    });

    if (duplicates.length === 0) {
      const p = document.createElement('p');
      p.className = 'text-muted';
      p.textContent = `No duplicate ${label.toLowerCase()}s detected.`;
      container.appendChild(p);
      return;
    }

    duplicates.forEach(item => {
      const box = document.createElement('div');
      box.className = 'dup-group-box';

      const title = document.createElement('div');
      title.className = 'dup-group-title';
      title.textContent = `${label}: "${item.key}" (${item.urls.length} pages)`;

      const ul = document.createElement('ul');
      ul.className = 'dup-url-list';
      item.urls.forEach(u => {
        const li = document.createElement('li');
        li.textContent = u;
        ul.appendChild(li);
      });

      box.append(title, ul);
      container.appendChild(box);
    });
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
    if (this.dom.modalOverviewPageType) {
      this._clearElement(this.dom.modalOverviewPageType);
      const spanType = document.createElement('span');
      spanType.className = `badge ${page.pageTypeBadgeClass || 'badge-neutral'}`;
      spanType.textContent = page.pageTypeLabel || 'Standard';
      this.dom.modalOverviewPageType.appendChild(spanType);
    }
    this.dom.modalMetaDesc.textContent = page.metadata?.description || '(None)';
    this.dom.modalMetaCanonical.textContent = page.metadata?.canonical || '(None)';
    this.dom.modalMetaRobots.textContent = page.metadata?.robots || '(None)';
    this.dom.modalMetaOgTitle.textContent = page.metadata?.openGraph?.title || '(None)';
    this.dom.modalMetaOgDesc.textContent = page.metadata?.openGraph?.description || '(None)';
    this.dom.modalMetaStatus.textContent = `${page.httpStatus || page.status} (${page.httpStatusText || ''})`;
    this.dom.modalMetaLatency.textContent = page.responseTimeMs ? `${page.responseTimeMs} ms` : 'N/A';

    // Contact & Legal Tab
    if (this.dom.modalPageTypeBadge) {
      this.dom.modalPageTypeBadge.className = `badge ${page.pageTypeBadgeClass || 'badge-neutral'}`;
      this.dom.modalPageTypeBadge.textContent = page.pageTypeLabel || 'Standard Page';
    }
    if (this.dom.modalPageTypeDesc) {
      this.dom.modalPageTypeDesc.textContent = this._getPageTypeDescription(page.pageType);
    }

    // Render Legal Links
    const legal = page.legalInfo || {};
    const legalItems = [];
    if (legal.termsUrl) legalItems.push({ label: 'Terms of Service', url: legal.termsUrl, type: 'Terms' });
    if (legal.privacyUrl) legalItems.push({ label: 'Privacy Policy', url: legal.privacyUrl, type: 'Privacy' });
    if (legal.cookieUrl) legalItems.push({ label: 'Cookie Policy', url: legal.cookieUrl, type: 'Cookies' });
    if (legal.disclaimerUrl) legalItems.push({ label: 'Legal / Disclaimer', url: legal.disclaimerUrl, type: 'Legal' });

    if (this.dom.modalLegalLinksList) {
      this._clearElement(this.dom.modalLegalLinksList);
      if (legalItems.length === 0) {
        const p = document.createElement('p');
        p.className = 'text-muted';
        p.style.fontSize = '12px';
        p.textContent = 'No dedicated policy URLs extracted from this page.';
        this.dom.modalLegalLinksList.appendChild(p);
      } else {
        legalItems.forEach(item => {
          const div = document.createElement('div');
          div.className = 'policy-link-item';

          const content = document.createElement('div');
          const strong = document.createElement('strong');
          strong.textContent = `${item.label}: `;
          const a = document.createElement('a');
          a.href = item.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = item.url;
          content.append(strong, a);

          const badge = document.createElement('span');
          badge.className = 'badge badge-neutral';
          badge.textContent = item.type;

          div.append(content, badge);
          this.dom.modalLegalLinksList.appendChild(div);
        });
      }
    }

    // Render Emails
    const emails = page.contactInfo?.emails || [];
    if (this.dom.modalEmailsCount) this.dom.modalEmailsCount.textContent = emails.length;
    if (this.dom.modalEmailsList) {
      this._clearElement(this.dom.modalEmailsList);
      if (emails.length === 0) {
        const li = document.createElement('li');
        li.className = 'text-muted';
        li.style.fontSize = '12px';
        li.textContent = 'No email addresses detected.';
        this.dom.modalEmailsList.appendChild(li);
      } else {
        emails.forEach(email => {
          const li = document.createElement('li');
          li.className = 'contact-chip';

          const span = document.createElement('span');
          const a = document.createElement('a');
          a.href = `mailto:${email}`;
          a.style.color = 'var(--primary)';
          a.style.textDecoration = 'none';
          a.textContent = email;
          span.appendChild(a);

          const btn = document.createElement('button');
          btn.className = 'btn-copy-chip';
          btn.dataset.copy = email;
          btn.title = 'Copy email';
          btn.textContent = 'Copy';

          li.append(span, btn);
          this.dom.modalEmailsList.appendChild(li);
        });
      }
    }

    // Render Phones
    const phones = page.contactInfo?.phones || [];
    if (this.dom.modalPhonesCount) this.dom.modalPhonesCount.textContent = phones.length;
    if (this.dom.modalPhonesList) {
      this._clearElement(this.dom.modalPhonesList);
      if (phones.length === 0) {
        const li = document.createElement('li');
        li.className = 'text-muted';
        li.style.fontSize = '12px';
        li.textContent = 'No phone numbers detected.';
        this.dom.modalPhonesList.appendChild(li);
      } else {
        phones.forEach(phone => {
          const li = document.createElement('li');
          li.className = 'contact-chip';

          const span = document.createElement('span');
          const a = document.createElement('a');
          a.href = `tel:${phone.replace(/\s+/g, '')}`;
          a.style.color = 'var(--primary)';
          a.style.textDecoration = 'none';
          a.textContent = phone;
          span.appendChild(a);

          const btn = document.createElement('button');
          btn.className = 'btn-copy-chip';
          btn.dataset.copy = phone;
          btn.title = 'Copy phone';
          btn.textContent = 'Copy';

          li.append(span, btn);
          this.dom.modalPhonesList.appendChild(li);
        });
      }
    }

    // Render Socials
    const socials = page.contactInfo?.socials || [];
    if (this.dom.modalSocialsCount) this.dom.modalSocialsCount.textContent = socials.length;
    if (this.dom.modalSocialsList) {
      this._clearElement(this.dom.modalSocialsList);
      if (socials.length === 0) {
        const p = document.createElement('p');
        p.className = 'text-muted';
        p.style.fontSize = '12px';
        p.textContent = 'No social media links detected.';
        this.dom.modalSocialsList.appendChild(p);
      } else {
        socials.forEach(s => {
          const a = document.createElement('a');
          a.href = s.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.className = 'social-chip';

          const strong = document.createElement('strong');
          strong.textContent = `${s.platform}: `;
          const span = document.createElement('span');
          span.textContent = s.handle ? `@${s.handle}` : s.url;

          a.append(strong, span);
          this.dom.modalSocialsList.appendChild(a);
        });
      }
    }

    // Copyright and Form
    if (this.dom.modalCopyrightText) {
      this.dom.modalCopyrightText.textContent = legal.copyright || '(None detected)';
    }
    if (this.dom.modalContactFormStatus) {
      this.dom.modalContactFormStatus.textContent = page.contactInfo?.hasContactForm ? 'Yes (Form detected on page)' : 'No';
      this.dom.modalContactFormStatus.className = page.contactInfo?.hasContactForm ? 'modal-val text-success' : 'modal-val';
    }

    // Update Contact & Legal Tab Badge Count
    const totalContactLegalCount = emails.length + phones.length + socials.length + legalItems.length;
    if (this.dom.modalContactLegalCount) {
      this.dom.modalContactLegalCount.textContent = totalContactLegalCount;
    }

    // Attach copy button handlers
    this.dom.inspectModal.querySelectorAll('.btn-copy-chip').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const textToCopy = btn.dataset.copy;
        if (textToCopy) {
          try {
            await navigator.clipboard.writeText(textToCopy);
            const original = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = original; }, 1500);
          } catch {}
        }
      });
    });

    // Headings Tab
    const headings = page.headings?.list || [];
    this.dom.modalHeadingsCount.textContent = headings.length;
    this._clearElement(this.dom.modalHeadingsList);
    if (headings.length === 0) {
      const li = document.createElement('li');
      li.className = 'text-muted';
      li.textContent = 'No H1-H6 headings found on this page.';
      this.dom.modalHeadingsList.appendChild(li);
    } else {
      headings.forEach(h => {
        const li = document.createElement('li');
        li.className = 'heading-item';
        li.style.paddingLeft = `${(parseInt((h.level || 'h1').slice(1), 10) - 1) * 12}px`;

        const spanTag = document.createElement('span');
        spanTag.className = 'heading-tag';
        spanTag.textContent = (h.level || 'H1').toUpperCase();

        const spanText = document.createElement('span');
        spanText.textContent = h.text || '';

        li.append(spanTag, spanText);
        this.dom.modalHeadingsList.appendChild(li);
      });
    }

    // Content Tab
    this.dom.modalWordCount.textContent = page.wordCount ?? 0;
    this.dom.modalCharCount.textContent = page.characterCount ?? 0;
    this.dom.modalParaCount.textContent = page.paragraphCount ?? 0;
    this.dom.modalContentText.textContent = page.content?.headingStructuredText || page.content?.cleanText || '(No text content extracted)';

    // Links Tab
    const internal = page.links?.internal || [];
    const external = page.links?.external || [];
    this.dom.modalLinksCount.textContent = internal.length + external.length;
    this.dom.modalInternalLinksCount.textContent = internal.length;
    this.dom.modalExternalLinksCount.textContent = external.length;

    this._clearElement(this.dom.modalInternalLinksList);
    if (internal.length > 0) {
      internal.forEach(l => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = l.url;
        a.target = '_blank';
        a.textContent = l.url;
        li.appendChild(a);
        if (l.anchorText) {
          li.appendChild(document.createTextNode(` ["${l.anchorText}"]`));
        }
        this.dom.modalInternalLinksList.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.className = 'text-muted';
      li.textContent = 'No internal links.';
      this.dom.modalInternalLinksList.appendChild(li);
    }

    this._clearElement(this.dom.modalExternalLinksList);
    if (external.length > 0) {
      external.forEach(l => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = l.url;
        a.target = '_blank';
        a.textContent = l.url;
        li.appendChild(a);
        if (l.anchorText) {
          li.appendChild(document.createTextNode(` ["${l.anchorText}"]`));
        }
        this.dom.modalExternalLinksList.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.className = 'text-muted';
      li.textContent = 'No external links.';
      this.dom.modalExternalLinksList.appendChild(li);
    }

    // Images Tab
    const images = page.images || [];
    this.dom.modalImagesCount.textContent = images.length;
    this._clearElement(this.dom.modalImagesGrid);
    if (images.length === 0) {
      const p = document.createElement('p');
      p.className = 'text-muted';
      p.textContent = 'No images extracted.';
      this.dom.modalImagesGrid.appendChild(p);
    } else {
      images.forEach(img => {
        const card = document.createElement('div');
        card.className = 'modal-image-card';

        const imageEl = document.createElement('img');
        imageEl.src = img.url;
        imageEl.className = 'modal-image-thumb';
        imageEl.loading = 'lazy';
        imageEl.onerror = () => { imageEl.src = 'icons/icon48.png'; };

        const altDiv = document.createElement('div');
        const altStrong = document.createElement('strong');
        altStrong.textContent = 'Alt: ';
        altDiv.appendChild(altStrong);
        if (img.alt) {
          altDiv.appendChild(document.createTextNode(img.alt));
        } else {
          const spanMissing = document.createElement('span');
          spanMissing.className = 'text-danger';
          spanMissing.textContent = 'MISSING';
          altDiv.appendChild(spanMissing);
        }

        const dimDiv = document.createElement('div');
        const dimStrong = document.createElement('strong');
        dimStrong.textContent = 'Dimensions: ';
        dimDiv.append(dimStrong, document.createTextNode(img.width && img.height ? `${img.width}x${img.height}` : 'N/A'));

        const linkDiv = document.createElement('div');
        linkDiv.style.wordBreak = 'break-all';
        const aImg = document.createElement('a');
        aImg.href = img.url;
        aImg.target = '_blank';
        aImg.textContent = img.url;
        linkDiv.appendChild(aImg);

        card.append(imageEl, altDiv, dimDiv, linkDiv);
        this.dom.modalImagesGrid.appendChild(card);
      });
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

  _getPageTypeDescription(type) {
    switch (type) {
      case 'terms': return 'Official Terms & Conditions / Terms of Service agreement.';
      case 'privacy': return 'Privacy Policy, cookie notice, or GDPR compliance disclosure.';
      case 'legal': return 'Legal disclaimer, imprint, compliance, or refund policy document.';
      case 'contact': return 'Contact directory, customer service hub, or inquiries portal.';
      case 'about': return 'Company overview, team profile, or about page.';
      case 'docs': return 'Technical documentation, help center, or FAQ.';
      case 'blog': return 'Blog post, news article, or journal entry.';
      default: return 'Standard website content page.';
    }
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

    if (format === 'heading-txt') {
      const content = Exporter.generateHeadingContentTxtReport(crawlExportData);
      Exporter.download(`${baseFilename}_headings_content.txt`, content, 'text/plain');
    } else if (format === 'heading-md') {
      const content = Exporter.generateHeadingContentMarkdownReport(crawlExportData);
      Exporter.download(`${baseFilename}_headings_content.md`, content, 'text/markdown');
    } else if (format === 'txt') {
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

        this._clearElement(this.dom.renderedMetaSummary);
        const card = document.createElement('div');
        card.className = 'card';
        card.style.marginBottom = '8px';

        const rowTitle = document.createElement('div');
        const strongTitle = document.createElement('strong');
        strongTitle.textContent = 'Page Title: ';
        rowTitle.append(strongTitle, document.createTextNode(parsed.title || '(None)'));

        const rowWords = document.createElement('div');
        const strongWords = document.createElement('strong');
        strongWords.textContent = 'Word Count: ';
        rowWords.append(strongWords, document.createTextNode(`${parsed.wordCount} words`));

        const rowHeadings = document.createElement('div');
        const strongHeadings = document.createElement('strong');
        strongHeadings.textContent = 'Headings: ';
        rowHeadings.append(strongHeadings, document.createTextNode(`H1 (${parsed.headings?.byLevel?.h1?.length || 0}), H2 (${parsed.headings?.byLevel?.h2?.length || 0})`));

        const rowLinks = document.createElement('div');
        const strongLinks = document.createElement('strong');
        strongLinks.textContent = 'Internal Links: ';
        const strongImgs = document.createElement('strong');
        strongImgs.textContent = ' | Images: ';
        rowLinks.append(
          strongLinks,
          document.createTextNode(String(parsed.links?.internal?.length || 0)),
          strongImgs,
          document.createTextNode(String(parsed.images?.length || 0))
        );

        card.append(rowTitle, rowWords, rowHeadings, rowLinks);
        this.dom.renderedMetaSummary.appendChild(card);
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
    if (this.dom.dlgPrioritizeLegal) this.dom.dlgPrioritizeLegal.checked = s.prioritizeLegalPages !== false;
    if (this.dom.dlgPrioritizeContact) this.dom.dlgPrioritizeContact.checked = s.prioritizeContactPages !== false;
    if (this.dom.dlgExtractContact) this.dom.dlgExtractContact.checked = s.extractContactInfo !== false;
    if (this.dom.dlgExtractLegal) this.dom.dlgExtractLegal.checked = s.extractLegalInfo !== false;
  }
}

// Instantiate dashboard on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new CrawlerDashboard();
  app.init();
});
