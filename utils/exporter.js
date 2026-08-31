/**
 * Exporter Utilities for Site Data Crawler
 * Generates structured TXT, CSV, JSON, and XML reports and triggers browser downloads.
 */

export class Exporter {
  /**
   * Generates a clean, text-only content report organized strictly by headings (H1-H6).
   * Contains NO images, NO links lists, NO meta tables — only the heading structure and readable text of all pages.
   * 
   * @param {Object} crawlData 
   * @returns {string} Plain text report
   */
  static generateHeadingContentTxtReport(crawlData) {
    const { siteUrl, pages = [], timestamp = new Date().toISOString() } = crawlData;
    const divider = '='.repeat(70);
    const subDivider = '-'.repeat(50);

    const validPages = pages.filter(p => p.status === 'success' || p.httpStatus === 200 || p.content?.cleanText);

    const lines = [
      divider,
      'SITE DATA CRAWLER — HEADING-STRUCTURED TEXT CONTENT REPORT',
      `Website:      ${siteUrl || 'N/A'}`,
      `Date:         ${timestamp.replace('T', ' ').slice(0, 19)}`,
      `Total Pages:  ${validPages.length}`,
      'Format:       Pure text content grouped under respective headings (No images/media)',
      divider,
      ''
    ];

    validPages.forEach((page, index) => {
      lines.push(divider);
      lines.push(`PAGE ${index + 1}: ${page.title || 'Untitled Page'}`);
      lines.push(`URL: ${page.url}`);
      lines.push(`Word Count: ${page.wordCount ?? 0} words | Paragraphs: ${page.paragraphCount ?? 0}`);
      lines.push(divider);
      lines.push('');

      const sections = page.content?.headingSections || [];

      if (sections.length > 0) {
        sections.forEach(sec => {
          const levelTag = sec.level ? `[${sec.level.toUpperCase()}]` : '[HEADING]';
          lines.push(`${levelTag} ${sec.heading}`);
          lines.push(subDivider);
          
          if (sec.paragraphs && sec.paragraphs.length > 0) {
            sec.paragraphs.forEach(p => {
              lines.push(p);
              lines.push('');
            });
          } else {
            lines.push('(No text content under this heading)');
            lines.push('');
          }
        });
      } else if (page.content?.cleanText) {
        // Fallback if no specific headings detected
        lines.push('[CONTENT]');
        lines.push(subDivider);
        lines.push(page.content.cleanText);
        lines.push('');
      } else {
        lines.push('(No readable text content extracted from this page)');
        lines.push('');
      }

      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * Generates a Markdown document (.md) organized by heading levels (#, ##, ###).
   * 
   * @param {Object} crawlData 
   * @returns {string} Markdown string
   */
  static generateHeadingContentMarkdownReport(crawlData) {
    const { siteUrl, pages = [], timestamp = new Date().toISOString() } = crawlData;
    const validPages = pages.filter(p => p.status === 'success' || p.httpStatus === 200 || p.content?.cleanText);

    const lines = [
      `# Site Content Export: ${siteUrl || 'Website'}`,
      '',
      `> **Crawled Date:** ${timestamp.replace('T', ' ').slice(0, 19)}  `,
      `> **Total Pages:** ${validPages.length}  `,
      `> **Extraction:** Pure text content organized by heading hierarchy (No images)`,
      '',
      '---',
      ''
    ];

    validPages.forEach((page, index) => {
      lines.push(`## Page ${index + 1}: ${page.title || page.url}`);
      lines.push(`**URL:** [${page.url}](${page.url}) | **Word Count:** ${page.wordCount ?? 0}`);
      lines.push('');

      const sections = page.content?.headingSections || [];

      if (sections.length > 0) {
        sections.forEach(sec => {
          const levelNum = sec.level?.startsWith('h') ? Math.min(parseInt(sec.level.slice(1), 10) + 2, 6) : 3;
          const prefix = '#'.repeat(levelNum);
          lines.push(`${prefix} ${sec.heading}`);
          lines.push('');

          if (sec.paragraphs && sec.paragraphs.length > 0) {
            sec.paragraphs.forEach(p => {
              lines.push(`${p}\n`);
            });
          }
        });
      } else if (page.content?.cleanText) {
        lines.push(page.content.cleanText);
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * Generates a clean, human-readable TXT audit report.
   * 
   * @param {Object} crawlData 
   * @returns {string} Plain text report
   */
  static generateTxtReport(crawlData) {
    const { siteUrl, stats = {}, pages = [], duration = '00:00:00', timestamp = new Date().toISOString() } = crawlData;

    const divider = '='.repeat(60);
    const subDivider = '-'.repeat(40);

    const lines = [
      divider,
      'SITE DATA CRAWLER REPORT',
      `Website:          ${siteUrl || 'N/A'}`,
      `Crawled Date:     ${timestamp.replace('T', ' ').slice(0, 19)}`,
      `Duration:         ${duration}`,
      `Total URLs:       ${stats.totalDiscovered || pages.length}`,
      `Successful Pages: ${stats.successful || pages.filter(p => p.status === 'success' || p.httpStatus === 200).length}`,
      `Failed Pages:     ${stats.failed || pages.filter(p => p.status === 'failed').length}`,
      `Skipped Pages:    ${stats.skipped || pages.filter(p => p.status === 'skipped').length}`,
      `Avg Word Count:   ${stats.avgWordCount || 0}`,
      divider,
      ''
    ];

    pages.forEach((page, index) => {
      lines.push(`PAGE ${index + 1}`);
      lines.push(`URL:             ${page.url}`);
      lines.push(`Status:          ${page.httpStatus ? `${page.httpStatus} ${page.httpStatusText || ''}` : (page.status || 'Unknown')}`);
      if (page.error) {
        lines.push(`Error:           ${page.error}`);
      }
      lines.push(`Title:           ${page.title || '(None)'}`);
      lines.push(`Page Type:       ${page.pageTypeLabel || 'Standard Page'}`);
      lines.push(`Meta Description:${page.metadata?.description || '(None)'}`);
      lines.push(`Canonical:       ${page.metadata?.canonical || '(None)'}`);
      lines.push(`Robots Meta:     ${page.metadata?.robots || '(None)'}`);
      lines.push(`Language:        ${page.language || '(None)'}`);
      lines.push(`Word Count:      ${page.wordCount ?? 0} (Characters: ${page.characterCount ?? 0}, Paragraphs: ${page.paragraphCount ?? 0})`);
      lines.push(`Response Time:   ${page.responseTimeMs ? `${page.responseTimeMs} ms` : 'N/A'}`);

      // Contact & Legal Info
      const emails = page.contactInfo?.emails || [];
      const phones = page.contactInfo?.phones || [];
      const socials = (page.contactInfo?.socials || []).map(s => `${s.platform}: ${s.url}`);
      const legal = page.legalInfo || {};

      if (emails.length > 0 || phones.length > 0 || socials.length > 0 || legal.hasLegalInfo) {
        lines.push('Contact & Legal Data:');
        if (emails.length > 0) lines.push(`  - Emails:      ${emails.join(', ')}`);
        if (phones.length > 0) lines.push(`  - Phones:      ${phones.join(', ')}`);
        if (socials.length > 0) lines.push(`  - Socials:     ${socials.join(' | ')}`);
        if (legal.termsUrl) lines.push(`  - Terms URL:   ${legal.termsUrl}`);
        if (legal.privacyUrl) lines.push(`  - Privacy URL: ${legal.privacyUrl}`);
        if (legal.copyright) lines.push(`  - Copyright:   ${legal.copyright}`);
      }

      // Headings
      const h1s = page.headings?.byLevel?.h1 || [];
      const h2s = page.headings?.byLevel?.h2 || [];
      lines.push(`H1 (${h1s.length}):`);
      if (h1s.length > 0) {
        h1s.forEach(h => lines.push(`  - ${h}`));
      } else {
        lines.push('  (None)');
      }

      // Headings
      const h1List = page.headings?.byLevel?.h1 || [];
      const h2List = page.headings?.byLevel?.h2 || [];
      lines.push(`H2 (${h2s.length}):`);
      if (h2s.length > 0) {
        h2s.forEach(h => lines.push(`  - ${h}`));
      } else {
        lines.push('  (None)');
      }

      // Internal Links
      const internalLinks = page.links?.internal || [];
      lines.push(`Internal Links (${internalLinks.length}):`);
      internalLinks.slice(0, 15).forEach(l => {
        lines.push(`  - ${l.url} ${l.anchorText ? `[Text: "${l.anchorText}"]` : ''}`);
      });
      if (internalLinks.length > 15) {
        lines.push(`  ... and ${internalLinks.length - 15} more internal links`);
      }

      // External Links
      const externalLinks = page.links?.external || [];
      lines.push(`External Links (${externalLinks.length}):`);
      externalLinks.slice(0, 10).forEach(l => {
        lines.push(`  - ${l.url} ${l.anchorText ? `[Text: "${l.anchorText}"]` : ''}`);
      });
      if (externalLinks.length > 10) {
        lines.push(`  ... and ${externalLinks.length - 10} more external links`);
      }

      // Images
      const images = page.images || [];
      const missingAlt = images.filter(img => !img.hasAlt).length;
      lines.push(`Images (${images.length}, Missing Alt: ${missingAlt}):`);
      images.slice(0, 10).forEach(img => {
        lines.push(`  - ${img.url} [Alt: "${img.alt || 'MISSING'}"${img.width ? `, ${img.width}x${img.height}` : ''}]`);
      });
      if (images.length > 10) {
        lines.push(`  ... and ${images.length - 10} more images`);
      }

      // Structured Data
      const schemaTypes = page.structuredData?.schemaTypes || [];
      lines.push(`Structured Data Schema Types (${schemaTypes.length}):`);
      if (schemaTypes.length > 0) {
        lines.push(`  - Types: ${schemaTypes.join(', ')}`);
      } else {
        lines.push('  (None)');
      }

      // Content Preview
      if (page.content?.preview) {
        lines.push('Content Preview:');
        lines.push(`  ${page.content.preview.slice(0, 250)}...`);
      }

      lines.push(divider);
      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * Generates a standard CSV report.
   * 
   * @param {Array<Object>} pages 
   * @returns {string} CSV format
   */
  static generateCsvReport(pages = []) {
    const headers = [
      'URL',
      'HTTP Status',
      'Status Label',
      'Page Type',
      'Title',
      'Meta Description',
      'Meta Keywords',
      'Canonical URL',
      'Robots Meta',
      'Language',
      'Contact Emails',
      'Contact Phones',
      'Social Media Profiles',
      'Terms URL',
      'Privacy Policy URL',
      'Copyright Statement',
      'Word Count',
      'Character Count',
      'Paragraph Count',
      'H1 Count',
      'H1 Text',
      'H2 Text',
      'Internal Links Count',
      'External Links Count',
      'Images Count',
      'Images Missing Alt Count',
      'Structured Data Types',
      'Response Time (ms)',
      'Error Message'
    ];

    const escapeCsv = (value) => {
      if (value === null || value === undefined) return '""';
      const str = String(value).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = [headers.map(escapeCsv).join(',')];

    for (const page of pages) {
      const h1List = page.headings?.byLevel?.h1 || [];
      const h2List = page.headings?.byLevel?.h2 || [];
      const images = page.images || [];
      const missingAltCount = images.filter(img => !img.hasAlt).length;
      const schemaTypes = page.structuredData?.schemaTypes || [];
      const emails = (page.contactInfo?.emails || []).join('; ');
      const phones = (page.contactInfo?.phones || []).join('; ');
      const socials = (page.contactInfo?.socials || []).map(s => `${s.platform}: ${s.url}`).join('; ');
      const legal = page.legalInfo || {};

      const row = [
        escapeCsv(page.url),
        escapeCsv(page.httpStatus || ''),
        escapeCsv(page.status || ''),
        escapeCsv(page.pageTypeLabel || 'Standard Page'),
        escapeCsv(page.title || ''),
        escapeCsv(page.metadata?.description || ''),
        escapeCsv(page.metadata?.keywords || ''),
        escapeCsv(page.metadata?.canonical || ''),
        escapeCsv(page.metadata?.robots || ''),
        escapeCsv(page.language || ''),
        escapeCsv(emails),
        escapeCsv(phones),
        escapeCsv(socials),
        escapeCsv(legal.termsUrl || ''),
        escapeCsv(legal.privacyUrl || ''),
        escapeCsv(legal.copyright || ''),
        escapeCsv(page.wordCount ?? 0),
        escapeCsv(page.characterCount ?? 0),
        escapeCsv(page.paragraphCount ?? 0),
        escapeCsv(h1List.length),
        escapeCsv(h1List.join(' | ')),
        escapeCsv(h2List.join(' | ')),
        escapeCsv(page.links?.internal?.length ?? 0),
        escapeCsv(page.links?.external?.length ?? 0),
        escapeCsv(images.length),
        escapeCsv(missingAltCount),
        escapeCsv(schemaTypes.join(', ')),
        escapeCsv(page.responseTimeMs ?? ''),
        escapeCsv(page.error || '')
      ];

      rows.push(row.join(','));
    }

    return rows.join('\r\n');
  }

  /**
   * Generates a complete JSON dump.
   * 
   * @param {Object} crawlData 
   * @returns {string} JSON formatted string
   */
  static generateJsonReport(crawlData) {
    return JSON.stringify(crawlData, null, 2);
  }

  /**
   * Generates an XML sitemap of all successful URLs.
   * 
   * @param {Array<Object>} pages 
   * @returns {string} XML Sitemap string
   */
  static generateSitemapXml(pages = []) {
    const validPages = pages.filter(p => p.httpStatus === 200 || p.status === 'success');
    const now = new Date().toISOString().slice(0, 10);

    const xmlLines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    ];

    for (const page of validPages) {
      xmlLines.push('  <url>');
      xmlLines.push(`    <loc>${this._escapeXml(page.url)}</loc>`);
      xmlLines.push(`    <lastmod>${now}</lastmod>`);
      xmlLines.push('    <changefreq>weekly</changefreq>');
      xmlLines.push('    <priority>0.8</priority>');
      xmlLines.push('  </url>');
    }

    xmlLines.push('</urlset>');
    return xmlLines.join('\n');
  }

  /**
   * Helper to escape XML special chars.
   */
  static _escapeXml(unsafe) {
    return String(unsafe).replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  }

  /**
   * Generates a clean standalone HTML document from extracted single page content.
   * 
   * @param {Object} page 
   * @returns {string} HTML string
   */
  static generateSinglePageHtml(page) {
    const title = page.title || page.url || 'Extracted Page Content';
    const sections = page.content?.headingSections || [];
    const dateStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const formatContent = (text) => {
      if (!text) return '';
      const escaped = Exporter._escapeXml(text);
      return escaped.replace(/~~([^~]+)~~/g, '<del class="cut-price">$1</del>');
    };

    let sectionsHtml = '';
    if (sections.length > 0) {
      sectionsHtml = sections.map(sec => {
        const tag = /^h[1-6]$/i.test(sec.level) ? sec.level.toLowerCase() : 'h2';
        const headingFormatted = formatContent(sec.heading);
        const paras = (sec.paragraphs || []).map(p => `<p>${formatContent(p)}</p>`).join('\n      ');
        return `    <section class="content-section">
      <${tag}>${headingFormatted}</${tag}>
      ${paras || '<p class="empty">(No paragraph text)</p>'}
    </section>`;
      }).join('\n\n');
    } else if (page.content?.cleanText) {
      sectionsHtml = `    <section class="content-section">
      <h2>Content</h2>
      <p>${formatContent(page.content.cleanText)}</p>
    </section>`;
    } else {
      sectionsHtml = `    <p class="empty">No content extracted.</p>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${Exporter._escapeXml(title)}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --border: #334155;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      background: var(--bg);
      color: var(--text);
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 20px;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
      margin-bottom: 28px;
    }
    h1 { color: var(--accent); font-size: 28px; margin-bottom: 8px; }
    .meta-bar { font-size: 13px; color: var(--text-muted); display: flex; flex-wrap: wrap; gap: 16px; margin-top: 8px; }
    .meta-bar span strong { color: var(--text); }
    .content-section { margin-bottom: 24px; background: var(--card-bg); padding: 18px 22px; border-radius: 8px; border: 1px solid var(--border); }
    .content-section h1, .content-section h2, .content-section h3 { margin-top: 0; color: #e2e8f0; }
    p { margin: 10px 0; color: #cbd5e1; font-size: 15px; }
    .empty { color: var(--text-muted); font-style: italic; }
    del, s, strike, .cut-price {
      text-decoration: line-through;
      color: #94a3b8;
      opacity: 0.8;
      background: rgba(244, 63, 94, 0.12);
      padding: 1px 5px;
      border-radius: 3px;
      font-weight: 500;
    }
    footer { margin-top: 40px; font-size: 12px; color: var(--text-muted); text-align: center; border-top: 1px solid var(--border); padding-top: 16px; }
  </style>
</head>
<body>
  <header>
    <h1>${formatContent(title)}</h1>
    <div class="meta-bar">
      <span>URL: <a href="${Exporter._escapeXml(page.url)}" target="_blank" style="color: var(--accent);">${Exporter._escapeXml(page.url)}</a></span>
      <span>Words: <strong>${page.wordCount ?? 0}</strong></span>
      <span>Extracted: <strong>${dateStr}</strong></span>
    </div>
  </header>
  <main>
${sectionsHtml}
  </main>
  <footer>
    Extracted with Site Data Crawler • 100% Client-Side Privacy
  </footer>
</body>
</html>`;
  }

  /**
   * Triggers download of text content to the user's browser.
   * 
   * @param {string} filename 
   * @param {string} content 
   * @param {string} mimeType 
   */
  static download(filename, content, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);

    if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      }, () => {
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      });
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 5000);
    }
  }
}
