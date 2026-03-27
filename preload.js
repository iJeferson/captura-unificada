"use strict";

/**
 * @fileoverview Context Bridge - API segura Main ↔ Renderer (contextIsolation).
 * Todos os argumentos são sanitizados antes de enviar ao Main Process.
 * @module preload
 */

const { contextBridge, ipcRenderer } = require("electron");

function sanitizeString(val, maxLen = 2048) {
  if (typeof val !== "string") return "";
  return val.slice(0, maxLen).trim();
}

const ALLOWED_SIDEBAR_STATES = new Set(["collapsed", "expanded"]);
const ALLOWED_THEMES = new Set(["dark", "light"]);

contextBridge.exposeInMainWorld("api", {
  abrirCaptura: () => ipcRenderer.invoke("captura"),
  abrirSmart: () => ipcRenderer.invoke("smart"),
  abrirS4ipm: () => ipcRenderer.invoke("s4ipm"),
  abrirDocAvulsos: () => ipcRenderer.invoke("doc-avulsos"),
  abrirValidacao: () => ipcRenderer.invoke("validacao"),
  abrirPontoValid: () => ipcRenderer.invoke("ponto-valid"),
  abrirPontoRenova: () => ipcRenderer.invoke("ponto-renova"),
  abrirPontoRenovaNoNavegador: () => ipcRenderer.invoke("ponto-renova-abrir-navegador"),
  abrirAtende: () => ipcRenderer.invoke("atende"),

  getAtendeConfig: () => ipcRenderer.invoke("atende-get-config"),
  setAtendeConfig: (ip) => ipcRenderer.invoke("atende-set-config", sanitizeString(ip, 512)),
  setTheme: (theme) => {
    const safe = ALLOWED_THEMES.has(theme) ? theme : "dark";
    return ipcRenderer.invoke("atende-set-theme", safe);
  },
  setAtendeModalVisible: (ocultar) => ipcRenderer.send("atende-modal-visible", !!ocultar),

  reloadPage: () => ipcRenderer.invoke("reload-page"),
  reloadAtendeWindow: () => ipcRenderer.invoke("reload-atende-window"),
  reloadPontoRenovaWindow: () => ipcRenderer.invoke("reload-ponto-renova-window"),

  onContentLoadingState: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("content-loading-state", (_, loading) => callback(!!loading));
  },
  onAtendeWindowOpened: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("atende-window-opened", () => callback());
  },
  onAtendeWindowClosed: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("atende-window-closed", () => callback());
  },
  isAtendeWindowOpen: () => ipcRenderer.invoke("atende-window-open-state"),

  clearCache: () => ipcRenderer.invoke("clear-cache"),
  clearPontoRenovaCache: () => ipcRenderer.invoke("clear-ponto-renova-cache"),

  reiniciarValidacao: () => ipcRenderer.invoke("reiniciar-validacao"),
  reiniciarServicoHardware: () => ipcRenderer.invoke("reiniciar-servico-hardware"),
  reiniciarBCC: () => ipcRenderer.invoke("reiniciar-bcc"),

  getSystemInfo: () => ipcRenderer.invoke("system-info"),

  resizeSidebar: (state) => {
    const safe = ALLOWED_SIDEBAR_STATES.has(state) ? state : "expanded";
    ipcRenderer.send("resize-sidebar", safe);
  },

  onLoadFinished: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("load-finished", (_, sistema) => callback(sistema));
  },
  onUpdateIP: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("update-ip", (_, ip) => callback(ip));
  },
  onConnectivityChange: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("connectivity-change", (_, isOnline) => callback(!!isOnline));
  },
  onContentLoadFailed: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("content-load-failed", () => callback());
  },
  requestConnectivityCheck: () => ipcRenderer.send("connectivity-request-initial"),
  onUpdateReady: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("update-ready", () => callback());
  },
  onUpdateInstalling: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("update-installing", () => callback());
  },
  applyUpdateNow: () => ipcRenderer.invoke("apply-update-now"),
  getUpdateDownloadedPending: () => ipcRenderer.invoke("update-downloaded-pending"),

  contentViewNavigateUrl: (url) => ipcRenderer.invoke("content-view-navigate-url", sanitizeString(url, 4096)),
  setContentEmbedTopInset: (px) => ipcRenderer.invoke("content-embed-set-top-inset", typeof px === "number" ? px : 0),
  getDownloadsSnapshot: () => ipcRenderer.invoke("downloads-snapshot"),
  getDownloadsPanelSnapshot: () => ipcRenderer.invoke("downloads-panel-snapshot"),
  getUnviewedDownloadsCount: () => ipcRenderer.invoke("downloads-unviewed-count"),
  markDownloadsPanelViewed: () => ipcRenderer.invoke("downloads-mark-panel-viewed"),
  showDownloadInFolder: (filePath) =>
    typeof filePath === "string"
      ? ipcRenderer.invoke("show-download-in-folder", filePath.slice(0, 4096))
      : false,
  openDownloadPdf: (filePath) =>
    typeof filePath === "string"
      ? ipcRenderer.invoke("open-download-pdf", filePath.slice(0, 4096))
      : Promise.resolve(false),
  openDownloadsFolder: () => ipcRenderer.invoke("open-downloads-folder"),
  onDownloadProgress: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("download-progress", (_, payload) => callback(payload));
  },
  onDownloadStarted: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("download-started", (_, payload) => callback(payload));
  },
  onDownloadFinished: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("download-finished", (_, payload) => callback(payload));
  },
});
