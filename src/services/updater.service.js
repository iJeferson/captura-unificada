"use strict";

/**
 * @fileoverview Atualização automática via GitHub (verificação 4h, download silencioso).
 * @module services/updater.service
 */

const { autoUpdater } = require("electron-updater");
const { app, Notification } = require("electron");
const config = require("../config/app.config");

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
let periodicCheckTimer = null;
let listenersRegistered = false;
/** True após update-downloaded; o renderer consulta via IPC se perdeu o evento. */
let updateDownloadedPending = false;

function hasPendingDownloadedUpdate() {
  return updateDownloadedPending;
}

function sendUpdateReady(getWin) {
  const win = getWin();
  if (win && !win.isDestroyed()) win.webContents.send("update-ready");
}

/**
 * Inicializa e configura o auto-updater.
 * Só executa quando o app está empacotado (produção).
 * - Auto-download: sim (silencioso).
 * - Aplicação: no próximo encerramento do app (autoInstallOnAppQuit).
 *
 * @param {Object} params
 * @param {Object} params.mainWindow - Janela principal (para compatibilidade)
 * @param {string} params.iconPath - Caminho do ícone para notificações
 * @param {function} [params.getMainWindow] - Função que retorna a janela principal atual (evita referência destruída)
 */
function initUpdater({ mainWindow, iconPath, getMainWindow }) {
  const getWin = typeof getMainWindow === "function" ? getMainWindow : () => mainWindow;
  if (!app.isPackaged) return;

  autoUpdater.setFeedURL({
    provider: config.UPDATER.provider,
    owner: config.UPDATER.owner,
    repo: config.UPDATER.repo,
  });

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.checkForUpdatesAndNotify();

  if (periodicCheckTimer == null) {
    periodicCheckTimer = setInterval(() => {
      if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify();
    }, CHECK_INTERVAL_MS);
    periodicCheckTimer.unref?.();
  }

  if (listenersRegistered) return;
  listenersRegistered = true;

  /**
   * Download concluído: notificação + badge na UI. Aplicação ocorre no próximo restart (autoInstallOnAppQuit).
   */
  autoUpdater.on("update-downloaded", (info) => {
    updateDownloadedPending = true;
    const appName = config.APP_NAME || "Captura Unificada";
    const versionLabel = info.version ? `v${info.version}` : info.version;
    const notification = new Notification({
      title: appName,
      body: `Nova versão ${versionLabel} disponível. Use o aviso na barra lateral para instalar.`,
      icon: iconPath,
    });
    notification.on("click", () => {
      const win = getWin();
      if (!win || win.isDestroyed()) return;
      try {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      } catch (_) {}
      sendUpdateReady(getWin);
    });
    notification.show();

    sendUpdateReady(getWin);
    setTimeout(() => sendUpdateReady(getWin), 500);
    setTimeout(() => sendUpdateReady(getWin), 2000);
  });

  autoUpdater.on("error", (err) => {
    console.error("Erro no updater:", err);
  });

  const wc = mainWindow?.webContents;
  if (wc && !wc.isDestroyed()) {
    const resendIfPending = () => {
      if (updateDownloadedPending) sendUpdateReady(getWin);
    };
    if (wc.isLoading()) wc.once("did-finish-load", resendIfPending);
    else setImmediate(resendIfPending);
  }
}

module.exports = { initUpdater, hasPendingDownloadedUpdate };
