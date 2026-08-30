/**
 * HTML Parser for Site Data Crawler
 * Extracts metadata, SEO tags, headings, readable content, links, images, and structured data.
 */

import { resolveUrl, getHostname, isAllowedDomain, classifyUrlType } from './url-utils.js';

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
   * @param {boolean} options.extractContactInfo 
   * @param {boolean} options.extractLegalInfo 
   * @param {boolean} options.classifyPageTypes 
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
      extractContactInfo: true,
      extractLegalInfo: true,
      classifyPageTypes: true,
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

    // 8. Contact Information Extraction
    const contactInfo = opts.extractContactInfo !== false ? this._extractContactInfo(doc, effectiveBaseUrl) : { emails: [], phones: [], socials: [], addresses: [], hasContactForm: false };

    // 9. Legal & Policy Information Extraction
    const legalInfo = opts.extractLegalInfo !== false ? this._extractLegalInfo(doc, effectiveBaseUrl) : { termsUrl: '', privacyUrl: '', cookieUrl: '', disclaimerUrl: '', copyright: '', hasTerms: false, hasPrivacy: false };

    // 10. Page Classification
    const classification = opts.classifyPageTypes !== false ? this._classifyPage(doc, pageUrl, title, headings.list) : { type: 'standard', label: 'Standard Page', badgeClass: 'badge-neutral' };

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
      contactInfo,
      legalInfo,
      pageType: classification.type,
      pageTypeLabel: classification.label,
      pageTypeBadgeClass: classification.badgeClass,
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
      'dialog', 'template', 'button', 'select', 'form',
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

    // Extract heading-structured sections and content
    const headingExtraction = this._extractHeadingSections(body);

    // Extract raw paragraphs
    const paragraphs = [];
    const pNodes = body.querySelectorAll('p, article, section, div > p');
    for (const p of pNodes) {
      const text = p.textContent?.replace(/\s+/g, ' ').trim();
      if (text && text.length > 15 && !paragraphs.includes(text)) {
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
      paragraphs,
      headingSections: headingExtraction.sections,
      headingStructuredText: headingExtraction.formattedText
    };
  }

  /**
   * Extracts text grouped under each heading (H1 through H6) in document order.
   * Excludes images, links, and styling; focuses purely on readable content per heading.
   * 
   * @param {HTMLElement} body 
   * @returns {{ sections: Array<{ level: string, heading: string, paragraphs: Array<string> }>, formattedText: string }}
   */
  static _extractHeadingSections(body) {
    const sections = [];
    let currentSection = {
      level: 'h1',
      heading: 'Introduction / Overview',
      paragraphs: []
    };

    const elements = body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre');
    const seenTexts = new Set();

    for (const el of elements) {
      const tagName = el.tagName.toLowerCase();

      if (/^h[1-6]$/.test(tagName)) {
        const headingText = el.textContent?.replace(/\s+/g, ' ').trim();
        if (headingText) {
          // If current section has accumulated content or is a real heading, push it
          if (currentSection.paragraphs.length > 0 || currentSection.heading !== 'Introduction / Overview') {
            sections.push(currentSection);
          }
          currentSection = {
            level: tagName,
            heading: headingText,
            paragraphs: []
          };
        }
      } else if (['p', 'li', 'blockquote', 'pre'].includes(tagName)) {
        // Skip elements that contain child block elements to avoid duplicate text
        if (el.querySelector('p, li, blockquote, h1, h2, h3, h4, h5, h6')) {
          continue;
        }

        const text = el.textContent?.replace(/\s+/g, ' ').trim();
        if (text && text.length > 5 && !seenTexts.has(text)) {
          seenTexts.add(text);
          currentSection.paragraphs.push(text);
        }
      }
    }

    if (currentSection.paragraphs.length > 0 || (currentSection.heading !== 'Introduction / Overview' && sections.length === 0)) {
      sections.push(currentSection);
    }

    // Format into clean plain text / markdown
    const formattedLines = [];
    for (const sec of sections) {
      const levelNum = sec.level.startsWith('h') ? parseInt(sec.level.slice(1), 10) : 2;
      const prefix = '#'.repeat(levelNum);
      formattedLines.push(`${prefix} ${sec.heading}\n`);
      for (const p of sec.paragraphs) {
        formattedLines.push(`${p}\n`);
      }
      formattedLines.push('');
    }

    return {
      sections,
      formattedText: formattedLines.join('\n').trim()
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

  /**
   * Extracts contact information: emails, phone numbers, social links, contact forms, and addresses.
   */
  static _extractContactInfo(doc, baseUrl) {
    const emails = new Set();
    const phones = new Set();
    const socials = [];
    const seenSocials = new Set();

    // 1. Mailto links
    const mailtoLinks = doc.querySelectorAll('a[href^="mailto:" i]');
    for (const a of mailtoLinks) {
      const href = a.getAttribute('href') || '';
      const email = href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
      if (email && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        emails.add(email);
      }
    }

    // 2. Tel links
    const telLinks = doc.querySelectorAll('a[href^="tel:" i]');
    for (const a of telLinks) {
      const href = a.getAttribute('href') || '';
      const phone = href.replace(/^tel:/i, '').split('?')[0].trim();
      if (phone && phone.length >= 6) {
        phones.add(phone);
      }
    }

    // 3. Scan page text for raw emails
    const pageText = doc.body ? doc.body.textContent || '' : '';
    const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
    let match;
    while ((match = emailRegex.exec(pageText)) !== null) {
      const e = match[0].toLowerCase();
      if (!/\.(png|jpg|jpeg|gif|webp|svg|css|js|woff|woff2)$/i.test(e) && !e.includes('example.com') && !e.includes('yourdomain')) {
        emails.add(e);
      }
    }

    // 4. Social Media Links
    const socialPlatforms = [
      { name: 'Twitter / X', regex: /(?:https?:)?\/\/(?:www\.)?(twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,30})/i },
      { name: 'LinkedIn', regex: /(?:https?:)?\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/([a-zA-Z0-9_-]+)/i },
      { name: 'Facebook', regex: /(?:https?:)?\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]+)/i },
      { name: 'Instagram', regex: /(?:https?:)?\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.-]+)/i },
      { name: 'YouTube', regex: /(?:https?:)?\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/)?([a-zA-Z0-9_-]+)/i },
      { name: 'GitHub', regex: /(?:https?:)?\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)/i },
      { name: 'TikTok', regex: /(?:https?:)?\/\/(?:www\.)?tiktok\.com\/@?([a-zA-Z0-9_.-]+)/i }
    ];

    const allAnchors = doc.querySelectorAll('a[href]');
    for (const a of allAnchors) {
      const rawHref = a.getAttribute('href') || '';
      const resolved = resolveUrl(rawHref, baseUrl);
      if (!resolved) continue;

      for (const platform of socialPlatforms) {
        if (platform.regex.test(resolved) && !seenSocials.has(resolved)) {
          seenSocials.add(resolved);
          socials.push({
            platform: platform.name,
            url: resolved,
            handle: resolved.match(platform.regex)?.[1] || ''
          });
        }
      }
    }

    // 5. Contact Form Detection
    const contactForm = !!doc.querySelector('form[action*="contact" i], form[id*="contact" i], form[class*="contact" i], form input[type="email"], form textarea');

    return {
      emails: Array.from(emails).slice(0, 20),
      phones: Array.from(phones).slice(0, 20),
      socials: socials.slice(0, 20),
      hasContactForm: contactForm,
      hasContactDetails: emails.size > 0 || phones.size > 0 || socials.length > 0 || contactForm
    };
  }

  /**
   * Extracts legal and policy links and copyright information.
   */
  static _extractLegalInfo(doc, baseUrl) {
    let termsUrl = '';
    let privacyUrl = '';
    let cookieUrl = '';
    let disclaimerUrl = '';
    let copyright = '';

    const allAnchors = doc.querySelectorAll('a[href]');
    for (const a of allAnchors) {
      const text = a.textContent?.trim() || '';
      const rawHref = a.getAttribute('href') || '';
      const hrefLower = rawHref.toLowerCase();
      const textLower = text.toLowerCase();

      // Terms of Service / Terms & Conditions
      if (!termsUrl && (
        /terms\s*(and|&)\s*conditions|terms\s*of\s*(service|use)|user\s*agreement|\btos\b/i.test(textLower) ||
        /(terms[-_ ]?(of[-_ ]?service|and[-_ ]?conditions|of[-_ ]?use)?|\btos\b)/i.test(hrefLower)
      )) {
        termsUrl = resolveUrl(rawHref, baseUrl) || rawHref;
      }

      // Privacy Policy
      if (!privacyUrl && (
        /privacy\s*(policy|notice)|data\s*protection|\bgdpr\b/i.test(textLower) ||
        /privacy[-_ ]?(policy|notice)?|\bgdpr\b/i.test(hrefLower)
      )) {
        privacyUrl = resolveUrl(rawHref, baseUrl) || rawHref;
      }

      // Cookie Policy
      if (!cookieUrl && (
        /cookie\s*(policy|preferences|settings)/i.test(textLower) ||
        /cookie[-_ ]?(policy|settings)/i.test(hrefLower)
      )) {
        cookieUrl = resolveUrl(rawHref, baseUrl) || rawHref;
      }

      // Disclaimer / Legal Notice / Imprint / Refund
      if (!disclaimerUrl && (
        /disclaimer|legal\s*notice|imprint|impressum|refund\s*policy/i.test(textLower) ||
        /disclaimer|imprint|impressum|refund[-_ ]?policy/i.test(hrefLower)
      )) {
        disclaimerUrl = resolveUrl(rawHref, baseUrl) || rawHref;
      }
    }

    // Copyright statement extraction from footer or body text
    const footerText = doc.querySelector('footer, .footer, #footer, [class*="footer" i], [id*="footer" i]')?.textContent || doc.body?.textContent || '';
    const copyrightMatch = footerText.match(/(?:©|\bcopyright\b|\(c\))\s*(?:(?:20\d{2}|19\d{2})[-–\s]*(?:20\d{2})?)?\s*([^.\n\r<]{3,80})/i);
    if (copyrightMatch) {
      copyright = copyrightMatch[0].replace(/\s+/g, ' ').trim();
    }

    return {
      termsUrl,
      privacyUrl,
      cookieUrl,
      disclaimerUrl,
      copyright,
      hasTerms: !!termsUrl,
      hasPrivacy: !!privacyUrl,
      hasLegalInfo: !!(termsUrl || privacyUrl || cookieUrl || disclaimerUrl || copyright)
    };
  }

  /**
   * Classifies page type using URL signals, Title, Headings, and content indicators.
   */
  static _classifyPage(doc, pageUrl, title, headingsList = []) {
    const headingTexts = Array.isArray(headingsList) ? headingsList.map(h => h.text || h) : [];
    return classifyUrlType(pageUrl, title, headingTexts);
  }
}
