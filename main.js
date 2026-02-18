const { app, BrowserWindow, WebContentsView, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { exec } = require("child_process");

// --- TRAVA DE INSTÂNCIA ÚNICA ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    // Identidade do App (Notificações e Inicialização)
    app.setAppUserModelId("com.consorcio.capturaunificada"); 

    let win, contentView, sistemaIniciado = false;
    let currentSidebarWidth = 260; 
    const TOPBAR_HEIGHT = 0;
    const ICON_PATH = path.join(__dirname, "icon.png");

    // Configuração de Pastas
    const customDataPath = path.join(app.getPath('appData'), 'captura-unificada-data');
    if (!fs.existsSync(customDataPath)) fs.mkdirSync(customDataPath, { recursive: true });
    app.setPath('userData', customDataPath);

    // Switches de Performance
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache'); 
    app.commandLine.appendSwitch('ignore-certificate-errors');
    app.commandLine.appendSwitch("disable-renderer-backgrounding");
    app.commandLine.appendSwitch('max-http-header-size', '65536');

    app.on('second-instance', () => {
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });

    const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // --- GESTÃO DE HARDWARE ---
    async function resetarLeitorSuprema() {
        return new Promise((resolve) => {
            console.log("Reiniciando hardware Suprema...");
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
        exec('taskkill /F /IM BCC.exe');
        await esperar(1000);
        await resetarLeitorSuprema();
        await esperar(1000);
        exec('sc start "Valid-ServicoIntegracaoHardware"');
    }

    // --- INTERFACE E EVENTOS ---
    function ajustarView() {
        if (!win || !contentView || !sistemaIniciado) return;
        const { width, height } = win.getContentBounds();
        contentView.setBounds({
            x: currentSidebarWidth, y: TOPBAR_HEIGHT, 
            width: width - currentSidebarWidth, height: height - TOPBAR_HEIGHT
        });
    }

    function criarJanela() {
        win = new BrowserWindow({
            width: 1300, height: 800, minWidth: 900, minHeight: 600,
            show: false, backgroundColor: '#0b1220', autoHideMenuBar: true, icon: ICON_PATH,
            webPreferences: { 
                preload: path.join(__dirname, "preload.js"),
                contextIsolation: true, nodeIntegration: false
            }
        });

        win.loadFile(path.join(__dirname, "ui", "index.html"));
        win.once('ready-to-show', () => {
            win.maximize();
            win.show();
        });

        contentView = new WebContentsView({
            webPreferences: { backgroundThrottling: false, spellcheck: false }
        });

        win.contentView.addChildView(contentView);

        // LÓGICA DO F5 (Recarrega apenas o site aberto)
        const dispararReload = (event, input) => {
            if (input.type === 'keyDown' && input.key === 'F5') {
                if (contentView && sistemaIniciado) {
                    contentView.webContents.reload();
                    event.preventDefault();
                }
            }
        };

        // Escuta o F5 na barra lateral e na área do site
        win.webContents.on('before-input-event', dispararReload);
        contentView.webContents.on('before-input-event', dispararReload);

        win.on("resize", ajustarView);
    }

    // --- INICIALIZAÇÃO ---
    app.whenReady().then(() => {
        criarJanela();

        // Registrar para iniciar com o Windows
        app.setLoginItemSettings({
            openAtLogin: true,
            path: app.getPath('exe')
        });
    });

    // Monitor de IP
    setInterval(() => {
        if (win) {
            const ip = Object.values(os.networkInterfaces()).flat()
                .find(i => i.family === 'IPv4' && !i.internal)?.address || "127.0.0.1";
            win.webContents.send("update-ip", ip);
        }
    }, 10000);

    // --- IPC HANDLERS ---
    ipcMain.on("resize-sidebar", (e, width) => {
        currentSidebarWidth = width;
        ajustarView();
    });

    ipcMain.handle("captura", async () => {
        await configurarAmbienteCaptura();
        sistemaIniciado = true;
        contentView.webContents.loadURL("https://cnhba-prod.si.valid.com.br/CapturaWebV2");
        ajustarView();
    });

    ipcMain.handle("smart", async () => {
        await configurarAmbienteSmart();
        sistemaIniciado = true;
        contentView.webContents.loadURL("https://nimba.dpt.ba.gov.br:8100");
        ajustarView();
    });

    ipcMain.handle("reload-page", () => contentView?.webContents.reload());
    
    ipcMain.handle("clear-cache", async () => {
        if (!contentView) return false;
        await contentView.webContents.session.clearStorageData();
        contentView.webContents.reload();
        return true;
    });

    ipcMain.handle("system-info", () => ({
        hostname: os.hostname(),
        ip: "---",
        anydesk: "---"
    }));
}