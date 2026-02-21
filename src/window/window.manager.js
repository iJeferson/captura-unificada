/**
 * @fileoverview Gerenciador da janela principal e da janela do Atende
 * @module window/window.manager
 *
 * Responsabilidade: Criar janela principal com contentView; criar/focar
 * janela separada do Atende (BrowserWindow). Atende mantém cache próprio (persist:atende).
 */

const { app, BrowserWindow, WebContentsView } = require("electron");
const path = require("path");
const config = require("../config/app.config");
const { initUpdater } = require("../services/updater.service");

/** Rótulos dos sistemas para o título da janela (id → nome exibido) */
const SISTEMA_LABELS = {
  "captura": "CapturaWeb",
  "smart": "SMART (CIN)",
  "atende": "Atende",
  "validacao": "Validação",
  "doc-avulsos": "Doc Avulso (Antigo)",
  "ponto-valid": "Ponto Valid",
  "ponto-renova": "Ponto Renova",
};

let mainWindow = null;
let contentView = null;
let atendeWindow = null;
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
  if (mainWindow?.webContents) {
    mainWindow.webContents.send(aberta ? "atende-window-opened" : "atende-window-closed");
  }
}

/**
 * Abre a janela do Atende ou traz a existente à frente.
 * @param {string} url
 * @returns {{ alreadyOpen: boolean }}
 */
function openOrFocusAtendeWindow(url) {
  if (atendeWindow && !atendeWindow.isDestroyed()) {
    atendeWindow.show();
    atendeWindow.focus();
    return { alreadyOpen: true };
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
    },
  });

  atendeWindow.loadURL(url);

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
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "..", "ui", "index.html"));

  mainWindow.once("ready-to-show", () => {
    updateMainWindowTitle();
    mainWindow.maximize();
    mainWindow.show();
    initUpdater({ mainWindow, iconPath });
  });

  const bounds = () => getContentBounds() || { x: 220, y: 0, width: 1000, height: 800 };

  contentView = new WebContentsView({
    webPreferences: {
      backgroundThrottling: false,
      partition: config.SESSION_PARTITION,
      backForwardCache: true,
    },
  });

  contentView.webContents.on("did-finish-load", () => {
    if (contentView.webContents.getURL() !== "about:blank") {
      contentView.setVisible(true);
      enviarLoadFinished(currentSistema);
    }
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

function preconnectUrls() {
  const session = contentView?.webContents?.session;
  if (session) {
    session.preconnect({ url: config.URLS.capturaWebBase });
    session.preconnect({ url: "https://cnhba.si.valid.com.br" });
    session.preconnect({ url: config.URLS.smart });
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
  getMainWindow: () => mainWindow,
  getContentView: () => contentView,
  getAtendeWindow: () => atendeWindow,
  isAtendeWindowOpen: () => atendeWindow != null && !atendeWindow.isDestroyed(),
  reloadAtendeWindow: () => {
    if (atendeWindow && !atendeWindow.isDestroyed() && atendeWindow.webContents) {
      atendeWindow.webContents.reload();
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
};
