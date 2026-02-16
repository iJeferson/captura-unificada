const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  abrirCaptura: () => ipcRenderer.invoke("captura"),
  abrirSmart: () => ipcRenderer.invoke("smart"),
  reloadPage: () => ipcRenderer.invoke("reload-page"),
  clearCache: () => ipcRenderer.invoke("clear-cache"),
  getSystemInfo: () => ipcRenderer.invoke("system-info"),
  onBioStatus: (callback) => ipcRenderer.on("bio-status", (_, status) => callback(status)),
  onLoadFinished: (callback) => ipcRenderer.on("load-finished", () => callback())
});