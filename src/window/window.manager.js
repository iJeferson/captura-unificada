"use strict";

/**
 * @fileoverview Gerenciador da janela principal e da janela do Atende.
 * Cria janela principal com contentView; cria/foca janela do Atende.
 * Conectividade delegada ao connectivity.service. Nenhuma operação exige administrador.
 * @module window/window.manager
 */

const { app, BrowserWindow, WebContentsView, session } = require("electron");
const path = require("path");
const config = require("../config/app.config");
const logger = require("../utils/logger");
const { initUpdater } = require("../services/updater.service");
const connectivityService = require("../services/connectivity.service");

/** Rótulos dos sistemas para o título da janela (id → nome exibido) */
const SISTEMA_LABELS = {
  "captura": "CapturaWeb",
  "smart": "SMART (CIN)",
  "s4ipm": "S4IPM",
  "atende": "Atende",
  "validacao": "Validação",
  "doc-avulsos": "Doc Avulso (Antigo)",
  "ponto-valid": "Ponto Valid",
  "ponto-renova": "Ponto Renova",
};

let mainWindow = null;
let contentView = null;
let atendeWindow = null;
let pontoRenovaWindow = null;
let iconPath = null;
let sistemaIniciado = false;
let processandoTroca = false;
let currentSidebarWidth = config.SIDEBAR_WIDTH_EXPANDED;
let currentSistema = null;

function getContentBounds() {
  if (!mainWindow) return null;
  const { width, height } = mainWindow.getContentBounds();
  return {
    x: currentSidebarWidth,
    y: config.TOPBAR_HEIGHT,
    width: Math.max(0, width - currentSidebarWidth),
    height: Math.max(0, height - config.TOPBAR_HEIGHT),
  };
}

function ajustarView() {
  if (!mainWindow || !sistemaIniciado) return;
  const bounds = getContentBounds();
  if (!bounds || !contentView) return;
  contentView.setBounds(bounds);
}

function enviarLoadFinished(sistema) {
  currentSistema = sistema;
  processandoTroca = false;
  updateMainWindowTitle();
  if (mainWindow?.webContents) {
    mainWindow.webContents.send("load-finished", sistema);
  }
}

/**
 * Atualiza o título da janela principal: "Captura Unificada v{versão} — {sistema ativo}".
 */
function updateMainWindowTitle() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const v = app.getVersion();
  const label = currentSistema ? SISTEMA_LABELS[currentSistema] : null;
  const title = label
    ? `Captura Unificada v${v} — ${label}`
    : `Captura Unificada v${v}`;
  mainWindow.setTitle(title);
}

function notificarAtendeWindowEstado(aberta) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  if (!wc || wc.isDestroyed()) return;
  wc.send(aberta ? "atende-window-opened" : "atende-window-closed");
}

function getMainWindowRef() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

/**
 * Abre a janela do Atende ou traz a existente à frente.
 * Se a janela já existir, apenas mostra e foca (não recarrega a URL).
 * @param {string} url
 * @returns {{ alreadyOpen: boolean }}
 */
