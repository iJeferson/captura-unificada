"use strict";

/**
 * @fileoverview Constantes e seletores da UI (Renderer)
 * @module config/constants
 */

/** IDs dos elementos do DOM */
export const ELEMENT_IDS = Object.freeze({
  CAPTURA: "captura",
  SMART: "smart",
  S4IPM: "s4ipm",
  DOC_AVULSOS: "doc-avulsos",
  VALIDACAO: "validacao",
  PONTO_VALID: "ponto-valid",
  PONTO_RENOVA: "ponto-renova",
  ATENDE: "atende",
  ATENDE_MODAL: "atende-modal",
  ATENDE_INPUT: "atende-input",
  ATENDE_SAVE: "atende-save",
  ATENDE_CANCEL: "atende-cancel",
  ATENDE_CONFIG_BTN: "atende-config-btn",
  SIDEBAR: "sidebar",
  SIDEBAR_WRAPPER: "sidebar-wrapper",
  TOGGLE_SIDEBAR: "toggle-sidebar",
  TOGGLE_ICON: "toggle-icon",
  LOADING: "loading",
  CONTENT_LOADING_BAR: "content-loading-bar",
  PLACEHOLDER: "placeholder",
  PLACEHOLDER_CONTAINER: "placeholder-container",
  PLACEHOLDER_OFFLINE_MSG: "placeholder-offline-msg",
  OFFLINE_BANNER: "offline-banner",
  UPDATE_INDICATOR: "update-indicator",
  UPDATE_MODAL: "update-modal",
  UPDATE_CONFIRM: "update-confirm",
  UPDATE_LATER: "update-later",
  APP_VERSION: "app-version",
  HOSTNAME: "hostname",
  IP: "ip",
  ANYDESK: "anydesk",
  THEME_TOGGLE: "theme-toggle",
  SIDEBAR_DOWNLOADS_ENTRY: "sidebar-downloads-entry",
  CHROME_DOWNLOAD_BTN: "content-downloads-btn",
  CHROME_DOWNLOADS_PANEL: "content-downloads-panel",
  CHROME_DOWNLOADS_LIST: "content-downloads-list",
  CHROME_DOWNLOADS_EMPTY: "content-downloads-empty",
  CHROME_DOWNLOADS_OPEN_FOLDER: "content-downloads-open-folder",
  CHROME_DOWNLOAD_BADGE: "downloads-toolbar-badge",
});

/** Topo reservado acima do WebContentsView (0 = página integrada em tela cheia na área de conteúdo). */
export const EMBED_CONTENT_TOP_PX = 0;

/** Classes CSS utilizadas */
export const CSS_CLASSES = Object.freeze({
  ACTIVE: "active",
  HIDDEN: "hidden",
  SHOW: "show",
  COLLAPSED: "collapsed",
  DARK_THEME: "dark-theme",
  LIGHT_THEME: "light-theme",
  MENU_BTN: "menu-btn",
  DOTS: "dots",
  DROPDOWN: "dropdown",
  BTN_RELOAD: "btn-reload",
  BTN_CACHE: "btn-cache",
  BTN_ATENDE_CONFIG: "btn-atende-config",
  /** Estado visual: janela do Atende está aberta (cor diferente + ícone) */
  ATENDE_WINDOW_OPEN: "atende-window-open",
  /** Menu de sistemas bloqueado durante carregamento (troca/reload/cache) */
  MENU_BLOCKED: "menu--blocked",
});

/** Nomes dos sistemas para exibição no loading */
export const SISTEMAS = Object.freeze({
  CAPTURA: "CapturaWeb",
  SMART: "SMART (CIN)",
  S4IPM: "S4IPM",
  DOC_AVULSOS: "Doc Avulso (Antigo)",
  VALIDACAO: "Validação",
  PONTO_VALID: "Ponto Valid",
  PONTO_RENOVA: "Ponto Renova",
  ATENDE: "Atende",
  ATUALIZACAO: "Atualização",
  CACHE: "Limpeza de Cache",
});

/** Textos do tema */
export const TEMA = Object.freeze({
  ESCURO: "Modo Escuro",
  CLARO: "Modo Claro",
});
