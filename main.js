const { app, BrowserWindow, WebContentsView, ipcMain, dialog } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { exec } = require("child_process");
const { autoUpdater } = require("electron-updater");

// --- LOGS DE UPDATE (Para você debugar se não notificar) ---
autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let win, contentView, sistemaIniciado = false;
  let processandoTroca = false; 
  let currentSidebarWidth = 260;
  const TOPBAR_HEIGHT = 0;
  const ICON_PATH = path.join(__dirname, "icon.png");

  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.setAppUserModelId("com.consorcio.capturaunificada");

  const customDataPath = path.join(app.getPath("appData"), "captura-unificada-data");
  if (!fs.existsSync(customDataPath)) fs.mkdirSync(customDataPath, { recursive: true });
  app.setPath("userData", customDataPath);

  app.commandLine.appendSwitch("ignore-certificate-errors");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-web-security");

  // --- LÓGICA DE UPDATE MELHORADA ---
  function checkUpdates() {
    // Só checa se estiver buildado
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify();
    }

    autoUpdater.on("update-downloaded", (info) => {
      dialog.showMessageBox({
        type: "info",
        title: "Atualização Pronta",
        message: `Uma nova versão (${info.version}) foi baixada. Deseja reiniciar agora?`,
        buttons: ["Sim", "Mais tarde"],
        defaultId: 0
      }).then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall();
      });
    });

    autoUpdater.on("error", (err) => {
      console.error("Erro no updater:", err);
    });
  }

  const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function obterAnydeskID() {
    const caminhos = [
      path.join(process.env.ProgramData, "AnyDesk", "service.conf"),
      path.join(process.env.APPDATA, "AnyDesk", "system.conf"),
    ];
    try {
      for (const p of caminhos) {
        if (fs.existsSync(p)) {
          const match = fs.readFileSync(p, "utf8").match(/(?:ad\.anydesk\.id|id)=(\d+)/);
          if (match) return match[1];
        }
      }
      return "---";
    } catch (e) { return "Erro leitura"; }
  }

  async function resetarLeitorSuprema() {
    return new Promise((resolve) => {
      const cmd = `powershell -Command "Get-PnpDevice -FriendlyName '*Suprema RealScan-D*' | Disable-PnpDevice -Confirm:$false; Start-Sleep -Seconds 2; Get-PnpDevice -FriendlyName '*Suprema RealScan-D*' | Enable-PnpDevice -Confirm:$false"`;
      exec(cmd, () => resolve());
    });
  }

  async function configurarAmbienteSmart() {
    exec('sc stop "Valid-ServicoIntegracaoHardware"');
    await esperar(1500);
    exec('tasklist /FI "IMAGENAME eq BCC.exe"', (err, stdout) => {
      if (!stdout.includes("BCC.exe")) exec('start "" "C:\\Griaule\\BCC\\BCC.exe"');
    });
  }

  async function configurarAmbienteCaptura() {
    exec("taskkill /F /IM BCC.exe /T");
    exec("taskkill /F /IM javaw.exe /T");
    await esperar(1000);
    await resetarLeitorSuprema();
    await esperar(1000);
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
    
    win.once("ready-to-show", () => { 
      win.maximize(); 
      win.show();
      checkUpdates(); 
    });

    contentView = new WebContentsView({
      webPreferences: { 
        backgroundThrottling: false, 
        spellcheck: false, 
        webSecurity: false,
        partition: "persist:captura" 
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
    
    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: app.getPath("exe")
      });
    }
  });

  // --- IPC HANDLERS ---
  ipcMain.on("resize-sidebar", (e, width) => {
    currentSidebarWidth = width;
    ajustarView();
  });

  ipcMain.handle("captura", async () => {
    if (processandoTroca) return;
    processandoTroca = true;
    sistemaIniciado = true;
    contentView.setVisible(false); 
    contentView.webContents.loadURL("about:blank");
    await configurarAmbienteCaptura();
    contentView.webContents.loadURL("https://cnhba-prod.si.valid.com.br/CapturaWebV2");
    ajustarView();
  });

  ipcMain.handle("smart", async () => {
    if (processandoTroca) return;
    processandoTroca = true;
    sistemaIniciado = true;
    contentView.setVisible(false); 
    contentView.webContents.loadURL("about:blank");
    await configurarAmbienteSmart();
    await esperar(2000);
    contentView.webContents.loadURL("https://nimba.dpt.ba.gov.br:8100");
    ajustarView();
  });

  ipcMain.handle("system-info", () => ({
    hostname: os.hostname(),
    ip: Object.values(os.networkInterfaces()).flat().find((i) => i.family === "IPv4" && !i.internal)?.address || "127.0.0.1",
    anydesk: obterAnydeskID(),
  }));

  ipcMain.handle("reload-page", () => {
    contentView.webContents.reload();
  });

  ipcMain.handle("clear-cache", async () => {
    if (!contentView) return false;
    await contentView.webContents.session.clearStorageData();
    contentView.setVisible(false);
    contentView.webContents.reload();
    return true;
  });
}