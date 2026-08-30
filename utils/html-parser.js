/**
 * HTML Parser for Site Data Crawler
 * Extracts metadata, SEO tags, headings, readable content, links, images, and structured data.
 */

import { resolveUrl, getHostname, isAllowedDomain } from './url-utils.js';

export class HtmlParser {
  /**
   * Parses raw HTML string and extracts comprehensive page metrics.
   * 
   * @param {string} htmlString 
   * @param {string} pageUrl 
   * @param {Object} options 
   * @param {boolean} options.extractImages 
   * @param {boolean} options.extractLinks 
   * @param {boolean} options.extractMetadata 
   * @param {boolean} options.extractHeadings 
   * @param {boolean} options.extractStructuredData 
   * @param {boolean} options.includeSubdomains 
   * @param {boolean} options.sameDomainOnly 
   * @returns {Object} Extracted data object
   */
  static parse(htmlString, pageUrl, options = {}) {
    const opts = {
      extractImages: true,
      extractLinks: true,
      extractMetadata: true,
      extractHeadings: true,
      extractStructuredData: true,
      includeSubdomains: false,
      sameDomainOnly: true,
      ...options
    };

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString || '', 'text/html');

    // 1. Basic Information
    const title = doc.querySelector('title')?.textContent?.trim() || '';
    const htmlEl = doc.documentElement;
    const language = htmlEl?.getAttribute('lang') || htmlEl?.getAttribute('xml:lang') || '';

    // Check for <base href="...">
    const baseHref = doc.querySelector('base[href]')?.getAttribute('href');
    const effectiveBaseUrl = baseHref ? (resolveUrl(baseHref, pageUrl) || pageUrl) : pageUrl;

    // 2. SEO Metadata
    const metadata = opts.extractMetadata ? this._extractMetadata(doc, effectiveBaseUrl) : {};

    // 3. Headings
    const headings = opts.extractHeadings ? this._extractHeadings(doc) : { list: [], h1Count: 0, byLevel: {} };

    // 4. Readable Content Extraction
    const content = this._extractContent(doc);

    // 5. Links
    const links = opts.extractLinks ? this._extractLinks(doc, effectiveBaseUrl, opts) : { internal: [], external: [], all: [] };

    // 6. Images
    const images = opts.extractImages ? this._extractImages(doc, effectiveBaseUrl) : [];

    // 7. Structured Data
    const structuredData = opts.extractStructuredData ? this._extractStructuredData(doc) : { jsonLd: [], schemaTypes: [], microdata: [], rdfa: [] };