function openOrFocusAtendeWindow(url) {
  const urlToLoad = (url || "").trim();
  if (atendeWindow && !atendeWindow.isDestroyed()) {
    atendeWindow.show();
    atendeWindow.focus();
    return { alreadyOpen: true };
  }
  if (!urlToLoad || !urlToLoad.startsWith("http")) {
    return { alreadyOpen: false };
  }

  const version = app.getVersion();
  atendeWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    title: `Captura Unificada v${version} — Atende`,
    icon: iconPath || path.join(__dirname, "..", "..", "icon.png"),
    backgroundColor: config.WINDOW.backgroundColor,
    autoHideMenuBar: true,
    webPreferences: {
      partition: config.SESSION_PARTITION_ATENDE,
      backgroundThrottling: false,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  atendeWindow.webContents.setWindowOpenHandler(({ url }) => {
    atendeWindow.loadURL(url);
    return { action: "deny" };
  });

  atendeWindow.webContents.on("did-finish-load", () => {
    if (atendeWindow && !atendeWindow.isDestroyed()) {
      atendeWindow.setTitle(`Captura Unificada v${version} — Atende`);
    }
  });

  atendeWindow.loadURL(urlToLoad).catch((err) => {
    if (logger && logger.logError) logger.logError(err);
  });

  atendeWindow.on("closed", () => {
    atendeWindow = null;
    notificarAtendeWindowEstado(false);
  });

  atendeWindow.once("ready-to-show", () => {
    atendeWindow.show();
    notificarAtendeWindowEstado(true);
  });

  return { alreadyOpen: false };
}

const CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function configurarSessaoPontoRenova() {
  const s = session.fromPartition(config.SESSION_PARTITION_PONTO_RENOVA);
  s.setUserAgent(CHROME_USER_AGENT);
  s.webRequest.onBeforeSendHeaders(
    { urls: ["*://*.pontomais.com.br/*", "*://*.renova.net.br/*"] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      headers["User-Agent"] = CHROME_USER_AGENT;
      headers["Sec-Ch-Ua"] = '"Chromium";v="131", "Google Chrome";v="131", "Not_A Brand";v="24"';
      headers["Sec-Ch-Ua-Mobile"] = "?0";
      headers["Sec-Ch-Ua-Platform"] = '"Windows"';
      callback({ requestHeaders: headers });
    }
  );
  s.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const url = details?.requestingUrl || "";
    callback(permission === "geolocation" && url.includes("pontomais.com.br"));
  });
  s.setPermissionCheckHandler((wc, permission) =>
    permission === "geolocation" && (wc?.getURL?.() || "").includes("pontomais.com.br")
  );
}

/**
 * Abre o Ponto Renova em janela separada (sessão isolada, headers Chrome).
 * Evita 403 da API que ocorre no contentView compartilhado.
 */
function openOrFocusPontoRenovaWindow() {
  const url = config.URLS.pontoRenova;
  if (pontoRenovaWindow && !pontoRenovaWindow.isDestroyed()) {
    pontoRenovaWindow.show();
    pontoRenovaWindow.focus();
    const wc = mainWindow?.webContents;
    if (wc && !wc.isDestroyed()) wc.send("load-finished", "ponto-renova");
    return;
  }
  configurarSessaoPontoRenova();
  const version = app.getVersion();
  pontoRenovaWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: `Captura Unificada v${version} — Ponto Renova`,
    icon: iconPath || path.join(__dirname, "..", "..", "icon.png"),
    backgroundColor: config.WINDOW.backgroundColor,
    autoHideMenuBar: true,
    webPreferences: {
      partition: config.SESSION_PARTITION_PONTO_RENOVA,
      backgroundThrottling: false,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  pontoRenovaWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    pontoRenovaWindow.loadURL(u);
    return { action: "deny" };
  });
  pontoRenovaWindow.webContents.on("did-finish-load", () => {
    if (pontoRenovaWindow && !pontoRenovaWindow.isDestroyed()) {
      pontoRenovaWindow.setTitle(`Captura Unificada v${version} — Ponto Renova`);
    }
  });
  pontoRenovaWindow.loadURL(url).catch((err) => logger.logError(err));
  pontoRenovaWindow.on("closed", () => {
    pontoRenovaWindow = null;
  });
  pontoRenovaWindow.once("ready-to-show", () => {
    pontoRenovaWindow.show();
    const wc = mainWindow?.webContents;
    if (wc && !wc.isDestroyed()) wc.send("load-finished", "ponto-renova");
  });
}

