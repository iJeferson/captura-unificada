"use strict";

/**
 * @fileoverview Handlers IPC - comunicação Main Process ↔ Renderer.
 * Nenhuma operação exige elevação de administrador.
 * @module ipc/ipc.handlers
 */

const { ipcMain, session, shell } = require("electron");
const fs = require("fs");
const { exec, spawn } = require("child_process");
const { promisify } = require("util");
const { autoUpdater } = require("electron-updater");
const config = require("../config/app.config");
const logger = require("../utils/logger");
const { esperar } = require("../utils/helpers");
const execAsync = promisify(exec);
const {
  configurarAmbienteSmart,
  matarBCC,
  pararServicoValid,
  iniciarBCC,
  iniciarServicoValid,
  reiniciarServicoValidUmaVez,
  reiniciarServicoHardware,
  reiniciarBCC,
} = require("../services/hardware.service");
const { getSystemInfo } = require("../services/system.service");
const { getAtendeConfig, setAtendeConfig, setTheme, buildAtendeUrl } = require("../services/atende.service");
const windowManager = require("../window/window.manager");

/** Limite aproximado do header Cookie (bytes). Acima disso o servidor pode retornar 400. */
const COOKIE_HEADER_LIMIT = 3500;

/**
 * Se os cookies do domínio da URL passarem do limite, remove todos para esse domínio.
 * Evita "400 Request Header Or Cookie Too Large" sem precisar limpar cache manualmente.
 * @param {string} url - URL que será carregada (ex.: CapturaWeb, Valid, etc.)
 */
async function trimCookiesIfNeeded(url) {
  try {
    const ses = session.fromPartition(config.SESSION_PARTITION);
    const list = await ses.cookies.get({ url });
    const approxSize = list.reduce((acc, c) => acc + (c.name?.length || 0) + (c.value?.length || 0) + 2, 0);
    if (approxSize <= COOKIE_HEADER_LIMIT) return;
    for (const c of list) {
      try {
        await ses.cookies.remove(url, c.name);
      } catch (_) {}
    }
  } catch (err) {
    logger.logError(err);
  }
}

/**
 * Abre um sistema no contentView: prepara estado, executa setup assíncrono (opcional) e carrega a URL.
 * Ordem: setup (ex.: matar BCC, reiniciar serviço) → depois carrega a URL.
 * Erros são logados; não propaga exceção para não exibir em tela.
 * @param {string} sistemaId
 * @param {string} url
 * @param {() => Promise<void>} [setup] - ex.: configurarAmbienteSmart
 */
async function openSystemContent(sistemaId, url, setup) {
  if (windowManager.getProcessandoTroca()) return;
  windowManager.setProcessandoTroca(true);
  windowManager.setSistemaIniciado(true);
  windowManager.setCurrentSistema(sistemaId);
  windowManager.setContentViewVisible(false);
  try {
    await trimCookiesIfNeeded(url);
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
  ipcMain.on("resize-sidebar", (_, state) => {
    try {
      const width =
        state === "collapsed"
          ? config.SIDEBAR_WIDTH_COLLAPSED
          : config.SIDEBAR_WIDTH_EXPANDED;
      windowManager.setCurrentSidebarWidth(width);
      windowManager.ajustarView();
    } catch (err) {
      logger.logError(err);
    }
  });

  ipcMain.on("connectivity-request-initial", () => windowManager.requestConnectivityCheck());

  ipcMain.handle("captura", async () => {
    try {
      const url = config.URLS.capturaWeb;
      if (windowManager.getProcessandoTroca()) return;
      windowManager.setProcessandoTroca(true);
      windowManager.setSistemaIniciado(true);
      windowManager.setCurrentSistema("captura");
      windowManager.setContentViewVisible(false);
      try {
        await trimCookiesIfNeeded(url);
        await matarBCC();
        await pararServicoValid();
        iniciarBCC();
        windowManager.loadContentViewUrl(url);
        windowManager.ajustarView();
        await esperar(6000);
        await matarBCC();
        await iniciarServicoValid();
      } catch (err) {
        logger.logError(err);
        windowManager.setProcessandoTroca(false);
        try {
          const win = windowManager.getMainWindow();
          if (win?.webContents && !win.webContents.isDestroyed())
            win.webContents.send("load-finished", null);
        } catch (_) {}
      }
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
  ipcMain.handle("s4ipm", async () => {
    try {
      return await openSystemContent("s4ipm", config.URLS.s4ipm);
    } catch (err) {
      logger.logError(err);
    }
  });
  ipcMain.handle("doc-avulsos", async () => {
    try {
      await iniciarServicoValid();
      return await openSystemContent("doc-avulsos", config.URLS.docAvulsos);
    } catch (err) {
      logger.logError(err);
    }
  });

  ipcMain.handle("validacao", async () => {
    try {
      await matarBCC();
      return await openSystemContent("validacao", config.URLS.validacao);
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
  ipcMain.handle("ponto-renova", () => {
    try {
      windowManager.openOrFocusPontoRenovaWindow();
    } catch (err) {
      logger.logError(err);
    }
  });

  ipcMain.handle("ponto-renova-abrir-navegador", () => {
    try {
      const url = config.URLS.pontoRenova;
      const chromePaths = [
        process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      ];
      const chromePath = chromePaths.find((p) => p && fs.existsSync(p));
      if (chromePath) {
        spawn(chromePath, [url], { detached: true, stdio: "ignore" }).unref();
      } else {
        shell.openExternal(url);
      }
    } catch (err) {
      logger.logError(err);
      try {
        shell.openExternal(config.URLS.pontoRenova);
      } catch (e2) {
        logger.logError(e2);
      }
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
      windowManager.openOrFocusAtendeWindow(url);
      return { needsConfig: false };
    } catch (err) {
      logger.logError(err);
      return { needsConfig: true };
    }
  });

  ipcMain.handle("reload-atende-window", () => {
    windowManager.reloadAtendeWindow();
  });

  ipcMain.handle("reload-ponto-renova-window", () => {
    windowManager.reloadPontoRenovaWindow();
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
  const DELAY_APOS_SPAWN_MS = 1000;
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
    await new Promise((r) => setTimeout(r, DELAY_APOS_SPAWN_MS));
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
   * Limpa a partition persist:captura (sistemas gerais), incluindo cookies.
   * Resolve "400 Request Header Or Cookie Too Large" quando há muitos cookies no domínio.
   * NÃO limpa o Atende (persist:atende).
   */
  ipcMain.handle("clear-cache", async () => {
    try {
      const ses = session.fromPartition(config.SESSION_PARTITION);
      await ses.clearStorageData({
        storages: [
          "appcache", "cookies", "filesystem", "indexdb", "localstorage",
          "shadercache", "websql", "serviceworkers", "cachestorage",
        ],
      });
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

  ipcMain.handle("clear-ponto-renova-cache", async () => {
    try {
      const ses = session.fromPartition(config.SESSION_PARTITION_PONTO_RENOVA);
      await ses.clearStorageData({
        storages: [
          "appcache", "cookies", "filesystem", "indexdb", "localstorage",
          "shadercache", "websql", "serviceworkers", "cachestorage",
        ],
      });
      windowManager.reloadPontoRenovaWindow();
      return true;
    } catch (e) {
      logger.logError(e);
      return false;
    }
  });
}

module.exports = { registerIpcHandlers };
