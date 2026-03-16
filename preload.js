"use strict";

/**
 * @fileoverview Context Bridge - API segura Main ↔ Renderer (contextIsolation).
 * Todas as operações invocadas aqui são executadas no Main Process sem exigir administrador.
 * @module preload
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
   * Abre S4IPM.
   * @returns {Promise<void>}
   */
  abrirS4ipm: () => ipcRenderer.invoke("s4ipm"),

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
   * Abre Ponto Renova no navegador padrão do sistema (Chrome, etc.).
   * @returns {Promise<void>}
   */
  abrirPontoRenovaNoNavegador: () => ipcRenderer.invoke("ponto-renova-abrir-navegador"),

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
   * Salva o IP/URL do Atende (grava com http:// se o usuário digitar só IP).
   * @param {string} ip
   * @returns {Promise<boolean>}
   */
  setAtendeConfig: (ip) => ipcRenderer.invoke("atende-set-config", ip),

  /**
   * Salva o tema (dark/light) em captura-unificada-atende.json.
   * @param {"dark"|"light"} theme
   * @returns {Promise<boolean>}
   */
  setTheme: (theme) => ipcRenderer.invoke("atende-set-theme", theme),

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
   * Recarrega a janela do Ponto Renova.
   */
  reloadPontoRenovaWindow: () => ipcRenderer.invoke("reload-ponto-renova-window"),

  /**
   * Registra callback quando o carregamento da página (URL) dentro do launcher inicia ou termina.
   * @param {Function} callback - Recebe (loading: boolean) true = carregando, false = terminou
   */
  onContentLoadingState: (callback) => ipcRenderer.on("content-loading-state", (_, loading) => callback(loading)),

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
   * Limpa o cache da sessão do Ponto Renova (persist:ponto-renova).
   * @returns {Promise<boolean>}
   */
  clearPontoRenovaCache: () => ipcRenderer.invoke("clear-ponto-renova-cache"),

  /**
   * Reiniciar Validação: mata CapturaWeb.exe (externo) e abre novamente.
   * Se a view ativa for Validação, a página é recarregada.
   */
  reiniciarValidacao: () => ipcRenderer.invoke("reiniciar-validacao"),

  /**
   * Reinicia o serviço de hardware Valid (CapturaWeb).
   */
  reiniciarServicoHardware: () => ipcRenderer.invoke("reiniciar-servico-hardware"),

  /**
   * Reinicia o BCC: mata BCC.exe e inicia novamente (SMART CIN).
   */
  reiniciarBCC: () => ipcRenderer.invoke("reiniciar-bcc"),

  /**
   * Obtém informações do sistema (hostname, IP, AnyDesk, versão).
   * @returns {Promise<{hostname: string, ip: string, anydesk: string, version: string}>}
   */
  getSystemInfo: () => ipcRenderer.invoke("system-info"),

  /**
   * Notifica o Main Process para redimensionar a sidebar.
   * @param {"collapsed"|"expanded"} state - Estado da sidebar (usa valores de app.config)
   */
  resizeSidebar: (state) => ipcRenderer.send("resize-sidebar", state),

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
   * Registra callback quando a conectividade muda (verificação feita no Main Process).
   * @param {Function} callback - Recebe (isOnline: boolean)
   */
  onConnectivityChange: (callback) => ipcRenderer.on("connectivity-change", (_, isOnline) => callback(isOnline)),

  /**
   * Registra callback quando o carregamento da URL no contentView falhou (rede, timeout).
   * Usado para mostrar aviso offline em vez de tela em branco.
   */
  onContentLoadFailed: (callback) => ipcRenderer.on("content-load-failed", () => callback()),

  /**
   * Pede ao Main Process que envie o estado de conectividade agora (evita tela em branco ao abrir sem internet).
   */
  requestConnectivityCheck: () => ipcRenderer.send("connectivity-request-initial"),

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
