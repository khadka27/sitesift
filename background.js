/**
 * Background Service Worker for Site Data Crawler (Manifest V3)
 * Manages extension lifecycle, tab orchestration, and rendered DOM extraction.
 */

// On install or update, initialize default settings
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Site Data Crawler] Installed / Updated:', details.reason);
});

// Listen for messages from popup, crawler dashboard, or options
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
});

/**
 * Opens or focuses the Crawler dashboard tab with optional query parameters.
 * 
 * @param {Object} params 
 * @returns {Promise<{ success: boolean, tabId: number }>}
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
 * 
 * @param {number} tabId 
 * @returns {Promise<string>}
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