    return {
      url: pageUrl,
      title: title || metadata.ogTitle || metadata.twitterTitle || '',
      language,
      metadata,
      headings,
      content,
      links,
      images,
      structuredData,
      characterCount: content.characterCount,
      wordCount: content.wordCount,
      paragraphCount: content.paragraphCount
    };
  }

  /**
   * Extracts Meta tags, OpenGraph, Twitter, and canonical link.
   */
  static _extractMetadata(doc, baseUrl) {
    const meta = {
      description: '',
      keywords: '',
      robots: '',
      canonical: '',
      viewport: '',
      author: '',
      generator: '',
      openGraph: {},
      twitter: {},
      otherMeta: {}
    };

    // Meta description
    meta.description = doc.querySelector('meta[name="description" i]')?.getAttribute('content')?.trim() || '';

    // Meta keywords
    meta.keywords = doc.querySelector('meta[name="keywords" i]')?.getAttribute('content')?.trim() || '';

    // Robots meta
    meta.robots = doc.querySelector('meta[name="robots" i]')?.getAttribute('content')?.trim() || '';

    // Canonical link
    const canonicalHref = doc.querySelector('link[rel="canonical" i]')?.getAttribute('href')?.trim();
    if (canonicalHref) {
      meta.canonical = resolveUrl(canonicalHref, baseUrl) || canonicalHref;
    }

    // Viewport, Author, Generator
    meta.viewport = doc.querySelector('meta[name="viewport" i]')?.getAttribute('content')?.trim() || '';
    meta.author = doc.querySelector('meta[name="author" i]')?.getAttribute('content')?.trim() || '';
    meta.generator = doc.querySelector('meta[name="generator" i]')?.getAttribute('content')?.trim() || '';

    // OpenGraph & Twitter
    const allMetaTags = doc.querySelectorAll('meta');
    for (const tag of allMetaTags) {
      const property = tag.getAttribute('property') || tag.getAttribute('name') || '';
      const content = tag.getAttribute('content') || '';
      if (!property || !content) continue;

      const propLower = property.toLowerCase();
      if (propLower.startsWith('og:')) {
        const key = propLower.slice(3);
        meta.openGraph[key] = content.trim();
      } else if (propLower.startsWith('twitter:')) {
        const key = propLower.slice(8);
        meta.twitter[key] = content.trim();
      }
    }

    return meta;
  }

  /**
   * Extracts heading structure (H1 through H6).
   */
  static _extractHeadings(doc) {
    const headingsList = [];
    const byLevel = { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] };

    const nodes = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (const node of nodes) {
      const level = node.tagName.toLowerCase();
      const text = node.textContent?.replace(/\s+/g, ' ').trim() || '';
      if (text) {
        const item = { level, text };
        headingsList.push(item);
        if (byLevel[level]) {
          byLevel[level].push(text);
        }
      }
    }

    return {
      list: headingsList,
      h1Count: byLevel.h1.length,
      byLevel
    };
  }

  /**
   * Extracts readable text content while eliminating scripts, styling, navbars, footers, cookie banners.
   */
  static _extractContent(doc) {
    // Clone document body so we don't mutate other extractions
    const body = doc.body ? doc.body.cloneNode(true) : doc.createElement('body');

    // Selectors to remove
    const selectorsToRemove = [
      'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
      'nav', 'footer', 'header', 'aside',
      '[hidden]', '[aria-hidden="true"]',
      'dialog', 'template',
      '.cookie-banner', '#cookie-banner', '[id*="cookie" i]', '[class*="cookie" i]',
      '[id*="consent" i]', '[class*="consent" i]', '[id*="gdpr" i]', '[class*="gdpr" i]'
    ];

    for (const selector of selectorsToRemove) {
      try {
        const els = body.querySelectorAll(selector);
        for (const el of els) {
          el.remove();
        }
      } catch {
        // Skip invalid selector if any
      }
    }

    // Extract paragraphs and text
    const paragraphs = [];
    const pNodes = body.querySelectorAll('p, article, section, div > p');
    for (const p of pNodes) {
      const text = p.textContent?.replace(/\s+/g, ' ').trim();
      if (text && text.length > 20 && !paragraphs.includes(text)) {
        paragraphs.push(text);
      }
    }

    const cleanText = body.textContent?.replace(/\s+/g, ' ').trim() || '';
    const words = cleanText ? cleanText.split(/\s+/).filter(Boolean) : [];
    const wordCount = words.length;
    const characterCount = cleanText.length;
    const paragraphCount = paragraphs.length;

    // Generate a clean preview snippet (up to 300 characters)
    const preview = cleanText.length > 300 ? cleanText.slice(0, 300) + '...' : cleanText;

    return {
      cleanText,
      preview,
      wordCount,
      characterCount,
      paragraphCount,
      paragraphs
    };
  }

  /**
   * Extracts and categorizes links into internal and external.
   */
  static _extractLinks(doc, baseUrl, options) {
    const internal = [];
    const external = [];
    const all = [];
    const seenUrls = new Set();

    const anchorNodes = doc.querySelectorAll('a[href]');
    for (const a of anchorNodes) {
      const rawHref = a.getAttribute('href');
      if (!rawHref) continue;

      const resolved = resolveUrl(rawHref, baseUrl);
      if (!resolved) continue;

      const anchorText = a.textContent?.replace(/\s+/g, ' ').trim() || '';
      const rel = a.getAttribute('rel') || '';
      const target = a.getAttribute('target') || '';
      const isInternal = isAllowedDomain(resolved, baseUrl, {
        includeSubdomains: options.includeSubdomains,
        sameDomainOnly: options.sameDomainOnly
      });

      const linkObj = {
        url: resolved,
        rawHref,
        anchorText,
        rel,
        target,
        isInternal
      };

      if (!seenUrls.has(resolved)) {
        seenUrls.add(resolved);
        all.push(linkObj);
        if (isInternal) {
          internal.push(linkObj);
        } else {
          external.push(linkObj);
        }
      }
    }

    return {
      internal,
      external,
      all,
      internalCount: internal.length,
      externalCount: external.length,
      totalCount: all.length
    };
  }

  /**
   * Extracts image elements with metadata.
   */
  static _extractImages(doc, baseUrl) {
    const images = [];
    const seenSrcs = new Set();

    const imgNodes = doc.querySelectorAll('img, picture img');
    for (const img of imgNodes) {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('srcset')?.split(/\s+/)[0];
      if (!src) continue;

      const resolved = resolveUrl(src, baseUrl);
      if (!resolved || seenSrcs.has(resolved)) continue;
      seenSrcs.add(resolved);

      const alt = img.getAttribute('alt') || '';
      const title = img.getAttribute('title') || '';
      const width = img.getAttribute('width') || img.naturalWidth || null;
      const height = img.getAttribute('height') || img.naturalHeight || null;
      const loading = img.getAttribute('loading') || 'eager';

      // Detect type from extension if available
      let imageType = 'unknown';
      try {
        const parsed = new URL(resolved);
        const match = parsed.pathname.match(/\.(png|jpe?g|webp|svg|gif|avif|ico)(\?.*)?$/i);
        if (match) {
          imageType = match[1].toLowerCase();
        }
      } catch {}

      images.push({
        url: resolved,
        alt: alt.trim(),
        title: title.trim(),
        width,
        height,
        loading,
        imageType,
        hasAlt: !!alt.trim()
      });
    }

    return images;
  }

  /**
   * Extracts Structured Data: JSON-LD, Microdata, and RDFa.
   */
  static _extractStructuredData(doc) {
    const jsonLd = [];
    const schemaTypes = new Set();

    // 1. JSON-LD
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const text = script.textContent?.trim();
        if (!text) continue;

        const data = JSON.parse(text);
        jsonLd.push(data);

        // Find @type recursively
        this._findSchemaTypes(data, schemaTypes);
      } catch {
        // Invalid JSON-LD block, skip
      }
    }

    // 2. Microdata
    const microdata = [];
    const microdataNodes = doc.querySelectorAll('[itemscope]');
    for (const node of microdataNodes) {
      const itemType = node.getAttribute('itemtype') || '';
      if (itemType) {
        microdata.push(itemType);
        const typeName = itemType.split('/').pop();
        if (typeName) schemaTypes.add(typeName);
      }
    }

    // 3. RDFa
    const rdfa = [];
    const rdfaNodes = doc.querySelectorAll('[typeof], [vocab]');
    for (const node of rdfaNodes) {
      const typeOf = node.getAttribute('typeof');
      if (typeOf) {
        rdfa.push(typeOf);
        schemaTypes.add(typeOf);
      }
    }

    return {
      jsonLd,
      microdata,
      rdfa,
      schemaTypes: Array.from(schemaTypes),
      hasStructuredData: jsonLd.length > 0 || microdata.length > 0 || rdfa.length > 0
    };
  }

  /**
   * Helper to recursively find Schema.org @type in JSON-LD objects.
   */
  static _findSchemaTypes(obj, typeSet) {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        this._findSchemaTypes(item, typeSet);
      }
      return;
    }

    if (obj['@type']) {
      if (Array.isArray(obj['@type'])) {
        obj['@type'].forEach(t => typeSet.add(t));
      } else if (typeof obj['@type'] === 'string') {
        typeSet.add(obj['@type']);
      }
    }

    if (obj['@graph'] && Array.isArray(obj['@graph'])) {
      for (const item of obj['@graph']) {
        this._findSchemaTypes(item, typeSet);
      }
    }

    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        this._findSchemaTypes(obj[key], typeSet);
      }
    }
  }
}
