/**
 * @fileoverview Serviço de atualização automática via GitHub
 * @module services/updater.service
 *
 * Responsabilidade: Verificar, baixar e aplicar atualizações
 * do aplicativo (atualização automática).
 */

const { autoUpdater } = require("electron-updater");
const { app, Notification, dialog } = require("electron");
const config = require("../config/app.config");

/**
 * Inicializa e configura o auto-updater.
 * Só executa quando o app está empacotado (produção).
 *
 * @param {Object} params
 * @param {Object} params.mainWindow - Janela principal para enviar eventos
 * @param {string} params.iconPath - Caminho do ícone para notificações
 */
function initUpdater({ mainWindow, iconPath }) {
  if (!app.isPackaged) return;

  autoUpdater.setFeedURL({
    provider: config.UPDATER.provider,
    owner: config.UPDATER.owner,
    repo: config.UPDATER.repo,
  });

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.checkForUpdatesAndNotify();

  /**
   * Evento disparado quando o download da nova versão é concluído.
   * Exibe notificação nativa e avisa a UI para mostrar o badge.
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

    if (mainWindow) {
      mainWindow.webContents.send("update-ready");
    }

    notification.on("click", () => {
      dialog
        .showMessageBox(mainWindow, {
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
