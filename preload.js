const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  abrirCaptura: () => ipcRenderer.invoke("captura"),
  abrirSmart: () => ipcRenderer.invoke("smart"),
  reloadPage: () => ipcRenderer.invoke("reload-page"),
  clearCache: () => ipcRenderer.invoke("clear-cache"),
  getSystemInfo: () => ipcRenderer.invoke("system-info"),
  resizeSidebar: (width) => ipcRenderer.send("resize-sidebar", width),
  onLoadFinished: (callback) => ipcRenderer.on("load-finished", () => callback()),
  onUpdateIP: (callback) => ipcRenderer.on("update-ip", (_, ip) => callback(ip))
});