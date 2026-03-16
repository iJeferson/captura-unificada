"use strict";

/**
 * @fileoverview Controller - Camada de controle e coordenação (MVC)
 * @module core/controller
 *
 * Trata eventos do usuário, coordena Model e View e comunica com o Main Process via IPC.
 */

import Model from "./model.js";
import View from "./view.js";
import { ELEMENT_IDS, CSS_CLASSES, SISTEMAS } from "../config/constants.js";

/** Mapa sistemaId → { abrir: () => Promise<void>, nome: string } para fluxo único de abertura */
const SISTEMAS_ABERTURA = Object.freeze({
  "captura": { abrir: () => window.api.abrirCaptura(), nome: SISTEMAS.CAPTURA },
  "smart": { abrir: () => window.api.abrirSmart(), nome: SISTEMAS.SMART },
  "s4ipm": { abrir: () => window.api.abrirS4ipm(), nome: SISTEMAS.S4IPM },
  "doc-avulsos": { abrir: () => window.api.abrirDocAvulsos(), nome: SISTEMAS.DOC_AVULSOS },
  "validacao": { abrir: () => window.api.abrirValidacao(), nome: SISTEMAS.VALIDACAO },
  "ponto-valid": { abrir: () => window.api.abrirPontoValid(), nome: SISTEMAS.PONTO_VALID },
  "ponto-renova": { abrir: () => window.api.abrirPontoRenova(), nome: SISTEMAS.PONTO_RENOVA },
});

