/**
 * Exporter Utilities for Site Data Crawler
 * Generates structured TXT, CSV, JSON, and XML reports and triggers browser downloads.
 */

export class Exporter {
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
      lines.push(`Meta Description:${page.metadata?.description || '(None)'}`);
      lines.push(`Canonical:       ${page.metadata?.canonical || '(None)'}`);
      lines.push(`Robots Meta:     ${page.metadata?.robots || '(None)'}`);
      lines.push(`Language:        ${page.language || '(None)'}`);
      lines.push(`Word Count:      ${page.wordCount ?? 0} (Characters: ${page.characterCount ?? 0}, Paragraphs: ${page.paragraphCount ?? 0})`);
      lines.push(`Response Time:   ${page.responseTimeMs ? `${page.responseTimeMs} ms` : 'N/A'}`);

      // Headings
      const h1s = page.headings?.byLevel?.h1 || [];
      const h2s = page.headings?.byLevel?.h2 || [];
      lines.push(`H1 (${h1s.length}):`);
      if (h1s.length > 0) {
        h1s.forEach(h => lines.push(`  - ${h}`));
      } else {
        lines.push('  (None)');
      }

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
      'Title',
      'Meta Description',
      'Meta Keywords',
      'Canonical URL',
      'Robots Meta',
      'Language',
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

      const row = [
        escapeCsv(page.url),
        escapeCsv(page.httpStatus || ''),
        escapeCsv(page.status || ''),
        escapeCsv(page.title || ''),
        escapeCsv(page.metadata?.description || ''),
        escapeCsv(page.metadata?.keywords || ''),
        escapeCsv(page.metadata?.canonical || ''),
        escapeCsv(page.metadata?.robots || ''),
        escapeCsv(page.language || ''),
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
