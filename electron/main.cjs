// =====================================================================
//  Flowchart Studio - processo principale Electron
//  Serve la cartella dist/ con un protocollo interno "app://":
//   - origine stabile: il salvataggio automatico (localStorage) resta
//   - nessun server locale e nessun accesso a file fuori da dist/
// =====================================================================
'use strict';
const { app, BrowserWindow, Menu, protocol, net, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const ORIGIN = `${SCHEME}://flowchart`;
const DIST = path.join(__dirname, '..', 'dist');
const ICON = path.join(__dirname, '..', 'build', 'icon.png');
const SPLASH_MIN_MS = 1200;   // durata minima della splash: evita un lampo se l'avvio è rapido

// Versione portabile: dati (salvataggio automatico, bozze) accanto all'exe,
// così seguono la chiavetta USB da un PC all'altro.
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'FlowchartStudio-dati'));
}

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

/** @type {BrowserWindow | null} */
let win = null;
/** @type {BrowserWindow | null} */
let splash = null;
let splashShownAt = 0;

/**
 * Risponde alle richieste app://flowchart/... con i file di dist/.
 * Un file mancante (es. favicon.ico chiesto in automatico da Chromium) riceve
 * una risposta 404 invece di un'eccezione: prima l'errore net::ERR_FILE_NOT_FOUND
 * finiva non gestito nella console.
 */
function serveDist() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    dialog.showErrorBox('Flowchart Studio', `Build non trovata in:\n${DIST}\n\nEsegui "npm run build" e riprova.`);
  }
  protocol.handle(SCHEME, async request => {
    let rel;
    try { rel = decodeURIComponent(new URL(request.url).pathname); }
    catch { return new Response('Richiesta non valida', { status: 400 }); }
    const file = path.normalize(path.join(DIST, rel === '/' ? 'index.html' : rel));
    if (!file.startsWith(DIST + path.sep)) return new Response('Non consentito', { status: 403 });
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (!app.isPackaged) console.warn(`[app://] file non trovato: ${rel}`);
      return new Response('Non trovato', { status: 404 });
    }
    try {
      return await net.fetch(pathToFileURL(file).toString());
    } catch (e) {
      console.error(`[app://] errore leggendo ${rel}:`, e);
      return new Response('Errore di lettura', { status: 500 });
    }
  });
}

/** Finestra di avvio: compare subito, mentre la finestra principale carica */
function createSplash() {
  splash = new BrowserWindow({
    width: 460,
    height: 300,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    show: false,
    backgroundColor: '#1f4e79',
    icon: ICON,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  splash.once('ready-to-show', () => { splash?.show(); splashShownAt = Date.now(); });
  splash.on('closed', () => { splash = null; });
  splash.loadFile(path.join(__dirname, 'splash.html'), { query: { v: app.getVersion() } })
    .catch(e => console.error('Splash non caricata:', e));
}

/** Chiude la splash e mostra l'app, rispettando la durata minima */
function showMainWindow() {
  if (!win || win.isVisible()) return;
  const wait = splash && splashShownAt ? Math.max(0, SPLASH_MIN_MS - (Date.now() - splashShownAt)) : 0;
  setTimeout(() => {
    if (!win) return;
    win.show();
    win.focus();
    if (splash && !splash.isDestroyed()) splash.destroy();
  }, wait);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'Flowchart Studio',
    icon: ICON,
    show: false,
    backgroundColor: '#f3f5f8',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });

  // Nessun menu: le scorciatoie (Ctrl+S, Ctrl+I, Ctrl+Z...) restano all'app.
  Menu.setApplicationMenu(null);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') { win.webContents.toggleDevTools(); event.preventDefault(); }
    else if (input.control && input.key.toLowerCase() === 'r') { win.webContents.reload(); event.preventDefault(); }
  });

  // I link esterni (e le email del manuale) si aprono nei programmi predefiniti, mai dentro l'app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(ORIGIN + '/')) return;
    event.preventDefault();
    if (/^mailto:/i.test(url)) shell.openExternal(url);
  });
  win.webContents.on('will-frame-navigate', event => {
    if (/^mailto:/i.test(event.url)) { event.preventDefault(); shell.openExternal(event.url); }
  });

  win.on('close', event => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Chiudi', 'Annulla'],
      defaultId: 1,
      cancelId: 1,
      title: 'Flowchart Studio',
      message: 'Chiudere Flowchart Studio?',
      detail: 'Il lavoro viene salvato automaticamente, ma ricorda di salvare il file JSON se vuoi condividerlo.'
    });
    if (choice === 1) event.preventDefault();
  });
  win.on('closed', () => { win = null; });

  win.once('ready-to-show', showMainWindow);
  // se il caricamento fallisce la splash non deve restare aperta
  win.webContents.once('did-fail-load', (_e, code, desc, url) => {
    console.error(`Caricamento non riuscito (${code} ${desc}): ${url}`);
    showMainWindow();
  });
  win.loadURL(`${ORIGIN}/index.html`).catch(e => console.error('Finestra principale non caricata:', e));
}

// Un'unica finestra: un secondo avvio riporta in primo piano quella aperta
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win || !win.isVisible()) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => { serveDist(); createSplash(); createWindow(); });
  app.on('window-all-closed', () => app.quit());
}
