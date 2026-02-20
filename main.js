const { app, BrowserWindow, WebContentsView, ipcMain, dialog, session } = require("electron"); // Adicionado session aqui
const path = require("path");
const os = require("os");
const fs = require("fs");
const { exec } = require("child_process");
const { autoUpdater } = require("electron-updater");

// Otimização de compilação de Script (V8)
process.env.V8_CACHE_OPTIONS = "code";

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let win, contentView, sistemaIniciado = false;
  let processandoTroca = false; 
  let currentSidebarWidth = 260;
  const TOPBAR_HEIGHT = 0;
  const ICON_PATH = path.join(__dirname, "icon.png");

  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.setAppUserModelId("com.consorcio.capturaunificada");

  const customDataPath = path.join(app.getPath("appData"), "captura-unificada-data");
  if (!fs.existsSync(customDataPath)) fs.mkdirSync(customDataPath, { recursive: true });
  app.setPath("userData", customDataPath);

  // --- FLAGS DE PERFORMANCE ---
  app.commandLine.appendSwitch("disable-http-cache", "false");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
  app.commandLine.appendSwitch("enable-inline-resource-suggesting");
  app.commandLine.appendSwitch("ignore-certificate-errors");
  app.commandLine.appendSwitch("disable-web-security");

  function checkUpdates() {
    if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify();
  }

  const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // --- HARDWARE ---
  async function configurarAmbienteSmart() {
    exec('sc stop "Valid-ServicoIntegracaoHardware"');
    await esperar(800);
    exec('tasklist /FI "IMAGENAME eq BCC.exe"', (err, stdout) => {
      if (!stdout.includes("BCC.exe")) exec('start "" "C:\\Griaule\\BCC\\BCC.exe"');
    });
  }

  async function configurarAmbienteCaptura() {
    exec("taskkill /F /IM BCC.exe /T");
    exec("taskkill /F /IM javaw.exe /T");
    await esperar(600);
    const cmd = `powershell -Command "Get-PnpDevice -FriendlyName '*Suprema RealScan-D*' | Disable-PnpDevice -Confirm:$false; Enable-PnpDevice -Confirm:$false"`;
    exec(cmd);
    await esperar(600);
    exec('sc start "Valid-ServicoIntegracaoHardware"');
  }

  function ajustarView() {
    if (!win || !contentView || !sistemaIniciado) return;
    const { width, height } = win.getContentBounds();
    contentView.setBounds({
      x: currentSidebarWidth, y: TOPBAR_HEIGHT,
      width: width - currentSidebarWidth, height: height - TOPBAR_HEIGHT,
    });
  }

  function criarJanela() {
    win = new BrowserWindow({
      width: 1300, height: 800, minWidth: 900, minHeight: 600,
      show: false, backgroundColor: "#0b1220", autoHideMenuBar: true, icon: ICON_PATH,
      webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true }
    });

    win.loadFile(path.join(__dirname, "ui", "index.html"));
    win.once("ready-to-show", () => { win.maximize(); win.show(); checkUpdates(); });

    contentView = new WebContentsView({
      webPreferences: { 
        backgroundThrottling: false, 
        partition: "persist:captura",
        backForwardCache: true 
      }
    });

    contentView.webContents.on("did-finish-load", () => {
      if (contentView.webContents.getURL() !== "about:blank") {
        contentView.setVisible(true); 
        processandoTroca = false;
        win.webContents.send("load-finished");
      }
    });

    win.contentView.addChildView(contentView);
    contentView.setVisible(false);
    win.on("resize", ajustarView);
  }

  app.whenReady().then(() => {
    criarJanela();
    contentView.webContents.session.preconnect({ url: "https://cnhba-prod.si.valid.com.br" });
    contentView.webContents.session.preconnect({ url: "https://nimba.dpt.ba.gov.br:8100" });
  });

  // --- IPC HANDLERS ---
  ipcMain.handle("captura", async () => {
    if (processandoTroca) return;
    processandoTroca = true;
    sistemaIniciado = true;
    contentView.setVisible(false);
    await configurarAmbienteCaptura();
    contentView.webContents.loadURL("https://cnhba-prod.si.valid.com.br/CapturaWebV2");
    ajustarView();
  });

  ipcMain.handle("smart", async () => {
    if (processandoTroca) return;
    processandoTroca = true;
    sistemaIniciado = true;
    contentView.setVisible(false);
    await configurarAmbienteSmart();
    contentView.webContents.loadURL("https://nimba.dpt.ba.gov.br:8100");
    ajustarView();
  });

  ipcMain.handle("system-info", () => ({
    hostname: os.hostname(),
    ip: Object.values(os.networkInterfaces()).flat().find((i) => i.family === "IPv4" && !i.internal)?.address || "127.0.0.1",
    anydesk: "---", 
  }));

  ipcMain.handle("reload-page", () => { contentView.webContents.reload(); });

  // --- RESTAURADO: LIMPAR CACHE ---
  ipcMain.handle("clear-cache", async () => {
    try {
      // Pega a sessão específica da nossa partição persistente
      const ses = session.fromPartition("persist:captura");
      await ses.clearStorageData(); // Limpa cookies, cache, storage, tudo.
      
      if (contentView) {
        contentView.setVisible(false);
        contentView.webContents.reload();
      }
      return true;
    } catch (e) {
      console.error("Erro ao limpar cache:", e);
      return false;
    }
  });
}