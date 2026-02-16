const { app, BrowserWindow, WebContentsView, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");

// --- TRAVA DE INSTÂNCIA ÚNICA ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    // Variáveis Globais
    let win, contentView, sistemaIniciado = false;
    const SIDEBAR_WIDTH = 260;
    const TOPBAR_HEIGHT = 0;
    const ICON_PATH = path.join(__dirname, "icon.png");

    // Configuração de ambiente e pastas (Anti-erro 0x5)
    const customDataPath = path.join(app.getPath('appData'), 'captura-unificada-data');
    if (!fs.existsSync(customDataPath)) fs.mkdirSync(customDataPath, { recursive: true });
    app.setPath('userData', customDataPath);

    // Switches de Performance e Estabilidade
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache'); 
    app.commandLine.appendSwitch('ignore-certificate-errors');
    app.commandLine.appendSwitch("disable-renderer-backgrounding");
    app.commandLine.appendSwitch('max-http-header-size', '65536');

    // Focar na janela se tentar abrir uma segunda instância
    app.on('second-instance', () => {
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });

    function obterAnydeskID() {
        const caminhos = [
            path.join(process.env.ProgramData, "AnyDesk", "service.conf"),
            path.join(process.env.APPDATA, "AnyDesk", "system.conf")
        ];
        try {
            for (const p of caminhos) {
                if (fs.existsSync(p)) {
                    const match = fs.readFileSync(p, "utf8").match(/(?:ad\.anydesk\.id|id)=(\d+)/);
                    if (match) return match[1];
                }
            }
            return "Abrir AnyDesk";
        } catch { return "Erro ID"; }
    }

    function getLocalIP() {
        return Object.values(os.networkInterfaces())
            .flat()
            .find(i => i.family === 'IPv4' && !i.internal)?.address || "127.0.0.1";
    }

    function ajustarView() {
        if (!win || !contentView || !sistemaIniciado) return;
        const { width, height } = win.getContentBounds();
        contentView.setBounds({
            x: SIDEBAR_WIDTH, y: TOPBAR_HEIGHT, 
            width: width - SIDEBAR_WIDTH, height: height - TOPBAR_HEIGHT
        });
    }

    function criarJanela() {
        win = new BrowserWindow({
            width: 1300, 
            height: 800, 
            minWidth: 900, 
            minHeight: 600,
            show: false, // Inicia oculta para evitar o flash visual de redimensionamento
            autoHideMenuBar: true, 
            icon: ICON_PATH,
            webPreferences: { 
                preload: path.join(__dirname, "preload.js"),
                contextIsolation: true, 
                nodeIntegration: false
            }
        });

        win.loadFile(path.join(__dirname, "ui", "index.html"));

        // Só mostra a janela quando estiver pronta e maximizada
        win.once('ready-to-show', () => {
            win.maximize();
            win.show();
        });

        contentView = new WebContentsView({
            webPreferences: { backgroundThrottling: false, spellcheck: false }
        });

        win.contentView.addChildView(contentView);
        contentView.setBounds({ x: 0, y: 0, width: 0, height: 0 });

        win.on("resize", ajustarView);
    }

    // Monitor de IP otimizado
    let lastIP = getLocalIP();
    setInterval(() => {
        const currentIP = getLocalIP();
        if (win && currentIP !== lastIP) {
            lastIP = currentIP;
            win.webContents.send("update-ip", currentIP);
        }
    }, 10000);

    app.whenReady().then(criarJanela);

    // IPC Handlers
    const carregarURL = (url) => {
        sistemaIniciado = true;
        contentView.webContents.loadURL(url);
        ajustarView();
    };

    ipcMain.handle("captura", () => carregarURL("https://cnhba-prod.si.valid.com.br/CapturaWebV2"));
    ipcMain.handle("smart", () => carregarURL("https://google.com"));
    ipcMain.handle("reload-page", () => contentView?.webContents.reload());

    ipcMain.handle("clear-cache", async () => {
        if (!contentView) return false;
        await contentView.webContents.session.clearStorageData();
        await contentView.webContents.session.clearCache();
        contentView.webContents.reload();
        return true;
    });

    ipcMain.handle("system-info", () => ({
        hostname: os.hostname(),
        ip: getLocalIP(),
        anydesk: obterAnydeskID()
    }));
}