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

  /* ========== PERFORMANCE E MEMÓRIA ========== */
  app.commandLine.appendSwitch("disable-http-cache", "false");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
  app.commandLine.appendSwitch("enable-inline-resource-suggesting");
  app.commandLine.appendSwitch("disk-cache-size", "52428800"); /* 50MB – limita cache em disco para reduzir uso de memória */
  /* Opcional: --max-old-space-size=512 limita heap V8 (MB); descomente se quiser limitar picos de memória */
  /* app.commandLine.appendSwitch("js-flags", "--max-old-space-size=512"); */

  /* ========== SEGURANÇA – CERTIFICADOS E CORS ==========
   * ignore-certificate-errors e disable-web-security REDUZEM a segurança:
   * - ignore-certificate-errors: aceita certificados SSL inválidos/autoassinados (risco de MITM).
   * - disable-web-security: desativa políticas de mesma origem/CORS (permite requisições cross-origin).
   * Devem ser REVISADOS em produção. Em redes internas com HTTPS autoassinado pode ser necessário
   * mantê-los; em ambientes controlados, defina config.ALLOW_INSECURE_CONNECTIONS = false em app.config.js.
   */
  if (config.ALLOW_INSECURE_CONNECTIONS) {
    app.commandLine.appendSwitch("ignore-certificate-errors");
    app.commandLine.appendSwitch("disable-web-security");
  }

  /* ========== INICIALIZAÇÃO ========== */
  app.whenReady().then(() => {
    windowManager.criarJanela(ICON_PATH);
    registerIpcHandlers();
    windowManager.preconnectUrls();
  });
}