function criarJanela(iconPathParam) {
  iconPath = iconPathParam;
  const version = app.getVersion();
  mainWindow = new BrowserWindow({
    width: config.WINDOW.width,
    height: config.WINDOW.height,
    minWidth: config.WINDOW.minWidth,
    minHeight: config.WINDOW.minHeight,
    show: false,
    title: `Captura Unificada v${version}`,
    backgroundColor: config.WINDOW.backgroundColor,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "..", "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "..", "ui", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
    contentView = null;
    connectivityService.reset();
  });

  mainWindow.once("ready-to-show", () => {
    updateMainWindowTitle();
    mainWindow.maximize();
    mainWindow.show();
    setImmediate(() => {
      initUpdater({ mainWindow, iconPath, getMainWindow: getMainWindowRef });
      connectivityService.start(getMainWindowRef);
      connectivityService.requestCheck();
    });
  });

  const bounds = () =>
    getContentBounds() || {
      x: config.SIDEBAR_WIDTH_EXPANDED,
      y: 0,
      width: 1000,
      height: 800,
    };

  contentView = new WebContentsView({
    webPreferences: {
      backgroundThrottling: false,
      partition: config.SESSION_PARTITION,
      backForwardCache: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const capturaSession = session.fromPartition(config.SESSION_PARTITION);
  const chromeUserAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  capturaSession.setUserAgent(chromeUserAgent);
  capturaSession.webRequest.onBeforeSendHeaders(
    { urls: ["*://*.pontomais.com.br/*", "*://*.renova.net.br/*"] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      headers["User-Agent"] = chromeUserAgent;
      headers["Sec-Ch-Ua"] = '"Chromium";v="131", "Google Chrome";v="131", "Not_A Brand";v="24"';
      headers["Sec-Ch-Ua-Mobile"] = "?0";
      headers["Sec-Ch-Ua-Platform"] = '"Windows"';
      callback({ requestHeaders: headers });
    }
  );
  const allowGeolocationFor = (url) => typeof url === "string" && url.includes("pontomais.com.br");
  capturaSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (permission === "geolocation" && allowGeolocationFor(details?.requestingUrl)) {
      callback(true);
    } else {
      callback(false);
    }
  });
  capturaSession.setPermissionCheckHandler((webContents, permission, _checkingDetails) => {
    if (permission === "geolocation") {
      const url = webContents?.getURL?.() || "";
      return allowGeolocationFor(url);
    }
    return false;
  });

  let contentLoadFailureHandled = false;

  contentView.webContents.on("did-start-loading", () => {
    contentLoadFailureHandled = false;
    if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send("content-loading-state", true);
    }
  });

  contentView.webContents.on("did-finish-load", () => {
    contentLoadFailureHandled = true;
    if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send("content-loading-state", false);
    }
    if (contentView.webContents.getURL() !== "about:blank") {
      contentView.setVisible(true);
      enviarLoadFinished(currentSistema);
    }
  });

  /* Falha de carregamento: volta ao placeholder (Aguardando seleção + mensagem offline).
   * Aceita qualquer frame. Garante contentView oculto e sem área (0x0) para não cobrir o placeholder. */
  function onContentLoadFailed(_event, errorCode, errorDescription, validatedURL, _isMainFrame) {
    if (contentLoadFailureHandled) return;
    if (validatedURL === "about:blank" || (typeof validatedURL === "string" && !validatedURL.trim())) return;
    contentLoadFailureHandled = true;

    const loadErr = new Error(errorDescription || `Load failed (code ${errorCode})`);
    loadErr.code = String(errorCode);
    logger.logError(loadErr);

    try {
      if (contentView) {
        contentView.setVisible(false);
        const b = getContentBounds();
        if (b) contentView.setBounds({ x: b.x, y: b.y, width: 0, height: 0 });
      }
      connectivityService.notifyOffline();
      processandoTroca = false;
      enviarLoadFinished(null);

      const wc = mainWindow?.webContents;
      if (wc && !wc.isDestroyed()) {
        wc.executeJavaScript(`
          (function() {
            var pl = document.getElementById('placeholder');
            var ld = document.getElementById('loading');
            if (pl) { pl.classList.remove('hidden'); pl.style.display = 'flex'; pl.style.visibility = 'visible'; }
            if (ld) { ld.classList.add('hidden'); ld.style.display = 'none'; }
            document.querySelectorAll('.menu-btn').forEach(function(b){ b.classList.remove('active'); });
          })();
        `).catch((err) => logger.logError(err));
      }
    } catch (err) {
      logger.logError(err);
    }
  }
  contentView.webContents.on("did-fail-provisional-load", onContentLoadFailed);
  contentView.webContents.on("did-fail-load", onContentLoadFailed);

  contentView.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F5") {
      event.preventDefault();
      contentView.webContents.reload();
    } else if (input.key === "F12") {
      event.preventDefault();
      contentView.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key !== "F5" && input.key !== "F12") return;
    if (!contentView?.webContents || contentView.webContents.getURL() === "about:blank") return;
    event.preventDefault();
    if (input.key === "F5") contentView.webContents.reload();
    else contentView.webContents.toggleDevTools();
  });

  mainWindow.contentView.addChildView(contentView);
  contentView.setVisible(false);
  mainWindow.on("resize", ajustarView);

  mainWindow.once("ready-to-show", () => {
    const b = bounds();
    if (contentView) contentView.setBounds(b);
  });

  return { win: mainWindow, contentView };
}

