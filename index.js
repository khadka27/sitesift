/**
 * Site Data Crawler - Showcase Webpage Interactive Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  // =========================================================================
  // 1. Preset Data Definitions for Crawl Simulator
  // =========================================================================
  const PRESETS = {
    'https://store.myshopify.com': {
      name: 'E-Commerce Store',
      urls: [
        { status: 200, statusText: 'success', type: 'standard', typeLabel: 'Standard', badgeClass: 'badge-primary', path: '/', title: 'Modern Apparel Store - Minimalist Essentials', words: 1420, latency: 124, emails: ['support@store.com'], phones: ['+1 (800) 555-0199'] },
        { status: 200, statusText: 'success', type: 'terms', typeLabel: 'Terms & Conditions', badgeClass: 'badge-terms', path: '/policies/terms-of-service', title: 'Terms of Service - Modern Apparel', words: 2850, latency: 98, emails: ['legal@store.com'], phones: [] },
        { status: 200, statusText: 'success', type: 'privacy', typeLabel: 'Privacy Policy', badgeClass: 'badge-privacy', path: '/policies/privacy-policy', title: 'Privacy & Cookie Disclosure', words: 2150, latency: 110, emails: ['privacy@store.com'], phones: [] },
        { status: 200, statusText: 'success', type: 'legal', typeLabel: 'Refund Policy', badgeClass: 'badge-terms', path: '/policies/refund-policy', title: 'Return & Refund Policy', words: 940, latency: 105, emails: [], phones: [] },
        { status: 200, statusText: 'success', type: 'contact', typeLabel: 'Contact Us', badgeClass: 'badge-contact', path: '/pages/contact-us', title: 'Contact Us - Customer Service', words: 450, latency: 85, emails: ['help@store.com'], phones: ['+1 (800) 555-0199'] },
        { status: 200, statusText: 'success', type: 'about', typeLabel: 'About Us', badgeClass: 'badge-about', path: '/pages/about-us', title: 'Our Story & Sustainable Mission', words: 1240, latency: 135, emails: [], phones: [] },
        { status: 200, statusText: 'success', type: 'standard', typeLabel: 'Catalog', badgeClass: 'badge-primary', path: '/collections/all-products', title: 'All Products & Collections', words: 890, latency: 142, emails: [], phones: [] },
        { status: 200, statusText: 'success', type: 'standard', typeLabel: 'Product', badgeClass: 'badge-primary', path: '/products/merino-wool-jacket', title: 'Premium Merino Wool Jacket', words: 620, latency: 118, emails: [], phones: [] }
      ]
    },
    'https://docs.stripe.com': {
      name: 'SaaS API Docs',
      urls: [
        { status: 200, statusText: 'success', type: 'docs', typeLabel: 'API Reference', badgeClass: 'badge-cyan', path: '/api/overview', title: 'Stripe API Reference - Quickstart', words: 3120, latency: 82, emails: [], phones: [] },
        { status: 200, statusText: 'success', type: 'docs', typeLabel: 'Documentation', badgeClass: 'badge-cyan', path: '/payments/accept-a-payment', title: 'Accept Online Payments & Invoicing', words: 2450, latency: 95, emails: [], phones: [] },
        { status: 200, statusText: 'success', type: 'terms', typeLabel: 'Terms of Service', badgeClass: 'badge-terms', path: '/legal/service-agreement', title: 'Stripe Services Agreement', words: 4200, latency: 115, emails: ['legal@stripe.com'], phones: [] },
        { status: 200, statusText: 'success', type: 'privacy', typeLabel: 'Privacy Center', badgeClass: 'badge-privacy', path: '/privacy/policy', title: 'Global Privacy Policy & GDPR Notice', words: 3800, latency: 104, emails: ['privacy@stripe.com'], phones: [] },
        { status: 200, statusText: 'success', type: 'contact', typeLabel: 'Sales Contact', badgeClass: 'badge-contact', path: '/contact/sales', title: 'Contact Enterprise Sales & Solutions', words: 560, latency: 90, emails: ['sales@stripe.com'], phones: ['+1 (888) 926-2289'] },
        { status: 200, statusText: 'success', type: 'docs', typeLabel: 'Documentation', badgeClass: 'badge-cyan', path: '/webhooks/overview', title: 'Webhooks Architecture & Event Types', words: 1850, latency: 88, emails: [], phones: [] }
      ]
    },
    'https://techcrunch.com': {
      name: 'Tech News Blog',
      urls: [
        { status: 200, statusText: 'success', type: 'blog', typeLabel: 'Homepage', badgeClass: 'badge-purple', path: '/', title: 'TechCrunch - Startup and Tech News', words: 2600, latency: 140, emails: ['tips@techcrunch.com'], phones: [] },
        { status: 200, statusText: 'success', type: 'blog', typeLabel: 'Article', badgeClass: 'badge-purple', path: '/2026/08/ai-breakthrough-agentic-models', title: 'Next-Gen Agentic AI Models Released', words: 1120, latency: 112, emails: ['author@techcrunch.com'], phones: [] },
        { status: 200, statusText: 'success', type: 'terms', typeLabel: 'Terms of Use', badgeClass: 'badge-terms', path: '/terms-and-conditions', title: 'Terms of Use & Content Policy', words: 3100, latency: 95, emails: ['legal@techcrunch.com'], phones: [] },
        { status: 200, statusText: 'success', type: 'privacy', typeLabel: 'Privacy Policy', badgeClass: 'badge-privacy', path: '/privacy', title: 'Privacy Policy & Cookies Notice', words: 2400, latency: 105, emails: [], phones: [] },
        { status: 200, statusText: 'success', type: 'contact', typeLabel: 'Editorial Contact', badgeClass: 'badge-contact', path: '/contact-editorial', title: 'Contact Editorial Desk & Press Team', words: 420, latency: 88, emails: ['editorial@techcrunch.com'], phones: [] },
        { status: 200, statusText: 'success', type: 'about', typeLabel: 'About Us', badgeClass: 'badge-about', path: '/about', title: 'About TechCrunch - Tech Journalism', words: 980, latency: 102, emails: [], phones: [] }
      ]
    },
    'https://acmecorp.com': {
      name: 'Corporate Portal',
      urls: [
        { status: 200, statusText: 'success', type: 'standard', typeLabel: 'Corporate Hub', badgeClass: 'badge-primary', path: '/', title: 'Acme Global - Enterprise Cloud Architecture', words: 1650, latency: 110, emails: ['info@acmecorp.com'], phones: ['+1 (555) 014-9988'] },
        { status: 200, statusText: 'success', type: 'about', typeLabel: 'About Us', badgeClass: 'badge-about', path: '/company/about-us', title: 'Leadership, Mission & Global Offices', words: 1450, latency: 98, emails: [], phones: [] },
        { status: 200, statusText: 'success', type: 'terms', typeLabel: 'Master Agreement', badgeClass: 'badge-terms', path: '/legal/terms-and-conditions', title: 'Master Services Agreement & Terms', words: 3600, latency: 120, emails: ['legal@acmecorp.com'], phones: [] },
        { status: 200, statusText: 'success', type: 'privacy', typeLabel: 'Privacy Center', badgeClass: 'badge-privacy', path: '/legal/privacy-policy', title: 'Enterprise Data Privacy & Security', words: 2900, latency: 115, emails: ['dpo@acmecorp.com'], phones: [] },
        { status: 200, statusText: 'success', type: 'contact', typeLabel: 'Contact Inquiries', badgeClass: 'badge-contact', path: '/contact-us', title: 'Contact Us - Global Locations & Support', words: 520, latency: 82, emails: ['inquiries@acmecorp.com'], phones: ['+1 (555) 014-9988'] }
      ]
    }
  };

  // =========================================================================
  // 2. Interactive Crawl Simulator Controller
  // =========================================================================
  const simUrlInput = document.getElementById('simUrlInput');
  const btnRunSim = document.getElementById('btnRunSim');
  const simBtnText = document.getElementById('simBtnText');
  const simProgressBar = document.getElementById('simProgressBar');
  const simCountDiscovered = document.getElementById('simCountDiscovered');
  const simCountCrawled = document.getElementById('simCountCrawled');
  const simCountLegal = document.getElementById('simCountLegal');
  const simCountEmails = document.getElementById('simCountEmails');
  const simAvgLatency = document.getElementById('simAvgLatency');
  const simTableBody = document.getElementById('simTableBody');
  const presetButtons = document.querySelectorAll('.preset-btn');

  let simRunning = false;
  let simTimer = null;

  // Preset button selection
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (simRunning) return;
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      simUrlInput.value = btn.dataset.url;
    });
  });

  // Run simulation trigger
  btnRunSim.addEventListener('click', () => {
    if (simRunning) return;
    startSimulator();
  });

  // Launch live web crawler dashboard with current URL
  const btnLaunchLiveCrawl = document.getElementById('btnLaunchLiveCrawl');
  if (btnLaunchLiveCrawl) {
    btnLaunchLiveCrawl.addEventListener('click', () => {
      const url = simUrlInput.value.trim() || 'https://store.myshopify.com';
      window.open(`crawler.html?url=${encodeURIComponent(url)}&start=true`, '_blank');
    });
  }

  function startSimulator() {
    simRunning = true;
    btnRunSim.disabled = true;
    simBtnText.textContent = 'Crawling in Progress...';
    simProgressBar.style.width = '0%';
    while (simTableBody.firstChild) simTableBody.removeChild(simTableBody.firstChild);

    const currentUrl = simUrlInput.value.trim() || 'https://store.myshopify.com';
    const activePreset = PRESETS[currentUrl] || PRESETS['https://store.myshopify.com'];
    const pages = activePreset.urls;

    let index = 0;
    let totalLatency = 0;
    let legalFound = 0;
    let emailsCount = 0;

    simCountDiscovered.textContent = pages.length * 3;
    simCountCrawled.textContent = '0';
    simCountLegal.textContent = '0';
    simCountEmails.textContent = '0';
    simAvgLatency.textContent = '0 ms';

    simTimer = setInterval(() => {
      if (index >= pages.length) {
        clearInterval(simTimer);
        simProgressBar.style.width = '100%';
        simBtnText.textContent = 'Crawl Completed!';
        setTimeout(() => {
          btnRunSim.disabled = false;
          simBtnText.textContent = 'Start Simulated Crawl';
          simRunning = false;
        }, 1500);
        return;
      }

      const p = pages[index];
      totalLatency += p.latency;
      if (p.type === 'terms' || p.type === 'privacy' || p.type === 'legal') legalFound++;
      emailsCount += p.emails.length;

      const progressPercent = Math.round(((index + 1) / pages.length) * 100);
      simProgressBar.style.width = `${progressPercent}%`;

      // Update counters
      simCountCrawled.textContent = index + 1;
      simCountLegal.textContent = legalFound;
      simCountEmails.textContent = emailsCount;
      simAvgLatency.textContent = `${Math.round(totalLatency / (index + 1))} ms`;

      // Insert Row
      const tr = document.createElement('tr');
      tr.style.opacity = '0';
      tr.style.transform = 'translateY(6px)';
      tr.style.transition = 'all 0.3s ease';

      const tdNum = document.createElement('td');
      tdNum.textContent = index + 1;

      const tdStatus = document.createElement('td');
      const spanStatus = document.createElement('span');
      spanStatus.className = 'badge badge-green';
      spanStatus.textContent = '200 OK';
      tdStatus.appendChild(spanStatus);

      const tdType = document.createElement('td');
      const spanType = document.createElement('span');
      spanType.className = `badge ${p.badgeClass}`;
      spanType.textContent = p.typeLabel;
      tdType.appendChild(spanType);

      const tdPath = document.createElement('td');
      const spanPath = document.createElement('span');
      spanPath.className = 'url-code-text';
      spanPath.textContent = p.path;
      tdPath.appendChild(spanPath);

      const tdTitle = document.createElement('td');
      const strongTitle = document.createElement('strong');
      strongTitle.textContent = p.title;
      tdTitle.appendChild(strongTitle);

      const tdWords = document.createElement('td');
      tdWords.textContent = `${p.words} words`;

      const tdLatency = document.createElement('td');
      tdLatency.textContent = `${p.latency} ms`;

      tr.append(tdNum, tdStatus, tdType, tdPath, tdTitle, tdWords, tdLatency);
      simTableBody.appendChild(tr);

      // Trigger fade-in
      requestAnimationFrame(() => {
        tr.style.opacity = '1';
        tr.style.transform = 'translateY(0)';
      });

      index++;
    }, 450);
  }

  // =========================================================================
  // 3. Export Formats Switcher & Code Viewer
  // =========================================================================
  const exportSamples = {
    'export-csv': {
      filename: 'myshopify_pages.csv',
      content: `"URL","HTTP Status","Status Label","Page Type","Title","Meta Description","Contact Emails","Contact Phones","Social Media Profiles","Terms URL","Privacy Policy URL","Copyright Statement","Word Count","H1 Count","H1 Text"
"https://store.myshopify.com/","200","success","Standard Page","Modern Apparel Store","Discover our curated collection of premium streetwear and minimalist essentials.","support@store.com","+1 (800) 555-0199","Twitter: https://x.com/modernapparel; Instagram: https://instagram.com/modernapparel","https://store.myshopify.com/policies/terms-of-service","https://store.myshopify.com/policies/privacy-policy","© 2026 Modern Apparel Co.","1420","1","Elevate Your Everyday Style"
"https://store.myshopify.com/policies/terms-of-service","200","success","Terms & Conditions","Terms of Service - Modern Apparel","Read our terms and conditions governing use of this website and services.","legal@store.com","","","https://store.myshopify.com/policies/terms-of-service","https://store.myshopify.com/policies/privacy-policy","© 2026 Modern Apparel Co.","2850","1","Terms and Conditions of Service"
"https://store.myshopify.com/pages/contact-us","200","success","Contact Us","Contact Us - Customer Support","Get in touch with our support team for orders, inquiries, or wholesale questions.","help@store.com","+1 (800) 555-0199","","","","","450","1","How Can We Help You?"`
    },
    'export-md': {
      filename: 'myshopify_headings_content.md',
      content: `# Site Headings & Content Report: store.myshopify.com
Generated: 2026-08-30 | Total Pages: 8

---

## 1. [https://store.myshopify.com/](https://store.myshopify.com/)
- **Status:** 200 OK | **Page Type:** Standard Page | **Word Count:** 1,420 words
- **Contact:** support@store.com | +1 (800) 555-0199

# Elevate Your Everyday Style
Sustainable fashion crafted with organic cotton and recycled materials.

## Featured Autumn Collection
Discover timeless outerwear designed for modern city life.

### Sustainable Knitwear & Essentials
Ethically sourced and responsibly made in Portugal.

---

## 2. [https://store.myshopify.com/policies/terms-of-service](https://store.myshopify.com/policies/terms-of-service)
- **Status:** 200 OK | **Page Type:** Terms & Conditions | **Word Count:** 2,850 words

# Terms and Conditions of Service
Please read these terms carefully before accessing or using our website.

## 1. Acceptance of Terms
By visiting our site or purchasing from us, you engage in our service.

## 2. Billing & Account Information
We reserve the right to refuse any order you place with us.`
    },
    'export-txt': {
      filename: 'myshopify_headings_content.txt',
      content: `============================================================
SITE HEADINGS & CONTENT REPORT
Site: https://store.myshopify.com
Pages: 8 | Generated: 2026-08-30
============================================================

PAGE 1: https://store.myshopify.com/
Type: Standard Page | Status: 200 OK | Words: 1,420

H1: Elevate Your Everyday Style
Sustainable fashion crafted with organic cotton and recycled materials.

H2: Featured Autumn Collection
Discover timeless outerwear designed for modern city life.

H3: Sustainable Knitwear & Essentials
Ethically sourced and responsibly made in Portugal.

------------------------------------------------------------
PAGE 2: https://store.myshopify.com/policies/terms-of-service
Type: Terms & Conditions | Status: 200 OK | Words: 2,850

H1: Terms and Conditions of Service
Please read these terms carefully before accessing or using our website.

H2: 1. Acceptance of Terms
By visiting our site or purchasing from us, you engage in our service.`
    },
    'export-json': {
      filename: 'myshopify_crawl_data.json',
      content: `{
  "siteUrl": "https://store.myshopify.com",
  "crawlTimestamp": "2026-08-30T10:45:00Z",
  "totalPages": 8,
  "pages": [
    {
      "url": "https://store.myshopify.com/",
      "httpStatus": 200,
      "pageType": "standard",
      "pageTypeLabel": "Standard Page",
      "title": "Modern Apparel Store - Minimalist Essentials",
      "metadata": {
        "description": "Discover our curated collection of premium streetwear and minimalist essentials.",
        "canonical": "https://store.myshopify.com/"
      },
      "contactInfo": {
        "emails": ["support@store.com"],
        "phones": ["+1 (800) 555-0199"],
        "socials": [
          { "platform": "Twitter", "url": "https://x.com/modernapparel" },
          { "platform": "Instagram", "url": "https://instagram.com/modernapparel" }
        ]
      },
      "legalInfo": {
        "termsUrl": "https://store.myshopify.com/policies/terms-of-service",
        "privacyUrl": "https://store.myshopify.com/policies/privacy-policy",
        "copyright": "© 2026 Modern Apparel Co."
      },
      "wordCount": 1420
    }
  ]
}`
    },
    'export-xml': {
      filename: 'myshopify_sitemap.xml',
      content: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://store.myshopify.com/</loc>
    <lastmod>2026-08-30</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://store.myshopify.com/policies/terms-of-service</loc>
    <lastmod>2026-08-30</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://store.myshopify.com/pages/contact-us</loc>
    <lastmod>2026-08-30</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
</urlset>`
    }
  };

  const exportTabBtns = document.querySelectorAll('.export-tab-btn');
  const exportFileName = document.getElementById('exportFileName');
  const exportCodeBlock = document.getElementById('exportCodeBlock');
  const btnCopyExportSample = document.getElementById('btnCopyExportSample');

  exportTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      exportTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const target = btn.dataset.target;
      const data = exportSamples[target];
      if (data) {
        exportFileName.textContent = data.filename;
        exportCodeBlock.textContent = data.content;
      }
    });
  });

  if (btnCopyExportSample) {
    btnCopyExportSample.addEventListener('click', () => {
      copyToClipboard(exportCodeBlock.textContent, 'Export sample copied to clipboard!');
    });
  }

  // =========================================================================
  // 4. FAQ Accordion Toggle
  // =========================================================================
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      faqItems.forEach(i => i.classList.remove('open'));
      if (!isOpen) {
        item.classList.add('open');
      }
    });
  });

  // =========================================================================
  // 5. Global Copy Code Snippets
  // =========================================================================
  document.querySelectorAll('.btn-copy-code[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.copy;
      copyToClipboard(text, 'Copied path to clipboard!');
    });
  });

  const toastNotice = document.getElementById('toastNotice');
  function copyToClipboard(text, msg = 'Copied to clipboard!') {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      if (toastNotice) {
        toastNotice.textContent = msg;
        toastNotice.classList.add('show');
        setTimeout(() => {
          toastNotice.classList.remove('show');
        }, 2200);
      }
    }).catch(() => {});
  }

  // =========================================================================
  // 6. Navigation Scroll Spy
  // =========================================================================
  const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
  window.addEventListener('scroll', () => {
    const scrollPos = window.scrollY + 100;
    navLinks.forEach(link => {
      const targetSection = document.querySelector(link.getAttribute('href'));
      if (targetSection) {
        const top = targetSection.offsetTop;
        const height = targetSection.offsetHeight;
        if (scrollPos >= top && scrollPos < top + height) {
          navLinks.forEach(l => l.classList.remove('active'));
          link.classList.add('active');
        }
      }
    });
  });
});
