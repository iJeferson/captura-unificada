"use strict";

/**
 * @fileoverview Controller - Camada de controle e coordenação (MVC)
 * @module core/controller
 *
 * Trata eventos do usuário, coordena Model e View e comunica com o Main Process via IPC.
 */

import Model from "./model.js";
import View from "./view.js";
import { ELEMENT_IDS, CSS_CLASSES, SISTEMAS, EMBED_CONTENT_TOP_PX } from "../config/constants.js";

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
    void this.sincronizarUpdatePendente();
    void this.atualizarBadgeDownloads();
    void this.sincronizarInsetEmbutido();
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
    window.addEventListener("online", () => window.api.requestConnectivityCheck());
    atualizar(navigator.onLine);
    window.api.requestConnectivityCheck();
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
    document.getElementById(ELEMENT_IDS.SIDEBAR)?.addEventListener(
      "click",
      (e) => {
        const t = e.target.closest("#" + ELEMENT_IDS.UPDATE_INDICATOR);
        if (!t || t.classList.contains(CSS_CLASSES.HIDDEN)) return;
        e.preventDefault();
        e.stopPropagation();
        this.onUpdateClick();
      },
      true
    );
    document.getElementById(ELEMENT_IDS.UPDATE_CONFIRM)?.addEventListener("click", () => this.onUpdateConfirm());
    document.getElementById(ELEMENT_IDS.UPDATE_LATER)?.addEventListener("click", () => this.onUpdateLater());
    document.getElementById(ELEMENT_IDS.UPDATE_MODAL)?.addEventListener("click", (e) => {
      if (e.target.id === ELEMENT_IDS.UPDATE_MODAL) this.onUpdateLater();
    });

    document.querySelectorAll(`.${CSS_CLASSES.DOTS}`).forEach((dot) => {
      dot.addEventListener("click", (e) => this.onDotClick(e));
    });
    document.addEventListener("click", (e) => this.onDocumentClick(e));

    document.querySelectorAll(`.${CSS_CLASSES.BTN_RELOAD}`).forEach((btn) => {
      btn.addEventListener("click", (e) => this.onReloadClick(e));
    });
    document.querySelectorAll(`.${CSS_CLASSES.BTN_CACHE}`).forEach((btn) => {
      btn.addEventListener("click", (e) => this.onCacheClick(e));
    });
    document.querySelectorAll(".btn-action[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => this.onActionClick(e));
    });

    document.getElementById(ELEMENT_IDS.THEME_TOGGLE)?.addEventListener("change", (e) => this.onThemeToggle(e));

    document.getElementById(ELEMENT_IDS.CHROME_DOWNLOAD_BTN)?.addEventListener("click", (e) => {
      void this.onChromeDownloadsBtnClick(e);
    });
    document.getElementById(ELEMENT_IDS.CHROME_DOWNLOADS_OPEN_FOLDER)?.addEventListener("click", () => {
      void window.api.openDownloadsFolder();
    });
    document.getElementById(ELEMENT_IDS.CHROME_DOWNLOADS_LIST)?.addEventListener("click", (e) => {
      this.onChromeDownloadsListClick(e);
    });
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

  async sincronizarUpdatePendente() {
    try {
      const pendente = await window.api.getUpdateDownloadedPending();
      if (pendente) {
        Model.setAtualizacaoPronta(true);
        View.mostrarBadgeAtualizacao(true);
      }
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
      const embedded = sistema && sistema !== "atende" && sistema !== "ponto-renova";
      if (!embedded) {
        View.setChromeDownloadsPopoverOpen(false);
        void window.api.markDownloadsPanelViewed();
        void this.atualizarBadgeDownloads();
        void window.api.setContentEmbedTopInset(EMBED_CONTENT_TOP_PX);
      } else {
        void this.sincronizarInsetEmbutido();
      }
    });

    window.api.onContentLoadingState((loading) => {
      View.mostrarCarregamentoPagina(loading);
    });

    window.api.onAtendeWindowOpened(() => {
      View.setAtendeWindowOpen(true);
      View.setChromeDownloadsPopoverOpen(false);
      void window.api.markDownloadsPanelViewed();
      void this.atualizarBadgeDownloads();
      void window.api.setContentEmbedTopInset(EMBED_CONTENT_TOP_PX);
    });

    window.api.onAtendeWindowClosed(() => {
      View.setAtendeWindowOpen(false);
      const id = Model.getSistemaAtivo();
      const embedded = id && id !== "atende" && id !== "ponto-renova";
      if (embedded) {
        void this.sincronizarInsetEmbutido();
      }
    });

    window.api.onUpdateReady(() => {
      Model.setAtualizacaoPronta(true);
      View.mostrarBadgeAtualizacao(true);
    });

    window.api.onUpdateInstalling(() => {
      Model.setCarregando(true);
      View.mostrarLoading(true, "Atualizando");
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
      View.setChromeDownloadsPopoverOpen(false);
      void window.api.markDownloadsPanelViewed();
      void this.atualizarBadgeDownloads();
      void window.api.setContentEmbedTopInset(EMBED_CONTENT_TOP_PX);
    });

    window.api.onDownloadProgress(() => {
      void this.refrescarPopoverDownloadsSeAberto();
    });

    window.api.onDownloadStarted(() => {
      void this.refrescarPopoverDownloadsSeAberto();
    });

    window.api.onDownloadFinished(() => {
      void this.atualizarBadgeDownloads();
      void this.refrescarPopoverDownloadsSeAberto();
    });
  },

  /**
   * Mede a barra HTML (navegação + painel de downloads) e informa ao main o recorte do WebContentsView.
   */
  sincronizarInsetEmbutido() {
    const main = document.querySelector("main.content");
    const h = EMBED_CONTENT_TOP_PX;
    if (main) main.style.setProperty("--content-embed-top", `${h}px`);
    void window.api.setContentEmbedTopInset(h);
  },

  /**
   * Carrega as informações do sistema via IPC e atualiza a View.
   */
  async carregarInfoSistema() {
    const info = await window.api.getSystemInfo();
    Model.setInfoSistema(info);
    View.atualizarInfoSistema(Model.getInfoSistema());
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
    if (jaAtivo) return;
    if (Model.getCarregando()) return;
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
    if (Model.getCarregando()) return;
    if (!Model.getConectado()) {
      View.mostrarPlaceholderComOffline();
      return;
    }
    e.stopPropagation();
    View.setChromeDownloadsPopoverOpen(false);
    void window.api.setContentEmbedTopInset(EMBED_CONTENT_TOP_PX);
    await window.api.abrirPontoRenovaNoNavegador();
  },

  /**
   * Handler: clique no botão Atende.
   * Se IP não configurado, exibe modal para configurar.
   */
  async onAtendeClick(e) {
    if (Model.getCarregando()) return;
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
    const isCollapsed = View.toggleSidebar();
    Model.setSidebarColapsada(isCollapsed);
    window.api.resizeSidebar(isCollapsed ? "collapsed" : "expanded");
  },

  /**
   * Handler: clique no badge de atualização pronta — abre modal de confirmação.
   */
  onUpdateClick() {
    View.mostrarModalUpdate(true);
  },

  /**
   * Handler: usuário confirmou a atualização no modal.
   */
  async onUpdateConfirm() {
    View.mostrarModalUpdate(false);
    await window.api.applyUpdateNow();
  },

  /**
   * Handler: usuário clicou "Depois" no modal de atualização.
   */
  onUpdateLater() {
    View.mostrarModalUpdate(false);
  },

  /**
   * Handler: clique no ícone de mais opções para abrir dropdown.
   */
  onDotClick(e) {
    e.stopPropagation();
    const menuId = e.currentTarget.dataset.menu;
    View.fecharDropdowns(menuId);
    View.toggleDropdown(menuId);
  },

  /**
   * Handler: clique em qualquer lugar do documento (fecha dropdowns).
   */
  onDocumentClick(e) {
    this.fecharChromeDownloadsPopover(e);
    View.fecharDropdowns();
  },

  fecharChromeDownloadsPopover(e) {
    const sidebarDl = document.getElementById(ELEMENT_IDS.SIDEBAR_DOWNLOADS_ENTRY);
    if (sidebarDl && e?.target && typeof e.target.closest === "function" && sidebarDl.contains(e.target)) {
      return;
    }
    const panel = document.getElementById(ELEMENT_IDS.CHROME_DOWNLOADS_PANEL);
    if (panel && e?.target && typeof e.target.closest === "function" && panel.contains(e.target)) {
      return;
    }
    View.setChromeDownloadsPopoverOpen(false);
    void window.api.markDownloadsPanelViewed();
    void this.atualizarBadgeDownloads();
    void this.sincronizarInsetEmbutido();
  },

  async onChromeDownloadsBtnClick(e) {
    e.stopPropagation();
    const panel = document.getElementById(ELEMENT_IDS.CHROME_DOWNLOADS_PANEL);
    const aberto = panel && !panel.classList.contains(CSS_CLASSES.HIDDEN);
    if (aberto) {
      View.setChromeDownloadsPopoverOpen(false);
      void window.api.markDownloadsPanelViewed();
      void this.atualizarBadgeDownloads();
      void this.sincronizarInsetEmbutido();
      return;
    }
    View.setChromeDownloadsPopoverOpen(true);
    await this.atualizarListaDownloadsPopover();
    View.setDownloadsToolbarBadge(0);
    void this.sincronizarInsetEmbutido();
  },

  async atualizarListaDownloadsPopover() {
    try {
      const snap = await window.api.getDownloadsPanelSnapshot();
      View.renderChromeDownloadsList(snap);
    } catch (_) {
      View.renderChromeDownloadsList([]);
    }
  },

  async atualizarBadgeDownloads() {
    try {
      const n = await window.api.getUnviewedDownloadsCount();
      View.setDownloadsToolbarBadge(typeof n === "number" ? n : 0);
    } catch (_) {
      View.setDownloadsToolbarBadge(0);
    }
  },

  async refrescarPopoverDownloadsSeAberto() {
    const panel = document.getElementById(ELEMENT_IDS.CHROME_DOWNLOADS_PANEL);
    if (!panel || panel.classList.contains(CSS_CLASSES.HIDDEN)) return;
    await this.atualizarListaDownloadsPopover();
    void this.sincronizarInsetEmbutido();
  },

  onChromeDownloadsListClick(e) {
    const folderBtn = e.target?.closest?.(".chrome-download-folder-btn");
    if (folderBtn?.dataset?.path) {
      void window.api.showDownloadInFolder(folderBtn.dataset.path);
      return;
    }
    const pdfRow = e.target?.closest?.(".chrome-download-row--pdf");
    const p = pdfRow?.dataset?.path;
    if (p) void window.api.openDownloadPdf(p);
  },

  /**
   * Handler: clique em "Reiniciar página".
   * Se for o botão do dropdown do Atende, recarrega a janela do Atende.
   */
  onReloadClick(e) {
    const target = e.target?.closest?.("[data-reload-target]")?.dataset?.reloadTarget;
    if (target === "atende") {
      window.api.reloadAtendeWindow();
      return;
    }
    if (target === "ponto-renova") {
      window.api.reloadPontoRenovaWindow();
      return;
    }

    if (Model.getCarregando()) return;

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
    if (Model.getCarregando()) return;
    const target = e?.target?.closest?.("[data-cache-target]")?.dataset?.cacheTarget;
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
    if (Model.getCarregando()) return;
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
    const checkbox = e?.target;
    const isDark = checkbox ? checkbox.checked : Model.getTemaEscuro();
    Model.setTemaEscuro(isDark);
    View.aplicarTema(isDark);
    window.api.setTheme(isDark ? "dark" : "light");
  },
};

export default Controller;
