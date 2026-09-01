/**
 * Site Data Crawler - Offscreen Background Processor
 * Provides background DOM parsing and crawl execution that persists even if popup is closed.
 */

import { HtmlParser } from './utils/html-parser.js';
import { smartFetch } from './utils/fetcher.js';
import { Exporter } from './utils/exporter.js';
import { normalizeUrl, getHostname, isAllowedDomain, isNonHtmlResource, matchesExcludePattern } from './utils/url-utils.js';

let activeAbortController = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'EXECUTE_CRAWL_IN_BACKGROUND') {
    runBackgroundCrawl(message.payload)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }

  if (message.action === 'ABORT_BACKGROUND_CRAWL') {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    sendResponse({ success: true });
    return false;
  }
});

async function runBackgroundCrawl(payload) {
  const { targetUrl, mode, options = {}, seedHtml = '' } = payload;
  activeAbortController = new AbortController();

  const startTime = performance.now();

  // Notify of initial start
  sendProgress({
    status: 'running',
    step: 'seed',
    message: 'Extracting seed page content...',
    current: 0,
    total: mode === 'single_page' ? 1 : 0
  });

  let rawSeedHtml = seedHtml;
  if (!rawSeedHtml) {
    const fetchRes = await smartFetch(targetUrl, {
      timeoutMs: options.timeoutMs || 15000,
      signal: activeAbortController.signal
    });
    if (!fetchRes.ok && !fetchRes.text) {
      throw new Error(fetchRes.error || `HTTP ${fetchRes.status} Failed to fetch seed page`);
    }
    rawSeedHtml = fetchRes.text;
  }

  if (!rawSeedHtml) {
    throw new Error('Empty response received from seed URL.');
  }

  // Parse seed page
  const parseOptions = {
    extractHeadings: options.extractHeadings !== false,
    extractContactInfo: options.extractContactInfo !== false,
    extractLegalInfo: options.extractLegalInfo !== false,
    classifyPageTypes: options.classifyPageTypes !== false,
    extractMetadata: options.extractMetadata !== false,
    extractLinks: true, // Always extract internal links
    extractImages: options.extractImages !== false,
    extractStructuredData: options.extractStructuredData !== false
  };

  const parsedSeed = HtmlParser.parse(rawSeedHtml, targetUrl, parseOptions);
  const seedLatency = Math.round(performance.now() - startTime);

  const seedPageRecord = {
    ...parsedSeed,
    httpStatus: 200,
    httpStatusText: 'OK',
    status: 'success',
    responseTimeMs: seedLatency,
    timestamp: new Date().toISOString()
  };

  const allPages = [seedPageRecord];

  if (mode === 'page_links') {
    // Collect and crawl internal links from seed page
    const internalLinks = parsedSeed.links?.internal || [];
    const excludePatterns = options.excludePatterns || [];
    const maxPages = options.maxPages || 50;
    const crawlDelay = options.crawlDelay ?? 100;

    const linkQueue = [];
    const visited = new Set([targetUrl]);

    for (const item of internalLinks) {
      const linkUrl = normalizeUrl(item.url, { removeQueryParams: options.ignoreQueryParams !== false });
      if (
        linkUrl &&
        !visited.has(linkUrl) &&
        !isNonHtmlResource(linkUrl) &&
        isAllowedDomain(linkUrl, targetUrl, { sameDomainOnly: options.sameDomainOnly !== false }) &&
        !matchesExcludePattern(linkUrl, excludePatterns)
      ) {
        visited.add(linkUrl);
        linkQueue.push(linkUrl);
        if (linkQueue.length >= maxPages) break;
      }
    }

    const totalToCrawl = linkQueue.length;

    for (let i = 0; i < totalToCrawl; i++) {
      if (activeAbortController.signal.aborted) {
        throw new Error('Crawl aborted by user.');
      }

      const nextUrl = linkQueue[i];
      const displayUrl = nextUrl.replace(/^https?:\/\//i, '').slice(0, 32);

      sendProgress({
        status: 'running',
        step: 'links',
        message: `[${i + 1}/${totalToCrawl}] Crawling: ${displayUrl}...`,
        current: i + 1,
        total: totalToCrawl,
        currentUrl: nextUrl
      });

      if (crawlDelay > 0 && i > 0) {
        await new Promise(r => setTimeout(r, crawlDelay));
      }

      try {
        const pageStart = performance.now();
        const res = await smartFetch(nextUrl, {
          timeoutMs: 12000,
          signal: activeAbortController.signal
        });
        const pageLatency = Math.round(performance.now() - pageStart);

        if (res.ok && res.text) {
          const parsedPage = HtmlParser.parse(res.text, nextUrl, parseOptions);
          allPages.push({
            ...parsedPage,
            httpStatus: res.status || 200,
            httpStatusText: res.statusText || 'OK',
            status: 'success',
            responseTimeMs: pageLatency,
            timestamp: new Date().toISOString()
          });
        }
      } catch (linkErr) {
        console.warn(`[Site Data Crawler] Skipped link ${nextUrl}:`, linkErr);
      }
    }
  }

  const totalDurationMs = Math.round(performance.now() - startTime);

  // Generate Heading-Structured Text Report
  const txtContent = Exporter.generateHeadingContentTxtReport({
    siteUrl: targetUrl,
    pages: allPages
  });

  const host = getHostname(targetUrl).replace(/[^a-zA-Z0-9.-]/g, '_') || 'site_data';
  const filename = (mode === 'single_page' || allPages.length === 1)
    ? `${host}_${(seedPageRecord.title || 'content').toLowerCase().slice(0, 24).replace(/[^a-zA-Z0-9]/g, '_')}.txt`
    : `${host}_page_and_all_links.txt`;

  return {
    targetUrl,
    mode,
    seedPage: seedPageRecord,
    pages: allPages,
    totalDurationMs,
    filename,
    txtContent
  };
}

function sendProgress(progress) {
  try {
    chrome.runtime.sendMessage({
      action: 'BACKGROUND_CRAWL_PROGRESS',
      progress
    }).catch(() => {});
  } catch {}
}
