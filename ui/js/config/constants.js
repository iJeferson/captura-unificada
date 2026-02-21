/**
 * @fileoverview Constantes e seletores da UI (Renderer)
 * @module config/constants
 *
 * Responsabilidade: Centralizar IDs, classes e textos
 * usados na camada View e Controller.
 */

/** IDs dos elementos do DOM */
export const ELEMENT_IDS = {
  CAPTURA: "captura",
  SMART: "smart",
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
  UPDATE_INDICATOR: "update-indicator",
  APP_VERSION: "app-version",
  HOSTNAME: "hostname",
  IP: "ip",
  ANYDESK: "anydesk",
  THEME_TOGGLE: "theme-toggle",
  THEME_ICON: "theme-icon",
  THEME_TEXT: "theme-text",
};

/** Classes CSS utilizadas */
export const CSS_CLASSES = {
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
};

/** Nomes dos sistemas para exibição no loading */
export const SISTEMAS = {
  CAPTURA: "CapturaWeb",
  SMART: "SMART (CIN)",
  DOC_AVULSOS: "Doc Avulso (Antigo)",
  VALIDACAO: "Validação",
  PONTO_VALID: "Ponto Valid",
  PONTO_RENOVA: "Ponto Renova",
  ATENDE: "Atende",
  ATUALIZACAO: "Atualização",
  CACHE: "Limpeza de Cache",
};

/** Textos do tema */
export const TEMA = {
  ESCURO: "Modo Escuro",
  CLARO: "Modo Claro",
};
