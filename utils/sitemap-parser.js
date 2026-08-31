/**
 * Sitemap Parser for Site Data Crawler
 * Discovers, fetches, and recursively parses XML sitemaps, sitemap indexes, and robots.txt.
 */

import { normalizeUrl, resolveUrl, parseRobotsTxt, getOrigin } from './url-utils.js';
import { smartFetch } from './fetcher.js';

export class SitemapParser {
  constructor(options = {}) {
    this.maxDepth = options.maxDepth || 5;
    this.timeoutMs = options.timeoutMs || 15000;
    this.onProgress = options.onProgress || (() => {});
    this.visitedSitemaps = new Set();
    this.discoveredSitemaps = [];
    this.discoveredUrls = new Map(); // url -> metadata { sitemapUrl, lastmod, changefreq, priority }
  }

  /**
   * Discovers sitemaps for a website by checking robots.txt and standard locations.
   * 
   * @param {string} seedUrl 
   * @returns {Promise<{ sitemaps: Array, robotsTxt: Object, allUrls: Array, totalUrlsCount: number }>}
   */
  async discoverAndParse(seedUrl) {
    const origin = getOrigin(seedUrl);
    if (!origin) {
      throw new Error(`Invalid target URL: ${seedUrl}`);
    }

    const candidateSitemaps = new Set();
    let robotsInfo = { disallow: [], sitemaps: [], crawlDelay: 0 };

    this.onProgress({
      phase: 'discovery',
      message: `Checking robots.txt for ${origin}...`,
      sitemapsCount: 0,
      urlsCount: 0
    });

    // 1. Check robots.txt
    try {
      const robotsUrl = `${origin}/robots.txt`;
      const robotsResponse = await smartFetch(robotsUrl, { timeoutMs: 3500, accept: 'text/plain,text/html,*/*' });
      if (robotsResponse.ok && robotsResponse.text) {
        robotsInfo = parseRobotsTxt(robotsResponse.text, origin);
        for (const sm of robotsInfo.sitemaps) {
          candidateSitemaps.add(sm);
        }
      }
    } catch {
      // Ignore robots.txt failure and continue with default candidates
    }

    // 2. Add common default sitemap locations
    const defaultCandidates = [
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_index.xml`,
      `${origin}/wp-sitemap.xml`
    ];

    for (const url of defaultCandidates) {
      candidateSitemaps.add(url);
    }

    this.onProgress({
      phase: 'discovery',
      message: `Checking sitemaps for ${origin}...`,
      sitemapsCount: candidateSitemaps.size,
      urlsCount: 0
    });

    // 3. Process candidate sitemaps in parallel with quick timeout
    const candidateArray = Array.from(candidateSitemaps);
    await Promise.allSettled(
      candidateArray.map(url => this._processSitemap(url, 0))
    );

    const urlsArray = Array.from(this.discoveredUrls.values());

    return {
      sitemaps: this.discoveredSitemaps,
      robotsTxt: robotsInfo,
      allUrls: urlsArray,
      totalUrlsCount: urlsArray.length
    };
  }

  /**
   * Recursively fetches and processes a sitemap or sitemap index.
   * 
   * @param {string} sitemapUrl 
   * @param {number} depth 
   */
  async _processSitemap(sitemapUrl, depth) {
    if (depth > this.maxDepth) return;
    if (this.visitedSitemaps.has(sitemapUrl)) return;
    this.visitedSitemaps.add(sitemapUrl);

    this.onProgress({
      phase: 'fetching_sitemap',
      message: `Fetching sitemap: ${sitemapUrl}`,
      sitemapsCount: this.discoveredSitemaps.length,
      urlsCount: this.discoveredUrls.size,
      currentSitemap: sitemapUrl
    });

    try {
      const response = await smartFetch(sitemapUrl, {
        timeoutMs: this.timeoutMs,
        accept: 'application/xml,text/xml,text/plain,*/*'
      });
      if (!response.ok || !response.text) {
        return;
      }

      const text = response.text;

      // Check if this is valid XML or plain text
      const parsed = this._parseXmlOrText(text, sitemapUrl);
      if (!parsed || (!parsed.isIndex && !parsed.isUrlset && !parsed.isPlainText)) {
        return;
      }

      const sitemapRecord = {
        url: sitemapUrl,
        type: parsed.isIndex ? 'index' : (parsed.isPlainText ? 'text' : 'urlset'),
        urlsCount: parsed.urls.length,
        childSitemapsCount: parsed.childSitemaps.length,
        status: response.status
      };
      this.discoveredSitemaps.push(sitemapRecord);

      // Add discovered page URLs
      for (const item of parsed.urls) {
        const normalized = normalizeUrl(item.loc);
        if (normalized && !this.discoveredUrls.has(normalized)) {
          this.discoveredUrls.set(normalized, {
            url: normalized,
            sourceSitemap: sitemapUrl,
            lastmod: item.lastmod || null,
            changefreq: item.changefreq || null,
            priority: item.priority || null
          });
        }
      }

      this.onProgress({
        phase: 'parsed_sitemap',
        message: `Parsed ${sitemapUrl} (${parsed.urls.length} URLs, ${parsed.childSitemaps.length} child sitemaps)`,
        sitemapsCount: this.discoveredSitemaps.length,
        urlsCount: this.discoveredUrls.size,
        currentSitemap: sitemapUrl
      });

      // Recurse on child sitemaps
      for (const childUrl of parsed.childSitemaps) {
        const normalizedChild = normalizeUrl(childUrl);
        if (normalizedChild && !this.visitedSitemaps.has(normalizedChild)) {
          await this._processSitemap(normalizedChild, depth + 1);
        }
      }
    } catch {
      // Sitemap fetch/parse error, continue gracefully
    }
  }

  /**
   * Parses XML or plain text sitemaps using DOMParser with regex fallback for malformed XML.
   * 
   * @param {string} content 
   * @param {string} baseUrl 
   * @returns {{ isIndex: boolean, isUrlset: boolean, isPlainText: boolean, childSitemaps: Array<string>, urls: Array<Object> }}
   */
  _parseXmlOrText(content, baseUrl) {
    const result = {
      isIndex: false,
      isUrlset: false,
      isPlainText: false,
      childSitemaps: [],
      urls: []
    };

    if (!content || typeof content !== 'string') return result;

    const trimmed = content.trim();

    // Check if plain text sitemap (list of URLs)
    if (!trimmed.startsWith('<') && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
      result.isPlainText = true;
      const lines = trimmed.split(/\r?\n/);
      for (const line of lines) {
        const resolved = resolveUrl(line, baseUrl);
        if (resolved) {
          result.urls.push({ loc: resolved });
        }
      }
      return result;
    }

    // Try DOMParser
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(trimmed, 'application/xml');

      // Check for parsererror
      const parserError = xmlDoc.querySelector('parsererror');

      if (!parserError) {
        // 1. Check for Sitemap Index (<sitemapindex>)
        const sitemapNodes = xmlDoc.querySelectorAll('sitemap, sitemapindex > sitemap');
        if (sitemapNodes.length > 0 || xmlDoc.documentElement.tagName.toLowerCase().includes('sitemapindex')) {
          result.isIndex = true;
          for (const node of sitemapNodes) {
            const locNode = node.querySelector('loc');
            if (locNode && locNode.textContent) {
              const childLoc = resolveUrl(locNode.textContent.trim(), baseUrl);
              if (childLoc) {
                result.childSitemaps.push(childLoc);
              }
            }
          }
        }

        // 2. Check for URL Set (<urlset>)
        const urlNodes = xmlDoc.querySelectorAll('url, urlset > url');
        if (urlNodes.length > 0 || xmlDoc.documentElement.tagName.toLowerCase().includes('urlset')) {
          result.isUrlset = true;
          for (const node of urlNodes) {
            const locNode = node.querySelector('loc');
            if (locNode && locNode.textContent) {
              const loc = resolveUrl(locNode.textContent.trim(), baseUrl);
              if (loc) {
                const lastmod = node.querySelector('lastmod')?.textContent?.trim() || null;
                const changefreq = node.querySelector('changefreq')?.textContent?.trim() || null;
                const priority = node.querySelector('priority')?.textContent?.trim() || null;
                result.urls.push({ loc, lastmod, changefreq, priority });
              }
            }
          }
        }

        if (result.isIndex || result.isUrlset) {
          return result;
        }
      }
    } catch {
      // DOMParser failed, fall back to Regex
    }

    // Fallback: Regex-based extraction for malformed XML or namespace quirks
    return this._parseXmlWithRegex(trimmed, baseUrl);
  }

  /**
   * Robust Regex parser for XML sitemaps.
   * 
   * @param {string} xmlText 
   * @param {string} baseUrl 
   */
  _parseXmlWithRegex(xmlText, baseUrl) {
    const result = {
      isIndex: false,
      isUrlset: false,
      isPlainText: false,
      childSitemaps: [],
      urls: []
    };

    // Check for sitemapindex
    if (/<sitemapindex/i.test(xmlText)) {
      result.isIndex = true;
      const sitemapBlocks = xmlText.match(/<sitemap[\s\S]*?<\/sitemap>/gi) || [];
      for (const block of sitemapBlocks) {
        const locMatch = block.match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i);
        if (locMatch && locMatch[1]) {
          const resolved = resolveUrl(locMatch[1].trim(), baseUrl);
          if (resolved) {
            result.childSitemaps.push(resolved);
          }
        }
      }
      return result;
    }

    // Check for urlset or url entries
    if (/<urlset/i.test(xmlText) || /<url[\s\S]*?<\/url>/i.test(xmlText)) {
      result.isUrlset = true;
      const urlBlocks = xmlText.match(/<url[\s\S]*?<\/url>/gi) || [];
      for (const block of urlBlocks) {
        const locMatch = block.match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i);
        if (locMatch && locMatch[1]) {
          const loc = resolveUrl(locMatch[1].trim(), baseUrl);
          if (loc) {
            const lastmodMatch = block.match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i);
            const changefreqMatch = block.match(/<changefreq>\s*([\s\S]*?)\s*<\/changefreq>/i);
            const priorityMatch = block.match(/<priority>\s*([\s\S]*?)\s*<\/priority>/i);

            result.urls.push({
              loc,
              lastmod: lastmodMatch ? lastmodMatch[1].trim() : null,
              changefreq: changefreqMatch ? changefreqMatch[1].trim() : null,
              priority: priorityMatch ? priorityMatch[1].trim() : null
            });
          }
        }
      }
      return result;
    }

    return result;
  }

  /**
   * Helper fetch with timeout.
   */
  async _fetchWithTimeout(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/xml,text/xml,text/plain,*/*'
        }
      });
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }
}
