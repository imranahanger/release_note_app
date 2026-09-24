const T = window.ReleaseTemplate;
const DRAFT_KEY = 'release-notes-draft';
const PAGE_WIDTH = 794; // A4 width in CSS pixels, matching the PDF

let release = T.emptyRelease();
const collapsed = new Set();

const $ = (selector) => document.querySelector(selector);

document.body.classList.add(`platform-${window.api.platform}`);

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'value' || key === 'textContent' || typeof value === 'boolean') el[key] = value;
    else el.setAttribute(key, value);
  }
  el.append(...children.flat().filter((child) => child != null));
  return el;
}

// ---- Preview -------------------------------------------------------------

const previewHost = $('#preview-host');
const shadow = previewHost.attachShadow({ mode: 'open' });
shadow.innerHTML = '<link rel="stylesheet" href="report.css"><div id="doc"></div>';

function renderPreview() {
  // Theme is applied through CSSOM so the page's CSP can keep blocking inline styles
  for (const [name, value] of Object.entries(T.themeVars(release))) previewHost.style.setProperty(name, value);
  shadow.getElementById('doc').innerHTML = T.renderReport(release);
}

function fitPreview() {
  const available = $('.preview').clientWidth - 64;
  previewHost.style.zoom = Math.min(1, available / PAGE_WIDTH);
}
new ResizeObserver(fitPreview).observe($('.preview'));

let updateTimer;
function update() {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => {
    renderPreview();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(release));
  }, 120);
}

// ---- Editor --------------------------------------------------------------

const fieldInputs = document.querySelectorAll('[data-field]');
for (const input of fieldInputs) {
  input.addEventListener('input', () => {
    release[input.dataset.field] = input.value;
    if (input.dataset.field === 'themeColor') markSwatch();
    update();
  });
}

const logoTile = $('#logo-tile');
logoTile.addEventListener('change', () => {
  release.logoTile = logoTile.checked;
  update();
});
$('#logo-choose').addEventListener('click', () => run('chooseLogo'));
$('#logo-remove').addEventListener('click', () => {
  release.logo = '';
  renderLogoControls();
  update();
});

function renderLogoControls() {
  const thumb = $('#logo-thumb');
  thumb.replaceChildren(release.logo ? h('img', { src: release.logo, alt: 'Logo' }) : 'None');
  $('#logo-remove').disabled = !release.logo;
  logoTile.checked = release.logoTile;
}

const themeInput = $('#theme-color');
$('#swatches').replaceChildren(...T.THEME_PRESETS.map(({ name, color }) => {
  const swatch = h('button', {
    class: 'swatch',
    title: name,
    'data-color': color,
    onclick: () => {
      release.themeColor = themeInput.value = color;
      markSwatch();
      update();
    },
  });
  swatch.style.background = color;
  return swatch;
}));

function markSwatch() {
  for (const swatch of document.querySelectorAll('.swatch')) {
    swatch.classList.toggle('selected', swatch.dataset.color === release.themeColor.toLowerCase());
  }
}

function renderItemEditor(key, item, index) {
  const items = release.sections[key];
  const bind = (field) => (event) => {
    item[field] = event.target.value;
    update();
  };
  const move = (delta) => () => {
    items.splice(index + delta, 0, ...items.splice(index, 1));
    renderSections();
    update();
  };
  const remove = () => {
    items.splice(index, 1);
    renderSections();
    update();
  };

  return h('div', { class: 'item-editor' },
    h('div', { class: 'item-row' },
      h('input', { class: 'item-title', placeholder: 'Title', value: item.title, oninput: bind('title') }),
      h('button', { class: 'icon-btn', title: 'Move up', textContent: '↑', disabled: index === 0, onclick: move(-1) }),
      h('button', { class: 'icon-btn', title: 'Move down', textContent: '↓', disabled: index === items.length - 1, onclick: move(1) }),
      h('button', { class: 'icon-btn danger', title: 'Remove', textContent: '✕', onclick: remove }),
    ),
    h('input', { placeholder: 'Tickets, e.g. TIM-1070, TIM-1072', value: item.tickets, oninput: bind('tickets') }),
    h('textarea', {
      rows: '4',
      placeholder: 'Description. Blank line starts a new paragraph; **bold** and `code` supported.',
      value: item.description,
      oninput: bind('description'),
    }),
  );
}

function renderSections() {
  const panels = T.SECTIONS.map((section) => {
    const items = release.sections[section.key];
    const add = () => {
      items.push({ title: '', tickets: '', description: '' });
      collapsed.delete(section.key);
      renderSections();
      update();
      $(`.section-${section.key} .item-editor:last-of-type .item-title`)?.focus();
    };

    return h('details', {
        class: `panel section-panel section-${section.key}`,
        open: !collapsed.has(section.key),
        ontoggle: (event) => (event.target.open ? collapsed.delete(section.key) : collapsed.add(section.key)),
      },
      h('summary', {},
        h('span', { class: 'panel-icon', textContent: section.icon }),
        h('span', { textContent: section.title }),
        h('span', { class: 'badge', textContent: String(items.length) }),
      ),
      items.map((item, index) => renderItemEditor(section.key, item, index)),
      h('button', { class: 'add', textContent: '+ Add item', onclick: add }),
    );
  });
  $('#sections').replaceChildren(...panels);
}

function setRelease(data) {
  release = T.normalize(data);
  for (const input of fieldInputs) input.value = release[input.dataset.field];
  markSwatch();
  renderLogoControls();
  renderSections();
  renderPreview();
  localStorage.setItem(DRAFT_KEY, JSON.stringify(release));
}

// ---- Actions -------------------------------------------------------------

let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 4000);
}

const cleanError = (err) => err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

const actions = {
  new() {
    if (confirm('Start a new release? Unsaved changes to the current one will be lost.')) setRelease(T.emptyRelease());
  },
  async open() {
    const data = await window.api.openJson();
    if (data) {
      setRelease(data);
      toast('Release opened');
    }
  },
  async save() {
    const filePath = await window.api.saveJson(release);
    if (filePath) toast(`Saved to ${filePath}`);
  },
  async export() {
    toast('Generating PDF…');
    const filePath = await window.api.exportPdf(release);
    toast(filePath ? `PDF saved to ${filePath}` : 'Export cancelled');
  },
  async chooseLogo() {
    const logo = await window.api.chooseLogo();
    if (logo) {
      release.logo = logo;
      renderLogoControls();
      update();
    }
  },
  async sample() {
    setRelease(await window.api.loadSample());
  },
};

async function run(action) {
  try {
    await actions[action]?.();
  } catch (err) {
    toast(cleanError(err), true);
  }
}

for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', () => run(button.dataset.action));
}
window.api.onMenu(run);

// ---- Startup -------------------------------------------------------------

(async () => {
  let draft = null;
  try {
    draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
  } catch {
    // ignore a corrupt draft and fall back to the sample
  }
  setRelease(draft ?? (await window.api.loadSample()));
})();
