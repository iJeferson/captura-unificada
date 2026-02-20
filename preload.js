const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  abrirCaptura: () => ipcRenderer.invoke("captura"),
  abrirSmart: () => ipcRenderer.invoke("smart"),
  reloadPage: () => ipcRenderer.invoke("reload-page"),
  clearCache: () => ipcRenderer.invoke("clear-cache"),
  getSystemInfo: () => ipcRenderer.invoke("system-info"),
  resizeSidebar: (width) => ipcRenderer.send("resize-sidebar", width),
  onLoadFinished: (callback) => ipcRenderer.on("load-finished", () => callback()),
  onUpdateIP: (callback) => ipcRenderer.on("update-ip", (_, ip) => callback(ip)),
  onUpdateAvailable: (callback) => ipcRenderer.on("update-available", (_, version) => callback(version)),
  onUpdateProgress: (callback) => ipcRenderer.on("update-progress", (_, percent) => callback(percent)),
  onUpdateFinished: (callback) => ipcRenderer.on("update-finished", () => callback()),
  startUpdateDownload: () => ipcRenderer.invoke("start-update-download"),
  applyUpdateNow: () => ipcRenderer.invoke("apply-update-now")
});