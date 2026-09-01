/**
 * Universal Smart Fetcher for Site Data Crawler
 * Operates seamlessly both in Chrome Extension mode AND standalone Web mode.
 */

/**
 * Detects if currently executing inside Chrome/Edge extension context with host permissions.
 */
export function isExtensionContext() {
  try {
    const hasChromeRuntime = typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);
    if (!hasChromeRuntime) return false;
    const proto = typeof location !== 'undefined' ? location.protocol : (typeof self !== 'undefined' && self.location ? self.location.protocol : '');
    return proto === 'chrome-extension:' || proto === 'moz-extension:' || Boolean(chrome.runtime.getURL);
  } catch {
    return false;
  }
}

/**
 * Checks if target URL is same-origin with the current web document.
 */
function isSameOrigin(targetUrl) {
  try {
    const parsed = new URL(targetUrl, window.location.href);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Smart fetch implementation.
 * - In Extension context or for same-origin URLs: Direct client-side fetch.
 * - In Web standalone context: Routes through public CORS proxy gateways to bypass browser CORS blocks.
 */
export async function smartFetch(url, options = {}) {
  const timeoutMs = options.timeoutMs || 15000;
  const acceptHeader = options.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  const inExtension = isExtensionContext();
  const sameOrigin = typeof window !== 'undefined' && isSameOrigin(url);

  // 1. Extension or Same-Origin: Use direct fetch
  if (inExtension || sameOrigin) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': acceptHeader
        },
        ...options.fetchOptions
      });
      clearTimeout(timer);

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        url: response.url || url,
        contentType,
        text,
        isProxied: false
      };
    } catch (err) {
      if (err.name === 'AbortError' && options.abortSignal?.aborted) {
        throw err;
      }
      // If direct fetch failed in extension, return clean failure
      return {
        ok: false,
        status: 0,
        statusText: 'Fetch Error',
        url,
        contentType: '',
        text: '',
        error: err.message
      };
    }
  }

  // 2. Standalone Web Mode (e.g. localhost:5500 or web server):
  // Route through CORS proxy gateways to prevent browser console CORS blocks.
  const proxyGateways = [
    (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    (target) => `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
    (target) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
    (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`
  ];

  for (const getProxyUrl of proxyGateways) {
    try {
      const proxyUrl = getProxyUrl(url);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: {
          'Accept': acceptHeader
        }
      });
      clearTimeout(timer);

      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 0) {
          const contentType = res.headers.get('content-type') || 'text/html';
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            url: url,
            contentType,
            text,
            isProxied: true
          };
        }
      } else if (res.status === 404) {
        // Target resource returned 404
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          url,
          contentType: '',
          text: '',
          isProxied: true
        };
      }
    } catch {
      // Continue to next proxy gateway
    }
  }

  // If all proxies failed, attempt one final direct fetch as last resort
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const directRes = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': acceptHeader }
    });
    clearTimeout(timer);
    const text = await directRes.text();
    return {
      ok: directRes.ok,
      status: directRes.status,
      statusText: directRes.statusText,
      url: directRes.url || url,
      contentType: directRes.headers.get('content-type') || '',
      text,
      isProxied: false
    };
  } catch (finalErr) {
    return {
      ok: false,
      status: 0,
      statusText: 'Network / CORS Error',
      url,
      contentType: '',
      text: '',
      error: finalErr.message
    };
  }
}