const Controller = {
  /**
   * Inicializa o Controller: registra handlers, carrega dados e listeners IPC.
   */
  init() {
    this.registrarHandlers();
    View.aplicarTema(Model.getTemaEscuro());
    this.aplicarTemaSalvo();
    this.carregarInfoSistema();
    this.registrarListenersIPC();
    this.sincronizarEstadoAtendeWindow();
    this.registrarListenersOffline();
  },

  /**
   * Carrega o tema salvo em captura-unificada-atende.json e aplica como tema ativo.
   */
  async aplicarTemaSalvo() {
    try {
      const cfg = await window.api.getAtendeConfig();
      if (cfg?.theme) {
        const isDark = cfg.theme === "dark";
        Model.setTemaEscuro(isDark);
        View.aplicarTema(isDark);
      }
    } catch (_) {}
  },

  /**
   * Registra listeners de conectividade e exibe aviso quando offline.
   * O estado vem do Main Process (verificação real com request HTTP a cada 5s).
   * O mesmo estado é usado para bloquear abertura de sistemas quando offline.
   */
  registrarListenersOffline() {
    const atualizar = (isOnline) => {
      Model.setConectado(isOnline);
      View.mostrarOfflineBanner(!isOnline);
    };
    window.api.onConnectivityChange(atualizar);
    atualizar(navigator.onLine); /* estado inicial até o main enviar o primeiro resultado */
    window.api.requestConnectivityCheck(); /* pede verificação imediata para não ficar em branco ao abrir sem internet */
  },

  /**
   * Registra todos os event listeners dos elementos da UI.
   */
  registrarHandlers() {
    document.getElementById(ELEMENT_IDS.CAPTURA)?.addEventListener("click", (e) => this.onCapturaClick(e));
    document.getElementById(ELEMENT_IDS.SMART)?.addEventListener("click", (e) => this.onSmartClick(e));
    document.getElementById(ELEMENT_IDS.S4IPM)?.addEventListener("click", (e) => this.onS4ipmClick(e));
    document.getElementById(ELEMENT_IDS.DOC_AVULSOS)?.addEventListener("click", (e) => this.onDocAvulsosClick(e));
    document.getElementById(ELEMENT_IDS.VALIDACAO)?.addEventListener("click", (e) => this.onValidacaoClick(e));
    document.getElementById(ELEMENT_IDS.PONTO_VALID)?.addEventListener("click", (e) => this.onPontoValidClick(e));
    document.getElementById(ELEMENT_IDS.PONTO_RENOVA)?.addEventListener("click", (e) => this.onPontoRenovaClick(e));
    document.getElementById(ELEMENT_IDS.ATENDE)?.addEventListener("click", (e) => this.onAtendeClick(e));

    document.getElementById(ELEMENT_IDS.ATENDE_CONFIG_BTN)?.addEventListener("click", (e) => this.onAtendeConfigClick(e));
    document.getElementById(ELEMENT_IDS.ATENDE_SAVE)?.addEventListener("click", () => this.onAtendeModalSave());
    document.getElementById(ELEMENT_IDS.ATENDE_CANCEL)?.addEventListener("click", () => this.onAtendeModalCancel());
    document.getElementById(ELEMENT_IDS.ATENDE_MODAL)?.addEventListener("click", (e) => {
      if (e.target.id === ELEMENT_IDS.ATENDE_MODAL) this.onAtendeModalCancel();
    });
    document.getElementById(ELEMENT_IDS.ATENDE_INPUT)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.onAtendeModalSave();
    });

    document.getElementById(ELEMENT_IDS.TOGGLE_SIDEBAR)?.addEventListener("click", () => this.onToggleSidebar());
    document.getElementById(ELEMENT_IDS.UPDATE_INDICATOR)?.addEventListener("click", () => this.onUpdateClick());

    document.querySelectorAll(`.${CSS_CLASSES.DOTS}`).forEach((dot) => {
      dot.addEventListener("click", (e) => this.onDotClick(e));
    });
    document.addEventListener("click", () => this.onDocumentClick());

    document.querySelectorAll(`.${CSS_CLASSES.BTN_RELOAD}`).forEach((btn) => {
      btn.addEventListener("click", (e) => this.onReloadClick(e));
    });
    document.querySelectorAll(`.${CSS_CLASSES.BTN_CACHE}`).forEach((btn) => {
      btn.addEventListener("click", () => this.onCacheClick());
    });
    document.querySelectorAll(".btn-action[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => this.onActionClick(e));
    });

    document.getElementById(ELEMENT_IDS.THEME_TOGGLE)?.addEventListener("change", (e) => this.onThemeToggle(e));
  },

  /**
   * Registra listeners para eventos IPC do Main Process.
   */
  async sincronizarEstadoAtendeWindow() {
    try {
      const aberta = await window.api.isAtendeWindowOpen();
      View.setAtendeWindowOpen(!!aberta);
    } catch (_) {}
  },

  registrarListenersIPC() {
    window.api.onLoadFinished((sistema) => {
      Model.setCarregando(false);
      View.mostrarLoading(false);
      if (sistema && sistema !== "atende") {
        Model.setSistemaAtivo(sistema);
        View.setMenuAtivoPorId(sistema);
      }
    });

    window.api.onContentLoadingState((loading) => {
      View.mostrarCarregamentoPagina(loading);
    });

    window.api.onAtendeWindowOpened(() => {
      View.setAtendeWindowOpen(true);
    });

    window.api.onAtendeWindowClosed(() => {
      View.setAtendeWindowOpen(false);
    });

    window.api.onUpdateReady(() => {
      Model.setAtualizacaoPronta(true);
      View.mostrarBadgeAtualizacao(true);
    });

    window.api.onUpdateIP((novoIp) => {
      Model.setInfoSistema({ ip: novoIp });
      View.atualizarIP(novoIp);
    });

    window.api.onContentLoadFailed(() => {
      Model.setConectado(false);
      Model.setCarregando(false);
      View.mostrarLoading(false);
      View.mostrarOfflineBanner(true);
      View.mostrarPlaceholderComOffline();
    });
  },

  /**
   * Carrega as informações do sistema via IPC e atualiza a View.
   */
  async carregarInfoSistema() {
    const info = await window.api.getSystemInfo();
    Model.setInfoSistema(info);
    View.atualizarInfoSistema(Model.getInfoSistema());
  },

  /**
   * Verifica se uma operação está em andamento (bloqueia ações).
   * @returns {boolean}
   */
  bloquearSeCarregando() {
    return Model.getCarregando();
  },

  /* ========== HANDLERS DE EVENTOS ========== */

  /**
   * Abre um sistema da barra lateral (fluxo único: offline check, loading, IPC).
   * Captura: sempre executa o fluxo BCC (mesmo se já ativo), para garantir consistência.
   * @param {string} sistemaId - "captura" | "smart" | "doc-avulsos" | "validacao" | "ponto-valid" | "ponto-renova"
   * @param {Event} e - evento de clique (currentTarget = botão do menu)
   */
  async abrirSistema(sistemaId, e) {
    const jaAtivo = e.currentTarget.classList.contains(CSS_CLASSES.ACTIVE);
    if (this.bloquearSeCarregando() || (jaAtivo && sistemaId !== "captura")) return;
    if (!Model.getConectado()) {
      View.mostrarPlaceholderComOffline();
      return;
    }

    const item = SISTEMAS_ABERTURA[sistemaId];
    if (!item) return;

    Model.setSistemaAtivo(sistemaId);
    Model.setCarregando(true);
    View.setMenuAtivo(e.currentTarget);
    View.mostrarLoading(true, item.nome);

    await item.abrir();
  },

  onCapturaClick(e) { return this.abrirSistema("captura", e); },
  onSmartClick(e) { return this.abrirSistema("smart", e); },
  onS4ipmClick(e) { return this.abrirSistema("s4ipm", e); },
  onDocAvulsosClick(e) { return this.abrirSistema("doc-avulsos", e); },
  onValidacaoClick(e) { return this.abrirSistema("validacao", e); },
  onPontoValidClick(e) { return this.abrirSistema("ponto-valid", e); },
  onPontoRenovaClick(e) { return this.onPontoRenovaClickHandler(e); },

  /**
   * Handler: clique no botão Ponto Renova.
   * Abre no navegador (Chrome) — funciona; API retorna 403 no Electron.
   */
  async onPontoRenovaClickHandler(e) {
    if (this.bloquearSeCarregando()) return;
    if (!Model.getConectado()) {
      View.mostrarPlaceholderComOffline();
      return;
    }
    e.stopPropagation();
    await window.api.abrirPontoRenovaNoNavegador();
  },

  /**
   * Handler: clique no botão Atende.
   * Se IP não configurado, exibe modal para configurar.
   */
  async onAtendeClick(e) {
    if (this.bloquearSeCarregando()) return;
    if (!Model.getConectado()) {
      View.mostrarPlaceholderComOffline();
      return;
    }

    const result = await window.api.abrirAtende();

    if (result?.needsConfig) {
      View.fecharDropdowns();
      View.mostrarModalAtendeConfig("");
      return;
    }

    /* Atende abre em janela separada; estado "janela aberta" vem via onAtendeWindowOpened */
  },

  /**
   * Handler: clique em "Configurar endereço" no dropdown do Atende.
   */
  async onAtendeConfigClick(e) {
    if (this.bloquearSeCarregando()) return;

    e.stopPropagation();
    View.fecharDropdowns();

    const config = await window.api.getAtendeConfig();
    View.mostrarModalAtendeConfig(config?.ip || "");
  },

  /**
   * Handler: clique em "Salvar e Abrir" no modal do Atende.
   */
  async onAtendeModalSave() {
    const ip = View.getValorInputAtende();
    if (!ip) return;

    const ok = await window.api.setAtendeConfig(ip);
    if (!ok) return;

    View.fecharModalAtendeConfig();

    await window.api.abrirAtende();
    /* Janela do Atende abre; estado vem via onAtendeWindowOpened */
  },

  /**
   * Handler: clique em "Cancelar" no modal do Atende.
   */
  onAtendeModalCancel() {
    View.fecharModalAtendeConfig();
  },

  /**
   * Handler: clique no botão de colapsar/expandir sidebar.
   */
  onToggleSidebar() {
    if (this.bloquearSeCarregando()) return;

    const isCollapsed = View.toggleSidebar();
    Model.setSidebarColapsada(isCollapsed);
    window.api.resizeSidebar(isCollapsed ? "collapsed" : "expanded");
  },

  /**
   * Handler: clique no badge de atualização pronta.
   */
  async onUpdateClick() {
    if (this.bloquearSeCarregando()) return;

    Model.setCarregando(true);
    View.mostrarLoading(true, SISTEMAS.ATUALIZACAO);
    await window.api.applyUpdateNow();
  },

  /**
   * Handler: clique no ícone de mais opções para abrir dropdown.
   */
  onDotClick(e) {
    if (this.bloquearSeCarregando()) return;

    e.stopPropagation();
    const menuId = e.currentTarget.dataset.menu;
    View.fecharDropdowns(menuId);
    View.toggleDropdown(menuId);
  },

  /**
   * Handler: clique em qualquer lugar do documento (fecha dropdowns).
   */
  onDocumentClick() {
    View.fecharDropdowns();
  },

  /**
   * Handler: clique em "Reiniciar página".
   * Se for o botão do dropdown do Atende, recarrega a janela do Atende.
   */
  onReloadClick(e) {
    if (this.bloquearSeCarregando()) return;

    const target = e.target?.closest?.("[data-reload-target]")?.dataset?.reloadTarget;
    if (target === "atende") {
      window.api.reloadAtendeWindow();
      return;
    }
    if (target === "ponto-renova") {
      window.api.reloadPontoRenovaWindow();
      return;
    }

    const activeBtn = document.querySelector(`.${CSS_CLASSES.MENU_BTN}.${CSS_CLASSES.ACTIVE} span`)?.innerText.trim() || "Sistema";
    Model.setCarregando(true);
    View.mostrarLoading(true, activeBtn);
    window.api.reloadPage();
  },

  /**
   * Handler: clique em "Limpar cache".
   * Não afeta o Atende. Se data-cache-target=ponto-renova, limpa só a janela do Ponto Renova.
   */
  async onCacheClick(e) {
    if (this.bloquearSeCarregando()) return;

    const target = e.target?.closest?.("[data-cache-target]")?.dataset?.cacheTarget;
    Model.setCarregando(true);
    View.mostrarLoading(true, SISTEMAS.CACHE);
    if (target === "ponto-renova") {
      await window.api.clearPontoRenovaCache();
    } else {
      await window.api.clearCache();
    }
    Model.setCarregando(false);
    View.mostrarLoading(false);
  },

  /**
   * Handler: clique em botões de ação do menu (Reiniciar Validação, Reiniciar Serviço de Hardware, Reiniciar BCC).
   */
  async onActionClick(e) {
    if (this.bloquearSeCarregando()) return;

    const btn = e.target?.closest?.(".btn-action[data-action]");
    const action = btn?.dataset?.action;
    if (!action) return;

    const actions = {
      "reiniciar-validacao": () => window.api.reiniciarValidacao(),
      "reiniciar-servico-hardware": () => window.api.reiniciarServicoHardware(),
      "reiniciar-bcc": () => window.api.reiniciarBCC(),
      "abrir-ponto-renova-navegador": () => window.api.abrirPontoRenovaNoNavegador(),
      "abrir-ponto-renova-janela": () => window.api.abrirPontoRenova(),
    };
    const fn = actions[action];
    if (fn) await fn();
  },

  /**
   * Handler: alteração do interruptor de tema (checkbox).
   */
  onThemeToggle(e) {
    if (this.bloquearSeCarregando()) return;

    const checkbox = e?.target;
    const isDark = checkbox ? checkbox.checked : Model.getTemaEscuro();
    Model.setTemaEscuro(isDark);
    View.aplicarTema(isDark);
    window.api.setTheme(isDark ? "dark" : "light");
  },
};

export default Controller;
