const { BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const template = require('./template');

function pageFooter(release) {
  const left = template.esc(template.footerText(release));
  const date = template.formatDate(release.date);
  const right = date ? `Released ${template.esc(date)} · ` : '';
  return `<div style="width:100%; padding:0 48px; display:flex; justify-content:space-between;
      font-family:-apple-system,'Segoe UI',Helvetica,sans-serif; font-size:8px; color:#94a3b8;">
    <span>${left}</span>
    <span>${right}Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;
}

// Renders a release to PDF bytes in an offscreen window with JavaScript disabled
async function renderPdf(input) {
  const release = template.normalize(input);
  const css = await fs.readFile(path.join(__dirname, 'report.css'), 'utf8');
  const theme = Object.entries(template.themeVars(release)).map(([k, v]) => `${k}: ${v};`).join(' ');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>html, body { margin: 0; } ${css} .report { ${theme} }</style></head>
    <body>${template.renderReport(release)}</body></html>`;

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await win.webContents.printToPDF({
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: pageFooter(release),
    });
  } finally {
    win.destroy();
  }
}

module.exports = { renderPdf };
