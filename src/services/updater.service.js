/**
 * @fileoverview Serviço de atualização automática via GitHub
 * @module services/updater.service
 *
 * Fluxo: verificação automática (na abertura + a cada 4h), download em silêncio,
 * instalação na saída do app (próximo restart já inicia na versão nova).
 */

const { autoUpdater } = require("electron-updater");
const { app, Notification, dialog } = require("electron");
const config = require("../config/app.config");

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; /* 4 horas */
let periodicCheckTimer = null;
let listenersRegistered = false;

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
    const appName = config.APP_NAME || "Captura Unificada";
    const versionLabel = info.version ? `v${info.version}` : info.version;
    const notification = new Notification({
      title: appName,
      body: `Nova versão ${versionLabel} baixada. Será aplicada no próximo reinício.`,
      icon: iconPath,
    });

    notification.show();

    const win = getWin();
    if (win && !win.isDestroyed()) win.webContents.send("update-ready");

    notification.on("click", () => {
      const currentWin = getWin();
      dialog
        .showMessageBox(currentWin && !currentWin.isDestroyed() ? currentWin : null, {
          type: "question",
          buttons: ["Reiniciar Agora", "Depois"],
          defaultId: 0,
          title: `${appName} — Atualização pronta`,
          message: "Deseja reiniciar o aplicativo para aplicar a atualização agora?",
        })
        .then((result) => {
          if (result.response === 0) autoUpdater.quitAndInstall();
        });
    });
  });

  autoUpdater.on("error", (err) => {
    console.error("Erro no updater:", err);
  });
}

module.exports = { initUpdater };
