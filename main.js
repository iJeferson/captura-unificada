"use strict";

/**
 * @fileoverview Ponto de entrada do aplicativo Captura Unificada.
 * Launcher de sistemas integrados (CapturaWeb, SMART/CIN e demais).
 * Garante instância única; dados e logs em AppData — nenhuma operação exige administrador.
 * @module main
 */

const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const config = require("./src/config/app.config");
const logger = require("./src/utils/logger");
const windowManager = require("./src/window/window.manager");
const { registerIpcHandlers } = require("./src/ipc/ipc.handlers");

logger.initGlobalHandlers();

app.setName(config.APP_NAME || "Captura Unificada");
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
process.env.V8_CACHE_OPTIONS = "code";
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  const ICON_PATH = path.join(__dirname, "icon.png");

  app.on("second-instance", () => {
    try {
      const win = windowManager.getMainWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
      } else {
        windowManager.criarJanela(ICON_PATH);
        windowManager.preconnectUrls();
      }
    } catch (err) {
      logger.logError(err);
    }
  });

  app.setAppUserModelId(config.APP_ID);

  try {
    const customDataPath = path.join(app.getPath("appData"), config.USER_DATA_DIR);
    if (!fs.existsSync(customDataPath)) {
      fs.mkdirSync(customDataPath, { recursive: true });
    }
    app.setPath("userData", customDataPath);
  } catch (err) {
    logger.logError(err);
  }

  app.commandLine.appendSwitch("disable-http-cache", "false");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
  app.commandLine.appendSwitch("enable-inline-resource-suggesting");
  app.commandLine.appendSwitch("disk-cache-size", "52428800");
  app.commandLine.appendSwitch("disable-features",
    "PrivateNetworkAccessRespectPreflightResults," +
    "PrivateNetworkAccessSendPreflights," +
    "BlockInsecurePrivateNetworkRequests," +
    "PrivateNetworkAccessForNavigations," +
    "PrivateNetworkAccessPermissionPrompt," +
    "PrivateNetworkAccessForWorkers"
  );
  if (config.ALLOW_INSECURE_CONNECTIONS) {
    app.commandLine.appendSwitch("ignore-certificate-errors");
  }

  app.whenReady().then(() => {
    try {
      windowManager.criarJanela(ICON_PATH);
      registerIpcHandlers();
      setImmediate(() => windowManager.preconnectUrls());
    } catch (err) {
      logger.logError(err);
    }
  });
}
