# Site Data Crawler — Chrome & Edge Extension (Manifest V3)

A production-quality browser extension built purely with **HTML5**, **CSS3**, and **Vanilla JavaScript** (ES Modules). **Site Data Crawler** provides website crawling, recursive XML sitemap discovery (including sitemap indexes and `robots.txt` discovery), controlled asynchronous web crawling, SEO and structured data extraction, real-time live monitoring, duplicate content auditing, and multi-format exports.

Zero external frameworks (no React, Vue, TypeScript, or third-party bundle dependencies).

---

## 📁 Extension Architecture

```
site-data-crawler/
│
├── manifest.json            # Chrome/Edge Manifest V3 configuration
│
├── popup.html               # 400px compact popup interface
├── popup.css                # Professional developer tool styling
├── popup.js                 # Popup controller & active tab detection
│
├── crawler.html             # Dedicated full-tab crawler & SEO audit dashboard
├── crawler.css              # Dashboard layout, data tables, and modal styles
├── crawler.js               # Crawling engine, queue manager, & metric auditor
│
├── options.html             # Advanced settings & exclusion rules
├── options.css              # Options page stylesheet
├── options.js               # Storage configuration manager
│
├── background.js            # MV3 background service worker
│
├── utils/
│   ├── sitemap-parser.js    # Recursive XML sitemap & index parser
│   ├── html-parser.js       # Safe DOMParser for SEO, headings, & Schema.org
│   ├── url-utils.js         # Normalization, relative resolution, & robots.txt
│   ├── exporter.js          # TXT, CSV, JSON, and XML report generator
│   └── storage.js           # Async chrome.storage.local abstraction
│
└── icons/
    ├── icon16.png           # 16x16 toolbar icon
    ├── icon32.png           # 32x32 retina icon
    ├── icon48.png           # 48x48 extensions management icon
    └── icon128.png          # 128x128 store & installation icon
```

---

## 🚀 Installation Guide

### Google Chrome & Brave

1. Open your browser and navigate to `chrome://extensions/`
2. Toggle the **Developer mode** switch in the top right corner.
3. Click the **Load unpacked** button in the top left.
4. Select the `site-data-crawler` folder (or this repository directory: `/home/khadka27/Desktop/sitesift`).
5. The **Site Data Crawler** extension will appear in your extensions list and toolbar. Pin it to your toolbar for quick access!

### Microsoft Edge

1. Navigate to `edge://extensions/`
2. Enable **Developer mode** toggle in the left sidebar.
3. Click **Load unpacked**.
4. Select the extension directory.

---

## 🛠️ How to Test on a Public Website

1. Click the **Site Data Crawler** icon in your browser toolbar to open the popup.
2. Enter a target website (e.g. `https://example.com` or any public blog/news site), or click **Use Active Tab** to test your current page.
3. Choose your crawl presets:
   - **Max Pages:** `10`, `50`, `100`, `500`, or `Custom`
   - **Crawl Delay:** `0ms` (Fast), `250ms`, `500ms` (Safe/Default), `1000ms` (Polite)
   - **Crawl Mode:** `Sitemap + Discovered Links`, `Sitemap Only`, or `Links Only`
4. Click **Start Crawl**.
5. The full-page dashboard opens automatically, performing:
   - Automated discovery of `/robots.txt`, `/sitemap.xml`, `/sitemap_index.xml`, and `/wp-sitemap.xml`.
   - Recursive resolution of child sitemaps in sitemap indexes.
   - Parallel, rate-limited page fetching with live progress visualization.
   - Real-time page inspection with the **Inspect** button on any table row.
6. When crawling completes, click the **Export & Reports** tab to download your audit in **TXT**, **CSV**, **JSON**, or **XML Sitemap** format.

---

## 🔍 Key Features

### 1. Recursive Sitemap Discovery
- Auto-detects `robots.txt` and extracts `Sitemap:` directives.
- Discovers standard sitemaps (`sitemap.xml`, `sitemap_index.xml`, `wp-sitemap.xml`).
- Handles `<sitemapindex>` hierarchies recursively.
- XML parser with fallback for non-standard XML namespaces.

### 2. Rate Limiting & Safe Crawling
- Configurable worker concurrency (default: 3 workers).
- Configurable inter-request delay (default: 500ms).
- Respects `robots.txt` `Disallow:` and `Crawl-delay:` rules.
- Strict deduplication of normalized URLs.
- Skips non-HTML binary files (`.pdf`, `.zip`, `.jpg`, `.mp4`, etc.) and non-crawlable protocols (`mailto:`, `tel:`, `javascript:`).

