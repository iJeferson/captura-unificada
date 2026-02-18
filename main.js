const { app, BrowserWindow, WebContentsView, ipcMain, net } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { exec } = require("child_process");

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.setAppUserModelId("com.consorcio.capturaunificada"); 

    let win, contentView, sistemaIniciado = false;
    let currentSidebarWidth = 260; 
    const TOPBAR_HEIGHT = 0;
    const ICON_PATH = path.join(__dirname, "icon.png");

    const customDataPath = path.join(app.getPath('appData'), 'captura-unificada-data');
    if (!fs.existsSync(customDataPath)) fs.mkdirSync(customDataPath, { recursive: true });
    app.setPath('userData', customDataPath);

    // AJUSTE DE SEGURANÇA: Permite que o React da Griaule carregue os scripts locais
    app.commandLine.appendSwitch('disable-site-isolation-trials');
    app.commandLine.appendSwitch('disable-features', 'BlockInsecurePrivateNetworkRequests');
    app.commandLine.appendSwitch('ignore-certificate-errors');

    const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // VERIFICAÇÃO DE PORTA (64041)
    function verificarServicoBCC(tentativas = 50) { // Aumentei para 50 tentativas
        return new Promise((resolve) => {
            const checar = (n) => {
                if (n <= 0) return resolve(false);
                const request = net.request('http://localhost:64041/bcc/layout/config');
                request.on('response', () => resolve(true));
                request.on('error', () => {
                    setTimeout(() => checar(n - 1), 500);
                });
                request.end();
            };
            checar(tentativas);
        });
    }

    async function resetarLeitorSuprema() {
        return new Promise((resolve) => {
            const cmd = `powershell -Command "Get-PnpDevice -FriendlyName '*Suprema RealScan-D*' | Disable-PnpDevice -Confirm:$false; Start-Sleep -Seconds 2; Get-PnpDevice -FriendlyName '*Suprema RealScan-D*' | Enable-PnpDevice -Confirm:$false"`;
            exec(cmd, () => resolve());
        });
    }

    async function configurarAmbienteSmart() {
        exec('sc stop "Valid-ServicoIntegracaoHardware"');
        await esperar(1000);
        exec('taskkill /F /IM BCC.exe /T');
        exec('taskkill /F /IM javaw.exe /T');
        await esperar(1500);

        console.log("Lançando BCC...");
        // Usa o caminho absoluto no start /d para não ter erro de diretório
        const comando = `cmd /c "start /d "C:\\Griaule\\BCC" BCC.exe"`;
        exec(comando);
    }

    async function configurarAmbienteCaptura() {
        exec('taskkill /F /IM BCC.exe /T');
        exec('taskkill /F /IM javaw.exe /T');
        await esperar(1500);
        await resetarLeitorSuprema();
        await esperar(1500);
        exec('sc start "Valid-ServicoIntegracaoHardware"');
    }

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
        win.once('ready-to-show', () => { win.maximize(); win.show(); });

        contentView = new WebContentsView({
            webPreferences: { 
                backgroundThrottling: false, 
                spellcheck: false,
                webSecurity: false // NECESSÁRIO para o SMART carregar scripts locais
            }
        });

        contentView.webContents.on('did-finish-load', () => {
            win.webContents.send('load-finished');
        });

        win.contentView.addChildView(contentView);

        const dispararReload = (event, input) => {
            if (input.type === 'keyDown' && input.key === 'F5' && contentView && sistemaIniciado) {
                contentView.webContents.reload();
                event.preventDefault();
            }
            // ATALHO SECRETO: F12 abre o console para você ver por que a tela está branca
            if (input.type === 'keyDown' && input.key === 'F12') {
                contentView.webContents.openDevTools({ mode: 'detach' });
            }
        };
        win.webContents.on('before-input-event', dispararReload);
        contentView.webContents.on('before-input-event', dispararReload);

        win.on("resize", ajustarView);
    }

    app.whenReady().then(() => {
        criarJanela();
        app.setLoginItemSettings({ openAtLogin: true, path: app.getPath('exe') });
    });

    ipcMain.on("resize-sidebar", (e, width) => {
        currentSidebarWidth = width;
        ajustarView();
    });

    ipcMain.handle("captura", async () => {
        await configurarAmbienteCaptura();
        await esperar(3000); 
        sistemaIniciado = true;
        contentView.webContents.loadURL("https://cnhba-prod.si.valid.com.br/CapturaWebV2");
        ajustarView();
    });

    ipcMain.handle("smart", async () => {
        await configurarAmbienteSmart();
        
        // Aguarda até o servidor Java responder
        const pronto = await verificarServicoBCC();
        
        sistemaIniciado = true;
        if (contentView) {
            await contentView.webContents.session.clearCache();
            contentView.webContents.loadURL("https://nimba.dpt.ba.gov.br:8100");
            ajustarView();
        }
    });

    ipcMain.handle("system-info", () => ({
        hostname: os.hostname(),
        ip: Object.values(os.networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal)?.address || "127.0.0.1",
        anydesk: "---"
    }));

    ipcMain.handle("reload-page", () => contentView?.webContents.reload());
    ipcMain.handle("clear-cache", async () => {
        if (contentView) {
            await contentView.webContents.session.clearStorageData();
            contentView.webContents.reload();
            return true;
        }
        return false;
    });
}