/**
 * Registra callback único: executa quando o contentView carrega e a URL contém o padrão.
 * Usado para reiniciar serviço apenas ao chegar no CapturaWebV2 (após login Keycloak).
 * @param {string} urlPattern - substring da URL (ex.: cnhba-prod.si.valid.com.br/CapturaWebV2)
 * @param {() => void|Promise<void>} callback
 */
function onContentReachUrl(urlPattern, callback) {
  const cv = contentView;
  if (!cv?.webContents) return;
  const handler = () => {
    const current = cv.webContents.getURL();
    if (current && current.includes(urlPattern)) {
      cv.webContents.removeListener("did-finish-load", handler);
      Promise.resolve(callback()).catch((err) => logger.logError(err));
    }
  };
  cv.webContents.on("did-finish-load", handler);
}

function preconnectUrls() {
  const session = contentView?.webContents?.session;
  if (session) {
    session.preconnect({ url: config.URLS.capturaWebBase });
    session.preconnect({ url: "https://cnhba.si.valid.com.br" });
    session.preconnect({ url: config.URLS.smart });
    session.preconnect({ url: config.URLS.s4ipm });
    session.preconnect({ url: config.URLS.pontoValid });
    session.preconnect({ url: config.URLS.pontoRenova });
  }
}

function getActiveWebContents() {
  return contentView?.webContents;
}

module.exports = {
  criarJanela,
  ajustarView,
  preconnectUrls,
  openOrFocusAtendeWindow,
  openOrFocusPontoRenovaWindow,
  requestConnectivityCheck: () => connectivityService.requestCheck(),
  getMainWindow: getMainWindowRef,
  getContentView: () => contentView,
  getAtendeWindow: () => atendeWindow,
  isAtendeWindowOpen: () => atendeWindow != null && !atendeWindow.isDestroyed(),
  reloadAtendeWindow: () => {
    if (atendeWindow && !atendeWindow.isDestroyed() && atendeWindow.webContents) {
      atendeWindow.webContents.reload();
    }
  },
  reloadPontoRenovaWindow: () => {
    if (pontoRenovaWindow && !pontoRenovaWindow.isDestroyed() && pontoRenovaWindow.webContents) {
      pontoRenovaWindow.webContents.reload();
    }
  },
  getSistemaIniciado: () => sistemaIniciado,
  setSistemaIniciado: (v) => (sistemaIniciado = v),
  getCurrentSistema: () => currentSistema,
  setCurrentSistema: (s) => (currentSistema = s),
  getProcessandoTroca: () => processandoTroca,
  setProcessandoTroca: (v) => (processandoTroca = v),
  setCurrentSidebarWidth: (w) => (currentSidebarWidth = w),
  setContentViewVisible: (v) => contentView && (contentView.setVisible(v)),
  reloadContentView: () => contentView?.webContents?.reload(),
  reloadActiveView: () => getActiveWebContents()?.reload(),
  loadContentViewUrl: (url) => contentView?.webContents?.loadURL(url),
  onContentReachUrl,
};
