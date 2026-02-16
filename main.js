const { app, BrowserWindow, WebContentsView, ipcMain, Tray, Menu } = require("electron");
const path = require("path");
const os = require("os");

const ICON_PATH = path.join(__dirname, "icon.png");
const customDataPath = path.join(app.getPath('appData'), 'captura-unificada-data');
app.setPath('userData', customDataPath);

app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch("disable-renderer-backgrounding");

let win;
let contentView;
let sistemaIniciado = false;
const SIDEBAR_WIDTH = 260;
const TOPBAR_HEIGHT = 70;

function ajustarView() {
  if (!win || !contentView || !sistemaIniciado) return;
  const b = win.getContentBounds();
  contentView.setBounds({
    x: SIDEBAR_WIDTH,
    y: TOPBAR_HEIGHT,
    width: b.width - SIDEBAR_WIDTH,
    height: b.height - TOPBAR_HEIGHT
  });
}

function criarJanela() {
  win = new BrowserWindow({
    width: 1300, height: 800,
    minWidth: 900, minHeight: 600,
    autoHideMenuBar: true,
    icon: ICON_PATH,
    webPreferences: { preload: path.join(__dirname, "preload.js") }
  });

  win.loadFile(path.join(__dirname, "ui", "index.html"));
  win.maximize();

  contentView = new WebContentsView({
    webPreferences: { backgroundThrottling: false, spellcheck: false }
  });

  win.contentView.addChildView(contentView);
  contentView.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  contentView.webContents.on('did-finish-load', () => {
    win.webContents.send("load-finished");
  });

  win.on("resize", ajustarView);
}

app.whenReady().then(criarJanela);

ipcMain.handle("captura", () => {
  sistemaIniciado = true;
  ajustarView();
  contentView.webContents.loadURL("https://cnhba-prod.si.valid.com.br/CapturaWebV2");
});

ipcMain.handle("smart", () => {
  sistemaIniciado = true;
  ajustarView();
  contentView.webContents.loadURL("https://google.com");
});

ipcMain.handle("reload-page", () => contentView?.webContents.reload());
ipcMain.handle("clear-cache", async () => {
  await contentView.webContents.session.clearCache();
  contentView.webContents.reload();
});

ipcMain.handle("system-info", () => ({ hostname: os.hostname(), ip: "192.168.56.1" }));