/**
 * @fileoverview Ponto de entrada do aplicativo Captura Unificada
 * @module main
 *
 * Launcher de sistemas integrados (CapturaWeb, SMART/CIN e demais).
 * Garante instância única, configura ambiente e inicializa módulos.
 */

const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const config = require("./src/config/app.config");
const windowManager = require("./src/window/window.manager");
const { registerIpcHandlers } = require("./src/ipc/ipc.handlers");

/* Nome da aplicação em janelas, notificações e processos (sem referência a runtime) */
app.setName(config.APP_NAME || "Captura Unificada");

/* ========== OTIMIZAÇÃO V8 ========== */
process.env.V8_CACHE_OPTIONS = "code";

/* ========== INSTÂNCIA ÚNICA ========== */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  const ICON_PATH = path.join(__dirname, "icon.png");

  /**
   * Foca na janela existente quando uma segunda instância é aberta.
   */
  app.on("second-instance", () => {
    const win = windowManager.getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.setAppUserModelId(config.APP_ID);

  /**
   * Configura diretório de dados do usuário.
   */
  const customDataPath = path.join(app.getPath("appData"), config.USER_DATA_DIR);
  if (!fs.existsSync(customDataPath)) {
    fs.mkdirSync(customDataPath, { recursive: true });
  }
  app.setPath("userData", customDataPath);

  /* ========== FLAGS DE PERFORMANCE (CHROME) ========== */
  app.commandLine.appendSwitch("disable-http-cache", "false");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
  app.commandLine.appendSwitch("enable-inline-resource-suggesting");
  app.commandLine.appendSwitch("ignore-certificate-errors");
  app.commandLine.appendSwitch("disable-web-security");

  /* ========== INICIALIZAÇÃO ========== */
  app.whenReady().then(() => {
    windowManager.criarJanela(ICON_PATH);
    registerIpcHandlers();
    windowManager.preconnectUrls();
  });
}