### 3. Comprehensive Data Extraction & Scope Rules
- **Basic Info:** Final URL, HTTP status code, Content-Type, Language, Response latency.
- **Scope & Extra Pages Rules:** Auto-prioritizes and extracts **Terms and Conditions**, **Legal Pages** (Privacy Policy, Disclaimers, Cookie Policy, Legal Notice, Imprint, Refund Policy), and **Contact Us / About Us** pages.
- **Page Type Classification:** Automatic category detection (`Terms & Conditions`, `Privacy Policy`, `Legal / Policy`, `Contact Us`, `About Us`, `Docs / Help`, `Blog / News`, `Standard Page`).
- **Contact & Compliance Extraction:**
  - **Emails:** Extracted from `mailto:` links and text body.
  - **Phone Numbers:** Extracted from `tel:` links and phone patterns.
  - **Social Media Profiles:** Detects Twitter/X, LinkedIn, Facebook, Instagram, YouTube, GitHub, and TikTok profiles.
  - **Legal Policies:** Direct URL resolution for Terms of Service, Privacy Policies, Cookie notices, and Disclaimers.
  - **Copyright Notices:** Automatically parses copyright statements (e.g. `© 2026 Company`).
- **SEO Metadata:** `<title>`, meta description, keywords, canonical link, robots directives (`noindex`, `nofollow`), viewport, author, generator.
- **Social Tags:** Open Graph (`og:title`, `og:description`, `og:image`, `og:type`, etc.) and Twitter Cards (`twitter:card`, `twitter:title`, etc.).
- **Headings Hierarchy:** Complete H1–H6 structural tree with level and text.
- **Clean Content:** Boilerplate-stripped body text with calculated word count, character count, and paragraph count.
- **Links:** Categorized internal vs. external links with anchor text and `rel` attributes.
- **Images:** Image URLs, `alt` text validation, dimensions, and lazy-loading attributes.
- **Structured Data:** JSON-LD schema objects with automatic Schema.org entity detection (`Article`, `Product`, `Organization`, `LocalBusiness`, `FAQPage`, `BreadcrumbList`, etc.), Microdata, and RDFa.

### 4. SEO Summary & Compliance Auditing
- Real-time audit metrics: Missing Titles, Missing Meta Descriptions, Missing H1s, Multiple H1s, Missing Canonical, Broken Links, Thin Content (<200 words).
- **Legal & Contact Compliance Card:** Monitors detection of Terms & Conditions, Privacy Policy, Contact Us page, and total count of discovered emails, phone numbers, and social links.
- Grouped duplicate detection for duplicate page titles, meta descriptions, and canonical tags.

### 5. Multi-Format Exports
- **Heading-Structured Text (.TXT):** Pure text content of all crawled pages organized strictly by headings (H1–H6). Completely excludes images, media, and links clutter.
- **Markdown by Headings (.MD):** Structured `#`, `##`, `###` Markdown report of all pages.
- **Comprehensive Audit Report (.TXT):** Detailed page-by-page ASCII report with SEO metadata, headings, link counts, and previews.
- **Spreadsheet CSV (.CSV):** Spreadsheet-ready SEO summary table.
- **Structured JSON (.JSON):** Complete raw structured crawl dataset.
- **XML Sitemap (.XML):** Valid search-engine-ready `sitemap.xml` generated from 200 OK pages.

---

## 🔒 Permissions & Security

| Permission | Justification |
| :--- | :--- |
| `storage` | Persists user settings, exclude patterns, and recent crawl summaries locally via `chrome.storage.local`. |
| `downloads` | Saves exported TXT, CSV, JSON, and XML reports to the user's Downloads folder. |
| `activeTab` | Detects the active tab's URL in the popup and allows single-tab rendered DOM extraction. |
| `tabs` | Orchestrates opening and focusing the crawler dashboard in a dedicated tab. |
| `scripting` | Enables optional client-side DOM extraction for JavaScript-rendered SPAs on the active tab. |
| `host_permissions: ["<all_urls>"]` | Allows the extension to perform direct `fetch()` requests to public web servers without CORS proxy intermediaries. |

### Browser Security & CORS Boundaries
- **Direct Local Fetching:** Under Chrome/Edge Manifest V3, background workers and extension pages (such as `crawler.html`) granted `<all_urls>` host permissions can perform direct HTTP/HTTPS `fetch()` requests to public sites.
- **No Third-Party Scraping Proxies:** All crawling occurs locally on your machine. No external servers or API keys required.
- **Authentication & CAPTCHA Boundaries:** The crawler respects browser security boundaries. Pages requiring login sessions or protected by Cloudflare CAPTCHAs will return appropriate HTTP status codes (e.g. 401, 403) and are safely logged without halting the crawl.
- **JavaScript Rendering (SPAs):** Standard `fetch()` requests retrieve raw server HTML responses. For SPAs where content is injected exclusively client-side via JavaScript, use the **JavaScript Rendering Tool** tab to extract the live DOM directly from an active tab.

---

## 🔧 Debugging & Developer Tools

1. **Dashboard Console:** Right-click anywhere in `crawler.html` and select **Inspect** to open DevTools. All fetch events, sitemap discovery outputs, and errors are logged clearly in the Console tab.
2. **Background Service Worker Console:** Navigate to `chrome://extensions`, find **Site Data Crawler**, and click `service worker` to view background event logs.
3. **Storage Inspector:** In DevTools, open the **Application** tab -> **Local Storage** / **Extension Storage** to inspect stored settings and session records.
