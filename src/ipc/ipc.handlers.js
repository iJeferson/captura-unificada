"use strict";

/**
 * @fileoverview Handlers IPC - comunicação Main Process ↔ Renderer
 * @module ipc/ipc.handlers
 */

const { ipcMain, session } = require("electron");
const { exec, spawn } = require("child_process");
const { promisify } = require("util");
const { autoUpdater } = require("electron-updater");
const config = require("../config/app.config");
const logger = require("../utils/logger");
const execAsync = promisify(exec);
const {
  configurarAmbienteCaptura,
  configurarAmbienteSmart,
  reiniciarServicoHardware,
  reiniciarBCC,
} = require("../services/hardware.service");
const { getSystemInfo } = require("../services/system.service");
const { getAtendeConfig, setAtendeConfig, setTheme, buildAtendeUrl } = require("../services/atende.service");
const windowManager = require("../window/window.manager");

/**
 * Abre um sistema no contentView: prepara estado, executa setup assíncrono (opcional) e carrega a URL.
 * Erros são logados; não propaga exceção para não exibir em tela.
 * @param {string} sistemaId
 * @param {string} url
 * @param {() => Promise<void>} [setup] - ex.: configurarAmbienteCaptura
 */
async function openSystemContent(sistemaId, url, setup) {
  if (windowManager.getProcessandoTroca()) return;
  windowManager.setProcessandoTroca(true);
  windowManager.setSistemaIniciado(true);
  windowManager.setCurrentSistema(sistemaId);
  windowManager.setContentViewVisible(false);
  try {
    if (typeof setup === "function") await setup();
    windowManager.loadContentViewUrl(url);
    windowManager.ajustarView();
  } catch (err) {
    logger.logError(err);
    windowManager.setProcessandoTroca(false);
    try {
      const win = windowManager.getMainWindow();
      if (win?.webContents && !win.webContents.isDestroyed()) win.webContents.send("load-finished", null);
    } catch (_) {}
  }
}

/**
 * Registra todos os handlers IPC. Deve ser chamado após a janela estar criada.
 */
