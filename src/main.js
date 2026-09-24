const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const { existsSync } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const template = require('./template');
const { renderPdf } = require('./pdf');

const SAMPLE_PATH = path.join(__dirname, 'sample-release.json');
const APP_NAME = 'Release Note Generator';
const isMac = process.platform === 'darwin';
// Packaged builds get their icon from electron-builder; in development we set the dock icon ourselves
const DEV_ICON = path.join(__dirname, '..', 'build', 'icon.png');

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    title: APP_NAME,
    // macOS gets the inset traffic lights over the toolbar; Windows/Linux keep the standard frame
    ...(isMac ? { titleBarStyle: 'hiddenInset' } : {}),
    backgroundColor: '#f5f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

function sendMenuAction(action) {
  BrowserWindow.getFocusedWindow()?.webContents.send('menu', action);
}

function buildMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Release', accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction('new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('open') },
        { label: 'Save…', accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('save') },
        { type: 'separator' },
        { label: 'Export PDF…', accelerator: 'CmdOrCtrl+E', click: () => sendMenuAction('export') },
        { label: 'Load Sample Release', click: () => sendMenuAction('sample') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function fileBase(release) {
  const name = [release.product, 'release notes', template.versionLabel(release.version)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return name || 'release-notes';
}

const windowFor = (event) => BrowserWindow.fromWebContents(event.sender);

const LOGO_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
const MAX_LOGO_BYTES = 1024 * 1024;

ipcMain.handle('choose-logo', async (event) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(windowFor(event), {
    title: 'Choose Logo',
    filters: [{ name: 'Images', extensions: Object.keys(LOGO_TYPES) }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return null;

  const file = filePaths[0];
  const mime = LOGO_TYPES[path.extname(file).slice(1).toLowerCase()];
  if (!mime) throw new Error('Choose a PNG, JPEG, SVG, WebP or GIF image');
  const data = await fs.readFile(file);
  if (data.length > MAX_LOGO_BYTES) throw new Error('Logo must be 1 MB or smaller');
  return `data:${mime};base64,${data.toString('base64')}`;
});

ipcMain.handle('load-sample', async () => template.normalize(JSON.parse(await fs.readFile(SAMPLE_PATH, 'utf8'))));

ipcMain.handle('open-json', async (event) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(windowFor(event), {
    title: 'Open Release',
    filters: [{ name: 'Release Notes', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return null;

  let data;
  try {
    data = JSON.parse(await fs.readFile(filePaths[0], 'utf8'));
  } catch {
    throw new Error(`${path.basename(filePaths[0])} is not a valid JSON file`);
  }
  return template.normalize(data);
});

ipcMain.handle('save-json', async (event, input) => {
  const release = template.normalize(input);
  const { canceled, filePath } = await dialog.showSaveDialog(windowFor(event), {
    title: 'Save Release',
    defaultPath: path.join(app.getPath('documents'), `${fileBase(release)}.json`),
    filters: [{ name: 'Release Notes', extensions: ['json'] }],
  });
  if (canceled || !filePath) return null;

  await fs.writeFile(filePath, JSON.stringify(release, null, 2));
  return filePath;
});

ipcMain.handle('export-pdf', async (event, input) => {
  const release = template.normalize(input);
  const { canceled, filePath } = await dialog.showSaveDialog(windowFor(event), {
    title: 'Export Release Notes PDF',
    defaultPath: path.join(app.getPath('documents'), `${fileBase(release)}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return null;

  await fs.writeFile(filePath, await renderPdf(release));
  shell.openPath(filePath);
  return filePath;
});

app.whenReady().then(() => {
  if (!app.isPackaged && app.dock && existsSync(DEV_ICON)) app.dock.setIcon(DEV_ICON);
  buildMenu();
  createWindow();

  // macOS: re-create a window when the dock icon is clicked and none are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// macOS convention: keep the app running until the user quits with Cmd+Q
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
