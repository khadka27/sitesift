/**
 * Background Service Worker for Site Data Crawler (Manifest V3)
 * Manages extension lifecycle, tab orchestration, rendered DOM extraction,
 * and background crawl execution that persists even if popup is closed.
 */

import { Exporter } from './utils/exporter.js';
import { saveRecentSession } from './utils/storage.js';

let activeCrawlJob = {
  state: 'IDLE', // 'IDLE' | 'RUNNING' | 'COMPLETED' | 'ERROR'
  targetUrl: '',
  mode: '',
  progress: null,
  result: null,
  error: null,
  startTime: null
};

let offscreenCreated = false;

// On install or update, initialize default settings
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Site Data Crawler] Installed / Updated:', details.reason);
});

// Listen for messages from popup, offscreen processor, crawler dashboard, or options
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'OPEN_DASHBOARD') {
    handleOpenDashboard(message.params).then(sendResponse);
    return true; // async response
  }

  if (message.action === 'GET_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        sendResponse({ success: true, tab: tabs[0] });
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    });
    return true;
  }

  if (message.action === 'FETCH_RENDERED_DOM') {
    handleRenderedExtraction(message.tabId || sender.tab?.id)
      .then(html => sendResponse({ success: true, html }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'START_BACKGROUND_CRAWL') {
    handleStartBackgroundCrawl(message.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'GET_CRAWL_STATUS') {
    sendResponse({ success: true, job: activeCrawlJob });
    return false;
  }

  if (message.action === 'CANCEL_BACKGROUND_CRAWL') {
    handleCancelBackgroundCrawl()
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'BACKGROUND_CRAWL_PROGRESS') {
    if (activeCrawlJob.state === 'RUNNING') {
      activeCrawlJob.progress = message.progress;
      try {
        if (chrome.action && chrome.action.setBadgeText) {
          if (message.progress && message.progress.current !== undefined) {
            chrome.action.setBadgeText({ text: String(message.progress.current) });
            chrome.action.setBadgeBackgroundColor({ color: '#2f81f7' });
          }
        }
      } catch {}
    }
    return false;
  }
});

/**
 * Ensures the offscreen document is created and ready for DOM parsing.
 */
async function ensureOffscreenDocument() {
  if (typeof chrome.offscreen === 'undefined') return false;

  if ('getContexts' in chrome.runtime) {
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
      });
      if (contexts && contexts.length > 0) return true;
    } catch {}
  } else if (offscreenCreated) {
    return true;
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Execute background DOM parsing and crawl without stopping on popup close'
    });
    offscreenCreated = true;
    // Wait briefly for module scripts in offscreen.html to initialize
    await new Promise(r => setTimeout(r, 150));
    return true;
  } catch (err) {
    if (err.message && err.message.includes('Only a single offscreen document')) {
      offscreenCreated = true;
      return true;
    }
    console.warn('[Site Data Crawler] Offscreen creation error:', err);
    return false;
  }
}

/**
 * Closes the offscreen document when work completes.
 */
async function closeOffscreenDocument() {
  if (typeof chrome.offscreen === 'undefined') return;
  try {
    if ('getContexts' in chrome.runtime) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
      });
      if (contexts && contexts.length > 0) {
        await chrome.offscreen.closeDocument();
      }
    } else {
      await chrome.offscreen.closeDocument();
    }
  } catch {}
  offscreenCreated = false;
}

/**
 * Starts a background crawl session that continues even if popup closes.
 */
async function handleStartBackgroundCrawl(payload) {
  const { targetUrl, mode } = payload;

  activeCrawlJob = {
    state: 'RUNNING',
    targetUrl,
    mode,
    progress: {
      status: 'running',
      step: 'init',
      message: 'Starting background extraction...',
      current: 0,
      total: mode === 'single_page' ? 1 : 0
    },
    result: null,
    error: null,
    startTime: Date.now()
  };

  try {
    if (chrome.action && chrome.action.setBadgeText) {
      chrome.action.setBadgeText({ text: '...' });
      chrome.action.setBadgeBackgroundColor({ color: '#2f81f7' });
    }
  } catch {}

  // Ensure offscreen document is loaded
  await ensureOffscreenDocument();

  // Run the crawl asynchronously in background
  executeAndMonitorCrawl(payload);

  return { success: true, message: 'Background crawl started successfully' };
}