function registerIpcHandlers() {
  ipcMain.on("resize-sidebar", (_, width) => {
    try {
      windowManager.setCurrentSidebarWidth(width);
      windowManager.ajustarView();
    } catch (err) {
      logger.logError(err);
    }
  });

  ipcMain.on("connectivity-request-initial", () => windowManager.requestConnectivityCheck());

  ipcMain.handle("captura", async () => {
    try {
      return await openSystemContent("captura", config.URLS.capturaWeb, configurarAmbienteCaptura);
    } catch (err) {
      logger.logError(err);
    }
  });
  ipcMain.handle("smart", async () => {
    try {
      return await openSystemContent("smart", config.URLS.smart, configurarAmbienteSmart);
    } catch (err) {
      logger.logError(err);
    }
  });
  ipcMain.handle("doc-avulsos", async () => {
    try {
      return await openSystemContent("doc-avulsos", config.URLS.docAvulsos, configurarAmbienteCaptura);
    } catch (err) {
      logger.logError(err);
    }
  });

  async function garantirCapturaWebValidacaoRodando() {
    try {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq CapturaWeb.exe"');
      if (stdout.trim().toLowerCase().includes("capturaweb.exe")) return;
    } catch (_) {
      /* ignora */
    }
    const exePath = config.CAPTURAWEB_VALIDACAO_EXE;
    try {
      spawn(exePath, [], { detached: true, stdio: "ignore" }).unref();
    } catch (err) {
      logger.logError(err);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  ipcMain.handle("validacao", async () => {
    try {
      await garantirCapturaWebValidacaoRodando();
      return await openSystemContent("validacao", config.URLS.validacao, configurarAmbienteCaptura);
    } catch (err) {
      logger.logError(err);
      return undefined;
    }
  });

  ipcMain.handle("ponto-valid", async () => {
    try {
      return await openSystemContent("ponto-valid", config.URLS.pontoValid);
    } catch (err) {
      logger.logError(err);
    }
  });
  ipcMain.handle("ponto-renova", async () => {
    try {
      return await openSystemContent("ponto-renova", config.URLS.pontoRenova);
    } catch (err) {
      logger.logError(err);
    }
  });

  /**
   * Handler: atende
   * Atende - carrega URL do arquivo no Desktop (http://IP/guiche.asp?auto=1).
   * Retorna { needsConfig: true } se IP não estiver configurado.
   */
  ipcMain.handle("atende", async () => {
    try {
      const cfg = getAtendeConfig();
      if (!cfg?.ip) {
        return { needsConfig: true };
      }
      const url = buildAtendeUrl(cfg.ip);
      if (!url || typeof url !== "string" || !url.startsWith("http")) {
        return { needsConfig: true };
      }
      const result = windowManager.openOrFocusAtendeWindow(url);
      return { needsConfig: false };
    } catch (err) {
      logger.logError(err);
      return { needsConfig: true };
    }
  });

  ipcMain.handle("reload-atende-window", () => {
    windowManager.reloadAtendeWindow();
  });

  ipcMain.handle("atende-window-open-state", () => windowManager.isAtendeWindowOpen());

  /**
   * Handler: atende-get-config
   * Retorna a config do Atende (IP) ou null.
   */
  ipcMain.handle("atende-get-config", () => getAtendeConfig());

  /**
   * Handler: atende-set-config
   * Salva o IP/URL do Atende (com http:// se o usuário digitar só IP).
   */
  ipcMain.handle("atende-set-config", (_, ip) => setAtendeConfig(ip));

  /**
   * Handler: atende-set-theme
   * Salva o tema (dark/light) em captura-unificada-atende.json.
   */
  ipcMain.handle("atende-set-theme", (_, theme) => setTheme(theme));

  /**
   * Handler: atende-modal-visible
   * Oculta as views quando o modal do Atende abre.
   * Ao fechar, exibe a view do sistema ativo.
   */
  ipcMain.on("atende-modal-visible", (_, ocultar) => {
    if (ocultar) {
      windowManager.setContentViewVisible(false);
    } else if (windowManager.getSistemaIniciado()) {
      windowManager.setContentViewVisible(true);
    }
  });

  /**
   * Handler: system-info
   * Retorna hostname, IP, AnyDesk e versão do app.
   */
  ipcMain.handle("system-info", () => {
    try {
      return getSystemInfo();
    } catch (err) {
      logger.logError(err);
      return {};
    }
  });

  /**
   * Handler: reload-page
   * Recarrega a view ativa na janela principal (contentView).
   */
  ipcMain.handle("reload-page", () => {
    windowManager.reloadActiveView();
  });

  /**
   * Handler: apply-update-now
   * Encerra o app e aplica a atualização baixada.
   */
  ipcMain.handle("apply-update-now", () => {
    autoUpdater.quitAndInstall();
  });

  /**
   * Handler: reiniciar-validacao
   * Mata o processo CapturaWeb (externo Valid) e abre novamente.
   * Se a view ativa for Validação, recarrega a página após abrir o exe.
   */
  ipcMain.handle("reiniciar-validacao", async () => {
    try {
      await execAsync('taskkill /F /IM CapturaWeb.exe /T');
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 800));
    const exePath = config.CAPTURAWEB_VALIDACAO_EXE;
    try {
      spawn(exePath, [], { detached: true, stdio: "ignore" }).unref();
    } catch (err) {
      logger.logError(err);
    }
    await new Promise((r) => setTimeout(r, 1500));
    if (windowManager.getCurrentSistema() === "validacao") {
      try {
        windowManager.reloadContentView();
      } catch (err) {
        logger.logError(err);
      }
    }
  });

  /**
   * Handler: reiniciar-servico-hardware
   * Reinicia o serviço Valid-ServicoIntegracaoHardware (CapturaWeb).
   */
  ipcMain.handle("reiniciar-servico-hardware", async () => {
    try {
      await reiniciarServicoHardware();
    } catch (err) {
      logger.logError(err);
    }
  });

  /**
   * Handler: reiniciar-bcc
   * Mata o processo BCC e inicia novamente (SMART CIN).
   */
  ipcMain.handle("reiniciar-bcc", async () => {
    try {
      await reiniciarBCC();
    } catch (err) {
      logger.logError(err);
    }
  });

  /**
   * Handler: clear-cache
   * Limpa APENAS a partition persist:captura (sistemas gerais).
   * NÃO limpa o Atende (persist:atende) - ele mantém cache e estado.
   */
  ipcMain.handle("clear-cache", async () => {
    try {
      const ses = session.fromPartition(config.SESSION_PARTITION);
      await ses.clearStorageData();
      const contentView = windowManager.getContentView();
      if (contentView) {
        windowManager.setContentViewVisible(false);
        windowManager.reloadContentView();
      }
      return true;
    } catch (e) {
      logger.logError(e);
      return false;
    }
  });
}

module.exports = { registerIpcHandlers };
