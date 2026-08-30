/**
 * URL Utilities for Site Data Crawler
 * Provides URL normalization, domain validation, resolution, filtering, and robots.txt parsing.
 */

/**
 * Normalizes a URL string by trimming, removing fragments, sorting query params if needed,
 * and handling trailing slashes consistently.
 * 
 * @param {string} urlString 
 * @param {Object} options
 * @param {boolean} options.removeTrailingSlash
 * @param {boolean} options.removeQueryParams
 * @param {Array<string>} options.ignoreParams - List of query params to drop (like utm_*, fbclid)
 * @returns {string|null} Normalized URL or null if invalid
 */
export function normalizeUrl(urlString, options = {}) {
  if (!urlString || typeof urlString !== 'string') return null;

  let cleaned = urlString.trim();

  // Handle missing protocol
  if (!/^https?:\/\//i.test(cleaned)) {
    if (cleaned.startsWith('//')) {
      cleaned = 'https:' + cleaned;
    } else {
      cleaned = 'https://' + cleaned;
    }
  }

  try {
    const parsed = new URL(cleaned);

    // Only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol.toLowerCase())) {
      return null;
    }

    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase();

    // Strip hash fragment
    parsed.hash = '';

    // Remove tracking query parameters by default or all query params if specified
    if (options.removeQueryParams) {
      parsed.search = '';
    } else {
      const defaultIgnoreParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', '_ga', '_gl', 'ref'
      ];
      const ignoreList = options.ignoreParams || defaultIgnoreParams;
      
      const searchParams = new URLSearchParams(parsed.search);
      let changed = false;
      for (const param of ignoreList) {
        if (searchParams.has(param)) {
          searchParams.delete(param);
          changed = true;
        }
      }
      if (changed) {
        const remaining = searchParams.toString();
        parsed.search = remaining ? `?${remaining}` : '';
      }
    }

    // Clean duplicate slashes in pathname (e.g. /about//us -> /about/us)
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/');

    // Handle trailing slash on path (keep on root '/')
    if (options.removeTrailingSlash !== false && parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Resolves a relative URL against a base URL.
 * 
 * @param {string} relativeUrl 
 * @param {string} baseUrl 
 * @returns {string|null} Resolved absolute URL or null
 */
export function resolveUrl(relativeUrl, baseUrl) {
  if (!relativeUrl || typeof relativeUrl !== 'string') return null;
  const trimmed = relativeUrl.trim();

  // Skip invalid/non-crawlable protocols
  if (/^(mailto:|tel:|javascript:|data:|blob:|sms:|callto:|whatsapp:|geo:|skype:)/i.test(trimmed)) {
    return null;
  }

  try {
    const resolved = new URL(trimmed, baseUrl);
    return normalizeUrl(resolved.toString());
  } catch {
    return null;
  }
}

/**
 * Extracts the root domain / hostname from a URL.
 * 
 * @param {string} urlString 
 * @returns {string|null}
 */
export function getHostname(urlString) {
  try {
    const parsed = new URL(urlString);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Extracts the origin (protocol + host + port) from a URL.
 * 
 * @param {string} urlString 
 * @returns {string|null}
 */
export function getOrigin(urlString) {
  try {
    const parsed = new URL(urlString);
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Checks if targetUrl belongs to the same domain (or subdomain depending on settings).
 * 
 * @param {string} targetUrl 
 * @param {string} baseUrl 
 * @param {Object} options
 * @param {boolean} options.includeSubdomains
 * @param {boolean} options.sameDomainOnly
 * @returns {boolean}
 */
export function isAllowedDomain(targetUrl, baseUrl, options = {}) {
  const targetHost = getHostname(targetUrl);
  const baseHost = getHostname(baseUrl);

  if (!targetHost || !baseHost) return false;

  // Exact hostname match
  if (targetHost === baseHost) return true;

  if (options.includeSubdomains) {
    // Strip leading 'www.' for base comparison
    const cleanBase = baseHost.replace(/^www\./i, '');
    const cleanTarget = targetHost.replace(/^www\./i, '');

    if (cleanTarget === cleanBase) return true;
    if (cleanTarget.endsWith('.' + cleanBase)) return true;
  }

  if (options.sameDomainOnly !== false) {
    // If strictly same domain and not matched above, reject
    return false;
  }

  return true;
}

/**
 * Checks if a URL is likely a media, binary, or non-HTML resource.
 * 
 * @param {string} urlString 
 * @returns {boolean}
 */
export function isNonHtmlResource(urlString) {
  if (!urlString) return false;
  try {
    const parsed = new URL(urlString);
    const pathname = parsed.pathname.toLowerCase();
    const nonHtmlExtensions = [
      '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff', '.avif',
      '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm', '.ogg', '.wav',
      '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.exe', '.dmg', '.iso', '.bin', '.apk',
      '.css', '.js', '.json', '.xml', '.rss', '.woff', '.woff2', '.ttf', '.eot', '.otf'
    ];

    // Check if path ends with any non-HTML extension
    return nonHtmlExtensions.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Checks if a URL matches any custom exclude pattern (regex or glob string).
 * 
 * @param {string} urlString 
 * @param {Array<string>} excludePatterns 
 * @returns {boolean}
 */
export function matchesExcludePattern(urlString, excludePatterns = []) {
  if (!excludePatterns || !excludePatterns.length) return false;

  for (const pattern of excludePatterns) {
    if (!pattern || !pattern.trim()) continue;
    const trimmed = pattern.trim();
    try {
      if (trimmed.startsWith('/') && trimmed.endsWith('/') && trimmed.length > 2) {
        const regex = new RegExp(trimmed.slice(1, -1), 'i');
        if (regex.test(urlString)) return true;
      } else {
        // Glob-like match or simple substring
        const escaped = trimmed.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        const regex = new RegExp(escaped, 'i');
        if (regex.test(urlString)) return true;
      }
    } catch {
      // Fallback simple substring match
      if (urlString.toLowerCase().includes(trimmed.toLowerCase())) return true;
    }
  }
  return false;
}

/**
 * Parses robots.txt content to extract Sitemap directives and Disallow rules.
 * 
 * @param {string} robotsText 
 * @param {string} baseUrl 
 * @returns {{ sitemaps: Array<string>, disallows: Array<string>, allows: Array<string>, crawlDelay: number|null }}
 */
export function parseRobotsTxt(robotsText, baseUrl) {
  const result = {
    sitemaps: [],
    disallows: [],
    allows: [],
    crawlDelay: null
  };

  if (!robotsText || typeof robotsText !== 'string') return result;

  const lines = robotsText.split(/\r?\n/);
  let currentUserAgentMatches = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const directive = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (!value) continue;

    if (directive === 'sitemap') {
      const resolved = resolveUrl(value, baseUrl);
      if (resolved && !result.sitemaps.includes(resolved)) {
        result.sitemaps.push(resolved);
      }
    } else if (directive === 'user-agent') {
      const ua = value.toLowerCase();
      currentUserAgentMatches = (ua === '*' || ua === 'site-data-crawler' || ua.includes('bot'));
    } else if (currentUserAgentMatches) {
      if (directive === 'disallow') {
        result.disallows.push(value);
      } else if (directive === 'allow') {
        result.allows.push(value);
      } else if (directive === 'crawl-delay') {
        const delay = parseFloat(value);
        if (!isNaN(delay) && delay > 0) {
          result.crawlDelay = delay * 1000; // convert seconds to ms
        }
      }
    }
  }

  return result;
}

/**
 * Tests if a given URL is disallowed by parsed robots.txt rules.
 * 
 * @param {string} urlString 
 * @param {Array<string>} disallows 
 * @param {Array<string>} allows 
 * @returns {boolean} True if allowed, False if disallowed
 */
export function isAllowedByRobots(urlString, disallows = [], allows = []) {
  try {
    const parsed = new URL(urlString);
    const path = parsed.pathname + parsed.search;

    // Check allow rules first
    for (const allow of allows) {
      if (path.startsWith(allow)) {
        return true;
      }
    }

    // Check disallow rules
    for (const disallow of disallows) {
      if (!disallow) continue;
      if (disallow === '/') return false;
      if (path.startsWith(disallow)) {
        return false;
      }
    }

    return true;
  } catch {
    return true;
  }
}
