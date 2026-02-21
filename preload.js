/**
 * @fileoverview Context Bridge - API segura entre Main e Renderer Process
 * @module preload
 *
 * Responsabilidade: Expor funções do Main Process ao Renderer via contextBridge,
 * garantindo isolamento de contexto e segurança (contextIsolation).
 *
 * O Renderer acessa tudo através de window.api.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  /**
   * Abre o sistema CapturaWeb.
   * Configura hardware Suprema e carrega a URL.
   * @returns {Promise<void>}
   */
  abrirCaptura: () => ipcRenderer.invoke("captura"),

  /**
   * Abre o sistema SMART (CIN).
   * Configura hardware Griaule BCC e carrega a URL.
   * @returns {Promise<void>}
   */
  abrirSmart: () => ipcRenderer.invoke("smart"),

  /**
   * Abre Doc Avulsos.
   * @returns {Promise<void>}
   */
  abrirDocAvulsos: () => ipcRenderer.invoke("doc-avulsos"),

  /**
   * Abre Validação.
   * @returns {Promise<void>}
   */
  abrirValidacao: () => ipcRenderer.invoke("validacao"),

  /**
   * Abre Ponto Valid.
   * @returns {Promise<void>}
   */
  abrirPontoValid: () => ipcRenderer.invoke("ponto-valid"),

  /**
   * Abre Ponto Renova.
   * @returns {Promise<void>}
   */
  abrirPontoRenova: () => ipcRenderer.invoke("ponto-renova"),

  /**
   * Abre Atende (URL do arquivo no Desktop).
   * @returns {Promise<{needsConfig: boolean}>} needsConfig=true se IP não configurado
   */
  abrirAtende: () => ipcRenderer.invoke("atende"),

  /**
   * Obtém a config do Atende (IP salvo no Desktop).
   * @returns {Promise<{ip: string}|null>}
   */
  getAtendeConfig: () => ipcRenderer.invoke("atende-get-config"),

  /**
   * Salva o IP do Atende no arquivo no Desktop.
   * @param {string} ip
   * @returns {Promise<boolean>}
   */
  setAtendeConfig: (ip) => ipcRenderer.invoke("atende-set-config", ip),

  /**
   * Oculta/mostra o contentView para permitir interação com o modal do Atende.
   * @param {boolean} ocultar - true = ocultar (modal aberto), false = mostrar (modal fechado)
   */
  setAtendeModalVisible: (ocultar) => ipcRenderer.send("atende-modal-visible", ocultar),

  /**
   * Recarrega a página atual do contentView.
   * @returns {Promise<void>}
   */
  reloadPage: () => ipcRenderer.invoke("reload-page"),

  /**
   * Recarrega a janela do Atende (quando está aberta em janela separada).
   */
  reloadAtendeWindow: () => ipcRenderer.invoke("reload-atende-window"),

  /**
   * Registra callback quando a janela do Atende é aberta.
   */
  onAtendeWindowOpened: (callback) => ipcRenderer.on("atende-window-opened", () => callback()),

  /**
   * Registra callback quando a janela do Atende é fechada.
   */
  onAtendeWindowClosed: (callback) => ipcRenderer.on("atende-window-closed", () => callback()),

  /**
   * Retorna se a janela do Atende está aberta (para sincronizar estado na abertura do app).
   * @returns {Promise<boolean>}
   */
  isAtendeWindowOpen: () => ipcRenderer.invoke("atende-window-open-state"),

  /**
   * Limpa o cache/storage da sessão persist:captura.
   * @returns {Promise<boolean>} true se sucesso
   */
  clearCache: () => ipcRenderer.invoke("clear-cache"),

  /**
   * Obtém informações do sistema (hostname, IP, AnyDesk, versão).
   * @returns {Promise<{hostname: string, ip: string, anydesk: string, version: string}>}
   */
  getSystemInfo: () => ipcRenderer.invoke("system-info"),

  /**
   * Notifica o Main Process para redimensionar a sidebar.
   * @param {number} width - Largura em pixels (32 colapsada, 220 expandida)
   */
  resizeSidebar: (width) => ipcRenderer.send("resize-sidebar", width),

  /**
   * Registra callback quando a página termina de carregar.
   * Recebe o sistema que carregou para garantir estado ativo correto.
   * @param {Function} callback - Recebe (sistema: string)
   */
  onLoadFinished: (callback) => ipcRenderer.on("load-finished", (_, sistema) => callback(sistema)),

  /**
   * Registra callback quando o IP do sistema muda.
   * @param {Function} callback - Recebe (novoIp: string)
   */
  onUpdateIP: (callback) => ipcRenderer.on("update-ip", (_, ip) => callback(ip)),

  /**
   * Registra callback quando uma atualização foi baixada e está pronta.
   * Usado para exibir o badge "ATUALIZAÇÃO PRONTA".
   * @param {Function} callback - Função chamada sem argumentos
   */
  onUpdateReady: (callback) => {
    ipcRenderer.on("update-ready", () => callback());
  },

  /**
   * Reinicia o app e aplica a atualização baixada.
   * @returns {Promise<void>}
   */
  applyUpdateNow: () => ipcRenderer.invoke("apply-update-now"),
});
