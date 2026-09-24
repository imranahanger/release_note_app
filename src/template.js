// Release notes template, shared by the renderer (live preview) and main process (PDF export)
// so the preview and the exported PDF are always rendered from the same markup.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReleaseTemplate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SECTIONS = [
    { key: 'features', title: 'New Features', stat: 'New Features', icon: '✨' },
    { key: 'improvements', title: 'Improvements', stat: 'Improvements', icon: '🚀' },
    { key: 'security', title: 'Security & Hardening', stat: 'Security Updates', icon: '🔒' },
    { key: 'fixes', title: 'Bug Fixes', stat: 'Bug Fixes', icon: '🔧' },
  ];

  const FIELDS = ['product', 'title', 'version', 'date', 'releaseType', 'environment', 'footerNote', 'themeColor'];

  const DEFAULT_THEME = '#1e2a4a';
  const THEME_PRESETS = [
    { name: 'Navy', color: '#1e2a4a' },
    { name: 'Indigo', color: '#3730a3' },
    { name: 'Teal', color: '#0f766e' },
    { name: 'Forest', color: '#166534' },
    { name: 'Crimson', color: '#9f1239' },
    { name: 'Plum', color: '#6b21a8' },
    { name: 'Amber', color: '#f5b841' },
    { name: 'Charcoal', color: '#111827' },
  ];

  const LOGO_PATTERN = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;

  function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function emptyRelease() {
    return {
      product: '',
      title: 'Release Notes',
      version: '',
      date: today(),
      releaseType: 'Maintenance Release',
      environment: 'Production',
      footerNote: 'Internal Release Document',
      themeColor: DEFAULT_THEME,
      logo: '',
      logoTile: true,
      sections: Object.fromEntries(SECTIONS.map((s) => [s.key, []])),
    };
  }

  const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

  // Coerces untrusted input (opened files, IPC payloads) into a well-formed release object
  function normalize(input) {
    const release = emptyRelease();
    const src = input && typeof input === 'object' ? input : {};
    for (const field of FIELDS) {
      if (typeof src[field] === 'string') release[field] = src[field];
    }
    // Only a plain hex color is accepted, since it is written into the PDF's stylesheet
    if (!/^#[0-9a-f]{6}$/i.test(release.themeColor)) release.themeColor = DEFAULT_THEME;
    release.themeColor = release.themeColor.toLowerCase();
    // Logos are embedded as base64 image data URLs so release files stay self-contained
    if (typeof src.logo === 'string' && LOGO_PATTERN.test(src.logo)) release.logo = src.logo;
    if (typeof src.logoTile === 'boolean') release.logoTile = src.logoTile;
    const sections = src.sections && typeof src.sections === 'object' ? src.sections : {};
    for (const { key } of SECTIONS) {
      const items = Array.isArray(sections[key]) ? sections[key] : [];
      release.sections[key] = items
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          title: str(item.title),
          tickets: Array.isArray(item.tickets) ? item.tickets.map(str).join(', ') : str(item.tickets),
          description: str(item.description),
        }));
    }
    return release;
  }

  // CSS custom properties for the theme; text flips to dark on light theme colors
  function themeVars(input) {
    const { themeColor } = normalize(input);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(themeColor.slice(i, i + 2), 16) / 255);
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return { '--brand': themeColor, '--on-brand': luminance > 0.4 ? '#1e293b' : '#ffffff' };
  }

  function esc(value) {
    return str(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function parseTickets(value) {
    return str(value).split(/[\s,]+/).filter(Boolean);
  }

  function uniqueSorted(values) {
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return str(value);
    return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  const versionLabel = (version) => (version ? `v${str(version).replace(/^v/i, '')}` : '');

  function footerText(release) {
    return [release.product, release.footerNote, versionLabel(release.version)].filter(Boolean).join(' — ');
  }

  // Blank lines separate paragraphs; supports **bold** and `code`
  function formatText(text) {
    return str(text)
      .trim()
      .split(/\n\s*\n/)
      .filter(Boolean)
      .map((p) => {
        const html = esc(p)
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\n/g, '<br>');
        return `<p>${html}</p>`;
      })
      .join('');
  }

  function renderItem(item) {
    const tickets = parseTickets(item.tickets).map((t) => `<span class="ticket">${esc(t)}</span>`).join('');
    return `<article class="item">
      <div class="item-head"><span class="dot"></span><h3>${esc(item.title || 'Untitled')}</h3>${tickets}</div>
      <div class="item-body">${formatText(item.description)}</div>
    </article>`;
  }

  function renderSection(section, items) {
    const tickets = uniqueSorted(items.flatMap((item) => parseTickets(item.tickets)));
    const [first, ...rest] = items.map(renderItem);
    // Heading and first item are grouped so a page break never strands the heading on its own
    return `<section class="section section-${section.key}">
      <div class="keep">
        <div class="section-head">
          <span class="section-icon">${section.icon}</span>
          <h2>${esc(section.title)}</h2>
          <span class="section-tickets">${esc(tickets.join(', '))}</span>
        </div>
        ${first}
      </div>
      ${rest.join('')}
    </section>`;
  }

  function renderReport(input) {
    const release = normalize(input);
    const date = formatDate(release.date);
    const allTickets = uniqueSorted(
      SECTIONS.flatMap((s) => release.sections[s.key].flatMap((item) => parseTickets(item.tickets))),
    );

    const stat = (count, label) =>
      `<div class="stat"><div class="stat-num">${count}</div><div class="stat-label">${esc(label)}</div></div>`;
    const stats =
      SECTIONS.map((s) => stat(release.sections[s.key].length, s.stat)).join('') +
      stat(allTickets.length, 'Tickets Resolved');

    const meta = (label, value) => (value ? `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>` : '');

    const sections = SECTIONS.filter((s) => release.sections[s.key].length)
      .map((s) => renderSection(s, release.sections[s.key]))
      .join('');

    const version = versionLabel(release.version);

    return `<div class="report">
      <header class="banner">
        <div class="banner-top">
          <div class="brand">
            ${release.logo ? `<span class="logo${release.logoTile ? ' tiled' : ''}"><img src="${release.logo}" alt=""></span>` : ''}
            <div>
              <div class="eyebrow">${esc(release.product)}</div>
              <h1>${esc(release.title)}</h1>
            </div>
          </div>
          ${version ? `<span class="version">${esc(version)}</span>` : ''}
        </div>
        <dl class="meta">
          ${meta('Release Date', date)}${meta('Release Type', release.releaseType)}${meta('Environment', release.environment)}
        </dl>
      </header>
      <div class="stats">${stats}</div>
      <div class="body">${sections || '<p class="empty">Add items in the editor to see them here.</p>'}</div>
      <footer class="report-footer">
        <span>${esc(footerText(release))}</span>
        <span>${date ? `Released ${esc(date)}` : ''}</span>
      </footer>
    </div>`;
  }

  return { SECTIONS, THEME_PRESETS, themeVars, emptyRelease, normalize, renderReport, footerText, formatDate, versionLabel, esc };
});