/**
 * Coordinates crawl execution in offscreen document and handles completion download.
 */
async function executeAndMonitorCrawl(payload) {
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'EXECUTE_CRAWL_IN_BACKGROUND',
        payload
      }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (resp && resp.success) {
          resolve(resp.result);
        } else {
          reject(new Error(resp?.error || 'Unknown error occurred during crawl'));
        }
      });
    });

    const result = response;
    activeCrawlJob.state = 'COMPLETED';
    activeCrawlJob.result = result;
    activeCrawlJob.progress = {
      status: 'completed',
      step: 'done',
      message: `Completed ${result.pages.length} pages`,
      current: result.pages.length,
      total: result.pages.length
    };

    // Auto-download TXT report directly using browser download manager
    Exporter.download(result.filename, result.txtContent, 'text/plain', false);

    // Save recent session
    await saveRecentSession({
      siteUrl: result.targetUrl,
      pages: result.pages,
      timestamp: new Date().toISOString(),
      stats: { totalDiscovered: result.pages.length, successful: result.pages.length, failed: 0 }
    });

    // Update extension badge to success
    try {
      if (chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: '✓' });
        chrome.action.setBadgeBackgroundColor({ color: '#2ea043' });
        setTimeout(() => {
          if (activeCrawlJob.state === 'COMPLETED') {
            chrome.action.setBadgeText({ text: '' });
          }
        }, 10000);
      }
    } catch {}

    // System Notification if available
    try {
      if (chrome.notifications && chrome.notifications.create) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Site Data Crawler',
          message: `Crawl complete! Auto-downloaded ${result.filename} (${result.pages.length} pages).`
        });
      }
    } catch {}

    // Inform open popup if any
    try {
      chrome.runtime.sendMessage({
        action: 'BACKGROUND_CRAWL_COMPLETE',
        result
      }).catch(() => {});
    } catch {}

  } catch (err) {
    console.error('[Site Data Crawler] Background crawl error:', err);
    activeCrawlJob.state = 'ERROR';
    activeCrawlJob.error = err.message;

    try {
      if (chrome.action && chrome.action.setBadgeText) {
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#f85149' });
      }
    } catch {}

    try {
      chrome.runtime.sendMessage({
        action: 'BACKGROUND_CRAWL_ERROR',
        error: err.message
      }).catch(() => {});
    } catch {}
  } finally {
    await closeOffscreenDocument();
  }
}

/**
 * Cancels an active background crawl.
 */
async function handleCancelBackgroundCrawl() {
  try {
    chrome.runtime.sendMessage({ action: 'ABORT_BACKGROUND_CRAWL' }).catch(() => {});
  } catch {}

  activeCrawlJob = {
    state: 'IDLE',
    targetUrl: '',
    mode: '',
    progress: null,
    result: null,
    error: null,
    startTime: null
  };

  try {
    if (chrome.action && chrome.action.setBadgeText) {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch {}

  await closeOffscreenDocument();
  return { success: true };
}

/**
 * Opens or focuses the Crawler dashboard tab with optional query parameters.
 */
async function handleOpenDashboard(params = {}) {
  const urlParams = new URLSearchParams();
  if (params.url) urlParams.set('targetUrl', params.url);
  if (params.autoStart) urlParams.set('autoStart', 'true');
  if (params.mode) urlParams.set('mode', params.mode);

  const targetUrl = chrome.runtime.getURL(`crawler.html?${urlParams.toString()}`);

  // Check if crawler dashboard is already open
  const existingTabs = await chrome.tabs.query({ url: chrome.runtime.getURL('crawler.html*') });
  if (existingTabs.length > 0) {
    const tab = existingTabs[0];
    await chrome.tabs.update(tab.id, { url: targetUrl, active: true });
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return { success: true, tabId: tab.id };
  } else {
    const newTab = await chrome.tabs.create({ url: targetUrl });
    return { success: true, tabId: newTab.id };
  }
}

/**
 * Extracts the rendered DOM from a specific tab using chrome.scripting.
 */
async function handleRenderedExtraction(tabId) {
  if (!tabId) throw new Error('Valid Tab ID is required for rendered DOM extraction');

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      return document.documentElement.outerHTML;
    }
  });

  if (results && results[0] && results[0].result) {
    return results[0].result;
  }

  throw new Error('Failed to retrieve rendered DOM from tab');
}
