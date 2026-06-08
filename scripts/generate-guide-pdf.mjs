/**
 * Generates PowerBI-Viewer-User-Guide.pdf from the HTML source.
 * Uses the puppeteer devDependency already installed in this project.
 *
 * Usage:  node scripts/generate-guide-pdf.mjs
 *
 * The script:
 *  1. Loads the HTML file directly via file:// URL (no server needed).
 *  2. Forces light theme (better contrast on paper) by removing the .dark
 *     class that the JS applies from localStorage -- the PDF print path
 *     reveals all accordions and drops the nav chrome anyway.
 *  3. Waits for fonts + images to settle, then calls page.pdf() with:
 *       - A4 format
 *       - printBackground: true  (preserves callout shading, accent colours)
 *       - @page margins from the existing CSS (@page { size: A4; margin: 14mm })
 *  4. Writes the result alongside the HTML source.
 */

import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(PROJECT_ROOT, 'docs', 'manual', 'PowerBI-Viewer-User-Guide.html');
const PDF_PATH  = path.join(PROJECT_ROOT, 'docs', 'manual', 'PowerBI-Viewer-User-Guide.pdf');

if (!existsSync(HTML_PATH)) {
  console.error(`HTML source not found: ${HTML_PATH}`);
  process.exit(1);
}

const FILE_URL = `file:///${HTML_PATH.replace(/\\/g, '/')}`;

console.log(`Source : ${HTML_PATH}`);
console.log(`Output : ${PDF_PATH}`);
console.log('Launching Chrome (headless)...');

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();

  // Override localStorage so the page starts in light mode (better for PDF).
  // The print stylesheet already handles layout; light theme gives cleaner ink.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key) => (key === 'pbiGuideTheme' ? 'light' : null),
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
      writable: false,
    });
  });

  console.log('Loading HTML...');
  await page.goto(FILE_URL, { waitUntil: 'networkidle0', timeout: 60000 });

  // Ensure the page is in light mode and all accordions are open for print.
  // The HTML's beforeprint listener already does this, but we trigger it early
  // so that puppeteer's headless print path sees the expanded content.
  await page.evaluate(() => {
    // Force light theme
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');

    // Open all <details> elements (accordions)
    document.querySelectorAll('details').forEach(d => { d.open = true; });

    // Show all sections (undo any search-hidden state)
    document.querySelectorAll('section[data-hidden]').forEach(s => {
      s.removeAttribute('data-hidden');
      s.style.display = '';
    });

    // Remove the result-count banner if present
    const banner = document.getElementById('searchBanner');
    if (banner) banner.style.display = 'none';
  });

  // Let any transitions settle
  await new Promise(r => setTimeout(r, 800));

  console.log('Printing to PDF...');
  await page.pdf({
    path: PDF_PATH,
    format: 'A4',
    printBackground: true,
    // The HTML @page rule carries margin: 14mm; puppeteer respects CSS @page,
    // but we set margin: 0 here so the CSS @page declaration fully controls it.
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    preferCSSPageSize: true,
  });

  console.log(`PDF written: ${PDF_PATH}`);
} finally {
  await browser.close();
}
